package com.ats.dsr;

import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;

/**
 * DSAR kayıt satırı (data-lifecycle `dsar_request_log` sınıfı; id-only düzlem —
 * talep GÖVDESİ/kimlik içeriği burada tutulmaz, yalnız opak subject-ref + reason kodu).
 */
public record DsarRequest(
        TenantId tenantId,
        InterviewId interviewId,
        String subjectRef,
        String reasonCode,
        State state) {

    public enum State { RECEIVED, FULFILLED }

    public DsarRequest fulfilled() {
        return new DsarRequest(tenantId, interviewId, subjectRef, reasonCode, State.FULFILLED);
    }
}
