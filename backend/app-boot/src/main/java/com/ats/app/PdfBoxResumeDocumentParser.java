package com.ats.app;

import com.ats.application.ResumeDocumentParser;
import com.ats.application.ResumeImportService.ProposalDraft;
import com.ats.application.ResumeImportService.ProposedEntry;
import com.ats.application.ResumeImportService.Provenance;
import com.ats.application.ResumeImportService.ResumeField;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.io.IOException;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.DoubleStream;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.text.TextPosition;

/**
 * Self-hosted, no-egress PDF parser adapter. It extracts only the explicit candidate-field
 * allowlist; protected and unsupported labels cannot become proposals.
 */
public final class PdfBoxResumeDocumentParser implements ResumeDocumentParser {

    /**
     * Her öneri bu dizeyi provenance olarak taşır; iki farklı çıkarım davranışı
     * aynı sürümü raporlarsa kanıt geriye izlenemez. Ayrıştırma davranışını
     * değiştiren her PR bunu bump ETMEK ZORUNDA. (#208 bump'sız gitti: canlı
     * ölçümde v6 davranışı v5 diye raporlandı.)
     *
     * <p>v9 (#218): deneyim/eğitim bölümleri artık yapısal KAYIT listesi de
     * yayınlıyor; davranış değiştiği için sürüm de değişti.
     */
    static final String VERSION = "pdfbox-3.0.5-rules-v9";
    private static final int MAX_EXTRACTED_CHARACTERS = 120_000;
    private static final Pattern INLINE = Pattern.compile("^\\s*([^:：]{1,48})\\s*[:：]\\s*(.+?)\\s*$");
    private static final Pattern EMAIL = Pattern.compile("[\\w.+-]+@[\\w.-]+\\.[A-Za-z]{2,}");
    private static final Pattern PHONE = Pattern.compile("(?:\\+?\\d[\\d ()-]{6,}\\d)");
    /**
     * Tarih sinyalleri. Kayıt sınırı adayı olarak ölçülür — hangisinin gerçekten
     * ayırt ettiği ölçümle belirlenir, varsayımla değil.
     *
     * <p>Ayırıcı olarak kısa çizgi, en-tire, em-tire ve "–" varyantları ile Türkçe
     * "Halen"/"Devam"/"Günümüz" ve İngilizce "Present"/"Current" kabul edilir:
     * gerçek CV'lerde bitiş tarihi çoğu zaman yıl değil bu kelimelerdir.
     */
    private static final Pattern YEAR_RANGE = Pattern.compile(
            "(?:19|20)\\d{2}\\s*[-–—/]\\s*(?:(?:19|20)\\d{2}|"
                    + "[Hh]alen|[Dd]evam(?:\\s+ediyor)?|[Gg]ünümüz|[Pp]resent|[Cc]urrent|"
                    + "[Nn]ow|\\.{2,})");
    private static final Pattern SINGLE_YEAR = Pattern.compile("(?<!\\d)(?:19|20)\\d{2}(?!\\d)");

    /**
     * #242 dilim A: AY + YIL normalizasyonu. Ayrıştırıcı bugüne kadar YALNIZ yıl
     * tanıyordu; "Eyl 2022 - Mar 2024" satırından "2022 - 2024" çıkıyor, ay
     * bilgisi SESSİZCE atılıyordu. Toplu hesap ay hassasiyeti istediği için
     * (sahip gereksinimi) bu kayıp doğrudan ürün gereksinimini bozuyor.
     *
     * <p>Normalizasyon çıktısı tek biçim: {@code YYYY-MM}. Böylece aşağıdaki tüm
     * katmanlar (form alanı, sunucu doğrulaması, toplu hesap) aynı dili konuşur.
     * Ay bulunamazsa değer yıl olarak kalır — uydurulmuş bir ay, eksik aydan
     * kötüdür (yanlışlığı görünmez olur).
     */
    private static final Map<String, String> MONTHS = monthLexicon();

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
            // Türkçe'ye özgü harfler kaybolmuş CV metinleri yaygın ("subat",
            // "agustos", "eylul") — PDF çıkarımı sık sık aksanı düşürüyor.
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

    private static String deaccent(String value) {
        return value.replace("ş", "s").replace("ğ", "g").replace("ı", "i")
                .replace("ü", "u").replace("ö", "o").replace("ç", "c");
    }

    /** "Eyl 2022" / "Eylül 2022" / "09/2022" / "2022-09" → "2022-09". */
    /** Normalize edilmiş ay aralığı: "2022-09 - 2024-03" ya da "2022-09 - Halen". */
    private static final Pattern MONTH_RANGE = Pattern.compile(
            "(?:19|20)\\d{2}-(?:0[1-9]|1[0-2])\\s*[-–—/]\\s*"
                    + "(?:(?:19|20)\\d{2}-(?:0[1-9]|1[0-2])|"
                    + "[Hh]alen|[Dd]evam(?:\\s+ediyor)?|[Gg]ünümüz|[Pp]resent|[Cc]urrent|"
                    + "[Nn]ow|\\.{2,})");
    private static final Pattern SINGLE_MONTH = Pattern.compile(
            "(?<!\\d)(?:19|20)\\d{2}-(?:0[1-9]|1[0-2])(?!\\d)");

    private static final Pattern MONTH_NAME_YEAR = Pattern.compile(
            "(?<![\\p{L}])(\\p{L}{3,9})\\s+((?:19|20)\\d{2})(?!\\d)");
    private static final Pattern NUMERIC_MONTH_YEAR = Pattern.compile(
            "(?<!\\d)(0?[1-9]|1[0-2])\\s*[./]\\s*((?:19|20)\\d{2})(?!\\d)");
    private static final Pattern ISO_MONTH = Pattern.compile(
            "(?<!\\d)((?:19|20)\\d{2})-(0[1-9]|1[0-2])(?!\\d)");

