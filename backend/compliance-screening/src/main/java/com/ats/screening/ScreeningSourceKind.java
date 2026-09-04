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
     * #240 A: İK'nın ilana eklediği başvuru sorusunun metni. Kendi lineage-türüdür — soruyu
     * {@code FREE_TEXT} saymak "bu metin adaya SORULACAK" bilgisini kaybettirir; bulgunun insan
     * için taşıdığı aciliyet (henüz sorulmamış, düzeltilebilir bir soru) o etiketten gelir.
     * Bu köken kanonik WORM kanıt hattına GİRMEZ: taslak ilan metni tarama-kanıtı üretmez,
     * yalnız kaydeden İK'ya görünür uyarı döner.
     */
    JOB_APPLICATION_QUESTION,
    /**
     * Kanonik ATIF-İDDİASI (citation-claim): 156-c üreticisi bir transkript-segmentini bir
     * kanonik atıf-iddiasına bağlar. Bu köken kendi başına bir lineage-türüdür — iddiayı
     * {@code FREE_TEXT} saymak soyağacını zayıflatır ve 156-b kapalı-kümesini yanlış dondurur.
     */
    CITATION_CLAIM,
    /** Kaynağı belirtilmemiş serbest metin. */
    FREE_TEXT
}
