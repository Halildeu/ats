package com.ats.dsr;

import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;

/** Tenant-scoped DSAR kayıt deposu portu (persistence sonraki slice; slice-6 in-memory). */
public interface DsarStore {

    Outcome<String> put(DsarRequest request);

    Outcome<DsarRequest> find(TenantId tenantId, InterviewId interviewId, String dsarKey);

    Outcome<Void> save(TenantId tenantId, String dsarKey, DsarRequest request);
}
