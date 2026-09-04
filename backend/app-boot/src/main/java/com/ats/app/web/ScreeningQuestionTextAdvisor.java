package com.ats.app.web;

import com.ats.application.ApplicationQuestion;
import com.ats.application.QuestionTextAdvisor;
import com.ats.screening.ProtectedAttributeScreener;
import com.ats.screening.ScreeningResult;
import com.ats.screening.ScreeningSourceKind;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * #240 dilim A: soru metnini korunan-özellik hattından geçirir ve İK'ya UYARI döner.
 *
 * <p>ENGELLEMEZ — gerekçe {@link QuestionTextAdvisor} javadoc'unda.
 *
 * <p>Sessiz temiz üretmez: {@link ScreeningResult#isClear()} sözleşmesi gereği "temiz" yalnız
 * {@code SUPPORTED + bulgu yok} demektir. Kapsama başka her değerdeyken bulgu listesi boş olsa
 * bile {@code COVERAGE_UNKNOWN} uyarısı çıkar, çünkü o metin otoritatif taranamamıştır.
 */
@Component
final class ScreeningQuestionTextAdvisor implements QuestionTextAdvisor {

    private final ProtectedAttributeScreener screener;

    ScreeningQuestionTextAdvisor(ProtectedAttributeScreener screener) {
        this.screener = screener;
    }

    @Override
    public List<Warning> review(List<ApplicationQuestion> questions) {
        if (questions == null || questions.isEmpty()) return List.of();
        List<Warning> out = new ArrayList<>();
        for (ApplicationQuestion question : questions) {
            ScreeningResult result =
                    screener.screen(question.text(), ScreeningSourceKind.JOB_APPLICATION_QUESTION, "tr");
            if (result == null) {
                out.add(new Warning(
                        question.questionId(), Warning.ADVISOR_UNAVAILABLE, "UNKNOWN"));
                continue;
            }
            // Bulguları her hâlükârda taşı; kapsama eksikse AYRICA bilinmezlik uyarısı ekle.
            for (var finding : result.findings()) {
                out.add(new Warning(
                        question.questionId(), finding.category().name(), finding.signal().name()));
            }
            if (!result.isClear() && result.findings().isEmpty()) {
                out.add(new Warning(
                        question.questionId(), Warning.COVERAGE_UNKNOWN, result.coverage().name()));
            }
        }
        return List.copyOf(out);
    }
}