    /**
     * Satırdaki ay+yıl ifadelerini {@code YYYY-MM}'e çevirir. Tanınmayan metne
     * DOKUNMAZ: ay adı sözlükte yoksa satır olduğu gibi kalır ve mevcut yıl
     * ayrıştırması devreye girer.
     */
    static String normalizeMonthYear(String text) {
        if (text == null || text.isBlank()) return text;
        String out = ISO_MONTH.matcher(text).replaceAll("$1-$2");
        Matcher numeric = NUMERIC_MONTH_YEAR.matcher(out);
        StringBuilder sb = new StringBuilder();
        while (numeric.find()) {
            String month = numeric.group(1).length() == 1 ? "0" + numeric.group(1) : numeric.group(1);
            numeric.appendReplacement(sb, numeric.group(2) + "-" + month);
        }
        numeric.appendTail(sb);
        out = sb.toString();

        Matcher named = MONTH_NAME_YEAR.matcher(out);
        StringBuilder nb = new StringBuilder();
        while (named.find()) {
            String key = named.group(1).toLowerCase(java.util.Locale.ROOT);
            String month = MONTHS.get(key);
            if (month == null) month = MONTHS.get(deaccent(key));
            named.appendReplacement(nb,
                    month == null ? Matcher.quoteReplacement(named.group())
                            : named.group(2) + "-" + month);
        }
        named.appendTail(nb);
        return nb.toString();
    }
    /**
     * Kayıt-başı eşikleri. Ölçülen değerler: kayıt başı satırların punto oranı
     * 1.13–1.17, gövde 1.00 → 1.05 eşiği ikisini ayırır. Sol kenar toleransı 6pt:
     * ölçümde aynı bölümün iki kaydı 97.3 ve 102.1'de başlıyor (4.8pt fark), ama
     * madde girintisi 9.4pt — tolerans ikisinin arasında olmalı.
     */
    private static final double RECORD_FONT_RATIO = 1.05;
    private static final double RECORD_LEFT_TOLERANCE = 6.0;
    private static final double LEFT_EDGE_BUCKET = 3.0;
    private static final Pattern MONTH_NAME = Pattern.compile(
            "(?i)\\b(?:ocak|şubat|subat|mart|nisan|mayıs|mayis|haziran|temmuz|ağustos|agustos|"
                    + "eylül|eylul|ekim|kasım|kasim|aralık|aralik|"
                    + "jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\\b");
    private static final Map<String, ResumeField> LABELS = labels();
    /** Uzun etiket önce denenir: "work experience" > "experience". */
    private static final List<Map.Entry<String, ResumeField>> LABELS_BY_LENGTH =
            LABELS.entrySet().stream()
                    .sorted((a, b) -> Integer.compare(
                            b.getKey().split(" ").length, a.getKey().split(" ").length))
                    .toList();
    private static final int MAX_HEADING_CHARS = 48;
    private static final int MAX_HEADING_TOKENS = 6;
    private static final int MIN_HEADING_LETTERS = 3;
    /** Ek toleranslı eşleşme yalnız bu uzunluktan sonra açılır. */
    private static final int MIN_SUFFIX_TOLERANT_LABEL = 5;
    private static final int HEADER_LINES_SCANNED = 10;
    private static final double FULL_NAME_CONFIDENCE = 0.60;
    /** Yan çubuk satırı içerik genişliğinin bu oranından sonra BAŞLAR. */
    private static final double SIDEBAR_START_SHARE = 0.60;
    /** Yan çubuk satırı dardır; ana kolon satırları geniştir. */
    private static final double SIDEBAR_MAX_WIDTH_SHARE = 0.25;
    private static final int MIN_LINES_FOR_SIDEBAR_SPLIT = 8;
    private static final int MIN_SIDEBAR_LINES = 3;
    /**
     * PDFBox aynı taban hizasındaki iki kolonu TEK satır olarak yayar; ayırıcı
     * sentetiktir, gliflerde boşluk karakteri yoktur. Ölçüm (gerçek CV, 115
     * satır): satır-içi boşluklar ya &lt;= 8pt (kelime arası) ya &gt;= 144.8pt
     * (kolon oluğu) — arada hiçbir değer yok. Eşik bu boşluğun ortasında durur,
     * yani tek bir belgeye ayarlanmış değil.
     */
    private static final double COLUMN_GAP_MIN_PT = 36.0;
    /** Mutlak eşiğe ek: boşluk, satırın tipik glif ilerlemesinin katı olmalı. */
    private static final double COLUMN_GAP_ADVANCE_FACTOR = 6.0;
    /**
     * Korumalı etiketler. Tek kelimelik girdiler YALNIZ tam eşleşmeyle tetiklenir;
     * önek eşleşmesi (etiket + boşluk + kalanı) yalnız çok kelimeli, yani yeterince
     * belirli girdiler için açılır.
     *
     * <p>Sebep ölçüldü: liste bare "saglik" içeriyordu ve önek eşleşmesiyle meşru
     * iş unvanlarını siliyordu — `Sağlık Emniyet Çevre Koordinatörü` sağlık verisi
     * sanılıp bastırılıyor, adayın deneyimi kayboluyordu. Türkçe'de "Sağlık"
     * sayısız unvanda geçer (İş Sağlığı ve Güvenliği Uzmanı, Sağlık Teknikeri).
     * Korunması gereken şey adayın SAĞLIK DURUMU'dur, "sağlık" kelimesi değil;
     * o yüzden çok kelimeli biçimler açıkça listelendi.
     *
     * <p>Askerlik (#214): Türkiye'de standart CV alanı ve iki korumalı kategoriye
     * VEKİL — yalnız erkekler yükümlü olduğu için cinsiyet, muafiyetler ağırlıkla
     * sağlık gerekçeli olduğu için sağlık/engellilik. Bu yüzden CV'den forma
     * önerilmez. Bare "askerlik" YALNIZ tam eşleşmedir; önek eşleşmesi açılamaz,
     * çünkü `Askerlik Şube Başkanı` gerçek bir iş unvanıdır ve bastırılırsa
     * "saglik" hatası tekrarlanır. Etiketin tek kelime kaldığı biçimler
     * ({@code Askerlik: Yapıldı}) {@link #MILITARY_STATUS_WORDS} ile ayrılır.
     */
    private static final Set<String> PROTECTED_LABELS = Set.of(
            "dogum tarihi", "dogum yeri", "yas", "cinsiyet", "medeni durum",
            "uyruk", "milliyet", "din", "sendika", "engellilik",
            "saglik", "saglik durumu", "saglik bilgisi", "saglik bilgileri",
            "saglik raporu", "kronik hastalik", "engellilik durumu",
            "tc kimlik no", "t c kimlik no", "kimlik no", "ucret beklentisi",
            "maas beklentisi", "fotograf", "referans", "referanslar",
            "adres", "adres bilgisi", "adres bilgileri", "tam adres", "posta kodu",
            "askerlik", "askerlik durumu", "askerlik hizmeti",
            "askerlik bilgisi", "askerlik bilgileri", "askerlik yukumlulugu");

    /**
     * Aynı taban hizasındaki iki kolon PDFBox'tan TEK satır olarak gelebilir
     * ("HEAD OF HSE ... COACH" + "EDUCATION"); oluk glifsizdir. Bölmezsek yan
     * çubuk başlığı ana kolon metnine yapışır: başlık ya hiç açılmaz (EDUCATION
     * kaybolur) ya da yanlış yerde açılıp sonrasını yutar (CERTIFICATIONS 3561c).
     *
     * <p>Saf tutuldu: PDFBox'ın kelime ayırıcısı gömülü fonta göre değiştiği
     * için karar bu seviyede doğrulanır, PDF baytları üzerinden değil.
     *
     * <p>PDFBox glif olmayan yere sentetik ayırıcı ekleyebilir; o zaman metin ile
     * glif sayısı 1:1 değildir ve indeksle dilimlemek metni bozar. Bu durumda
     * BÖLMEYİZ — fail-safe, bölme öncesi davranışa göre regresyon üretmez.
     *
     * @return {@code [başlangıç, bitiş)} glif aralıkları; bölme yoksa tek aralık
     */
    static List<int[]> columnRanges(int textLength, double[] xs, double[] widths) {
        List<int[]> whole = List.of(new int[] {0, xs.length});
        if (textLength != xs.length || xs.length != widths.length) return whole;
        double gutter = Math.max(COLUMN_GAP_MIN_PT, COLUMN_GAP_ADVANCE_FACTOR * median(widths));
        List<int[]> ranges = new ArrayList<>();
        int start = 0;
        double previousEnd = Double.NaN;
        for (int i = 0; i < xs.length; i++) {
            if (i > start && xs[i] - previousEnd >= gutter) {
                ranges.add(new int[] {start, i});
                start = i;
            }
            previousEnd = xs[i] + widths[i];
        }
        if (ranges.isEmpty()) return whole;
        ranges.add(new int[] {start, xs.length});
        return ranges;
    }

    private static double median(double[] values) {
        double[] positive = DoubleStream.of(values).filter(value -> value > 0).sorted().toArray();
        return positive.length == 0 ? 0 : positive[positive.length / 2];
    }

    /**
     * #213: satıra TİPOGRAFİ bilgisi eklendi. Gerekçe ölçümle sabit: Türkçe
     * CV'lerde (özellikle kariyer.net düzeninde) başlıklar BÜYÜK HARF değil
     * mixed-case yazılıyor ve %70-büyük-harf ölçütü hepsini reddediyor. Ölçüm
     * ayrıca büyük-harf kuralını GEVŞETMENİN yanlış olduğunu gösterdi (referans
     * CV 9/10 -> 5/10, üstelik yanlış değerlerle). Doğru sinyal tipografi:
     * başlık, gövdeden belirgin biçimde daha büyük ve/veya kalın yazılır.
     */
    private record TextLine(
            String text, int page, double x, double y, double width, double height,
            double fontSize, boolean bold) {}

    private record LocatedValue(
            String value,
            int page,
            double confidence,
            double x,
            double y,
            double width,
            double height) {}

