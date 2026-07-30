package com.ats.application;

import com.ats.application.ResumeDateNormalizer.Precision;
import java.time.YearMonth;
import java.util.OptionalInt;

/**
 * #242 dilim D: bir deneyim aralığının AY cinsinden süresi ve o sürenin hangi
 * hassasiyetten geldiği.
 *
 * <h2>Neden saklanmıyor, hesaplanıyor</h2>
 *
 * Issue "türetilmiş alanı sakla" diyordu; gerekçesi iki taneydi: (1) her raporda
 * metin ayrıştırmak yavaş, (2) ayrıştırıcı değişince geçmiş sonuçlar sessizce
 * değişir. Dilim C'den sonra ikisi de geçerli değil: değerler <b>kanonik</b>
 * ({@code YYYY-MM} / {@code YYYY}), yani sorgu anında metin ayrıştırma yok ve
 * sonuç ayrıştırıcıya bağlı değil.
 *
 * <p>Buna karşılık SAKLAMANIN kendisi yeni bir hata kaynağı olurdu: süregelen
 * bir işin süresi her ay artar. Saklanan {@code durationMonths} hesaplandığı
 * günün ertesinde <b>sessizce yanlış</b> olur. Bu yüzden süre okuma anında,
 * açık bir {@code asOf} ile hesaplanır ve sonuç {@code asOf} ile birlikte
 * raporlanır.
 *
 * <h2>Hassasiyet kaybolmaz, GÖRÜNÜR olur</h2>
 *
 * Yıl hassasiyetli bir uç ({@code 2019}) ay hassasiyetine <b>terfi
 * ETTİRİLMEZ</b>; aralığın o yılın tamamını kapsadığı kabul edilir (başlangıç
 * Ocak, bitiş Aralık). Bu, süreyi yukarı yuvarlar — ve tam bu yüzden kapsam
 * raporu yıl hassasiyetli girdileri <b>ayrı sayar</b>: okuyan kişi toplamın ne
 * kadarının kaba veriden geldiğini görür. Kapsamsız bir ortalama, güven veren
 * yanlış bir sayıdır.
 */
public final class ExperienceDuration {

    private ExperienceDuration() {}

    /** Bir aralığın nasıl hesaplandığı (ya da neden hesaplanamadığı). */
    public enum Basis {
        /** İki uç da ay hassasiyetli — en güvenilir. */
        MONTH,
        /** En az bir uç yıl hassasiyetli; süre yıl sınırlarına yuvarlanır. */
        YEAR,
        /** Bitiş süregelen; {@code asOf} ile hesaplandı. */
        ONGOING,
        /** Hesaba GİRMEZ: uç yok, çevrilemedi ya da aralık ters. */
        UNCOMPUTABLE
    }

    /** Sonuç: süre (ay) ve dayanağı. {@code months} yalnız UNCOMPUTABLE'da boştur. */
    public record Result(OptionalInt months, Basis basis) {}

    /**
     * Deneyim girdisinin süresi.
     *
     * @param asOf süregelen işlerin bitişi; çağıran açıkça verir (saklanmış bir
     *     "şu an" yoktur — sonuç raporda {@code asOf} ile birlikte döner)
     */
    public static Result of(ApplicationIntakeService.ExperienceEntry entry, YearMonth asOf) {
        return between(entry.startDate(), entry.endDate(), entry.ongoing(), asOf);
    }

    /** Eğitim girdisi için aynı hesap ({@code startYear}/{@code endYear}). */
    public static Result of(ApplicationIntakeService.EducationEntry entry, YearMonth asOf) {
        return between(entry.startYear(), entry.endYear(), entry.ongoing(), asOf);
    }

    static Result between(String start, String end, boolean ongoing, YearMonth asOf) {
        Precision startPrecision = ResumeDateNormalizer.precisionOf(start);
        YearMonth from = firstMonth(start, startPrecision);
        if (from == null) return uncomputable();

        YearMonth to;
        Basis basis;
        if (ongoing) {
            to = asOf;
            basis = Basis.ONGOING;
        } else {
            Precision endPrecision = ResumeDateNormalizer.precisionOf(end);
            to = lastMonth(end, endPrecision);
            if (to == null) return uncomputable();
            basis = startPrecision == Precision.MONTH && endPrecision == Precision.MONTH
                    ? Basis.MONTH : Basis.YEAR;
        }
        if (startPrecision == Precision.YEAR) basis = basis == Basis.ONGOING ? basis : Basis.YEAR;
        if (to.isBefore(from)) return uncomputable();
        int months = (int) (java.time.temporal.ChronoUnit.MONTHS.between(from, to) + 1);
        return new Result(OptionalInt.of(months), basis);
    }

    private static Result uncomputable() {
        return new Result(OptionalInt.empty(), Basis.UNCOMPUTABLE);
    }

    private static YearMonth firstMonth(String value, Precision precision) {
        return switch (precision) {
            case MONTH -> YearMonth.parse(value.trim());
            // Yıl hassasiyeti: aralık o yılın BAŞINDAN başlar.
            case YEAR -> YearMonth.of(Integer.parseInt(value.trim()), 1);
            default -> null;
        };
    }

    private static YearMonth lastMonth(String value, Precision precision) {
        return switch (precision) {
            case MONTH -> YearMonth.parse(value.trim());
            // Yıl hassasiyeti: aralık o yılın SONUNA kadar sürer.
            case YEAR -> YearMonth.of(Integer.parseInt(value.trim()), 12);
            default -> null;
        };
    }
}
