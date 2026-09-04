package com.ats.application;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * #240 dilim A: ilana özel başvuru sorusu.
 *
 * <p>Sahip talebi: <em>"adaya sorular da yöneltebilmeliyiz; başvuru sırasında yanıtlamasını
 * isteyeceğimiz sorular olmalı."</em> Bugüne kadar ilan sözleşmesinde yalnız sabit
 * {@code applicationFields} vardı; İK ilana kendi sorusunu ekleyemiyordu. Tek çıkış yolu adayın
 * serbest {@code note} alanına yazmasıydı: ne sorulduğu belli değil, cevap yapısal değil, ilan
 * bazında karşılaştırma imkânsız.
 *
 * <h2>Soru ≠ otomatik eleme</h2>
 *
 * Bu tip yalnız SORUYU taşır. Cevaplar İK'ya gösterilir; eleme/puanlama/sıralama <b>bilinçli
 * olarak kapsam dışıdır</b>. Otomatik karar üretmek EU AI Act ve KVKK hattında insan kontrolü
 * ilkesine dokunur ve ürünün her yerinde yazan "AI önerir, insan karar verir" sözleşmesini bozar.
 *
 * <h2>{@code order} KİMLİK DEĞİLDİR (onaylı sözleşme, madde 1)</h2>
 *
 * Kimlik {@link #questionId}: sunucunun ürettiği, ilan içinde benzersiz, <b>reorder/edit boyunca
 * sabit</b> opak değer. {@code order} yalnız adayın gördüğü sıradır ve her düzenlemede
 * değişebilir. Aynı gerekçe seçeneklerde de geçerli: cevap sözleşmesi (dilim B/C) seçeneği
 * {@link Option#optionId} ile bağlar, kullanıcıya görünen {@link Option#label} ile DEĞİL —
 * etiketi düzelten bir yazım hatası düzeltmesi geçmiş cevapları koparmamalı.
 */
public record ApplicationQuestion(
        String questionId,
        int order,
        String text,
        Kind kind,
        boolean required,
        List<Option> options) {

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

    /**
     * Seçenek: sabit kimlik + görünen etiket. Cevaplar {@code optionId}'ye bağlanır; etiket
     * İK tarafından düzeltilebilir bir sunum detayıdır.
     */
    public record Option(String optionId, String label) {
        public Option {
            optionId = optionId == null ? null : optionId.trim();
            label = label == null ? "" : label.trim();
        }
    }

    /** İlan başına üst sınır (onaylı: 0..10 geçerli, 11 red). */
    public static final int MAX_PER_JOB = 10;
    public static final int MIN_TEXT_LENGTH = 2;
    public static final int MAX_TEXT_LENGTH = 500;
    public static final int MIN_OPTIONS = 2;
    public static final int MAX_OPTIONS = 8;
    public static final int MIN_OPTION_LENGTH = 1;
    public static final int MAX_OPTION_LENGTH = 120;

    /** Sunucu üretimli opak kimlikler; istemci bu değerleri uyduramaz (format zorlanır). */
    public static final Pattern QUESTION_ID = Pattern.compile("q_[A-Za-z0-9_-]{16}");
    public static final Pattern OPTION_ID = Pattern.compile("qo_[A-Za-z0-9_-]{12}");

    public ApplicationQuestion {
        questionId = questionId == null ? null : questionId.trim();
        text = text == null ? "" : text.trim();
        List<Option> normalized = new ArrayList<>();
        if (options != null) {
            for (Option option : options) {
                if (option != null) normalized.add(option);
            }
        }
        // Seçenekler BURADA SESSİZCE DÜŞÜRÜLMEZ. Önceki hâli `SINGLE_CHOICE` dışındaki tiplerde
        // listeyi boşaltıyordu; bu, kapalı tip/options sözleşmesini FAIL-OPEN yapıyordu:
        // "YES_NO + iki seçenek" gibi anlamı belirsiz bir istek 400 yerine BAŞARILI oluyor ve
        // İK'nın gönderdiği veri sessizce kayboluyordu. Artık girdi olduğu gibi taşınır ve
        // {@link #invalidReason()} bu kombinasyonu açıkça reddeder.
        options = List.copyOf(normalized);
    }

    /**
     * Tek sorunun yapısal geçerliliği. İlan geneline yayılan değişmezler (benzersiz
     * {@code order}/{@code questionId}, adet sınırı) {@code JobPostingService}'tedir — onlar tek
     * soruya bakarak karara bağlanamaz.
     *
     * @return geçersizlik sebebi; {@code null} = geçerli
     */
    public String invalidReason() {
        if (questionId == null || !QUESTION_ID.matcher(questionId).matches()) {
            return "questionId sunucu üretimli opak kimlik olmalı";
        }
        if (order < 1 || order > MAX_PER_JOB) {
            return "order 1.." + MAX_PER_JOB + " aralığında olmalı";
        }
        if (kind == null) return "kind kapalı küme dışında";
        if (text.length() < MIN_TEXT_LENGTH || text.length() > MAX_TEXT_LENGTH) {
            return "soru metni trim sonrası " + MIN_TEXT_LENGTH + ".." + MAX_TEXT_LENGTH
                    + " karakter olmalı";
        }
        if (kind != Kind.SINGLE_CHOICE) {
            // Sessiz düşürme YOK: seçenek gönderilmişse istek anlamı belirsizdir ve reddedilir.
            return options.isEmpty() ? null : "options yalnız SINGLE_CHOICE için verilebilir";
        }
        if (options.size() < MIN_OPTIONS || options.size() > MAX_OPTIONS) {
            return "SINGLE_CHOICE " + MIN_OPTIONS + ".." + MAX_OPTIONS + " seçenek ister";
        }
        List<String> ids = new ArrayList<>();
        List<String> labels = new ArrayList<>();
        for (Option option : options) {
            if (option.optionId() == null || !OPTION_ID.matcher(option.optionId()).matches()) {
                return "optionId sunucu üretimli opak kimlik olmalı";
            }
            int length = option.label().length();
            if (length < MIN_OPTION_LENGTH || length > MAX_OPTION_LENGTH) {
                return "seçenek etiketi " + MIN_OPTION_LENGTH + ".." + MAX_OPTION_LENGTH
                        + " karakter olmalı";
            }
            if (ids.contains(option.optionId())) return "optionId ilan içinde benzersiz olmalı";
            String folded = option.label().toLowerCase(Locale.ROOT);
            if (labels.contains(folded)) return "seçenek etiketleri benzersiz olmalı";
            ids.add(option.optionId());
            labels.add(folded);
        }
        return null;
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
