package com.ats.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.application.ApplicationIntakeService.ExperienceEntry;
import com.ats.application.ExperienceDuration.Basis;
import java.time.YearMonth;
import org.junit.jupiter.api.Test;

/** #242 dilim D: süre hesabı ve hesabın DAYANAĞI. */
class ExperienceDurationTest {

    private static final YearMonth AS_OF = YearMonth.of(2026, 7);

    @Test
    void month_precision_counts_inclusive_months() {
        ExperienceDuration.Result r = ExperienceDuration.between("2022-09", "2024-03", false, AS_OF);
        assertEquals(19, r.months().getAsInt(), "Eylül 2022 - Mart 2024 dahil 19 ay");
        assertEquals(Basis.MONTH, r.basis());
    }

    @Test
    void year_precision_spans_the_whole_year_and_says_so() {
        // Yıl hassasiyetli uç AY'a terfi ETTİRİLMEZ; aralık yılın tamamını kapsar.
        ExperienceDuration.Result r = ExperienceDuration.between("2019", "2019", false, AS_OF);
        assertEquals(12, r.months().getAsInt(), "2019 - 2019 tam yıl sayılır");
        assertEquals(Basis.YEAR, r.basis(), "dayanak YIL olarak işaretlenmeli");

        // Karışık hassasiyet de YIL sayılır: sonuç kabadır ve öyle raporlanır.
        assertEquals(Basis.YEAR,
                ExperienceDuration.between("2019", "2020-06", false, AS_OF).basis());
        assertEquals(Basis.YEAR,
                ExperienceDuration.between("2019-06", "2020", false, AS_OF).basis());
    }

    @Test
    void ongoing_is_measured_against_asOf_not_a_stored_snapshot() {
        // Saklanan bir süre, hesaplandığı günün ertesinde sessizce yanlış olurdu.
        ExperienceDuration.Result r = ExperienceDuration.between("2026-01", "", true, AS_OF);
        assertEquals(7, r.months().getAsInt(), "Ocak 2026 - Temmuz 2026 dahil 7 ay");
        assertEquals(Basis.ONGOING, r.basis());

        ExperienceDuration.Result later =
                ExperienceDuration.between("2026-01", "", true, YearMonth.of(2026, 12));
        assertTrue(later.months().getAsInt() > r.months().getAsInt(),
                "süregelen süre asOf ilerledikçe artmalı");
    }

    @Test
    void missing_unparseable_or_backwards_spans_are_uncomputable_not_zero() {
        // Sıfır saymak, eksik veriyi "hiç deneyim yok" gibi gösterirdi.
        for (String[] span : new String[][] {
            {"", "2020"}, {"2019", ""}, {"2016 güz", "2019"}, {"2019", "2016 güz"},
            {"2024-03", "2022-09"},
        }) {
            ExperienceDuration.Result r =
                    ExperienceDuration.between(span[0], span[1], false, AS_OF);
            assertTrue(r.months().isEmpty(),
                    "hesaplanamaz olmalı: '" + span[0] + "' - '" + span[1] + "'");
            assertEquals(Basis.UNCOMPUTABLE, r.basis());
        }
    }

    @Test
    void entry_overload_reads_the_ongoing_flag_not_the_end_text() {
        ExperienceEntry ongoing = new ExperienceEntry("Uzman", "Örnek AŞ", "2026-01",
                "Devam ediyor", "");
        assertEquals(Basis.ONGOING, ExperienceDuration.of(ongoing, AS_OF).basis(),
                "kurucu süregelenliği bayrağa taşıdı; hesap bayrağı okumalı");
        assertEquals(7, ExperienceDuration.of(ongoing, AS_OF).months().getAsInt());
    }
}
