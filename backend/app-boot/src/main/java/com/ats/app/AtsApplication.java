package com.ats.app;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

/**
 * ATS-0008 D-A composition entry point. Component-scan YALNIZ com.ats.app —
 * domain modülleri (com.ats.consent/ingest/orchestration/review/export/dsr)
 * framework-annotation'sız kalır; bean wiring {@link WiringConfig}'te açıktır.
 *
 * Veri-endpoint'leri {@link com.ats.app.web} altında ve TÜMÜ authn/z kapısının
 * arkasındadır ({@link SecurityConfig}: JWT + tenant-claim zorunlu; /healthz
 * hariç kapısız yüzey yok — slice-9 "kapısız veri yüzeyi açılmaz" taahhüdü
 * slice-10'da böyle tutuldu; ATS-0007 threat-register).
 */
@SpringBootApplication
@ConfigurationPropertiesScan
public class AtsApplication {

    public static void main(String[] args) {
        SpringApplication.run(AtsApplication.class, args);
    }
}
