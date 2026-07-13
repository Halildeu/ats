package com.ats.governance;

import com.ats.contracts.governance.ApprovalStatus;
import com.ats.contracts.governance.ApprovedModelRegistry;
import com.ats.contracts.governance.ApprovedModelSpec;
import com.ats.contracts.governance.Capability;
import com.ats.contracts.governance.ModelApprovalRef;
import com.ats.contracts.governance.ModelGovernanceLedger;
import com.ats.contracts.governance.ModelGovernanceTransition;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/**
 * In-memory onaylı-model registry (test + composition-varsayılan). İKİ AYRI KAYNAĞI birleştirir
 * (gov1-1e-c authority cutover):
 * <ul>
 *   <li><b>catalog</b> ({@link ApprovedModelIndex}) — DEĞİŞMEZ POLİTİKA-İÇERİĞİ (hangi ref hangi
 *       politikayı tanımlar; yükleme-anı fail-closed doğrulanır: yinelenen ref/config/alias çakışması).
 *       Kümülatif/append-only: revoke edilen politika-içeriği catalog'dan SİLİNMEZ.</li>
 *   <li><b>worm</b> ({@link ModelGovernanceLedger.Reader}) — TEK STATUS-OTORİTE. Cari onay-durumu
 *       {@link ModelGovernanceStatusProjection} ile HER RESOLVE'da TAZE okunur (cache YOK; revoke
 *       görünürlüğü anında — snapshot/boot-status'e bağlı değil).</li>
 * </ul>
 *
 * <p><b>resolve fail-closed taksonomisi (Codex 019f57cb 1e-c — birebir):</b>
 * <ul>
 *   <li>catalog'da ref yok → {@link OutcomeCode#NOT_FOUND}</li>
 *   <li>capability catalog-kaydıyla uyuşmuyor → {@link OutcomeCode#DENIED}</li>
 *   <li>WORM okunamaz (Reader {@code Fail}/{@code null}/{@code Ok(null)}) → {@link OutcomeCode#NOT_CONFIGURED}</li>
 *   <li>GLOBAL hash-chain kırık VEYA özne tainted (state-machine bozuk) → {@link OutcomeCode#NOT_CONFIGURED}</li>
 *   <li>WORM'da catalog-dışı ref VEYA WORM-capability ≠ catalog-capability (bütünlük ihlali) →
 *       {@link OutcomeCode#NOT_CONFIGURED}</li>
 *   <li>cari durum {@code UNINITIALIZED} (catalog-ref-var-WORM-transition-yok) / {@code DRAFT} /
 *       {@code REVOKED} → {@link OutcomeCode#DENIED}</li>
 *   <li>eksik argüman → {@link OutcomeCode#INVALID}</li>
 * </ul>
 * {@code Ok} yalnızca catalog-eşleşme + WORM-authoritative + {@code APPROVED}'ta döner.
 *
 * <p>{@link #unavailable()} = catalog erişilemez; {@link #ofCatalogOnly(List)} = yalnız keşif
 * (WORM bağlanmamış → her resolve NOT_CONFIGURED; discovery yüzeyi çalışır).
 */
public final class InMemoryApprovedModelRegistry implements ApprovedModelRegistry {

    /** In-memory keşif için boş-WORM okuyucu (catalog boşken resolve WORM'a bile inmeden NOT_FOUND döner). */
    private static final ModelGovernanceLedger.Reader EMPTY_WORM = () -> Outcome.ok(List.of());

    /** null = registry erişilemez (fail-closed: catalog kaynağı yok → tüm çözümler NOT_CONFIGURED). */
    private final ApprovedModelIndex catalog;
    /** null = WORM bağlanmamış (yalnız-keşif adapter) → resolve/resolveConfigured NOT_CONFIGURED. */
    private final ModelGovernanceLedger.Reader worm;

    private InMemoryApprovedModelRegistry(ApprovedModelIndex catalog, ModelGovernanceLedger.Reader worm) {
        this.catalog = catalog;
        this.worm = worm;
    }

