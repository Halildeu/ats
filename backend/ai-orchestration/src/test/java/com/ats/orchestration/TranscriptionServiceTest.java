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

    // SENTETİK fixture (ATS-0016: gerçek aday verisi build'de YASAK)
    static final class FakeProvider implements AIProvider {
        @Override
        public Outcome<TranscriptResult> transcribe(String audioRef) {
            // dil bilinçli olarak serbest-string ("TR-TR"): servis normalize etmek zorunda
            return Outcome.ok(new TranscriptResult("TR-TR", List.of(
                    new TranscriptSegment("spk_a", 0, 900, "Merhaba, hoş geldiniz [gülüşme]"),
                    new TranscriptSegment("spk_b", 900, 2000, "(iç çeker) Teşekkür ederim, memnun oldum"),
                    new TranscriptSegment("spk_a", 2000, 2400, "[alkış]"),
                    new TranscriptSegment("spk_b", 2400, 3000, "Projeden bahsedeyim"))));
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
            return Outcome.ok(List.copyOf(entries));
        }
    }

    @BeforeEach
    void setUp() {
        consentStore = new InMemoryConsentStore();
        sink = new InMemoryEventSink();
        transcriptStore = new InMemoryTranscriptStore();
        ledger = new FakeLedger();
    }

    private TranscriptionService service(AIProvider provider, EvidenceLedger l) {
        return new TranscriptionService(
                new ConsentGate(consentStore, sink), provider, new SegmentSanitizer(), transcriptStore, l, sink);
    }

    private void grant() {
        consentStore.put(new RecordingPermission(T1, I1, "subj-opaque", PermissionState.GRANTED, "2026-07-02T00:00:00Z"));
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
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "ledger unavailable (test)");
        }
    }
}