    @Override
    public Outcome<ParseResult> parse(byte[] pdfBytes, int maxPages) {
        if (pdfBytes == null || pdfBytes.length == 0 || maxPages < 1) {
            return Outcome.fail(OutcomeCode.INVALID, "PDF parser girdisi geçersiz");
        }
        try (PDDocument document = Loader.loadPDF(pdfBytes)) {
            if (document.isEncrypted()) {
                return Outcome.fail(OutcomeCode.INVALID, "şifreli PDF desteklenmiyor");
            }
            int pageCount = document.getNumberOfPages();
            if (pageCount < 1 || pageCount > maxPages) {
                return Outcome.fail(OutcomeCode.INVALID, "PDF sayfa sınırı aşıldı");
            }
            PositionedTextStripper stripper = new PositionedTextStripper();
            Map<ResumeField, LocatedValue> values = new LinkedHashMap<>();
            // #218: blob'un yanında bölüm SATIRLARI de tutulur. Kayıt sınırı sinyali
            // satır geometrisinde (kalınlık, punto, x) — birleştirilmiş metinde yok.
            // Blob üretimi aynen korunur: yapısal gruplama başarısız olursa tüketici
            // bugünkü davranışa düşer.
            Map<ResumeField, List<TextLine>> sectionLines = new LinkedHashMap<>();
            int protectedSuppressed = 0;
            int extractedCharacters = 0;

            for (int page = 1; page <= pageCount; page++) {
                List<TextLine> lines = stripper.extract(document, page);
                extractedCharacters += lines.stream().mapToInt(line -> line.text().length()).sum();
                if (extractedCharacters > MAX_EXTRACTED_CHARACTERS) {
                    return Outcome.fail(OutcomeCode.INVALID, "PDF metin sınırı aşıldı");
                }
                // #204: iki kolonlu CV'lerde y-sıralı akış kolonları harmanlar ve bölüm
                // sınırları çöker (sağ kolon başlığı sol kolon içeriğini yutar). Gerçek
                // oluk varsa her kolon kendi içinde, kendi bölüm durumuyla işlenir.
                List<List<TextLine>> columns = splitIntoColumns(lines);
                for (int index = 0; index < columns.size(); index++) {
                    // İki akış varsa ikincisi yan çubuktur (splitIntoColumns sırası).
                    boolean sidebar = columns.size() > 1 && index == columns.size() - 1;
                    PageResult pageResult =
                            parsePage(columns.get(index), values, sectionLines, sidebar);
                    protectedSuppressed += pageResult.protectedSuppressed();
                }
                if (page == 1) proposeFullNameFromHeader(lines, values);
            }

            List<ProposalDraft> proposals = new ArrayList<>();
            for (Map.Entry<ResumeField, LocatedValue> entry : values.entrySet()) {
                LocatedValue located = entry.getValue();
                proposals.add(new ProposalDraft(
                        entry.getKey(), located.value(),
                        new Provenance(located.page(), located.x(), located.y(),
                                located.width(), located.height(), located.confidence(), VERSION),
                        proposedEntries(entry.getKey(), sectionLines.get(entry.getKey()),
                                located.page())));
            }
            return Outcome.ok(new ParseResult(
                    proposals, pageCount, protectedSuppressed, 0, VERSION));
        } catch (IOException | RuntimeException invalid) {
            return Outcome.fail(OutcomeCode.INVALID, "PDF güvenli biçimde okunamadı");
        }
    }

    private record PageResult(int protectedSuppressed) {}

    /**
     * Yan çubuk ayrımı (#204). Tek akış varsayımı, sağ kenar-çubuğu olan CV'lerde
     * bölüm sınırlarını bozar: y-sıralı akışta yan çubuk başlığı ana kolonun ortasında
     * belirir ve sonraki tüm ana-kolon içeriği yanlış alana yazılır (canlı ölçüm:
     * skills alanına 1822 karakterlik deneyim metni).
     *
     * <p>Ayırt edici <strong>satır başlangıcıdır</strong>, genişlik değil: gerçek
     * PDFBox akışında ana kolon satırları yan çubuğun x aralığına kadar uzanır
     * (x=30 w=537), bu yüzden oluk-tabanlı bölme çöker. Yan çubuk ise dardır ve
     * sayfanın sağından başlar (x=451 w=46..103).
     *
     * <p>Yeterli sayıda yan-çubuk satırı yoksa sayfa tek akıştır — tek kolonlu CV'ler
     * bozulmaz.
     */
    private static List<List<TextLine>> splitIntoColumns(List<TextLine> lines) {
        if (lines.size() < MIN_LINES_FOR_SIDEBAR_SPLIT) return List.of(lines);
        double minX = lines.stream().mapToDouble(TextLine::x).min().orElse(0);
        double maxRight = lines.stream().mapToDouble(l -> l.x() + l.width()).max().orElse(0);
        double contentWidth = maxRight - minX;
        if (contentWidth <= 0) return List.of(lines);

        // Ayırt edici SATIR BAŞLANGICI, genişlik değil. Gerçek PDFBox akışında ana
        // kolon satırları yan çubuğun x aralığına kadar uzanıyor (x=30 w=537), bu
        // yüzden "oluğu kimse kesmez" varsayımı çöküyordu. Yan çubuk ise dar ve
        // sayfanın sağ tarafından BAŞLIYOR (x=451 w=46..103).
        double sidebarStart = minX + contentWidth * SIDEBAR_START_SHARE;
        double sidebarMaxWidth = contentWidth * SIDEBAR_MAX_WIDTH_SHARE;
        List<TextLine> sidebar = lines.stream()
                .filter(l -> l.x() >= sidebarStart && l.width() <= sidebarMaxWidth).toList();
        if (sidebar.size() < MIN_SIDEBAR_LINES) return List.of(lines);
        List<TextLine> main = lines.stream().filter(l -> !sidebar.contains(l)).toList();
        if (main.size() < MIN_SIDEBAR_LINES) return List.of(lines);

        // Ana akış önce: bölüm başlıkları ve içeriği kendi akışında kalır; yan çubuk
        // başlığı (ör. COMPETENCIES) artık ana kolonun deneyim metnini yutamaz.
        return List.of(main, sidebar);
    }

    private static PageResult parsePage(
            List<TextLine> lines, Map<ResumeField, LocatedValue> values,
            Map<ResumeField, List<TextLine>> sectionLines, boolean sidebar) {
        ResumeField active = null;
        boolean headingJustOpened = false;
        int protectedSuppressed = 0;

        for (TextLine source : lines) {
            String line = source.text().replaceAll("\\s+", " ").trim();
            if (line.isEmpty()) continue;
            Matcher inline = INLINE.matcher(line);
            if (inline.matches()) {
                String label = normalizeLabel(inline.group(1));
                if (isProtected(label)) {
                    protectedSuppressed++;
                    active = null;
                    continue;
                }
                ResumeField field = LABELS.get(label);
                if (field != null) {
                    putOrAppend(values, field, sanitize(inline.group(2), field), source, 0.97);
                    active = null;
                    continue;
                }
            }

            String heading = normalizeLabel(line.replaceFirst("[:：]\\s*$", ""));
            if (isProtected(heading)) {
                protectedSuppressed++;
                active = null;
                continue;
            }
            ResumeField section = headingField(line, heading);
            if (section != null) {
                active = section;
                headingJustOpened = true;
                continue;
            }
            // #208: sözlükte olmayan ama başlık şeklinde olan satır. Ölçüm (gerçek
            // CV): ana kolonda bunlar İŞ UNVANI (HSE MANAGER, SITE CHIEF, CORPORATE
            // HEAD OF HSE) — bölümü kapatmak deneyimi yok ederdi. Yan çubukta ise
            // hepsi gerçek bölüm başlığı (AWARD, TRAINING, SECTOR EXPOSURE) ve
            // kapatmazsak bir önceki alanın sonuna yapışıyorlar.
            if (sidebar && looksLikeHeading(line)) {
                // Başlık iki satıra sarabilir ("CERTIFICATIONS &" + "TRAINING").
                // Devam satırı bölümü kapatırsa alan boş kalıyordu; ölçümde
                // certifications 467c -> eksik oldu. Sarma satırını yut, kapatma.
                if (!headingJustOpened) active = null;
                headingJustOpened = false;
                continue;
            }
            headingJustOpened = false;
            if (active != null) {
                putOrAppend(values, active, sanitize(line, active), source, 0.92);
                // #218: aynı satır blob'a da, kayıt gruplaması için de gider. Tek
                // kaynaktan beslenmesi şart — ayrı yollar iki farklı gerçek üretir.
                if (active == ResumeField.EXPERIENCE || active == ResumeField.EDUCATION) {
                    sectionLines.computeIfAbsent(active, key -> new ArrayList<>())
                            .add(new TextLine(line, source.page(), source.x(), source.y(),
                                    source.width(), source.height(), source.fontSize(),
                                    source.bold()));
                }
            }
        }

        if (!values.containsKey(ResumeField.EMAIL)) {
            for (TextLine source : lines) {
                Matcher email = EMAIL.matcher(source.text());
                if (email.find()) {
                    values.put(ResumeField.EMAIL, located(email.group(), source, 0.90));
                    break;
                }
            }
        }
        if (!values.containsKey(ResumeField.PHONE)) {
            boolean found = false;
            for (TextLine source : lines) {
                Matcher phone = PHONE.matcher(source.text());
                while (phone.find()) {
                    String candidate = phone.group().trim();
                    int digits = candidate.replaceAll("\\D", "").length();
                    if (digits >= 10 && digits <= 15) {
                        values.put(ResumeField.PHONE, located(candidate, source, 0.86));
                        found = true;
                        break;
                    }
                }
                if (found) break;
            }
        }
        return new PageResult(protectedSuppressed);
    }

