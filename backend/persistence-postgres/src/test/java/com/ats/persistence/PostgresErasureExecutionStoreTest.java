package com.ats.persistence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.consent.ConsentGate;
import com.ats.consent.ConsentStore;
import com.ats.consent.RecordingPermission;
import com.ats.dsr.DsarRequest;
import com.ats.dsr.DsrService;
import com.ats.dsr.ErasureExecutionStore;
import com.ats.dsr.ErasureExecutionStore.BeginCommand;
import com.ats.dsr.ErasureExecutionStore.Execution;
import com.ats.dsr.ErasureExecutionStore.ExecutionKind;
import com.ats.dsr.ErasureExecutionStore.ExecutionState;
import com.ats.dsr.ErasureExecutionStore.PlannedStep;
import com.ats.dsr.ErasureExecutionStore.StepEffect;
import com.ats.dsr.ErasureExecutionStore.StepType;
import com.ats.ingest.ObjectStorePort;
import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import com.ats.ops.OperationalEventSink;
import com.ats.orchestration.Transcript;
import com.ats.review.HumanReviewService;
import com.ats.review.ReviewCase;
import com.ats.review.ReviewState;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.postgresql.ds.PGSimpleDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/** ATS #169 lease/CAS/recovery kabulü; gerçek PostgreSQL ve V7 migration üzerinde. */
@Testcontainers
class PostgresErasureExecutionStoreTest {

    @Container
    private static final PostgreSQLContainer<?> PG =
            new PostgreSQLContainer<>("postgres:16-alpine");

    private static PostgresErasureExecutionStore store;
    private static PGSimpleDataSource dataSource;

    @BeforeAll
    static void migrate() {
        dataSource = new PGSimpleDataSource();
        dataSource.setUrl(PG.getJdbcUrl());
        dataSource.setUser(PG.getUsername());
        dataSource.setPassword(PG.getPassword());
        Flyway.configure().dataSource(dataSource).load().migrate();
        store = new PostgresErasureExecutionStore(dataSource);
    }

    @Test
    void stale_worker_cannot_commit_and_expired_lease_resumes_to_terminal_receipt() {
        TenantId tenant = new TenantId("saga-tenant");
        InterviewId interview = new InterviewId("saga-interview");
        String key = "dsar-saga-1";
        String digest = "a".repeat(64);
        BeginCommand command = new BeginCommand(
                tenant, interview, key, ExecutionKind.DATA_SUBJECT_ERASURE,
                digest, "dpo-first-writer",
                List.of(
                        new PlannedStep(0, StepType.INTERVIEW_SEAL, "sealed"),
                        new PlannedStep(1, StepType.TRANSCRIPT_DELETE, "tr-opaque")));

        Execution begun = ok(store.begin(command));
        assertEquals(ExecutionState.RUNNING, begun.state());
        assertEquals(begun, ok(store.begin(command)), "aynı first-writer plan replay olmalı");
        assertCode(OutcomeCode.CONFLICT, store.begin(new BeginCommand(
                tenant, interview, key, ExecutionKind.DATA_SUBJECT_ERASURE,
                "b".repeat(64), "dpo-first-writer", command.steps())));

        Instant t0 = Instant.parse("2026-07-15T10:00:00Z");
        ok(store.acquire(tenant, interview, key, "worker-a", t0, t0.plusSeconds(10)));
        assertCode(OutcomeCode.CONFLICT,
                store.acquire(tenant, interview, key, "worker-b", t0.plusSeconds(1), t0.plusSeconds(20)));
        ok(store.completeStep(
                tenant, interview, key, "worker-a", 0, StepEffect.none(),
                t0.plusSeconds(2), t0.plusSeconds(12)));

        assertCode(OutcomeCode.CONFLICT, store.completeStep(
                tenant, interview, key, "worker-a", 1,
                new StepEffect(0, 1, false),
                t0.plusSeconds(13), t0.plusSeconds(30)));

        Execution resumed = ok(store.acquire(
                tenant, interview, key, "worker-b",
                t0.plusSeconds(13), t0.plusSeconds(30)));
        assertEquals("worker-b", resumed.leaseOwner());
        Execution allDone = ok(store.completeStep(
                tenant, interview, key, "worker-b", 1,
                new StepEffect(0, 1, false),
                t0.plusSeconds(14), t0.plusSeconds(30)));
        assertTrue(allDone.allStepsCompleted());
        Execution fulfilled = ok(store.fulfill(
                tenant, interview, key, "worker-b", t0.plusSeconds(15)));
        assertEquals(ExecutionState.FULFILLED, fulfilled.state());
        assertEquals(1, fulfilled.deletedContentCount());
        assertTrue(ok(store.listRunning(tenant, ExecutionKind.DATA_SUBJECT_ERASURE)).isEmpty());
    }

