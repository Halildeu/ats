package com.ats.app;

import com.ats.app.operator.ModelGovernanceOperatorCli;
import java.util.function.IntSupplier;
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
        int exit = launch(
                args,
                () -> ModelGovernanceOperatorCli.run(args, System.in, System.out, System.err),
                () -> SpringApplication.run(AtsApplication.class, args));
        if (exit != 0) {
            System.exit(exit);
        }
    }

    /** Testable dispatch seam: operator selection can be proven to bypass normal Spring composition. */
    static int launch(String[] args, IntSupplier operator, Runnable spring) {
        if (ModelGovernanceOperatorCli.isOperatorCommand(args)) {
            return operator.getAsInt();
        }
        spring.run();
        return 0;
    }
}
