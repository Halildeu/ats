package com.ats.screening;

import java.util.Objects;

/**
 * Tek bir tarama bulgusu: hangi korumalı KATEGORİ, hangi SİNYAL, hangi KAYNAK-türünden ve
 * orijinal metnin hangi SPAN'inde. Bu kayıt İNSAN-review için bir işarettir.
 *
 * <p><b>YAPISAL YASAK (bu record'da ASLA alan olarak bulunmaz):</b> {@code score}, {@code confidence},
 * {@code severity}, {@code weight}, {@code rank}, {@code recommendation}, {@code candidateOutcome},
 * hire/reject, sayısal-agregasyon. Bir "hüküm" (aday kabul/ret, ihlal-teyidi) taşımaz. Ham
 * eşleşme-metni de dışa-yüzey DEĞİLDİR (yalnız kategori + sinyal + span; ham-metin 156-b
 * restricted-store konusudur — burada taşınmaz).
 */
public record ScreeningFinding(
        ProtectedCategory category,
        ScreeningSignal signal,
        ScreeningSourceKind sourceKind,
        TextSpan span) {

    public ScreeningFinding {
        Objects.requireNonNull(category, "category");
        Objects.requireNonNull(signal, "signal");
        Objects.requireNonNull(sourceKind, "sourceKind");
        Objects.requireNonNull(span, "span");
    }
}
