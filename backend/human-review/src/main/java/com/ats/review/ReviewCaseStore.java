package com.ats.review;

import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;

/** Tenant-scoped vaka deposu portu (persistence sonraki slice; slice-4 in-memory). */
public interface ReviewCaseStore {

    Outcome<String> put(ReviewCase reviewCase);

    Outcome<ReviewCase> find(TenantId tenantId, InterviewId interviewId, String caseKey);

    /** Geçiş sonrası aynı anahtara yazım; ledger-fail telafisinde önceki state'e geri dönüş için de kullanılır. */
    Outcome<Void> save(TenantId tenantId, String caseKey, ReviewCase reviewCase);
}
