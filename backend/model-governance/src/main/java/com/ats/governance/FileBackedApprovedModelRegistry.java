package com.ats.governance;

import com.ats.contracts.governance.ApprovedModelRegistry;
import com.ats.contracts.governance.ApprovedModelSpec;
import com.ats.contracts.governance.Capability;
import com.ats.contracts.governance.ModelApprovalRef;
import com.ats.contracts.governance.ModelGovernanceLedger;
import com.ats.contracts.governance.ModelScope;
import com.ats.kernel.JsonCodec;
import com.ats.kernel.JsonValue;
import com.ats.kernel.Outcome;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Config/dosya-destekli, READ-ONLY onaylı-model registry. JSON kaynağı yükleme-anında
 * (kurulumda) fail-closed işlenir: kernel {@link JsonCodec} (güvenilmez-girdi-sağlam parser)
 * ile parse → her giriş {@link ApprovedModelSpec#of} ile kurulur (ref TÜRETİLİR) → {@link
 * ApprovedModelIndex} ile yinelenen-ref / alias-çakışması / değer-geçersizliği reddedilir.
 * Herhangi bir ihlal kurulumu düşürür ({@link IllegalStateException}) — bozuk politika sessizce
 * yüklenmez.
 *
 * <p><b>gov1-1e-c authority cutover:</b> kaynak yalnız DEĞİŞMEZ POLİTİKA-İÇERİĞİDİR — onay-DURUMU
 * ({@code status}) taşımaz. Strict exact-key parser eski {@code "status"} anahtarını (ve her bilinmeyen
 * anahtarı) AÇIKÇA REDDEDER (sessiz-ignore YOK; eski/kurcalanmış catalog fail-closed düşer). Cari durum
 * TEK OTORİTE olan GLOBAL WORM'dan çözülür ({@link ModelGovernanceLedger.Reader} +
 * {@link ModelGovernanceStatusProjection}).
 *
 * <p>İki kuruluş yolu: {@link #fromClasspath(String, ModelGovernanceLedger.Reader)} / {@link
 * #fromJson(String, ModelGovernanceLedger.Reader)} TAM registry'dir (resolve WORM-status çözer);
 * WORM'suz {@link #fromClasspath(String)} / {@link #fromJson(String)} YALNIZ-KEŞİFtir (approvedSpecs/
 * approvalRefsFor çalışır; resolve fail-closed {@code NOT_CONFIGURED}).
 *
 * <p>Kaynak şeması: kök object, {@code "approvedModels"} dizisi; her öğe politika alanları
 * (approvalRef VERİLMEZ — içerik-adresli, türetilir; {@code status} VERİLMEZ — WORM otorite):
 * <pre>
 * { "approvedModels": [ {
 *     "capability": "TRANSCRIBE",
 *     "configuredProviderRef": "faz24-live-stt",
 *     "requestedModelId": "whisper-tr",
 *     "requestedModelVersion": "v0.1.0",
 *     "allowedReportedModelIdAliases": ["whisper-large-v3-tr"],
 *     "allowedReportedModelVersionAliases": [],
 *     "endpointRef": "denetim-stt-internal",
 *     "invocationProfileVersion": "ip-1",
 *     "scope": "GLOBAL" } ] }
 * </pre>
 */
public final class FileBackedApprovedModelRegistry implements ApprovedModelRegistry {

    /** Strict exact-key şema (1e-c): yalnız bu politika alanları izinli; {@code status}/bilinmeyen → RED. */
    private static final Set<String> ALLOWED_KEYS = Set.of(
            "capability", "configuredProviderRef", "requestedModelId", "requestedModelVersion",
            "allowedReportedModelIdAliases", "allowedReportedModelVersionAliases",
            "endpointRef", "invocationProfileVersion", "scope");

    private final InMemoryApprovedModelRegistry delegate;

    private FileBackedApprovedModelRegistry(InMemoryApprovedModelRegistry delegate) {
        this.delegate = delegate;
    }

