package com.ats.app;

import com.ats.application.ResumeImportService;
import com.ats.kernel.Outcome;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

/**
 * Privacy-critical resume-import lifecycle worker. It is independent from the owner-configured
 * long-term retention job: provisional import TTL/purge is part of the product safety contract.
 */
@Configuration
@EnableScheduling
@ConditionalOnProperty(
        prefix = "ats.resume-import", name = "enabled", havingValue = "true", matchIfMissing = true)
class ResumeImportPurgeScheduler {

    private static final Logger LOG = LoggerFactory.getLogger(ResumeImportPurgeScheduler.class);

    @Bean
    ResumeImportPurgeJob resumeImportPurgeJob(ResumeImportService service) {
        return new ResumeImportPurgeJob(service);
    }

    static final class ResumeImportPurgeJob {
        private static final int BATCH_SIZE = 200;
        private static final int MAX_BATCHES_PER_RUN = 10;
        private final ResumeImportService service;

        ResumeImportPurgeJob(ResumeImportService service) {
            this.service = service;
        }

        @Scheduled(
                initialDelayString = "${ats.resume-import.purge-initial-delay:PT30S}",
                fixedDelayString = "${ats.resume-import.purge-interval:PT5M}")
        public void purge() {
            int total = 0;
            for (int batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
                Outcome<Integer> result = service.purgeDue(BATCH_SIZE);
                if (result instanceof Outcome.Fail<Integer> fail) {
                    LOG.error("resume-import-purge FAIL code={} reason={}",
                            fail.code(), fail.reason());
                    return;
                }
                int count = ((Outcome.Ok<Integer>) result).value();
                total += count;
                if (count < BATCH_SIZE) break;
            }
            if (total > 0) {
                LOG.info("resume-import-purge terminal-or-draft-count={}", total);
            }
        }
    }
}
