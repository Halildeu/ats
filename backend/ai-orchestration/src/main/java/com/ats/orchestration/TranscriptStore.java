package com.ats.orchestration;

import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import java.util.List;

/** Tenant-scoped transkript deposu portu (persistence sonraki slice; slice-2 in-memory). */
public interface TranscriptStore {

    /** Pointer-only liste girdisi — content (segment metni) TAŞIMAZ; key + minimal meta. */
    record TranscriptSummary(String transcriptKey, String language, int segmentCount) {}

    Outcome<String> put(Transcript transcript);

    Outcome<Transcript> find(TenantId tenantId, InterviewId interviewId, String transcriptKey);

    /** Mülakatın transkript listesi (tenant-scoped; UI seçim yüzeyi). Boş liste = Ok([]). */
    Outcome<List<TranscriptSummary>> listByInterview(TenantId tenantId, InterviewId interviewId);

    /** Fail-closed telafi için (ledger append başarısızsa transkript geri alınır). */
    Outcome<Void> delete(TenantId tenantId, String transcriptKey);
}
