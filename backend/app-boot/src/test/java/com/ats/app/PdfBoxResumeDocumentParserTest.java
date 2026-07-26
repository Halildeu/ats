package com.ats.app;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.application.ResumeDocumentParser.ParseResult;
import com.ats.application.ResumeImportService.ResumeField;
import com.ats.kernel.Outcome;
import java.io.ByteArrayOutputStream;
import java.util.Map;
import java.util.stream.Collectors;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts.FontName;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.junit.jupiter.api.Test;

class PdfBoxResumeDocumentParserTest {

    private final PdfBoxResumeDocumentParser parser = new PdfBoxResumeDocumentParser();

    @Test
    void decorated_section_headings_are_recognized_without_swallowing_content() throws Exception {
        // #204 canlı vakası: gerçek CV'ler etiketleri süsler. Tam-eşitlik sözlüğü
        // bunları kaçırınca bölüm hiç açılmıyor ve içerik bir önceki alana yığılıyordu
        // (ölçüm: skills alanına 1822 karakterlik deneyim metni).
        byte[] pdf = pdf(
                "HAMIDE ORNEK",
                "ornek.aday@example.test",
                "EXECUTIVE PROFILE",
                "Kurumsal HSE yoneticisi ve donusum kocu.",
                "PROFESSIONAL EXPERIENCE",
                "CORPORATE HEAD OF HSE - Ornek Global - 2021-2023",
                "EXECUTIVE COMPETENCIES",
                "Risk yonetimi, denetim, saha guvenligi",
                "CERTIFICATIONS & TRAINING",
                "Bureau Veritas ISO 45001 Lead Auditor");

        Map<ResumeField, String> fields = parse(pdf);

        assertTrue(fields.containsKey(ResumeField.SUMMARY), "EXECUTIVE PROFILE -> summary");
        assertTrue(fields.containsKey(ResumeField.EXPERIENCE), "PROFESSIONAL EXPERIENCE -> experience");
        assertTrue(fields.containsKey(ResumeField.SKILLS), "EXECUTIVE COMPETENCIES -> skills");
        assertTrue(fields.containsKey(ResumeField.CERTIFICATIONS), "CERTIFICATIONS & TRAINING -> certifications");
        // Asıl regresyon: deneyim metni beceriler alanına sızmamalı.
        assertFalse(fields.get(ResumeField.SKILLS).contains("CORPORATE HEAD OF HSE"),
                "deneyim icerigi skills alanina sizmamali");
        assertTrue(fields.get(ResumeField.EXPERIENCE).contains("CORPORATE HEAD OF HSE"));
    }

    @Test
    void sentence_containing_a_label_word_is_not_treated_as_a_heading() throws Exception {
        // Gevşek contains eşleşmesi bu satırı CITY başlığı sanıyordu; başlık-şekli
        // guard'ı (kısa + buyuk-harf agirlikli) yanlış pozitifi keser.
        byte[] pdf = pdf(
                "EXPERIENCE",
                "Delivered City and Darica projects on schedule.",
                "Managed certificates issued by Bureau Veritas.");

        Map<ResumeField, String> fields = parse(pdf);

        assertFalse(fields.containsKey(ResumeField.CITY), "cumle CITY basligi sayilmamali");
        assertTrue(fields.get(ResumeField.EXPERIENCE).contains("City and Darica"),
                "cumle aktif bolumun icerigi olarak kalmali");
        assertTrue(fields.get(ResumeField.EXPERIENCE).contains("certificates"),
                "certificates gecen cumle de bolum degistirmemeli");
    }

    @Test
    void unlabelled_header_name_is_proposed_with_low_confidence() throws Exception {
        // CV'lerde isim "Ad Soyad:" etiketiyle gelmez; ilk sayfanin ust basligidir.
        byte[] pdf = pdf(
                "HAMIDE ORNEK",
                "ornek.aday@example.test",
                "EXPERIENCE",
                "Ornek Teknoloji - 2022");

        ParseResult result = parseResult(pdf);
        Map<ResumeField, String> fields = result.proposals().stream()
                .collect(Collectors.toMap(p -> p.field(), p -> p.value()));

        assertEquals("HAMIDE ORNEK", fields.get(ResumeField.FULL_NAME));
        double confidence = result.proposals().stream()
                .filter(p -> p.field() == ResumeField.FULL_NAME)
                .mapToDouble(p -> p.provenance().confidence())
                .findFirst().orElseThrow();
        assertTrue(confidence < 0.90, "sezgisel isim onerisi dusuk guvenle gelmeli: " + confidence);
    }

