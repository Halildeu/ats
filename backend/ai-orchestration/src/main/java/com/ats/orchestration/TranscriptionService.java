package com.ats.orchestration;

import com.ats.consent.ConsentGate;
import com.ats.contracts.AIProvider;
import com.ats.contracts.AIProvider.TranscriptResult;
import com.ats.contracts.EvidenceLedger;
import com.ats.contracts.EvidenceLedger.EvidenceEvent;
import com.ats.contracts.EvidenceLedger.LedgerEntry;
import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.JsonValue;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import com.ats.ops.OperationalEvent;
import com.ats.ops.OperationalEventSink;
import com.ats.ops.PiiClass;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Map;

/**
 * PRD-P1 F2/F3 transkripsiyon orkestrasyonu (ATS-0016 slice-2, port-only):
 * consent RE-CHECK (rıza geri-çekilmişse ingest-sonrası işleme de DURUR — ATS-0003
 * withdrawal semantiği) → AIProvider.transcribe (sağlayıcı port arkasında; seçim
 * ADR-0017) → ATS-0012 sanitization-gate (lexical-only) + ATS-0013 S1..Sn takma-ad
 * → TranscriptStore → WORM ledger append (TRANSKRİPT METNİ LEDGER'A GİRMEZ — yalnız
 * hash+meta; two-plane) — append fail → transkript geri alınır (telafi hatası yutulmaz).
 */
public final class TranscriptionService {

    static final String PROVIDER_REJECTED_EVENT = "ai_pipeline.provider.request_rejected";
    static final String APPEND_SUCCEEDED_EVENT = "evidence.append.succeeded";
    static final String APPEND_FAILED_EVENT = "evidence.append.failed";
    static final String LEDGER_EVENT_TYPE = "transcript.created";

    public record TranscriptionReceipt(String transcriptKey, String evidenceId, int segmentCount) {}

    private final ConsentGate consentGate;
    private final AIProvider provider;
    private final SegmentSanitizer sanitizer;
    private final TranscriptStore transcriptStore;
    private final EvidenceLedger ledger;
    private final OperationalEventSink sink;

    public TranscriptionService(
            ConsentGate consentGate,
            AIProvider provider,
            SegmentSanitizer sanitizer,
            TranscriptStore transcriptStore,
            EvidenceLedger ledger,
            OperationalEventSink sink) {
        this.consentGate = consentGate;
        this.provider = provider;
        this.sanitizer = sanitizer;
        this.transcriptStore = transcriptStore;
        this.ledger = ledger;
        this.sink = sink;
    }

    /**
     * Slice-1'in content-addressed opak anahtar formatı — TAM-EŞLEŞME (Codex retro-review blocker-1):
     * yalnız {@code <interviewId>/rec-<sha256-lowercase-hex>}; ara path segmenti, ikinci "/rec-",
     * traversal veya suffix kabul edilmez (startsWith+suffix-find kombinasyonu ara-path kaçırıyordu).
     */
    static boolean isContentAddressedKey(InterviewId interviewId, String key) {
        if (key == null) {
            return false;
        }
        String prefix = interviewId.value() + "/rec-";
        if (!key.startsWith(prefix)) {
            return false;
        }
        String hash = key.substring(prefix.length());
        if (hash.length() != 64) {
            return false;
        }
        for (int i = 0; i < hash.length(); i++) {
            char c = hash.charAt(i);
            if ((c < '0' || c > '9') && (c < 'a' || c > 'f')) {
                return false;
            }
        }
        return true;
    }

