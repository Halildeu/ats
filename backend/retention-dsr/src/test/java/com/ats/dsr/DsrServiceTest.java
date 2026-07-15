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
import com.ats.dsr.DsrService.ErasureReceipt;
import com.ats.export.InMemoryExportArtifactStore;
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
import java.util.List;
import java.util.Map;
import java.util.HashSet;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class DsrServiceTest {

    private static final TenantId T1 = new TenantId("t1");
    private static final TenantId T2 = new TenantId("t2");
    private static final ActorId OPERATOR = new ActorId("dpo-opaque-1");
    private static final InterviewId I1 = new InterviewId("i1");

    private InMemoryConsentStore consentStore;
    private InMemoryEventSink sink;
    private InMemoryDsarStore dsarStore;
    private InMemoryTranscriptStore transcriptStore;
    private InMemoryCitationStore citationStore;
    private InMemoryExportArtifactStore artifactStore;
    private InMemoryReviewCaseStore reviewStore;
    private HumanReviewService humanReview;
    private FakeLedger ledger;
    private NoopScreeningStore screeningStore;
    private DsrService service;

    private String transcriptKey;
    private String citationKey;
    private String artifactKey;
    private String caseKey;
    private String dsarKey;

    static final class FakeLedger implements EvidenceLedger {
        final List<LedgerEntry> entries = new ArrayList<>();
        boolean failTombstone = false;

        @Override
        public Outcome<LedgerEntry> append(EvidenceEvent e) {
            long seq = entries.size() + 1;
            LedgerEntry entry = new LedgerEntry(e.tenantId(), e.actorId(), e.interviewId(), e.eventType(),
                    e.occurredAt(), e.idempotencyKey(), e.contentHash(), e.payload(),
                    new EvidenceId("fake-ev-" + seq), seq, "fake-prev", "fake-hash-" + seq);
            entries.add(entry);
            return Outcome.ok(entry);
        }

        @Override
        public Outcome<LedgerEntry> appendTombstoneEvent(TenantId t, ActorId a, InterviewId i, EvidenceId target, String reason) {
            if (failTombstone) {
                return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "ledger unavailable (test)");
            }
            long seq = entries.size() + 1;
            LedgerEntry entry = new LedgerEntry(t, a, i, "evidence.tombstoned",
                    "2026-07-02T15:00:00Z", "tomb:" + target.value() + ":" + seq, "hash",
                    JsonValue.object(Map.of("target_evidence_id", JsonValue.of(target.value()),
                            "reason_code", JsonValue.of(reason))),
                    new EvidenceId("fake-tomb-" + seq), seq, "fake-prev", "fake-hash-" + seq);
            entries.add(entry);
            return Outcome.ok(entry);
        }

        @Override
        public Outcome<LedgerEntry> getById(TenantId t, EvidenceId id) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "yok");
        }

        @Override
        public Outcome<List<LedgerEntry>> list(TenantId t, LedgerListFilter f) {
            return Outcome.ok(List.copyOf(entries));
        }
    }

    static final class NoopScreeningStore implements ScreeningEvidenceStore {
        final List<PurgeCommand> purges = new ArrayList<>();
        final Set<String> missingRefs = new HashSet<>();

        @Override public Outcome<SaveReceipt> save(SaveCommand command) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "test-no-screening");
        }
        @Override public Outcome<IdempotentSaveResult> saveIdempotent(
                SaveCommand command, RequestBinding binding) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "test-no-screening");
        }
        @Override public Outcome<RequestReplay> findRequest(
                TenantId tenantId, InterviewId interviewId, RequestBinding expectedBinding) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "test-no-screening");
        }
        @Override public Outcome<RequestReplay> getBoundEvidence(
                TenantId tenantId, InterviewId interviewId, FindingSetRef findingSetRef) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "test-no-screening");
        }
        @Override public Outcome<StoredEvidence> get(TenantId tenantId, FindingSetRef findingSetRef) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "test-no-screening");
        }
        @Override public Outcome<PurgeTargetState> inspectPurgeTarget(
                TenantId tenantId, InterviewId interviewId, FindingSetRef findingSetRef) {
            return missingRefs.contains(findingSetRef.value())
                    ? Outcome.fail(OutcomeCode.NOT_FOUND, "test-missing-screening")
                    : Outcome.ok(PurgeTargetState.ACTIVE);
        }
        @Override public Outcome<PurgeReceipt> purge(PurgeCommand command) {
            purges.add(command);
            return Outcome.ok(new PurgeReceipt(
                    command.findingSetRef(), new EvidenceId("fake-screening-tombstone-1"), false));
        }
    }

    @BeforeEach
    void setUp() {
        consentStore = new InMemoryConsentStore();
        sink = new InMemoryEventSink();
        dsarStore = new InMemoryDsarStore();
        transcriptStore = new InMemoryTranscriptStore();
        citationStore = new InMemoryCitationStore();
        artifactStore = new InMemoryExportArtifactStore();
        reviewStore = new InMemoryReviewCaseStore();
        ledger = new FakeLedger();
        screeningStore = new NoopScreeningStore();
        humanReview = new HumanReviewService(new ConsentGate(consentStore, sink), reviewStore, ledger, sink);
        service = new DsrService(dsarStore, transcriptStore, citationStore, artifactStore,
                reviewStore, humanReview, screeningStore, ledger, sink,
                Clock.fixed(Instant.parse("2026-07-02T15:00:00Z"), ZoneOffset.UTC));
        consentStore.put(new RecordingPermission(T1, I1, "subj-opaque", PermissionState.GRANTED, "2026-07-02T00:00:00Z"));

        transcriptKey = transcriptStore.put(new Transcript(T1, I1, "i1/rec-" + "a".repeat(64), "tr",
                List.of(new Transcript.Segment(0, "S1", 0, 900, "silinecek icerik")))).asOptional().orElseThrow();
        citationKey = citationStore.put(new Citation(T1, I1, transcriptKey, "silinecek iddia",
                List.of(0), Entailment.SUPPORTED)).asOptional().orElseThrow();
        artifactKey = artifactStore.put(T1, I1, "{\"packet\":\"silinecek\"}").asOptional().orElseThrow();
        caseKey = humanReview.open(T1, I1, List.of(citationKey), "aiout-v1").asOptional().orElseThrow();
        dsarKey = service.receiveDsar(T1, I1, "subj-opaque", "erasure_request").asOptional().orElseThrow();
    }

    private ErasureScope fullScope() {
        return new ErasureScope(
                List.of(transcriptKey), List.of(citationKey), List.of(artifactKey), List.of(caseKey),
                List.of(),
                List.of("fake-ev-cit-1", "fake-ev-case-1"));
    }

    @Test
    void receive_dsar_records_and_emits_event() {
        assertTrue(sink.emitted().stream().anyMatch(e ->
                e.eventTypeId().equals(DsrService.DSAR_RECEIVED_EVENT)
                        && "erasure_request".equals(e.extras().get("reason_code"))));
        assertEquals(DsarRequest.State.RECEIVED,
                dsarStore.find(T1, I1, dsarKey).asOptional().orElseThrow().state());
        assertFalse(service.receiveDsar(T1, I1, " ", "x").isOk(), "blank subject_ref reddedilmeli");
        assertFalse(service.receiveDsar(T1, I1, "s", " ").isOk(), "blank reason_code reddedilmeli");
    }

    @Test
    void erasure_happy_path_tombstones_then_deletes_then_fulfills() {
        ErasureReceipt receipt = service.executeErasure(T1, OPERATOR, I1, dsarKey, fullScope())
                .asOptional().orElseThrow();
        assertEquals(2, receipt.tombstoneCount());
        assertEquals(3, receipt.deletedContentCount());
        assertTrue(receipt.caseTransitioned());
        // content-plane gerçekten silindi
        assertFalse(transcriptStore.find(T1, I1, transcriptKey).isOk());
        assertFalse(citationStore.find(T1, I1, citationKey).isOk());
        assertFalse(artifactStore.find(T1, I1, artifactKey).isOk());
        // vaka WITHDRAWN; dsar FULFILLED
        assertEquals(ReviewState.WITHDRAWN, reviewStore.find(T1, I1, caseKey).asOptional().orElseThrow().state());
        assertEquals(DsarRequest.State.FULFILLED, dsarStore.find(T1, I1, dsarKey).asOptional().orElseThrow().state());
        // WORM tombstone'ları append edildi (silme değil)
        assertEquals(2, ledger.entries.size());
        for (String eventType : new String[] {DsrService.ERASURE_EXECUTED_EVENT,
                DsrService.DSAR_FULFILLED_EVENT, DsrService.TOMBSTONE_APPENDED_EVENT}) {
            assertTrue(sink.emitted().stream().anyMatch(e -> e.eventTypeId().equals(eventType)),
                    "beklenen op-event eksik: " + eventType);
        }
    }

    @Test
    void erasure_purges_screening_restricted_plane_and_counts_its_tombstone() {
        String findingSetRef = "fsr_" + "1".repeat(64);
        ErasureScope screeningOnly = new ErasureScope(
                List.of(), List.of(), List.of(), List.of(), List.of(findingSetRef), List.of());

        ErasureReceipt receipt = service.executeErasure(
                T1, OPERATOR, I1, dsarKey, screeningOnly).asOptional().orElseThrow();

        assertEquals(1, receipt.tombstoneCount());
        assertEquals(1, receipt.deletedContentCount());
        assertFalse(receipt.caseTransitioned());
        assertEquals(1, screeningStore.purges.size());
        ScreeningEvidenceStore.PurgeCommand purge = screeningStore.purges.getFirst();
        assertEquals(T1, purge.tenantId());
        assertEquals(I1, purge.interviewId());
        assertEquals(findingSetRef, purge.findingSetRef().value());
        assertEquals(ScreeningEvidenceStore.PurgeReason.DATA_SUBJECT_ERASURE, purge.reason());
        assertEquals(DsarRequest.State.FULFILLED,
                dsarStore.find(T1, I1, dsarKey).asOptional().orElseThrow().state());
    }

    @Test
    void malformed_screening_ref_is_rejected_before_any_partial_purge() {
        ErasureScope mixed = new ErasureScope(
                List.of(), List.of(), List.of(), List.of(),
                List.of("fsr_" + "2".repeat(64), "not-a-finding-ref"), List.of());

        Outcome<ErasureReceipt> out = service.executeErasure(
                T1, OPERATOR, I1, dsarKey, mixed);

        assertFalse(out.isOk());
        assertEquals(OutcomeCode.INVALID, ((Outcome.Fail<ErasureReceipt>) out).code());
        assertTrue(screeningStore.purges.isEmpty(),
                "tüm ref'ler prevalidate edilmeden ilk geçerli ref bile purge edilmemeli");
        assertEquals(DsarRequest.State.RECEIVED,
                dsarStore.find(T1, I1, dsarKey).asOptional().orElseThrow().state());
    }

    @Test
    void well_formed_missing_screening_ref_is_rejected_before_any_partial_purge() {
        String active = "fsr_" + "3".repeat(64);
        String missing = "fsr_" + "4".repeat(64);
        screeningStore.missingRefs.add(missing);
        ErasureScope mixed = new ErasureScope(
                List.of(), List.of(), List.of(), List.of(),
                List.of(active, missing), List.of());

        Outcome<ErasureReceipt> out = service.executeErasure(
                T1, OPERATOR, I1, dsarKey, mixed);

        assertFalse(out.isOk());
        assertEquals(OutcomeCode.NOT_FOUND, ((Outcome.Fail<ErasureReceipt>) out).code());
        assertTrue(screeningStore.purges.isEmpty(),
                "varlık preflight'i tamamlanmadan aktif ref purge edilmemeli");
        assertEquals(DsarRequest.State.RECEIVED,
                dsarStore.find(T1, I1, dsarKey).asOptional().orElseThrow().state());
    }

    @Test
    void tombstone_failure_blocks_content_deletion_fail_closed() {
        ledger.failTombstone = true;
        Outcome<ErasureReceipt> out = service.executeErasure(T1, OPERATOR, I1, dsarKey, fullScope());
        assertFalse(out.isOk());
        // denetim izi garanti edilemeden content SİLİNMEDİ
        assertTrue(transcriptStore.find(T1, I1, transcriptKey).isOk(), "tombstone-fail'de content silinmemeli");
        assertTrue(citationStore.find(T1, I1, citationKey).isOk());
        assertEquals(DsarRequest.State.RECEIVED, dsarStore.find(T1, I1, dsarKey).asOptional().orElseThrow().state());
    }

    @Test
    void double_fulfillment_rejected() {
        assertTrue(service.executeErasure(T1, OPERATOR, I1, dsarKey, fullScope()).isOk());
        Outcome<ErasureReceipt> again = service.executeErasure(T1, OPERATOR, I1, dsarKey, fullScope());
        assertFalse(again.isOk(), "FULFILLED dsar yeniden yürütülemez (yeni talep = yeni dsar)");
    }

    @Test
    void exported_terminal_case_content_erased_but_state_unchanged() {
        // vakayı FINALIZED→EXPORTED terminale taşı
        humanReview.startReview(T1, I1, caseKey, "human-1", "role-1").asOptional();
        humanReview.recordEdit(T1, new com.ats.kernel.Ids.ActorId("human-1"), I1, caseKey, "cs").asOptional();
        humanReview.recordRationale(T1, new com.ats.kernel.Ids.ActorId("human-1"), I1, caseKey, "rat").asOptional();
        // finalize AYNI reviewer tarafından (aktör-accountability; slice-11)
        humanReview.finalizeDecision(T1, new com.ats.kernel.Ids.ActorId("human-1"), I1, caseKey, "karar-sonuc-a", "2026-07-02T13:00:00Z").asOptional().orElseThrow();
        humanReview.markExported(T1, I1, caseKey, "pkt-ref").asOptional();
        ledger.entries.clear();

        ErasureReceipt receipt = service.executeErasure(T1, OPERATOR, I1, dsarKey, fullScope())
                .asOptional().orElseThrow();
        assertFalse(receipt.caseTransitioned(), "terminal EXPORTED state DEĞİŞMEZ (çıkışsız)");
        assertEquals(ReviewState.EXPORTED, reviewStore.find(T1, I1, caseKey).asOptional().orElseThrow().state());
        assertFalse(transcriptStore.find(T1, I1, transcriptKey).isOk(), "content yine de silinir");
    }

    @Test
    void cross_tenant_and_unknown_dsar_blocked() {
        assertFalse(service.executeErasure(T2, OPERATOR, I1, dsarKey, fullScope()).isOk(),
                "tenant-izolasyon: T2, T1 dsar'ına erişemez");
        assertFalse(service.executeErasure(T1, OPERATOR, I1, "i1/dsar-999", fullScope()).isOk());
        assertTrue(transcriptStore.find(T1, I1, transcriptKey).isOk(), "hiçbir şey silinmemiş olmalı");
    }

    @Test
    void empty_scope_rejected() {
        ErasureScope empty = new ErasureScope(
                List.of(), List.of(), List.of(), List.of(), List.of(), List.of());
        assertFalse(service.executeErasure(T1, OPERATOR, I1, dsarKey, empty).isOk(),
                "boş scope ile 'erasure yapıldı' iddiası üretilemez (No Fake Work)");
    }

    @Test
    void unknown_case_in_scope_fails_not_swallowed() {
        ErasureScope badCase = new ErasureScope(
                List.of(), List.of(), List.of(), List.of("i1/case-999"), List.of(),
                List.of("fake-ev-1"));
        Outcome<ErasureReceipt> out = service.executeErasure(T1, OPERATOR, I1, dsarKey, badCase);
        assertFalse(out.isOk(), "scope'taki bilinmeyen vaka yutulmaz");
        assertEquals(DsarRequest.State.RECEIVED, dsarStore.find(T1, I1, dsarKey).asOptional().orElseThrow().state(),
                "hata yolunda dsar FULFILLED olamaz");
    }
}
