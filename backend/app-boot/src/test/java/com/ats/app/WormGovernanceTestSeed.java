package com.ats.app;

import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.springframework.beans.BeansException;
import org.springframework.beans.factory.BeanFactory;
import org.springframework.beans.factory.BeanFactoryAware;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;

/**
 * gov1-1e-c full-context {@code @SpringBootTest} WORM-seed (TEST-FIXTURE-seed; production-boot-seed DEĞİL).
 *
 * <p>Cutover sonrası boot-gate ({@code AuthorizedModelBindings}) status'u WORM'dan çözer. Flyway migrate
 * → boş {@code model_governance_ledger} → boot-gate DENY → context FAIL olurdu. Bu {@link BeanPostProcessor}
 * Flyway bean'i BAŞLATILDIKTAN (migrate edildikten) hemen sonra — {@code ModelGovernanceLedger.Reader} /
 * {@code ApprovedModelRegistry} / boot-gate bean'leri kurulmadan ÖNCE — SHIPPED kimlikleri
 * ({@code approved-models.json}) writer-DataSource ile {@code UNINITIALIZED→APPROVED} seed'ler. Ordering
 * Spring bean-lifecycle'ıyla garanti edilir (kırılgan JUnit callback sırasına bağlı DEĞİL): bir bean tüm
 * post-processing'i tamamlanmadan dependent'ine enjekte edilmez, ve reader/registry/boot-gate Flyway'e
 * (dolaylı) depend eder.
 *
 * <p><b>Normal production boot bunu KULLANMAZ</b> — WORM'a ilk {@code UNINITIALIZED→APPROVED} transition'ı
 * owner-gated ayrı CLI/workflow'da ({@code ModelGovernanceAdminAppender} + writer-rol) yazılır (ADR-0021);
 * bu yalnız Testcontainers superuser DataSource ile test-fixture'dır. Kullanan test {@code @Import} eder.
 */
@TestConfiguration
class WormGovernanceTestSeed {

    @Bean
    static GovernanceWormSeeder governanceWormSeeder() {
        return new GovernanceWormSeeder();
    }

    /**
     * Flyway init'inden sonra tek seferlik seed eden BeanPostProcessor. {@link BeanFactoryAware} ile
     * DataSource'u tembel çözer (Flyway DataSource'a depend ettiğinden bu noktada DataSource tam kuruludur).
     */
    static final class GovernanceWormSeeder implements BeanPostProcessor, BeanFactoryAware {

        private BeanFactory beanFactory;

        @Override
        public void setBeanFactory(BeanFactory beanFactory) throws BeansException {
            this.beanFactory = beanFactory;
        }

        @Override
        public Object postProcessAfterInitialization(Object bean, String beanName) {
            if (bean instanceof Flyway) {
                AiGovernanceTestSupport.seedShippedApprovalsToWorm(beanFactory.getBean(DataSource.class));
            }
            return bean;
        }
    }
}
