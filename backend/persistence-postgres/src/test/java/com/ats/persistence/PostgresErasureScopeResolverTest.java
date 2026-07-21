package com.ats.persistence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.contracts.AIProvider.Entailment;
import com.ats.contracts.EvidenceLedger.EvidenceEvent;
import com.ats.contracts.EvidenceLedger.LedgerEntry;
import com.ats.dsr.ErasureScope;
import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.JsonValue;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import com.ats.orchestration.Citation;
import com.ats.orchestration.Transcript;
import com.ats.review.ReviewCase;
import com.ats.review.ReviewState;
import com.ats.screening.Coverage;
import com.ats.screening.FindingSetRef;
import com.ats.screening.ScreeningEvidenceStore.SaveCommand;
import com.ats.screening.ScreeningPolicyRef;
import com.ats.screening.ScreeningResult;
import com.ats.screening.ScreeningRunId;
import com.ats.screening.ScreeningSourceKind;
import java.util.List;
import java.util.Map;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.postgresql.ds.PGSimpleDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/** Server-authoritative scope, tenant isolation and DB-enforced no-resurrection acceptance. */
@Testcontainers
class PostgresErasureScopeResolverTest {

    @Container
    private static final PostgreSQLContainer<?> PG =
            new PostgreSQLContainer<>("postgres:16-alpine");

    private static PGSimpleDataSource dataSource;

    @BeforeAll
    static void migrate() {
        dataSource = new PGSimpleDataSource();
        dataSource.setUrl(PG.getJdbcUrl());
        dataSource.setUser(PG.getUsername());
        dataSource.setPassword(PG.getPassword());
        Flyway.configure().dataSource(dataSource).load().migrate();
    }

