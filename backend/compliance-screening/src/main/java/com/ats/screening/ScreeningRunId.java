package com.ats.screening;

import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Bir tarama çağrısı için OPAK, tek-kullanımlık kimlik: {@code psr_<uuid-v4-küçük-hex>}
 * (gov1 {@code ModelInvocationId} deseni). Her {@link ProtectedAttributeScreener#screen}
 * çağrısında bir kez üretilir (korelasyon anahtarı). TENANT/ADAY/İÇERİK TAŞIMAZ — yalnız
 * çalıştırma kimliğidir (veri-minimizasyonu).
 *
 * <p>Değişmez değer nesnesi; kurucu formatı fail-closed doğrular (UUID sürüm-4 nibble + variant
 * nibble zorunlu; yanlış biçim ASLA nesneye dönüşmez).
 */
public record ScreeningRunId(String value) {

    private static final Pattern FORMAT = Pattern.compile(
            "psr_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}");

    public ScreeningRunId {
        if (!isValid(value)) {
            throw new IllegalArgumentException(
                    "ScreeningRunId biçimi geçersiz (beklenen psr_<uuid-v4-küçük-hex>): " + value);
        }
    }

    /** Biçim-geçerli mi (nesne üretmeden). */
    public static boolean isValid(String value) {
        return value != null && FORMAT.matcher(value).matches();
    }

    /** Yeni rastgele (UUID v4) tarama kimliği; {@code UUID.toString()} zaten küçük-hex. */
    public static ScreeningRunId random() {
        return new ScreeningRunId("psr_" + UUID.randomUUID());
    }
}
