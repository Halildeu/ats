package com.ats.screening;

/**
 * KAPALI kaynak-türü: taranan metnin nereden geldiği (yalnız köken etiketi; içerik/kimlik
 * taşımaz). Bulguya köken bağlamı verir (insan-review önceliklendirmesi için).
 */
public enum ScreeningSourceKind {
    /** Mülakat transkript segmenti (segment-index anlamlıdır). */
    TRANSCRIPT_SEGMENT,
    /** İnsan reviewer'ın serbest mülakat notu. */
    INTERVIEW_NOTE,
    /** Rubric/kriter metni (job-related değerlendirme ölçütü). */
    RUBRIC_TEXT,
    /**
     * Kanonik ATIF-İDDİASI (citation-claim): 156-c üreticisi bir transkript-segmentini bir
     * kanonik atıf-iddiasına bağlar. Bu köken kendi başına bir lineage-türüdür — iddiayı
     * {@code FREE_TEXT} saymak soyağacını zayıflatır ve 156-b kapalı-kümesini yanlış dondurur.
     */
    CITATION_CLAIM,
    /** Kaynağı belirtilmemiş serbest metin. */
    FREE_TEXT
}
