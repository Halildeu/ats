package com.ats.contracts.governance;

import java.util.UUID;
import java.util.regex.Pattern;

/**
 * gov1-1e model-governance transition için OPAK, tek-kullanımlık kimlik: {@code mgt_<uuid-v4-küçük-hex>}.
 * GLOBAL append-only hash-chain'de bir {@link ModelGovernanceTransition}'ı benzersiz tanımlar ve
 * IDEMPOTENT-REPLAY anahtarıdır: aynı {@code transitionId} + byte-özdeş içerik yeniden gönderilirse
 * adapter mevcut satırla idempotent-OK döner (çift yazım YOK); farklı içerikle çakışır (fail-closed).
 *
 * <p>{@link ModelInvocationId} ile aynı format-pinli değer-nesnesi disiplini: kurucu formatı fail-closed
 * doğrular (yanlış biçim/serbest string ASLA nesneye dönüşmez; UUID sürüm-4 nibble'ı + variant nibble'ı
 * zorunlu). Bu tip TENANT/MODEL/İÇERİK TAŞIMAZ — yalnız transition korelasyon/idempotency anahtarıdır
 * (veri-minimizasyonu; WORM'a secret/PII girmez).
 */
public record TransitionId(String value) {

    // UUID v4 lowercase: 8-4-4-4-12 hex; 3. grup '4' ile başlar (sürüm), 4. grup [89ab] ile (variant).
    private static final Pattern FORMAT = Pattern.compile(
            "mgt_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}");

    public TransitionId {
        if (!isValid(value)) {
            throw new IllegalArgumentException(
                    "TransitionId biçimi geçersiz (beklenen mgt_<uuid-v4-küçük-hex>): " + value);
        }
    }

    /**
     * Biçim-geçerli mi (nesne üretmeden). Projeksiyon/adapter bozuk transition_id taşıyan satırı
     * makine-tespit için kullanabilir (regex tek kaynak burada — vokabüler drift YOK).
     */
    public static boolean isValid(String value) {
        return value != null && FORMAT.matcher(value).matches();
    }

    /** Yeni rastgele (UUID v4) transition kimliği; {@code UUID.toString()} zaten küçük-hex. */
    public static TransitionId random() {
        return new TransitionId("mgt_" + UUID.randomUUID());
    }
}
