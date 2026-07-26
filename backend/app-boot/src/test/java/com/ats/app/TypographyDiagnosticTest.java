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
}
