package com.ats.export;

import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/** Slice-5 local adapter; anahtar tenant-önekli (cross-tenant erişim yapısal olarak ayrık). */
public final class InMemoryExportArtifactStore implements ExportArtifactStore {

    private final Map<String, String> artifacts = new ConcurrentHashMap<>();
    private final AtomicLong seq = new AtomicLong();

    @Override
    public Outcome<String> put(TenantId tenantId, InterviewId interviewId, String canonicalPacketJson) {
        if (tenantId == null || interviewId == null || canonicalPacketJson == null || canonicalPacketJson.isBlank()) {
            return Outcome.fail(OutcomeCode.INVALID, "tenant/interview/packet zorunlu");
        }
        String key = interviewId.value() + "/pkt-" + seq.incrementAndGet();
        artifacts.put(scoped(tenantId, key), canonicalPacketJson);
        return Outcome.ok(key);
    }

    @Override
    public Outcome<String> find(TenantId tenantId, InterviewId interviewId, String artifactKey) {
        String found = artifacts.get(scoped(tenantId, artifactKey));
        if (found == null || !artifactKey.startsWith(interviewId.value() + "/")) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "artifact yok (tenant-scope)");
        }
        return Outcome.ok(found);
    }

    @Override
    public Outcome<Void> delete(TenantId tenantId, String artifactKey) {
        artifacts.remove(scoped(tenantId, artifactKey));
        return Outcome.ok(null);
    }

    public int size() {
        return artifacts.size();
    }

    private static String scoped(TenantId t, String key) {
        return t.value() + "::" + key;
    }
}
