package com.ats.application;

import java.util.List;

/**
 * #240 dilim A: soru metni İK'ya KORUNAN ÖZELLİK uyarısı verir.
 *
 * <p>Sorular serbest metindir; İK iyi niyetle yaş, sağlık, medeni hâl, inanç, askerlik gibi
 * korunan bir özelliği sorabilir. Bu port o riski <b>ilan kaydedilirken</b> görünür kılar.
 *
 * <h2>Uyarır, ENGELLEMEZ — bilinçli</h2>
 *
 * Engellemek iki yönden yanlış olurdu: (1) meşru soruları yanlış pozitifle kilitler
 * (<em>"Sağlık ve güvenlik eğitimi aldınız mı?"</em> sağlık DURUMU sorusu değildir — bu tuzağa
 * #214 incelemesinde bir kez düşüldü, tek-kelime terimler meşru iş metnini işaretlemişti),
 * (2) kararı makineye devreder; ürünün sözleşmesi "AI önerir, insan karar verir".
 *
 * <p>Uyarı listesi ilan kaydını başarısız YAPMAZ; yanıtla birlikte İK'ya döner.
 *
 * <h2>Fail-closed: sessiz temiz YASAK (onaylı sözleşme, madde 5)</h2>
 *
 * "Temiz" YALNIZ tarama kapsaması SUPPORTED iken ve hiç bulgu yokken doğrudur. Policy
 * unavailable / malformed / unsupported durumunda bulgu-boş sonuç <b>temiz sayılmaz</b>:
 * {@link Warning#COVERAGE_UNKNOWN} kategorisiyle görünür bir uyarı üretilir. Aksi hâlde
 * uyarının yokluğu "risk yok" gibi okunur — motorun çökmesi sessizce yeşil olamaz.
 */
public interface QuestionTextAdvisor {

    /**
     * Tek bir uyarı: hangi soru (opak kimlikle), hangi korumalı kategori, hangi sinyal.
     *
     * <p>Eşleşen HAM METİN taşınmaz — bu, screening modülünün açık sınırıdır
     * ({@code ScreeningFinding}: "ham eşleşme-metni dışa-yüzey DEĞİLDİR; yalnız kategori +
     * sinyal + span"). Uyarıyı ham terimle zenginleştirmek o sınırı bu uçtan sızdırmak olurdu.
     *
     * <p>Soru {@code questionId} ile gösterilir, {@code order} ile değil: uyarı ekranda
     * dururken İK soruları yeniden sıralayabilir ve sıraya bağlı bir uyarı o an yanlış soruyu
     * işaret etmeye başlar.
     */
    record Warning(String questionId, String category, String signal) {

        /** Tarama otoritatif yapılamadı; bulgu yokluğu "temiz" anlamına GELMEZ. */
        public static final String COVERAGE_UNKNOWN = "COVERAGE_UNKNOWN";
        /** Tavsiye motoru hiç yok (bağımlılık kurulamadı). */
        public static final String ADVISOR_UNAVAILABLE = "ADVISOR_UNAVAILABLE";
    }

    /**
     * Sorular için uyarılar; giriş sırasını korur.
     *
     * @return boş liste = SUPPORTED tarama + bulgu yok; {@code null} DÖNMEZ
     */
    List<Warning> review(List<ApplicationQuestion> questions);

    /** Motor yok: "temiz" demek yerine bilinmezliği açıkça taşıyan uyarı üretir. */
    static QuestionTextAdvisor unavailable() {
        return questions -> questions == null ? List.of() : questions.stream()
                .map(q -> new Warning(
                        q.questionId(), Warning.ADVISOR_UNAVAILABLE, "UNKNOWN"))
                .toList();
    }

    /** Uyarı üretmeyen ölçüm/test yardımcısı — üretimde KULLANILMAZ. */
    static QuestionTextAdvisor silent() {
        return questions -> List.of();
    }
}
