package com.ats.app;

import com.ats.contracts.governance.ApprovedModelSpec;
import com.ats.contracts.governance.Capability;
import java.util.Map;

/**
 * P3-gov0 boot-gate ÇIKTISI + kanıt-işareti (Codex durable-fix). Yalnız {@link
 * ModelGovernanceBoot#authorizeProvider} üretir: GERÇEK provider'ın enabled-capability
 * kümesinin her üyesi, beyan edilen onaylı-politikaya çözülüp cross-check'lerden (provider-ref,
 * endpointRef, invocationProfileVersion) geçtiğinde döner. Composition'da {@code AIProvider}
 * bean'i bu tipe DEPEND eder → provider bean'i yalnız authorization TAMAMLANDIKTAN sonra kurulur
 * (Spring bean-dependency ordering ile "gate-then-construct" garantisi; governance dekoratif değil).
 *
 * @param bindings   enabled-capability → çözülmüş APPROVED spec (değişmez; en az bir üye).
 * @param provider   authorize edilen gerçek provider ({@code http-json}/{@code live-stt}).
 * @param endpointRef bağlanan opak deploy endpoint-referansı (tüm binding'lerde ortak).
 */
record AuthorizedModelBindings(
        Map<Capability, ApprovedModelSpec> bindings, String provider, String endpointRef) {

    AuthorizedModelBindings {
        if (provider == null || provider.isBlank()) {
            throw new IllegalStateException("AuthorizedModelBindings: provider zorunlu (fail-closed)");
        }
        if (endpointRef == null || endpointRef.isBlank()) {
            throw new IllegalStateException("AuthorizedModelBindings: endpointRef zorunlu (fail-closed)");
        }
        if (bindings == null || bindings.isEmpty()) {
            throw new IllegalStateException(
                    "AuthorizedModelBindings: en az bir enabled-capability binding zorunlu (fail-closed)");
        }
        bindings = Map.copyOf(bindings);
    }
}
