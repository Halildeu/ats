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
}
