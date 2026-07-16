package com.ats.application;

import com.ats.kernel.Ids.TenantId;
import java.util.List;

/**
 * Silinebilir kişisel-veri düzlemindeki başvuru. Bu kayıt WORM/evidence değildir;
 * retention/DSAR uygulaması içeriği ileride silebilir, durum geçmişi ayrı tabloda kalır.
 */
public record CandidateApplication(
        TenantId tenantId,
        String applicationId,
        String publicRef,
        String jobId,
        String jobSlug,
        String jobTitle,
        String fullName,
        String email,
        String phone,
        String city,
        String linkedIn,
        String portfolio,
        String summary,
        String experience,
        String education,
        List<String> skills,
        String note,
        ApplicationStatus status,
        int version,
        String noticeVersion,
        String noticeAcceptedAt,
        String accuracyConfirmedAt,
        String createdAt,
        String updatedAt) {

    public CandidateApplication {
        skills = skills == null ? List.of() : List.copyOf(skills);
    }
}