    // --- TAM registry (catalog + WORM status-otorite): resolve WORM'dan cari durumu çözer ---

    public static FileBackedApprovedModelRegistry fromJson(String json, ModelGovernanceLedger.Reader worm) {
        return new FileBackedApprovedModelRegistry(InMemoryApprovedModelRegistry.of(parse(json), worm));
    }

    public static FileBackedApprovedModelRegistry fromClasspath(
            String resourcePath, ModelGovernanceLedger.Reader worm) {
        return new FileBackedApprovedModelRegistry(InMemoryApprovedModelRegistry.of(load(resourcePath), worm));
    }

    // --- YALNIZ-KEŞİF (WORM bağlanmamış): approvedSpecs/approvalRefsFor çalışır; resolve NOT_CONFIGURED ---

    /** Yalnız-keşif (drift-safety/operatör ref-keşfi): catalog yüklü, WORM yok → resolve fail-closed. */
    public static FileBackedApprovedModelRegistry fromJson(String json) {
        return new FileBackedApprovedModelRegistry(InMemoryApprovedModelRegistry.ofCatalogOnly(parse(json)));
    }

    /** Yalnız-keşif (drift-safety/operatör ref-keşfi): catalog yüklü, WORM yok → resolve fail-closed. */
    public static FileBackedApprovedModelRegistry fromClasspath(String resourcePath) {
        return new FileBackedApprovedModelRegistry(InMemoryApprovedModelRegistry.ofCatalogOnly(load(resourcePath)));
    }

    private static List<ApprovedModelSpec> load(String resourcePath) {
        ClassLoader cl = FileBackedApprovedModelRegistry.class.getClassLoader();
        try (InputStream in = cl.getResourceAsStream(resourcePath)) {
            if (in == null) {
                throw new IllegalStateException(
                        "onaylı-model kaynağı classpath'te yok (fail-closed): " + resourcePath);
            }
            return parse(new String(in.readAllBytes(), StandardCharsets.UTF_8));
        } catch (IOException e) {
            throw new IllegalStateException("onaylı-model kaynağı okunamadı: " + resourcePath, e);
        }
    }

    static List<ApprovedModelSpec> parse(String json) {
        JsonValue root = JsonCodec.parse(json);
        if (!(root instanceof JsonValue.JsonObject obj)) {
            throw new IllegalStateException("onaylı-model kaynağı: kök JSON object olmalı (fail-closed)");
        }
        if (!(obj.values().get("approvedModels") instanceof JsonValue.JsonArray list)) {
            throw new IllegalStateException("onaylı-model kaynağı: 'approvedModels' dizisi zorunlu (fail-closed)");
        }
        // KÖK exact-key şema (gov1-1e-c, Codex REVISE): kökte YALNIZ 'approvedModels' izinli. Root-level
        // 'status' (sahte "global approval" izlenimi) veya herhangi bilinmeyen alan sessizce yok sayılmaz →
        // açık RED (governance-artifact bütünlüğü; ADR ATS-0021 "her bilinmeyen alan RED" ile tutarlı).
        for (String key : obj.values().keySet()) {
            if (!"approvedModels".equals(key)) {
                throw new IllegalStateException("onaylı-model kaynağı: kökte bilinmeyen/izinsiz alan '" + key
                        + "' (kök yalnız 'approvedModels'; root-level 'status' dahil RED; exact-key şema; fail-closed).");
            }
        }
        List<ApprovedModelSpec> specs = new ArrayList<>();
        for (JsonValue item : list.items()) {
            if (!(item instanceof JsonValue.JsonObject entry)) {
                throw new IllegalStateException("onaylı-model kaynağı: approvedModels öğesi object olmalı");
            }
            specs.add(toSpec(entry));
        }
        return specs;
    }

