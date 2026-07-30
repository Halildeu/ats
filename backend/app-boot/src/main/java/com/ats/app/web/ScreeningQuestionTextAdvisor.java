package com.ats.app.web;

import com.ats.application.ApplicationQuestion;
import com.ats.application.QuestionTextAdvisor;
import com.ats.screening.ProtectedAttributeScreener;
import com.ats.screening.ScreeningSourceKind;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * #240 dilim A: soru metnini korunan-özellik hattından geçirir ve İK'ya UYARI
 * döner.
 *
 * <p>ENGELLEMEZ. İki sebep: (1) yanlış pozitif meşru soruyu kilitler — aynı
 * tuzağa ayrıştırıcı tarafında bir kez düşüldü ({@code Sağlık Emniyet Çevre
 * Koordinatörü} sağlık verisi sanılıp bastırılmıştı), (2) kararı makineye
 * devretmek ürünün "AI önerir, insan karar verir" sözleşmesini bozar.
 *
 * <p>Motor kullanılamıyorsa sessizce "temiz" DEMEZ: {@code ADVISOR_UNAVAILABLE}
 * uyarısı üretir, böylece uyarının yokluğu "risk yok" gibi okunmaz.
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
        for (ApplicationQuestion q : questions) {
            var result = screener.screen(q.text(), ScreeningSourceKind.FREE_TEXT, "tr");
            if (result == null) {
                out.add(new Warning(q.position(), "ADVISOR_UNAVAILABLE", "UNKNOWN"));
                continue;
            }
            result.findings().stream()
                    .map(f -> new Warning(q.position(), f.category().name(), f.signal().name()))
                    .forEach(out::add);
        }
        return List.copyOf(out);
    }
}
