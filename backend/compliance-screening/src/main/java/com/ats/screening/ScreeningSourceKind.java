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
    /** Kaynağı belirtilmemiş serbest metin. */
    FREE_TEXT
}
