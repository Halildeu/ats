package com.ats.application;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Tek bir tarih DEĞERİNİN kanonik biçimi ve hassasiyeti (#242 dilim C).
 *
 * <p>Sahip gereksinimi toplu hesap: <em>"verileri ay ve yıl olarak toplayacağız
 * ve kıyaslayacağız"</em>. Karışık veri üzerinde toplama <b>sessizce yanlış</b>
 * sonuç verir — 100 kaydın 30'u ayrıştırılamıyorsa hesap onları yok sayar ve
 * çıkan sayı doğru görünür. Bu sınıf o karışıklığı kaynağında kapatır: her
 * tarih değeri tek bir kanonik dile çevrilir ve <b>hassasiyeti kaybolmaz</b>.
 *
 * <h2>Kanonik biçim = hassasiyetin kendisi</h2>
 *
 * {@code 2022-09} ay hassasiyetli, {@code 2019} yıl hassasiyetlidir. Ayrı bir
 * "precision" alanı saklamıyoruz çünkü ikinci bir otorite iki alanın
 * çelişebilmesi demektir; şekil zaten hassasiyeti taşır (#244 kararı).
 *
 * <h2>Ölçüm — neden "işaretlenemez" değil "devam ediyor"</h2>
 *
 * Canlı test verisinde (2026-07-30, 38 başvuru) yapısal olmayan 9 değerin
 * dağılımı ölçüldü:
 *
 * <pre>
 *   Eyl 2022        4   -> ayrıştırılabilir  -> 2022-09
 *   Devam ediyor    4   -> tarih DEĞİL       -> "hâlâ sürüyor"
 *   Devam           1   -> tarih DEĞİL       -> "hâlâ sürüyor"
 * </pre>
 *
 * Yani ayrıştırılamayan değerlerin çoğu bozuk tarih değil, <b>süregelen iş</b>
 * işaretiydi. Bunu "unparsed" diye işaretlemek anlamı çöpe atmak olurdu:
 * süregelen bir işin süresi pekâlâ hesaplanabilir (bitiş = bugün). Bu yüzden
 * {@link Precision#ONGOING} ayrı bir birinci sınıf durumdur ve çağıran taraf
 * onu {@code ongoing} alanına çevirir.
 *
 * <h2>Çevrilemeyene DOKUNULMAZ</h2>
 *
 * Tanınmayan değer ({@code 2016 güz}) ham hâliyle korunur ve
 * {@link Precision#UNPARSED} döner — sessizce boşaltılmaz. Bilinmeyen, boş
 * değildir (#218'de {@code NULL != '[]'} dersi). Şekli zaten
 * "hesaplanamaz" diyor; ayrıca bir işaret alanına gerek yok.
 */
public final class ResumeDateNormalizer {

    private ResumeDateNormalizer() {}

    /** Bir tarih değerinin hassasiyeti. */
    public enum Precision {
        /** Değer yok. Aday doldurmadı; "bilinmiyor" demek değil, "beyan yok". */
        EMPTY,
        /** {@code YYYY-MM} — ay hassasiyetli. */
        MONTH,
        /** {@code YYYY} — yıl hassasiyetli. */
        YEAR,
        /** "Devam ediyor" / "Halen" / "Present" — bitiş bugündür. */
        ONGOING,
        /** Tanınmadı. Ham değer korunur; hesaba GİRMEZ ve kapsam raporunda sayılır. */
        UNPARSED
    }

    /**
     * Normalize sonucu. {@code value} kanonik değerdir; {@code ONGOING} ve
     * {@code EMPTY} için boştur (süregelenlik ayrı bir alanda taşınır, tarih
     * alanına yazılamaz — "Devam ediyor" bir tarih değildir).
     */
    public record Normalized(String value, Precision precision) {}

    private static final Pattern MONTH_VALUE = Pattern.compile("(19|20)\\d{2}-(0[1-9]|1[0-2])");
    private static final Pattern YEAR_VALUE = Pattern.compile("(19|20)\\d{2}");
    /** {@code 09/2022}, {@code 9.2022} — ay/yıl sırası. */
    private static final Pattern NUMERIC_MONTH_YEAR =
            Pattern.compile("(0?[1-9]|1[0-2])\\s*[./-]\\s*((?:19|20)\\d{2})");
    /** {@code 2022/09} — yıl/ay sırası (tire hâlini MONTH_VALUE zaten yakalar). */
    private static final Pattern YEAR_MONTH_NUMERIC =
            Pattern.compile("((?:19|20)\\d{2})\\s*[./]\\s*(0?[1-9]|1[0-2])");
    /** {@code Eyl 2022}, {@code Eylül 2022}. */
    private static final Pattern MONTH_NAME_YEAR =
            Pattern.compile("(\\p{L}{3,9})\\s+((?:19|20)\\d{2})");
    /** {@code 2022 Eylül} — Türkçe'de bu sıra da yaygın. */
    private static final Pattern YEAR_MONTH_NAME =
            Pattern.compile("((?:19|20)\\d{2})\\s+(\\p{L}{3,9})");

    /**
     * Süregelen iş/eğitim işaretleri. Ayrıştırıcının tarih aralığı
     * desenlerindeki sözcüklerle aynı küme tutulur — iki yerde farklı sözlük
     * olması, aynı CV'nin içe aktarımda ve form gönderiminde farklı yorumlanması
     * demektir.
     */
    private static final java.util.Set<String> ONGOING_MARKERS = java.util.Set.of(
            "devam", "devam ediyor", "devam ediyorum", "devam etmekte", "devamediyor",
            "halen", "halen devam ediyor", "hala", "hala devam ediyor",
            "gunumuz", "gunumuze kadar", "bugun", "suruyor",
            "present", "current", "currently", "now", "to date", "till date",
            "ongoing");

    /** Ay sözlüğü — ayrıştırıcı da buradan okur (tek kaynak, sürüklenme yok). */
    public static final Map<String, String> MONTHS = monthLexicon();

    private static Map<String, String> monthLexicon() {
        Map<String, String> m = new HashMap<>();
        String[][] tr = {
            {"ocak", "oca", "01"}, {"şubat", "şub", "02"}, {"mart", "mar", "03"},
            {"nisan", "nis", "04"}, {"mayıs", "may", "05"}, {"haziran", "haz", "06"},
            {"temmuz", "tem", "07"}, {"ağustos", "ağu", "08"}, {"eylül", "eyl", "09"},
            {"ekim", "eki", "10"}, {"kasım", "kas", "11"}, {"aralık", "ara", "12"},
        };
        for (String[] row : tr) {
            m.put(row[0], row[2]);
            m.put(row[1], row[2]);
            // Türkçe'ye özgü harfler kaybolmuş metinler yaygın ("subat", "agustos",
            // "eylul") — PDF çıkarımı sık sık aksanı düşürüyor.
            m.put(deaccent(row[0]), row[2]);
            m.put(deaccent(row[1]), row[2]);
        }
        String[][] en = {
            {"january", "jan", "01"}, {"february", "feb", "02"}, {"march", "mar", "03"},
            {"april", "apr", "04"}, {"may", "may", "05"}, {"june", "jun", "06"},
            {"july", "jul", "07"}, {"august", "aug", "08"}, {"september", "sep", "09"},
            {"october", "oct", "10"}, {"november", "nov", "11"}, {"december", "dec", "12"},
        };
        for (String[] row : en) {
            m.putIfAbsent(row[0], row[2]);
            m.putIfAbsent(row[1], row[2]);
        }
        return Map.copyOf(m);
    }

    /** Türkçe'ye özgü harfleri aksansız karşılıklarına indirir. */
    public static String deaccent(String value) {
        return value.replace("ş", "s").replace("ğ", "g").replace("ı", "i")
                .replace("ü", "u").replace("ö", "o").replace("ç", "c");
    }

    /** Değer "hâlâ sürüyor" mu diyor? */
    public static boolean ongoingMarker(String raw) {
        if (raw == null) return false;
        String key = deaccent(raw.trim().toLowerCase(Locale.ROOT))
                .replaceAll("[.\\-–—…]+$", "")
                .replaceAll("\\s+", " ")
                .trim();
        if (key.isEmpty()) return false;
        // "..." tek başına da bitişin sürdüğünü anlatır (CV'lerde yaygın).
        return ONGOING_MARKERS.contains(key) || raw.trim().matches("[.\\-–—…]{2,}");
    }

    /**
     * Ham değeri kanonik biçime çevirir. Değerin TAMAMI bir tarih olmalıdır;
     * "Eyl 2022 sonrası" yarım çevrilmez, {@code UNPARSED} döner — yarım
     * çevrilmiş bir tarih, çevrilmemişten daha tehlikelidir çünkü hesaba girer.
     */
    public static Normalized normalize(String raw) {
        if (raw == null) return new Normalized("", Precision.EMPTY);
        String v = raw.trim().replaceAll("\\s+", " ");
        if (v.isEmpty()) return new Normalized("", Precision.EMPTY);
        if (ongoingMarker(v)) return new Normalized("", Precision.ONGOING);
        if (MONTH_VALUE.matcher(v).matches()) return new Normalized(v, Precision.MONTH);
        if (YEAR_VALUE.matcher(v).matches()) return new Normalized(v, Precision.YEAR);

        Matcher ym = YEAR_MONTH_NUMERIC.matcher(v);
        if (ym.matches()) return month(ym.group(1), ym.group(2));
        Matcher my = NUMERIC_MONTH_YEAR.matcher(v);
        if (my.matches()) return month(my.group(2), my.group(1));
        Matcher named = MONTH_NAME_YEAR.matcher(v);
        if (named.matches()) {
            String m = lookupMonth(named.group(1));
            if (m != null) return new Normalized(named.group(2) + "-" + m, Precision.MONTH);
        }
        Matcher yearFirst = YEAR_MONTH_NAME.matcher(v);
        if (yearFirst.matches()) {
            String m = lookupMonth(yearFirst.group(2));
            if (m != null) return new Normalized(yearFirst.group(1) + "-" + m, Precision.MONTH);
        }
        // Tanınmadı: ham değer korunur. Sessizce boşaltmak veri kaybıdır.
        return new Normalized(raw.trim(), Precision.UNPARSED);
    }

    private static Normalized month(String year, String month) {
        String mm = month.length() == 1 ? "0" + month : month;
        return new Normalized(year + "-" + mm, Precision.MONTH);
    }

    private static String lookupMonth(String name) {
        String key = name.toLowerCase(Locale.ROOT);
        String m = MONTHS.get(key);
        return m != null ? m : MONTHS.get(deaccent(key));
    }

    /**
     * Kanonik bir değerin hassasiyeti — ŞEKLİNDEN okunur. Toplu hesap kapsam
     * raporunu (dilim D) bu fonksiyonla üretir; ikinci bir saklanan alan yok,
     * dolayısıyla çelişki de yok.
     */
    public static Precision precisionOf(String canonicalValue) {
        if (canonicalValue == null || canonicalValue.isBlank()) return Precision.EMPTY;
        String v = canonicalValue.trim();
        if (MONTH_VALUE.matcher(v).matches()) return Precision.MONTH;
        if (YEAR_VALUE.matcher(v).matches()) return Precision.YEAR;
        return Precision.UNPARSED;
    }
}
