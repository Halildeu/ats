package com.ats.dsr;

import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;

/**
 * Bir DSAR için silinecek kapsamı sunucu truth'undan çözer ve aynı transaction içinde
 * interview'ü yeni content yazımına terminal olarak mühürler. Caller-authored key listesi bu
 * portun girdisi değildir. Aynı DSAR ile replay idempotent, farklı DSAR ile ikinci mühür conflict'tir.
 */
public interface ErasureScopeResolver {

    Outcome<ErasureScope> resolveAndSealDsr(
            TenantId tenantId, InterviewId interviewId, String dsarKey);
}
