package com.ats.app;

import com.ats.application.ResumeDocumentParser;
import com.ats.application.ResumeImportService.ProposalDraft;
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
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.text.TextPosition;

/**
 * Self-hosted, no-egress PDF parser adapter. It extracts only the explicit candidate-field
 * allowlist; protected and unsupported labels cannot become proposals.
 */
public final class PdfBoxResumeDocumentParser implements ResumeDocumentParser {

    static final String VERSION = "pdfbox-3.0.5-rules-v2";
    private static final int MAX_EXTRACTED_CHARACTERS = 120_000;
    private static final Pattern INLINE = Pattern.compile("^\\s*([^:：]{1,48})\\s*[:：]\\s*(.+?)\\s*$");
    private static final Pattern EMAIL = Pattern.compile("[\\w.+-]+@[\\w.-]+\\.[A-Za-z]{2,}");
    private static final Pattern PHONE = Pattern.compile("(?:\\+?\\d[\\d ()-]{6,}\\d)");
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
    private static final double HEADING_UPPERCASE_RATIO = 0.70;
    private static final int HEADER_LINES_SCANNED = 5;
    private static final double FULL_NAME_CONFIDENCE = 0.60;
    /** İki kolonlu yerleşim testi: her yaka satırların en az bu oranını taşımalı. */
    private static final double MIN_COLUMN_SHARE = 0.20;
    /** Oluğu kesen satır oranı bunun üstündeyse tek kolon kabul edilir. */
    private static final double MAX_GUTTER_CROSSING_SHARE = 0.10;
    private static final Set<String> PROTECTED_LABELS = Set.of(
            "dogum tarihi", "dogum yeri", "yas", "cinsiyet", "medeni durum",
            "uyruk", "milliyet", "din", "saglik", "engellilik", "sendika",
            "tc kimlik no", "t c kimlik no", "kimlik no", "ucret beklentisi",
            "maas beklentisi", "fotograf", "referans", "referanslar",
            "adres", "tam adres", "posta kodu");

