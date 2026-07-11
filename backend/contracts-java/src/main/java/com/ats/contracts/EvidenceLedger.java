package com.ats.contracts;

import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.EvidenceId;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.JsonValue;
import com.ats.kernel.Outcome;
import java.util.List;

/**
 * ATS-0001 #2 EvidenceLedger (TS mirror) — WORM append-only (ADR-0003).
 * update/delete/overwrite/purge YOK; silme ayrı append-only tombstone event'i.
 * Tip/shape parity: TS contracts/ ile hizalı (PARITY.md).
 */
public interface EvidenceLedger {

    /**
     * Tombstone satırının event tipi — silme yerine append-only tombstone (ADR-0003).
     * 39d-7a-fix: adapter-private sabitten porta taşındı; erasure-durumu sorgusu
     * ({@link #findTombstoneForEvidence}) kontrat-düzeyi bu tipe bağlanır.
     */
    String TOMBSTONE_EVENT_TYPE = "evidence.tombstoned";

    /** occurredAt ISO-8601 string (Date değil); payload derin-immutable JSON (JsonValue). */
    record EvidenceEvent(
            TenantId tenantId,
            ActorId actorId,
            InterviewId interviewId,
            String eventType,
            String occurredAt,
            String idempotencyKey,
            String contentHash,
            JsonValue.JsonObject payload) {}

    /**
     * LedgerEntry TS canonical ile aynı düz (flat) shape: EvidenceEvent alanları +
     * ledger alanları (TS `LedgerEntry extends EvidenceEvent` karşılığı).
     */
    record LedgerEntry(
            TenantId tenantId,
            ActorId actorId,
            InterviewId interviewId,
            String eventType,
            String occurredAt,
            String idempotencyKey,
            String contentHash,
            JsonValue.JsonObject payload,
            EvidenceId evidenceId,
            long sequence,
            String previousHash,
            String entryHash) {}

    /** TS LedgerListFilter mirror — alanlar nullable (opsiyonel filtre). */
    record LedgerListFilter(InterviewId interviewId, String eventType) {}

    Outcome<LedgerEntry> append(EvidenceEvent event);

    /** Silme yerine append-only tombstone (ADR-0003 unlinkable tombstone). */
    Outcome<LedgerEntry> appendTombstoneEvent(
            TenantId tenantId, ActorId actorId, InterviewId interviewId,
            EvidenceId targetEvidenceId, String reason);

    Outcome<LedgerEntry> getById(TenantId tenantId, EvidenceId id);

    /** filter null olabilir (TS opsiyonel filter); alanları null ise o kriter uygulanmaz. */
    Outcome<List<LedgerEntry>> list(TenantId tenantId, LedgerListFilter filter);

    /**
     * 39d-7a-fix: tenant-scoped idempotency-key ile TEK satır — servis-katmanı idempotent
     * replay'in (duplicate append'te MEVCUT kanıtla cevap) okuma yüzeyi. Unique constraint
     * (tenant_id, idempotency_key) kontratının port karşılığı. NOT_FOUND = satır yok
     * (hata değil; çağıran normal append yoluna devam eder).
     *
     * <p>Default implementasyon {@link #list} üzerinden tarar (in-memory/test adapter'ları
     * için semantik-eşdeğer); kalıcı adapter'lar indexli sorguyla override eder.
     */
    default Outcome<LedgerEntry> findByIdempotencyKey(TenantId tenantId, String idempotencyKey) {
        if (tenantId == null || idempotencyKey == null || idempotencyKey.isBlank()) {
            return Outcome.fail(com.ats.kernel.OutcomeCode.INVALID, "tenant/idempotencyKey zorunlu");
        }
        Outcome<List<LedgerEntry>> all = list(tenantId, null);
        if (!(all instanceof Outcome.Ok<List<LedgerEntry>> ok)) {
            Outcome.Fail<List<LedgerEntry>> fail = (Outcome.Fail<List<LedgerEntry>>) all;
            return Outcome.fail(fail.code(), fail.reason());
        }
        return ok.value().stream()
                .filter(e -> idempotencyKey.equals(e.idempotencyKey()))
                .findFirst()
                .<Outcome<LedgerEntry>>map(Outcome::ok)
                .orElseGet(() -> Outcome.fail(
                        com.ats.kernel.OutcomeCode.NOT_FOUND, "ledger entry yok (tenant-scope)"));
    }

    /**
     * 39d-7a-fix: hedef evidence için tombstone satırı — AUTHORITATIVE erasure-durumu sorgusu
     * (Codex 019f50b7: "store'da yok = erasure" çıkarımı güvensiz; tombstone kanıtı açık
     * sorgulanır). NOT_FOUND = tombstone yok. Replay yolunda receipt dönmeden önceki SON
     * kontrol budur (erase/replay yarışı: erase tombstone-append'iyle görünür olur).
     */
    default Outcome<LedgerEntry> findTombstoneForEvidence(TenantId tenantId, EvidenceId targetEvidenceId) {
        if (tenantId == null || targetEvidenceId == null) {
            return Outcome.fail(com.ats.kernel.OutcomeCode.INVALID, "tenant/targetEvidenceId zorunlu");
        }
        Outcome<List<LedgerEntry>> all = list(tenantId, new LedgerListFilter(null, TOMBSTONE_EVENT_TYPE));
        if (!(all instanceof Outcome.Ok<List<LedgerEntry>> ok)) {
            Outcome.Fail<List<LedgerEntry>> fail = (Outcome.Fail<List<LedgerEntry>>) all;
            return Outcome.fail(fail.code(), fail.reason());
        }
        return ok.value().stream()
                .filter(e -> e.payload().values().get("target_evidence_id")
                        instanceof JsonValue.JsonString js && js.value().equals(targetEvidenceId.value()))
                .findFirst()
                .<Outcome<LedgerEntry>>map(Outcome::ok)
                .orElseGet(() -> Outcome.fail(
                        com.ats.kernel.OutcomeCode.NOT_FOUND, "tombstone yok (tenant-scope)"));
    }
}
