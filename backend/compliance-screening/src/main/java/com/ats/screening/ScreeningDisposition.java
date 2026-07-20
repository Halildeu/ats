package com.ats.screening;

import java.util.Objects;

/**
 * Tarama sonucunun insan-inceleme yüzeyine taşınan kapalı durumu.
 *
 * <p>Bu enum bir aday-kararı DEĞİLDİR. {@link #REVIEW_REQUIRED} ve
 * {@link #SCREENING_UNAVAILABLE} yalnız "temiz tarama" iddiasını engeller; adayı otomatik
 * reddetmez/bloklamaz, sıralamaz, profillemez ve mülakat akışını durdurmaz.
 */
public enum ScreeningDisposition {
    /** Desteklenen kapsamda tarandı ve bulgu yok; temiz-tarama iddiasına izin veren tek durum. */
    CLEAR,
    /** Desteklenen kapsamda en az bir insan-inceleme sinyali var. */
    REVIEW_REQUIRED,
    /** Girdi otoritatif taranamadı; bulgu-boş olsa dahi sessiz-yeşil verilemez. */
    SCREENING_UNAVAILABLE;

    /** Disposition çağıran tarafından seçilemez; çekirdek sonucundan tek-anlamlı türetilir. */
    public static ScreeningDisposition from(ScreeningResult result) {
        Objects.requireNonNull(result, "result");
        if (result.coverage() != Coverage.SUPPORTED) {
            return SCREENING_UNAVAILABLE;
        }
        return result.findings().isEmpty() ? CLEAR : REVIEW_REQUIRED;
    }

    /** Yalnız CLEAR, "desteklenen kapsamda bulgu yok" iddiasına izin verir. */
    public boolean permitsCleanScreeningAssertion() {
        return this == CLEAR;
    }
}