    @Test
    void seal_resolves_all_server_planes_and_blocks_every_new_content_writer() {
        TenantId tenant = new TenantId("scope-tenant-a");
        TenantId otherTenant = new TenantId("scope-tenant-b");
        InterviewId interview = new InterviewId("scope-interview");
        ActorId actor = new ActorId("scope-actor");
        String objectKey = interview.value() + "/rec-" + "a".repeat(64);

        PostgresEvidenceLedger ledger = new PostgresEvidenceLedger(dataSource);
        LedgerEntry recording = ok(ledger.append(new EvidenceEvent(
                tenant, actor, interview, "recording.ingested", "2026-07-15T08:00:00Z",
                "scope-recording-1", "a".repeat(64),
                JsonValue.object(Map.of("object_key", JsonValue.of(objectKey))))));
        // Aynı interview kimliği başka tenant'ta scope'a karışmamalı.
        ok(ledger.append(new EvidenceEvent(
                otherTenant, actor, interview, "recording.ingested", "2026-07-15T08:00:00Z",
                "scope-recording-other", "b".repeat(64),
                JsonValue.object(Map.of("object_key", JsonValue.of(
                        interview.value() + "/rec-" + "b".repeat(64)))))));

        PostgresTranscriptStore transcripts = new PostgresTranscriptStore(dataSource);
        PostgresCitationStore citations = new PostgresCitationStore(dataSource);
        PostgresExportArtifactStore artifacts = new PostgresExportArtifactStore(dataSource);
        PostgresReviewCaseStore reviews = new PostgresReviewCaseStore(dataSource);
        String transcriptKey = ok(transcripts.put(new Transcript(
                tenant, interview, objectKey, "tr",
                List.of(new Transcript.Segment(0, "S1", 0, 1, "content")))));
        String citationKey = ok(citations.put(new Citation(
                tenant, interview, transcriptKey, "claim", List.of(0), Entailment.SUPPORTED)));
        String artifactKey = ok(artifacts.put(tenant, interview, "{\"pointer\":\"artifact\"}"));
        String caseKey = ok(reviews.put(new ReviewCase(
                tenant, interview, ReviewState.AI_SUGGESTED, List.of(citationKey), "ai-v1",
                null, null, null, null, null, null, null)));

        PostgresErasureScopeResolver resolver = new PostgresErasureScopeResolver(dataSource);
        ErasureScope scope = ok(resolver.resolveAndSealDsr(tenant, interview, "dsar-scope-1"));
        assertEquals(List.of(objectKey), scope.objectKeys());
        assertEquals(List.of(transcriptKey), scope.transcriptKeys());
        assertEquals(List.of(citationKey), scope.citationKeys());
        assertEquals(List.of(artifactKey), scope.exportArtifactKeys());
        assertEquals(List.of(caseKey), scope.reviewCaseKeys());
        assertEquals(List.of(recording.evidenceId().value()), scope.tombstoneTargetEvidenceIds());
        assertEquals(scope, ok(resolver.resolveAndSealDsr(
                tenant, interview, "dsar-scope-1")), "aynı DSAR seal replay olmalı");
        assertCode(OutcomeCode.CONFLICT,
                resolver.resolveAndSealDsr(tenant, interview, "different-dsar"));

        assertFalse(transcripts.put(new Transcript(
                tenant, interview, objectKey, "tr",
                List.of(new Transcript.Segment(0, "S1", 0, 1, "resurrection")))).isOk());
        assertFalse(citations.put(new Citation(
                tenant, interview, transcriptKey, "resurrection", List.of(0),
                Entailment.SUPPORTED)).isOk());
        assertFalse(artifacts.put(tenant, interview, "{\"resurrection\":true}").isOk());
        assertFalse(reviews.put(new ReviewCase(
                tenant, interview, ReviewState.AI_SUGGESTED, List.of(), "ai-v2",
                null, null, null, null, null, null, null)).isOk());
        assertFalse(ledger.append(new EvidenceEvent(
                tenant, actor, interview, "recording.ingested", "2026-07-15T09:00:00Z",
                "scope-recording-resurrection", "c".repeat(64),
                JsonValue.object(Map.of("object_key", JsonValue.of(
                        interview.value() + "/rec-" + "c".repeat(64)))))).isOk());
        assertFalse(ledger.append(new EvidenceEvent(
                tenant, actor, interview, "claim.citation.recorded", "2026-07-15T09:00:00Z",
                "scope-late-business-worm", "d".repeat(64),
                JsonValue.object(Map.of("citation_key", JsonValue.of("late-citation"))))).isOk(),
                "seal sonrası recording dışı business-WORM da tombstone scope'unu aşamamalı");
        assertTrue(ledger.appendTombstoneEvent(
                tenant, actor, interview, recording.evidenceId(), "DATA_SUBJECT_ERASURE").isOk(),
                "erasure worker'ın idempotent tombstone append'i seal sonrasında izinli kalmalı");
        assertThrows(SQLException.class, () -> {
            try (Connection connection = dataSource.getConnection();
                    PreparedStatement statement = connection.prepareStatement(
                            "INSERT INTO worm_ledger"
                                    + " (tenant_id,evidence_id,actor_ref,interview_id,event_type,occurred_at,"
                                    + " idempotency_key,content_hash,payload,prev_hash,entry_hash)"
                                    + " VALUES (?,?,?,?,'evidence.tombstoned',?,?,?,?::jsonb,?,?)")) {
                statement.setString(1, tenant.value());
                statement.setString(2, "malformed-tombstone-evidence");
                statement.setString(3, actor.value());
                statement.setString(4, interview.value());
                statement.setString(5, "2026-07-15T09:00:00Z");
                statement.setString(6, "malformed-tombstone-key");
                statement.setString(7, "e".repeat(64));
                statement.setString(8, "{\"reason_code\":\"bypass\"}");
                statement.setString(9, "prev");
                statement.setString(10, "entry");
                statement.executeUpdate();
            }
        }, "event_type etiketi tek başına seal/WORM gate bypass edememeli");

        assertThrows(SQLException.class, () -> {
            try (Connection connection = dataSource.getConnection();
                    PreparedStatement statement = connection.prepareStatement(
                            "UPDATE transcript SET segments='[]'::jsonb"
                                    + " WHERE tenant_id=? AND transcript_key=?")) {
                statement.setString(1, tenant.value());
                statement.setString(2, transcriptKey);
                statement.executeUpdate();
            }
        }, "seal sonrası mevcut content UPDATE ile diriltilememeli/değiştirilememeli");

        PostgresScreeningEvidenceStore screenings =
                new PostgresScreeningEvidenceStore(dataSource);
        assertFalse(screenings.save(new SaveCommand(
                tenant, actor, interview,
                new ScreeningResult(
                        new ScreeningRunId("psr_00000000-0000-4000-8000-000000000701"),
                        new ScreeningPolicyRef("paspolicy_v1"), Coverage.SUPPORTED, List.of(),
                        new FindingSetRef("fsr_" + "7".repeat(64))),
                ScreeningSourceKind.TRANSCRIPT_SEGMENT,
                "2026-07-15T09:00:00Z")).isOk());

        ReviewCase prior = ok(reviews.find(tenant, interview, caseKey));
        assertFalse(reviews.save(tenant, caseKey, prior.with(ReviewState.FINALIZED)).isOk(),
                "seal sonrası EXPORTED/finalize yarışı DB'de reddedilmeli");
        assertTrue(reviews.save(
                tenant, caseKey, prior.with(ReviewState.WITHDRAWN).withReason("DSR")).isOk(),
                "erasure worker WITHDRAWN geçişi yapabilmeli");

        // Tenant B aynı interview id'sinde yazmaya devam edebilir; gate tenant-scoped'tur.
        assertTrue(artifacts.put(
                otherTenant, interview, "{\"tenant\":\"b\"}").isOk());
    }

