package com.ats.orchestration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.consent.ConsentGate;
import com.ats.consent.InMemoryConsentStore;
import com.ats.consent.RecordingPermission;
import com.ats.consent.RecordingPermission.PermissionState;
import com.ats.contracts.AIProvider;
import com.ats.contracts.EvidenceLedger;
import com.ats.contracts.governance.ModelGovernanceGate;
import com.ats.contracts.governance.ModelGovernanceJournal;
import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.EvidenceId;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.JsonValue;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import com.ats.ops.InMemoryEventSink;
import com.ats.orchestration.TranscriptionService.TranscriptionReceipt;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class TranscriptionServiceTest {

    private static final TenantId T1 = new TenantId("t1");
    private static final ActorId A1 = new ActorId("actor-opaque-1");
    private static final InterviewId I1 = new InterviewId("i1");
    private static final String SRC = "i1/rec-" + "a".repeat(64); // slice-1 content-addressed format

    private InMemoryConsentStore consentStore;
    private InMemoryEventSink sink;
    private InMemoryTranscriptStore transcriptStore;
    private FakeLedger ledger;
    private FakeModelGovernanceGate gate;
    private FakeModelGovernanceJournal journal;

    // SENTETİK fixture (ATS-0016: gerçek aday verisi build'de YASAK)
    static final class FakeProvider implements AIProvider {
        @Override
        public Outcome<TranscriptResult> transcribe(String audioRef) {
            // dil bilinçli olarak serbest-string ("TR-TR"): servis normalize etmek zorunda
            return Outcome.ok(new TranscriptResult("TR-TR", List.of(
                    new TranscriptSegment("spk_a", 0, 900, "Merhaba, hoş geldiniz [gülüşme]"),
                    new TranscriptSegment("spk_b", 900, 2000, "(iç çeker) Teşekkür ederim, memnun oldum"),
                    new TranscriptSegment("spk_a", 2000, 2400, "[alkış]"),
                    new TranscriptSegment("spk_b", 2400, 3000, "Projeden bahsedeyim")),
                    AIProvider.ReportedModelIdentity.notReported()));
        }

        @Override
        public Outcome<CitationResult> cite(String claim, String transcriptRef) {
            return Outcome.fail(OutcomeCode.UNSUPPORTED_IN_GATE, "slice-2 dışı");
        }
    }

    static final class FailingProvider implements AIProvider {
        @Override
        public Outcome<TranscriptResult> transcribe(String audioRef) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "provider down (test)");
        }

        @Override
        public Outcome<CitationResult> cite(String claim, String transcriptRef) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "provider down (test)");
        }
    }

    static final class FakeLedger implements EvidenceLedger {
        final List<LedgerEntry> entries = new ArrayList<>();
        final List<LedgerEntry> seeded = new ArrayList<>();

        void seedIngested(String objectKey) {
            seeded.add(new LedgerEntry(T1, A1, I1, "recording.ingested", "2026-07-02T10:00:00Z",
                    "ing-" + objectKey, "c".repeat(64),
                    JsonValue.object(java.util.Map.of("object_key", JsonValue.of(objectKey))),
                    new EvidenceId("fake-ing-" + seeded.size()), -1, "fake-prev", "fake-ing-hash"));
        }

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
            return Outcome.fail(OutcomeCode.UNSUPPORTED_IN_GATE, "slice dışı");
        }

        @Override
        public Outcome<LedgerEntry> getById(TenantId t, EvidenceId id) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "yok");
        }

        @Override
        public Outcome<List<LedgerEntry>> list(TenantId t, LedgerListFilter f) {
            List<LedgerEntry> all = new ArrayList<>(seeded);
            all.addAll(entries);
            return Outcome.ok(all);
        }
    }

    @BeforeEach
    void setUp() {
        consentStore = new InMemoryConsentStore();
        sink = new InMemoryEventSink();
        transcriptStore = new InMemoryTranscriptStore();
        ledger = new FakeLedger();
        gate = FakeModelGovernanceGate.allowing();
        journal = FakeModelGovernanceJournal.allowing();
    }

    private final InMemoryAudioAccessGrants grants =
            new InMemoryAudioAccessGrants(java.time.Clock.systemUTC(), java.time.Duration.ofMinutes(5));

    private TranscriptionService service(AIProvider provider, EvidenceLedger l) {
        return service(provider, l, gate);
    }

    private TranscriptionService service(AIProvider provider, EvidenceLedger l, ModelGovernanceGate g) {
        return service(provider, l, g, journal);
    }

    private TranscriptionService service(
            AIProvider provider, EvidenceLedger l, ModelGovernanceGate g, ModelGovernanceJournal j) {
        return new TranscriptionService(
                new ConsentGate(consentStore, sink), g, j, provider, new SegmentSanitizer(), transcriptStore, l, sink, grants);
    }

    private void grant() {
        consentStore.put(new RecordingPermission(T1, I1, "subj-opaque", PermissionState.GRANTED, "2026-07-02T00:00:00Z"));
        // gerçek akış önkoşulu: transcribe yalnız recording.ingested KANITI olan kaynak için
        // çalışır (Codex #85 blocker-2). Seed AYRI listede — testlerin `entries`
        // (service'in yazdıkları) assert'leri kirlenmez.
        ledger.seedIngested(SRC);
    }

    @Test
    void valid_shaped_but_never_ingested_key_fails_closed_before_provider() {
        consentStore.put(new RecordingPermission(T1, I1, "subj-opaque", PermissionState.GRANTED, "2026-07-02T00:00:00Z"));
        // ingest kanıtı YOK — sağlayıcıya çıkılmaz, transcript yazılmaz
        CountingProvider provider = new CountingProvider();
        Outcome<TranscriptionReceipt> out =
                service(provider, ledger).transcribeStored(T1, A1, I1, SRC, "2026-07-02T11:00:00Z");
        assertFalse(out.isOk());
        assertEquals(0, provider.calls, "sağlayıcı ingest-kanıtı olmadan ÇAĞRILMAMALI");
        assertEquals(0, transcriptStore.size());
    }

    @Test
    void provider_receives_one_shot_handle_not_original_key() {
        grant();
        CapturingProvider capturing = new CapturingProvider();
        Outcome<TranscriptionService.TranscriptionReceipt> out =
                service(capturing, ledger).transcribeStored(T1, A1, I1, SRC, "2026-07-02T11:00:00Z");
        assertInstanceOf(Outcome.Ok.class, out);
        // handle sirdir ve orijinal key DEGILDIR; kriptografik-rastgele 64-hex
        assertNotEquals(SRC, capturing.lastAudioRef);
        assertTrue(capturing.lastAudioRef.matches("[0-9a-f]{64}"), "64-hex handle bekleniyordu");
        // ayni grants defterinden redeem: tenant-bagli (T1, SRC) doner; ikinci redeem one-shot FAIL
        Outcome<AudioAccessGrants.Grant> first = grants.redeem(capturing.lastAudioRef);
        AudioAccessGrants.Grant g = ((Outcome.Ok<AudioAccessGrants.Grant>) first).value();
        assertEquals(T1, g.tenantId());
        assertEquals(SRC, g.objectKey());
        assertInstanceOf(Outcome.Fail.class, grants.redeem(capturing.lastAudioRef));
        // WORM kaydinda kaynak ORIJINAL key kalir (handle WORM'a yazilmaz)
        assertTrue(ledger.entries.stream().anyMatch(e ->
                e.payload().values().get("source_object_key") instanceof
                        com.ats.kernel.JsonValue.JsonString js && js.value().equals(SRC)
                || e.payload().toString().contains(SRC)));
        assertTrue(ledger.entries.stream().noneMatch(e ->
                e.payload().toString().contains(capturing.lastAudioRef)), "handle WORM'a sizmamali");
    }

    static final class CapturingProvider implements AIProvider {
        String lastAudioRef;
        @Override
        public Outcome<TranscriptResult> transcribe(String audioRef) {
            lastAudioRef = audioRef;
            return Outcome.ok(new TranscriptResult("tr", List.of(
                    new TranscriptSegment("spk_a", 0, 900, "Merhaba")),
                    AIProvider.ReportedModelIdentity.notReported()));
        }
        @Override
        public Outcome<CitationResult> cite(String claim, String transcriptRef) {
            return Outcome.fail(OutcomeCode.UNSUPPORTED_IN_GATE, "test disi");
        }
    }

    static final class CountingProvider implements AIProvider {
        int calls = 0;
        @Override
        public Outcome<AIProvider.TranscriptResult> transcribe(String audioRef) {
            calls++;
            return Outcome.ok(new AIProvider.TranscriptResult("tr", List.of(
                    new AIProvider.TranscriptSegment("Konusmaci 1", 0, 100, "x")),
                    AIProvider.ReportedModelIdentity.notReported()));
        }
        @Override
        public Outcome<AIProvider.CitationResult> cite(String claim, String transcriptRef) {
            return Outcome.fail(OutcomeCode.UNSUPPORTED_IN_GATE, "test dışı");
        }
    }

    @Test
    void withdrawal_after_ingest_blocks_transcription() {
        consentStore.put(new RecordingPermission(T1, I1, "subj-opaque", PermissionState.WITHDRAWN, "2026-07-02T00:00:00Z"));
        Outcome<TranscriptionReceipt> out =
                service(new FakeProvider(), ledger).transcribeStored(T1, A1, I1, SRC, "2026-07-02T11:00:00Z");
        assertFalse(out.isOk(), "rıza geri çekildiyse ingest-sonrası işleme de durmalı (ATS-0003)");
        assertEquals(0, transcriptStore.size());
        assertTrue(ledger.entries.isEmpty());
    }

    @Test
    void provider_failure_emits_taxonomy_event_and_stores_nothing() {
        grant();
        Outcome<TranscriptionReceipt> out =
                service(new FailingProvider(), ledger).transcribeStored(T1, A1, I1, SRC, "2026-07-02T11:00:00Z");
        assertFalse(out.isOk());
        assertEquals(0, transcriptStore.size());
        assertTrue(sink.emitted().stream().anyMatch(e ->
                e.eventTypeId().equals(TranscriptionService.PROVIDER_REJECTED_EVENT)
                        && "stt_provider_failed".equals(e.extras().get("reason_code"))));
    }

    @Test
    void governance_preflight_deny_skips_provider_and_writes_nothing() {
        grant();
        CountingProvider provider = new CountingProvider();
        FakeModelGovernanceGate denying =
                FakeModelGovernanceGate.denyingPreflight(ModelGovernanceGate.Reason.APPROVAL_NOT_ACTIVE);
        Outcome<TranscriptionReceipt> out =
                service(provider, ledger, denying).transcribeStored(T1, A1, I1, SRC, "2026-07-02T11:00:00Z");
        assertFalse(out.isOk());
        assertEquals(0, provider.calls, "preflight DENY → sağlayıcı HİÇ çağrılmamalı (fail-closed)");
        assertEquals(0, transcriptStore.size(), "preflight DENY → store'a yazılmamalı");
        assertTrue(ledger.entries.isEmpty(), "preflight DENY → business-WORM'a satır yazılmamalı");
        assertEquals(0, denying.verifyCalls, "preflight DENY → verify çağrılmamalı");
        assertTrue(sink.emitted().stream().anyMatch(e ->
                TranscriptionService.MODEL_GOVERNANCE_DENIED_EVENT.equals(e.eventTypeId())
                        && "APPROVAL_NOT_ACTIVE".equals(e.extras().get("reason_code"))),
                "gov-deny Plane-1 event reason-code ile emit edilmeli");
    }

    @Test
    void governance_verify_deny_discards_result_no_store_no_ledger() {
        grant();
        CountingProvider provider = new CountingProvider();
        FakeModelGovernanceGate denying =
                FakeModelGovernanceGate.denyingVerify(ModelGovernanceGate.Reason.MODEL_VERSION_MISMATCH);
        Outcome<TranscriptionReceipt> out =
                service(provider, ledger, denying).transcribeStored(T1, A1, I1, SRC, "2026-07-02T11:00:00Z");
        assertFalse(out.isOk());
        assertEquals(1, provider.calls, "verify için sağlayıcı çağrılmış olmalı (sonra discard)");
        assertEquals(0, transcriptStore.size(), "verify DENY → transkript store'a YAZILMAMALI (discard)");
        assertTrue(ledger.entries.isEmpty(), "verify DENY → business-WORM'a satır YAZILMAMALI (discard)");
        assertTrue(sink.emitted().stream().anyMatch(e ->
                TranscriptionService.MODEL_GOVERNANCE_DENIED_EVENT.equals(e.eventTypeId())
                        && "MODEL_VERSION_MISMATCH".equals(e.extras().get("reason_code"))));
    }

    /* ------------------------------------------------------------------ */
    /* Codex REVISE — fail-closed null-Ok guard'ları + typed-reason (kapalı)*/
    /* ------------------------------------------------------------------ */

    @Test
    void governance_preflight_ok_but_null_permit_fails_closed_before_provider() {
        grant();
        CountingProvider provider = new CountingProvider();
        FakeModelGovernanceGate nullPermit = FakeModelGovernanceGate.allowingNullPermit();
        Outcome<TranscriptionReceipt> out =
                service(provider, ledger, nullPermit).transcribeStored(T1, A1, I1, SRC, "2026-07-02T11:00:00Z");
        assertFalse(out.isOk());
        assertEquals(0, provider.calls, "permit==null → sağlayıcı HİÇ çağrılmamalı (fail-closed)");
        assertEquals(0, transcriptStore.size(), "permit==null → store'a yazılmamalı");
        assertEquals(0, nullPermit.verifyCalls, "permit==null → verify çağrılmamalı");
        assertTrue(ledger.entries.isEmpty(), "permit==null → business-WORM'a satır yazılmamalı");
        assertTrue(sink.emitted().stream().anyMatch(e ->
                TranscriptionService.MODEL_GOVERNANCE_DENIED_EVENT.equals(e.eventTypeId())
                        && "REGISTRY_UNAVAILABLE".equals(e.extras().get("reason_code"))),
                "gate sözleşme-ihlali → KAPALI Reason fallback ile deny emit edilmeli");
    }

    @Test
    void provider_ok_but_null_result_fails_closed_no_store() {
        grant();
        FakeModelGovernanceGate allowing = FakeModelGovernanceGate.allowing();
        Outcome<TranscriptionReceipt> out =
                service(new NullResultProvider(), ledger, allowing).transcribeStored(T1, A1, I1, SRC, "2026-07-02T11:00:00Z");
        assertFalse(out.isOk());
        assertEquals(0, transcriptStore.size(), "provider Ok(null) → store'a yazılmamalı");
        assertEquals(0, allowing.verifyCalls, "provider Ok(null) → verify çağrılmamalı (provider-failed)");
        assertTrue(ledger.entries.isEmpty());
        assertTrue(sink.emitted().stream().anyMatch(e ->
                TranscriptionService.PROVIDER_REJECTED_EVENT.equals(e.eventTypeId())
                        && "stt_provider_failed".equals(e.extras().get("reason_code"))));
    }

    @Test
    void governance_verify_ok_but_null_decision_fails_closed_no_store() {
        grant();
        FakeModelGovernanceGate nullDecision = FakeModelGovernanceGate.allowingNullDecision();
        Outcome<TranscriptionReceipt> out =
                service(new FakeProvider(), ledger, nullDecision).transcribeStored(T1, A1, I1, SRC, "2026-07-02T11:00:00Z");
        assertFalse(out.isOk());
        assertEquals(1, nullDecision.verifyCalls, "verify çağrılmış olmalı (sonra null-Decision guard)");
        assertEquals(0, transcriptStore.size(), "verify Ok(null) → discard, store'a yazılmamalı");
        assertTrue(ledger.entries.isEmpty(), "verify Ok(null) → business-WORM'a satır yazılmamalı");
        assertTrue(sink.emitted().stream().anyMatch(e ->
                TranscriptionService.MODEL_GOVERNANCE_DENIED_EVENT.equals(e.eventTypeId())
                        && "REGISTRY_UNAVAILABLE".equals(e.extras().get("reason_code"))));
    }

    @Test
    void malformed_gate_raw_reason_string_never_leaks_into_event_reason_code() {
        grant();
        // Bozuk/alternatif gate ham serbest-string (newline + secret) döndürürse reason_code'a SIZMAMALI;
        // KAPALI enum fallback (REGISTRY_UNAVAILABLE) emit edilmeli.
        String raw = "arbitrary\nsecret=sk-EVIL not-a-reason";
        FakeModelGovernanceGate rawGate =
                FakeModelGovernanceGate.denyingPreflightRaw(OutcomeCode.NOT_CONFIGURED, raw);
        CountingProvider provider = new CountingProvider();
        Outcome<TranscriptionReceipt> out =
                service(provider, ledger, rawGate).transcribeStored(T1, A1, I1, SRC, "2026-07-02T11:00:00Z");
        assertFalse(out.isOk());
        assertEquals(0, provider.calls, "preflight ham-deny → sağlayıcı çağrılmamalı");
        assertTrue(sink.emitted().stream().anyMatch(e ->
                TranscriptionService.MODEL_GOVERNANCE_DENIED_EVENT.equals(e.eventTypeId())
                        && "REGISTRY_UNAVAILABLE".equals(e.extras().get("reason_code"))),
                "ham token KAPALI enum fallback'e çevrilmeli");
        assertTrue(sink.emitted().stream().noneMatch(e ->
                        e.extras().values().stream().anyMatch(v -> v.contains("secret") || v.contains("\n"))),
                "ham string/secret hiçbir event alanına SIZMAMALI");
    }

    @Test
    void gate_reason_token_with_inconsistent_outcome_code_falls_back_closed() {
        grant();
        // Geçerli enum token ("APPROVAL_NOT_ACTIVE") ama TUTARSIZ code (NOT_CONFIGURED; beklenen DENIED):
        // bozuk/alternatif gate imzası → fail-closed REGISTRY_UNAVAILABLE fallback (token'a güvenilmez).
        FakeModelGovernanceGate rawGate = FakeModelGovernanceGate.denyingPreflightRaw(
                OutcomeCode.NOT_CONFIGURED, ModelGovernanceGate.Reason.APPROVAL_NOT_ACTIVE.name());
        Outcome<TranscriptionReceipt> out =
                service(new CountingProvider(), ledger, rawGate).transcribeStored(T1, A1, I1, SRC, "2026-07-02T11:00:00Z");
        assertFalse(out.isOk());
        assertTrue(sink.emitted().stream().anyMatch(e ->
                TranscriptionService.MODEL_GOVERNANCE_DENIED_EVENT.equals(e.eventTypeId())
                        && "REGISTRY_UNAVAILABLE".equals(e.extras().get("reason_code"))));
    }

    static final class NullResultProvider implements AIProvider {
        @Override
        public Outcome<TranscriptResult> transcribe(String audioRef) {
            return Outcome.ok(null); // sözleşme-ihlali: Ok ama null result
        }
        @Override
        public Outcome<CitationResult> cite(String claim, String transcriptRef) {
            return Outcome.fail(OutcomeCode.UNSUPPORTED_IN_GATE, "test dışı");
        }
    }

    @Test
    void sanitizer_strips_annotations_and_pseudonymizes_speakers() {
        grant();
        TranscriptionReceipt receipt = service(new FakeProvider(), ledger)
                .transcribeStored(T1, A1, I1, SRC, "2026-07-02T11:00:00Z").asOptional().orElseThrow();
        Transcript stored = transcriptStore.find(T1, I1, receipt.transcriptKey()).asOptional().orElseThrow();
        // yalnız-anotasyon segment ([alkış]) düştü → 3 lexical segment
        assertEquals(3, stored.segments().size());
        for (Transcript.Segment s : stored.segments()) {
            assertFalse(s.text().contains("["), "anotasyon sızmamalı (ATS-0012 lexical-only)");
            assertFalse(s.text().contains("("), "anotasyon sızmamalı");
            assertTrue(s.speakerLabel().matches("S[0-9]+"), "konuşmacı takma-ad olmalı (ATS-0013)");
        }
        assertEquals("S1", stored.segments().get(0).speakerLabel());
        assertEquals("S2", stored.segments().get(1).speakerLabel());
        assertEquals("Merhaba, hoş geldiniz", stored.segments().get(0).text());
    }

    @Test
    void transcript_text_never_enters_ledger_payload() {
        grant();
        service(new FakeProvider(), ledger).transcribeStored(T1, A1, I1, SRC, "2026-07-02T11:00:00Z");
        assertEquals(1, ledger.entries.size());
        JsonValue.JsonObject payload = ledger.entries.get(0).payload();
        assertFalse(payload.values().containsKey("text"));
        assertFalse(payload.values().containsKey("segments"));
        String flat = payload.values().toString();
        assertFalse(flat.contains("Merhaba"), "two-plane: transkript METNİ ledger'a giremez");
        assertTrue(payload.values().containsKey("transcript_key"));
        assertTrue(payload.values().containsKey("segment_count"));
        assertEquals(new JsonValue.JsonString("tr"), payload.values().get("language"),
                "sağlayıcı serbest-string dili WORM'a girmeden normalize edilmeli");
    }

    @Test
    void free_form_source_key_rejected_before_worm() {
        grant();
        String hex64 = "a".repeat(64);
        for (String bad : new String[] {
                "i1/aday-cv-ahmet.wav",
                "i1/rec-KISA",
                "baska/rec-" + hex64,
                null,
                // Codex retro-review blocker-1: TAM-eşleşme negatifleri (ara path / ikinci rec / suffix / case / uzunluk / traversal)
                "i1/rec-" + hex64 + "/aday-ahmet/rec-" + hex64,
                "i1/rec-" + "A".repeat(64),
                "i1/rec-" + "a".repeat(63),
                "i1/rec-" + hex64 + "x",
                "i1/rec-" + hex64 + "/",
                "i1/rec-" + "a".repeat(62) + "/x",
                "i1/rec-%2e%2e/" + hex64.substring(0, 50)}) {
            Outcome<TranscriptionReceipt> out =
                    service(new FakeProvider(), ledger).transcribeStored(T1, A1, I1, bad, "2026-07-02T11:00:00Z");
            assertFalse(out.isOk(), "serbest/yanlış-scope key WORM öncesi reddedilmeli: " + bad);
        }
        assertTrue(ledger.entries.isEmpty());
    }

    @Test
    void ledger_payload_has_no_paralinguistic_proxy_fields() {
        grant();
        service(new FakeProvider(), ledger).transcribeStored(T1, A1, I1, SRC, "2026-07-02T11:00:00Z");
        assertEquals(1, ledger.entries.size());
        var keys = ledger.entries.get(0).payload().values().keySet();
        for (String forbidden : new String[] {
                "stripped_annotation_count", "annotation", "prosody", "confidence", "stress", "tone", "affect", "pause"}) {
            assertTrue(keys.stream().noneMatch(k -> k.toLowerCase(java.util.Locale.ROOT).contains(forbidden)),
                    "WORM payload paralinguistik/affect proxy alanı taşıyamaz (Codex retro blocker-3): " + forbidden);
        }
    }

    @Test
    void happy_path_returns_receipt_with_fake_ledger_ref() {
        grant();
        TranscriptionReceipt receipt = service(new FakeProvider(), ledger)
                .transcribeStored(T1, A1, I1, SRC, "2026-07-02T11:00:00Z").asOptional().orElseThrow();
        assertEquals(3, receipt.segmentCount());
        assertTrue(receipt.evidenceId().startsWith("fake-"), "gerçek ledger-ref iddia edilmez (slice-2)");
        assertTrue(sink.emitted().stream().anyMatch(e ->
                e.eventTypeId().equals(TranscriptionService.APPEND_SUCCEEDED_EVENT)
                        && receipt.evidenceId().equals(e.extras().get("ledger_entry_ref"))));
    }

    @Test
    void ledger_failure_rolls_back_transcript_and_rollback_failure_not_swallowed() {
        grant();
        EvidenceLedger failing = new FailingLedgerAdapter();
        Outcome<TranscriptionReceipt> out =
                service(new FakeProvider(), failing).transcribeStored(T1, A1, I1, SRC, "2026-07-02T11:00:00Z");
        assertFalse(out.isOk());
        assertEquals(0, transcriptStore.size(), "fail-closed telafi: kanıtsız transkript kalmamalı");
        assertTrue(sink.emitted().stream().anyMatch(e ->
                e.eventTypeId().equals(TranscriptionService.APPEND_FAILED_EVENT)
                        && "ledger_unavailable".equals(e.extras().get("reason_code"))));
    }

    static final class FailingLedgerAdapter implements EvidenceLedger {
        @Override
        public Outcome<LedgerEntry> append(EvidenceEvent event) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "ledger unavailable (test)");
        }

        @Override
        public Outcome<LedgerEntry> appendTombstoneEvent(TenantId t, ActorId a, InterviewId i, EvidenceId target, String reason) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "ledger unavailable (test)");
        }

        @Override
        public Outcome<LedgerEntry> getById(TenantId t, EvidenceId id) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "ledger unavailable (test)");
        }

        @Override
        public Outcome<List<LedgerEntry>> list(TenantId t, LedgerListFilter f) {
            // ingest-kanıtı OKUNUR (guard geçer) — bu fake yalnız APPEND'i düşürür (rollback testi)
            return Outcome.ok(List.of(new LedgerEntry(T1, A1, I1, "recording.ingested",
                    "2026-07-02T10:00:00Z", "ing", "c".repeat(64),
                    JsonValue.object(java.util.Map.of("object_key", JsonValue.of(SRC))),
                    new EvidenceId("fail-ing"), -1, "p", "h")));
        }
    }

    /* ------------------------------------------------------------------ */
    /* 39d-7a-fix — duplicate → idempotent replay (Codex 019f50b7 matrisi)  */
    /* ------------------------------------------------------------------ */

    private static final ActorId A2 = new ActorId("actor-opaque-2");

    private long transcriptCreatedRows() {
        return ledger.entries.stream()
                .filter(e -> TranscriptionService.LEDGER_EVENT_TYPE.equals(e.eventType())).count();
    }

    @Test
    void duplicate_transcribe_replays_existing_receipt_without_new_rows_even_for_different_actor() {
        grant();
        TranscriptionService svc = service(new FakeProvider(), ledger);
        Outcome<TranscriptionReceipt> first = svc.transcribeStored(T1, A1, I1, SRC, "2026-07-02T11:00:00Z");
        TranscriptionReceipt receipt1 = ((Outcome.Ok<TranscriptionReceipt>) first).value();
        assertEquals(1, transcriptCreatedRows());
        assertEquals(1, transcriptStore.size());

        // FARKLI aktör, AYNI lexical içerik (FakeProvider deterministik) → replay:
        Outcome<TranscriptionReceipt> second = svc.transcribeStored(T1, A2, I1, SRC, "2026-07-02T12:00:00Z");
        assertInstanceOf(Outcome.Ok.class, second, "duplicate 503'e DÖNÜŞMEMELİ (39d-7a bug'ı)");
        TranscriptionReceipt receipt2 = ((Outcome.Ok<TranscriptionReceipt>) second).value();
        assertEquals(receipt1, receipt2, "replay mevcut kanıtın TAM değerleriyle dönmeli");
        assertEquals(1, transcriptCreatedRows(), "WORM satır sayısı DEĞİŞMEMELİ");
        assertEquals(1, transcriptStore.size(), "yeni/geçici transcript KALMAMALI");
        assertTrue(sink.emitted().stream().anyMatch(e ->
                TranscriptionService.APPEND_DEDUPLICATED_EVENT.equals(e.eventTypeId())
                        && A2.value().equals(e.extras().get("actor_ref"))
                        && receipt1.evidenceId().equals(e.extras().get("ledger_entry_ref"))),
                "deduplicated olayı GÜNCEL aktörle yazılmalı");
        assertFalse(sink.emitted().stream().anyMatch(e ->
                TranscriptionService.APPEND_FAILED_EVENT.equals(e.eventTypeId())),
                "başarılı replay'de append.failed ÜRETİLMEMELİ");
    }

    @Test
    void race_loser_append_conflict_recovers_via_replay_and_deletes_temp_transcript() {
        grant();
        // Kazanan normal yoldan kanıtı yazar:
        Outcome<TranscriptionReceipt> winner =
                service(new FakeProvider(), ledger).transcribeStored(T1, A1, I1, SRC, "2026-07-02T11:00:00Z");
        TranscriptionReceipt winnerReceipt = ((Outcome.Ok<TranscriptionReceipt>) winner).value();

        // Kaybeden perspektifi (iki eşzamanlı lookup-miss, deterministik): pre-lookup
        // MISS görür, append idempotency-conflict'le düşer; recovery re-lookup gerçek
        // satırı bulur → replay. Store-put çağrıldı ve GERİ ALINDI olmalı.
        RaceLoserLedger loser = new RaceLoserLedger(ledger);
        Outcome<TranscriptionReceipt> second =
                service(new FakeProvider(), loser).transcribeStored(T1, A2, I1, SRC, "2026-07-02T12:00:00Z");
        assertInstanceOf(Outcome.Ok.class, second);
        assertEquals(winnerReceipt, ((Outcome.Ok<TranscriptionReceipt>) second).value());
        assertEquals(1, transcriptCreatedRows(), "kaybeden WORM'a satır YAZAMAMALI");
        assertEquals(1, transcriptStore.size(), "kaybedenin geçici transcript'i SİLİNMİŞ olmalı");
        assertTrue(loser.appendAttempts >= 1, "kaybeden append'i gerçekten denemiş olmalı (pre-lookup miss)");
    }

    @Test
    void replay_rejected_when_target_evidence_tombstoned() {
        grant();
        TranscriptionService svc = service(new FakeProvider(), ledger);
        TranscriptionReceipt receipt = ((Outcome.Ok<TranscriptionReceipt>) svc
                .transcribeStored(T1, A1, I1, SRC, "2026-07-02T11:00:00Z")).value();
        ledger.seeded.add(new EvidenceLedger.LedgerEntry(T1, A1, I1, EvidenceLedger.TOMBSTONE_EVENT_TYPE,
                "2026-07-02T13:00:00Z", T1.value() + ":tombstone:" + receipt.evidenceId(), "t".repeat(64),
                JsonValue.object(java.util.Map.of(
                        "target_evidence_id", JsonValue.of(receipt.evidenceId()),
                        "reason_code", JsonValue.of("dsar"))),
                new EvidenceId("fake-tomb-1"), -1, "p", "h"));

        Outcome<TranscriptionReceipt> replay = svc.transcribeStored(T1, A2, I1, SRC, "2026-07-02T14:00:00Z");
        assertInstanceOf(Outcome.Fail.class, replay, "tombstone'lu kanıt replay ile YENİDEN GÖRÜNÜR OLAMAZ");
        assertTrue(((Outcome.Fail<TranscriptionReceipt>) replay).reason().contains("silme kapsamına alınmış"));
        assertEquals(1, transcriptCreatedRows(), "reject yolu WORM'a satır yazamaz");
        assertEquals(1, transcriptStore.size(), "reject yolu store'a yeni kayıt bırakamaz (pre-lookup put'suz)");
        assertTrue(sink.emitted().stream().anyMatch(e ->
                TranscriptionService.APPEND_FAILED_EVENT.equals(e.eventTypeId())
                        && "target_erased".equals(e.extras().get("reason_code"))));
    }

    @Test
    void replay_is_integrity_failure_when_store_missing_without_tombstone() {
        grant();
        TranscriptionService svc = service(new FakeProvider(), ledger);
        TranscriptionReceipt receipt = ((Outcome.Ok<TranscriptionReceipt>) svc
                .transcribeStored(T1, A1, I1, SRC, "2026-07-02T11:00:00Z")).value();
        // Erasure kanıtı OLMADAN store kaydının kaybolması = corruption/tutarsızlık;
        // "silinmiş" diye yorumlanamaz (Codex şart-4).
        assertTrue(transcriptStore.delete(T1, receipt.transcriptKey()).isOk());

        Outcome<TranscriptionReceipt> replay = svc.transcribeStored(T1, A2, I1, SRC, "2026-07-02T14:00:00Z");
        assertInstanceOf(Outcome.Fail.class, replay);
        assertTrue(((Outcome.Fail<TranscriptionReceipt>) replay).reason().contains("bütünlük"));
        assertTrue(sink.emitted().stream().anyMatch(e ->
                TranscriptionService.APPEND_FAILED_EVENT.equals(e.eventTypeId())
                        && "replay_store_missing".equals(e.extras().get("reason_code"))));
    }

    @Test
    void replay_rejected_on_malformed_prior_payload() {
        grant();
        TranscriptionService svc = service(new FakeProvider(), ledger);
        Outcome<TranscriptionReceipt> first = svc.transcribeStored(T1, A1, I1, SRC, "2026-07-02T11:00:00Z");
        assertInstanceOf(Outcome.Ok.class, first);
        // Aynı idempotency-key'li satırın payload'ını BOZ (typed doğrulama fail-closed):
        EvidenceLedger.LedgerEntry good = ledger.entries.get(ledger.entries.size() - 1);
        ledger.entries.set(ledger.entries.size() - 1, new EvidenceLedger.LedgerEntry(
                good.tenantId(), good.actorId(), good.interviewId(), good.eventType(), good.occurredAt(),
                good.idempotencyKey(), good.contentHash(),
                JsonValue.object(java.util.Map.of("bogus", JsonValue.of("x"))),
                good.evidenceId(), good.sequence(), good.previousHash(), good.entryHash()));

        Outcome<TranscriptionReceipt> replay = svc.transcribeStored(T1, A2, I1, SRC, "2026-07-02T14:00:00Z");
        assertInstanceOf(Outcome.Fail.class, replay, "bozuk prior-payload'dan receipt ÜRETİLEMEZ");
        assertTrue(sink.emitted().stream().anyMatch(e ->
                TranscriptionService.APPEND_FAILED_EVENT.equals(e.eventTypeId())
                        && "replay_integrity_mismatch".equals(e.extras().get("reason_code"))));
    }

    /* Codex post-impl blocker testleri: şekil-geçerli ama SEMANTİK-yanlış payload'lar
       replay üretemez (pointer-bütünlüğü fail-closed). Yardımcı: son transcript.created
       satırının payload'ını değiştirilmiş kopyayla değiştirir. */
    private void mutateLastCreatedPayload(java.util.function.UnaryOperator<java.util.Map<String, JsonValue>> mutation) {
        for (int i = ledger.entries.size() - 1; i >= 0; i--) {
            EvidenceLedger.LedgerEntry e = ledger.entries.get(i);
            if (!TranscriptionService.LEDGER_EVENT_TYPE.equals(e.eventType())) continue;
            java.util.Map<String, JsonValue> vals = new java.util.LinkedHashMap<>(e.payload().values());
            ledger.entries.set(i, new EvidenceLedger.LedgerEntry(
                    e.tenantId(), e.actorId(), e.interviewId(), e.eventType(), e.occurredAt(),
                    e.idempotencyKey(), e.contentHash(), JsonValue.object(mutation.apply(vals)),
                    e.evidenceId(), e.sequence(), e.previousHash(), e.entryHash()));
            return;
        }
        throw new AssertionError("transcript.created satırı yok");
    }

    private void assertReplayIntegrityRejected(Outcome<TranscriptionReceipt> replay) {
        assertInstanceOf(Outcome.Fail.class, replay);
        assertTrue(((Outcome.Fail<TranscriptionReceipt>) replay).reason().contains("bütünlük"));
        assertTrue(sink.emitted().stream().anyMatch(e ->
                TranscriptionService.APPEND_FAILED_EVENT.equals(e.eventTypeId())
                        && "replay_integrity_mismatch".equals(e.extras().get("reason_code"))));
    }

    @Test
    void replay_rejected_when_payload_source_key_differs_from_current_call() {
        grant();
        TranscriptionService svc = service(new FakeProvider(), ledger);
        assertInstanceOf(Outcome.Ok.class, svc.transcribeStored(T1, A1, I1, SRC, "2026-07-02T11:00:00Z"));
        mutateLastCreatedPayload(v -> { v.put("source_object_key", JsonValue.of("i1/rec-" + "f".repeat(64))); return v; });
        assertReplayIntegrityRejected(svc.transcribeStored(T1, A2, I1, SRC, "2026-07-02T12:00:00Z"));
    }

    @Test
    void replay_rejected_when_payload_language_differs() {
        grant();
        TranscriptionService svc = service(new FakeProvider(), ledger);
        assertInstanceOf(Outcome.Ok.class, svc.transcribeStored(T1, A1, I1, SRC, "2026-07-02T11:00:00Z"));
        mutateLastCreatedPayload(v -> { v.put("language", JsonValue.of("en")); return v; });
        assertReplayIntegrityRejected(svc.transcribeStored(T1, A2, I1, SRC, "2026-07-02T12:00:00Z"));
    }

    @Test
    void replay_rejected_on_fractional_segment_count_no_rounding() {
        grant();
        TranscriptionService svc = service(new FakeProvider(), ledger);
        assertInstanceOf(Outcome.Ok.class, svc.transcribeStored(T1, A1, I1, SRC, "2026-07-02T11:00:00Z"));
        mutateLastCreatedPayload(v -> { v.put("segment_count", JsonValue.of(1.4)); return v; });
        assertReplayIntegrityRejected(svc.transcribeStored(T1, A2, I1, SRC, "2026-07-02T12:00:00Z"));
    }

    @Test
    void replay_rejected_when_segment_count_differs_from_current() {
        grant();
        TranscriptionService svc = service(new FakeProvider(), ledger);
        assertInstanceOf(Outcome.Ok.class, svc.transcribeStored(T1, A1, I1, SRC, "2026-07-02T11:00:00Z"));
        mutateLastCreatedPayload(v -> { v.put("segment_count", JsonValue.of(2.0)); return v; });
        assertReplayIntegrityRejected(svc.transcribeStored(T1, A2, I1, SRC, "2026-07-02T12:00:00Z"));
    }

    @Test
    void replay_rejected_on_unexpected_extra_payload_field() {
        grant();
        TranscriptionService svc = service(new FakeProvider(), ledger);
        assertInstanceOf(Outcome.Ok.class, svc.transcribeStored(T1, A1, I1, SRC, "2026-07-02T11:00:00Z"));
        // Politika: alan kümesi STRICT (bu payload'ın tek üreticisi servis) — ekstra alan reddedilir.
        mutateLastCreatedPayload(v -> { v.put("unexpected", JsonValue.of("x")); return v; });
        assertReplayIntegrityRejected(svc.transcribeStored(T1, A2, I1, SRC, "2026-07-02T12:00:00Z"));
    }

    @Test
    void replay_rejected_when_pointed_transcript_hash_differs_from_evidence() {
        grant();
        TranscriptionService svc = service(new FakeProvider(), ledger);
        assertInstanceOf(Outcome.Ok.class, svc.transcribeStored(T1, A1, I1, SRC, "2026-07-02T11:00:00Z"));
        TranscriptionReceipt firstReceipt = ((Outcome.Ok<TranscriptionReceipt>) svc
                .transcribeStored(T1, A2, I1, SRC, "2026-07-02T11:10:00Z")).value(); // replay — kurulum referansı
        // AYNI kaynak/dil/segment-SAYILI ama FARKLI METİNLİ ikinci gerçek transcript:
        Outcome<TranscriptionReceipt> other = service(new AltTextProvider(), ledger)
                .transcribeStored(T1, A1, I1, SRC, "2026-07-02T11:30:00Z");
        TranscriptionReceipt otherReceipt = ((Outcome.Ok<TranscriptionReceipt>) other).value();
        String otherKey = otherReceipt.transcriptKey();
        // Kurulum doğrulaması: sayı EŞİT (hash dışındaki kontroller ayırt EDEMEZ), key farklı.
        assertEquals(3, firstReceipt.segmentCount());
        assertEquals(firstReceipt.segmentCount(), otherReceipt.segmentCount());
        assertNotEquals(firstReceipt.transcriptKey(), otherReceipt.transcriptKey());
        // İLK kanıtın pointer'ını ikinci (mevcut!) transkripte yönlendir — kaynak/dil/sayı
        // güncel çağrıyla tutarlı kaldığından yalnız LEXICAL-HASH kontrolü yakalayabilir:
        for (int i = 0; i < ledger.entries.size(); i++) {
            EvidenceLedger.LedgerEntry e = ledger.entries.get(i);
            if (TranscriptionService.LEDGER_EVENT_TYPE.equals(e.eventType()) && !e.idempotencyKey().isBlank()
                    && e.payload().values().get("transcript_key") instanceof JsonValue.JsonString tk
                    && !tk.value().equals(otherKey)) {
                java.util.Map<String, JsonValue> vals = new java.util.LinkedHashMap<>(e.payload().values());
                vals.put("transcript_key", JsonValue.of(otherKey));
                ledger.entries.set(i, new EvidenceLedger.LedgerEntry(
                        e.tenantId(), e.actorId(), e.interviewId(), e.eventType(), e.occurredAt(),
                        e.idempotencyKey(), e.contentHash(), JsonValue.object(vals),
                        e.evidenceId(), e.sequence(), e.previousHash(), e.entryHash()));
                break;
            }
        }
        assertReplayIntegrityRejected(svc.transcribeStored(T1, A2, I1, SRC, "2026-07-02T12:00:00Z"));
    }

    /**
     * FakeProvider'ın SANITIZE-SONRASI yapısıyla birebir (dil tr + 3 lexical segment,
     * aynı konuşmacı dizilimi) ama FARKLI metin → yalnız lexical-hash farklı.
     * (FakeProvider'ın "[alkış]" segmenti sanitizer'da düşer; gerçek sayı 3 —
     * Codex iter: redirect testi hash kontrolünü İZOLE etmeli.)
     */
    static final class AltTextProvider implements AIProvider {
        @Override
        public Outcome<TranscriptResult> transcribe(String audioRef) {
            return Outcome.ok(new TranscriptResult("TR-TR", List.of(
                    new TranscriptSegment("spk_a", 0, 900, "Tamamen farklı bir açılış cümlesi"),
                    new TranscriptSegment("spk_b", 900, 2000, "Ve tamamen farklı bir cevap"),
                    new TranscriptSegment("spk_a", 2000, 2400, "Farklı kapanış cümlesi")),
                    AIProvider.ReportedModelIdentity.notReported()));
        }

        @Override
        public Outcome<CitationResult> cite(String claim, String transcriptRef) {
            return Outcome.fail(OutcomeCode.UNSUPPORTED_IN_GATE, "slice-2 dışı");
        }
    }

    /**
     * Deterministik yarış-kaybedeni: pre-lookup delegate'ten ÖNCEKİ state'i görür (miss),
     * append idempotency-conflict döner (kazanan satırı çoktan yazdı); recovery re-lookup
     * delegate'in gerçek satırını bulur. Adapter'ın gerçek 23505+identical davranışının
     * servis-perspektifi aynası.
     */
    static final class RaceLoserLedger implements EvidenceLedger {
        private final FakeLedger delegate;
        private boolean firstLookupDone;
        int appendAttempts;

        RaceLoserLedger(FakeLedger delegate) {
            this.delegate = delegate;
        }

        @Override
        public Outcome<LedgerEntry> findByIdempotencyKey(TenantId t, String key) {
            if (!firstLookupDone) {
                firstLookupDone = true;
                return Outcome.fail(OutcomeCode.NOT_FOUND, "ledger entry yok (yarış: henüz görünmüyor)");
            }
            return delegate.findByIdempotencyKey(t, key);
        }

        @Override
        public Outcome<LedgerEntry> append(EvidenceEvent e) {
            appendAttempts++;
            return Outcome.fail(OutcomeCode.INVALID,
                    "idempotency conflict: aynı (tenant, idempotency_key) farklı içerikle yeniden kullanılamaz (fail-closed)");
        }

        @Override
        public Outcome<LedgerEntry> appendTombstoneEvent(TenantId t, ActorId a, InterviewId i, EvidenceId target, String reason) {
            return delegate.appendTombstoneEvent(t, a, i, target, reason);
        }

        @Override
        public Outcome<LedgerEntry> getById(TenantId t, EvidenceId id) {
            return delegate.getById(t, id);
        }

        @Override
        public Outcome<List<LedgerEntry>> list(TenantId t, LedgerListFilter f) {
            return delegate.list(t, f);
        }
    }

    /* ------------------------------------------------------------------ */
    /* gov1-1d — invocation WORM journal iki-fazlı ordering (call-count)   */
    /* ------------------------------------------------------------------ */

    /** put() çağrısını paylaşılan sıra-defterine kaydeden delegate store (ordering assert için). */
    static final class OrderRecordingTranscriptStore implements TranscriptStore {
        private final TranscriptStore delegate;
        private final List<String> order;

        OrderRecordingTranscriptStore(TranscriptStore delegate, List<String> order) {
            this.delegate = delegate;
            this.order = order;
        }

        @Override
        public Outcome<String> put(Transcript transcript) {
            order.add("store");
            return delegate.put(transcript);
        }

        @Override
        public Outcome<Transcript> find(TenantId t, InterviewId i, String key) {
            return delegate.find(t, i, key);
        }

        @Override
        public Outcome<List<TranscriptSummary>> listByInterview(TenantId t, InterviewId i) {
            return delegate.listByInterview(t, i);
        }

        @Override
        public Outcome<Void> delete(TenantId t, String key) {
            return delegate.delete(t, key);
        }
    }

    @Test
    void journal_authorized_then_attested_recorded_before_store_on_happy_path() {
        grant();
        List<String> order = new ArrayList<>();
        FakeModelGovernanceJournal orderedJournal = new FakeModelGovernanceJournal(order);
        OrderRecordingTranscriptStore orderedStore = new OrderRecordingTranscriptStore(transcriptStore, order);
        TranscriptionService svc = new TranscriptionService(
                new ConsentGate(consentStore, sink), gate, orderedJournal, new FakeProvider(),
                new SegmentSanitizer(), orderedStore, ledger, sink, grants);
        Outcome<TranscriptionReceipt> out = svc.transcribeStored(T1, A1, I1, SRC, "2026-07-02T11:00:00Z");
        assertInstanceOf(Outcome.Ok.class, out);
        assertEquals(1, orderedJournal.authorizedCalls, "authorized bir kez yazılmalı");
        assertEquals(1, orderedJournal.terminalCalls, "terminal bir kez yazılmalı");
        assertInstanceOf(ModelGovernanceJournal.Attested.class, orderedJournal.lastTerminal);
        // Fail-closed ordering: authorized → attested-terminal → business store (attested store'DAN ÖNCE).
        assertEquals(List.of("authorized", "terminal:Attested", "store"), order);
    }

    @Test
    void journal_record_authorized_fail_skips_provider_and_writes_nothing() {
        grant();
        journal.failAuthorized = true;
        CountingProvider provider = new CountingProvider();
        Outcome<TranscriptionReceipt> out =
                service(provider, ledger).transcribeStored(T1, A1, I1, SRC, "2026-07-02T11:00:00Z");
        assertFalse(out.isOk());
        assertEquals(1, journal.authorizedCalls);
        assertEquals(0, journal.terminalCalls, "authorized append fail → terminal yazılmamalı");
        assertEquals(0, provider.calls, "authorized append fail → sağlayıcı HİÇ çağrılmamalı (fail-closed)");
        assertEquals(0, transcriptStore.size());
        assertTrue(ledger.entries.isEmpty(), "authorized-fail → business-WORM'a satır yazılmamalı");
        assertTrue(sink.emitted().stream().anyMatch(e ->
                TranscriptionService.MODEL_GOVERNANCE_DENIED_EVENT.equals(e.eventTypeId())
                        && "AUDIT_UNAVAILABLE".equals(e.extras().get("reason_code"))));
    }

    @Test
    void journal_provider_failure_records_provider_rejected_terminal_no_store() {
        grant();
        Outcome<TranscriptionReceipt> out =
                service(new FailingProvider(), ledger).transcribeStored(T1, A1, I1, SRC, "2026-07-02T11:00:00Z");
        assertFalse(out.isOk());
        assertEquals(1, journal.authorizedCalls);
        assertEquals(1, journal.terminalCalls);
        assertInstanceOf(ModelGovernanceJournal.ProviderRejected.class, journal.lastTerminal);
        assertEquals(0, transcriptStore.size(), "provider-fail → business store'a yazılmamalı");
        assertTrue(ledger.entries.isEmpty());
        assertTrue(sink.emitted().stream().anyMatch(e ->
                TranscriptionService.PROVIDER_REJECTED_EVENT.equals(e.eventTypeId())
                        && "stt_provider_failed".equals(e.extras().get("reason_code"))));
    }

    @Test
    void journal_verify_deny_records_verification_rejected_terminal_no_store() {
        grant();
        FakeModelGovernanceGate denying =
                FakeModelGovernanceGate.denyingVerify(ModelGovernanceGate.Reason.MODEL_ID_MISMATCH);
        CountingProvider provider = new CountingProvider();
        Outcome<TranscriptionReceipt> out =
                service(provider, ledger, denying).transcribeStored(T1, A1, I1, SRC, "2026-07-02T11:00:00Z");
        assertFalse(out.isOk());
        assertEquals(1, journal.authorizedCalls);
        assertEquals(1, journal.terminalCalls);
        assertInstanceOf(ModelGovernanceJournal.VerificationRejected.class, journal.lastTerminal);
        assertEquals(1, provider.calls, "verify için sağlayıcı çağrılmış olmalı (sonra discard)");
        assertEquals(0, transcriptStore.size(), "verify DENY → business store'a YAZILMAMALI (discard)");
        assertTrue(ledger.entries.isEmpty());
    }

    @Test
    void journal_attested_append_fail_discards_business_result_no_store() {
        grant();
        journal.failTerminalType = ModelGovernanceJournal.Attested.class;
        Outcome<TranscriptionReceipt> out =
                service(new FakeProvider(), ledger).transcribeStored(T1, A1, I1, SRC, "2026-07-02T11:00:00Z");
        assertFalse(out.isOk(), "attested journal append fail → business sonucu TAMAMEN discard (fail-closed)");
        assertEquals(1, journal.authorizedCalls);
        assertEquals(1, journal.terminalCalls);
        assertInstanceOf(ModelGovernanceJournal.Attested.class, journal.lastTerminal);
        assertEquals(0, transcriptStore.size(), "attested-fail → transkript store'a YAZILMAMALI (discard)");
        assertTrue(ledger.entries.isEmpty(), "attested-fail → business-WORM'a satır YAZILMAMALI");
        assertTrue(sink.emitted().stream().anyMatch(e ->
                TranscriptionService.MODEL_GOVERNANCE_DENIED_EVENT.equals(e.eventTypeId())
                        && "AUDIT_UNAVAILABLE".equals(e.extras().get("reason_code"))));
    }

    @Test
    void journal_preflight_deny_records_preflight_rejected_terminal_no_authorized() {
        grant();
        CountingProvider provider = new CountingProvider();
        FakeModelGovernanceGate denying =
                FakeModelGovernanceGate.denyingPreflight(ModelGovernanceGate.Reason.APPROVAL_NOT_ACTIVE);
        Outcome<TranscriptionReceipt> out =
                service(provider, ledger, denying).transcribeStored(T1, A1, I1, SRC, "2026-07-02T11:00:00Z");
        assertFalse(out.isOk());
        assertEquals(0, journal.authorizedCalls, "preflight DENY → authorized yazılmamalı");
        assertEquals(1, journal.terminalCalls);
        assertInstanceOf(ModelGovernanceJournal.PreflightRejected.class, journal.lastTerminal);
        assertEquals(0, provider.calls, "preflight DENY → sağlayıcı çağrılmamalı");
        assertTrue(ledger.entries.isEmpty());
    }
}
