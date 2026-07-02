package com.ats.consent;

import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** Slice-1 local adapter. Anahtar tenant+interview bileşik → cross-tenant erişim yapısal olarak imkânsız. */
public final class InMemoryConsentStore implements ConsentStore {

    private final Map<String, RecordingPermission> byTenantAndInterview = new ConcurrentHashMap<>();

    @Override
    public Outcome<Void> put(RecordingPermission permission) {
        if (permission == null || permission.tenantId() == null || permission.interviewId() == null
                || permission.state() == null || permission.subjectRef() == null || permission.recordedAtIso() == null) {
            return Outcome.fail(OutcomeCode.INVALID, "permission alanları zorunlu (state/subjectRef/recordedAtIso dahil)");
        }
        byTenantAndInterview.put(key(permission.tenantId(), permission.interviewId()), permission);
        return Outcome.ok(null);
    }

    @Override
    public Outcome<RecordingPermission> find(TenantId tenantId, InterviewId interviewId) {
        if (tenantId == null || interviewId == null) {
            return Outcome.fail(OutcomeCode.INVALID, "tenantId/interviewId zorunlu (tenant-scope)");
        }
        RecordingPermission found = byTenantAndInterview.get(key(tenantId, interviewId));
        if (found == null) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "recording_permission_state kaydı yok");
        }
        return Outcome.ok(found);
    }

    private static String key(TenantId t, InterviewId i) {
        return t.value() + "::" + i.value();
    }
}
