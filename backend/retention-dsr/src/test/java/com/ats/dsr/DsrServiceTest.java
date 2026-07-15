package com.ats.dsr;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.consent.ConsentGate;
import com.ats.consent.InMemoryConsentStore;
import com.ats.consent.RecordingPermission;
import com.ats.consent.RecordingPermission.PermissionState;
import com.ats.contracts.AIProvider.Entailment;
import com.ats.contracts.EvidenceLedger;
import com.ats.export.InMemoryExportArtifactStore;
import com.ats.ingest.InMemoryObjectStore;
import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.EvidenceId;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.JsonValue;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import com.ats.ops.InMemoryEventSink;
import com.ats.orchestration.Citation;
import com.ats.orchestration.InMemoryCitationStore;
import com.ats.orchestration.InMemoryTranscriptStore;
import com.ats.orchestration.Transcript;
import com.ats.review.HumanReviewService;
import com.ats.review.InMemoryReviewCaseStore;
import com.ats.review.ReviewState;
import com.ats.screening.FindingSetRef;
import com.ats.screening.ScreeningEvidenceStore;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class DsrServiceTest {

    private static final TenantId TENANT = new TenantId("tenant-1");
    private static final InterviewId INTERVIEW = new InterviewId("interview-1");
    private static final ActorId OPERATOR = new ActorId("dpo-opaque-1");
    private static final Clock CLOCK = Clock.fixed(
            Instant.parse("2026-07-02T15:00:00Z"), ZoneOffset.UTC);

    private InMemoryConsentStore consentStore;
    private InMemoryEventSink sink;
    private InMemoryDsarStore dsarStore;
    private InMemoryErasureExecutionStore executionStore;
    private InMemoryObjectStore objectStore;
    private InMemoryTranscriptStore transcriptStore;
    private InMemoryCitationStore citationStore;
    private InMemoryExportArtifactStore artifactStore;
    private InMemoryReviewCaseStore reviewStore;
    private HumanReviewService humanReview;
    private FakeLedger ledger;
    private FakeScreeningStore screeningStore;
    private ErasureScope resolvedScope;
    private int resolveCalls;
    private DsrService service;

    private String objectKey;
    private String transcriptKey;
    private String citationKey;
    private String artifactKey;
    private String caseKey;
    private String dsarKey;
    private String screeningRef;

    @BeforeEach
    void setUp() {
        consentStore = new InMemoryConsentStore();
        sink = new InMemoryEventSink();
        dsarStore = new InMemoryDsarStore();
        executionStore = new InMemoryErasureExecutionStore();
        objectStore = new InMemoryObjectStore();
        transcriptStore = new InMemoryTranscriptStore();
        citationStore = new InMemoryCitationStore();
        artifactStore = new InMemoryExportArtifactStore();
        reviewStore = new InMemoryReviewCaseStore();
        ledger = new FakeLedger();
        screeningStore = new FakeScreeningStore();
        humanReview = new HumanReviewService(
                new ConsentGate(consentStore, sink), reviewStore, ledger, sink);

        consentStore.put(new RecordingPermission(
                TENANT, INTERVIEW, "subject-pointer", PermissionState.GRANTED,
                "2026-07-02T00:00:00Z"));
        objectKey = INTERVIEW.value() + "/rec-" + "a".repeat(64);
        objectStore.put(TENANT, objectKey, new byte[] {1, 2, 3}, "audio/wav");
        transcriptKey = transcriptStore.put(new Transcript(
                TENANT, INTERVIEW, objectKey, "tr",
                List.of(new Transcript.Segment(0, "S1", 0, 900, "delete-me"))))
                .asOptional().orElseThrow();
        citationKey = citationStore.put(new Citation(
                TENANT, INTERVIEW, transcriptKey, "delete-me",
                List.of(0), Entailment.SUPPORTED)).asOptional().orElseThrow();
        artifactKey = artifactStore.put(TENANT, INTERVIEW, "{\"packet\":\"delete-me\"}")
                .asOptional().orElseThrow();
        caseKey = humanReview.open(TENANT, INTERVIEW, List.of(citationKey), "aiout-v1")
                .asOptional().orElseThrow();
        screeningRef = "fsr_" + "1".repeat(64);
        resolvedScope = new ErasureScope(
                List.of(objectKey), List.of(transcriptKey), List.of(citationKey),
                List.of(artifactKey), List.of(caseKey), List.of(screeningRef),
                List.of("source-evidence-1", "source-evidence-2"));

        ErasureScopeResolver resolver = (tenantId, interviewId, key) -> {
            resolveCalls++;
            return Outcome.ok(resolvedScope);
        };
        service = new DsrService(
                dsarStore, resolver, executionStore, objectStore,
                transcriptStore, citationStore, artifactStore, reviewStore, humanReview,
                screeningStore, ledger, sink, CLOCK);
        dsarKey = service.receiveDsar(
                TENANT, INTERVIEW, "subject-pointer", "erasure_request")
                .asOptional().orElseThrow();
    }

    @Test
    void server_scope_cross_plane_happy_path_is_durable_and_replayable() {
        DsrService.ErasureReceipt first = service.executeErasure(
                TENANT, OPERATOR, INTERVIEW, dsarKey).asOptional().orElseThrow();

        assertEquals(3, first.tombstoneCount(), "2 WORM + 1 screening tombstone");
        assertEquals(5, first.deletedContentCount(), "object + screening + 3 content row");
        assertTrue(first.caseTransitioned());
        assertFalse(objectStore.contains(TENANT, objectKey));
        assertFalse(transcriptStore.find(TENANT, INTERVIEW, transcriptKey).isOk());
        assertFalse(citationStore.find(TENANT, INTERVIEW, citationKey).isOk());
        assertFalse(artifactStore.find(TENANT, INTERVIEW, artifactKey).isOk());
        assertEquals(ReviewState.WITHDRAWN,
                reviewStore.find(TENANT, INTERVIEW, caseKey).asOptional().orElseThrow().state());
        assertEquals(DsarRequest.State.FULFILLED,
                dsarStore.find(TENANT, INTERVIEW, dsarKey).asOptional().orElseThrow().state());
        assertEquals(1, resolveCalls);

        DsrService.ErasureReceipt replay = service.executeErasure(
                TENANT, new ActorId("other-operator"), INTERVIEW, dsarKey)
                .asOptional().orElseThrow();
        assertEquals(first, replay);
        assertEquals(1, resolveCalls, "durable execution varken scope yeniden çözülmez");
        assertEquals(2, ledger.tombstoneTargets.size(), "replay yeni WORM tombstone üretmez");
        assertEquals(1, screeningStore.purges.size(), "replay yeni screening purge üretmez");
    }

    @Test
    void tombstone_failure_keeps_content_and_retry_resumes_same_plan() {
        ledger.failTombstone = true;
        Outcome<DsrService.ErasureReceipt> failed = service.executeErasure(
                TENANT, OPERATOR, INTERVIEW, dsarKey);
        assertFalse(failed.isOk());
        assertTrue(objectStore.contains(TENANT, objectKey));
        assertTrue(transcriptStore.find(TENANT, INTERVIEW, transcriptKey).isOk());
        assertEquals(DsarRequest.State.RECEIVED,
                dsarStore.find(TENANT, INTERVIEW, dsarKey).asOptional().orElseThrow().state());

        ledger.failTombstone = false;
        assertTrue(service.executeErasure(TENANT, OPERATOR, INTERVIEW, dsarKey).isOk());
        assertEquals(1, resolveCalls, "retry first-writer durable planı kullanır");
        assertEquals(DsarRequest.State.FULFILLED,
                dsarStore.find(TENANT, INTERVIEW, dsarKey).asOptional().orElseThrow().state());
    }

    @Test
    void unknown_or_cross_tenant_dsar_has_no_side_effect() {
        assertFalse(service.executeErasure(
                new TenantId("other"), OPERATOR, INTERVIEW, dsarKey).isOk());
        assertFalse(service.executeErasure(
                TENANT, OPERATOR, INTERVIEW, "missing-dsar").isOk());
        assertTrue(objectStore.contains(TENANT, objectKey));
        assertEquals(0, resolveCalls);
    }

    @Test
    void empty_authoritative_scope_still_records_terminal_seal_receipt() {
        resolvedScope = new ErasureScope(
                List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of());

        DsrService.ErasureReceipt receipt = service.executeErasure(
                TENANT, OPERATOR, INTERVIEW, dsarKey).asOptional().orElseThrow();
        assertEquals(0, receipt.tombstoneCount());
        assertEquals(0, receipt.deletedContentCount());
        assertFalse(receipt.caseTransitioned());
        assertEquals(DsarRequest.State.FULFILLED,
                dsarStore.find(TENANT, INTERVIEW, dsarKey).asOptional().orElseThrow().state());
    }

    @Test
    void retention_uses_deterministic_execution_and_does_not_double_count_replay() {
        RetentionScanner scanner = (tenant, cutoff) -> Outcome.ok(List.of(
                new RetentionScanner.ExpiredContent(
                        INTERVIEW, List.of(objectKey), List.of(transcriptKey),
                        List.of(citationKey), List.of(artifactKey), List.of(screeningRef))));

        DsrService.PurgeReceipt first = service.purgeExpired(
                TENANT, new ActorId("retention-worker"), scanner,
                "2026-07-02T12:00:00Z").asOptional().orElseThrow();
        assertEquals(1, first.interviewCount());
        assertEquals(5, first.deletedContentCount());

        DsrService.PurgeReceipt replay = service.purgeExpired(
                TENANT, new ActorId("different-scheduler"), scanner,
                "2026-07-02T12:00:00Z").asOptional().orElseThrow();
        assertEquals(0, replay.interviewCount());
        assertEquals(0, replay.deletedContentCount());
    }

    @Test
    void retention_resumes_half_completed_running_execution_before_new_scan_without_double_count() {
        ErasureScope retentionScope = new ErasureScope(
                List.of(objectKey), List.of(transcriptKey), List.of(citationKey),
                List.of(artifactKey), List.of(), List.of(screeningRef), List.of());
        String executionKey = DsrService.retentionExecutionKey(INTERVIEW, retentionScope);
        assertFalse(executionKey.equals(DsrService.retentionExecutionKey(
                new InterviewId("other-interview"), retentionScope)),
                "aynı opak ref scope'u farklı interview'da durable PK çakışması üretmemeli");
        List<ErasureExecutionStore.PlannedStep> plan = List.of(
                new ErasureExecutionStore.PlannedStep(
                        0, ErasureExecutionStore.StepType.OBJECT_DELETE, objectKey),
                new ErasureExecutionStore.PlannedStep(
                        1, ErasureExecutionStore.StepType.SCREENING_PURGE, screeningRef),
                new ErasureExecutionStore.PlannedStep(
                        2, ErasureExecutionStore.StepType.TRANSCRIPT_DELETE, transcriptKey),
                new ErasureExecutionStore.PlannedStep(
                        3, ErasureExecutionStore.StepType.CITATION_DELETE, citationKey),
                new ErasureExecutionStore.PlannedStep(
                        4, ErasureExecutionStore.StepType.EXPORT_ARTIFACT_DELETE, artifactKey));
        ok(executionStore.begin(new ErasureExecutionStore.BeginCommand(
                TENANT, INTERVIEW, executionKey,
                ErasureExecutionStore.ExecutionKind.RETENTION_EXPIRED,
                retentionScope.digest(), "retention-original-worker", plan)));
        Instant now = CLOCK.instant();
        ok(executionStore.acquire(
                TENANT, INTERVIEW, executionKey, "crashed-worker", now, now.plusSeconds(30)));
        assertTrue(objectStore.delete(TENANT, objectKey).isOk(),
                "önceki worker'ın destructive side-effect'i commit olmuş varsayılır");
        ok(executionStore.completeStep(
                TENANT, INTERVIEW, executionKey, "crashed-worker", 0,
                new ErasureExecutionStore.StepEffect(0, 1, false),
                now.plusSeconds(1), now.plusSeconds(30)));
        ok(executionStore.release(
                TENANT, INTERVIEW, executionKey, "crashed-worker"));

        int[] scans = {0};
        RetentionScanner scanner = (tenant, cutoff) -> {
            scans[0]++;
            assertFalse(transcriptStore.find(TENANT, INTERVIEW, transcriptKey).isOk(),
                    "RUNNING execution yeni cutoff taramasından önce resume edilmelidir");
            assertFalse(citationStore.find(TENANT, INTERVIEW, citationKey).isOk());
            assertFalse(artifactStore.find(TENANT, INTERVIEW, artifactKey).isOk());
            return Outcome.ok(List.of(new RetentionScanner.ExpiredContent(
                    INTERVIEW, List.of(objectKey), List.of(transcriptKey),
                    List.of(citationKey), List.of(artifactKey), List.of(screeningRef))));
        };

        DsrService.PurgeReceipt receipt = service.purgeExpired(
                TENANT, new ActorId("retention-resumer"), scanner,
                "2026-07-02T12:00:00Z").asOptional().orElseThrow();
        assertEquals(1, scans[0]);
        assertEquals(1, receipt.interviewCount());
        assertEquals(5, receipt.deletedContentCount(),
                "önceden commit edilmiş step dahil mantıksal execution bir kez sayılır");
        assertEquals(ErasureExecutionStore.ExecutionState.FULFILLED,
                ok(executionStore.find(TENANT, INTERVIEW, executionKey)).state());
    }

    private static <T> T ok(Outcome<T> outcome) {
        if (outcome instanceof Outcome.Ok<T> ok) {
            return ok.value();
        }
        Outcome.Fail<T> fail = (Outcome.Fail<T>) outcome;
        throw new AssertionError(fail.code() + ": " + fail.reason());
    }

    static final class FakeLedger implements EvidenceLedger {
        final List<LedgerEntry> entries = new ArrayList<>();
        final Set<String> tombstoneTargets = new HashSet<>();
        boolean failTombstone;

        @Override
        public Outcome<LedgerEntry> append(EvidenceEvent event) {
            return Outcome.ok(entry(event.tenantId(), event.actorId(), event.interviewId(),
                    event.eventType(), event.payload(), "append-" + entries.size()));
        }

        @Override
        public Outcome<LedgerEntry> appendTombstoneEvent(
                TenantId tenant, ActorId actor, InterviewId interview,
                EvidenceId target, String reason) {
            if (failTombstone) {
                return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "ledger unavailable");
            }
            tombstoneTargets.add(target.value());
            return Outcome.ok(entry(tenant, actor, interview, "evidence.tombstoned",
                    JsonValue.object(Map.of(
                            "target_evidence_id", JsonValue.of(target.value()),
                            "reason_code", JsonValue.of(reason))),
                    "tomb-" + target.value()));
        }

        private LedgerEntry entry(
                TenantId tenant, ActorId actor, InterviewId interview,
                String eventType, JsonValue.JsonObject payload, String idempotency) {
            for (LedgerEntry prior : entries) {
                if (prior.idempotencyKey().equals(idempotency)) {
                    return prior;
                }
            }
            long sequence = entries.size() + 1L;
            LedgerEntry entry = new LedgerEntry(
                    tenant, actor, interview, eventType, CLOCK.instant().toString(), idempotency,
                    "hash", payload, new EvidenceId("ev-" + sequence), sequence,
                    "prev", "entry-" + sequence);
            entries.add(entry);
            return entry;
        }

        @Override
        public Outcome<LedgerEntry> getById(TenantId tenant, EvidenceId id) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "not found");
        }

        @Override
        public Outcome<List<LedgerEntry>> list(TenantId tenant, LedgerListFilter filter) {
            return Outcome.ok(List.copyOf(entries));
        }
    }

    static final class FakeScreeningStore implements ScreeningEvidenceStore {
        final List<PurgeCommand> purges = new ArrayList<>();

        @Override public Outcome<SaveReceipt> save(SaveCommand command) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "test");
        }
        @Override public Outcome<IdempotentSaveResult> saveIdempotent(
                SaveCommand command, RequestBinding binding) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "test");
        }
        @Override public Outcome<RequestReplay> findRequest(
                TenantId tenantId, InterviewId interviewId, RequestBinding expectedBinding) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "test");
        }
        @Override public Outcome<RequestReplay> getBoundEvidence(
                TenantId tenantId, InterviewId interviewId, FindingSetRef findingSetRef) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "test");
        }
        @Override public Outcome<StoredEvidence> get(
                TenantId tenantId, FindingSetRef findingSetRef) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "test");
        }
        @Override public Outcome<PurgeTargetState> inspectPurgeTarget(
                TenantId tenantId, InterviewId interviewId, FindingSetRef findingSetRef) {
            return Outcome.ok(PurgeTargetState.ACTIVE);
        }
        @Override public Outcome<PurgeReceipt> purge(PurgeCommand command) {
            boolean replay = purges.stream().anyMatch(p ->
                    p.tenantId().equals(command.tenantId())
                            && p.findingSetRef().equals(command.findingSetRef()));
            purges.add(command);
            return Outcome.ok(new PurgeReceipt(
                    command.findingSetRef(), new EvidenceId("screening-tomb"), replay));
        }
    }
}
