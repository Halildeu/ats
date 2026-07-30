package com.ats.application;

import java.util.List;

/**
 * #240 dilim A: soru metni İK'ya KORUNAN ÖZELLİK uyarısı verir.
 *
 * <p>Sorular serbest metindir; İK iyi niyetle yaş, sağlık, medeni hâl, inanç
 * gibi korunan bir özelliği sorabilir. Bu port o riski <b>ilan kaydedilirken</b>
 * görünür kılar.
 *
 * <h2>Uyarır, ENGELLEMEZ — bilinçli</h2>
 *
 * Engellemek iki yönden yanlış olurdu: (1) meşru soruları yanlış pozitifle
 * kilitler (*"Sağlık ve güvenlik eğitimi aldınız mı?"* sağlık DURUMU sorusu
 * değildir — bu tuzağa ayrıştırıcı tarafında bir kez düşüldü), (2) kararı
 * makineye devreder; ürünün sözleşmesi "AI önerir, insan karar verir".
 *
 * <p>Uyarı listesi ilan kaydını başarısız YAPMAZ; yanıtla birlikte İK'ya döner.
 * Fail-closed olan şey uyarının KAYBOLMAMASIDIR: tavsiye motoru
 * kullanılamıyorsa {@link #unavailable()} açıkça "bilinmiyor" der ve sessizce
 * "temiz" demez.
 */
public interface QuestionTextAdvisor {

    /**
     * Tek bir uyarı: hangi soru, hangi korumalı kategori, hangi sinyal.
     *
     * <p>Eşleşen HAM METİN taşınmaz — bu, screening modülünün açık sınırıdır
     * ({@code ScreeningFinding} javadoc'u: "ham eşleşme-metni dışa-yüzey
     * DEĞİLDİR; yalnız kategori + sinyal + span"). Uyarıyı ham terimle
     * zenginleştirmek o sınırı bu uçtan sızdırmak olurdu.
     */
    record Warning(int position, String category, String signal) {}

    /**
     * Sorular için uyarılar. Sıra: {@code position} artan.
     *
     * @return boş liste = uyarı yok; {@code null} DÖNMEZ
     */
    List<Warning> review(List<ApplicationQuestion> questions);

    /** Motor yok: "temiz" demek yerine bilinmezliği açıkça taşıyan uyarı üretir. */
    static QuestionTextAdvisor unavailable() {
        return questions -> questions.stream()
                .map(q -> new Warning(q.position(), "ADVISOR_UNAVAILABLE", "UNKNOWN"))
                .toList();
    }

    /** Uyarı üretmeyen ölçüm/test yardımcı — üretimde KULLANILMAZ. */
    static QuestionTextAdvisor silent() {
        return questions -> List.of();
    }
}
