package com.ats.orchestration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.consent.ConsentGate;
import com.ats.consent.InMemoryConsentStore;
import com.ats.consent.RecordingPermission;
import com.ats.consent.RecordingPermission.PermissionState;
import com.ats.contracts.AIProvider;
import com.ats.contracts.EvidenceLedger;
import com.ats.contracts.governance.ModelGovernanceGate;
import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.EvidenceId;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import com.ats.ops.InMemoryEventSink;
import com.ats.orchestration.CitationService.CitationReceipt;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class CitationServiceTest {

    private static final TenantId T1 = new TenantId("t1");
    private static final TenantId T2 = new TenantId("t2");
    private static final ActorId A1 = new ActorId("actor-opaque-1");
    private static final InterviewId I1 = new InterviewId("i1");
    // SENTETİK claim (ATS-0016: gerçek aday verisi build'de YASAK)
    private static final String CLAIM = "Aday backend projesinde 5 yıl calistigini soyledi";

    private InMemoryConsentStore consentStore;
    private InMemoryEventSink sink;
    private InMemoryTranscriptStore transcriptStore;
    private InMemoryCitationStore citationStore;
    private FakeLedger ledger;
    private FakeModelGovernanceGate gate;
    private String transcriptKey;

    /** Sağlayıcı cevabı test-başına programlanabilir (fail-closed doğrulamalar için). */
    static final class ScriptedProvider implements AIProvider {
        Outcome<CitationResult> next;

        @Override
        public Outcome<TranscriptResult> transcribe(String audioRef) {
            return Outcome.fail(OutcomeCode.UNSUPPORTED_IN_GATE, "slice-3 dışı");
        }

        @Override
        public Outcome<CitationResult> cite(String claim, String transcriptRef) {
            return next;
        }
    }

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
        transcriptStore = new InMemoryTranscriptStore();
        citationStore = new InMemoryCitationStore();
        ledger = new FakeLedger();
        gate = FakeModelGovernanceGate.allowing();
        // SENTETİK transkript (slice-2 çıktısı şekli: S1..Sn takma-ad + lexical-only)
        transcriptKey = transcriptStore.put(new Transcript(T1, I1, "i1/rec-" + "a".repeat(64), "tr", List.of(
                new Transcript.Segment(0, "S1", 0, 900, "Backend projesinde beş yıl çalıştım"),
                new Transcript.Segment(1, "S2", 900, 2000, "Hangi teknolojilerle?"),
                new Transcript.Segment(2, "S1", 2000, 3000, "Java ve Postgres ağırlıklı")))).asOptional().orElseThrow();
    }

    private CitationService service(AIProvider provider) {
        return service(provider, ledger);
    }

    private CitationService service(AIProvider provider, EvidenceLedger l) {
        return service(provider, l, gate);
    }

    private CitationService service(AIProvider provider, EvidenceLedger l, ModelGovernanceGate g) {
        return new CitationService(
                new ConsentGate(consentStore, sink), g, provider, transcriptStore, citationStore, l, sink);
    }

    private void grant() {
        consentStore.put(new RecordingPermission(T1, I1, "subj-opaque", PermissionState.GRANTED, "2026-07-02T00:00:00Z"));
    }

    private ScriptedProvider providerReturning(AIProvider.CitationResult result) {
        ScriptedProvider p = new ScriptedProvider();
        p.next = Outcome.ok(result);
        return p;
    }

    private Outcome<CitationReceipt> cite(AIProvider provider) {
        return service(provider).citeClaim(T1, A1, I1, transcriptKey, CLAIM, "2026-07-02T12:00:00Z");
    }

    private boolean rejectedWith(String reasonCode) {
        return sink.emitted().stream().anyMatch(e ->
                e.eventTypeId().equals(CitationService.CITATION_REJECTED_EVENT)
                        && reasonCode.equals(e.extras().get("reason_code")));
    }

    @Test
    void happy_path_supported_with_resolvable_refs() {
        grant();
        CitationReceipt receipt = cite(providerReturning(new AIProvider.CitationResult(
                CLAIM, List.of("seg-0", "seg-2"), AIProvider.Entailment.SUPPORTED, AIProvider.ReportedModelIdentity.notReported()))).asOptional().orElseThrow();
        assertEquals(AIProvider.Entailment.SUPPORTED, receipt.entailment());
        assertEquals(2, receipt.resolvedRefCount());
        assertEquals(1, citationStore.size());
        Citation stored = citationStore.find(T1, I1, receipt.citationKey()).asOptional().orElseThrow();
        assertEquals(List.of(0, 2), stored.segmentIndexes());
        assertEquals(CLAIM, stored.claim(), "claim metni SİLİNEBİLİR store düzleminde yaşar");
    }

    @Test
    void fabricated_ref_rejected_with_taxonomy_event() {
        grant();
        Outcome<CitationReceipt> out = cite(providerReturning(new AIProvider.CitationResult(
                CLAIM, List.of("seg-0", "seg-7"), AIProvider.Entailment.SUPPORTED, AIProvider.ReportedModelIdentity.notReported())));
        assertFalse(out.isOk(), "stored segment'e çözülmeyen ref (uydurma kaynak) reddedilmeli");
        assertTrue(rejectedWith("fabricated_ref"));
        assertEquals(0, citationStore.size());
        assertTrue(ledger.entries.isEmpty());
    }

    @Test
    void supported_without_source_rejected() {
        grant();
        Outcome<CitationReceipt> out = cite(providerReturning(new AIProvider.CitationResult(
                CLAIM, List.of(), AIProvider.Entailment.SUPPORTED, AIProvider.ReportedModelIdentity.notReported())));
        assertFalse(out.isOk(), "kaynaksız SUPPORTED sunulamaz (ATS-0004)");
        assertTrue(rejectedWith("unsupported_without_source"));
    }

    @Test
    void provider_claim_swap_rejected() {
        grant();
        Outcome<CitationReceipt> out = cite(providerReturning(new AIProvider.CitationResult(
                "Aday 10 yil yoneticilik yapti", List.of("seg-0"), AIProvider.Entailment.SUPPORTED, AIProvider.ReportedModelIdentity.notReported())));
        assertFalse(out.isOk(), "sağlayıcı claim'i değiştiremez");
        assertTrue(rejectedWith("claim_mismatch"));
    }

    @Test
    void insufficient_recorded_honestly_not_upgraded() {
        grant();
        CitationReceipt receipt = cite(providerReturning(new AIProvider.CitationResult(
                CLAIM, List.of(), AIProvider.Entailment.INSUFFICIENT,
                AIProvider.ReportedModelIdentity.notReported()))).asOptional().orElseThrow();
        assertEquals(AIProvider.Entailment.INSUFFICIENT, receipt.entailment(), "belirsizlik yukarı yuvarlanmaz");
        assertEquals(0, receipt.resolvedRefCount());
        assertEquals(1, ledger.entries.size());
    }

    @Test
    void not_supported_with_optional_resolvable_ref_ok() {
        grant();
        CitationReceipt receipt = cite(providerReturning(new AIProvider.CitationResult(
                CLAIM, List.of("seg-1"), AIProvider.Entailment.NOT_SUPPORTED,
                AIProvider.ReportedModelIdentity.notReported()))).asOptional().orElseThrow();
        assertEquals(AIProvider.Entailment.NOT_SUPPORTED, receipt.entailment());
        assertEquals(1, receipt.resolvedRefCount());
    }

    @Test
    void invalid_ref_shapes_rejected() {
        grant();
        for (List<String> badRefs : List.of(
                List.of("segment-0"),
                List.of("seg-0", "seg-0"),
                List.of("seg--1"),
                List.of("seg-0/../seg-2"),
                java.util.Arrays.asList((String) null))) {
            Outcome<CitationReceipt> out = cite(providerReturning(new AIProvider.CitationResult(
                    CLAIM, badRefs, AIProvider.Entailment.SUPPORTED, AIProvider.ReportedModelIdentity.notReported())));
            assertFalse(out.isOk(), "geçersiz ref şekli reddedilmeli: " + badRefs);
        }
        assertTrue(rejectedWith("invalid_refs"));
        assertTrue(ledger.entries.isEmpty());
    }

    @Test
    void null_provider_result_and_null_entailment_fail_closed() {
        grant();
        ScriptedProvider nullResult = new ScriptedProvider();
        nullResult.next = Outcome.ok(null);
        assertFalse(cite(nullResult).isOk(), "Ok(null) fail-closed reddedilmeli");
        Outcome<CitationReceipt> out = cite(providerReturning(new AIProvider.CitationResult(
                CLAIM, List.of("seg-0"), null, AIProvider.ReportedModelIdentity.notReported())));
        assertFalse(out.isOk(), "null entailment fail-closed reddedilmeli");
        assertTrue(rejectedWith("invalid_provider_result"));
    }

    @Test
    void consent_withdrawal_blocks_citation() {
        consentStore.put(new RecordingPermission(T1, I1, "subj-opaque", PermissionState.WITHDRAWN, "2026-07-02T00:00:00Z"));
        Outcome<CitationReceipt> out = cite(providerReturning(new AIProvider.CitationResult(
                CLAIM, List.of("seg-0"), AIProvider.Entailment.SUPPORTED, AIProvider.ReportedModelIdentity.notReported())));
        assertFalse(out.isOk(), "rıza geri çekildiyse citation üretimi de durmalı (ATS-0003)");
        assertEquals(0, citationStore.size());
        assertTrue(ledger.entries.isEmpty());
    }

    @Test
    void provider_failure_emits_taxonomy_event() {
        grant();
        ScriptedProvider failing = new ScriptedProvider();
        failing.next = Outcome.fail(OutcomeCode.NOT_CONFIGURED, "provider down (test)");
        assertFalse(cite(failing).isOk());
        assertTrue(sink.emitted().stream().anyMatch(e ->
                e.eventTypeId().equals(CitationService.PROVIDER_REJECTED_EVENT)
                        && "citation_provider_failed".equals(e.extras().get("reason_code"))));
    }

    /** cite'ı call-count'layan sağlayıcı (fail-closed discard kanıtı için). */
    static final class CountingCiteProvider implements AIProvider {
        int calls = 0;
        private final AIProvider.CitationResult result;

        CountingCiteProvider(AIProvider.CitationResult result) {
            this.result = result;
        }

        @Override
        public Outcome<TranscriptResult> transcribe(String audioRef) {
            return Outcome.fail(OutcomeCode.UNSUPPORTED_IN_GATE, "slice-3 dışı");
        }

        @Override
        public Outcome<CitationResult> cite(String claim, String transcriptRef) {
            calls++;
            return Outcome.ok(result);
        }
    }

    @Test
    void governance_preflight_deny_skips_provider_and_writes_nothing() {
        grant();
        CountingCiteProvider provider = new CountingCiteProvider(new AIProvider.CitationResult(
                CLAIM, List.of("seg-0"), AIProvider.Entailment.SUPPORTED, AIProvider.ReportedModelIdentity.notReported()));
        FakeModelGovernanceGate denying =
                FakeModelGovernanceGate.denyingPreflight(ModelGovernanceGate.Reason.REGISTRY_UNAVAILABLE);
        Outcome<CitationReceipt> out = service(provider, ledger, denying)
                .citeClaim(T1, A1, I1, transcriptKey, CLAIM, "2026-07-02T12:00:00Z");
        assertFalse(out.isOk());
        assertEquals(0, provider.calls, "preflight DENY → sağlayıcı HİÇ çağrılmamalı (fail-closed)");
        assertEquals(0, citationStore.size(), "preflight DENY → citation store'a yazılmamalı");
        assertTrue(ledger.entries.isEmpty(), "preflight DENY → business-WORM'a satır yazılmamalı");
        assertEquals(0, denying.verifyCalls, "preflight DENY → verify çağrılmamalı");
        assertTrue(sink.emitted().stream().anyMatch(e ->
                CitationService.MODEL_GOVERNANCE_DENIED_EVENT.equals(e.eventTypeId())
                        && "REGISTRY_UNAVAILABLE".equals(e.extras().get("reason_code"))));
    }

    @Test
    void governance_verify_deny_discards_result_no_store_no_ledger() {
        grant();
        CountingCiteProvider provider = new CountingCiteProvider(new AIProvider.CitationResult(
                CLAIM, List.of("seg-0"), AIProvider.Entailment.SUPPORTED, AIProvider.ReportedModelIdentity.notReported()));
        FakeModelGovernanceGate denying =
                FakeModelGovernanceGate.denyingVerify(ModelGovernanceGate.Reason.MODEL_ID_MISMATCH);
        Outcome<CitationReceipt> out = service(provider, ledger, denying)
                .citeClaim(T1, A1, I1, transcriptKey, CLAIM, "2026-07-02T12:00:00Z");
        assertFalse(out.isOk());
        assertEquals(1, provider.calls, "verify için sağlayıcı çağrılmış olmalı (sonra discard)");
        assertEquals(0, citationStore.size(), "verify DENY → citation store'a YAZILMAMALI (discard)");
        assertTrue(ledger.entries.isEmpty(), "verify DENY → business-WORM'a satır YAZILMAMALI (discard)");
        assertTrue(sink.emitted().stream().anyMatch(e ->
                CitationService.MODEL_GOVERNANCE_DENIED_EVENT.equals(e.eventTypeId())
                        && "MODEL_ID_MISMATCH".equals(e.extras().get("reason_code"))));
    }

    @Test
    void unknown_transcript_and_cross_tenant_access_blocked() {
        grant();
        CitationService svc = service(providerReturning(new AIProvider.CitationResult(
                CLAIM, List.of("seg-0"), AIProvider.Entailment.SUPPORTED, AIProvider.ReportedModelIdentity.notReported())));
        assertFalse(svc.citeClaim(T1, A1, I1, "i1/tr-999", CLAIM, "2026-07-02T12:00:00Z").isOk());
        // cross-tenant: T2, T1'in transkript anahtarına yapısal olarak erişemez
        consentStore.put(new RecordingPermission(T2, I1, "subj-opaque", PermissionState.GRANTED, "2026-07-02T00:00:00Z"));
        Outcome<CitationReceipt> cross = svc.citeClaim(T2, A1, I1, transcriptKey, CLAIM, "2026-07-02T12:00:00Z");
        assertFalse(cross.isOk(), "tenant-izolasyon: cross-tenant transkript erişimi NOT_FOUND olmalı");
        assertTrue(ledger.entries.isEmpty());
    }

    @Test
    void blank_and_oversized_claim_rejected() {
        grant();
        AIProvider p = providerReturning(new AIProvider.CitationResult(
                CLAIM, List.of("seg-0"), AIProvider.Entailment.SUPPORTED, AIProvider.ReportedModelIdentity.notReported()));
        assertFalse(service(p).citeClaim(T1, A1, I1, transcriptKey, "   ", "2026-07-02T12:00:00Z").isOk());
        assertFalse(service(p).citeClaim(T1, A1, I1, transcriptKey, "x".repeat(501), "2026-07-02T12:00:00Z").isOk());
    }

    @Test
    void claim_text_and_claim_hash_never_enter_ledger_payload() {
        grant();
        cite(providerReturning(new AIProvider.CitationResult(
                CLAIM, List.of("seg-0"), AIProvider.Entailment.SUPPORTED, AIProvider.ReportedModelIdentity.notReported())));
        assertEquals(1, ledger.entries.size());
        var entry = ledger.entries.get(0);
        var keys = entry.payload().values().keySet();
        assertTrue(keys.stream().noneMatch(k -> k.toLowerCase(java.util.Locale.ROOT).contains("claim")),
                "claim-türevi alan (claim_hash dahil) WORM payload'da olamaz (ATS-0003 minimizasyon)");
        String flat = entry.payload().values().toString();
        assertFalse(flat.contains("5 yıl") || flat.contains(CLAIM), "claim METNİ ledger'a giremez (two-plane)");
        assertFalse(entry.idempotencyKey().contains(CLAIM), "idempotency claim'den türetilemez");
        assertTrue(keys.containsAll(List.of("citation_key", "transcript_key", "entailment", "ref_count")));
    }

    @Test
    void rollback_failure_not_swallowed() {
        grant();
        ledger.failAppend = true;
        CitationStore failingDelete = new CitationStore() {
            @Override
            public Outcome<String> put(Citation c) {
                return citationStore.put(c);
            }

            @Override
            public Outcome<Citation> find(TenantId t, InterviewId i, String key) {
                return citationStore.find(t, i, key);
            }

            @Override
            public Outcome<Void> delete(TenantId t, String key) {
                return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "store down (test)");
            }
        };
        CitationService svc = new CitationService(new ConsentGate(consentStore, sink), gate,
                providerReturning(new AIProvider.CitationResult(CLAIM, List.of("seg-0"), AIProvider.Entailment.SUPPORTED, AIProvider.ReportedModelIdentity.notReported())),
                transcriptStore, failingDelete, ledger, sink);
        Outcome<CitationReceipt> out = svc.citeClaim(T1, A1, I1, transcriptKey, CLAIM, "2026-07-02T12:00:00Z");
        assertFalse(out.isOk());
        assertTrue(sink.emitted().stream().anyMatch(e ->
                e.eventTypeId().equals(CitationService.APPEND_FAILED_EVENT)
                        && "ledger_unavailable_rollback_failed".equals(e.extras().get("reason_code"))),
                "telafi silmesi de başarısızsa yutulmamalı (operasyonel müdahale sinyali)");
    }

    @Test
    void ledger_failure_rolls_back_citation() {
        grant();
        ledger.failAppend = true;
        Outcome<CitationReceipt> out = cite(providerReturning(new AIProvider.CitationResult(
                CLAIM, List.of("seg-0"), AIProvider.Entailment.SUPPORTED, AIProvider.ReportedModelIdentity.notReported())));
        assertFalse(out.isOk());
        assertEquals(0, citationStore.size(), "fail-closed telafi: kanıtsız citation kalmamalı");
        assertTrue(sink.emitted().stream().anyMatch(e ->
                e.eventTypeId().equals(CitationService.APPEND_FAILED_EVENT)
                        && "ledger_unavailable".equals(e.extras().get("reason_code"))));
    }
}