    @Test
    void concurrent_writer_commits_before_seal_and_is_included_in_authoritative_scope()
            throws Exception {
        TenantId tenant = new TenantId("scope-race-tenant");
        InterviewId interview = new InterviewId("scope-race-interview");
        CountDownLatch insertHoldingShareLock = new CountDownLatch(1);
        CountDownLatch allowCommit = new CountDownLatch(1);
        var pool = Executors.newFixedThreadPool(2);
        try {
            Future<?> writer = pool.submit(() -> {
                try (Connection connection = dataSource.getConnection()) {
                    connection.setAutoCommit(false);
                    try (PreparedStatement statement = connection.prepareStatement(
                            "INSERT INTO transcript"
                                    + " (tenant_id,transcript_key,interview_id,source_object_key,language,segments)"
                                    + " VALUES (?,?,?,?,?,'[]'::jsonb)")) {
                        statement.setString(1, tenant.value());
                        statement.setString(2, "race-transcript");
                        statement.setString(3, interview.value());
                        statement.setString(4, interview.value() + "/rec-" + "d".repeat(64));
                        statement.setString(5, "tr");
                        statement.executeUpdate();
                        insertHoldingShareLock.countDown();
                        if (!allowCommit.await(5, TimeUnit.SECONDS)) {
                            throw new AssertionError("test commit izni zaman aşımı");
                        }
                        connection.commit();
                    }
                } catch (Exception ex) {
                    throw new RuntimeException(ex);
                }
            });
            assertTrue(insertHoldingShareLock.await(5, TimeUnit.SECONDS));

            Future<Outcome<ErasureScope>> sealing = pool.submit(() ->
                    new PostgresErasureScopeResolver(dataSource)
                            .resolveAndSealDsr(tenant, interview, "race-dsar"));
            Thread.sleep(200);
            assertFalse(sealing.isDone(),
                    "seal, writer'ın gate SHARE lock'u commit olmadan scope okumamalı");
            allowCommit.countDown();

            writer.get(5, TimeUnit.SECONDS);
            ErasureScope scope = ok(sealing.get(5, TimeUnit.SECONDS));
            assertEquals(List.of("race-transcript"), scope.transcriptKeys());
            assertFalse(new PostgresTranscriptStore(dataSource).put(new Transcript(
                    tenant, interview, interview.value() + "/rec-" + "e".repeat(64), "tr",
                    List.of(new Transcript.Segment(0, "S1", 0, 1, "late")))).isOk());
        } finally {
            allowCommit.countDown();
            pool.shutdownNow();
        }
    }

    @Test
    void app_role_can_only_use_narrow_seal_function_and_cannot_mutate_gate_directly()
            throws Exception {
        String unprivileged = "erasure_unprivileged_test";
        try (Connection admin = dataSource.getConnection();
                Statement statement = admin.createStatement()) {
            statement.execute("DROP ROLE IF EXISTS " + unprivileged);
            statement.execute("CREATE ROLE " + unprivileged + " NOLOGIN");
            try (PreparedStatement privileges = admin.prepareStatement(
                    "SELECT has_table_privilege('ats_app','interview_content_gate','UPDATE'),"
                            + " has_function_privilege('ats_app',"
                            + " 'ats_seal_interview_for_erasure(text,text,text)','EXECUTE'),"
                            + " has_function_privilege(?,"
                            + " 'ats_seal_interview_for_erasure(text,text,text)','EXECUTE')")) {
                privileges.setString(1, unprivileged);
                try (ResultSet result = privileges.executeQuery()) {
                    assertTrue(result.next());
                    assertFalse(result.getBoolean(1), "ats_app gate tablosunu UPDATE edememeli");
                    assertTrue(result.getBoolean(2), "ats_app yalnız dar seal fonksiyonunu çağırabilmeli");
                    assertFalse(result.getBoolean(3), "PUBLIC/unprivileged fonksiyon execute alamamalı");
                }
            }
        }

        try (Connection app = dataSource.getConnection(); Statement statement = app.createStatement()) {
            statement.execute("SET ROLE ats_app");
            statement.execute("SELECT ats_seal_interview_for_erasure("
                    + "'least-priv-tenant','least-priv-interview','least-priv-dsar')");
            assertThrows(SQLException.class, () -> statement.executeUpdate(
                    "UPDATE interview_content_gate SET sealed_dsar_key='bypass'"
                            + " WHERE tenant_id='least-priv-tenant'"
                            + " AND interview_id='least-priv-interview'"));
        } finally {
            try (Connection admin = dataSource.getConnection();
                    Statement statement = admin.createStatement()) {
                statement.execute("DROP ROLE IF EXISTS " + unprivileged);
            }
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
