package com.ats.orchestration;

import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/** Slice-3 local adapter; anahtar tenant-önekli (cross-tenant erişim yapısal olarak ayrık). */
public final class InMemoryCitationStore implements CitationStore {

    private final Map<String, Citation> citations = new ConcurrentHashMap<>();
    private final AtomicLong seq = new AtomicLong();

    @Override
    public Outcome<String> put(Citation c) {
        if (c == null || c.tenantId() == null || c.interviewId() == null) {
            return Outcome.fail(OutcomeCode.INVALID, "citation/tenantId/interviewId zorunlu");
        }
        String key = c.interviewId().value() + "/cit-" + seq.incrementAndGet();
        citations.put(scoped(c.tenantId(), key), c);
        return Outcome.ok(key);
    }

    @Override
    public Outcome<Citation> find(TenantId tenantId, InterviewId interviewId, String citationKey) {
        Citation found = citations.get(scoped(tenantId, citationKey));
        if (found == null || !found.interviewId().equals(interviewId)) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "citation yok (tenant-scope)");
        }
        return Outcome.ok(found);
    }

    @Override
    public Outcome<Void> delete(TenantId tenantId, String citationKey) {
        citations.remove(scoped(tenantId, citationKey));
        return Outcome.ok(null);
    }

    public int size() {
        return citations.size();
    }

    private static String scoped(TenantId t, String key) {
        return t.value() + "::" + key;
    }
}
