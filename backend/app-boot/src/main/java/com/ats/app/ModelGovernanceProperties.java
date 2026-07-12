package com.ats.app;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * P3-gov0 onaylı-model governance konfig'i (ATS-0018: zamanlayıcı/composition düzlemi
 * config'ten okur, domain framework-free kalır). İki bölüm:
 * <ul>
 *   <li>{@code approvedModelsResource}: onaylı-model JSON kaynağının classpath yolu
 *       (boş/null → boş registry).</li>
 *   <li>{@code wirings}: bu deployment'ın GERÇEKTEN wire'ladığı (enabled) yetenekler ve
 *       onların provider/model/versiyon değerleri. Boot bunların her biri için APPROVED
 *       onay arar (fail-closed); liste boş → doğrulanacak enabled-capability yok (RetentionScheduler
 *       "default-off" deseniyle uyumlu). Wire'lanmayan yetenek (ör. yalnız TRANSCRIBE varsa CITE)
 *       boot'u DÜŞÜRMEZ.</li>
 * </ul>
 */
@ConfigurationProperties(prefix = "ats.model-governance")
public record ModelGovernanceProperties(String approvedModelsResource, List<Wiring> wirings) {

    public ModelGovernanceProperties {
        approvedModelsResource = (approvedModelsResource == null || approvedModelsResource.isBlank())
                ? null : approvedModelsResource;
        wirings = wirings == null ? List.of() : List.copyOf(wirings);
    }

    /** Bir deployment'ın wire'ladığı enabled-capability + istenen model kimliği (boot-doğrulanır). */
    public record Wiring(String capability, String providerRef, String modelId, String modelVersion) {}
}
