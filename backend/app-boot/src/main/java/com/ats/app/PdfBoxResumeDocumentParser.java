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

    static final String VERSION = "pdfbox-3.0.5-rules-v1";
    private static final int MAX_EXTRACTED_CHARACTERS = 120_000;
    private static final Pattern INLINE = Pattern.compile("^\\s*([^:：]{1,48})\\s*[:：]\\s*(.+?)\\s*$");
    private static final Pattern EMAIL = Pattern.compile("[\\w.+-]+@[\\w.-]+\\.[A-Za-z]{2,}");
    private static final Pattern PHONE = Pattern.compile("(?:\\+?\\d[\\d ()-]{6,}\\d)");
    private static final Map<String, ResumeField> LABELS = labels();
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
                PageResult pageResult = parsePage(lines, values);
                protectedSuppressed += pageResult.protectedSuppressed();
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
            ResumeField section = LABELS.get(heading);
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