    private static void putOrAppend(
            Map<ResumeField, LocatedValue> values,
            ResumeField field,
            String value,
            TextLine source,
            double confidence) {
        if (value == null || value.isBlank()) return;
        LocatedValue previous = values.get(field);
        if (previous == null) {
            values.put(field, located(value, source, confidence));
            return;
        }
        if (field == ResumeField.EXPERIENCE || field == ResumeField.EDUCATION
                || field == ResumeField.SUMMARY || field == ResumeField.SKILLS
                || field == ResumeField.LANGUAGES || field == ResumeField.CERTIFICATIONS) {
            // One proposal has one page+bbox citation. Never append text from a different page to
            // a citation that cannot prove it.
            if (previous.page() != source.page()) return;
            String combined = previous.value() + "\n" + value;
            if (combined.length() <= field.maxLength()) {
                double x = Math.min(previous.x(), source.x());
                double y = Math.min(previous.y(), source.y());
                double right = Math.max(previous.x() + previous.width(), source.x() + source.width());
                double bottom = Math.max(previous.y() + previous.height(), source.y() + source.height());
                values.put(field, new LocatedValue(
                        combined, previous.page(), Math.min(previous.confidence(), confidence),
                        x, y, right - x, bottom - y));
            }
        }
    }

    private static LocatedValue located(String value, TextLine source, double confidence) {
        return new LocatedValue(value, source.page(), confidence, source.x(), source.y(),
                source.width(), source.height());
    }

    /** Captures the actual text-line rectangle emitted by PDFBox; no page-wide fake provenance. */
    private static final class PositionedTextStripper extends PDFTextStripper {
        private final List<TextLine> lines = new ArrayList<>();
        private int page;

        PositionedTextStripper() throws IOException {
            setSortByPosition(true);
        }

        List<TextLine> extract(PDDocument document, int page) throws IOException {
            lines.clear();
            this.page = page;
            setStartPage(page);
            setEndPage(page);
            getText(document);
            return List.copyOf(lines);
        }

        @Override
        protected void writeString(String text, List<TextPosition> positions) throws IOException {
            if (text == null || text.isBlank() || positions == null || positions.isEmpty()) return;
            for (int[] range : columnRanges(text, positions)) {
                emit(text, positions, range[0], range[1]);
            }
        }

        private static List<int[]> columnRanges(String text, List<TextPosition> positions) {
            double[] xs = new double[positions.size()];
            double[] widths = new double[positions.size()];
            for (int i = 0; i < positions.size(); i++) {
                xs[i] = positions.get(i).getXDirAdj();
                widths[i] = positions.get(i).getWidthDirAdj();
            }
            return PdfBoxResumeDocumentParser.columnRanges(text.length(), xs, widths);
        }

        private void emit(String text, List<TextPosition> positions, int from, int to) {
            String value = text.substring(from, to).strip();
            if (value.isEmpty()) return;
            double left = Double.POSITIVE_INFINITY;
            double top = Double.POSITIVE_INFINITY;
            double right = Double.NEGATIVE_INFINITY;
            double bottom = Double.NEGATIVE_INFINITY;
            for (TextPosition position : positions.subList(from, to)) {
                double x = position.getXDirAdj();
                double y = position.getYDirAdj();
                left = Math.min(left, x);
                top = Math.min(top, y - position.getHeightDir());
                right = Math.max(right, x + position.getWidthDirAdj());
                bottom = Math.max(bottom, y);
            }
            double width = Math.max(0.1, right - left);
            double height = Math.max(0.1, bottom - top);
            lines.add(new TextLine(value, page, Math.max(0, left), Math.max(0, top), width, height,
                    medianFontSize(positions, from, to), looksBold(positions, from, to)));
        }

        /**
         * Satırın punto ölçüsü. ORTANCA alınır, ortalama değil: tek bir büyük
         * karakter (madde işareti, simge) ortalamayı kaydırır ve satırı yanlışlıkla
         * başlık gibi gösterir.
         */
        private static double medianFontSize(List<TextPosition> positions, int from, int to) {
            double[] sizes = new double[to - from];
            for (int i = from; i < to; i++) sizes[i - from] = positions.get(i).getFontSizeInPt();
            java.util.Arrays.sort(sizes);
            if (sizes.length == 0) return 0;
            return sizes[sizes.length / 2];
        }

        /**
         * Kalınlık font ADINDAN okunur (PDFBox gömülü fontta ağırlık alanını her
         * zaman vermez). Satırın YARISINDAN fazlası kalın fontla yazılmışsa satır
         * kalın sayılır — tek kalın kelime satırı başlık yapmaz.
         */
        private static boolean looksBold(List<TextPosition> positions, int from, int to) {
            int bold = 0;
            int counted = 0;
            for (int i = from; i < to; i++) {
                var font = positions.get(i).getFont();
                if (font == null || font.getName() == null) continue;
                counted++;
                String name = font.getName().toLowerCase(java.util.Locale.ROOT);
                if (name.contains("bold") || name.contains("black") || name.contains("heavy")
                        || name.contains("semibold") || name.contains("demibold")) {
                    bold++;
                }
            }
            return counted > 0 && bold * 2 > counted;
        }
    }

    /**
     * #213 TEŞHİS — kural yazmadan önce ölçüm. Satır METNİNİ basmaz (gerçek CV = PII);
     * yalnız şekil bilgisini ve mevcut kuralların o satır için ne dediğini basar.
     *
     * <p>Yalnız teşhis testinden çağrılır; üretim akışında kullanılmaz.
     */
    static String diagnose(byte[] pdfBytes) throws IOException {
        StringBuilder out = new StringBuilder();
        try (PDDocument document = Loader.loadPDF(pdfBytes)) {
            PositionedTextStripper stripper = new PositionedTextStripper();
            for (int page = 1; page <= document.getNumberOfPages(); page++) {
                List<TextLine> lines = stripper.extract(document, page);
                List<List<TextLine>> columns = splitIntoColumns(lines);
                double[] sorted = lines.stream().mapToDouble(TextLine::fontSize).sorted()
                        .toArray();
                double body = sorted.length == 0 ? 0 : sorted[sorted.length / 2];
                double leftMargin = lines.stream().mapToDouble(TextLine::x).min().orElse(0);
                out.append(String.format("sayfa=%d satır=%d akış=%d gövdePt=%.0f solKenar=%.0f%n",
                        page, lines.size(), columns.size(), body, leftMargin));
                for (int c = 0; c < columns.size(); c++) {
                    List<TextLine> col = columns.get(c);
                    double minX = col.stream().mapToDouble(TextLine::x).min().orElse(0);
                    double maxX = col.stream().mapToDouble(l -> l.x() + l.width()).max().orElse(0);
                    boolean sidebar = columns.size() > 1 && c == columns.size() - 1;
                    out.append(String.format("  akış#%d satır=%d x=[%.0f..%.0f] yanÇubukMu=%s%n",
                            c, col.size(), minX, maxX, sidebar));
                    for (TextLine line : col) {
                        String t = line.text().strip();
                        int letters = 0;
                        int upper = 0;
                        for (int i = 0; i < t.length(); i++) {
                            if (Character.isLetter(t.charAt(i))) {
                                letters++;
                                if (Character.isUpperCase(t.charAt(i))) upper++;
                            }
                        }
                        String norm = normalizeLabel(t);
                        out.append(String.format(
                                "    oran=%.2f kalın=%-5s solda=%-5s uzun=%-3d büyük=%2d%% "
                                        + "başlıkMı=%-5s etiket=%s%n",
                                body == 0 ? 0 : line.fontSize() / body, line.bold(),
                                Math.abs(line.x() - leftMargin) < 2.0, t.length(),
                                letters == 0 ? 0 : (100 * upper / letters),
                                looksLikeHeading(t),
                                headingField(t, norm) == null ? "-" : headingField(t, norm)));
                    }
                }
            }
        }
        return out.toString();
    }

