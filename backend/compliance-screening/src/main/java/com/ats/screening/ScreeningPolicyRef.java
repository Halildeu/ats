package com.ats.screening;

import java.util.regex.Pattern;

/**
 * Sürümlü, OPAK kanonik-policy referansı: {@code paspolicy_v<n>} (protected-attribute-screening
 * policy). Değişmez değer nesnesi; kurucu biçimi fail-closed doğrular (serbest string nesneye
 * dönüşmez). Bu ref yalnız "hangi policy sürümü" bilgisini taşır — kural içeriği/secret taşımaz.
 */
public record ScreeningPolicyRef(String value) {

    private static final Pattern FORMAT = Pattern.compile("paspolicy_v[0-9]+");

    public ScreeningPolicyRef {
        if (!isValid(value)) {
            throw new IllegalArgumentException(
                    "ScreeningPolicyRef biçimi geçersiz (beklenen paspolicy_v<n>): " + value);
        }
    }

    /** Biçim-geçerli mi (nesne üretmeden). */
    public static boolean isValid(String value) {
        return value != null && FORMAT.matcher(value).matches();
    }
}
