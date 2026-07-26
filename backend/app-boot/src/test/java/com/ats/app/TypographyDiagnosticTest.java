package com.ats.app;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

/**
 * #213 TEŞHİS koşumu — kural yazmadan ÖNCE ölçüm.
 *
 * <p>Gerçek bir CV'nin satırlarını üretim motoruyla (PDFBox) çıkarır ve her satır
 * için punto / kalınlık / x / büyük-harf oranını basar. Amaç, tipografi tabanlı
 * başlık tespitinin eşiğini tahminle değil ölçümle belirlemek.
 *
 * <p>PII: satır METNİ basılmaz, yalnız ŞEKİL bilgisi ve satırın bilinen bir bölüm
 * etiketiyle eşleşip eşleşmediği basılır. Gerçek CV asla commit edilmez; yol
 * ortam değişkeninden gelir ve değişken yoksa test atlanır.
 *
 * <p>Koşum: {@code ATS_DIAG_CV=/yol/cv.pdf mvn -pl backend/app-boot test
 * -Dtest=TypographyDiagnosticTest}
 */
class TypographyDiagnosticTest {

    @Test
    void dumpLineTypography() throws Exception {
        String path = System.getenv("ATS_DIAG_CV");
        if (path == null || path.isBlank()) {
            System.out.println("ATS_DIAG_CV yok — teşhis atlandı");
            return;
        }
        Path pdf = Path.of(path);
        if (!Files.isReadable(pdf)) {
            System.out.println("okunamıyor: " + path);
            return;
        }
        System.out.println(PdfBoxResumeDocumentParser.diagnose(Files.readAllBytes(pdf)));
    }

    /**
     * #218 TEŞHİS — kayıt SINIRI sinyali. Deneyim/eğitim bölümü içindeki her satır
     * için y-boşluğu, punto oranı, kalınlık, girinti ve tarih deseni basılır.
     * Amaç: "birden fazla kayıt" sınırını hangi sinyalin gerçekten ayırt ettiğini
     * ölçmek. Metin basılmaz.
     */
    @Test
    void dumpSectionRecordBoundarySignals() throws Exception {
        String path = System.getenv("ATS_DIAG_CV");
        if (path == null || path.isBlank()) {
            System.out.println("ATS_DIAG_CV yok — bölüm teşhisi atlandı");
            return;
        }
        Path pdf = Path.of(path);
        if (!Files.isReadable(pdf)) {
            System.out.println("okunamıyor: " + path);
            return;
        }
        System.out.println(PdfBoxResumeDocumentParser.diagnoseSections(Files.readAllBytes(pdf)));
    }

    /**
     * #218 TEŞHİS — gruplamanın ürettiği kayıt sayısı. Kabul sinyali: kayıt sayısı
     * bölümdeki tarih-satırı sayısıyla tutmalı. Metin basılmaz.
     */
    @Test
    void dumpRecordGrouping() throws Exception {
        String path = System.getenv("ATS_DIAG_CV");
        if (path == null || path.isBlank()) {
            System.out.println("ATS_DIAG_CV yok — gruplama teşhisi atlandı");
            return;
        }
        Path pdf = Path.of(path);
        if (!Files.isReadable(pdf)) {
            System.out.println("okunamıyor: " + path);
            return;
        }
        System.out.println(PdfBoxResumeDocumentParser.diagnoseGrouping(Files.readAllBytes(pdf)));
    }

    /**
     * #213 TEŞHİS — sözlüğe girmeyen başlık adayları. Başlık metni basılmaz; yalnız
     * uzunluk ve hangi bilinen kökleri içerdiği raporlanır.
     */
    @Test
    void dumpUnknownHeadings() throws Exception {
        String path = System.getenv("ATS_DIAG_CV");
        if (path == null || path.isBlank()) {
            System.out.println("ATS_DIAG_CV yok — başlık teşhisi atlandı");
            return;
        }
        Path pdf = Path.of(path);
        if (!Files.isReadable(pdf)) {
            System.out.println("okunamıyor: " + path);
            return;
        }
        System.out.println(
                PdfBoxResumeDocumentParser.diagnoseUnknownHeadings(Files.readAllBytes(pdf)));
    }

    /**
     * #218 TEŞHİS — ÜRETİM parse() yolundan çıkan yapısal kayıt sayısı. Teşhis
     * fonksiyonu değil gerçek akış ölçülür: teşhisin doğru olması üretimin doğru
     * olduğunu kanıtlamaz. Kayıt METNİ basılmaz, yalnız sayı ve alan doluluğu.
     */
    @Test
    void dumpProductionParseEntries() throws Exception {
        String path = System.getenv("ATS_DIAG_CV");
        if (path == null || path.isBlank()) {
            System.out.println("ATS_DIAG_CV yok — üretim yolu teşhisi atlandı");
            return;
        }
        Path pdf = Path.of(path);
        if (!Files.isReadable(pdf)) {
            System.out.println("okunamıyor: " + path);
            return;
        }
        var outcome = new PdfBoxResumeDocumentParser().parse(Files.readAllBytes(pdf), 10);
        if (!outcome.isOk()) {
            System.out.println("parse başarısız");
            return;
        }
        var result = ((com.ats.kernel.Outcome.Ok<
                com.ats.application.ResumeDocumentParser.ParseResult>) outcome).value();
        System.out.println("sürüm=" + result.parserVersion());
        for (var proposal : result.proposals()) {
            System.out.printf("alan=%-14s blobUzun=%-5d KAYIT=%d%n",
                    proposal.field(), proposal.value().length(), proposal.entries().size());
            for (var entry : proposal.entries()) {
                System.out.printf("    başlıkUzun=%-3d tarihVar=%-5s açıklamaUzun=%-4d%n",
                        entry.title().length(), !entry.dateText().isEmpty(),
                        entry.description().length());
            }
        }
    }
}
