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
    static final String APPEND_DEDUPLICATED_EVENT = "evidence.append.deduplicated";
    static final String LEDGER_EVENT_TYPE = "transcript.created";

    public record TranscriptionReceipt(String transcriptKey, String evidenceId, int segmentCount) {}

    private final ConsentGate consentGate;
    private final AIProvider provider;
    private final SegmentSanitizer sanitizer;
    private final TranscriptStore transcriptStore;
    private final EvidenceLedger ledger;
    private final OperationalEventSink sink;
    private final AudioAccessGrants grants;

    public TranscriptionService(
            ConsentGate consentGate,
            AIProvider provider,
            SegmentSanitizer sanitizer,
            TranscriptStore transcriptStore,
            EvidenceLedger ledger,
            OperationalEventSink sink,
            AudioAccessGrants grants) {
        this.consentGate = consentGate;
        this.provider = provider;
        this.grants = grants;
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

        // slice-36: provider'a orijinal key DEĞİL, tenant-bağlı one-shot capability
        // handle'ı gider (Codex slice-33 sınırı). Handle sırdır: log/WORM/hata
        // mesajına yazılmaz; WORM kaydında kaynak orijinal sourceObjectKey kalır.
        Outcome<String> issued = grants.issue(tenantId, sourceObjectKey);
        if (!(issued instanceof Outcome.Ok<String> issuedOk)) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "ses-erişim grant'i verilemedi (fail-closed)");
        }
        Outcome<TranscriptResult> transcribed = provider.transcribe(issuedOk.value());
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
        String contentHash = sha256Hex(lexicalConcat(transcript));
        String idempotencyKey = tenantId.value() + ":" + interviewId.value() + ":" + contentHash;

        // 39d-7a-fix PRE-LOOKUP (Codex 019f50b7 hybrid adım 2-3): aynı lexical içerik daha
        // önce kanıtlandıysa yeni store-put + duplicate-append HİÇ denenmez — mevcut kanıtla
        // idempotent replay. NOT_FOUND normal yol; başka okuma hatası fail-closed.
        Outcome<LedgerEntry> prior = ledger.findByIdempotencyKey(tenantId, idempotencyKey);
        if (prior instanceof Outcome.Ok<LedgerEntry> priorOk) {
            return replayFromPrior(priorOk.value(), tenantId, actorId, interviewId, contentHash, transcript);
        }
        if (prior instanceof Outcome.Fail<LedgerEntry> priorFail && priorFail.code() != OutcomeCode.NOT_FOUND) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "ledger idempotency okuması başarısız (fail-closed)");
        }

        Outcome<String> stored = transcriptStore.put(transcript);
        if (!(stored instanceof Outcome.Ok<String> keyOk)) {
            return Outcome.fail(OutcomeCode.INVALID, "transkript deposuna yazılamadı");
        }
        String transcriptKey = keyOk.value();

        Outcome<LedgerEntry> appended = ledger.append(new EvidenceEvent(
                tenantId, actorId, interviewId, LEDGER_EVENT_TYPE, occurredAtIso,
                idempotencyKey,
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
            if (!rolledBack.isOk()) {
                emitAppendFailed(tenantId, "ledger_unavailable_rollback_failed");
                return Outcome.fail(OutcomeCode.NOT_CONFIGURED,
                        "ledger append başarısız VE telafi silmesi başarısız — transkript kanıtsız kalmış olabilir (operasyonel müdahale gerekir)");
            }
            // 39d-7a-fix RECOVERY (Codex hybrid adım 7 — iki eşzamanlı lookup-miss yarışı):
            // kaybeden append'i idempotency-conflict'le düşer; satır ŞİMDİ varsa kazananın
            // kanıtıyla replay (geçici transcript yukarıda silindi). Satır yoksa gerçek
            // ledger arızası — mevcut fail-closed yol.
            Outcome<LedgerEntry> raced = ledger.findByIdempotencyKey(tenantId, idempotencyKey);
            if (raced instanceof Outcome.Ok<LedgerEntry> racedOk) {
                return replayFromPrior(racedOk.value(), tenantId, actorId, interviewId, contentHash, transcript);
            }
            emitAppendFailed(tenantId, "ledger_unavailable");
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "ledger append başarısız (transkript geri alındı)");
        }

        LedgerEntry entry = entryOk.value();
        emit(tenantId, APPEND_SUCCEEDED_EVENT, "evidence", "info", PiiClass.ID_ONLY,
                Map.of("ledger_entry_ref", entry.evidenceId().value()));
        return Outcome.ok(new TranscriptionReceipt(transcriptKey, entry.evidenceId().value(), sanitized.segments().size()));
    }

    /**
     * 39d-7a-fix idempotent replay (Codex 019f50b7 hybrid): aynı (tenant, interview,
     * lexical-content-hash) daha önce kanıtlanmışsa MEVCUT kanıtla cevap verilir — WORM'a
     * yeni satır yazılmaz, yeni transcript üretilmez. Typed doğrulama fail-closed: bozuk/
     * yabancı kayıttan receipt üretilmez. Karar matrisi (Codex şart-5):
     * tombstone VAR → erased-reject; store YOK + tombstone YOK → integrity failure;
     * store VAR + tombstone YOK → replay (receipt öncesi SON tombstone kontrolü —
     * erase/replay yarışı silinmiş içeriği yeniden görünür kılamaz).
     * Actor dedupe kimliğinin parçası DEĞİLDİR (farklı aktör aynı kanıta replay alabilir;
     * rol-kapısı controller'da zaten geçildi); audit için deduplicated olayı GÜNCEL
     * aktörle yazılır, WORM satırının sahipliği/evidenceId'si değişmez.
     */
    private static final java.util.Set<String> REPLAY_PAYLOAD_KEYS =
            java.util.Set.of("transcript_key", "source_object_key", "segment_count", "language");

    private Outcome<TranscriptionReceipt> replayFromPrior(
            LedgerEntry prior, TenantId tenantId, ActorId actorId, InterviewId interviewId,
            String contentHash, Transcript current) {
        if (!LEDGER_EVENT_TYPE.equals(prior.eventType())
                || !interviewId.value().equals(prior.interviewId().value())
                || !contentHash.equals(prior.contentHash())) {
            return replayIntegrityFail(tenantId,
                    "idempotency kaydı beklenen transcript.created kimliğiyle uyuşmuyor");
        }
        Map<String, JsonValue> payload = prior.payload().values();
        // Codex post-impl blocker: şekil yetmez — SEMANTİK bağ doğrulanır. Payload key
        // kümesi TAM (strict; bu payload'ın tek üreticisi bu servis), pointer alanları
        // GÜNCEL çağrının transcript'iyle birebir; segment_count tam-sayı (yuvarlama YOK).
        if (!REPLAY_PAYLOAD_KEYS.equals(payload.keySet())) {
            return replayIntegrityFail(tenantId, "idempotency kaydının payload alan-kümesi beklenenden farklı");
        }
        String priorTranscriptKey = payload.get("transcript_key") instanceof JsonValue.JsonString tk
                && !tk.value().isBlank() ? tk.value() : null;
        String priorSourceKey = payload.get("source_object_key") instanceof JsonValue.JsonString sk
                ? sk.value() : null;
        String priorLanguage = payload.get("language") instanceof JsonValue.JsonString lang
                ? lang.value() : null;
        Double rawCount = payload.get("segment_count") instanceof JsonValue.JsonNumber sc
                ? sc.value() : null;
        boolean integralCount = rawCount != null && Double.isFinite(rawCount)
                && rawCount >= 1 && rawCount == Math.floor(rawCount);
        if (priorTranscriptKey == null || priorSourceKey == null || priorLanguage == null || !integralCount) {
            return replayIntegrityFail(tenantId, "idempotency kaydının payload'ı beklenen şekle uymuyor");
        }
        int priorCount = (int) (double) rawCount;
        if (!priorSourceKey.equals(current.sourceObjectKey())
                || !priorLanguage.equals(current.language())
                || priorCount != current.segments().size()) {
            return replayIntegrityFail(tenantId,
                    "idempotency kaydı güncel çağrının transkript kimliğiyle (kaynak/dil/segment) uyuşmuyor");
        }
        Outcome<TranscriptionReceipt> erased = rejectIfErased(tenantId, prior.evidenceId());
        if (erased != null) {
            return erased;
        }
        Outcome<Transcript> found = transcriptStore.find(tenantId, interviewId, priorTranscriptKey);
        if (!(found instanceof Outcome.Ok<Transcript> existingOk)) {
            if (found instanceof Outcome.Fail<Transcript> storeFail
                    && storeFail.code() != OutcomeCode.NOT_FOUND) {
                return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "transkript deposu okunamadı (fail-closed)");
            }
            emitAppendFailed(tenantId, "replay_store_missing");
            return Outcome.fail(OutcomeCode.INVALID,
                    "ledger kanıtı var ama transkript deposunda karşılığı yok — bütünlük hatası (operasyonel müdahale gerekir)");
        }
        // Pointer-bütünlüğü: store'daki transcript GERÇEKTEN bu kanıtın içeriği mi?
        // Lexical hash yeniden hesaplanır ve prior.contentHash ile eşleşmek ZORUNDA
        // (payload'daki key başka mevcut transkripte yönlendirilmişse burada düşer).
        Transcript existing = existingOk.value();
        if (!existing.sourceObjectKey().equals(priorSourceKey)
                || !existing.language().equals(priorLanguage)
                || existing.segments().size() != priorCount
                || !sha256Hex(lexicalConcat(existing)).equals(prior.contentHash())) {
            return replayIntegrityFail(tenantId,
                    "store'daki transkript ledger kanıtının içeriğiyle uyuşmuyor (pointer-bütünlük hatası)");
        }
        // Erase/replay yarışı: store okuması ile receipt arasına giren silme, tombstone
        // append'iyle görünür olur — receipt öncesi SON authoritative kontrol (dar
        // pencereyi küçültür; portlar arası mutlak atomiklik iddiası DEĞİLDİR).
        Outcome<TranscriptionReceipt> erasedLate = rejectIfErased(tenantId, prior.evidenceId());
        if (erasedLate != null) {
            return erasedLate;
        }
        emit(tenantId, APPEND_DEDUPLICATED_EVENT, "evidence", "info", PiiClass.ID_ONLY,
                Map.of("ledger_entry_ref", prior.evidenceId().value(), "actor_ref", actorId.value()));
        return Outcome.ok(new TranscriptionReceipt(
                priorTranscriptKey, prior.evidenceId().value(), existing.segments().size()));
    }

    private Outcome<TranscriptionReceipt> replayIntegrityFail(TenantId tenantId, String detail) {
        emitAppendFailed(tenantId, "replay_integrity_mismatch");
        return Outcome.fail(OutcomeCode.INVALID,
                detail + " (bütünlük hatası; operasyonel müdahale gerekir)");
    }

    /** Tombstone VAR → erased-reject Outcome'u; YOK → null (devam); okuma hatası → fail-closed. */
    private Outcome<TranscriptionReceipt> rejectIfErased(TenantId tenantId, com.ats.kernel.Ids.EvidenceId evidenceId) {
        Outcome<LedgerEntry> tombstone = ledger.findTombstoneForEvidence(tenantId, evidenceId);
        if (tombstone instanceof Outcome.Ok<LedgerEntry>) {
            emitAppendFailed(tenantId, "target_erased");
            return Outcome.fail(OutcomeCode.INVALID,
                    "Bu içerik daha önce silme kapsamına alınmış; aynı içerik bu interview kapsamında yeniden işlenemez.");
        }
        if (tombstone instanceof Outcome.Fail<LedgerEntry> fail && fail.code() != OutcomeCode.NOT_FOUND) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "erasure durumu okunamadı (fail-closed)");
        }
        return null;
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
