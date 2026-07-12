package com.ats.contracts.governance;

import com.ats.kernel.JsonCodec;
import com.ats.kernel.JsonValue;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Pattern;

/**
 * P3-gov0 onaylı-model politika kaydı (değişmez, doğrulanmış). Bir yeteneğin
 * (capability) hangi sağlayıcı-referansı + model-id + versiyonla çalışmasının
 * ONAYLANDIĞINI ve sağlayıcının RAPORLADIĞI hangi model-id/versiyon değerlerinin
 * kabul edileceğini (alias'lar) tanımlar. {@link #approvalRef} İÇERİK-ADRESLİdir:
 * politika alanlarının (status HARİÇ) kanonik SHA-256'sıdır — durum değişse (APPROVED→
 * REVOKED) ref DEĞİŞMEZ, ama herhangi bir politika alanı değişirse ref değişir.
 *
 * <p>Tüm string alanlar fail-closed doğrulanır: boş-değil, ≤128, izin-listesi
 * {@code [A-Za-z0-9._:@/-]} (kontrol/boşluk/URL/secret sızıntısı YOK), {@code ://}
 * reddedilir. {@code endpointRef} opaktır (URL/token değil). Alias öğeleri aynı
 * kurallarla doğrulanır; kanonik değer kendi alias kümesinde OLAMAZ; id-alias yalnız
 * id, versiyon-alias yalnız versiyon içindir (yapısal ayrım).
 *
 * <p>Sağlanış: {@link #of} politika alanlarından ref'i TÜRETİR ve kurar; kanonik
 * kurucu ise verilen {@code approvalRef}'in yeniden-hesaplanan digest'e EŞİT olmasını
 * zorunlu kılar — eşleşmeyen ref taşımak imkânsızdır (fail-closed).
 */
