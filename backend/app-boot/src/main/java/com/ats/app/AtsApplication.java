package com.ats.app;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

/**
 * ATS-0008 D-A composition entry point. Component-scan YALNIZ com.ats.app —
 * domain modülleri (com.ats.consent/ingest/orchestration/review/export/dsr)
 * framework-annotation'sız kalır; bean wiring {@link WiringConfig}'te açıktır.
 *
 * Veri-endpoint'leri {@link com.ats.app.web} altındadır. Recruiter/interview
 * yüzeyleri JWT + tenant-claim ile kapalıdır. Yalnız yayınlanmış ilan, adayın
 * kendi başvuru yazımı ve opak token ile minimal durum okuması explicit public
 * matcher'dır; bunlar body-limit/idempotency/token-digest kapılarıyla korunur.
 */
@SpringBootApplication
@ConfigurationPropertiesScan
public class AtsApplication {

    public static void main(String[] args) {
        SpringApplication.run(AtsApplication.class, args);
    }
}
