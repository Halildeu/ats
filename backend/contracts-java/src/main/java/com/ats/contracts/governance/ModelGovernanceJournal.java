package com.ats.contracts.governance;

import com.ats.contracts.AIProvider;
import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;

/**
 * gov1-1d AI-invocation WORM governance-journal'ı (PORT; adapter model-governance modülünde,
 * {@code EvidenceLedger} destekli). Her AI çağrı-denemesini İKİ-FAZLI kaydeder:
 *
 * <ol>
 *   <li>{@link #recordAuthorized} — çağrı-ÖNCESİ (preflight ALLOW sonrası, sağlayıcıdan önce):
 *       yeteneğe bağlı onaylı-model kimliği + endpoint + invocation-profile WORM'a yazılır. Bu
 *       append başarısızsa orkestrasyon sağlayıcıyı ÇAĞIRMAZ (fail-closed).</li>
 *   <li>{@link #recordTerminal} — çağrı-SONRASI TERMINAL: preflight-red / provider-red /
 *       verification-red / attested. Her invocation için EN FAZLA bir terminal (idempotency-key
 *       ile makine-zorlanır). {@code attested} terminali business sonucu depolanmadan/business-WORM'a
 *       yazılmadan ÖNCE gelmelidir (Codex full ordering).</li>
 * </ol>
 *
 * <p><b>Crash-gap makine-tespiti:</b> authorized VAR + terminal YOK = eksik/crash-gap;
 * post-provider terminal VAR + authorized YOK = bütünlük-anomalisi; iki-terminal =
 * idempotency/bütünlük anomalisi. Bu eşleştirme (adapter tarafı projeksiyonda) yalnız
 * WORM event'lerinden yapılır — Plane-1 log YALNIZ {@link JournalReceipt#evidenceId()}
 * pointer'ını taşır (governance-metadata Plane-2 WORM'da kalır).
 *
 * <p><b>Sınır (1d):</b> approval-authority (1e) BURADA YOK. Payload YALNIZ governance-metadata
 * taşır (invocation-id/capability/onay-ref/intended+observed model kimliği/decision/reason/stage);
 * claim/transcript/audio-object-ref/provider-ham-hata/URL/bearer/secret ASLA (fail-closed).
 */
public interface ModelGovernanceJournal {

    /**
     * Çağrı-öncesi authorized event'i (permit boot-snapshot ile EXACT re-verify edilir; uyuşmazlık →
     * fail-closed, WORM'a YAZILMAZ). {@code Outcome.Ok(JournalReceipt)} → orkestrasyon sağlayıcıya
     * devam eder; {@code Outcome.Fail} → orkestrasyon AUDIT_UNAVAILABLE ile durur (sağlayıcı çağrılmaz).
     */
    Outcome<JournalReceipt> recordAuthorized(
            InvocationContext ctx, ModelInvocationId id, ModelGovernanceGate.Permit permit);

    /**
     * Terminal event (varyanta göre eventType/payload). Permit taşıyan varyantlar permit'i
     * boot-snapshot ile re-verify eder (uyuşmazlık → fail-closed, WORM'a YAZILMAZ). {@code Outcome.Fail}
     * → orkestrasyon fail-closed davranır (attested-append fail'de business sonucu TAMAMEN discard).
     */
    Outcome<JournalReceipt> recordTerminal(
            InvocationContext ctx, ModelInvocationId id, Terminal terminal);

    /**
     * WORM append için gereken tenant-scoped bağlam (orkestrasyondan gelir). Adapter/onay tipleri
     * DEĞİL — yalnız kimlik alanları (tenant/interview/actor); non-null (fail-closed).
     */
    record InvocationContext(TenantId tenantId, InterviewId interviewId, ActorId actorId) {
        public InvocationContext {
            if (tenantId == null) {
                throw new IllegalArgumentException("InvocationContext.tenantId zorunlu (fail-closed)");
            }
            if (interviewId == null) {
                throw new IllegalArgumentException("InvocationContext.interviewId zorunlu (fail-closed)");
            }
            if (actorId == null) {
                throw new IllegalArgumentException("InvocationContext.actorId zorunlu (fail-closed)");
            }
        }
    }

    /** Journal append makbuzu — Plane-1 YALNIZ bu WORM-pointer'ı loglar (governance-metadata WORM'da). */
    record JournalReceipt(String evidenceId) {
        public JournalReceipt {
            if (evidenceId == null || evidenceId.isBlank()) {
                throw new IllegalArgumentException("JournalReceipt.evidenceId zorunlu (fail-closed)");
            }
        }
    }

    /**
     * Terminal varyantları (sealed → exhaustive; adapter switch'i tüm dalları kapsar). Reason her
     * zaman tipli {@link ModelGovernanceGate.Reason} (serbest string YOK). Yaşam-döngüsü değişmezleri
     * compact-ctor'da zorlanır: {@link Attested} yalnız ALLOW; {@link VerificationRejected} yalnız DENY.
     */
    sealed interface Terminal
            permits PreflightRejected, InvocationPreparationRejected,
                    ProviderRejected, VerificationRejected, Attested {}