    @Test
    void tenant_and_interview_scope_are_part_of_durable_identity() {
        TenantId tenant = new TenantId("saga-isolation-a");
        InterviewId interview = new InterviewId("interview-a");
        BeginCommand command = new BeginCommand(
                tenant, interview, "execution-a", ExecutionKind.RETENTION_EXPIRED,
                "c".repeat(64), "scheduler-a",
                List.of(new PlannedStep(0, StepType.OBJECT_DELETE, "object-ref")));
        ok(store.begin(command));

        assertFalse(store.find(
                new TenantId("saga-isolation-b"), interview, "execution-a").isOk());
        assertFalse(store.find(
                tenant, new InterviewId("interview-b"), "execution-a").isOk());
        assertTrue(store.find(tenant, interview, "execution-a").isOk());
    }

    @Test
    void database_guards_reject_first_writer_and_terminal_receipt_mutation() throws Exception {
        TenantId tenant = new TenantId("saga-guard-tenant");
        InterviewId interview = new InterviewId("saga-guard-interview");
        String key = "saga-guard-execution";
        ok(store.begin(new BeginCommand(
                tenant, interview, key, ExecutionKind.DATA_SUBJECT_ERASURE,
                "d".repeat(64), "guard-actor",
                List.of(new PlannedStep(0, StepType.INTERVIEW_SEAL, "sealed")))));

        assertSqlRejected("UPDATE erasure_execution SET actor_ref='changed'"
                + " WHERE tenant_id='saga-guard-tenant' AND execution_key='saga-guard-execution'");
        assertSqlRejected("UPDATE erasure_execution_step SET target_ref='changed'"
                + " WHERE tenant_id='saga-guard-tenant' AND execution_key='saga-guard-execution'"
                + " AND step_sequence=0");

        Instant now = Instant.parse("2026-07-15T10:30:00Z");
        ok(store.acquire(tenant, interview, key, "guard-worker", now, now.plusSeconds(20)));
        ok(store.completeStep(tenant, interview, key, "guard-worker", 0, StepEffect.none(),
                now.plusSeconds(1), now.plusSeconds(20)));
        ok(store.fulfill(tenant, interview, key, "guard-worker", now.plusSeconds(2)));

        assertSqlRejected("UPDATE erasure_execution SET updated_at=updated_at + interval '1 second'"
                + " WHERE tenant_id='saga-guard-tenant' AND execution_key='saga-guard-execution'");
        assertSqlRejected("UPDATE erasure_execution_step SET case_transitioned=true"
                + " WHERE tenant_id='saga-guard-tenant' AND execution_key='saga-guard-execution'"
                + " AND step_sequence=0");
        assertSqlRejected("DELETE FROM erasure_execution_step"
                + " WHERE tenant_id='saga-guard-tenant' AND execution_key='saga-guard-execution'"
                + " AND step_sequence=0");
        assertSqlRejected("DELETE FROM erasure_execution"
                + " WHERE tenant_id='saga-guard-tenant' AND execution_key='saga-guard-execution'");
        assertSqlRejected("TRUNCATE erasure_execution_step, erasure_execution");
    }