    private static ApprovedModelSpec toSpec(JsonValue.JsonObject e) {
        // Strict exact-key schema (gov1-1e-c): 'status' KALDIRILDI (WORM tek status-otorite) → açık RED;
        // her bilinmeyen anahtar da RED (eski/kurcalanmış catalog sessizce yüklenmesin — fail-closed).
        if (e.values().containsKey("status")) {
            throw new IllegalStateException("onaylı-model kaynağı: 'status' alanı KALDIRILDI (gov1-1e-c: WORM "
                    + "tek status-otorite; catalog yalnız değişmez politika-içeriği). Eski catalog RED (fail-closed).");
        }
        for (String key : e.values().keySet()) {
            if (!ALLOWED_KEYS.contains(key)) {
                throw new IllegalStateException(
                        "onaylı-model kaynağı: bilinmeyen/izinsiz alan '" + key + "' (exact-key şema; fail-closed)");
            }
        }
        return ApprovedModelSpec.of(
                enumValue(Capability.class, reqStr(e, "capability")),
                reqStr(e, "configuredProviderRef"),
                reqStr(e, "requestedModelId"),
                reqStr(e, "requestedModelVersion"),
                strSet(e, "allowedReportedModelIdAliases"),
                strSet(e, "allowedReportedModelVersionAliases"),
                reqStr(e, "endpointRef"),
                reqStr(e, "invocationProfileVersion"),
                enumValue(ModelScope.class, reqStr(e, "scope")));
    }

    private static String reqStr(JsonValue.JsonObject o, String key) {
        if (o.values().get(key) instanceof JsonValue.JsonString s) {
            return s.value();
        }
        throw new IllegalStateException("onaylı-model kaynağı: zorunlu string alan eksik/yanlış tip: " + key);
    }

    private static Set<String> strSet(JsonValue.JsonObject o, String key) {
        JsonValue v = o.values().get(key);
        if (v == null) {
            return Set.of();
        }
        if (!(v instanceof JsonValue.JsonArray a)) {
            throw new IllegalStateException("onaylı-model kaynağı: " + key + " dizi olmalı (fail-closed)");
        }
        LinkedHashSet<String> out = new LinkedHashSet<>();
        for (JsonValue el : a.items()) {
            if (!(el instanceof JsonValue.JsonString s)) {
                throw new IllegalStateException("onaylı-model kaynağı: " + key + " string eleman içermeli");
            }
            if (!out.add(s.value())) {
                throw new IllegalStateException("onaylı-model kaynağı: " + key + " yinelenen alias: " + s.value());
            }
        }
        return out;
    }

    private static <E extends Enum<E>> E enumValue(Class<E> type, String raw) {
        try {
            return Enum.valueOf(type, raw);
        } catch (IllegalArgumentException ex) {
            throw new IllegalStateException("onaylı-model kaynağı: " + type.getSimpleName()
                    + " kapalı-küme dışı değer (fail-closed): " + raw);
        }
    }

    @Override
    public Outcome<ApprovedModelSpec> resolve(ModelApprovalRef ref, Capability capability) {
        return delegate.resolve(ref, capability);
    }

    @Override
    public Outcome<ApprovedModelSpec> resolveConfigured(
            Capability capability, String configuredProviderRef,
            String requestedModelId, String requestedModelVersion) {
        return delegate.resolveConfigured(capability, configuredProviderRef, requestedModelId, requestedModelVersion);
    }

    /** READ-ONLY discovery (PORT DIŞI): yüklü catalog spec'lerinin değişmez kopyası — delegate'e devreder. */
    public List<ApprovedModelSpec> approvedSpecs() {
        return delegate.approvedSpecs();
    }

    /** READ-ONLY discovery (PORT DIŞI): provider-ref için capability→onay-ref eşlemesi — delegate'e devreder. */
    public Map<Capability, ModelApprovalRef> approvalRefsFor(String configuredProviderRef) {
        return delegate.approvalRefsFor(configuredProviderRef);
    }
}