    /**
     * #218 — gruplanan kayıtları yapısal öneriye çevirir.
     *
     * <p>Yalnız deneyim ve eğitim için çalışır; diğer alanlar tek değerdir.
     * Gruplama <strong>tek</strong> kayıt bulduysa boş liste döner: tek kayıt,
     * bugünkü blob davranışının ta kendisidir ve yapısal liste olarak göndermek
     * tüketiciye yanlış bir "gruplama başarılı" sinyali verirdi.
     *
     * <p>Kayıt içinde: ilk satır başlık (unvan/okul), tarih deseni bulunan İLK satır
     * tarih metni, kalanlar açıklama. {@code subtitle} (şirket/bölüm) BOŞ bırakılır —
     * ölçümde ayırt edici bir sinyal bulunamadı; tahmin etmek adayın düzeltmek
     * zorunda kalacağı yanlış veri üretirdi.
     *
     * <p>YALNIZ {@code citationPage} satırları kullanılır. Blob da aynı kuralla
     * kurulur ({@code putOrAppend} sayfa değişince eklemeyi reddeder): bir öneri tek
     * sayfa+bbox alıntısı taşır ve o alıntı başka sayfadaki metni kanıtlayamaz.
     * Filtrelemeyi atladığımda ölçüm anında yakaladı — blob 2078 karakterken kayıtlar
     * ~4400 karakter taşıyordu, yani 2. sayfa içeriği 1. sayfa alıntısı altında
     * yayınlanıyordu. Çok sayfaya yayılan bölüm sınırlaması blob'da da var; bu
     * değişiklik onu genişletmiyor, tutarlı kalıyor.
     */
    private static List<ProposedEntry> proposedEntries(
            ResumeField field, List<TextLine> lines, int citationPage) {
        if (field != ResumeField.EXPERIENCE && field != ResumeField.EDUCATION) return List.of();
        if (lines == null || lines.isEmpty()) return List.of();
        List<TextLine> cited = lines.stream().filter(l -> l.page() == citationPage).toList();
        if (cited.isEmpty()) return List.of();
        List<List<TextLine>> records = groupSectionRecords(cited);
        if (records.size() < 2) return List.of();

        List<ProposedEntry> entries = new ArrayList<>();
        for (List<TextLine> record : records) {
            String title = record.isEmpty() ? "" : record.get(0).text();
            String dateText = "";
            String subtitle = "";
            List<String> description = new ArrayList<>();
            for (int i = 1; i < record.size(); i++) {
                String text = record.get(i).text();
                if (dateText.isEmpty()) {
                    DateLine parsed = splitDateLine(text);
                    if (parsed != null) {
                        dateText = parsed.dateText();
                        subtitle = parsed.remainder();
                        continue;
                    }
                }
                description.add(text);
            }
            entries.add(
                    new ProposedEntry(title, subtitle, dateText, String.join("\n", description)));
        }
        return List.copyOf(entries);
    }

    private record DateLine(String dateText, String remainder) {}

    /**
     * #218 düzeltme — tarih satırı yalnız tarih DEĞİL.
     *
     * <p>Canlı tarayıcı kabulünde ölçüldü: satır gerçekte
     * {@code "Ornek Sanayi AS 2019 - 2023"} biçiminde geliyor, yani şirket adını da
     * taşıyor. Satırın tamamını {@code dateText} olarak vermek, formda başlangıç
     * tarihi alanına <strong>"Ornek Sanayi AS 2019"</strong> yazdırdı — yanlış veri.
     * Birim testim bunu kaçırdı çünkü fixture'ı ideal hâlde ({@code "2019 - 2023"})
     * yazmıştım; gerçek satır yapısına göre değil.
     *
     * <p>Bu yüzden tarih aralığı satırdan ÇIKARILIR ve kalan metin {@code subtitle}
     * olur — şirket/bölüm alanının zaten boş kaldığı yer tam burasıydı, yani aynı
     * düzeltme iki eksiği birden kapatır.
     *
     * @return tarih deseni yoksa {@code null}
     */
    private static DateLine splitDateLine(String rawText) {
        // #242 A: ay+yıl önce tek biçime çevrilir; aksi halde "Eyl 2022" satırından
        // yalnız "2022" çıkar ve AY SESSİZCE KAYBOLUR.
        String text = normalizeMonthYear(rawText);
        Matcher month = MONTH_RANGE.matcher(text);
        if (month.find()) {
            return new DateLine(month.group(), stripAround(text, month.start(), month.end()));
        }
        Matcher singleMonth = SINGLE_MONTH.matcher(text);
        if (singleMonth.find()) {
            return new DateLine(singleMonth.group(),
                    stripAround(text, singleMonth.start(), singleMonth.end()));
        }
        Matcher range = YEAR_RANGE.matcher(text);
        if (range.find()) {
            return new DateLine(range.group(), stripAround(text, range.start(), range.end()));
        }
        Matcher single = SINGLE_YEAR.matcher(text);
        if (single.find()) {
            return new DateLine(single.group(), stripAround(text, single.start(), single.end()));
        }
        return null;
    }

    /** Tarih aralığının dışında kalan metni birleştirir; ayırıcı noktalama kırpılır. */
    private static String stripAround(String text, int from, int to) {
        String left = text.substring(0, from);
        String right = text.substring(to);
        String joined = (left + " " + right).replaceAll("\\s+", " ").trim();
        // Bas/son ayirici noktalama ("|", ",", "-", "·") tarih cikinca ORTADA kalir.
        return joined.replaceAll("^[|,;:\\-–—·•\\s]+", "").replaceAll("[|,;:\\-–—·•\\s]+$", "");
    }

    /**
     * #218 — bölüm satırlarını KAYITLARA böler.
     *
     * <p>Sinyal ölçümle seçildi, varsayımla değil. Gerçek CV'lerde deneyim/eğitim
     * bölümündeki her kaydın ilk satırı <strong>kalın veya gövdeden büyük</strong>
     * ve <strong>bölümün baskın sol kenarında</strong> başlıyor:
     *
     * <pre>
     * CV-A deneyim: oran=1.13 kalın=true  girinti=0.0   ← kayıt başı (×3)
     *               oran=1.00 kalın=false yılAralığı=true
     *               oran=1.00 kalın=false girinti=9.4   ← madde, kayıt başı DEĞİL
     * CV-B eğitim:  oran=1.17 kalın=true  x=102.1       ← kayıt başı
     *               oran=1.17 kalın=true  x= 97.3       ← kayıt başı (2. kayıt)
     * </pre>
     *
     * <p>Sol kenar şartı zorunlu: CV-B'nin deneyim bölümünde x=414.9'da da kalın bir
     * satır var (sağ kolon parçası, aynı kaydın devamı). Yalnız "kalın" kuralı onu
     * ikinci kayıt sayıp tek pozisyonu ikiye bölerdi.
     *
     * <p>Sinyal güvenilmezse <strong>tek kayıt</strong> döner — yani bugünkü tek-blob
     * davranışı fallback'tir. Satır sonuna göre bölmek yasak: ölçüm, blob'da kayıt
     * sınırı sinyali olmadığını gösterdi (0 boş satır, 0 çift-newline) ve satır bazlı
     * bölme 1-2 gerçek kayıttan ~5 çöp kart üretirdi.
     */
    static List<List<TextLine>> groupSectionRecords(List<TextLine> sectionLines) {
        if (sectionLines.size() < 2) return List.of(sectionLines);
        double[] fonts = sectionLines.stream().mapToDouble(TextLine::fontSize).sorted().toArray();
        double bodyFont = fonts[fonts.length / 2];
        double leftEdge = modalLeftEdge(sectionLines);

        List<Integer> starts = new ArrayList<>();
        for (int i = 0; i < sectionLines.size(); i++) {
            TextLine line = sectionLines.get(i);
            boolean emphasised = line.bold()
                    || (bodyFont > 0 && line.fontSize() > bodyFont * RECORD_FONT_RATIO);
            if (emphasised && Math.abs(line.x() - leftEdge) <= RECORD_LEFT_TOLERANCE) {
                starts.add(i);
            }
        }
        // İki sınırdan az: bölecek bir şey yok. Her satır sınır: sinyal ayırt
        // etmiyor (ör. bölümün tamamı kalın) — ikisinde de tek kayıt dönülür,
        // sessizce çöp kart üretmek yerine bugünkü davranış korunur.
        if (starts.size() < 2 || starts.size() == sectionLines.size()) {
            return List.of(sectionLines);
        }

        List<List<TextLine>> records = new ArrayList<>();
        for (int s = 0; s < starts.size(); s++) {
            // İlk sınırdan ÖNCEKİ satırlar atılmaz, ilk kayda eklenir: veri kaybı
            // yanlış gruplamadan kötüdür (CV-B deneyiminde sağ kolon parçası
            // ilk sınırdan önce geliyor).
            int from = s == 0 ? 0 : starts.get(s);
            int to = s + 1 < starts.size() ? starts.get(s + 1) : sectionLines.size();
            records.add(List.copyOf(sectionLines.subList(from, to)));
        }
        return List.copyOf(records);
    }

