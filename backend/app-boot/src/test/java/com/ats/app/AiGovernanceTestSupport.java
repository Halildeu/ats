package com.ats.app;

import com.ats.contracts.governance.ApprovedModelSpec;
import com.ats.contracts.governance.Capability;
import com.ats.contracts.governance.ModelApprovalRef;
import com.ats.governance.FileBackedApprovedModelRegistry;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;
import org.springframework.test.context.DynamicPropertyRegistry;

/**
 * P3-gov0 test-desteği: @SpringBootTest full-context testleri için 3 GÜVEN girdisini
 * ({@code ats.ai.endpoint-ref} + {@code ats.ai.approvals.{transcribe,cite}-ref}) SHIPPED
 * onaylı-model kaydından (classpath {@code model-governance/approved-models.json}) TÜRETEREK
 * register eder. Değerler HARDCODE EDİLMEZ — kayıttan çıkarılır (drift-safe): approved-models.json
 * değişirse test de birlikte kayar (stale hex → yanlış-pozitif yerine gerçek fail).
 *
 * <p>Neden gerek: application.yaml artık bu 3 girdiyi DEFAULT'lamaz (fail-closed; deployment açıkça
 * beyan etmeli). Default provider=http-json {TRANSCRIBE, CITE} her ikisini de onay ister → full-context
 * boot için transcribe + cite + endpoint zorunlu. base-url register'ı çağırana aittir (bu yalnız
 * governance girdilerini ekler; mevcut db/security/base-url register'ları KORUNUR).
 */
final class AiGovernanceTestSupport {

    /** WiringConfig ile aynı classpath kaynağı (application.yaml ats.model-governance default'u). */
    private static final String APPROVED_MODELS_RESOURCE = "model-governance/approved-models.json";
    /** ModelGovernanceBoot http-json → bu configuredProviderRef (KAPALI mapping). */
    private static final String HTTP_JSON_PROVIDER_REF = "http-json-generic";

    private AiGovernanceTestSupport() {}

    /** SHIPPED registry'den türetilen (drift-safe) http-json güven girdileri. */
    record HttpJsonGovernance(String endpointRef, String transcribeRef, String citeRef) {}

    /**
     * Default (http-json) provider için 3 güven girdisini SHIPPED registry'den türetir (discovery
     * yüzeyiyle; hardcoded hex yok). Beklenmeyen kayıt (eksik capability / birden çok endpointRef)
     * fail-closed drift-guard olarak patlar.
     */
    static HttpJsonGovernance httpJson() {
        FileBackedApprovedModelRegistry shipped =
                FileBackedApprovedModelRegistry.fromClasspath(APPROVED_MODELS_RESOURCE);
        Map<Capability, ModelApprovalRef> refs = shipped.approvalRefsFor(HTTP_JSON_PROVIDER_REF);
        String transcribeRef = require(refs, Capability.TRANSCRIBE).value();
        String citeRef = require(refs, Capability.CITE).value();
        String endpointRef = singleEndpointRef(shipped);
        return new HttpJsonGovernance(endpointRef, transcribeRef, citeRef);
    }

    /**
     * Default (http-json) provider için 3 güven girdisini register eder (mevcut base-url register'ını
     * KORUYARAK — yalnız ekleme yapar). Değerler json'dan türetilir (drift-safe).
     */
    static void registerHttpJson(DynamicPropertyRegistry registry) {
        HttpJsonGovernance g = httpJson();
        registry.add("ats.ai.endpoint-ref", g::endpointRef);
        registry.add("ats.ai.approvals.transcribe-ref", g::transcribeRef);
        registry.add("ats.ai.approvals.cite-ref", g::citeRef);
    }

    private static ModelApprovalRef require(Map<Capability, ModelApprovalRef> refs, Capability cap) {
        ModelApprovalRef ref = refs.get(cap);
        if (ref == null) {
            throw new IllegalStateException("test-support: shipped registry'de " + HTTP_JSON_PROVIDER_REF
                    + " " + cap + " onay-ref'i yok (fail-closed drift-guard)");
        }
        return ref;
    }

    /** http-json-generic spec'lerinin (TRANSCRIBE+CITE) TEK ortak endpointRef'ini türetir (drift-safe). */
    private static String singleEndpointRef(FileBackedApprovedModelRegistry shipped) {
        Set<String> endpoints = shipped.approvedSpecs().stream()
                .filter(s -> s.configuredProviderRef().equals(HTTP_JSON_PROVIDER_REF))
                .map(ApprovedModelSpec::endpointRef)
                .collect(Collectors.toCollection(TreeSet::new));
        if (endpoints.size() != 1) {
            throw new IllegalStateException("test-support: " + HTTP_JSON_PROVIDER_REF
                    + " için tek endpointRef beklenir, bulunan: " + endpoints + " (fail-closed drift-guard)");
        }
        return endpoints.iterator().next();
    }
}