    /** Tam registry: catalog (politika-içeriği) + WORM (status-otorite). worm zorunlu (fail-closed). */
    public static InMemoryApprovedModelRegistry of(
            List<ApprovedModelSpec> catalog, ModelGovernanceLedger.Reader worm) {
        if (worm == null) {
            throw new IllegalArgumentException("WORM Reader zorunlu (fail-closed; status-otorite)");
        }
        return new InMemoryApprovedModelRegistry(ApprovedModelIndex.build(List.copyOf(catalog)), worm);
    }

    /** Boş registry (catalog boş → her resolve NOT_FOUND; WORM'a inmeden). */
    public static InMemoryApprovedModelRegistry empty() {
        return new InMemoryApprovedModelRegistry(ApprovedModelIndex.build(List.of()), EMPTY_WORM);
    }

    /**
     * Yalnız-keşif adapter: catalog yüklü (approvedSpecs/approvalRefsFor çalışır) ama WORM
     * BAĞLANMAMIŞ → resolve/resolveConfigured fail-closed {@link OutcomeCode#NOT_CONFIGURED}
     * (status-otorite yok; keşif ≠ çözüm). Operatör ref-keşfi + test drift-safety içindir.
     */
    public static InMemoryApprovedModelRegistry ofCatalogOnly(List<ApprovedModelSpec> catalog) {
        return new InMemoryApprovedModelRegistry(ApprovedModelIndex.build(List.copyOf(catalog)), null);
    }

    public static InMemoryApprovedModelRegistry unavailable() {
        return new InMemoryApprovedModelRegistry(null, null);
    }

