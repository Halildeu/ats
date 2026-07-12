package com.ats.review;

import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/** Slice-4 local adapter; anahtar tenant-önekli (cross-tenant erişim yapısal olarak ayrık). */
public final class InMemoryReviewCaseStore implements ReviewCaseStore {

    private final Map<String, ReviewCase> cases = new ConcurrentHashMap<>();
    private final AtomicLong seq = new AtomicLong();

    @Override
    public Outcome<String> put(ReviewCase c) {
        if (c == null || c.tenantId() == null || c.interviewId() == null) {
            return Outcome.fail(OutcomeCode.INVALID, "case/tenantId/interviewId zorunlu");
        }
        String key = c.interviewId().value() + "/case-" + seq.incrementAndGet();
        cases.put(scoped(c.tenantId(), key), c);
        return Outcome.ok(key);
    }

    @Override
    public Outcome<ReviewCase> find(TenantId tenantId, InterviewId interviewId, String caseKey) {
        ReviewCase found = cases.get(scoped(tenantId, caseKey));
        if (found == null || !found.interviewId().equals(interviewId)) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "vaka yok (tenant-scope)");
        }
        return Outcome.ok(found);
    }

    @Override
    public Outcome<java.util.List<CaseSummary>> listByInterview(TenantId tenantId, InterviewId interviewId) {
        String prefix = tenantId.value() + "::";
        java.util.List<CaseSummary> out = new java.util.ArrayList<>();
        for (Map.Entry<String, ReviewCase> e : cases.entrySet()) {
            if (e.getKey().startsWith(prefix) && e.getValue().interviewId().equals(interviewId)) {
                out.add(new CaseSummary(e.getKey().substring(prefix.length()), e.getValue().state()));
            }
        }
        // ConcurrentHashMap sırasızdır — deterministik çıktı için key'e göre sırala
        out.sort(java.util.Comparator.comparing(CaseSummary::caseKey));
        return Outcome.ok(out);
    }

    @Override
    public Outcome<Void> save(TenantId tenantId, String caseKey, ReviewCase reviewCase) {
        if (!cases.containsKey(scoped(tenantId, caseKey))) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "vaka yok (tenant-scope)");
        }
        cases.put(scoped(tenantId, caseKey), reviewCase);
        return Outcome.ok(null);
    }

    @Override
    public Outcome<ExportTransitionResult> markExportedIfFinalized(
            TenantId tenantId, InterviewId interviewId, String caseKey, String exportArtifactRef) {
        if (exportArtifactRef == null || exportArtifactRef.isBlank()) {
            return Outcome.fail(OutcomeCode.INVALID, "export_artifact_ref zorunlu");
        }
        String k = scoped(tenantId, caseKey);
        // ConcurrentHashMap.compute = per-key atomik (PG CAS'ının in-memory aynası).
        final Object[] verdict = new Object[1];
        cases.compute(k, (key, current) -> {
            if (current == null || !current.interviewId().equals(interviewId)) {
                verdict[0] = Outcome.fail(OutcomeCode.NOT_FOUND, "vaka yok (tenant-scope)");
                return current;
            }
            if (current.state() == ReviewState.FINALIZED) {
                verdict[0] = Outcome.ok(ExportTransitionResult.TRANSITIONED);
                return current.withExportArtifact(exportArtifactRef).with(ReviewState.EXPORTED);
            }
            if (current.state() == ReviewState.EXPORTED) {
                verdict[0] = exportArtifactRef.equals(current.exportArtifactRef())
                        ? Outcome.ok(ExportTransitionResult.ALREADY_EXPORTED_SAME_ARTIFACT)
                        : Outcome.ok(ExportTransitionResult.INTEGRITY_CONFLICT);
                return current;
            }
            verdict[0] = Outcome.fail(OutcomeCode.INVALID,
                    "geçersiz repair-geçişi: " + current.state() + " → EXPORTED (fail-closed)");
            return current;
        });
        @SuppressWarnings("unchecked")
        Outcome<ExportTransitionResult> out = (Outcome<ExportTransitionResult>) verdict[0];
        return out;
    }

    public int size() {
        return cases.size();
    }

    private static String scoped(TenantId t, String key) {
        return t.value() + "::" + key;
    }
}
