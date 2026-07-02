package com.ats.dsr;

import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/** Slice-6 local adapter; anahtar tenant-önekli (cross-tenant erişim yapısal olarak ayrık). */
public final class InMemoryDsarStore implements DsarStore {

    private final Map<String, DsarRequest> requests = new ConcurrentHashMap<>();
    private final AtomicLong seq = new AtomicLong();

    @Override
    public Outcome<String> put(DsarRequest r) {
        if (r == null || r.tenantId() == null || r.interviewId() == null) {
            return Outcome.fail(OutcomeCode.INVALID, "dsar/tenantId/interviewId zorunlu");
        }
        String key = r.interviewId().value() + "/dsar-" + seq.incrementAndGet();
        requests.put(scoped(r.tenantId(), key), r);
        return Outcome.ok(key);
    }

    @Override
    public Outcome<DsarRequest> find(TenantId tenantId, InterviewId interviewId, String dsarKey) {
        DsarRequest found = requests.get(scoped(tenantId, dsarKey));
        if (found == null || !found.interviewId().equals(interviewId)) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "dsar yok (tenant-scope)");
        }
        return Outcome.ok(found);
    }

    @Override
    public Outcome<Void> save(TenantId tenantId, String dsarKey, DsarRequest request) {
        if (!requests.containsKey(scoped(tenantId, dsarKey))) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "dsar yok (tenant-scope)");
        }
        requests.put(scoped(tenantId, dsarKey), request);
        return Outcome.ok(null);
    }

    private static String scoped(TenantId t, String key) {
        return t.value() + "::" + key;
    }
}
