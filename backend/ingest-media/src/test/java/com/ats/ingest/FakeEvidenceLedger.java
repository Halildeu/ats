package com.ats.ingest;

import com.ats.contracts.EvidenceLedger;
import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.EvidenceId;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.util.ArrayList;
import java.util.List;

/**
 * Test FAKE'i (ATS-0016 slice-1: gerçek WORM implementasyonu sonraki slice).
 * Ürettiği ref'ler "fake-" önekli — gerçek ledger-ref İDDİA EDİLMEZ.
 */
final class FakeEvidenceLedger implements EvidenceLedger {

    private final List<LedgerEntry> entries = new ArrayList<>();

    @Override
    public Outcome<LedgerEntry> append(EvidenceEvent e) {
        long seq = entries.size() + 1;
        LedgerEntry entry = new LedgerEntry(
                e.tenantId(), e.actorId(), e.interviewId(), e.eventType(), e.occurredAt(),
                e.idempotencyKey(), e.contentHash(), e.payload(),
                new EvidenceId("fake-ev-" + seq), seq,
                seq == 1 ? "fake-genesis" : "fake-hash-" + (seq - 1), "fake-hash-" + seq);
        entries.add(entry);
        return Outcome.ok(entry);
    }

    @Override
    public Outcome<LedgerEntry> appendTombstoneEvent(
            TenantId tenantId, ActorId actorId, InterviewId interviewId, EvidenceId target, String reason) {
        return Outcome.fail(OutcomeCode.UNSUPPORTED_IN_GATE, "slice-1 fake: tombstone sonraki slice");
    }

    @Override
    public Outcome<LedgerEntry> getById(TenantId tenantId, EvidenceId id) {
        return entries.stream()
                .filter(en -> en.tenantId().equals(tenantId) && en.evidenceId().equals(id))
                .findFirst()
                .<Outcome<LedgerEntry>>map(Outcome::ok)
                .orElse(Outcome.fail(OutcomeCode.NOT_FOUND, "yok"));
    }

    @Override
    public Outcome<List<LedgerEntry>> list(TenantId tenantId, LedgerListFilter filter) {
        return Outcome.ok(entries.stream().filter(en -> en.tenantId().equals(tenantId)).toList());
    }

    List<LedgerEntry> entries() {
        return List.copyOf(entries);
    }
}
