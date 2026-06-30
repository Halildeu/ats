/**
 * ATS-0011 typed component CONTRACTS (gate-safe — yalnız prop tip sözleşmeleri; runtime/JSX YOK).
 *
 * Bu dosya UI bileşenlerinin prop yüzeyini sabitler: tüm metin i18n-anahtarı (serbest metin YOK),
 * tüm veri opak-ref (ham PII/transkript/score/affect YOK — ATS-0003/0005). React import edilmez
 * (runtime bağımlılığı yok); P1'de gerçek bileşen bu sözleşmeleri uygular.
 *
 * No-Fake-Work: bu dosya "UI yapıldı" iddia ETMEZ; yalnız prop kontratıdır.
 */

/** i18n mesaj anahtarı (web/i18n/tr-TR.json içinde tanımlı olmalı — guard doğrular). */
export type MessageKey = string;
/** Opak referans (PII/içerik değil) — evidence-packet ref pattern'i ile uyumlu. */
export type OpaqueRef = string;

/** Erişilebilir buton: metin i18n-anahtarı; target-size token'dan; serbest-metin yok. */
export interface ButtonContract {
  readonly labelKey: MessageKey;
  readonly variant: "primary" | "secondary" | "danger";
  readonly disabled?: boolean;
  /** WCAG 2.5.8 — min hedef boyut design-token'dan (≥24px); bileşen override edemez. */
  readonly minTargetPx: 24 | 44;
}

/** Aydınlatma + açık rıza afişi (consent.recorded olayını tetikler). */
export interface ConsentBannerContract {
  readonly titleKey: MessageKey;
  readonly bodyKey: MessageKey;
  readonly recordKey: MessageKey;
  readonly withdrawKey: MessageKey;
  /** rıza durumu opak referans (aday-PII değil). */
  readonly consentRef?: OpaqueRef;
}

/** Kanıt rozeti: iddia↔kaynak alıntı; entailment görünür; score/affect YOK. */
export interface EvidenceBadgeContract {
  readonly claimRef: OpaqueRef;
  readonly sourceSegmentRefs: readonly OpaqueRef[];
  readonly entailment: "supported" | "partially_supported" | "unsupported";
  /** unsupported → karar-kanıtı olarak SUNULMAZ (görsel uyarı; evidence.unsupportedFlag). */
  readonly unsupportedNoticeKey?: MessageKey;
}

/** İnsan inceleme paneli: gerekçe girişi + finalize (human-oversight FINALIZED ile hizalı). */
export interface ReviewPanelContract {
  readonly rationaleLabelKey: MessageKey;
  readonly finalizeKey: MessageKey;
  readonly humanActorRef: OpaqueRef;
  readonly oversightRoleRef: OpaqueRef;
  /** finalize yalnız gerekçe + en az bir desteklenen kanıt ref ile etkin (P1 runtime). */
  readonly decisionEvidenceRefs: readonly OpaqueRef[];
}
