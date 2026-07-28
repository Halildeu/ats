package com.ats.app;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.application.ResumeDocumentParser.ParseResult;
import com.ats.application.ResumeImportService;
import com.ats.application.ResumeImportService.ResumeField;
import com.ats.kernel.Outcome;
import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.List;
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

    @Test
    void a_form_label_is_never_proposed_as_the_candidate_name() throws Exception {
        // Canlı bulgu (sahip bildirimi 2026-07-26, kariyer.net CV'si): zorunlu ad
        // alanina "Calismak Istedigi Iller :" dolmustu. Sebep: looksLikeHeading iki
        // nokta ile biten satiri KOSULSUZ baslik sayar (bolum tespiti icin dogru),
        // bu da buyuk-harf olcutunu atlatip ETIKETI ad adayi yapiyordu. Bos kalmasi
        // yanlis dolmasindan iyidir; dogru adi bulmak tipografi isi (#213).
        byte[] pdf = pdf(
                "Calismak Istedigi Iller :",
                "Istanbul, Kocaeli",
                "ornek.aday@example.test",
                "EXPERIENCE",
                "Ornek Teknoloji - 2022");

        Map<ResumeField, String> fields = parse(pdf);

        assertFalse(fields.containsKey(ResumeField.FULL_NAME),
                "iki nokta tasiyan satir ad adayi olmamali, geldi: "
                        + fields.get(ResumeField.FULL_NAME));
    }

    @Test
    void a_colon_free_uppercase_header_is_still_proposed_as_the_name() throws Exception {
        // Daraltmanin caliaan vakayi bozmadigini ayrica sabitler: iki nokta yasagi
        // yalnizca etiket-sekilli satiri keser, gercek ad basligini kesmez.
        byte[] pdf = pdf(
                "HAMIDE ORNEK",
                "Dogum Tarihi : 01 Ocak 1990",
                "ornek.aday@example.test",
                "EXPERIENCE",
                "Ornek Teknoloji - 2022");

        assertEquals("HAMIDE ORNEK", parse(pdf).get(ResumeField.FULL_NAME));
    }

    @Test
    void a_singular_turkish_certificate_heading_opens_its_own_section() throws Exception {
        // Ek toleransi tek yone calisir: satir token'i sozluk etiketini UZATABILIR,
        // kisaltamaz. Sozlukte yalniz cogul "sertifikalar" vardi; gercek CV
        // "SERTIFIKA BILGILERI" yaziyordu, bolum hic acilmadi ve sertifikalar
        // DILLER alanina yutuldu (olcum: languages 645c, certifications yok).
        byte[] pdf = pdf(
                "HAMIDE ORNEK",
                "ornek.aday@example.test",
                "YABANCI DIL",
                "Ingilizce Ileri",
                "SERTIFIKA BILGILERI",
                "OHSAS 18001 Lead Auditor Certificate");

        Map<ResumeField, String> fields = parse(pdf);

        assertTrue(fields.containsKey(ResumeField.CERTIFICATIONS),
                "SERTIFIKA BILGILERI -> certifications");
        assertTrue(fields.get(ResumeField.CERTIFICATIONS).contains("OHSAS 18001"));
        assertFalse(fields.getOrDefault(ResumeField.LANGUAGES, "").contains("OHSAS 18001"),
                "sertifika icerigi diller alanina sizmamali");
    }

    @Test
    void computer_skills_open_the_skills_section_but_a_degree_name_does_not() throws Exception {
        // "bilgisayar bilgileri" kariyer.net'in beceri basligi. COK KELIMELI olarak
        // eklendi: tek basina "bilgisayar" ek toleransiyla "BILGISAYAR
        // MUHENDISLIGI" satirini da yakalar ve egitim bolumunu kapatirdi. Bu test
        // tam o guvenlik iddiasini olcer, iki yonlu.
        byte[] withSkillsHeading = pdf(
                "HAMIDE ORNEK",
                "ornek.aday@example.test",
                "BILGISAYAR BILGILERI",
                "Excel, Autocad");
        assertTrue(parse(withSkillsHeading).containsKey(ResumeField.SKILLS),
                "BILGISAYAR BILGILERI -> skills");

        byte[] withDegreeName = pdf(
                "HAMIDE ORNEK",
                "ornek.aday@example.test",
                "EGITIM",
                "BILGISAYAR MUHENDISLIGI",
                "Ornek Universitesi 2020");
        Map<ResumeField, String> fields = parse(withDegreeName);
        assertFalse(fields.containsKey(ResumeField.SKILLS),
                "bolum adi beceri bolumu acmamali, acti: " + fields.get(ResumeField.SKILLS));
        assertTrue(fields.get(ResumeField.EDUCATION).contains("BILGISAYAR MUHENDISLIGI"),
                "bolum adi egitim iceriginde kalmali");
    }

    @Test
    void a_gutter_sized_gap_splits_the_line_into_two_columns() {
        // #204 kok neden, gercek CV'den olculdu: ana kolon "...COACH" 30.2'de
        // biter, yan cubuk "EDUCATION" 451.1'de baslar; aradaki 144.8pt oluk
        // glifsizdir. Bolmezsek yan cubuk basligi ana kolona yapisir.
        Glyphs line = Glyphs.of("MAIN", 30.2, 9.4).gap(144.8).then("SIDE", 9.4);

        List<int[]> ranges = PdfBoxResumeDocumentParser.columnRanges(
                line.textLength(), line.xs(), line.widths());

        assertEquals(2, ranges.size(), "oluk iki kolona bolunmeli");
        assertArrayEquals(new int[] {0, 4}, ranges.get(0));
        assertArrayEquals(new int[] {4, 8}, ranges.get(1));
    }

    @Test
    void ordinary_word_spacing_never_splits_a_line() {
        // Olcum (gercek CV, 115 satir): kelime arasi bosluklar <= 8pt, kolon
        // olugu >= 144.8pt. Esik bu iki kume arasinda; normal satir bolunmez.
        Glyphs line = Glyphs.of("WORD", 30.0, 9.4).gap(8.0).then("NEXT", 9.4);

        List<int[]> ranges = PdfBoxResumeDocumentParser.columnRanges(
                line.textLength(), line.xs(), line.widths());

        assertEquals(1, ranges.size(), "kelime araligi bolme uretmemeli");
    }

    @Test
    void a_synthetic_word_separator_disables_splitting_fail_safe() {
        // PDFBox glif olmayan yere ayirici ekleyebilir; o zaman metin uzunlugu
        // glif sayisindan buyuktur ve indeksle dilimlemek metni bozar.
        Glyphs line = Glyphs.of("MAIN", 30.2, 9.4).gap(144.8).then("SIDE", 9.4);

        List<int[]> ranges = PdfBoxResumeDocumentParser.columnRanges(
                line.textLength() + 1, line.xs(), line.widths());

        assertEquals(1, ranges.size(), "1:1 olmayan satirda bolme YAPILMAMALI");
        assertArrayEquals(new int[] {0, 8}, ranges.get(0));
    }

    /** Tek satirlik glif akisi kurar: her karakter kendi x/genisligiyle. */
    private record Glyphs(List<Double> x, List<Double> w, double cursor) {
        static Glyphs of(String text, double startX, double advance) {
            return new Glyphs(new ArrayList<>(), new ArrayList<>(), startX).then(text, advance);
        }

        Glyphs then(String text, double advance) {
            double at = cursor;
            for (int i = 0; i < text.length(); i++) {
                x.add(at);
                w.add(advance);
                at += advance;
            }
            return new Glyphs(x, w, at);
        }

        Glyphs gap(double points) {
            return new Glyphs(x, w, cursor + points);
        }

        int textLength() {
            return x.size();
        }

        double[] xs() {
            return x.stream().mapToDouble(Double::doubleValue).toArray();
        }

        double[] widths() {
            return w.stream().mapToDouble(Double::doubleValue).toArray();
        }
    }

    @Test
    void unknown_sidebar_heading_closes_the_section_but_a_job_title_does_not() throws Exception {
        // #208 olcumu (gercek CV): "baslik seklinde ama sozlukte yok" satirlarin
        // ana kolondakiler IS UNVANI (HSE MANAGER, SITE CHIEF) -> bolumu kapatmak
        // deneyimi yok eder. Yan cubuktakiler ise gercek bolum basligi
        // (AWARD, SECTOR EXPOSURE) -> kapatmazsak bir onceki alanin sonuna yapisir.
        byte[] pdf = sidebarPdf(
                new String[] {
                    "PROFESSIONAL EXPERIENCE",
                    "HSE MANAGER",
                    "Ornek Global - 2021-2023 saha guvenligi yonetimi",
                    "Denetim ve saha risk yonetimi yurutuldu.",
                    "SITE CHIEF",
                    "Ornek Insaat - 2019-2021 santiye guvenligi",
                },
                new String[] {"EDUCATION", "B.Sc. Geology", "AWARD", "Best Manager"});

        Map<ResumeField, String> fields = parse(pdf);

        assertTrue(fields.get(ResumeField.EXPERIENCE).contains("HSE MANAGER"),
                "ana kolondaki is unvani deneyimde kalmali: " + fields.get(ResumeField.EXPERIENCE));
        assertTrue(fields.get(ResumeField.EXPERIENCE).contains("Ornek Global"),
                "unvandan sonraki icerik kaybolmamali");
        assertTrue(fields.get(ResumeField.EDUCATION).contains("Geology"));
        assertFalse(fields.get(ResumeField.EDUCATION).contains("AWARD"),
                "bilinmeyen yan cubuk basligi egitime yapismamali: "
                        + fields.get(ResumeField.EDUCATION));
        assertFalse(fields.get(ResumeField.EDUCATION).contains("Best Manager"),
                "kapanan bolumden sonraki icerik de egitime gitmemeli");
    }

    @Test
    void a_wrapped_sidebar_heading_does_not_close_the_section_it_just_opened() throws Exception {
        // Olcumde certifications 467c -> EKSIK olmustu: "CERTIFICATIONS &" basligi
        // ikinci satira "TRAINING" olarak sariyor ve devam satiri bolumu hemen
        // kapatiyordu. Sarma satiri yutulur, bolum acik kalir.
        byte[] pdf = sidebarPdf(
                new String[] {
                    "PROFESSIONAL EXPERIENCE",
                    "HSE MANAGER",
                    "Ornek Global - 2021-2023 saha guvenligi yonetimi",
                    "Denetim ve saha risk yonetimi yurutuldu.",
                    "SITE CHIEF",
                },
                new String[] {"CERTIFICATIONS &", "TRAINING", "ISO 45001 Lead Auditor"});

        Map<ResumeField, String> fields = parse(pdf);

        assertTrue(fields.containsKey(ResumeField.CERTIFICATIONS),
                "sarilmis baslik bolumu kapatmamali");
        assertTrue(fields.get(ResumeField.CERTIFICATIONS).contains("ISO 45001"),
                "sertifika icerigi alinmali: " + fields.get(ResumeField.CERTIFICATIONS));
    }

    /** Sol geniş ana kolon + sağda dar yan çubuk; splitIntoColumns eşiklerini karşılar. */
    private static byte[] sidebarPdf(String[] main, String[] side) throws Exception {
        try (PDDocument document = new PDDocument(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            PDPage page = new PDPage();
            document.addPage(page);
            try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                float y = 760;
                for (String line : main) {
                    writeAt(content, 30, y, line);
                    y -= 16;
                }
                y = 760;
                for (String line : side) {
                    writeAt(content, 451, y, line);
                    y -= 16;
                }
            }
            document.save(out);
            return out.toByteArray();
        }
    }

    private static void writeAt(PDPageContentStream content, float x, float y, String text)
            throws Exception {
        content.beginText();
        content.setFont(new PDType1Font(FontName.HELVETICA), 9);
        content.newLineAtOffset(x, y);
        content.showText(text);
        content.endText();
    }

    /**
     * #218 — ölçülen kayıt-başı tipografisini taklit eden CV. Gerçek CV'lerde kayıt
     * başı satırlar KALIN ve gövdeden ~%15 büyük, bölümün sol kenarında; madde
     * satırları normal ve girintili.
     *
     * @param spec her satır {@code "x|punto|kalınMı|metin"} biçiminde
     */
    private static byte[] typedPdf(String... spec) throws Exception {
        try (PDDocument document = new PDDocument();
                ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            PDPage page = new PDPage();
            document.addPage(page);
            try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                float y = 760;
                for (String row : spec) {
                    String[] parts = row.split("\\|", 4);
                    float x = Float.parseFloat(parts[0]);
                    float size = Float.parseFloat(parts[1]);
                    boolean bold = Boolean.parseBoolean(parts[2]);
                    content.beginText();
                    content.setFont(new PDType1Font(
                            bold ? FontName.HELVETICA_BOLD : FontName.HELVETICA), size);
                    content.newLineAtOffset(x, y);
                    content.showText(parts[3]);
                    content.endText();
                    y -= 18;
                }
            }
            document.save(out);
            return out.toByteArray();
        }
    }

    private static List<ResumeImportService.ProposedEntry> entriesFor(
            byte[] pdf, ResumeField field) {
        Outcome<ParseResult> outcome = new PdfBoxResumeDocumentParser().parse(pdf, 10);
        assertTrue(outcome.isOk(), "parse basarili olmali");
        return ((Outcome.Ok<ParseResult>) outcome).value().proposals().stream()
                .filter(p -> p.field() == field)
                .findFirst()
                .map(ResumeImportService.ProposalDraft::entries)
                .orElse(List.of());
    }

    @Test
    void multiple_experiences_become_separate_entries_not_one_blob() throws Exception {
        // Sahip raporu: "birden fazla deneyim olunca tek deneyim gibi atıyor".
        // Ölçüm: gerçek CV'de kayıt başı satır KALIN + gövdeden büyük + sol kenarda;
        // madde satırı normal + girintili. Sinyal satır geometrisinde, birleştirilmiş
        // metinde yok — bu yüzden bölme ayrıştırıcıda yapılmak ZORUNDA.
        byte[] pdf = typedPdf(
                "48|10|false|EXPERIENCE",
                "48|11.5|true|Kidemli Kalite Muhendisi",
                "48|10|false|Ornek Sanayi AS 2019 - 2023",
                "57|10|false|Kalite sistemini kurdu",
                "48|11.5|true|Kalite Uzmani",
                "48|10|false|Baska Sanayi AS 2015 - 2019",
                "57|10|false|Denetimleri yuruttu");

        List<ResumeImportService.ProposedEntry> entries =
                entriesFor(pdf, ResumeField.EXPERIENCE);
        assertEquals(2, entries.size(), "iki pozisyon iki kayit olmali: " + entries);
        assertEquals("Kidemli Kalite Muhendisi", entries.get(0).title());
        assertEquals("Kalite Uzmani", entries.get(1).title());
        // Tarih satiri aciklamadan AYRILMALI: forma tarih alanina gidecek.
        // VE tarih ARALIGI satirdan cikarilmali: canli kabulde olculdu, gercek satir
        // "Ornek Sanayi AS 2019 - 2023" geliyor ve satirin tamamini dateText yapmak
        // forma "Ornek Sanayi AS 2019" yazdirdi. Ilk fixture'imi ideal hâlde
        // ("2019 - 2023") yazdigim icin kacirmisti.
        assertEquals("2019 - 2023", entries.get(0).dateText(),
                "yalniz tarih araligi alinmali: " + entries.get(0));
        // Tarih cikinca kalan metin sirket adidir; subtitle'in bos kaldigi yer burasi.
        assertEquals("Ornek Sanayi AS", entries.get(0).subtitle(),
                "tarih disi kalan metin subtitle olmali: " + entries.get(0));
        assertTrue(entries.get(0).description().contains("Kalite sistemini kurdu"));
        assertFalse(entries.get(0).description().contains("Kalite Uzmani"),
                "ikinci kaydin basligi birinci kayda sizmamali");
        assertEquals("Baska Sanayi AS", entries.get(1).subtitle());
    }

    @Test
    void multiple_educations_become_separate_entries() throws Exception {
        // Gercek CV olcumu: iki egitim kaydi 4.8pt farkli x'te basliyor (97.3 / 102.1)
        // ama madde girintisi 9.4pt. Tolerans ikisinin ARASINDA olmali, yoksa ya
        // ikinci kayit kacar ya maddeler kayit sanilir.
        byte[] pdf = typedPdf(
                "100|10|false|EDUCATION",
                "102|11.5|true|Ornek Universitesi",
                "102|10|false|Cevre Muhendisligi",
                "97|11.5|true|Ornek Lisesi",
                "97|10|false|Fen");

        List<ResumeImportService.ProposedEntry> entries = entriesFor(pdf, ResumeField.EDUCATION);
        assertEquals(2, entries.size(), "iki egitim iki kayit olmali: " + entries);
        assertEquals("Ornek Universitesi", entries.get(0).title());
        assertEquals("Ornek Lisesi", entries.get(1).title());
    }

    @Test
    void a_single_record_publishes_no_entries_so_the_blob_stays_authoritative()
            throws Exception {
        // Tek kayit icin yapisal liste yayinlamak tuketiciye yanlis bir "gruplama
        // basarili" sinyali verirdi. Bugunun tek-blob davranisi fallback KALIR.
        byte[] pdf = typedPdf(
                "48|10|false|EXPERIENCE",
                "48|11.5|true|Kidemli Kalite Muhendisi",
                "48|10|false|Ornek Sanayi AS 2019 - 2023",
                "57|10|false|Kalite sistemini kurdu");

        assertTrue(entriesFor(pdf, ResumeField.EXPERIENCE).isEmpty(),
                "tek kayitta yapisal liste bos kalmali");
    }

    @Test
    void an_all_emphasised_section_falls_back_instead_of_making_one_card_per_line()
            throws Exception {
        // Bolumun TAMAMI kalinsa sinyal ayirt etmiyor. Satir basina kart uretmek,
        // tek blob kartindan KOTU olurdu (~5 cop kart). Fallback tek blob.
        byte[] pdf = typedPdf(
                "48|10|false|EXPERIENCE",
                "48|11.5|true|Kidemli Kalite Muhendisi",
                "48|11.5|true|Ornek Sanayi AS 2019 - 2023",
                "48|11.5|true|Kalite sistemini kurdu");

        assertTrue(entriesFor(pdf, ResumeField.EXPERIENCE).isEmpty(),
                "her satir kalinsa gruplama yapilmamali");
    }

    @Test
    void a_right_column_fragment_does_not_start_a_new_record() throws Exception {
        // Gercek CV olcumu: deneyim bolumunde x=414.9'da da KALIN bir satir var
        // (sag kolon parcasi, ayni kaydin devami). Yalniz "kalin" kurali onu ikinci
        // kayit sayip tek pozisyonu ikiye bolerdi. Sol kenar sarti bu yuzden var.
        byte[] pdf = typedPdf(
                "54|10|false|EXPERIENCE",
                "415|11.5|true|Ornek Sanayi AS",
                "54|11.5|true|Kidemli Kalite Muhendisi",
                "434|10|false|Ocak 2019 - Aralik 2023",
                "54|10|false|Kalite sistemini kurdu",
                "54|11.5|true|Kalite Uzmani",
                "54|10|false|Denetimleri yuruttu");

        List<ResumeImportService.ProposedEntry> entries =
                entriesFor(pdf, ResumeField.EXPERIENCE);
        assertEquals(2, entries.size(),
                "sag kolon parcasi ucuncu kayit uretmemeli: " + entries);
        // Ilk sinirdan ONCEKI satir atilmaz, ilk kayda eklenir: veri kaybi yanlis
        // gruplamadan kotudur.
        assertTrue(entries.get(0).title().contains("Ornek Sanayi AS")
                        || entries.get(0).description().contains("Ornek Sanayi AS"),
                "ilk sinirdan onceki satir korunmali: " + entries.get(0));
    }

    @Test
    void entries_never_carry_text_from_a_page_the_citation_cannot_prove() throws Exception {
        // Blob, sayfa degisince eklemeyi REDDEDER: bir oneri tek sayfa+bbox alintisi
        // tasir. Girdi listesi ayni kurala tabi olmali. Bu filtreyi ilk yazimda
        // atlamistim ve olcum yakaladi: blob 2078 karakterken kayitlar ~4400
        // karakter tasiyordu, yani 2. sayfa icerigi 1. sayfa alintisi altinda
        // yayinlaniyordu.
        byte[] pdf = twoPageTypedPdf();
        List<ResumeImportService.ProposedEntry> entries =
                entriesFor(pdf, ResumeField.EXPERIENCE);
        String joined = entries.toString();
        assertFalse(joined.contains("IkinciSayfaKaydi"),
                "ikinci sayfa icerigi birinci sayfa alintisi altinda yayinlanmamali: " + joined);
    }

    private static byte[] twoPageTypedPdf() throws Exception {
        try (PDDocument document = new PDDocument();
                ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            String[][] pages = {
                {"48|10|false|EXPERIENCE", "48|11.5|true|BirinciKayit",
                 "48|10|false|Ornek AS 2019 - 2023", "48|11.5|true|IkinciKayit",
                 "48|10|false|Baska AS 2015 - 2019"},
                {"48|10|false|EXPERIENCE", "48|11.5|true|IkinciSayfaKaydi",
                 "48|10|false|Ucuncu AS 2010 - 2015"}};
            for (String[] spec : pages) {
                PDPage page = new PDPage();
                document.addPage(page);
                try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                    float y = 760;
                    for (String row : spec) {
                        String[] parts = row.split("\\|", 4);
                        content.beginText();
                        content.setFont(new PDType1Font(Boolean.parseBoolean(parts[2])
                                ? FontName.HELVETICA_BOLD : FontName.HELVETICA),
                                Float.parseFloat(parts[1]));
                        content.newLineAtOffset(Float.parseFloat(parts[0]), y);
                        content.showText(parts[3]);
                        content.endText();
                        y -= 18;
                    }
                }
            }
            document.save(out);
            return out.toByteArray();
        }
    }

    @Test
    void turkish_suffixed_headings_match_the_singular_label() throws Exception {
        // Gercek kariyer.net CV'si olcumu: baslik "IS DENEYIMLERI" geliyor, sozlukte
        // "deneyim" var. Tam-token esitligi "deneyimleri" != "deneyimi" dedigi icin
        // EN ONEMLI alan (deneyim) hic cikmiyordu. Ek almis bicim de eslesmeli.
        byte[] pdf = pdf(
                "IS DENEYIMLERI",
                "Kalite Guvence Uzmani - Ornek Rafineri - 2019",
                "EGITIM BILGILERI",
                "Ornek Universitesi Cevre Muhendisligi - 2006",
                "SERTIFIKALARIM",
                "ISO 45001 Lead Auditor");

        Map<ResumeField, String> fields = parse(pdf);

        assertTrue(fields.containsKey(ResumeField.EXPERIENCE),
                "IS DENEYIMLERI -> experience (cogul ek toleransi)");
        assertTrue(fields.get(ResumeField.EXPERIENCE).contains("Kalite Guvence"));
        assertTrue(fields.containsKey(ResumeField.EDUCATION), "EGITIM BILGILERI -> education");
        assertTrue(fields.containsKey(ResumeField.CERTIFICATIONS),
                "SERTIFIKALARIM -> certifications (iyelik eki)");
    }

    @Test
    void suffix_tolerance_never_fires_on_a_short_label() throws Exception {
        // Ek toleransi yalnizca 5+ karakter etiketlerde acilir; aksi halde
        // "ISIMLENDIRME" gibi satirlar isim alani basligi sanilirdi. Iddia
        // davranissal: bolum DEGISMEMELI, icerik aktif alanda kalmali.
        byte[] pdf = pdf(
                "EXPERIENCE",
                "Ornek Teknoloji - 2022",
                "ISIMLENDIRME KURALLARI",
                "Kod icinde tutarli adlandirma uygulandi");

        Map<ResumeField, String> fields = parse(pdf);

        assertTrue(fields.get(ResumeField.EXPERIENCE).contains("ISIMLENDIRME KURALLARI"),
                "onek eslesmesi acilmamali; satir icerik olarak kalmali");
        assertTrue(fields.get(ResumeField.EXPERIENCE).contains("adlandirma"),
                "sonraki icerik de ayni bolumde kalmali");
    }

    @Test
    void a_job_title_containing_saglik_is_not_suppressed_as_health_data() throws Exception {
        // Olcum (gercek kariyer.net CV'si): korumali etiket listesinde bare
        // "saglik" vardi ve onek eslesmesiyle mesru IS UNVANINI siliyordu.
        // "Saglik Emniyet Cevre Koordinatoru" bastirilinca aktif bolum kapaniyor
        // ve adayin DENEYIMI kayboluyordu (10 satir bastirilmis, deneyim 35c).
        byte[] pdf = pdf(
                "IS DENEYIMLERI",
                "Saglik Emniyet Cevre Koordinatoru",
                "Ornek Rafineri - 2019 - Devam Ediyor");

        ParseResult result = parseResult(pdf);
        Map<ResumeField, String> fields = result.proposals().stream()
                .collect(Collectors.toMap(p -> p.field(), p -> p.value()));

        assertTrue(fields.get(ResumeField.EXPERIENCE).contains("Saglik Emniyet Cevre"),
                "mesru is unvani saglik verisi sayilmamali: "
                        + fields.get(ResumeField.EXPERIENCE));
        assertTrue(fields.get(ResumeField.EXPERIENCE).contains("Ornek Rafineri"),
                "unvandan sonraki satir da ayni bolumde kalmali");
        assertEquals(0, result.protectedSuppressed(), "bu belgede korumali etiket yok");
    }

    @Test
    void real_protected_labels_stay_suppressed() throws Exception {
        // Yukaridaki daraltma yalnizca kesinlik icindir; gercek korumali
        // etiketler ve etiket+deger satirlari bastirilmaya devam eder.
        byte[] pdf = pdf(
                "EXPERIENCE",
                "Ornek Teknoloji - 2022",
                "Saglik Durumu",
                "Kronik rahatsizlik yok",
                "Dogum Tarihi 01 Kasim 2000",
                "Adres Bilgileri",
                "Ornek mahalle Ornek sokak");

        ParseResult result = parseResult(pdf);
        Map<ResumeField, String> fields = result.proposals().stream()
                .collect(Collectors.toMap(p -> p.field(), p -> p.value()));

        String all = String.join(" || ", fields.values());
        assertFalse(all.contains("Kronik"), "saglik durumu degeri hicbir alana gitmemeli: " + all);
        assertFalse(all.contains("01 Kasim 2000"), "dogum tarihi sizmamali: " + all);
        assertFalse(all.contains("Ornek mahalle"), "adres sizmamali: " + all);
        assertTrue(result.protectedSuppressed() >= 3,
                "uc korumali etiket de sayilmali: " + result.protectedSuppressed());
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

    @Test
    void the_parsing_path_itself_emits_normalized_month_dates() throws Exception {
        // BAĞLANTI testi. Birim testi (normalizeMonthYear) yeşil kalırken
        // splitDateLine onu ÇAĞIRMAYI bırakabilir — mutasyonla ölçtüm: bağlantıyı
        // kestiğimde 27 test yeşil kaldı. Birimi test etmek yolu test etmek değil.
        // Geometri ÇALIŞAN fixture'dan birebir alındı (iki kayıt): tek kayıtlı
        // kendi fixture'ım bölme eşiğini tetiklemedi ve 0 kayıt döndü.
        byte[] pdf = typedPdf(
                "48|10|false|EXPERIENCE",
                "48|11.5|true|Kidemli Urun Uzmani",
                "48|10|false|Ornek Teknoloji Eyl 2022 - Mar 2024",
                "57|10|false|Urun yolculugunu kurdu",
                "48|11.5|true|Urun Uzmani",
                "48|10|false|Baska Teknoloji Ocak 2019 - Agustos 2022",
                "57|10|false|Yol haritasini yurutt");

        List<ResumeImportService.ProposedEntry> entries =
                entriesFor(pdf, ResumeField.EXPERIENCE);
        assertEquals(2, entries.size(), "iki kayit olmali: " + entries);
        assertEquals("2022-09 - 2024-03", entries.get(0).dateText(),
                "ay bilgisi forma NORMALIZE gitmeli: " + entries.get(0));
        assertEquals("Ornek Teknoloji", entries.get(0).subtitle());
        // Aksansız Türkçe ay adları da yolun sonuna normalize ulaşmalı.
        assertEquals("2019-01 - 2022-08", entries.get(1).dateText(),
                "aksansiz ay adlari da normalize olmali: " + entries.get(1));
    }

    // ---- #242 dilim A: ay+yıl normalizasyonu --------------------------------

    @Test
    void normalizes_turkish_and_english_month_names_to_one_shape() {
        // Ayrıştırıcı bugüne kadar YALNIZ yıl tanıyordu; "Eyl 2022" satırından
        // sadece "2022" çıkıyor, AY SESSİZCE ATILIYORDU. Toplu hesap ay
        // hassasiyeti istediği için bu kayıp ürün gereksinimini bozuyordu.
        assertEquals("2022-09", PdfBoxResumeDocumentParser.normalizeMonthYear("Eylül 2022"));
        assertEquals("2022-09", PdfBoxResumeDocumentParser.normalizeMonthYear("Eyl 2022"));
        // PDF çıkarımı Türkçe aksanı sık düşürür.
        assertEquals("2022-09", PdfBoxResumeDocumentParser.normalizeMonthYear("Eylul 2022"));
        assertEquals("2022-02", PdfBoxResumeDocumentParser.normalizeMonthYear("subat 2022"));
        assertEquals("2022-09", PdfBoxResumeDocumentParser.normalizeMonthYear("September 2022"));
        assertEquals("2022-09", PdfBoxResumeDocumentParser.normalizeMonthYear("09/2022"));
        assertEquals("2022-09", PdfBoxResumeDocumentParser.normalizeMonthYear("9.2022"));
        // Zaten normalize olan değişmez (idempotent).
        assertEquals("2022-09", PdfBoxResumeDocumentParser.normalizeMonthYear("2022-09"));
    }

    @Test
    void leaves_text_untouched_when_no_month_can_be_proven() {
        // Ay uydurmak eksik aydan KÖTÜDÜR: yanlışlığı görünmez olur.
        assertEquals("2019", PdfBoxResumeDocumentParser.normalizeMonthYear("2019"));
        assertEquals("2019 - 2021", PdfBoxResumeDocumentParser.normalizeMonthYear("2019 - 2021"));
        assertEquals("Ornek Teknoloji 2019",
                PdfBoxResumeDocumentParser.normalizeMonthYear("Ornek Teknoloji 2019"));
        assertEquals("", PdfBoxResumeDocumentParser.normalizeMonthYear(""));
        assertEquals(null, PdfBoxResumeDocumentParser.normalizeMonthYear(null));
    }

    @Test
    void normalizes_both_ends_of_a_range_and_keeps_open_ended_wording() {
        assertEquals("2022-09 - 2024-03",
                PdfBoxResumeDocumentParser.normalizeMonthYear("Eyl 2022 - Mar 2024"));
        assertEquals("2022-09 - Halen",
                PdfBoxResumeDocumentParser.normalizeMonthYear("Eylül 2022 - Halen"));
    }
}
