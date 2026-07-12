package com.ats.governance;

import com.ats.contracts.governance.ApprovalStatus;
import com.ats.contracts.governance.ApprovedModelRegistry;
import com.ats.contracts.governance.ApprovedModelSpec;
import com.ats.contracts.governance.Capability;
import com.ats.contracts.governance.ModelApprovalRef;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/**
 * In-memory onaylı-model registry (test + composition-varsayılan). Yükleme-anı
 * doğrulaması {@link ApprovedModelIndex}'te (yinelenen ref / config / alias çakışması
 * fail-closed). {@link #unavailable()} = registry erişilemez senaryosu (her çözüm DENY).
 */
public final class InMemoryApprovedModelRegistry implements ApprovedModelRegistry {

    /** null = registry erişilemez (fail-closed: tüm çözümler NOT_CONFIGURED). */
    private final ApprovedModelIndex index;

    private InMemoryApprovedModelRegistry(ApprovedModelIndex index) {
        this.index = index;
    }

    public static InMemoryApprovedModelRegistry of(List<ApprovedModelSpec> specs) {
        return new InMemoryApprovedModelRegistry(ApprovedModelIndex.build(List.copyOf(specs)));
    }

    public static InMemoryApprovedModelRegistry empty() {
        return of(List.of());
    }

    public static InMemoryApprovedModelRegistry unavailable() {
        return new InMemoryApprovedModelRegistry(null);
    }

    @Override
    public Outcome<ApprovedModelSpec> resolve(ModelApprovalRef ref, Capability capability) {
        if (index == null) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "onaylı-model registry erişilemez (fail-closed)");
        }
        if (ref == null || capability == null) {
            return Outcome.fail(OutcomeCode.INVALID, "ref/capability zorunlu");
        }
        ApprovedModelSpec spec = index.byRef(ref);
        if (spec == null) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "onaylı-model bulunamadı: " + ref.value());
        }
        if (spec.capability() != capability) {
            return Outcome.fail(OutcomeCode.DENIED,
                    "capability uyuşmazlığı: istenen=" + capability + " kayıtlı=" + spec.capability());
        }
        if (spec.status() != ApprovalStatus.APPROVED) {
            return Outcome.fail(OutcomeCode.DENIED, "onay durumu APPROVED değil: " + spec.status());
        }
        return Outcome.ok(spec);
    }

    @Override
    public Outcome<ApprovedModelSpec> resolveConfigured(
            Capability capability, String configuredProviderRef,
            String requestedModelId, String requestedModelVersion) {
        if (index == null) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "onaylı-model registry erişilemez (fail-closed)");
        }
        if (capability == null || isBlank(configuredProviderRef)
                || isBlank(requestedModelId) || isBlank(requestedModelVersion)) {
            return Outcome.fail(OutcomeCode.INVALID, "capability/provider/model/version zorunlu");
        }
        ApprovedModelSpec spec = index.byConfig(
                capability, configuredProviderRef, requestedModelId, requestedModelVersion);
        if (spec == null) {
            return Outcome.fail(OutcomeCode.NOT_FOUND,
                    "wired config onaylı registry'de yok (fail-closed): " + capability + "/"
                    + configuredProviderRef + "/" + requestedModelId + "@" + requestedModelVersion);
        }
        if (spec.status() != ApprovalStatus.APPROVED) {
            return Outcome.fail(OutcomeCode.DENIED, "eşleşen spec APPROVED değil: " + spec.status());
        }
        return Outcome.ok(spec);
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    // --- READ-ONLY discovery yüzeyi (PORT DIŞI — yalnız concrete adapter) ---
    // Operatör onay-ref keşfi (ADR-0020 §8) + test drift-safety içindir. resolve/gate semantiğini
    // DEĞİŞTİRMEZ; ApprovedModelRegistry PORT interface'i genişletilMEZ (ai-orchestration keşfe bağlanamaz).

    /**
     * Yüklü spec'lerin değişmez kopyası. Registry erişilemez (unavailable) ise boş liste
     * (fail-closed keşif: erişilemez registry hiçbir onaylı-politika açığa çıkarmaz).
     */
    public List<ApprovedModelSpec> approvedSpecs() {
        return index == null ? List.of() : index.approvedSpecs();
    }

    /**
     * Belirli bir {@code configuredProviderRef} için capability→onay-ref eşlemesi (keşif). Aynı
     * (provider, capability) için birden çok spec bulunursa fail-closed (belirsiz keşif reddedilir).
     * Registry erişilemez ise boş harita.
     */
    public Map<Capability, ModelApprovalRef> approvalRefsFor(String configuredProviderRef) {
        Map<Capability, ModelApprovalRef> out = new EnumMap<>(Capability.class);
        for (ApprovedModelSpec spec : approvedSpecs()) {
            if (spec.configuredProviderRef().equals(configuredProviderRef)
                    && out.putIfAbsent(spec.capability(), spec.approvalRef()) != null) {
                throw new IllegalStateException("onaylı-model keşif: aynı provider+capability için "
                        + "birden çok spec (belirsiz onay-ref keşfi, fail-closed): "
                        + configuredProviderRef + "/" + spec.capability());
            }
        }
        return out;
    }
}
