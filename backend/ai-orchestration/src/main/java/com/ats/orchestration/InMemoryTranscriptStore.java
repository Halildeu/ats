package com.ats.orchestration;

import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/** Slice-2 local adapter; anahtar tenant-önekli (cross-tenant erişim yapısal olarak ayrık). */
public final class InMemoryTranscriptStore implements TranscriptStore {

    private final Map<String, Transcript> transcripts = new ConcurrentHashMap<>();
    private final AtomicLong seq = new AtomicLong();

    @Override
    public Outcome<String> put(Transcript t) {
        if (t == null || t.tenantId() == null || t.interviewId() == null) {
            return Outcome.fail(OutcomeCode.INVALID, "transcript/tenantId/interviewId zorunlu");
        }
        String key = t.interviewId().value() + "/tr-" + seq.incrementAndGet();
        transcripts.put(scoped(t.tenantId(), key), t);
        return Outcome.ok(key);
    }

    @Override
    public Outcome<Transcript> find(TenantId tenantId, InterviewId interviewId, String transcriptKey) {
        Transcript found = transcripts.get(scoped(tenantId, transcriptKey));
        if (found == null || !found.interviewId().equals(interviewId)) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "transkript yok (tenant-scope)");
        }
        return Outcome.ok(found);
    }

    @Override
    public Outcome<Void> delete(TenantId tenantId, String transcriptKey) {
        transcripts.remove(scoped(tenantId, transcriptKey));
        return Outcome.ok(null);
    }

    public int size() {
        return transcripts.size();
    }

    private static String scoped(TenantId t, String key) {
        return t.value() + "::" + key;
    }
}
