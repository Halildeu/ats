package com.ats.contracts.governance;

import com.ats.contracts.AIProvider;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;

/**
 * gov1-1c çalışma-anı model-governance KAPISI (port; adapter model-governance modülünde).
 * Bir AI çağrısının ETRAFINA fail-closed iki-fazlı denetim koyar:
 *
 * <ol>
 *   <li>{@link #preflight(Capability)} — çağrıdan ÖNCE: yeteneğe bağlı onaylı-model çözülür;
 *       APPROVED değilse {@link Permit} VERİLMEZ (fail-closed {@code Outcome.Fail}) → sağlayıcı
 *       HİÇ çağrılmaz.</li>
 *   <li>{@link #verify(Permit, AIProvider.ReportedModelIdentity)} — sonuç SONRASI: aynı onay
 *       YENİDEN çözülür (TOCTOU) + sağlayıcının RAPORLADIĞI (untrusted) model kimliği onaylı
 *       spec ile HARD-REQUIRED eşleşir. Sonuç bir {@link Decision}'dır: ALLOW ancak doğrulanmış
 *       kimlikle döner; DENY'de çağıran orkestrasyon sonucu TAMAMEN discard etmelidir
 *       (transcript/citation/business-WORM'a YAZMAZ).</li>
 * </ol>
 *
 * <p><b>Fail-closed sözleşme:</b> {@link #preflight} RED'i {@code Outcome.Fail}'dir ({@link Permit}
 * bir RED'i temsil edemez → naive {@code isOk()} kontrolü otomatik kapanır). {@link #verify}
 * yapılandırılmış bir {@link Decision} döner; çağıran {@link Decision#allowed()} DOĞRU olmadıkça
 * ilerlememelidir — {@code isOk()} tek başına YETMEZ (RED de {@code Outcome.Ok(Decision[DENY])}'dir;
 * {@code Outcome.Fail} yalnız {@code permit==null} sözleşme-ihlalindedir). Tipli {@link Reason}
 * vokabüleri kapalı kümedir (serbest string YOK). Kapı EXCEPTION atmaz; secret/ham-reported-identity
 * mesaja/loga/RED yüzeyine yazılmaz (yalnız Reason token'ı + onaylı-policy kimliği).
 *
 * <p><b>Sınır (1c):</b> WORM invocation journal (1d) ve approval-authority (1e) BURADA YOK.
 */
public interface ModelGovernanceGate {

    /**
     * Çağrı-öncesi kapı: {@code capability} için onaylı-model çözülür. APPROVED ise {@link Permit}
     * (downstream metadata + verify bağlamı) döner; aksi halde fail-closed {@code Outcome.Fail}
     * (tipli {@link Reason}, {@code reason()==Reason.name()}, {@code code()==Reason.outcomeCode()}).
     */
    Outcome<Permit> preflight(Capability capability);

    /**
     * Sonuç-sonrası kapı: {@code permit}'in onayı YENİDEN çözülür (çağrı sırasında REVOKED olmuş
     * olabilir — TOCTOU) ve sağlayıcının RAPORLADIĞI kimliği ({@code reported}) onaylı spec ile
     * HARD-REQUIRED eşleşir. ALLOW → {@code Outcome.Ok(Decision.allow(...))}; DENY →
     * {@code Outcome.Ok(Decision.deny(reason))} (fail-closed: çağıran {@link Decision#allowed()}
     * KONTROL ETMELİ). {@code permit==null} → {@code Outcome.Fail(INVALID)}.
     */
    Outcome<Decision> verify(Permit permit, AIProvider.ReportedModelIdentity reported);

    /**
     * KAPALI red-gerekçesi vokabüleri (serbest string YOK). Her değer bir kernel {@link OutcomeCode}
     * taşır (HTTP/observability haritalaması için). Kapı-adapter'ının ürettiği alt-küme:
     * {@code REGISTRY_UNAVAILABLE, APPROVAL_NOT_FOUND, APPROVAL_NOT_ACTIVE, CAPABILITY_MISMATCH,
     * REPORTED_IDENTITY_MISSING, REPORTED_IDENTITY_MALFORMED, MODEL_ID_MISMATCH,
     * MODEL_VERSION_MISMATCH}. {@code PROVIDER_FAILED}/{@code AUDIT_UNAVAILABLE} paylaşımlı
     * vokabülerdir (orkestrasyon/1d yüzeyi); kapı bunları döndürmez.
     */
    enum Reason {
        /** Onaylı-model registry erişilemez (fail-closed). */
        REGISTRY_UNAVAILABLE(OutcomeCode.NOT_CONFIGURED),
        /** Yeteneğe bağlı onay-ref yok / registry'de bulunamadı. */
        APPROVAL_NOT_FOUND(OutcomeCode.NOT_FOUND),
        /** Onay bulundu ama APPROVED değil (REVOKED/DRAFT). */
        APPROVAL_NOT_ACTIVE(OutcomeCode.DENIED),
        /** Çözülen spec'in yeteneği istenen yetenekle uyuşmuyor (savunma-derinliği). */
        CAPABILITY_MISMATCH(OutcomeCode.DENIED),
        /** Sağlayıcı model kimliğini (id ve/veya versiyon) raporlamadı (absent → default-deny). */
        REPORTED_IDENTITY_MISSING(OutcomeCode.DENIED),
        /** Reported-kimlik zarfı yapısal olarak bozuk (ör. null zarf) — savunma-derinliği. */
        REPORTED_IDENTITY_MALFORMED(OutcomeCode.INVALID),
        /** Raporlanan model-id onaylı id/alias'larla eşleşmiyor. */
        MODEL_ID_MISMATCH(OutcomeCode.DENIED),
        /** Raporlanan model-versiyon onaylı versiyon/alias'larla eşleşmiyor. */
        MODEL_VERSION_MISMATCH(OutcomeCode.DENIED),
        /** Sağlayıcı çağrısı başarısız (orkestrasyon/1d yüzeyi; kapı döndürmez). */
        PROVIDER_FAILED(OutcomeCode.NOT_CONFIGURED),
        /** Denetim/WORM yazımı erişilemez (1d yüzeyi; kapı döndürmez). */
        AUDIT_UNAVAILABLE(OutcomeCode.NOT_CONFIGURED);

