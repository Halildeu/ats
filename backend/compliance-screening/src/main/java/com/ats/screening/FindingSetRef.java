package com.ats.screening;

import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.regex.Pattern;

/**
 * Bir bulgu-kümesine OPAK, KRİPTOGRAFİK-RASTGELE referans: {@code fsr_<64-küçük-hex>} — hex =
 * {@link SecureRandom}'dan üretilen 32-baytın küçük-hex kodlaması ({@link ScreeningRunId#random()}
 * deseni). Değer İÇERİK-ADRESLİ DEĞİLDİR: aynı bulgu-kümesi iki taramada FARKLI ref üretir; ref
 * bulgu-içeriğinden türetilmez. Böylece (a) çapraz-aday bağlanabilirliği (linkability) engellenir,
 * (b) boş-sonuç çakışması olmaz, (c) WORM işaretçisine hassas-hash taşınmaz.
 *
 * <p>Bulgu-içerik özeti (dedup gerektiğinde) YALNIZ 156-b restricted-store'un konusudur; bu ref /
 * {@link ScreeningResult} / WORM işaretçisi ASLA içerik-özeti taşımaz.
 *
 * <p>Değişmez değer nesnesi; kurucu formatı fail-closed doğrular.
 */
public record FindingSetRef(String value) {

    private static final Pattern FORMAT = Pattern.compile("fsr_[0-9a-f]{64}");
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int RANDOM_BYTES = 32; // 256-bit opak; 64 küçük-hex

    public FindingSetRef {
        if (value == null || !FORMAT.matcher(value).matches()) {
            throw new IllegalArgumentException(
                    "FindingSetRef biçimi geçersiz (beklenen fsr_<64-küçük-hex>): " + value);
        }
    }

    /** 64-karakter küçük-hex değerden {@code fsr_}-önekli ref üretir. */
    static FindingSetRef fromHex(String lowercaseHex64) {
        return new FindingSetRef("fsr_" + lowercaseHex64);
    }

    /** Yeni KRİPTOGRAFİK-RASTGELE opak ref ({@link SecureRandom} 32-bayt → 64 küçük-hex). */
    static FindingSetRef random() {
        byte[] bytes = new byte[RANDOM_BYTES];
        RANDOM.nextBytes(bytes);
        return fromHex(HexFormat.of().formatHex(bytes));
    }
}