    public Outcome<TranscriptionReceipt> transcribeStored(
            TenantId tenantId, ActorId actorId, InterviewId interviewId, String sourceObjectKey, String occurredAtIso) {
        // serbest string WORM payload'a giremez — slice-1 opak formatına TAM-eşleşme zorunlu
        if (!isContentAddressedKey(interviewId, sourceObjectKey)) {
            return Outcome.fail(OutcomeCode.INVALID,
                    "sourceObjectKey content-addressed opak formatta değil (tam-eşleşme: interview/rec-<sha256>)");
        }
        Outcome<Void> consent = consentGate.requireRecordingAllowed(tenantId, interviewId);
        if (consent instanceof Outcome.Fail<Void> denied) {
            return Outcome.fail(denied.code(), denied.reason());
        }

        // format-valid ama HİÇ ingest edilmemiş key sağlayıcıya ÇIKAMAZ ve transcript.created
        // WORM kanıtına DÖNÜŞEMEZ — kaynak, aynı tenant+interview'ün recording.ingested
        // kanıtına bağlanır (Codex #85 blocker-2; kanıt-zinciri bütünlüğü).
        Outcome<java.util.List<LedgerEntry>> ingested = ledger.list(tenantId,
                new EvidenceLedger.LedgerListFilter(interviewId, "recording.ingested"));
        if (!(ingested instanceof Outcome.Ok<java.util.List<LedgerEntry>> ingestedOk)) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "ingest kanıtı okunamadı (fail-closed)");
        }
        boolean sourceIngested = ingestedOk.value().stream().anyMatch(e ->
                e.payload().values().get("object_key") instanceof JsonValue.JsonString js
                        && js.value().equals(sourceObjectKey));
        if (!sourceIngested) {
            return Outcome.fail(OutcomeCode.NOT_FOUND,
                    "sourceObjectKey için recording.ingested kanıtı yok (fail-closed; önce yükleme)");
        }

        Outcome<TranscriptResult> transcribed = provider.transcribe(sourceObjectKey);
        if (!(transcribed instanceof Outcome.Ok<TranscriptResult> providerOk)) {
            emit(tenantId, PROVIDER_REJECTED_EVENT, "ai_pipeline", "warning", PiiClass.NONE,
                    Map.of("reason_code", "stt_provider_failed"));
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "STT sağlayıcı başarısız (fail-closed)");
        }

        SegmentSanitizer.Sanitized sanitized = sanitizer.sanitize(providerOk.value().segments());
        if (sanitized.segments().isEmpty()) {
            return Outcome.fail(OutcomeCode.INVALID, "sanitization sonrası lexical segment kalmadı (fail-closed)");
        }

        Transcript transcript = new Transcript(
                tenantId, interviewId, sourceObjectKey,
                normalizeLanguage(providerOk.value().language()), sanitized.segments());
        Outcome<String> stored = transcriptStore.put(transcript);
        if (!(stored instanceof Outcome.Ok<String> keyOk)) {
            return Outcome.fail(OutcomeCode.INVALID, "transkript deposuna yazılamadı");
        }
        String transcriptKey = keyOk.value();

        String contentHash = sha256Hex(lexicalConcat(transcript));
        Outcome<LedgerEntry> appended = ledger.append(new EvidenceEvent(
                tenantId, actorId, interviewId, LEDGER_EVENT_TYPE, occurredAtIso,
                tenantId.value() + ":" + interviewId.value() + ":" + contentHash,
                contentHash,
                // two-plane: transkript METNİ ledger'a girmez — yalnız opak key + hash + meta.
                // stripped_annotation_count BİLİNÇLİ YOK (Codex retro-review blocker-3): "kaç
                // paralinguistik işaret vardı" bilgisi interview'e bağlı immutable kanıtta
                // affect/prosody PROXY'sidir; WORM'a yazılmaz.
                JsonValue.object(Map.of(
                        "transcript_key", JsonValue.of(transcriptKey),
                        "source_object_key", JsonValue.of(sourceObjectKey),
                        "segment_count", JsonValue.of((double) sanitized.segments().size()),
                        "language", JsonValue.of(transcript.language())))));
        if (!(appended instanceof Outcome.Ok<LedgerEntry> entryOk)) {
            Outcome<Void> rolledBack = transcriptStore.delete(tenantId, transcriptKey);
            if (rolledBack.isOk()) {
                emitAppendFailed(tenantId, "ledger_unavailable");
                return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "ledger append başarısız (transkript geri alındı)");
            }
            emitAppendFailed(tenantId, "ledger_unavailable_rollback_failed");
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED,
                    "ledger append başarısız VE telafi silmesi başarısız — transkript kanıtsız kalmış olabilir (operasyonel müdahale gerekir)");
        }

        LedgerEntry entry = entryOk.value();
        emit(tenantId, APPEND_SUCCEEDED_EVENT, "evidence", "info", PiiClass.ID_ONLY,
                Map.of("ledger_entry_ref", entry.evidenceId().value()));
        return Outcome.ok(new TranscriptionReceipt(transcriptKey, entry.evidenceId().value(), sanitized.segments().size()));
    }

    private void emitAppendFailed(TenantId tenantId, String reasonCode) {
        emit(tenantId, APPEND_FAILED_EVENT, "evidence", "error", PiiClass.ID_ONLY, Map.of("reason_code", reasonCode));
    }

    private void emit(TenantId tenantId, String eventTypeId, String category, String severity,
            PiiClass pii, Map<String, String> extras) {
        OperationalEvent.create(tenantId, eventTypeId, category, severity, pii, extras)
                .asOptional()
                .ifPresent(sink::emit);
    }

    /** Sağlayıcı serbest-string dili WORM'a girmeden normalize edilir (ISO primary-subtag ya da "unknown"). */
    static String normalizeLanguage(String raw) {
        if (raw == null) {
            return "unknown";
        }
        String primary = raw.strip().toLowerCase(java.util.Locale.ROOT).split("[-_]", 2)[0];
        return primary.matches("[a-z]{2,3}") ? primary : "unknown";
    }

    private static String lexicalConcat(Transcript t) {
        StringBuilder sb = new StringBuilder();
        for (Transcript.Segment s : t.segments()) {
            sb.append(s.speakerLabel()).append('\t').append(s.text()).append('\n');
        }
        return sb.toString();
    }

    private static String sha256Hex(String text) {
        try {
            return HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 mevcut olmalı", e);
        }
    }
}
