package com.ats.export;

import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;

/** Tenant-scoped export-artifact deposu portu (persistence/PDF/secure-link P1 residual; slice-5 in-memory JSON). */
public interface ExportArtifactStore {

    Outcome<String> put(TenantId tenantId, InterviewId interviewId, String canonicalPacketJson);

    Outcome<String> find(TenantId tenantId, InterviewId interviewId, String artifactKey);

    /** Fail-closed telafi için (ledger append başarısızsa artifact geri alınır). */
    Outcome<Void> delete(TenantId tenantId, String artifactKey);
}
