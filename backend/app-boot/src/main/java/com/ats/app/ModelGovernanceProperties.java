package com.ats.app;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * P3-gov0 onaylı-model governance konfig'i (ATS-0018: composition düzlemi config'ten okur, domain
 * framework-free kalır). Yalnız {@code approvedModelsResource}: onaylı-model JSON kaynağının
 * classpath yolu (boş/null → boş registry — o durumda wire'lı capability APPROVED'a çözülemez ve
 * {@code ModelGovernanceBoot} boot-gate fail-closed düşer).
 *
 * <p>Codex durable-fix: eski {@code wirings} listesi KALDIRILDI — boot-gate artık AYRI bir opt-in
 * liste yerine GERÇEK provider'a bağlıdır ({@code ats.ai.provider} + {@code ats.ai.endpoint-ref} +
 * {@code ats.ai.approvals.*}); enabled-capability provider'dan türetilir ({@code
 * ModelGovernanceBoot#authorizeProvider}). Aktif provider varken "sıfır wiring = no-op" boşluğu artık YOK.
 */
@ConfigurationProperties(prefix = "ats.model-governance")
public record ModelGovernanceProperties(String approvedModelsResource) {

    public ModelGovernanceProperties {
        approvedModelsResource = (approvedModelsResource == null || approvedModelsResource.isBlank())
                ? null : approvedModelsResource;
    }
}