    @Test
    void real_postgres_delete_replays_after_side_effect_but_before_step_commit_crash() {
        TenantId tenant = new TenantId("saga-crash-tenant");
        InterviewId interview = new InterviewId("saga-crash-interview");
        ActorId actor = new ActorId("dpo-crash-operator");
        PostgresTranscriptStore transcripts = new PostgresTranscriptStore(dataSource);
        String transcriptKey = ok(transcripts.put(new Transcript(
                tenant, interview, interview.value() + "/rec-" + "f".repeat(64), "tr",
                List.of(new Transcript.Segment(0, "S1", 0, 1, "erase-me")))));
        PostgresDsarStore dsars = new PostgresDsarStore(dataSource);
        String dsarKey = ok(dsars.put(new DsarRequest(
                tenant, interview, "subject-opaque", "DATA_SUBJECT_ERASURE",
                DsarRequest.State.RECEIVED)));

        AtomicBoolean injectCommitLoss = new AtomicBoolean(true);
        ErasureExecutionStore failingStore = new CompleteStepFailureStore(store, 1, injectCommitLoss);
        DsrService first = service(dsars, transcripts, failingStore);
        assertFalse(first.executeErasure(tenant, actor, interview, dsarKey).isOk(),
                "transcript side-effect sonrası step commit kaybı ilk çağrıyı fail etmelidir");
        assertFalse(transcripts.find(tenant, interview, transcriptKey).isOk(),
                "gerçek PG transcript side-effect'i commit olmuş olmalı");
        Execution pending = ok(store.find(tenant, interview, dsarKey));
        assertFalse(pending.allStepsCompleted(),
                "destructive side-effect commit olsa da durable step PENDING kalmalı");

        DsrService resumed = service(dsars, transcripts, store);
        DsrService.ErasureReceipt receipt = ok(
                resumed.executeErasure(tenant, actor, interview, dsarKey));
        assertEquals(1, receipt.deletedContentCount(),
                "idempotent fiziksel replay tek mantıksal delete makbuzu üretmeli");
        assertEquals(ExecutionState.FULFILLED,
                ok(store.find(tenant, interview, dsarKey)).state());
        assertEquals(DsarRequest.State.FULFILLED,
                ok(dsars.find(tenant, interview, dsarKey)).state());
    }

    @Test
    void dsr_service_withdraws_real_postgres_review_through_sealed_database_gate() {
        TenantId tenant = new TenantId("saga-review-tenant");
        InterviewId interview = new InterviewId("saga-review-interview");
        ActorId actor = new ActorId("dpo-review-operator");
        PostgresReviewCaseStore reviews = new PostgresReviewCaseStore(dataSource);
        String caseKey = ok(reviews.put(new ReviewCase(
                tenant, interview, ReviewState.AI_SUGGESTED,
                List.of("source-evidence-opaque"), "ai-version-opaque",
                null, null, null, null, null, null, null)));
        PostgresDsarStore dsars = new PostgresDsarStore(dataSource);
        String dsarKey = ok(dsars.put(new DsarRequest(
                tenant, interview, "subject-opaque", "DATA_SUBJECT_ERASURE",
                DsarRequest.State.RECEIVED)));

        DsrService.ErasureReceipt receipt = ok(service(
                dsars, new PostgresTranscriptStore(dataSource), store)
                .executeErasure(tenant, actor, interview, dsarKey));

        assertTrue(receipt.caseTransitioned(),
                "durable REVIEW_WITHDRAW adımı makbuza yansımalı");
        ReviewCase withdrawn = ok(reviews.find(tenant, interview, caseKey));
        assertEquals(ReviewState.WITHDRAWN, withdrawn.state());
        assertEquals("DATA_SUBJECT_ERASURE", withdrawn.reasonCode());
        assertEquals(ExecutionState.FULFILLED,
                ok(store.find(tenant, interview, dsarKey)).state());
    }