    /**
     * Bölümün baskın sol kenarı. Salt minimum x, tek bir sola kaçmış satıra
     * duyarlıdır; bu yüzden satırlar {@value #LEFT_EDGE_BUCKET}pt kovalara
     * yuvarlanır ve en kalabalık kovanın en küçük x'i kullanılır. Eşitlikte
     * daha soldaki kova kazanır.
     */
    private static double modalLeftEdge(List<TextLine> lines) {
        Map<Long, Integer> counts = new LinkedHashMap<>();
        Map<Long, Double> minima = new LinkedHashMap<>();
        for (TextLine line : lines) {
            long bucket = Math.round(line.x() / LEFT_EDGE_BUCKET);
            counts.merge(bucket, 1, Integer::sum);
            minima.merge(bucket, line.x(), Math::min);
        }
        long best = counts.entrySet().stream()
                .sorted(Map.Entry.<Long, Integer>comparingByValue().reversed()
                        .thenComparing(Map.Entry.comparingByKey()))
                .findFirst().map(Map.Entry::getKey).orElse(0L);
        return minima.getOrDefault(best, 0.0);
    }

    /**
     * #218 TEŞHİS — kayıt SINIRI sinyalini ölçer. Satır metnini basmaz (PII);
     * yalnız bölüm içindeki her satır için önceki satıra göre y-boşluğu, gövdeye
     * göre punto oranı, kalınlık, girinti ve tarih-deseni eşleşmesini basar.
     *
     * <p>Neden gerekli: blob'da (`\n` ile birleştirilmiş metin) kayıt sınırı
     * sinyali YOK — ölçüldü (0 boş satır, 0 çift-newline, 0 satır-başı yıl).
     * Sinyal ayrıştırıcıda, satır geometrisinde. Kural yazmadan önce hangi
     * sinyalin gerçekten ayırt ettiğini görmek gerekiyor.
     *
     * <p>Yalnız teşhis testinden çağrılır; üretim akışında kullanılmaz.
     */
    static String diagnoseSections(byte[] pdfBytes) throws IOException {
        StringBuilder out = new StringBuilder();
        try (PDDocument document = Loader.loadPDF(pdfBytes)) {
            PositionedTextStripper stripper = new PositionedTextStripper();
            for (int page = 1; page <= document.getNumberOfPages(); page++) {
                List<TextLine> lines = stripper.extract(document, page);
                List<List<TextLine>> columns = splitIntoColumns(lines);
                double[] sorted = lines.stream().mapToDouble(TextLine::fontSize).sorted().toArray();
                double body = sorted.length == 0 ? 0 : sorted[sorted.length / 2];
                for (int c = 0; c < columns.size(); c++) {
                    List<TextLine> col = columns.get(c);
                    boolean sidebar = columns.size() > 1 && c == columns.size() - 1;
                    double colMinX = col.stream().mapToDouble(TextLine::x).min().orElse(0);
                    ResumeField active = null;
                    TextLine previous = null;
                    for (TextLine source : col) {
                        String t = source.text().replaceAll("\\s+", " ").trim();
                        if (t.isEmpty()) continue;
                        ResumeField section = headingField(t, normalizeLabel(t));
                        if (section != null) {
                            active = section;
                            previous = null;
                            out.append(String.format("s%d akış%d BÖLÜM=%s%n", page, c, section));
                            continue;
                        }
                        if (sidebar && looksLikeHeading(t)) {
                            active = null;
                            previous = null;
                            continue;
                        }
                        if (active != ResumeField.EXPERIENCE && active != ResumeField.EDUCATION) {
                            continue;
                        }
                        double gap = previous == null ? -1 : source.y() - previous.y();
                        out.append(String.format(
                                "  s%d boşluk=%6.2f oran=%.2f kalın=%-5s x=%5.1f sağ=%5.1f "
                                        + "girinti=%5.1f uzun=%-3d yılAralığı=%-5s tekYıl=%-5s "
                                        + "ayVar=%-5s%n",
                                source.page(), gap, body == 0 ? 0 : source.fontSize() / body,
                                source.bold(), source.x(), source.x() + source.width(),
                                source.x() - colMinX, t.length(),
                                YEAR_RANGE.matcher(t).find(), SINGLE_YEAR.matcher(t).find(),
                                MONTH_NAME.matcher(t).find()));
                        previous = source;
                    }
                }
            }
        }
        return out.toString();
    }

    /**
     * #218 TEŞHİS — gruplamanın ÜRETTİĞİ kayıt sayısını basar. Kabul sinyali:
     * kayıt sayısı bölümdeki tarih-satırı sayısıyla tutmalı (her pozisyonun bir
     * tarih satırı olur). Metin basılmaz.
     */
    static String diagnoseGrouping(byte[] pdfBytes) throws IOException {
        StringBuilder out = new StringBuilder();
        try (PDDocument document = Loader.loadPDF(pdfBytes)) {
            PositionedTextStripper stripper = new PositionedTextStripper();
            for (int page = 1; page <= document.getNumberOfPages(); page++) {
                List<TextLine> lines = stripper.extract(document, page);
                List<List<TextLine>> columns = splitIntoColumns(lines);
                for (int c = 0; c < columns.size(); c++) {
                    List<TextLine> col = columns.get(c);
                    boolean sidebar = columns.size() > 1 && c == columns.size() - 1;
                    ResumeField active = null;
                    List<TextLine> bucket = new ArrayList<>();
                    for (TextLine source : col) {
                        String t = source.text().replaceAll("\\s+", " ").trim();
                        if (t.isEmpty()) continue;
                        ResumeField section = headingField(t, normalizeLabel(t));
                        boolean closes = section != null || (sidebar && looksLikeHeading(t));
                        if (closes) {
                            flushGroupingDiagnostic(out, page, c, active, bucket);
                            bucket = new ArrayList<>();
                            active = section;
                            continue;
                        }
                        if (active == ResumeField.EXPERIENCE || active == ResumeField.EDUCATION) {
                            bucket.add(source);
                        }
                    }
                    flushGroupingDiagnostic(out, page, c, active, bucket);
                }
            }
        }
        return out.toString();
    }

    private static void flushGroupingDiagnostic(
            StringBuilder out, int page, int column, ResumeField field, List<TextLine> bucket) {
        if (field == null || bucket.isEmpty()) return;
        if (field != ResumeField.EXPERIENCE && field != ResumeField.EDUCATION) return;
        long dateLines = bucket.stream()
                .filter(l -> YEAR_RANGE.matcher(l.text()).find()
                        || SINGLE_YEAR.matcher(l.text()).find())
                .count();
        List<List<TextLine>> records = groupSectionRecords(bucket);
        out.append(String.format("s%d akış%d %s satır=%d tarihSatırı=%d KAYIT=%d boyut=%s%n",
                page, column, field, bucket.size(), dateLines, records.size(),
                records.stream().map(r -> String.valueOf(r.size())).toList()));
    }

