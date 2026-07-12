package com.ats.app;

import com.ats.contracts.governance.ApprovedModelRegistry;
import com.ats.contracts.governance.ApprovedModelSpec;
import com.ats.contracts.governance.Capability;
import com.ats.contracts.governance.ModelApprovalRef;
import com.ats.kernel.Outcome;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/**
 * P3-gov0 boot-gate (composition, fail-closed) — Codex durable-fix.
 *
 * <p><b>Neden bu tasarım:</b> Önceki sürüm AYRI bir {@code wirings} listesini dolaşıyordu
 * (default boş → no-op) ve gerçek {@code AIProvider} bean'i {@code WiringConfig}'te KOŞULSUZ
 * kuruluyordu → aktif provider varken governance dekoratifti. Bu sürüm gate'i GERÇEK provider
 * kimliğine bağlar: {@link #authorizeProvider} deployment'ın gerçekten kuracağı provider'ın
 * enabled-capability kümesini provider'dan TÜRETİR ve her üye için beyan edilen onaylı-politikayı
 * çözer + cross-check eder; hepsi APPROVED değilse composition patlar. {@code AIProvider} bean'i
 * {@link AuthorizedModelBindings}'e depend eder → yalnız gate geçtikten sonra kurulur.
 *
 * <p><b>Sınır (gov0):</b> gate INTENDED/authorized politikayı doğrular. OBSERVED runtime model
 * doğrulaması (sağlayıcının gerçekten hangi model-id/versiyon döndürdüğü) gov1 consumer-gate işidir.
 * {@code endpointRef→baseUrl} eşlemesi DEPLOYMENT-AUTHORITATIVE bir invariant'tır; kod
 * {@code baseUrl}'in gerçekten {@code endpointRef}'e karşılık geldiğini KANITLAMAZ (yalnız beyan
 * tutarlılığını zorlar). {@code approvalRef} "halen onaylı" kanıtı DEĞİLDİR — her boot güncel
 * registry-status resolution gerektirir (REVOKED/DRAFT → boot FAIL). Bu sınıf policy-registry
 * KAPSAMINDA kalır — {@code AIProvider}/WORM/orkestrasyon yollarına dokunmaz.
 */
final class ModelGovernanceBoot {

    private ModelGovernanceBoot() {}

    /** Gerçek provider → türetilmiş onay-profili (KAPALI, deterministik). Bilinmeyen provider fail-closed. */
    private record ProviderProfile(
            Set<Capability> enabledCapabilities, String configuredProviderRef, String invocationProfileVersion) {}

    /**
     * KAPALI provider→profil eşlemesi (deployment-authoritative invariant'lar kod sabiti):
     * <ul>
     *   <li>{@code live-stt} → {TRANSCRIBE}; providerRef {@code faz24-live-stt}; profil {@code ip-live-stt-1}.
     *       (cite yüzeyi sunmaz → CITE ref beyanı reddedilir.)</li>
     *   <li>{@code http-json} → {TRANSCRIBE, CITE}; providerRef {@code http-json-generic}; profil
     *       {@code ip-http-json-1}. (her iki yetenek de callable → ikisi de onay ister; partial-enable
     *       gov0 kapsamı DIŞI.)</li>
     * </ul>
     */
    private static final Map<String, ProviderProfile> PROVIDER_PROFILES = Map.of(
            "live-stt", new ProviderProfile(
                    EnumSet.of(Capability.TRANSCRIBE), "faz24-live-stt", "ip-live-stt-1"),
            "http-json", new ProviderProfile(
                    EnumSet.of(Capability.TRANSCRIBE, Capability.CITE), "http-json-generic", "ip-http-json-1"));

