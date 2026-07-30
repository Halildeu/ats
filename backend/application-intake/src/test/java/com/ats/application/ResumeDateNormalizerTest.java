package com.ats.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.application.ApplicationIntakeService.EducationEntry;
import com.ats.application.ApplicationIntakeService.ExperienceEntry;
import com.ats.application.ResumeDateNormalizer.Precision;
import org.junit.jupiter.api.Test;

/** #242 dilim C: tarih değerlerinin kanonik biçimi ve hassasiyeti. */
class ResumeDateNormalizerTest {

    @Test
    void month_and_year_shapes_are_recognized_without_being_rewritten() {
        assertEquals(new ResumeDateNormalizer.Normalized("2022-09", Precision.MONTH),
                ResumeDateNormalizer.normalize("2022-09"));
        assertEquals(new ResumeDateNormalizer.Normalized("2019", Precision.YEAR),
                ResumeDateNormalizer.normalize("2019"));
        // Şekil hassasiyetin kendisidir; yıl-only değer AY'a terfi ettirilemez —
        // uydurulmuş bir ay, eksik aydan kötüdür (yanlışlığı görünmez olur).
        assertEquals(Precision.YEAR, ResumeDateNormalizer.normalize("2019").precision());
    }

    @Test
    void turkish_and_english_month_names_and_numeric_forms_reach_one_canonical_value() {
        for (String raw : new String[] {
            "Eyl 2022", "Eylül 2022", "eylul 2022", "September 2022", "Sep 2022",
            "09/2022", "9.2022", "9-2022", "2022/09", "2022.9", "2022 Eylül",
        }) {
            assertEquals("2022-09", ResumeDateNormalizer.normalize(raw).value(),
                    "aynı ay farklı yazımlarda aynı değere gitmeli: " + raw);
            assertEquals(Precision.MONTH, ResumeDateNormalizer.normalize(raw).precision(), raw);
        }
    }

    @Test
    void ongoing_markers_are_a_first_class_state_not_a_date() {
        for (String raw : new String[] {
            "Devam", "Devam ediyor", "devam ediyor.", "Halen", "halen devam ediyor",
            "Günümüz", "Present", "current", "Now", "ongoing",
        }) {
            assertEquals(Precision.ONGOING, ResumeDateNormalizer.normalize(raw).precision(),
                    "süregelenlik işareti tanınmalı: " + raw);
            assertEquals("", ResumeDateNormalizer.normalize(raw).value(),
                    "süregelenlik bir tarih DEĞİL; tarih alanına yazılmamalı: " + raw);
            assertTrue(ResumeDateNormalizer.ongoingMarker(raw), raw);
        }
        assertFalse(ResumeDateNormalizer.ongoingMarker("2019"), "yıl süregelenlik değil");
        assertFalse(ResumeDateNormalizer.ongoingMarker(""), "boş değer süregelenlik değil");
    }

    @Test
    void unrecognized_value_is_preserved_raw_and_never_half_converted() {
        // Yarım çevrilmiş bir tarih, çevrilmemişten TEHLİKELİdir: hesaba girer.
        for (String raw : new String[] {"2016 güz", "Eyl 2022 sonrası", "2019-2023", "yaz dönemi"}) {
            ResumeDateNormalizer.Normalized n = ResumeDateNormalizer.normalize(raw);
            assertEquals(Precision.UNPARSED, n.precision(), raw);
            assertEquals(raw, n.value(), "ham değer korunmalı (boşaltmak veri kaybıdır): " + raw);
        }
        assertEquals(Precision.EMPTY, ResumeDateNormalizer.normalize("  ").precision());
        assertEquals(Precision.EMPTY, ResumeDateNormalizer.normalize(null).precision());
    }

    @Test
    void precision_is_read_from_the_shape_so_two_authorities_cannot_disagree() {
        assertEquals(Precision.MONTH, ResumeDateNormalizer.precisionOf("2022-09"));
        assertEquals(Precision.YEAR, ResumeDateNormalizer.precisionOf("2019"));
        assertEquals(Precision.UNPARSED, ResumeDateNormalizer.precisionOf("2016 güz"));
        assertEquals(Precision.EMPTY, ResumeDateNormalizer.precisionOf(""));
    }

    @Test
    void entries_normalize_in_their_constructor_so_no_write_path_can_bypass_it() {
        ExperienceEntry e = new ExperienceEntry("Uzman", "Örnek AŞ", "Eyl 2022",
                "Devam ediyor", "açıklama");
        assertEquals("2022-09", e.startDate(), "kurucu normalize etmeli");
        assertEquals("", e.endDate(), "süregelenlik tarih alanından çıkmalı");
        assertTrue(e.ongoing(), "süregelenlik bayrağa taşınmalı");

        ExperienceEntry kept = new ExperienceEntry("Uzman", "Örnek AŞ", "2016 güz", "2019", "");
        assertEquals("2016 güz", kept.startDate(), "çevrilemeyen ham kalır");
        assertFalse(kept.ongoing());

        EducationEntry edu = new EducationEntry("Üniversite", "Lisans", "Bilgisayar",
                "2012", "Devam ediyor", "");
        assertTrue(edu.ongoing(), "öğrenim de sürebilir");
        assertEquals("", edu.endYear());

        // Süregelen girdi BOŞ sayılmamalı: boş girdiler kaydedilmiyor, dolayısıyla
        // yalnız "devam ediyor" beyanı olan bir satır sessizce düşerdi.
        assertFalse(new ExperienceEntry("", "", "", "Devam ediyor", "").blank(),
                "yalnız süregelenlik beyanı olan girdi boş sayılmamalı");
    }

    @Test
    void hr_text_view_still_says_ongoing_after_the_flag_moved_out_of_the_date_field() {
        // İK'nın gördüğü tek-dizeli görünüm "2022-09 - " diye yarım kalmamalı.
        ApplicationIntakeService.Submission s = submissionWith(
                new ExperienceEntry("Uzman", "Örnek AŞ", "Eyl 2022", "Devam ediyor", ""));
        assertTrue(s.effectiveExperience().contains("2022-09 - Devam ediyor"),
                "süregelenlik metin görünümünde kaybolmamalı: " + s.effectiveExperience());
    }

    private static ApplicationIntakeService.Submission submissionWith(ExperienceEntry entry) {
        return new ApplicationIntakeService.Submission(
                "Sentetik Aday", "aday@example.test", "", "", "", "", "",
                "", "", java.util.List.of(), "", "v1",
                "2026-07-30T00:00:00Z", "2026-07-30T00:00:00Z", null, null,
                java.util.List.of(entry), java.util.List.of(), "", "");
    }
}
