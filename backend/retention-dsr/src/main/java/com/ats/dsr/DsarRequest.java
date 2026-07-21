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

    public DsarRequest {
        if (tenantId == null || interviewId == null || state == null) {
            throw new IllegalArgumentException("DSAR tenant/interview/state zorunlu (fail-closed)");
        }
        if (!DsarInputPolicy.validSubjectRef(subjectRef)) {
            throw new IllegalArgumentException(
                    "DSAR subjectRef yalnız prefixed opak ref veya UUIDv4 olabilir (fail-closed)");
        }
        if (!DsarInputPolicy.validReasonCode(reasonCode)) {
            throw new IllegalArgumentException(
                    "DSAR reasonCode yalnız desteklenen kapalı erasure kodu olabilir (fail-closed)");
        }
    }

    public DsarRequest fulfilled() {
        return new DsarRequest(tenantId, interviewId, subjectRef, reasonCode, State.FULFILLED);
    }
}
