package com.ats.offer;

import com.ats.kernel.Ids.TenantId;
import java.math.BigDecimal;
import java.util.List;

/** Recruiter iç görünümü; candidate API actor/reason içeren revision'ları döndürmez. */
public record OfferWorkspace(
        TenantId tenantId,
        String offerId,
        String applicationPublicRef,
        String jobSlug,
        String jobTitle,
        String candidateName,
        String roleTitle,
        String startDate,
        String employmentType,
        String workMode,
        String location,
        BigDecimal compensationAmount,
        String currency,
        OfferPayPeriod payPeriod,
        String expiresAt,
        String termsSummary,
        OfferStatus status,
        int version,
        List<OfferRevision> revisions,
        String createdAt,
        String updatedAt) {

    public OfferWorkspace {
        revisions = List.copyOf(revisions);
    }

    public record OfferRevision(
            int version,
            String roleTitle,
            String startDate,
            String employmentType,
            String workMode,
            String location,
            BigDecimal compensationAmount,
            String currency,
            OfferPayPeriod payPeriod,
            String expiresAt,
            String termsSummary,
            OfferStatus status,
            String reason,
            String actorRef,
            String occurredAt) {}
}
