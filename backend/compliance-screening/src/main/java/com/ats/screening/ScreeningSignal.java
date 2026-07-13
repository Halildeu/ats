package com.ats.screening;

/**
 * KAPALI tarama sinyali. Yalnız İKİ değer: korumalı-özellik ANILMASI ve soru-kalıbı içinde
 * korumalı-özellik anılması. Bunlar İNSAN-reviewer için compliance sinyalidir; birer HÜKÜM
 * DEĞİLDİR.
 *
 * <p>YAPISAL YASAK (bu enum'a asla eklenmez): {@code ILLEGAL_QUESTION}, {@code DISCRIMINATION},
 * {@code CANDIDATE_ATTRIBUTE_CONFIRMED} vb. — "yasadışı soru / ayrımcılık / aday-özelliği-teyit
 * edildi" hükmü yalnız insan-review yetkisindedir, deterministik leksik tarayıcı veremez.
 */
public enum ScreeningSignal {
    /** Metinde korumalı-özellik ekseninin leksik anılması (beyan/ifade düzlemi). */
    PROTECTED_ATTRIBUTE_MENTION,
    /** Korumalı-özellik anılması bir SORU-KALIBI (interrogatif yapı) içinde geçiyor. */
    QUESTION_LIKE_PROTECTED_MENTION
}
