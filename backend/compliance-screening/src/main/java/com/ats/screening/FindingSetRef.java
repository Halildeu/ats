package com.ats.screening;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.regex.Pattern;

/**
 * Bir bulgu-kümesine İÇERİK-ADRESLİ, OPAK referans: {@code fsr_<64-küçük-hex>} — hex = bulgu
 * kümesinin kanonik serileştirmesinin SHA-256'sı. Aynı bulgu-kümesi → aynı ref (deterministik);
 * içerik değişirse ref değişir. Ham eşleşme-metni TAŞIMAZ (yalnız kategori+sinyal+span'lerden
 * türetilir). 156-b restricted-store bu ref'i saklama anahtarı olarak kullanabilir (burada
 * yalnız türetim + biçim vardır; persistence YOK).
 *
 * <p>Değişmez değer nesnesi; kurucu formatı fail-closed doğrular.
 */
public record FindingSetRef(String value) {

    private static final Pattern FORMAT = Pattern.compile("fsr_[0-9a-f]{64}");

    public FindingSetRef {
        if (value == null || !FORMAT.matcher(value).matches()) {
            throw new IllegalArgumentException(
                    "FindingSetRef biçimi geçersiz (beklenen fsr_<64-küçük-hex>): " + value);
        }
    }

    /** 64-karakter küçük-hex digest'ten {@code fsr_}-önekli ref üretir. */
    static FindingSetRef fromDigestHex(String lowercaseHex64) {
        return new FindingSetRef("fsr_" + lowercaseHex64);
    }

    /** Kanonik bulgu-serileştirmesinden içerik-adresli ref türetir (deterministik SHA-256). */
    static FindingSetRef ofCanonical(String canonical) {
        try {
            String hex = HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(canonical.getBytes(StandardCharsets.UTF_8)));
            return fromDigestHex(hex);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 mevcut olmalı", e);
        }
    }
}
