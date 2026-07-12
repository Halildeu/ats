package com.ats.contracts.governance;

import java.util.UUID;
import java.util.regex.Pattern;

/**
 * gov1-1d model-invocation için OPAK, tek-kullanımlık kimlik: {@code mgi_<uuid-v4-küçük-hex>}.
 * WORM invocation-journal'ın iki-fazlı (authorized/terminal) event'lerini AYNI çağrıya
 * bağlayan tek anahtar — {@link #random()} her orkestrasyon çağrısında bir kez üretilir
 * (preflight'tan hemen önce), authorized + terminal event'lerinde aynı değer taşınır ve
 * crash-gap projeksiyonu bu değere göre eşleştirme yapar.
 *
 * <p>Değişmez değer nesnesi; kurucu formatı fail-closed doğrular (yanlış biçim/serbest string
 * ASLA nesneye dönüşmez; UUID sürüm-4 nibble'ı + variant nibble'ı zorunlu). Bu tip TENANT/
 * INTERVIEW/MODEL/İÇERİK TAŞIMAZ — yalnız invocation korelasyon anahtarıdır (minimizasyon).
 */
public record ModelInvocationId(String value) {

    // UUID v4 lowercase: 8-4-4-4-12 hex; 3. grup '4' ile başlar (sürüm), 4. grup [89ab] ile (variant).
    private static final Pattern FORMAT = Pattern.compile(
            "mgi_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}");

    public ModelInvocationId {
        if (!isValid(value)) {
            // ham değeri mesaja koyma disiplini gereksiz (bu değer secret değil; ama biçim-beklentisi net).
            throw new IllegalArgumentException(
                    "ModelInvocationId biçimi geçersiz (beklenen mgi_<uuid-v4-küçük-hex>): " + value);
        }
    }

    /**
     * Biçim-geçerli mi (nesne üretmeden). Projeksiyon bozuk {@code invocation_id} taşıyan governance
     * satırını makine-tespit için kullanır (regex tek kaynak burada — vokabüler drift YOK).
     */
    public static boolean isValid(String value) {
        return value != null && FORMAT.matcher(value).matches();
    }

    /** Yeni rastgele (UUID v4) invocation kimliği; {@code UUID.toString()} zaten küçük-hex. */
    public static ModelInvocationId random() {
        return new ModelInvocationId("mgi_" + UUID.randomUUID());
    }
}