    private Map<ResumeField, String> parse(byte[] pdf) {
        return parseResult(pdf).proposals().stream()
                .collect(Collectors.toMap(p -> p.field(), p -> p.value()));
    }

    private ParseResult parseResult(byte[] pdf) {
        return ((Outcome.Ok<ParseResult>) assertInstanceOf(
                Outcome.Ok.class, parser.parse(pdf, 20))).value();
    }

    @Test
    void extracts_only_allowlisted_fields_with_page_provenance_and_suppresses_protected() throws Exception {
        byte[] pdf = pdf(
                "Ad Soyad: Deniz Yilmaz",
                "E-posta: deniz.yilmaz@example.test",
                "Telefon: +90 555 000 00 00",
                "Sehir: Istanbul",
                "Dogum Tarihi: 1990-01-01",
                "TC Kimlik No: 12345678901",
                "LinkedIn: https://linkedin.example.test/deniz",
                "Deneyim:",
                "Urun Uzmani - Ornek Teknoloji - 2022-2026",
                "Egitim:",
                "Ornek Universitesi - 2020",
                "Beceriler: urun kesfi, analitik, erisilebilirlik");

        Outcome<ParseResult> outcome = parser.parse(pdf, 20);
        ParseResult result = ((Outcome.Ok<ParseResult>) assertInstanceOf(
                Outcome.Ok.class, outcome)).value();
        Map<ResumeField, String> fields = result.proposals().stream().collect(
                Collectors.toMap(p -> p.field(), p -> p.value()));

        assertEquals("deniz.yilmaz@example.test", fields.get(ResumeField.EMAIL));
        assertTrue(fields.get(ResumeField.EXPERIENCE).contains("Ornek Teknoloji"));
        assertTrue(fields.get(ResumeField.EDUCATION).contains("Ornek Universitesi"));
        assertFalse(fields.values().stream().anyMatch(v -> v.contains("12345678901")));
        assertFalse(fields.values().stream().anyMatch(v -> v.contains("linkedin")));
        assertEquals(2, result.protectedSuppressed());
        assertEquals(0, result.unsupportedOutput());
        assertTrue(result.proposals().stream().allMatch(p ->
                p.provenance().page() == 1
                        && p.provenance().width() > 0
                        && p.provenance().height() > 0
                        && p.provenance().x() >= 40
                        && p.provenance().width() < 500
                        && p.provenance().height() < 200
                        && p.provenance().parserVersion().equals(PdfBoxResumeDocumentParser.VERSION)));
    }

    @Test
    void corrupt_and_page_limit_fail_closed() throws Exception {
        assertInstanceOf(Outcome.Fail.class, parser.parse("%PDF-corrupt".getBytes(), 20));
        assertInstanceOf(Outcome.Fail.class, parser.parse(twoPagePdf(), 1));
    }

    private static byte[] pdf(String... lines) throws Exception {
        try (PDDocument document = new PDDocument(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            PDPage page = new PDPage();
            document.addPage(page);
            try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                content.beginText();
                content.setFont(new PDType1Font(FontName.HELVETICA), 10);
                content.setLeading(14);
                content.newLineAtOffset(48, 760);
                for (String line : lines) {
                    content.showText(line);
                    content.newLine();
                }
                content.endText();
            }
            document.save(out);
            return out.toByteArray();
        }
    }

    private static byte[] twoPagePdf() throws Exception {
        try (PDDocument document = new PDDocument(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            document.addPage(new PDPage());
            document.addPage(new PDPage());
            document.save(out);
            return out.toByteArray();
        }
    }
}
