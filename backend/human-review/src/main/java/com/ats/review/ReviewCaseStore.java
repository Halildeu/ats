package com.ats.review;

import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import java.util.List;

/** Tenant-scoped vaka deposu portu (persistence sonraki slice; slice-4 in-memory). */
public interface ReviewCaseStore {

    /** Pointer-only liste girdisi — ref GÖVDELERİ taşımaz; key + state. */
    record CaseSummary(String caseKey, ReviewState state) {}

    Outcome<String> put(ReviewCase reviewCase);

    Outcome<ReviewCase> find(TenantId tenantId, InterviewId interviewId, String caseKey);

    /** Mülakatın vaka listesi (tenant-scoped; UI devam-etme yüzeyi). Boş liste = Ok([]). */
    Outcome<List<CaseSummary>> listByInterview(TenantId tenantId, InterviewId interviewId);

    /** Geçiş sonrası aynı anahtara yazım; ledger-fail telafisinde önceki state'e geri dönüş için de kullanılır. */
    Outcome<Void> save(TenantId tenantId, String caseKey, ReviewCase reviewCase);
}
