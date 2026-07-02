package com.ats.ingest;

import com.ats.consent.ConsentGate;
import com.ats.contracts.EvidenceLedger;
import com.ats.contracts.EvidenceLedger.EvidenceEvent;
import com.ats.contracts.EvidenceLedger.LedgerEntry;
import com.ats.ingest.MalwareScanPort.ScanResult;
import com.ats.ingest.ObjectStorePort.StoredObjectRef;
import com.ats.kernel.JsonValue;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import com.ats.ops.OperationalEvent;
import com.ats.ops.OperationalEventSink;
import com.ats.ops.PiiClass;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Map;

/**
 * PRD-P1 F1 upload-ingest dikey dilimi (ATS-0016 slice-1, port-only):
 * consent-gate (fail-closed) → içerik-tarama → object-store → WORM ledger append.
 * Ledger append başarısızsa yazılan obje GERİ ALINIR ve ingest FAIL döner
 * (ledger-unavailable → fail-closed; kanıtsız medya bırakılmaz).
 * Two-plane: iş gerçeği ledger'da; operasyonel event yalnız opak ref taşır.
 */
public final class IngestService {

    static final String SCAN_REJECTED_EVENT = "evidence.attachment.scan_rejected";
    static final String APPEND_SUCCEEDED_EVENT = "evidence.append.succeeded";
    static final String APPEND_FAILED_EVENT = "evidence.append.failed";
    static final String LEDGER_EVENT_TYPE = "recording.ingested";

    public record IngestReceipt(String objectKey, String evidenceId, long ledgerSequence) {}

    private final ConsentGate consentGate;
    private final MalwareScanPort scanner;
    private final ObjectStorePort objectStore;
    private final EvidenceLedger ledger;
    private final OperationalEventSink sink;

    public IngestService(
            ConsentGate consentGate,
            MalwareScanPort scanner,
            ObjectStorePort objectStore,
            EvidenceLedger ledger,
            OperationalEventSink sink) {
        this.consentGate = consentGate;
        this.scanner = scanner;
        this.objectStore = objectStore;
        this.ledger = ledger;
        this.sink = sink;
    }

    public Outcome<IngestReceipt> uploadRecording(UploadRequest request, byte[] payload) {
        Outcome<Void> consent = consentGate.requireRecordingAllowed(request.tenantId(), request.interviewId());
        if (consent instanceof Outcome.Fail<Void> denied) {
            return Outcome.fail(denied.code(), denied.reason());
        }

        Outcome<ScanResult> scanned = scanner.scan(payload);
        if (!(scanned instanceof Outcome.Ok<ScanResult> scanOk)) {
            return Outcome.fail(OutcomeCode.INVALID, "tarama koşulamadı (fail-closed)");
        }
        if (scanOk.value() == ScanResult.REJECTED) {
            emit(request, SCAN_REJECTED_EVENT, "error", PiiClass.NONE, Map.of("reason_code", "malware_signature"));
            return Outcome.fail(OutcomeCode.INVALID, "içerik-tarama reddi (fail-closed)");
        }

        // Content-addressed OPAK anahtar (Codex #48 blocker-1/2): filename (PII taşıyabilir)
        // anahtara/ledger'a GİRMEZ; aynı-isim-farklı-içerik farklı anahtara düşer (overwrite yok),
        // aynı-içerik retry'ı byte-identical idempotent yazımdır.
        String contentHash = sha256Hex(payload);
        String key = request.interviewId().value() + "/rec-" + contentHash;
        Outcome<StoredObjectRef> stored = objectStore.put(request.tenantId(), key, payload);
        if (!(stored instanceof Outcome.Ok<StoredObjectRef> storedOk)) {
            return Outcome.fail(OutcomeCode.INVALID, "medya deposuna yazılamadı");
        }

        Outcome<LedgerEntry> appended = ledger.append(new EvidenceEvent(
                request.tenantId(),
                request.actorId(),
                request.interviewId(),
                LEDGER_EVENT_TYPE,
                request.occurredAtIso(),
                request.tenantId().value() + ":" + request.interviewId().value() + ":" + contentHash,
                contentHash,
                JsonValue.object(Map.of(
                        "object_key", JsonValue.of(key),
                        "content_type", JsonValue.of(request.contentType()),
                        "size_bytes", JsonValue.of((double) storedOk.value().sizeBytes())))));
        if (!(appended instanceof Outcome.Ok<LedgerEntry> entryOk)) {
            // fail-closed telafi: kanıtsız medya bırakılmaz; telafinin KENDİSİ fail olursa yutulmaz (Codex #48 major-3)
            Outcome<Void> rolledBack = objectStore.delete(request.tenantId(), key);
            if (rolledBack.isOk()) {
                emit(request, APPEND_FAILED_EVENT, "error", PiiClass.ID_ONLY, Map.of("reason_code", "ledger_unavailable"));
                return Outcome.fail(OutcomeCode.NOT_CONFIGURED,
                        "evidence ledger append başarısız (fail-closed; medya geri alındı)");
            }
            emit(request, APPEND_FAILED_EVENT, "error", PiiClass.ID_ONLY,
                    Map.of("reason_code", "ledger_unavailable_rollback_failed"));
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED,
                    "evidence ledger append başarısız VE telafi silmesi başarısız — medya kanıtsız kalmış olabilir (operasyonel müdahale gerekir)");
        }

        LedgerEntry entry = entryOk.value();
        emit(request, APPEND_SUCCEEDED_EVENT, "info", PiiClass.ID_ONLY,
                Map.of("ledger_entry_ref", entry.evidenceId().value()));
        return Outcome.ok(new IngestReceipt(key, entry.evidenceId().value(), entry.sequence()));
    }

    private void emit(UploadRequest request, String eventTypeId, String severity, PiiClass pii, Map<String, String> extras) {
        OperationalEvent.create(request.tenantId(), eventTypeId, "evidence", severity, pii, extras)
                .asOptional()
                .ifPresent(sink::emit);
    }

    private static String sha256Hex(byte[] payload) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(payload));
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 mevcut olmalı", e);
        }
    }
}
