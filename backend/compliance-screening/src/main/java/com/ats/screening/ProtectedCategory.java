package com.ats.screening;

/**
 * KAPALI korumalı-özellik kategorileri (KVKK m.6 özel-nitelikli veri + işe-alım ayrımcılık
 * ekseni). Bu enum bilinçli olarak KAPALIDIR: yeni bir kategori yalnız kanonik-policy sürüm
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
    PREGNANCY_MATERNITY
}
