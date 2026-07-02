package com.ats.consent;

import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;

/**
 * ATS-0003 recording_permission_state (data-lifecycle sınıfı). Kayıt-izni durumu;
 * subjectRef OPAK referanstır (ham PII değil — pseudonymized düzlem).
 */
public record RecordingPermission(
        TenantId tenantId,
        InterviewId interviewId,
        String subjectRef,
        PermissionState state,
        String recordedAtIso) {

    public enum PermissionState {
        GRANTED,
        DENIED,
        WITHDRAWN
    }
}