    /**
     * Preflight RED (provider HİÇ çağrılmadı) — permit YOK; adapter intended-alanları boot-snapshot'tan
     * tamamlar (binding yoksa UNAVAILABLE + intended null; UYDURMA yok). Reason = preflight'ın ürettiği
     * tipli gerekçe (ör. APPROVAL_NOT_ACTIVE / REGISTRY_UNAVAILABLE).
     */
    record PreflightRejected(Capability capability, ModelGovernanceGate.Reason reason) implements Terminal {
        public PreflightRejected {
            if (capability == null) {
                throw new IllegalArgumentException("PreflightRejected.capability zorunlu (fail-closed)");
            }
            if (reason == null) {
                throw new IllegalArgumentException("PreflightRejected.reason zorunlu (fail-closed)");
            }
        }
    }

    /**
     * Post-authorized ama pre-provider hazırlık başarısızlığı (ör. ses-erişim grant'i verilemedi):
     * {@link #recordAuthorized} WORM'a YAZILDI ama sağlayıcı HİÇ çağrılmadı. Bu ayrı terminal olmadan
     * projeksiyon yanlışlıkla {@code INCOMPLETE_CRASH_GAP} raporlardı (oysa çağrı hiç yapılmadı; crash yok).
     * {@link ProviderRejected} KULLANILMAZ — o COMPLETE_INVOKED (provider çağrıldı) iddiasıdır. Permit
     * taşır (authorized ile aynı permit; adapter boot-snapshot re-verify eder). Reason değişmez
     * {@link ModelGovernanceGate.Reason#INVOCATION_PREPARATION_FAILED} (caller değiştiremez).
     */
    record InvocationPreparationRejected(ModelGovernanceGate.Permit permit) implements Terminal {
        public InvocationPreparationRejected {
            if (permit == null) {
                throw new IllegalArgumentException("InvocationPreparationRejected.permit zorunlu (fail-closed)");
            }
        }

        /** Değişmez terminal reason: post-authorized pre-provider hazırlık arızası (governance verdict'i DEĞİL). */
        public ModelGovernanceGate.Reason reason() {
            return ModelGovernanceGate.Reason.INVOCATION_PREPARATION_FAILED;
        }
    }

    /**
     * Sağlayıcı çağrısı başarısız (authorized'dan SONRA; observed model YOK). Reason değişmez
     * {@link ModelGovernanceGate.Reason#PROVIDER_FAILED} (caller değiştiremez → non-component accessor).
     */
    record ProviderRejected(ModelGovernanceGate.Permit permit) implements Terminal {
        public ProviderRejected {
            if (permit == null) {
                throw new IllegalArgumentException("ProviderRejected.permit zorunlu (fail-closed)");
            }
        }

        /** Değişmez terminal reason: sağlayıcı-arızası (governance verdict'i DEĞİL). */
        public ModelGovernanceGate.Reason reason() {
            return ModelGovernanceGate.Reason.PROVIDER_FAILED;
        }
    }

    /**
     * Sonuç-sonrası doğrulama DENY (sağlayıcı raporladı ama onaylı spec'e uymadı / TOCTOU-revoke).
     * {@code reported} = ham (sanitize edilmiş) provider-beyanı — observed_* buradan yazılır (DENY
     * kararı ham identity'yi saklar; journal forensik için provider'ın NE beyan ettiğini kaydeder).
     * Yalnız {@code decision.allowed()==false} kabul (compact-ctor enforce).
     */
    record VerificationRejected(
            ModelGovernanceGate.Permit permit,
            AIProvider.ReportedModelIdentity reported,
            ModelGovernanceGate.Decision decision) implements Terminal {
        public VerificationRejected {
            requireCommon(permit, reported, decision, "VerificationRejected");
            if (decision.allowed()) {
                throw new IllegalArgumentException(
                        "VerificationRejected yalnız DENY kararı taşır (fail-closed)");
            }
        }
    }

    /**
     * Doğrulanmış ALLOW (onaylı model attest edildi). observed_* = {@code decision}'ın DOĞRULANMIŞ
     * observed kimliği (ALLOW değişmezi: non-null). Yalnız {@code decision.allowed()==true} kabul.
     */
    record Attested(
            ModelGovernanceGate.Permit permit,
            AIProvider.ReportedModelIdentity reported,
            ModelGovernanceGate.Decision decision) implements Terminal {
        public Attested {
            requireCommon(permit, reported, decision, "Attested");
            if (!decision.allowed()) {
                throw new IllegalArgumentException(
                        "Attested yalnız ALLOW kararı taşır (fail-closed)");
            }
        }
    }

    /** Permit-taşıyan terminal varyantları için ortak non-null + permit↔decision capability tutarlılığı. */
    private static void requireCommon(
            ModelGovernanceGate.Permit permit,
            AIProvider.ReportedModelIdentity reported,
            ModelGovernanceGate.Decision decision,
            String variant) {
        if (permit == null) {
            throw new IllegalArgumentException(variant + ".permit zorunlu (fail-closed)");
        }
        if (reported == null) {
            throw new IllegalArgumentException(variant + ".reported zorunlu (zarf non-null; fail-closed)");
        }
        if (decision == null) {
            throw new IllegalArgumentException(variant + ".decision zorunlu (fail-closed)");
        }
        if (decision.capability() != permit.capability()) {
            throw new IllegalArgumentException(
                    variant + ": decision.capability permit.capability ile uyuşmalı (fail-closed)");
        }
    }
}