    /**
     * GERÇEK provider'ı authorize eder (gate-then-construct çekirdeği). Sırasıyla fail-closed:
     * <ol>
     *   <li>provider→profil (bilinmeyen provider → FAIL); endpointRef blank → FAIL.</li>
     *   <li>her yetenek için ref-beyan tutarlılığı: enabled ise ref ZORUNLU; enabled değilse ref
     *       BEYAN EDİLMEMELİ (ör. live-stt + citeRef → FAIL — yanlış beyan reddi).</li>
     *   <li>her enabled yetenek: ref parse (bozuk format → FAIL) → {@code registry.resolve}
     *       (bulunamaz/REVOKED/DRAFT/capability-uyuşmaz → FAIL) → cross-check: configuredProviderRef,
     *       endpointRef, invocationProfileVersion (biri uyuşmaz → FAIL).</li>
     *   <li>çok-yetenekli provider'da tüm binding'ler AYNI endpointRef'i paylaşmalı (tek bean/baseUrl).</li>
     * </ol>
     * Hepsi geçerse {@link AuthorizedModelBindings} döner (proof-marker + downstream kullanılabilir).
     */
    static AuthorizedModelBindings authorizeProvider(
            ApprovedModelRegistry registry, String provider, String endpointRef,
            AppProperties.Approvals approvals) {
        if (registry == null) {
            throw new IllegalStateException("model-governance boot: registry null (fail-closed)");
        }
        if (approvals == null) {
            throw new IllegalStateException("model-governance boot: approvals null (fail-closed)");
        }
        ProviderProfile profile = PROVIDER_PROFILES.get(provider);
        if (profile == null) {
            throw new IllegalStateException("model-governance boot: bilinmeyen provider (kapalı küme "
                    + "http-json|live-stt): " + provider + " (fail-closed)");
        }
        if (isBlank(endpointRef)) {
            throw new IllegalStateException(
                    "model-governance boot: ats.ai.endpoint-ref zorunlu (fail-closed; provider=" + provider + ")");
        }

        // (2) ref-beyan tutarlılığı: TÜM yetenekler taranır — enabled ↔ ref-varlığı kesin eşleşmeli.
        for (Capability cap : Capability.values()) {
            String ref = refFor(approvals, cap);
            boolean enabled = profile.enabledCapabilities().contains(cap);
            if (enabled && isBlank(ref)) {
                throw new IllegalStateException("model-governance boot: provider=" + provider
                        + " için " + cap + " onay-ref'i zorunlu (ats.ai.approvals." + refKey(cap)
                        + " eksik; fail-closed)");
            }
            if (!enabled && !isBlank(ref)) {
                throw new IllegalStateException("model-governance boot: provider=" + provider
                        + " " + cap + " yeteneğini çalıştırmaz ama onay-ref'i beyan edilmiş (ats.ai.approvals."
                        + refKey(cap) + "); yanlış beyan reddedildi (fail-closed)");
            }
        }

        // (3) her enabled yetenek: parse → resolve(APPROVED) → cross-check.
        Map<Capability, ApprovedModelSpec> resolved = new LinkedHashMap<>();
        for (Capability cap : Capability.values()) {
            if (!profile.enabledCapabilities().contains(cap)) {
                continue;
            }
            ModelApprovalRef ref = parseRef(refFor(approvals, cap), cap);
            Outcome<ApprovedModelSpec> outcome = registry.resolve(ref, cap);
            if (!(outcome instanceof Outcome.Ok<ApprovedModelSpec> ok)) {
                Outcome.Fail<ApprovedModelSpec> fail = (Outcome.Fail<ApprovedModelSpec>) outcome;
                throw new IllegalStateException("model-governance boot: " + cap + " onay-ref'i "
                        + ref.value() + " APPROVED'a çözülemedi (fail-closed): "
                        + fail.code() + " — " + fail.reason());
            }
            ApprovedModelSpec spec = ok.value();
            if (!spec.configuredProviderRef().equals(profile.configuredProviderRef())) {
                throw new IllegalStateException("model-governance boot: " + cap + " provider-ref uyuşmazlığı "
                        + "(fail-closed): beklenen=" + profile.configuredProviderRef()
                        + " onaylı=" + spec.configuredProviderRef());
            }
            if (!spec.endpointRef().equals(endpointRef)) {
                throw new IllegalStateException("model-governance boot: " + cap + " endpointRef uyuşmazlığı "
                        + "(fail-closed): wired=" + endpointRef + " onaylı=" + spec.endpointRef());
            }
            if (!spec.invocationProfileVersion().equals(profile.invocationProfileVersion())) {
                throw new IllegalStateException("model-governance boot: " + cap + " invocationProfileVersion "
                        + "uyuşmazlığı (fail-closed): beklenen=" + profile.invocationProfileVersion()
                        + " onaylı=" + spec.invocationProfileVersion());
            }
            resolved.put(cap, spec);
        }

        // (4) çok-yetenekli provider: tüm binding'ler AYNI endpointRef (tek baseUrl/bean) — (3)'te her
        // spec zaten wired endpointRef'e eşitlendi; savunma amaçlı çapraz tutarlılık da doğrulanır.
        for (ApprovedModelSpec spec : resolved.values()) {
            if (!spec.endpointRef().equals(endpointRef)) {
                throw new IllegalStateException(
                        "model-governance boot: çok-yetenekli provider endpointRef tutarsız (fail-closed)");
            }
        }

        return new AuthorizedModelBindings(resolved, provider, endpointRef);
    }

    private static ModelApprovalRef parseRef(String raw, Capability cap) {
        try {
            return new ModelApprovalRef(raw);
        } catch (IllegalArgumentException ex) {
            throw new IllegalStateException("model-governance boot: " + cap + " onay-ref biçimi geçersiz "
                    + "(beklenen mapr_<64-küçük-hex>; fail-closed): " + ex.getMessage());
        }
    }

    private static String refFor(AppProperties.Approvals approvals, Capability cap) {
        return switch (cap) {
            case TRANSCRIBE -> approvals.transcribeRef();
            case CITE -> approvals.citeRef();
        };
    }

    private static String refKey(Capability cap) {
        return switch (cap) {
            case TRANSCRIBE -> "transcribe-ref";
            case CITE -> "cite-ref";
        };
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