        private final OutcomeCode outcomeCode;

        Reason(OutcomeCode outcomeCode) {
            this.outcomeCode = outcomeCode;
        }

        public OutcomeCode outcomeCode() {
            return outcomeCode;
        }
    }

    /**
     * Fail-closed {@code Outcome.Fail} üreticisi (yalnız {@link #preflight}, {@link Permit} yükü
     * için): tipli {@link Reason}'ı Fail'e taşır — {@code code()==reason.outcomeCode()},
     * {@code reason()==reason.name()} (kapalı vokabüler; {@code Reason.valueOf} ile round-trip).
     */
    static Outcome<Permit> preflightDeny(Reason reason) {
        return Outcome.fail(reason.outcomeCode(), reason.name());
    }

    /**
     * Çağrı-öncesi onay yükü (ALLOW). Downstream 1d WORM invocation-journal için gereken
     * METADATA'yı taşır: yetenek + içerik-adresli onay-ref + onaylı sağlayıcı/model kimliği +
     * opak endpoint referansı + invocation-profile versiyonu. Alanlar onaylı bir
     * {@link ApprovedModelSpec}'ten türetilir (kaynakta zaten fail-closed doğrulanmış); kurucu
     * yine de non-null/non-blank zorunlu kılar (savunma-derinliği).
     */
    record Permit(
            Capability capability,
            ModelApprovalRef approvalRef,
            String providerRef,
            String modelId,
            String modelVersion,
            String endpointRef,
            String invocationProfileVersion) {

        public Permit {
            if (capability == null) {
                throw new IllegalArgumentException("Permit.capability zorunlu (fail-closed)");
            }
            if (approvalRef == null) {
                throw new IllegalArgumentException("Permit.approvalRef zorunlu (fail-closed)");
            }
            requirePresent(providerRef, "providerRef");
            requirePresent(modelId, "modelId");
            requirePresent(modelVersion, "modelVersion");
            requirePresent(endpointRef, "endpointRef");
            requirePresent(invocationProfileVersion, "invocationProfileVersion");
        }

        private static void requirePresent(String v, String field) {
            if (v == null || v.isBlank()) {
                throw new IllegalArgumentException("Permit." + field + " zorunlu (fail-closed)");
            }
        }
    }

    /**
     * Sonuç-sonrası karar: {@link Verdict#ALLOW}/{@link Verdict#DENY} + (RED'de) tipli
     * {@link Reason} + (ALLOW'da) onaylı spec ile eşleşmesi DOĞRULANMIŞ observed-kimlik özeti.
     *
     * <p>Değişmezler (fail-closed): ALLOW → {@code reasonCode==null} + observed alanları non-blank
     * (eşleşmesi kanıtlı, ham-untrusted değil). DENY → {@code reasonCode!=null} + observed alanları
     * {@code null} (ham reported-identity RED yüzeyine ASLA taşınmaz — DENY yalnız Reason token'ı).
     */
    record Decision(
            Verdict verdict,
            Reason reasonCode,
            ModelApprovalRef approvalRef,
            Capability capability,
            String observedModelId,
            String observedModelVersion) {

        public enum Verdict { ALLOW, DENY }

        public Decision {
            if (verdict == null) {
                throw new IllegalArgumentException("Decision.verdict zorunlu (fail-closed)");
            }
            if (approvalRef == null) {
                throw new IllegalArgumentException("Decision.approvalRef zorunlu (fail-closed)");
            }
            if (capability == null) {
                throw new IllegalArgumentException("Decision.capability zorunlu (fail-closed)");
            }
            if (verdict == Verdict.ALLOW) {
                if (reasonCode != null) {
                    throw new IllegalArgumentException("ALLOW kararı reasonCode taşıyamaz (fail-closed)");
                }
                if (isBlank(observedModelId) || isBlank(observedModelVersion)) {
                    throw new IllegalArgumentException(
                            "ALLOW kararı doğrulanmış observed-kimlik taşımalı (fail-closed)");
                }
            } else {
                if (reasonCode == null) {
                    throw new IllegalArgumentException("DENY kararı tipli Reason taşımalı (fail-closed)");
                }
                if (observedModelId != null || observedModelVersion != null) {
                    throw new IllegalArgumentException(
                            "DENY kararı ham reported-identity taşıyamaz (fail-closed)");
                }
            }
        }

        private static boolean isBlank(String s) {
            return s == null || s.isBlank();
        }

        /** ALLOW: doğrulanmış observed-kimlikle (id+version onaylı spec'e eşleşmiş). */
        public static Decision allow(
                ModelApprovalRef approvalRef, Capability capability,
                String observedModelId, String observedModelVersion) {
            return new Decision(Verdict.ALLOW, null, approvalRef, capability,
                    observedModelId, observedModelVersion);
        }

        /** DENY: yalnız tipli Reason (ham reported-identity taşımaz). */
        public static Decision deny(ModelApprovalRef approvalRef, Capability capability, Reason reason) {
            return new Decision(Verdict.DENY, reason, approvalRef, capability, null, null);
        }

        /** Fail-closed karar kapısı: yalnız ALLOW ise DOĞRU (çağıran bunu KONTROL ETMELİ). */
        public boolean allowed() {
            return verdict == Verdict.ALLOW;
        }
    }
}
