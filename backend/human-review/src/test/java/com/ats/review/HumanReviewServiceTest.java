package com.ats.review;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.consent.ConsentGate;
import com.ats.consent.InMemoryConsentStore;
import com.ats.consent.RecordingPermission;
import com.ats.consent.RecordingPermission.PermissionState;
import com.ats.contracts.EvidenceLedger;
import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.EvidenceId;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import com.ats.ops.InMemoryEventSink;
import com.ats.review.HumanReviewService.FinalizeReceipt;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class HumanReviewServiceTest {

    private static final TenantId T1 = new TenantId("t1");
    private static final TenantId T2 = new TenantId("t2");
    private static final ActorId HUMAN = new ActorId("human-opaque-1");
    private static final InterviewId I1 = new InterviewId("i1");
    // SENTETİK ref'ler (ATS-0016: gerçek aday verisi build'de YASAK) — hepsi POINTER, gövde yok
    private static final List<String> EVIDENCE_REFS = List.of("fake-ev-cit-1", "fake-ev-cit-2");
    private static final String AI_VERSION = "ai-out-v1";

    private InMemoryConsentStore consentStore;
    private InMemoryEventSink sink;
    private InMemoryReviewCaseStore store;
    private FakeLedger ledger;
    private HumanReviewService service;

    static final class FakeLedger implements EvidenceLedger {
        final List<LedgerEntry> entries = new ArrayList<>();
        boolean failAppend = false;

        @Override
        public Outcome<LedgerEntry> append(EvidenceEvent e) {
            if (failAppend) {
                return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "ledger unavailable (test)");
            }
            long seq = entries.size() + 1;
            LedgerEntry entry = new LedgerEntry(e.tenantId(), e.actorId(), e.interviewId(), e.eventType(),
                    e.occurredAt(), e.idempotencyKey(), e.contentHash(), e.payload(),
                    new EvidenceId("fake-ev-" + seq), seq, "fake-prev", "fake-hash-" + seq);
            entries.add(entry);
            return Outcome.ok(entry);
        }

        @Override
        public Outcome<LedgerEntry> appendTombstoneEvent(TenantId t, ActorId a, InterviewId i, EvidenceId target, String reason) {
            return Outcome.fail(OutcomeCode.UNSUPPORTED_IN_GATE, "slice dışı");
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

    @BeforeEach
    void setUp() {
        consentStore = new InMemoryConsentStore();
        sink = new InMemoryEventSink();
        store = new InMemoryReviewCaseStore();
        ledger = new FakeLedger();
        service = new HumanReviewService(new ConsentGate(consentStore, sink), store, ledger, sink);
        consentStore.put(new RecordingPermission(T1, I1, "subj-opaque", PermissionState.GRANTED, "2026-07-02T00:00:00Z"));
    }

    private String openCase() {
        return service.open(T1, I1, EVIDENCE_REFS, AI_VERSION).asOptional().orElseThrow();
    }

    private String caseAtRationaleRecorded() {
        String caseRef = openCase();
        assertTrue(service.startReview(T1, I1, caseRef, "human-opaque-1", "role-hiring-panel").isOk());
        assertTrue(service.recordEdit(T1, I1, caseRef, "change-summary-ref-1").isOk());
        assertTrue(service.recordRationale(T1, I1, caseRef, "rationale-ref-1").isOk());
        return caseRef;
    }

    private ReviewState stateOf(String caseRef) {
        return store.find(T1, I1, caseRef).asOptional().orElseThrow().state();
    }

    @Test
    void happy_path_full_flow_edit_rationale_finalize_export() {
        String caseRef = caseAtRationaleRecorded();
        FinalizeReceipt receipt = service.finalizeDecision(T1, HUMAN, I1, caseRef, "karar-sonuc-isaretcisi-a", "2026-07-02T13:00:00Z")
                .asOptional().orElseThrow();
        assertEquals(ReviewState.FINALIZED, stateOf(caseRef));
        assertEquals(1, ledger.entries.size());
        assertTrue(service.markExported(T1, I1, caseRef, "export-artifact-ref-1").isOk());
        assertEquals(ReviewState.EXPORTED, stateOf(caseRef));
        assertTrue(sink.emitted().stream().anyMatch(e ->
                e.eventTypeId().equals(HumanReviewService.FINALIZED_EVENT)
                        && HUMAN.value().equals(e.extras().get("actor_ref"))
                        && receipt.evidenceId().equals(e.extras().get("ledger_entry_ref"))));
    }

    @Test
    void no_change_and_reject_paths_reach_rationale() {
        String k1 = openCase();
        assertTrue(service.startReview(T1, I1, k1, "human-opaque-1", "role-1").isOk());
        assertTrue(service.markReviewedNoChange(T1, I1, k1).isOk());
        assertTrue(service.recordRationale(T1, I1, k1, "no-change-rationale-ref").isOk());
        assertEquals(ReviewState.HUMAN_RATIONALE_RECORDED, stateOf(k1));

        String k2 = openCase();
        assertTrue(service.startReview(T1, I1, k2, "human-opaque-1", "role-1").isOk());
        assertTrue(service.rejectAiSuggestion(T1, I1, k2, "reject-rationale-ref").isOk());
        assertTrue(service.recordRationale(T1, I1, k2, "reject-rationale-ref").isOk());
        assertEquals(ReviewState.HUMAN_RATIONALE_RECORDED, stateOf(k2));
    }

    @Test
    void ai_state_cannot_finalize_directly() {
        String caseRef = openCase(); // AI_SUGGESTED (ai-tipi)
        Outcome<FinalizeReceipt> out = service.finalizeDecision(T1, HUMAN, I1, caseRef, "karar-sonuc-a", "2026-07-02T13:00:00Z");
        assertFalse(out.isOk(), "ai-tipi state'ten FINALIZED'e doğrudan geçiş YASAK (standart invariant-2)");
        assertEquals(ReviewState.AI_SUGGESTED, stateOf(caseRef));
        assertTrue(ledger.entries.isEmpty());
    }

    @Test
    void finalize_only_from_rationale_recorded() {
        String caseRef = openCase();
        assertTrue(service.startReview(T1, I1, caseRef, "human-opaque-1", "role-1").isOk());
        assertFalse(service.finalizeDecision(T1, HUMAN, I1, caseRef, "karar-sonuc-a", "2026-07-02T13:00:00Z").isOk(),
                "gerekçesiz finalize YOK (HUMAN_REVIEWING'den giriş yasak)");
        assertTrue(service.recordEdit(T1, I1, caseRef, "cs-ref").isOk());
        assertFalse(service.finalizeDecision(T1, HUMAN, I1, caseRef, "karar-sonuc-a", "2026-07-02T13:00:00Z").isOk(),
                "HUMAN_EDITED'den de finalize yok — önce gerekçe");
    }

    @Test
    void required_on_entry_refs_enforced() {
        assertFalse(service.open(T1, I1, List.of(), AI_VERSION).isOk(), "boş evidence-ref listesi reddedilmeli");
        assertFalse(service.open(T1, I1, List.of(" "), AI_VERSION).isOk(), "blank evidence-ref reddedilmeli");
        assertFalse(service.open(T1, I1, EVIDENCE_REFS, " ").isOk(), "blank ai_output_version_ref reddedilmeli");
        String caseRef = openCase();
        assertFalse(service.startReview(T1, I1, caseRef, " ", "role-1").isOk());
        assertFalse(service.startReview(T1, I1, caseRef, "human-1", " ").isOk());
        assertTrue(service.startReview(T1, I1, caseRef, "human-1", "role-1").isOk());
        assertFalse(service.recordEdit(T1, I1, caseRef, " ").isOk());
        assertTrue(service.recordEdit(T1, I1, caseRef, "cs-ref").isOk());
        assertFalse(service.recordRationale(T1, I1, caseRef, " ").isOk());
        assertTrue(service.recordRationale(T1, I1, caseRef, "rat-ref").isOk());
        assertFalse(service.finalizeDecision(T1, HUMAN, I1, caseRef, " ", "2026-07-02T13:00:00Z").isOk(),
                "decision_outcome_ref zorunlu (6-alan)");
    }

    @Test
    void terminal_states_have_no_exit_and_finalized_cannot_reopen() {
        String caseRef = caseAtRationaleRecorded();
        assertTrue(service.finalizeDecision(T1, HUMAN, I1, caseRef, "karar-sonuc-a", "2026-07-02T13:00:00Z").isOk());
        // locked FINALIZED: editable state'e dönüş YOK
        assertFalse(service.startReview(T1, I1, caseRef, "human-1", "role-1").isOk(), "FINALIZED re-open YASAK");
        assertFalse(service.recordRationale(T1, I1, caseRef, "r2").isOk(), "FINALIZED'den rationale'e dönüş YASAK");
        assertTrue(service.markExported(T1, I1, caseRef, "export-ref").isOk());
        // terminal EXPORTED: çıkışsız
        assertFalse(service.withdraw(T1, I1, caseRef, "dsar").isOk(), "terminal EXPORTED çıkışsız");
        assertFalse(service.markExported(T1, I1, caseRef, "export-ref-2").isOk());
    }

    @Test
    void withdraw_allowed_from_all_non_terminal_states() {
        String k1 = openCase();
        assertTrue(service.withdraw(T1, I1, k1, "consent_withdrawn").isOk(), "AI_SUGGESTED→WITHDRAWN");
        assertEquals(ReviewState.WITHDRAWN, stateOf(k1));
        assertFalse(service.withdraw(T1, I1, k1, "again").isOk(), "WITHDRAWN terminal çıkışsız");

        String k2 = caseAtRationaleRecorded();
        assertTrue(service.finalizeDecision(T1, HUMAN, I1, k2, "karar-sonuc-a", "2026-07-02T13:00:00Z").isOk());
        assertTrue(service.withdraw(T1, I1, k2, "erasure_request").isOk(), "FINALIZED→WITHDRAWN idari geçiş");
    }

    @Test
    void consent_withdrawal_blocks_finalize() {
        String caseRef = caseAtRationaleRecorded();
        consentStore.put(new RecordingPermission(T1, I1, "subj-opaque", PermissionState.WITHDRAWN, "2026-07-02T12:30:00Z"));
        Outcome<FinalizeReceipt> out = service.finalizeDecision(T1, HUMAN, I1, caseRef, "karar-sonuc-a", "2026-07-02T13:00:00Z");
        assertFalse(out.isOk(), "rıza geri çekildiyse finalize fail-closed engellenir (ATS-0003)");
        assertEquals(ReviewState.HUMAN_RATIONALE_RECORDED, stateOf(caseRef));
        assertTrue(ledger.entries.isEmpty());
    }

    @Test
    void ledger_failure_rolls_back_finalize_state() {
        String caseRef = caseAtRationaleRecorded();
        ledger.failAppend = true;
        Outcome<FinalizeReceipt> out = service.finalizeDecision(T1, HUMAN, I1, caseRef, "karar-sonuc-a", "2026-07-02T13:00:00Z");
        assertFalse(out.isOk());
        assertEquals(ReviewState.HUMAN_RATIONALE_RECORDED, stateOf(caseRef),
                "ledger-fail'de state geri alınır (kanıtsız FINALIZED kalmaz)");
        assertTrue(sink.emitted().stream().anyMatch(e ->
                e.eventTypeId().equals(HumanReviewService.APPEND_FAILED_EVENT)
                        && "ledger_unavailable".equals(e.extras().get("reason_code"))));
    }

    @Test
    void ledger_payload_carries_pointers_only_no_bodies() {
        String caseRef = caseAtRationaleRecorded();
        service.finalizeDecision(T1, HUMAN, I1, caseRef, "karar-sonuc-isaretcisi-a", "2026-07-02T13:00:00Z");
        assertEquals(1, ledger.entries.size());
        var entry = ledger.entries.get(0);
        var keys = entry.payload().values().keySet();
        assertTrue(keys.containsAll(List.of("case_key", "decision_outcome_ref", "rationale_ref",
                "ai_output_version_ref", "oversight_role_ref", "evidence_ref_count")));
        for (String forbidden : new String[] {"rationale_text", "decision_text", "body", "content", "claim"}) {
            assertTrue(keys.stream().noneMatch(k -> k.contains(forbidden)),
                    "WORM payload gövde taşıyamaz (standart §4 pointer-only): " + forbidden);
        }
        assertEquals("human_decision.finalized", entry.eventType());
    }

    @Test
    void cross_tenant_case_access_blocked() {
        String caseRef = caseAtRationaleRecorded();
        consentStore.put(new RecordingPermission(T2, I1, "subj-opaque", PermissionState.GRANTED, "2026-07-02T00:00:00Z"));
        Outcome<FinalizeReceipt> out = new HumanReviewService(new ConsentGate(consentStore, sink), store, ledger, sink)
                .finalizeDecision(T2, HUMAN, I1, caseRef, "karar-sonuc-a", "2026-07-02T13:00:00Z");
        assertFalse(out.isOk(), "tenant-izolasyon: T2, T1 vakasına erişemez");
        assertTrue(ledger.entries.isEmpty());
    }

    @Test
    void invalid_transitions_rejected() {
        String caseRef = openCase();
        assertFalse(service.recordEdit(T1, I1, caseRef, "cs").isOk(), "AI_SUGGESTED→HUMAN_EDITED geçişi yok");
        assertFalse(service.markReviewedNoChange(T1, I1, caseRef).isOk());
        assertFalse(service.rejectAiSuggestion(T1, I1, caseRef, "r").isOk());
        assertFalse(service.recordRationale(T1, I1, caseRef, "r").isOk(), "AI_SUGGESTED→RATIONALE geçişi yok");
        assertFalse(service.markExported(T1, I1, caseRef, "e").isOk(), "yalnız FINALIZED→EXPORTED");
    }
}