    /**
     * #213 TEŞHİS — sözlüğe girmeyen BAŞLIK adaylarını, metnini basmadan tanımlar.
     *
     * <p>Başlık metni kişisel veri değildir (bölüm etiketi), ama disiplini bozmamak
     * için gene de basılmaz: onun yerine satırın hangi bilinen kökleri içerdiği
     * boolean olarak raporlanır. Sözlüğe hangi girdinin eksik olduğunu bulmak için
     * bu yeterli.
     */
    private static final Map<String, String> HEADING_PROBE_TOKENS = Map.ofEntries(
            Map.entry("DENEY", "deneyim"), Map.entry("TECRUBE", "tecrübe"),
            Map.entry("EGIT", "eğitim"), Map.entry("OKUL", "okul"),
            Map.entry("UNIVERS", "üniversite"), Map.entry("LISANS", "lisans"),
            Map.entry("STAJ", "staj"), Map.entry("SERTIF", "sertifika"),
            Map.entry("YETKIN", "yetkinlik"), Map.entry("BECERI", "beceri"),
            Map.entry("YETENEK", "yetenek"), Map.entry("DIL", "dil"),
            Map.entry("HAKKIMDA", "hakkımda"), Map.entry("OZET", "özet"),
            Map.entry("PROFIL", "profil"), Map.entry("PROJE", "proje"),
            Map.entry("REFERANS", "referans"), Map.entry("ILETISIM", "iletişim"),
            Map.entry("KISISEL", "kişisel"), Map.entry("BILGI", "bilgi"),
            Map.entry("KURS", "kurs"), Map.entry("IS", "iş"));

    static String diagnoseUnknownHeadings(byte[] pdfBytes) throws IOException {
        StringBuilder out = new StringBuilder();
        try (PDDocument document = Loader.loadPDF(pdfBytes)) {
            PositionedTextStripper stripper = new PositionedTextStripper();
            int characters = 0;
            for (int page = 1; page <= document.getNumberOfPages(); page++) {
                List<TextLine> lines = stripper.extract(document, page);
                characters += lines.stream().mapToInt(l -> l.text().length()).sum();
                for (TextLine line : lines) {
                    String t = line.text().replaceAll("\\s+", " ").trim();
                    if (t.isEmpty()) continue;
                    String norm = normalizeLabel(t);
                    if (headingField(t, norm) != null) {
                        out.append(String.format("s%d BİLİNEN=%s%n", page, headingField(t, norm)));
                        continue;
                    }
                    if (!looksLikeHeading(t)) continue;
                    String ascii = norm.toUpperCase(java.util.Locale.ROOT)
                            .replace('İ', 'I').replace('Ş', 'S').replace('Ğ', 'G')
                            .replace('Ü', 'U').replace('Ö', 'O').replace('Ç', 'C')
                            .replace('I', 'I');
                    List<String> hits = HEADING_PROBE_TOKENS.entrySet().stream()
                            .filter(e -> ascii.contains(e.getKey()))
                            .map(Map.Entry::getValue).sorted().toList();
                    out.append(String.format("s%d BİLİNMEYEN uzun=%-3d kökler=%s%n",
                            page, t.length(), hits.isEmpty() ? "[hiçbiri]" : hits));
                }
            }
            out.append(String.format("toplamKarakter=%d sayfa=%d%n",
                    characters, document.getNumberOfPages()));
        }
        return out.toString();
    }

    private static String sanitize(String raw, ResumeField field) {
        if (raw == null) return null;
        String value = raw.replace('\u0000', ' ').trim();
        if (value.isEmpty()) return null;
        if (value.length() > field.maxLength()) value = value.substring(0, field.maxLength());
        return value;
    }

    /**
     * Bölüm başlığı çözümü (#204). Gerçek CV'ler etiketleri süsler:
     * "PROFESSIONAL EXPERIENCE", "EXECUTIVE PROFILE", "CERTIFICATIONS &amp; TRAINING".
     * Tam-eşitlik sözlüğü bunları kaçırdığı için bölüm hiç açılmıyor ve içerik bir
     * önceki alana yığılıyordu (canlı ölçüm: skills alanına 1822 karakterlik deneyim).
     *
     * <p>Gevşek {@code contains} da yanlış: "City and Darıca projects." satırı CITY
     * başlığı sanılır. Bu yüzden iki koşul BİRLİKTE aranır:
     * <ol>
     *   <li>satır <em>başlık şeklinde</em> olmalı (kısa + büyük-harf ağırlıklı ya da ':' ile biter)</li>
     *   <li>etiket, normalize başlıkta <em>tam kelime dizisi</em> olarak geçmeli</li>
     * </ol>
     * Uzun etiket önce denenir ("work experience" &gt; "experience").
     */
    /**
     * Türkçe başlıklar ek alır: `İŞ DENEYİMLERİ`, `EĞİTİM BİLGİLERİ`,
     * `Becerilerim`. Tam-token eşitliği bunları kaçırıyordu — ölçüm: kariyer.net
     * CV'sinde `deneyimleri` sözlükteki `deneyimi` ile eşleşmediği için EN ÖNEMLİ
     * alan (iş deneyimi) hiç çıkmıyordu.
     *
     * <p>Ek toleransı yalnız etiket 5+ karakterse açılır; kısa etiketlerde
     * ("isim", "ozet") önek eşleşmesi yanlış pozitif üretirdi.
     */
    private static boolean tokenMatches(String token, String label) {
        if (token.equals(label)) return true;
        return label.length() >= MIN_SUFFIX_TOLERANT_LABEL && token.startsWith(label);
    }

    private static ResumeField headingField(String rawLine, String normalizedHeading) {
        if (!looksLikeHeading(rawLine)) return null;
        ResumeField exact = LABELS.get(normalizedHeading);
        if (exact != null) return exact;
        if (normalizedHeading.isEmpty()) return null;
        String[] tokens = normalizedHeading.split(" ");
        if (tokens.length > MAX_HEADING_TOKENS) return null;
        for (Map.Entry<String, ResumeField> entry : LABELS_BY_LENGTH) {
            String[] label = entry.getKey().split(" ");
            if (label.length > tokens.length) continue;
            for (int i = 0; i + label.length <= tokens.length; i++) {
                boolean hit = true;
                for (int j = 0; j < label.length; j++) {
                    if (!tokenMatches(tokens[i + j], label[j])) { hit = false; break; }
                }
                if (hit) return entry.getValue();
            }
        }
        return null;
    }

