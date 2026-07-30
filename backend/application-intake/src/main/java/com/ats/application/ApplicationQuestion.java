package com.ats.application;

import java.util.List;
import java.util.Locale;

/**
 * #240 dilim A: ilana özel başvuru sorusu.
 *
 * <p>Sahip talebi: <em>"adaya sorular da yöneltebilmeliyiz; başvuru sırasında
 * yanıtlamasını isteyeceğimiz sorular olmalı."</em> Bugüne kadar tek çıkış yolu
 * adayın serbest {@code note} alanına yazmasıydı: ne sorulduğu belli değil,
 * cevap yapısal değil, ilan bazında karşılaştırma imkânsız.
 *
 * <h2>Soru ≠ otomatik eleme</h2>
 *
 * Bu tip yalnız SORUYU taşır. Cevaplar İK'ya gösterilir; eleme/puanlama/sıralama
 * <b>bilinçli olarak kapsam dışıdır</b>. Otomatik karar üretmek EU AI Act ve KVKK
 * hattında insan kontrolü ilkesine dokunur ve ürünün her yerinde yazan "AI
 * önerir, insan karar verir" sözleşmesini bozar. Soruları bir eleme motoruna
 * bağlamak ayrı iş, ayrı gerekçe, ayrı gate.
 *
 * <h2>Sıra adayın gördüğü sıradır</h2>
 *
 * {@code position} 1'den başlar ve boşluksuz artar. Sıra İK'nın beyanıdır;
 * "önce şunu sor" bilgisi soru metninin bir parçası kadar anlamlıdır.
 */
public record ApplicationQuestion(
        int position,
        String text,
        Kind kind,
        boolean required,
        List<String> options) {

    /** Cevap biçimi. Kapalı küme: bilinmeyen tip sessizce serbest metne düşmez. */
    public enum Kind {
        /** Tek satır. */
        SHORT_TEXT,
        /** Çok satır. */
        LONG_TEXT,
        /** Evet / Hayır. */
        YES_NO,
        /** Verilen seçeneklerden biri. */
        SINGLE_CHOICE
    }

    /** İlan başına üst sınır: form uzunluğu adayın işini bozmamalı. */
    public static final int MAX_PER_JOB = 10;
    public static final int MAX_TEXT_LENGTH = 300;
    public static final int MIN_TEXT_LENGTH = 5;
    public static final int MAX_OPTIONS = 8;
    public static final int MIN_OPTIONS = 2;
    public static final int MAX_OPTION_LENGTH = 120;

    public ApplicationQuestion {
        text = text == null ? "" : text.trim();
        options = options == null ? List.of()
                : options.stream().map(o -> o == null ? "" : o.trim())
                        .filter(o -> !o.isEmpty()).toList();
        // Seçenekler yalnız SINGLE_CHOICE için anlamlı; diğer tiplerde taşınması
        // "aslında seçim sorusuydu" yanılgısı üretir.
        if (kind != Kind.SINGLE_CHOICE) options = List.of();
    }

    /**
     * Geçerlilik. Boş metin kaydedilemez — cevabı olan ama sorusu olmayan bir
     * alan, adaya ne sorulduğunu bilmeden cevap yazdırmak demektir.
     */
    public boolean valid() {
        if (position < 1 || position > MAX_PER_JOB) return false;
        if (kind == null) return false;
        if (text.length() < MIN_TEXT_LENGTH || text.length() > MAX_TEXT_LENGTH) return false;
        if (kind == Kind.SINGLE_CHOICE) {
            if (options.size() < MIN_OPTIONS || options.size() > MAX_OPTIONS) return false;
            if (options.stream().anyMatch(o -> o.length() > MAX_OPTION_LENGTH)) return false;
            return options.stream().map(o -> o.toLowerCase(Locale.ROOT)).distinct().count()
                    == options.size();
        }
        return true;
    }

    /** Kapalı kümeden tip çözümü; bilinmeyen değer {@code null} (fail-closed). */
    public static Kind kindOf(String raw) {
        if (raw == null) return null;
        try {
            return Kind.valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }
}