    private static DsrService service(
            PostgresDsarStore dsars, PostgresTranscriptStore transcripts,
            ErasureExecutionStore executionStore) {
        OperationalEventSink sink = event -> Outcome.ok(null);
        ConsentStore consentStore = new ConsentStore() {
            @Override
            public Outcome<Void> put(RecordingPermission permission) {
                return Outcome.ok(null);
            }

            @Override
            public Outcome<RecordingPermission> find(TenantId tenantId, InterviewId interviewId) {
                return Outcome.fail(OutcomeCode.NOT_FOUND, "testte consent kullanılmıyor");
            }
        };
        PostgresReviewCaseStore reviews = new PostgresReviewCaseStore(dataSource);
        PostgresEvidenceLedger ledger = new PostgresEvidenceLedger(dataSource);
        return new DsrService(
                dsars,
                new PostgresErasureScopeResolver(dataSource),
                executionStore,
                new NoopObjectStore(),
                transcripts,
                new PostgresCitationStore(dataSource),
                new PostgresExportArtifactStore(dataSource),
                reviews,
                new HumanReviewService(new ConsentGate(consentStore, sink), reviews, ledger, sink),
                new PostgresScreeningEvidenceStore(dataSource),
                ledger,
                sink,
                Clock.fixed(Instant.parse("2026-07-15T11:00:00Z"), ZoneOffset.UTC));
    }

    private static void assertSqlRejected(String sql) {
        assertThrows(SQLException.class, () -> {
            try (Connection connection = dataSource.getConnection();
                    Statement statement = connection.createStatement()) {
                statement.executeUpdate(sql);
            }
        });
    }

    private record CompleteStepFailureStore(
            ErasureExecutionStore delegate, int failedSequence, AtomicBoolean armed)
            implements ErasureExecutionStore {

        @Override
        public Outcome<Execution> find(
                TenantId tenantId, InterviewId interviewId, String executionKey) {
            return delegate.find(tenantId, interviewId, executionKey);
        }

        @Override
        public Outcome<Execution> begin(BeginCommand command) {
            return delegate.begin(command);
        }

        @Override
        public Outcome<Execution> acquire(
                TenantId tenantId, InterviewId interviewId, String executionKey,
                String leaseOwner, Instant now, Instant leaseUntil) {
            return delegate.acquire(
                    tenantId, interviewId, executionKey, leaseOwner, now, leaseUntil);
        }

        @Override
        public Outcome<Execution> completeStep(
                TenantId tenantId, InterviewId interviewId, String executionKey,
                String leaseOwner, int sequence, StepEffect effect, Instant now,
                Instant leaseUntil) {
            if (sequence == failedSequence && armed.compareAndSet(true, false)) {
                return Outcome.fail(OutcomeCode.NOT_CONFIGURED,
                        "injected step commit loss after side-effect");
            }
            return delegate.completeStep(tenantId, interviewId, executionKey,
                    leaseOwner, sequence, effect, now, leaseUntil);
        }

        @Override
        public Outcome<Execution> fulfill(
                TenantId tenantId, InterviewId interviewId, String executionKey,
                String leaseOwner, Instant now) {
            return delegate.fulfill(tenantId, interviewId, executionKey, leaseOwner, now);
        }

        @Override
        public Outcome<Void> release(
                TenantId tenantId, InterviewId interviewId, String executionKey,
                String leaseOwner) {
            return delegate.release(tenantId, interviewId, executionKey, leaseOwner);
        }

        @Override
        public Outcome<List<Execution>> listRunning(TenantId tenantId, ExecutionKind kind) {
            return delegate.listRunning(tenantId, kind);
        }
    }

    private static final class NoopObjectStore implements ObjectStorePort {
        @Override
        public Outcome<StoredObjectRef> put(
                TenantId tenantId, String key, byte[] bytes, String contentType) {
            return Outcome.ok(new StoredObjectRef(key, bytes.length));
        }

        @Override
        public Outcome<StoredObject> read(TenantId tenantId, String key) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "test object yok");
        }

        @Override
        public Outcome<Void> delete(TenantId tenantId, String key) {
            return Outcome.ok(null);
        }
    }

    private static <T> T ok(Outcome<T> outcome) {
        if (outcome instanceof Outcome.Ok<T> ok) {
            return ok.value();
        }
        Outcome.Fail<T> fail = (Outcome.Fail<T>) outcome;
        throw new AssertionError(fail.code() + ": " + fail.reason());
    }

    private static void assertCode(OutcomeCode expected, Outcome<?> outcome) {
        assertFalse(outcome.isOk());
        assertEquals(expected, ((Outcome.Fail<?>) outcome).code());
    }
}
