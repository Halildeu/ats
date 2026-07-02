package com.ats.consent;

import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;

/** Tenant-scoped consent/permission portu (persistence sonraki slice; slice-1 in-memory). */
public interface ConsentStore {

    Outcome<Void> put(RecordingPermission permission);

    /** Kayıt yoksa NOT_FOUND — çağıran fail-closed karar verir (ConsentGate). */
    Outcome<RecordingPermission> find(TenantId tenantId, InterviewId interviewId);
}
