package com.ats.governance;

import com.ats.contracts.governance.ApprovalStatus;
import com.ats.contracts.governance.ApprovedModelRegistry;
import com.ats.contracts.governance.ApprovedModelSpec;
import com.ats.contracts.governance.Capability;
import com.ats.contracts.governance.ModelApprovalRef;
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
 * <p>Kaynak şeması: kök object, {@code "approvedModels"} dizisi; her öğe politika alanları +
 * {@code status}/{@code scope} (approvalRef VERİLMEZ — içerik-adresli, türetilir):
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
 *     "status": "APPROVED",
 *     "scope": "GLOBAL" } ] }
 * </pre>
 */
public final class FileBackedApprovedModelRegistry implements ApprovedModelRegistry {

    private final InMemoryApprovedModelRegistry delegate;

    private FileBackedApprovedModelRegistry(InMemoryApprovedModelRegistry delegate) {
        this.delegate = delegate;
    }

    public static FileBackedApprovedModelRegistry fromJson(String json) {
        return new FileBackedApprovedModelRegistry(InMemoryApprovedModelRegistry.of(parse(json)));
    }

    public static FileBackedApprovedModelRegistry fromClasspath(String resourcePath) {
        ClassLoader cl = FileBackedApprovedModelRegistry.class.getClassLoader();
        try (InputStream in = cl.getResourceAsStream(resourcePath)) {
            if (in == null) {
                throw new IllegalStateException(
                        "onaylı-model kaynağı classpath'te yok (fail-closed): " + resourcePath);
            }
            return fromJson(new String(in.readAllBytes(), StandardCharsets.UTF_8));
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
        return ApprovedModelSpec.of(
                enumValue(Capability.class, reqStr(e, "capability")),
                reqStr(e, "configuredProviderRef"),
                reqStr(e, "requestedModelId"),
                reqStr(e, "requestedModelVersion"),
                strSet(e, "allowedReportedModelIdAliases"),
                strSet(e, "allowedReportedModelVersionAliases"),
                reqStr(e, "endpointRef"),
                reqStr(e, "invocationProfileVersion"),
                enumValue(ApprovalStatus.class, reqStr(e, "status")),
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

    /** READ-ONLY discovery (PORT DIŞI): yüklü spec'lerin değişmez kopyası — delegate'e devreder. */
    public List<ApprovedModelSpec> approvedSpecs() {
        return delegate.approvedSpecs();
    }

    /** READ-ONLY discovery (PORT DIŞI): provider-ref için capability→onay-ref eşlemesi — delegate'e devreder. */
    public Map<Capability, ModelApprovalRef> approvalRefsFor(String configuredProviderRef) {
        return delegate.approvalRefsFor(configuredProviderRef);
    }
}
