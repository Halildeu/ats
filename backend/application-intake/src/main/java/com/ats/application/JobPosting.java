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
        List<String> highlights) {

    public JobPosting {
        highlights = highlights == null ? List.of() : List.copyOf(highlights);
    }
}