public record ApprovedModelSpec(
        ModelApprovalRef approvalRef,
        Capability capability,
        String configuredProviderRef,
        String requestedModelId,
        String requestedModelVersion,
        Set<String> allowedReportedModelIdAliases,
        Set<String> allowedReportedModelVersionAliases,
        String endpointRef,
        String invocationProfileVersion,
        ApprovalStatus status,
        ModelScope scope) {

    private static final int MAX_LEN = 128;
    private static final Pattern VALUE = Pattern.compile("[A-Za-z0-9._:@/-]{1,128}");

    public ApprovedModelSpec {
        if (capability == null) {
            throw new IllegalArgumentException("capability zorunlu (fail-closed)");
        }
        if (status == null) {
            throw new IllegalArgumentException("status zorunlu (fail-closed)");
        }
        if (scope == null) {
            throw new IllegalArgumentException("scope zorunlu (fail-closed)");
        }
        if (scope != ModelScope.GLOBAL) {
            throw new IllegalArgumentException("yalnız GLOBAL scope destekli (şimdilik): " + scope);
        }
        validateValue(configuredProviderRef, "configuredProviderRef");
        validateValue(requestedModelId, "requestedModelId");
        validateValue(requestedModelVersion, "requestedModelVersion");
        validateValue(invocationProfileVersion, "invocationProfileVersion");
        validateEndpointRef(endpointRef);

        // alias kümeleri: doğrula + sırala + değişmez kopya + kanonik-kendi-alias yasağı
        allowedReportedModelIdAliases = normalizeAliases(
                allowedReportedModelIdAliases, requestedModelId, "allowedReportedModelIdAliases");
        allowedReportedModelVersionAliases = normalizeAliases(
                allowedReportedModelVersionAliases, requestedModelVersion, "allowedReportedModelVersionAliases");

        // içerik-adresli bütünlük: approvalRef == yeniden-hesaplanan digest olmalı
        if (approvalRef == null) {
            throw new IllegalArgumentException("approvalRef zorunlu (fail-closed)");
        }
        ModelApprovalRef recomputed = computeApprovalRef(capability, configuredProviderRef,
                requestedModelId, requestedModelVersion, allowedReportedModelIdAliases,
                allowedReportedModelVersionAliases, endpointRef, invocationProfileVersion, scope);
        if (!approvalRef.equals(recomputed)) {
            throw new IllegalArgumentException(
                    "approvalRef içerik-adresli digest ile uyuşmuyor (fail-closed): verilen="
                    + approvalRef.value() + " beklenen=" + recomputed.value());
        }
    }

    /**
     * Politika alanlarından {@link ModelApprovalRef}'i TÜRETİR ve kaydı kurar —
     * çağıran yanlış/eşleşmeyen ref veremez. Alias kümeleri null → boş.
     */
    public static ApprovedModelSpec of(
            Capability capability,
            String configuredProviderRef,
            String requestedModelId,
            String requestedModelVersion,
            Set<String> allowedReportedModelIdAliases,
            Set<String> allowedReportedModelVersionAliases,
            String endpointRef,
            String invocationProfileVersion,
            ApprovalStatus status,
            ModelScope scope) {
        Set<String> idAliases = allowedReportedModelIdAliases == null ? Set.of() : allowedReportedModelIdAliases;
        Set<String> versionAliases = allowedReportedModelVersionAliases == null ? Set.of() : allowedReportedModelVersionAliases;
        ModelApprovalRef ref = computeApprovalRef(capability, configuredProviderRef, requestedModelId,
                requestedModelVersion, idAliases, versionAliases, endpointRef, invocationProfileVersion, scope);
        return new ApprovedModelSpec(ref, capability, configuredProviderRef, requestedModelId,
                requestedModelVersion, idAliases, versionAliases, endpointRef, invocationProfileVersion, status, scope);
    }

    /** Bu kaydın içerik-adresli digest'i (== {@link #approvalRef}; determinist yeniden-hesap). */
    public ModelApprovalRef canonicalDigest() {
        return computeApprovalRef(capability, configuredProviderRef, requestedModelId, requestedModelVersion,
                allowedReportedModelIdAliases, allowedReportedModelVersionAliases, endpointRef,
                invocationProfileVersion, scope);
    }

    /**
     * Sağlayıcının RAPORLADIĞI model-id/versiyon bu onaya UYUYOR mu (alan-bazlı, TAM eşleşme).
     * Var olan raporlanan id: {@code == requestedModelId} VEYA id-alias'larda olmalı; versiyon aynı
     * kural. YOK (null/boş) alan uyuşmazlık DEĞİLDİR. Normalizasyon/contains/prefix/case-fold YOK.
     */
    public boolean matchesReported(String reportedModelId, String reportedModelVersion) {
        boolean idMatch = isAbsent(reportedModelId)
                || reportedModelId.equals(requestedModelId)
                || allowedReportedModelIdAliases.contains(reportedModelId);
        boolean versionMatch = isAbsent(reportedModelVersion)
                || reportedModelVersion.equals(requestedModelVersion)
                || allowedReportedModelVersionAliases.contains(reportedModelVersion);
        return idMatch && versionMatch;
    }

    /**
     * İçerik-adresli digest hesabı: politika alanlarının KANONİK serileştirmesi
     * (sabit alan kümesi — kernel {@link JsonCodec} anahtarları sıralar; alias dizileri
     * leksikografik sıralı; boşluk-varyansı yok) → SHA-256 → {@code mapr_<hex>}. status DAHİL DEĞİL.
     */
    public static ModelApprovalRef computeApprovalRef(
            Capability capability,
            String configuredProviderRef,
            String requestedModelId,
            String requestedModelVersion,
            Set<String> idAliases,
            Set<String> versionAliases,
            String endpointRef,
            String invocationProfileVersion,
            ModelScope scope) {
        Map<String, JsonValue> obj = new LinkedHashMap<>();
        obj.put("capability", JsonValue.of(capability.name()));
        obj.put("configuredProviderRef", JsonValue.of(configuredProviderRef));
        obj.put("requestedModelId", JsonValue.of(requestedModelId));
        obj.put("requestedModelVersion", JsonValue.of(requestedModelVersion));
        obj.put("allowedReportedModelIdAliases", sortedArray(idAliases));
        obj.put("allowedReportedModelVersionAliases", sortedArray(versionAliases));
        obj.put("endpointRef", JsonValue.of(endpointRef));
        obj.put("invocationProfileVersion", JsonValue.of(invocationProfileVersion));
        obj.put("scope", JsonValue.of(scope.name()));
        String canonical = JsonCodec.canonical(JsonValue.object(obj));
        return ModelApprovalRef.fromDigestHex(sha256Hex(canonical));
    }

    private static JsonValue sortedArray(Set<String> values) {
        if (values == null || values.isEmpty()) {
            return new JsonValue.JsonArray(List.of());
        }
        List<JsonValue> items = new ArrayList<>();
        for (String v : new TreeSet<>(values)) {
            items.add(JsonValue.of(v));
        }
        return new JsonValue.JsonArray(items);
    }

    private static Set<String> normalizeAliases(Set<String> aliases, String canonical, String field) {
        if (aliases == null || aliases.isEmpty()) {
            return Set.of();
        }
        TreeSet<String> out = new TreeSet<>();
        for (String a : aliases) {
            validateValue(a, field + " öğesi");
            if (a.equals(canonical)) {
                throw new IllegalArgumentException(
                        field + ": kanonik değer kendi alias kümesinde olamaz: " + a);
            }
            out.add(a);
        }
        return Collections.unmodifiableSet(out);
    }

    private static void validateValue(String v, String field) {
        if (v == null || v.isBlank()) {
            throw new IllegalArgumentException(field + " boş olamaz (fail-closed)");
        }
        if (v.length() > MAX_LEN) {
            throw new IllegalArgumentException(field + " uzunluk sınırı aşıldı (<=" + MAX_LEN + "): " + v.length());
        }
        if (!VALUE.matcher(v).matches()) {
            throw new IllegalArgumentException(
                    field + " izin-listesi dışı karakter [A-Za-z0-9._:@/-] (kontrol/boşluk/URL/secret YOK): " + v);
        }
        if (v.contains("://")) {
            throw new IllegalArgumentException(field + " '://' içeremez (URL/secret sızıntı guard'ı): " + v);
        }
    }

    /** endpointRef opaktır: değer kuralları + URL-benzeri ({@code //}) reddi (whitespace zaten izin-listesi dışı). */
    private static void validateEndpointRef(String v) {
        validateValue(v, "endpointRef");
        if (v.contains("//")) {
            throw new IllegalArgumentException(
                    "endpointRef URL-benzeri '//' içeremez (opak referans bekleniyor): " + v);
        }
    }

    private static boolean isAbsent(String s) {
        return s == null || s.isBlank();
    }

    private static String sha256Hex(String text) {
        try {
            return HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 mevcut olmalı", e);
        }
    }
}
