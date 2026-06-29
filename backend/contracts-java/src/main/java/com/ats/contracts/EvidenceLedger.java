package com.ats.contracts;

import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.EvidenceId;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import java.util.List;
import java.util.Map;

/**
 * ATS-0001 #2 EvidenceLedger (TS mirror) — WORM append-only (ADR-0003).
 * update/delete/overwrite/purge YOK; silme ayrı append-only tombstone event'i.
 */
public interface EvidenceLedger {

    /** occurredAt ISO-8601 string (Date değil); payload JSON-uyumlu (Map<String,Object>). */
    record EvidenceEvent(
            TenantId tenantId,
            ActorId actorId,
            InterviewId interviewId,
            String eventType,
            String occurredAt,
            String idempotencyKey,
            String contentHash,
            Map<String, Object> payload) {}

    record LedgerEntry(
            EvidenceId evidenceId,
            long sequence,
            String previousHash,
            String entryHash,
            EvidenceEvent event) {}

    Outcome<LedgerEntry> append(EvidenceEvent event);

    /** Silme yerine append-only tombstone (ADR-0003 unlinkable tombstone). */
    Outcome<LedgerEntry> appendTombstoneEvent(
            TenantId tenantId, ActorId actorId, InterviewId interviewId,
            EvidenceId targetEvidenceId, String reason);

    Outcome<LedgerEntry> getById(TenantId tenantId, EvidenceId id);

    Outcome<List<LedgerEntry>> list(TenantId tenantId, String eventTypeOrNull);
}