    @Override
    public Outcome<ApprovedModelSpec> resolve(ModelApprovalRef ref, Capability capability) {
        if (catalog == null || worm == null) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "onaylı-model registry erişilemez (fail-closed)");
        }
        if (ref == null || capability == null) {
            return Outcome.fail(OutcomeCode.INVALID, "ref/capability zorunlu");
        }
        ApprovedModelSpec spec = catalog.byRef(ref);
        if (spec == null) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "onaylı-model catalog'da yok: " + ref.value());
        }
        if (spec.capability() != capability) {
            return Outcome.fail(OutcomeCode.DENIED,
                    "capability uyuşmazlığı: istenen=" + capability + " catalog=" + spec.capability());
        }
        return statusResolve(spec, ref, capability);
    }

    @Override
    public Outcome<ApprovedModelSpec> resolveConfigured(
            Capability capability, String configuredProviderRef,
            String requestedModelId, String requestedModelVersion) {
        if (catalog == null || worm == null) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "onaylı-model registry erişilemez (fail-closed)");
        }
        if (capability == null || isBlank(configuredProviderRef)
                || isBlank(requestedModelId) || isBlank(requestedModelVersion)) {
            return Outcome.fail(OutcomeCode.INVALID, "capability/provider/model/version zorunlu");
        }
        ApprovedModelSpec spec = catalog.byConfig(
                capability, configuredProviderRef, requestedModelId, requestedModelVersion);
        if (spec == null) {
            return Outcome.fail(OutcomeCode.NOT_FOUND,
                    "wired config onaylı catalog'da yok (fail-closed): " + capability + "/"
                    + configuredProviderRef + "/" + requestedModelId + "@" + requestedModelVersion);
        }
        return statusResolve(spec, spec.approvalRef(), spec.capability());
    }

    /**
     * Catalog-eşleşmesi bulunan bir spec'in CARI onay-durumunu WORM'dan (tek otorite) çözer. WORM TAZE
     * okunur (cache YOK). Fail-closed: WORM okunamaz/bütünlük-bozuk → NOT_CONFIGURED; APPROVED değilse
     * DENIED; yalnız authoritative-APPROVED'da Ok(spec).
     */
    private Outcome<ApprovedModelSpec> statusResolve(
            ApprovedModelSpec spec, ModelApprovalRef ref, Capability capability) {
        Outcome<List<ModelGovernanceTransition>> read = worm.readAll();
        if (!(read instanceof Outcome.Ok<List<ModelGovernanceTransition>> ok) || ok.value() == null) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED,
                    "model-governance WORM okunamadı (fail-closed): status-otorite erişilemez");
        }
        List<ModelGovernanceTransition> transitions = ok.value();
        // Catalog ↔ WORM bütünlüğü: WORM'daki her özne catalog'da tanımlı + capability tutarlı olmalı
        // (kümülatif-catalog invariant'ı: WORM asla catalog-dışı ref'e atıf yapmaz).
        Outcome<ApprovedModelSpec> integrity = catalogWormIntegrity(transitions);
        if (integrity != null) {
            return integrity;
        }
        ModelGovernanceStatusProjection.ProjectionOutcome projection =
                ModelGovernanceStatusProjection.project(transitions);
        if (!projection.isAuthoritative(ref, capability)) {
            // GLOBAL zincir kusuru (chainIntact=false; tüm log şüpheli) VEYA özne tainted (state-machine
            // bozuk) → status güvenilir değil (fail-closed; APPROVED asla türetilmez).
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED,
                    "model-governance WORM status güvenilir değil (fail-closed): chain/state bütünlüğü bozuk");
        }
        ApprovalStatus status = projection.currentStatusOf(ref, capability);
        if (status == ApprovalStatus.APPROVED) {
            return Outcome.ok(spec);
        }
        // UNINITIALIZED (transition yok) / DRAFT / REVOKED → yalnız APPROVED çözülür.
        return Outcome.fail(OutcomeCode.DENIED, "onay durumu APPROVED değil (WORM otorite): " + status);
    }

    /**
     * WORM'daki her transition-öznesi ({@code approvalRef}) catalog'da tanımlı OLMALI ve WORM-capability'si
     * catalog-kaydının capability'siyle EŞLEŞMELİ. İhlal → status-kaynağı politika-kaynağıyla tutarsız →
     * fail-closed {@link OutcomeCode#NOT_CONFIGURED} (tüm çözüm; güvenilir status türetilemez). Temiz → null.
     */
    private Outcome<ApprovedModelSpec> catalogWormIntegrity(List<ModelGovernanceTransition> transitions) {
        for (ModelGovernanceTransition t : transitions) {
            ApprovedModelSpec catalogSpec = catalog.byRef(t.approvalRef());
            if (catalogSpec == null) {
                return Outcome.fail(OutcomeCode.NOT_CONFIGURED,
                        "model-governance bütünlük ihlali (fail-closed): WORM ref catalog'da yok: "
                        + t.approvalRef().value());
            }
            if (catalogSpec.capability() != t.capability()) {
                return Outcome.fail(OutcomeCode.NOT_CONFIGURED,
                        "model-governance bütünlük ihlali (fail-closed): WORM capability catalog ile "
                        + "uyuşmuyor: " + t.approvalRef().value());
            }
        }
        return null;
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    // --- READ-ONLY discovery yüzeyi (PORT DIŞI — yalnız concrete adapter) ---
    // Operatör onay-ref keşfi (ADR-0020 §8) + test drift-safety içindir. resolve/gate semantiğini
    // DEĞİŞTİRMEZ; ApprovedModelRegistry PORT interface'i genişletilMEZ. Yalnız CATALOG'u okur (WORM'a
    // dokunmaz — keşif politika-içeriği yüzeyidir, status yüzeyi değil).

    /**
     * Yüklü catalog spec'lerinin değişmez kopyası. Registry erişilemez (unavailable) ise boş liste
     * (fail-closed keşif: erişilemez registry hiçbir politika açığa çıkarmaz).
     */
    public List<ApprovedModelSpec> approvedSpecs() {
        return catalog == null ? List.of() : catalog.approvedSpecs();
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
