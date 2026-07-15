package com.ats.app;

import com.ats.dsr.DsrService;
import com.ats.dsr.DsrService.PurgeReceipt;
import com.ats.dsr.RetentionScanner;
import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import java.time.Duration;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

/**
 * Retention-purge zamanlayıcısı (ATS-0018'in "zamanlayıcı-tetikleyici composition
 * işi" kalemi) — DEFAULT KAPALI (ats.retention.enabled=true açıkça verilmeden
 * bean dahi kurulmaz). Cutoff = now - days (tenant-politikası config düzlemi);
 * aktör = system-ref (WORM/ops izlerinde görünür). Tenant'lar birbirinden
 * İZOLE: birinin hatası diğerinin purge'unu engellemez; hata YUTULMAZ (ERROR
 * log + sonraki koşuda yeniden dener — purgeExpired idempotent, slice-8c).
 */
@Configuration
@EnableScheduling
@ConditionalOnProperty(prefix = "ats.retention", name = "enabled", havingValue = "true")
class RetentionScheduler {

    private static final Logger LOG = LoggerFactory.getLogger(RetentionScheduler.class);
    static final ActorId SYSTEM_ACTOR = new ActorId("system:retention-scheduler");

    @Bean
    RetentionJob retentionJob(DsrService dsrService, RetentionScanner scanner, AppProperties props) {
        LOG.warn("Retention-purge zamanlayıcısı AÇIK: cron='{}' days={} tenants={}",
                props.retention().cron(), props.retention().days(), props.retention().tenants().size());
        return new RetentionJob(dsrService, scanner, props);
    }

    static final class RetentionJob {

        private final DsrService dsrService;
        private final RetentionScanner scanner;
        private final AppProperties props;

        RetentionJob(DsrService dsrService, RetentionScanner scanner, AppProperties props) {
            this.dsrService = dsrService;
            this.scanner = scanner;
            this.props = props;
        }

        @Scheduled(cron = "${ats.retention.cron}")
        public void runPurge() {
            String cutoffIso = Instant.now()
                    .minus(Duration.ofDays(props.retention().days())).toString();
            for (String tenant : props.retention().tenants()) {
                Outcome<PurgeReceipt> out = dsrService.purgeExpired(
                        new TenantId(tenant), SYSTEM_ACTOR, scanner, cutoffIso);
                if (out instanceof Outcome.Ok<PurgeReceipt> ok) {
                    LOG.info("retention-purge tenant={} interviews={} deleted={} object_delete_issued={}",
                            tenant, ok.value().interviewCount(), ok.value().deletedContentCount(),
                            ok.value().objectDeleteIssuedCount());
                } else if (out instanceof Outcome.Fail<PurgeReceipt> fail) {
                    // yutulmaz; tenant-izole — diğerleri devam eder, idempotent retry sonraki koşuda
                    LOG.error("retention-purge FAIL tenant={} code={} reason={}",
                            tenant, fail.code(), fail.reason());
                }
            }
        }
    }
}
