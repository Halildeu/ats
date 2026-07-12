package com.ats.app;

import com.ats.contracts.governance.ApprovedModelRegistry;
import com.ats.contracts.governance.ApprovedModelSpec;
import com.ats.contracts.governance.Capability;
import com.ats.kernel.Outcome;
import java.util.List;

/**
 * P3-gov0 boot-doğrulama (composition, fail-closed). Deployment'ın wire'ladığı her ENABLED
 * capability için {@link ApprovedModelRegistry#resolveConfigured} çağrılır; APPROVED bir kayda
 * çözülmezse composition patlar (boot FAIL — sessiz/onaysız model ile ayağa kalkılmaz). Wire
 * edilmeyen capability doğrulanmaz (yalnız GLOBAL; tenant-özel onay yok). Bu sınıf
 * policy-registry KAPSAMINDA kalır — AIProvider/WORM/orkestrasyon yollarına dokunmaz.
 */
final class ModelGovernanceBoot {

    private ModelGovernanceBoot() {}

    /** Boot-doğrulamanın gerçekten koştuğunu kanıtlayan işaret bean'i (kaç wiring doğrulandı). */
    record Validation(int validatedWirings) {}

    static Validation validateWiredConfig(
            ApprovedModelRegistry registry, List<ModelGovernanceProperties.Wiring> wirings) {
        if (registry == null) {
            throw new IllegalStateException("model-governance boot: registry null (fail-closed)");
        }
        int validated = 0;
        for (ModelGovernanceProperties.Wiring w : wirings) {
            Capability capability = parseCapability(w.capability());
            requireField(w.providerRef(), "providerRef");
            requireField(w.modelId(), "modelId");
            requireField(w.modelVersion(), "modelVersion");

            Outcome<ApprovedModelSpec> resolved =
                    registry.resolveConfigured(capability, w.providerRef(), w.modelId(), w.modelVersion());
            if (!(resolved instanceof Outcome.Ok<ApprovedModelSpec>)) {
                Outcome.Fail<ApprovedModelSpec> fail = (Outcome.Fail<ApprovedModelSpec>) resolved;
                throw new IllegalStateException("model-governance boot: wire'lanmış capability " + capability
                        + " (provider=" + w.providerRef() + ", model=" + w.modelId() + "@" + w.modelVersion()
                        + ") APPROVED onaya çözülemedi (fail-closed): " + fail.code() + " — " + fail.reason());
            }
            validated++;
        }
        return new Validation(validated);
    }

    private static Capability parseCapability(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalStateException("model-governance boot: wiring capability boş (fail-closed)");
        }
        try {
            return Capability.valueOf(raw.trim());
        } catch (IllegalArgumentException ex) {
            throw new IllegalStateException(
                    "model-governance boot: bilinmeyen capability (kapalı küme TRANSCRIBE|CITE): " + raw);
        }
    }

    private static void requireField(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalStateException("model-governance boot: wiring." + name + " zorunlu (fail-closed)");
        }
    }
}
