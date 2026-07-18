package com.ats.application;

import com.ats.kernel.Ids.TenantId;
import java.util.List;

/** Public ilan sözleşmesi; tenant yalnız persistence/authz katmanında kullanılır ve API'ye çıkmaz. */
public record JobPosting(
        TenantId tenantId,
        String jobId,
        String slug,
        String title,
        String team,
        String location,
        String mode,
        String employmentType,
        String summary,
        List<String> highlights,
        List<String> applicationFields,
        String noticeVersion,
        JobPostingStatus status,
        boolean applyEnabled,
        int version,
        String createdAt,
        String updatedAt) {

    public JobPosting {
        highlights = highlights == null ? List.of() : List.copyOf(highlights);
        applicationFields = applicationFields == null ? List.of() : List.copyOf(applicationFields);
        if (noticeVersion == null || noticeVersion.isBlank()) {
            throw new IllegalArgumentException("noticeVersion zorunlu");
        }
        if (status == null) throw new IllegalArgumentException("status zorunlu");
        if (applyEnabled != status.acceptsApplications()) {
            throw new IllegalArgumentException("applyEnabled/status invariant bozuk");
        }
        if (version < 0) throw new IllegalArgumentException("version negatif olamaz");
    }
}
