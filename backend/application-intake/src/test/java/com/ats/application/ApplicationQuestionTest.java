package com.ats.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.application.ApplicationQuestion.Kind;
import java.util.List;
import org.junit.jupiter.api.Test;

/** #240 dilim A: ilana özel başvuru sorusunun sözleşmesi. */
class ApplicationQuestionTest {

    @Test
    void a_question_needs_real_text_and_a_known_kind() {
        assertTrue(q(1, "Tam zamanlı çalışabilir misiniz?", Kind.YES_NO).valid());
        assertFalse(q(1, "", Kind.YES_NO).valid(), "boş metinli soru kaydedilemez");
        assertFalse(q(1, "kısa", Kind.SHORT_TEXT).valid(), "anlamsız kısa metin reddedilir");
        assertFalse(q(1, "Geçerli bir soru metni", null).valid(), "tip kapalı küme dışı");
        assertFalse(q(0, "Geçerli bir soru metni", Kind.SHORT_TEXT).valid(), "sıra 1'den başlar");
        assertFalse(q(ApplicationQuestion.MAX_PER_JOB + 1, "Geçerli bir soru metni",
                Kind.SHORT_TEXT).valid(), "üst sınır aşılamaz");
    }

    @Test
    void single_choice_needs_at_least_two_distinct_options() {
        assertTrue(new ApplicationQuestion(1, "Hangi vardiyayı tercih edersiniz?",
                Kind.SINGLE_CHOICE, true, List.of("Gündüz", "Gece")).valid());
        assertFalse(new ApplicationQuestion(1, "Hangi vardiyayı tercih edersiniz?",
                Kind.SINGLE_CHOICE, true, List.of("Gündüz")).valid(),
                "tek seçenekli 'seçim' sorusu seçim değildir");
        assertFalse(new ApplicationQuestion(1, "Hangi vardiyayı tercih edersiniz?",
                Kind.SINGLE_CHOICE, true, List.of("Gündüz", "gündüz")).valid(),
                "aynı seçeneğin iki yazımı adaya iki farklı seçenek gibi görünür");
    }

    @Test
    void options_are_dropped_for_kinds_that_have_no_choices() {
        // Seçenekleri taşımak "aslında seçim sorusuydu" yanılgısı üretir.
        assertEquals(List.of(), q(1, "Neden bu pozisyon?", Kind.LONG_TEXT).options());
        assertEquals(List.of(),
                new ApplicationQuestion(1, "Neden bu pozisyon?", Kind.LONG_TEXT, false,
                        List.of("a", "b")).options());
    }

    @Test
    void unknown_kind_resolves_to_null_not_a_silent_default() {
        assertEquals(Kind.YES_NO, ApplicationQuestion.kindOf("yes_no"));
        assertEquals(Kind.SHORT_TEXT, ApplicationQuestion.kindOf(" SHORT_TEXT "));
        assertEquals(null, ApplicationQuestion.kindOf("KNOCKOUT"),
                "bilinmeyen tip sessizce SHORT_TEXT'e düşmemeli");
        assertEquals(null, ApplicationQuestion.kindOf(null));
    }

    @Test
    void advisor_without_an_engine_says_unknown_not_clean() {
        List<ApplicationQuestion> questions = List.of(q(1, "Kaç yaşındasınız?", Kind.SHORT_TEXT));
        List<QuestionTextAdvisor.Warning> warnings =
                QuestionTextAdvisor.unavailable().review(questions);
        assertEquals(1, warnings.size(), "motor yoksa sessizce 'temiz' denmemeli");
        assertEquals("ADVISOR_UNAVAILABLE", warnings.get(0).category());
        assertEquals(1, warnings.get(0).position());
    }

    private static ApplicationQuestion q(int position, String text, Kind kind) {
        return new ApplicationQuestion(position, text, kind, false, List.of());
    }
}