    /** Kısa + büyük-harf ağırlıklı ya da iki nokta ile biten satır: başlık adayı. */
    /**
     * Başlık mı, içerik cümlesi mi?
     *
     * <p>%70 büyük-harf ölçütü KORUNDU. Gevşetmeyi denedim ve ölçüm reddetti:
     * mixed-case başlıkları kabul etmek çalışan vakayı bozdu (HSE CV 9/10 -> 5/10)
     * ve kazanılan alanlar yanlış değer taşıdı (EDUCATION="27000 Gaziantep",
     * FULL_NAME="Youtube içerik üreticisi"). Gerçek Türkçe CV'lerdeki mixed-case
     * başlık sorunu ayrı ve daha büyük bir iş: o düzenler iki kolonlu ve
     * etiket-üstte-değer-altta yapıda; kolon-farkında bölüm yönetimi gerekiyor.
     *
     * <p>Eklenen tek şey değer/tarih filtresi: cümle noktalaması, e-posta ve
     * rakam-ağırlıklı satırlar ("Eyl 2018 - Tem 2018", "05316672899") başlık
     * sayılmaz. Bu, gevşetme değil daraltmadır.
     */
    private static boolean looksLikeHeading(String rawLine) {
        String text = rawLine.strip();
        if (text.endsWith(":") || text.endsWith("：")) return true;
        text = text.replaceAll("[:：]\\s*$", "").strip();
        if (text.isEmpty() || text.length() > MAX_HEADING_CHARS) return false;
        // Cümle sonu noktalaması → içerik. Eski uppercase guard'ın asıl koruduğu
        // yanlış pozitifler bunlardı ("Managed certificates issued by … Veritas.").
        if (text.endsWith(".") || text.endsWith("!") || text.endsWith("?")) return false;
        if (text.indexOf('@') >= 0) return false;
        if (text.split("\\s+").length > MAX_HEADING_TOKENS) return false;
        int letters = 0;
        int digits = 0;
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (Character.isLetter(c)) letters++;
            else if (Character.isDigit(c)) digits++;
        }
        if (letters < MIN_HEADING_LETTERS) return false;
        if (digits > letters) return false;
        int upper = 0;
        for (int i = 0; i < text.length(); i++) {
            if (Character.isLetter(text.charAt(i)) && Character.isUpperCase(text.charAt(i))) upper++;
        }
        return (double) upper / letters >= 0.70;
    }

    /**
     * Ad-soyad sezgisi (#204): CV'lerde isim etiketli değil, ilk sayfanın en üstündeki
     * başlık satırıdır. Düşük güvenle önerilir — aday onaylar veya düzeltir.
     * Rakam, '@' ya da bilinen bölüm etiketi içeren satır aday değildir.
     *
     * <p>#213a: iki nokta içeren satır aday DEĞİLDİR. {@link #looksLikeHeading} iki
     * nokta ile biten satırı koşulsuz başlık sayar (bölüm tespiti için doğru: bir
     * form etiketi gerçekten bölüm başlatır) — ama bu, büyük-harf ölçütünü atlattığı
     * için ad-soyad sezgisine ETİKETİ aday yapıyordu. Canlı bulgu (kariyer.net CV'si,
     * sahip bildirimi 2026-07-26): FULL_NAME="Çalışmak İstediği İller :" — zorunlu
     * alan boş kalmadı, YANLIŞ doldu, ki bu daha kötüsü. İki nokta tam olarak "bu bir
     * etikettir" sinyalidir; hiçbir insan adı iki nokta taşımaz. `Etiket : değer`
     * biçimi zaten INLINE yolunda çözülür ve o yol buradan önce koşar.
     */
    private static void proposeFullNameFromHeader(
            List<TextLine> pageLines, Map<ResumeField, LocatedValue> values) {
        if (values.containsKey(ResumeField.FULL_NAME)) return;
        pageLines.stream()
                .sorted((a, b) -> Double.compare(a.y(), b.y()))
                .limit(HEADER_LINES_SCANNED)
                .filter(line -> {
                    String text = line.text().replaceAll("\\s+", " ").strip();
                    if (text.isEmpty() || text.length() > MAX_HEADING_CHARS) return false;
                    if (text.indexOf('@') >= 0 || text.matches(".*\\d.*")) return false;
                    if (text.indexOf(':') >= 0 || text.indexOf('：') >= 0) return false;
                    if (!looksLikeHeading(text)) return false;
                    String normalized = normalizeLabel(text);
                    if (normalized.isEmpty() || isProtected(normalized)) return false;
                    if (headingField(text, normalized) != null) return false;
                    int words = normalized.split(" ").length;
                    return words >= 2 && words <= 4;
                })
                .findFirst()
                .ifPresent(line -> {
                    String value = sanitize(
                            line.text().replaceAll("\\s+", " ").strip(), ResumeField.FULL_NAME);
                    if (value != null) {
                        values.put(ResumeField.FULL_NAME,
                                located(value, line, FULL_NAME_CONFIDENCE));
                    }
                });
    }

    /**
     * Korumalı alan tespiti ETİKETLERE uygulanır, içerik cümlelerine değil.
     *
     * <p>Önceki hâli "satır bu kelimeyle başlıyorsa koru" idi ve gerçek Türkçe
     * CV'de meşru iş unvanlarını siliyordu: `Sağlık Emniyet Çevre Koordinatörü …`
     * satırı "saglik " ile başladığı için sağlık verisi sanılıp bastırılıyor,
     * aktif bölüm kapanıyor ve adayın DENEYİMİ kayboluyordu (ölçüm: kariyer.net
     * CV'sinde 10 satır bastırılmış, deneyim 35 karaktere düşmüş).
     *
     * <p>Etiket kısa olur. Uzunluk/token sınırı başlık sınırlarıyla aynı tutuldu:
     * `Adres Bilgileri`, `Doğum Tarihi 01 Kasım 2000` gibi etiket/etiket+değer
     * satırları korunmaya devam eder; 7+ tokenlı unvan/cümle satırları içeriktir.
     * Bu daraltma yalnız uzunluk eksenindedir — korumalı etiket listesi aynı.
     */
    private static boolean isProtected(String normalizedLabel) {
        boolean labelShaped = normalizedLabel.length() <= MAX_HEADING_CHARS
                && normalizedLabel.split(" ").length <= MAX_HEADING_TOKENS;
        boolean listed = PROTECTED_LABELS.stream().anyMatch(label ->
                normalizedLabel.equals(label)
                        || (labelShaped
                                && label.indexOf(' ') >= 0
                                && normalizedLabel.startsWith(label + " ")));
        return listed || (labelShaped && militaryServiceStatusLine(normalizedLabel));
    }

    /**
     * Askerlik yükümlülüğü durumu sözlüğü (kapalı küme, aksansız normalize).
     *
     * <p>Türkçe'de bu durum sayılı sözcükle ifade edilir; iş unvanı sözcükleri
     * (şube, daire, başkan, komutanlık…) bu kümede YOKTUR. Ayrım bu yüzden
     * etiketin kelime sayısıyla değil DEĞERLE yapılır: {@code Askerlik: Yapıldı}
     * korumalıdır, {@code Askerlik Şube Başkanı} unvandır ve korunmaz.
     */
    private static final Set<String> MILITARY_STATUS_WORDS = Set.of(
            "yapildi", "yapilmadi", "yapilmis", "yapti", "yapmadi", "yapiyor",
            "yapacak", "tamamlandi", "tamamlanmadi", "tecil", "tecilli",
            "muaf", "muafiyet", "muaftir", "bedelli", "terhis", "yukumlu",
            "askerligini", "sevk", "ertelendi", "ertelenmis", "beklemede");

    /**
     * {@code Askerlik <durum>} biçimi: etiket tek kelime olduğu için önek
     * eşleşmesi kapalıdır (gerekçe {@link #PROTECTED_LABELS} javadoc'unda),
     * ayrım {@link #MILITARY_STATUS_WORDS} ile yapılır.
     */
    private static boolean militaryServiceStatusLine(String normalizedLabel) {
        if (!normalizedLabel.startsWith("askerlik ")) return false;
        for (String token : normalizedLabel.split(" ")) {
            if (MILITARY_STATUS_WORDS.contains(token)) return true;
        }
        return false;
    }

    private static String normalizeLabel(String value) {
        String decomposed = Normalizer.normalize(value, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "");
        return decomposed.toLowerCase(Locale.forLanguageTag("tr"))
                .replace('ı', 'i')
                .replaceAll("[^a-z0-9]+", " ")
                .trim();
    }

    private static Map<String, ResumeField> labels() {
        Map<String, ResumeField> labels = new LinkedHashMap<>();
        add(labels, ResumeField.FULL_NAME, "ad soyad", "isim", "name", "full name");
        add(labels, ResumeField.EMAIL, "e posta", "eposta", "email", "email address");
        add(labels, ResumeField.PHONE, "telefon", "telefon numarasi", "phone", "mobile");
        add(labels, ResumeField.CITY, "sehir", "ikamet sehri", "city", "location");
        add(labels, ResumeField.SUMMARY, "ozet", "profil", "hakkimda", "summary", "profile");
        add(labels, ResumeField.EXPERIENCE, "deneyim", "is deneyimi", "experience", "work experience");
        add(labels, ResumeField.EDUCATION, "egitim", "education");
        // #213a: "bilgisayar bilgileri" kariyer.net'in beceri bölümü başlığı. ÇOK
        // KELİMELİ eklendi, çünkü tek başına "bilgisayar" ek toleransıyla
        // "BİLGİSAYAR MÜHENDİSLİĞİ" satırını da yakalar ve eğitim bölümünü kapatırdı.
        add(labels, ResumeField.SKILLS, "beceriler", "yetkinlikler", "skills", "competencies",
                "bilgisayar bilgileri", "bilgisayar bilgisi");
        add(labels, ResumeField.LANGUAGES, "diller", "yabanci dil", "languages");
        // #213a: TEKİL "sertifika" eklendi. Ek toleransı yalnız tek yöne çalışır —
        // satır token'ı sözlük etiketini UZATABİLİR, kısaltamaz. CV'de "SERTİFİKA
        // BİLGİLERİ" yazıyordu; sözlükte yalnız çoğul "sertifikalar" olduğu için
        // eşleşmedi, bölüm hiç açılmadı ve sertifikalar DİLLER alanına yutuldu
        // (ölçüm: languages 645c, certifications hiç yok). Tekil eklenince ek
        // toleransı "SERTİFİKALARIM"ı da kapsar.
        add(labels, ResumeField.CERTIFICATIONS, "sertifika", "sertifikalar", "certifications",
                "certificates");
        return Map.copyOf(labels);
    }

    private static void add(
            Map<String, ResumeField> labels, ResumeField field, String... aliases) {
        for (String alias : aliases) labels.put(alias, field);
    }
}
