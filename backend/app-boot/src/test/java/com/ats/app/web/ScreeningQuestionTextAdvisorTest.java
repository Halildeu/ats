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
 * #240 A: soru metni korunan-özellik uyarısı. Sözleşmenin 5. maddesi burada makine-uygulanır:
 * "SUPPORTED + findings=[] dışında sonuç temiz sayılamaz; policy unavailable/malformed/
 * unsupported ise sessiz temiz üretmek YASAKTIR."
 */
class ScreeningQuestionTextAdvisorTest {

    private static final String POLICY = "screening/protected-attribute-screening-policy.v2.json";

    private static QuestionTextAdvisor advisor() {
        return new ScreeningQuestionTextAdvisor(ProtectedAttributeScreener.fromClasspath(POLICY));
    }

    private static ApplicationQuestion question(String text) {
        return new ApplicationQuestion(
                "q_" + "A".repeat(16), 1, text, Kind.SHORT_TEXT, false, List.of());
    }

    @Test
    void protected_attribute_question_produces_a_visible_warning() {
        List<QuestionTextAdvisor.Warning> warnings =
                advisor().review(List.of(question("Medeni durumunuz nedir?")));

        assertFalse(warnings.isEmpty());
        assertEquals("q_" + "A".repeat(16), warnings.get(0).questionId());
        assertTrue(warnings.stream()
                .anyMatch(w -> "MARITAL_PARENTAL_STATUS".equals(w.category())));
    }

    @Test
    void military_service_question_is_warned_after_the_v2_category() {
        assertTrue(advisor().review(List.of(question("Askerlik durumunuz nedir?"))).stream()
                .anyMatch(w -> "MILITARY_SERVICE_STATUS".equals(w.category())));
    }

    /**
     * Yanlış pozitif koruması: #214 incelemesinde tek-kelime terimlerin meşru iş metnini
     * işaretlediği görüldü. Meşru, işle ilgili sorular uyarı ÜRETMEMELİ — aksi hâlde uyarı
     * gürültüye dönüşür ve İK gerçek uyarıyı görmez.
     */
    @Test
    void legitimate_job_related_questions_produce_no_warning() {
        List<String> benign = List.of(
                "Hangi programlama dilleriyle çalıştınız?",
                "Kaç yıllık ürün yönetimi deneyiminiz var?",
                "Bir race condition hatasını nasıl teşhis edersiniz?",
                "Kubernetes üzerinde dağıtım yaptınız mı?");
        for (String text : benign) {
            assertEquals(List.of(), advisor().review(List.of(question(text))), text);
        }
    }

    /**
     * SESSİZ TEMİZ YASAK. Tarayıcı kullanılamıyorken bulgu listesi boştur; bu "risk yok"
     * DEĞİLDİR. Uyarı üretimi kaldırılırsa bu test kırmızı olur.
     */
    @Test
    void unavailable_screener_never_reports_clean() {
        QuestionTextAdvisor unavailable =
                new ScreeningQuestionTextAdvisor(ProtectedAttributeScreener.unavailable());

        List<QuestionTextAdvisor.Warning> warnings =
                unavailable.review(List.of(question("Hangi programlama dilleriyle çalıştınız?")));

        assertFalse(warnings.isEmpty(), "tarayıcı yokken boş uyarı listesi sessiz-temizdir");
        assertEquals(QuestionTextAdvisor.Warning.COVERAGE_UNKNOWN, warnings.get(0).category());
        assertEquals("POLICY_UNAVAILABLE", warnings.get(0).signal());
    }

    @Test
    void advisor_unavailable_fallback_marks_every_question_as_unknown() {
        List<QuestionTextAdvisor.Warning> warnings = QuestionTextAdvisor.unavailable()
                .review(List.of(question("Hangi programlama dilleriyle çalıştınız?")));

        assertEquals(1, warnings.size());
        assertEquals(QuestionTextAdvisor.Warning.ADVISOR_UNAVAILABLE, warnings.get(0).category());
    }

    @Test
    void no_questions_means_no_warnings() {
        assertEquals(List.of(), advisor().review(List.of()));
        assertEquals(List.of(), advisor().review(null));
    }
}
