package com.ats.app.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.application.ApplicationQuestion;
import com.ats.application.ApplicationQuestion.Kind;
import com.ats.application.QuestionTextAdvisor;
import com.ats.screening.ProtectedAttributeScreener;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * #240 dilim A kabul ölçütü: korunan özellik çağrıştıran soruda GÖRÜNÜR uyarı.
 *
 * <p>GERÇEK screener ile koşar (stub değil): uyarının varlığı sözlüğün gerçekten
 * eşleşmesine bağlı olmalı, benim uydurduğum bir mock'a değil.
 */
class ScreeningQuestionTextAdvisorTest {

    private final QuestionTextAdvisor advisor = new ScreeningQuestionTextAdvisor(
            ProtectedAttributeScreener.fromClasspath("screening/protected-attribute-screening-policy.v1.json"));

    @Test
    void a_question_touching_a_protected_category_warns_with_position_and_category() {
        List<QuestionTextAdvisor.Warning> warnings = advisor.review(List.of(
                new ApplicationQuestion(1, "Kaç yaşındasınız?", Kind.SHORT_TEXT, true, List.of())));

        assertFalse(warnings.isEmpty(), "yaş sorusu uyarı üretmeli");
        assertEquals(1, warnings.get(0).position(), "uyarı hangi soruya ait olduğunu söylemeli");
        assertFalse(warnings.get(0).category().isBlank());
        // Ham eşleşme metni TAŞINMAZ (screening modülünün açık sınırı).
        assertFalse(warnings.stream().anyMatch(w -> w.signal().contains("yaş")),
                "eşleşen ham metin uyarıda görünmemeli");
    }

    @Test
    void a_job_related_question_is_not_warned() {
        // Yanlış pozitif meşru soruyu kilitlemez — engellemiyoruz ama gürültü de
        // üretmiyoruz; işle ilgili soru temiz geçmeli.
        assertTrue(advisor.review(List.of(new ApplicationQuestion(
                        1, "Hangi programlama dillerinde deneyiminiz var?",
                        Kind.LONG_TEXT, true, List.of()))).isEmpty(),
                "işle ilgili soru uyarı üretmemeli");
    }

    @Test
    void no_questions_means_no_warnings_and_never_null() {
        assertEquals(List.of(), advisor.review(List.of()));
        assertEquals(List.of(), advisor.review(null));
    }
}
