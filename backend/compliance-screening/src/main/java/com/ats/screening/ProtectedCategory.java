package com.ats.screening;

/**
 * KAPALI korumalı-özellik kategorileri — BİLEŞİK (composite) bir korumalı/işe-alım-uyum
 * taksonomisidir. Bu küme TAMAMEN KVKK m.6 özel-nitelikli-veri kümesi DEĞİLDİR: KVKK m.6 ekseni
 * ile daha geniş işe-alım-ayrımcılık ekseninin (ör. medeni/ebeveyn durumu, ana-dil/aksan, hamilelik)
 * bileşimidir. Enum bilinçli olarak KAPALIDIR: yeni bir kategori yalnız kanonik-policy sürüm
 * yükseltmesiyle (ve bu enum + parity-test güncellemesiyle) eklenebilir — serbest genişleme YOK.
 *
 * <p>Kategori = yalnız "hangi korumalı eksen" bilgisidir; aday hakkında bir HÜKÜM değildir
 * (bulgu insan-review'a sinyaldir). Ham eşleşme-metni bu enum'a taşınmaz.
 */
public enum ProtectedCategory {
    AGE,
    RELIGION_BELIEF,
    ETHNICITY_RACE,
    TRADE_UNION,
    HEALTH_DISABILITY,
    SEX_GENDER_ORIENTATION,
    MARITAL_PARENTAL_STATUS,
    POLITICAL_OPINION,
    PHILOSOPHICAL_BELIEF,
    CRIMINAL_RECORD,
    NATIVE_LANGUAGE_ACCENT,
    ASSOCIATION_MEMBERSHIP,
    PREGNANCY_MATERNITY,
    // #214: askerlik durumu iki zaten-korumalı eksene vekildir — Türkiye'de yalnız erkekler
    // yükümlü (SEX_GENDER_ORIENTATION vekili) ve "muaf" değeri çoğunlukla sağlık gerekçelidir
    // (HEALTH_DISABILITY vekili). paspolicy_v2 ile eklendi (v1 geriye dönük değiştirilmedi —
    // geçmiş tarama kayıtları v1 digest'ine bağlı).
    MILITARY_SERVICE_STATUS
}
