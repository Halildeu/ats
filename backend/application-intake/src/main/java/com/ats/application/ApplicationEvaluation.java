package com.ats.application;

import com.ats.kernel.Ids.TenantId;
import java.util.List;

/**
 * Recruiter tarafından gönderilmiş, immutable ve yalnız iş-ilişkili insan
 * değerlendirmesi. Rating bir model skoru değildir; otomatik stage/karar
 * üretmez. Düzeltme predecessor-linked yeni revision ile yapılır.
 */
public record ApplicationEvaluation(
        TenantId tenantId,
        String evaluationId,
        String publicRef,
        String actorRef,
        String policyVersion,
        boolean jobRelatednessConfirmed,
        Recommendation recommendation,
        List<Criterion> criteria,
        String summary,
        String predecessorEvaluationId,
        int revision,
        String createdAt) {

    public ApplicationEvaluation {
        criteria = criteria == null ? List.of() : List.copyOf(criteria);
    }

    public enum Recommendation {
        ADVANCE,
        HOLD,
        NO_HIRE
    }

    public record Criterion(String key, String label, int rating, String evidence) {}
}
