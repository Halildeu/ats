package com.ats.orchestration;

import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;

/** Tenant-scoped citation deposu portu (persistence sonraki slice; slice-3 in-memory). */
public interface CitationStore {

    Outcome<String> put(Citation citation);

    Outcome<Citation> find(TenantId tenantId, InterviewId interviewId, String citationKey);

    /** Fail-closed telafi için (ledger append başarısızsa kayıt geri alınır). */
    Outcome<Void> delete(TenantId tenantId, String citationKey);
}