    private record TextLine(
            String text, int page, double x, double y, double width, double height) {}

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
                for (List<TextLine> column : splitIntoColumns(lines)) {
                    PageResult pageResult = parsePage(column, values);
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
                                located.width(), located.height(), located.confidence(), VERSION)));
            }
            return Outcome.ok(new ParseResult(
                    proposals, pageCount, protectedSuppressed, 0, VERSION));
        } catch (IOException | RuntimeException invalid) {
            return Outcome.fail(OutcomeCode.INVALID, "PDF güvenli biçimde okunamadı");
        }
    }

    private record PageResult(int protectedSuppressed) {}

    /**
     * İki kolonlu yerleşim ayrımı (#204). Tek kolon varsayımı, sağ kenar-çubuğu olan
     * CV'lerde bölüm sınırlarını bozar: y-sıralı akışta sağ kolon başlığı sol kolonun
     * ortasında belirir ve sonraki tüm sol-kolon içeriği yanlış alana yazılır.
     *
     * <p>Muhafazakâr test: gerçek bir olukta <em>hiçbir satır oluğu kesmez</em>. Kesme
     * oranı eşiği aşarsa (tam-genişlik başlık/altbilgi taşıyan karma yerleşim) tek kolon
     * kabul edilir — yanlış bölme, bölmemekten daha zararlıdır.
     */
    private static List<List<TextLine>> splitIntoColumns(List<TextLine> lines) {
        if (lines.size() < 8) return List.of(lines);
        double minX = lines.stream().mapToDouble(TextLine::x).min().orElse(0);
        double maxRight = lines.stream().mapToDouble(l -> l.x() + l.width()).max().orElse(0);
        if (maxRight - minX <= 0) return List.of(lines);

        int bestCrossing = Integer.MAX_VALUE;
        double bestGutter = Double.NaN;
        for (int step = 30; step <= 70; step += 2) {
            double gutter = minX + (maxRight - minX) * (step / 100.0);
            int crossing = 0;
            int left = 0;
            int right = 0;
            for (TextLine line : lines) {
                double lineRight = line.x() + line.width();
                if (line.x() < gutter - 2 && lineRight > gutter + 2) crossing++;
                else if (lineRight <= gutter) left++;
                else if (line.x() >= gutter) right++;
            }
            double share = lines.size() * MIN_COLUMN_SHARE;
            if (left >= share && right >= share && crossing < bestCrossing) {
                bestCrossing = crossing;
                bestGutter = gutter;
            }
        }
        if (Double.isNaN(bestGutter)
                || bestCrossing > Math.max(2, lines.size() * MAX_GUTTER_CROSSING_SHARE)) {
            return List.of(lines);
        }
        final double gutter = bestGutter;
        List<TextLine> leftColumn = lines.stream()
                .filter(l -> l.x() + l.width() <= gutter).toList();
        List<TextLine> rightColumn = lines.stream()
                .filter(l -> l.x() >= gutter).toList();
        if (leftColumn.isEmpty() || rightColumn.isEmpty()) return List.of(lines);
        return List.of(leftColumn, rightColumn);
    }

    private static PageResult parsePage(
            List<TextLine> lines, Map<ResumeField, LocatedValue> values) {
        ResumeField active = null;
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
                continue;
            }
            if (active != null) {
                putOrAppend(values, active, sanitize(line, active), source, 0.92);
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
            double left = Double.POSITIVE_INFINITY;
            double top = Double.POSITIVE_INFINITY;
            double right = Double.NEGATIVE_INFINITY;
            double bottom = Double.NEGATIVE_INFINITY;
            for (TextPosition position : positions) {
                double x = position.getXDirAdj();
                double y = position.getYDirAdj();
                left = Math.min(left, x);
                top = Math.min(top, y - position.getHeightDir());
                right = Math.max(right, x + position.getWidthDirAdj());
                bottom = Math.max(bottom, y);
            }
            double width = Math.max(0.1, right - left);
            double height = Math.max(0.1, bottom - top);
            lines.add(new TextLine(text, page, Math.max(0, left), Math.max(0, top), width, height));
        }
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
                    if (!tokens[i + j].equals(label[j])) { hit = false; break; }
                }
                if (hit) return entry.getValue();
            }
        }
        return null;
    }

    /** Kısa + büyük-harf ağırlıklı ya da iki nokta ile biten satır: başlık adayı. */
    private static boolean looksLikeHeading(String rawLine) {
        String text = rawLine.strip();
        if (text.endsWith(":") || text.endsWith("：")) return true;
        text = text.replaceAll("[:：]\\s*$", "").strip();
        if (text.isEmpty() || text.length() > MAX_HEADING_CHARS) return false;
        int letters = 0;
        int upper = 0;
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (!Character.isLetter(c)) continue;
            letters++;
            if (Character.isUpperCase(c)) upper++;
        }
        if (letters < MIN_HEADING_LETTERS) return false;
        return (double) upper / letters >= HEADING_UPPERCASE_RATIO;
    }

    /**
     * Ad-soyad sezgisi (#204): CV'lerde isim etiketli değil, ilk sayfanın en üstündeki
     * başlık satırıdır. Düşük güvenle önerilir — aday onaylar veya düzeltir.
     * Rakam, '@' ya da bilinen bölüm etiketi içeren satır aday değildir.
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

    private static boolean isProtected(String normalizedLabel) {
        return PROTECTED_LABELS.stream().anyMatch(label ->
                normalizedLabel.equals(label) || normalizedLabel.startsWith(label + " "));
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
        add(labels, ResumeField.SKILLS, "beceriler", "yetkinlikler", "skills", "competencies");
        add(labels, ResumeField.LANGUAGES, "diller", "yabanci dil", "languages");
        add(labels, ResumeField.CERTIFICATIONS, "sertifikalar", "certifications", "certificates");
        return Map.copyOf(labels);
    }

    private static void add(
            Map<String, ResumeField> labels, ResumeField field, String... aliases) {
        for (String alias : aliases) labels.put(alias, field);
    }
}
