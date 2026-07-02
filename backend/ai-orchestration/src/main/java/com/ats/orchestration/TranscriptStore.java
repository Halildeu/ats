package com.ats.orchestration;

import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;

/** Tenant-scoped transkript deposu portu (persistence sonraki slice; slice-2 in-memory). */
public interface TranscriptStore {

    Outcome<String> put(Transcript transcript);

    Outcome<Transcript> find(TenantId tenantId, InterviewId interviewId, String transcriptKey);

    /** Fail-closed telafi için (ledger append başarısızsa transkript geri alınır). */
    Outcome<Void> delete(TenantId tenantId, String transcriptKey);
}
