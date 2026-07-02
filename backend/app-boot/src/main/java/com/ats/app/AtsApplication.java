package com.ats.app;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

/**
 * ATS-0008 D-A composition entry point. Component-scan YALNIZ com.ats.app —
 * domain modülleri (com.ats.consent/ingest/orchestration/review/export/dsr)
 * framework-annotation'sız kalır; bean wiring {@link WiringConfig}'te açıktır.
 *
 * Bu dilimde REST veri-endpoint'i YOKTUR (yalnız /healthz). Authn/z kapısı,
 * İLK veri-endpoint dilimiyle BİRLİKTE gelir — kapısız veri yüzeyi açılmaz
 * (fail-closed; ATS-0007 threat-register).
 */
@SpringBootApplication
@ConfigurationPropertiesScan
public class AtsApplication {

    public static void main(String[] args) {
        SpringApplication.run(AtsApplication.class, args);
    }
}
