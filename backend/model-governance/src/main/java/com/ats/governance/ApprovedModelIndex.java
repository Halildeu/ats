package com.ats.governance;

import com.ats.contracts.governance.ApprovedModelSpec;
import com.ats.contracts.governance.Capability;
import com.ats.contracts.governance.ModelApprovalRef;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Onaylı-model kayıtlarının yükleme-anı doğrulanmış indeksi (in-memory + dosya-destekli
 * adapter'lar için ortak çekirdek). FAIL-CLOSED yükleme kuralları (biri ihlal → {@link
 * IllegalStateException}):
 * <ul>
 *   <li>Yinelenen {@link ModelApprovalRef} (içerik-adresli ⇒ aynı ref = aynı politika;
 *       yalnız status farkı da aynı ref üretir → belirsiz) — reddedilir.</li>
 *   <li>Yinelenen wired-config kimliği (capability+provider+modelId+versiyon) — reddedilir.</li>
 *   <li>Alias/id çakışması: aynı (capability, provider) kapsamında bir reported-id token'ı
 *       (kanonik id ∪ id-alias'lar) iki FARKLI spec'e ait olamaz — belirsiz reported-eşleşme
 *       yapısal olarak engellenir.</li>
 * </ul>
 * Değer-geçersizliği (URL/newline/uzunluk/{@code ://}) zaten {@link ApprovedModelSpec}
 * kurucusunda fail-closed reddedilir.
 *
 * <p>Bileşik anahtarlar TYPED record'dur ({@link ConfigKey}/{@link IdTokenKey}) — string-concat +
 * ayraç-karakteri YOK (Codex durable-fix: ayraç-enjeksiyonu ve NUL-byte dosya-bozulması riski
 * ortadan kalkar; record-default equals/hashCode ile alan-bazlı kesin eşitlik).
 */
final class ApprovedModelIndex {

    /** (capability, provider, modelId, version) wired-config kimliği — alan-bazlı kesin eşitlik. */
    private record ConfigKey(Capability capability, String provider, String modelId, String version) {}

    /** (capability, provider, reported-id token) alias/id-sahiplik anahtarı — alan-bazlı kesin eşitlik. */
    private record IdTokenKey(Capability capability, String provider, String token) {}

    private final Map<ModelApprovalRef, ApprovedModelSpec> byRef;
    private final Map<ConfigKey, ApprovedModelSpec> byConfigKey;

    private ApprovedModelIndex(
            Map<ModelApprovalRef, ApprovedModelSpec> byRef,
            Map<ConfigKey, ApprovedModelSpec> byConfigKey) {
        this.byRef = byRef;
        this.byConfigKey = byConfigKey;
    }

    static ApprovedModelIndex build(List<ApprovedModelSpec> specs) {
        Map<ModelApprovalRef, ApprovedModelSpec> byRef = new LinkedHashMap<>();
        Map<ConfigKey, ApprovedModelSpec> byConfigKey = new LinkedHashMap<>();
        Map<IdTokenKey, ModelApprovalRef> idTokenOwner = new HashMap<>();

        for (ApprovedModelSpec spec : specs) {
            if (spec == null) {
                throw new IllegalStateException("onaylı-model: null spec (fail-closed)");
            }
            if (byRef.putIfAbsent(spec.approvalRef(), spec) != null) {
                throw new IllegalStateException("onaylı-model: yinelenen approvalRef "
                        + spec.approvalRef().value()
                        + " (aynı politika iki kez / yalnız status farkı — belirsiz, fail-closed)");
            }
            ConfigKey configKey = new ConfigKey(spec.capability(), spec.configuredProviderRef(),
                    spec.requestedModelId(), spec.requestedModelVersion());
            if (byConfigKey.putIfAbsent(configKey, spec) != null) {
                throw new IllegalStateException(
                        "onaylı-model: yinelenen wired-config kimliği (fail-closed): "
                        + configKey.capability() + "/" + configKey.provider() + "/"
                        + configKey.modelId() + "@" + configKey.version());
            }
            List<String> idTokens = new ArrayList<>();
            idTokens.add(spec.requestedModelId());
            idTokens.addAll(spec.allowedReportedModelIdAliases());
            for (String token : idTokens) {
                IdTokenKey key = new IdTokenKey(spec.capability(), spec.configuredProviderRef(), token);
                ModelApprovalRef owner = idTokenOwner.putIfAbsent(key, spec.approvalRef());
                if (owner != null && !owner.equals(spec.approvalRef())) {
                    throw new IllegalStateException("onaylı-model: alias/id çakışması '" + token
                            + "' aynı (capability=" + spec.capability() + ", provider="
                            + spec.configuredProviderRef() + ") kapsamında iki farklı spec'e ait (fail-closed)");
                }
            }
        }
        return new ApprovedModelIndex(Map.copyOf(byRef), Map.copyOf(byConfigKey));
    }

    /**
     * READ-ONLY discovery: yüklü spec'lerin değişmez kopyası (yükleme-anı doğrulanmış küme).
     * Çözüm/gate semantiğini DEĞİŞTİRMEZ — yalnız keşif (operatör onay-ref keşfi + test drift-safety).
     */
    List<ApprovedModelSpec> approvedSpecs() {
        return List.copyOf(byRef.values());
    }

    ApprovedModelSpec byRef(ModelApprovalRef ref) {
        return byRef.get(ref);
    }

    ApprovedModelSpec byConfig(Capability capability, String provider, String modelId, String version) {
        return byConfigKey.get(new ConfigKey(capability, provider, modelId, version));
    }
}
