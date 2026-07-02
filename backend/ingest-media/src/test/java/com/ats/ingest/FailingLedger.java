package com.ats.ingest;

import com.ats.contracts.EvidenceLedger;
import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.EvidenceId;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.util.List;

/** Ledger-unavailable senaryosu test impl'i (fail-closed davranış doğrulaması için). */
final class FailingLedger implements EvidenceLedger {

    @Override
    public Outcome<LedgerEntry> append(EvidenceEvent event) {
        return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "ledger unavailable (test)");
    }

    @Override
    public Outcome<LedgerEntry> appendTombstoneEvent(
            TenantId tenantId, ActorId actorId, InterviewId interviewId, EvidenceId target, String reason) {
        return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "ledger unavailable (test)");
    }

    @Override
    public Outcome<LedgerEntry> getById(TenantId tenantId, EvidenceId id) {
        return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "ledger unavailable (test)");
    }

    @Override
    public Outcome<List<LedgerEntry>> list(TenantId tenantId, LedgerListFilter filter) {
        return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "ledger unavailable (test)");
    }
}
