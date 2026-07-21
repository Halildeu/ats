package com.ats.app;

import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.ingest.InMemoryObjectStore;
import com.ats.ingest.ObjectStorePort;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Gerçek Spring ConfigurationProperties binding + bean wiring kanıtı. Docker/PG gerekmez:
 * object-store seçimi yoksa veya G0 dışı vendor değeri verilirse context fail-closed kalır;
 * yalnız açık in-memory-dev beyanı geçici adapter'ı kurar.
 */
class ObjectStoreBootGuardTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withUserConfiguration(ObjectStoreBindingConfig.class)
            .withPropertyValues(
                    "ats.db.url=jdbc:postgresql://127.0.0.1:5432/test",
                    "ats.db.username=test",
                    "ats.db.password=test",
                    "ats.ai.base-url=http://127.0.0.1:9",
                    "ats.security.jwks-uri=http://127.0.0.1:9/jwks.json",
                    "ats.security.issuer=https://issuer.test",
                    "ats.security.audience=ats-api",
                    "ats.ingest.max-upload-bytes=1024",
                    "ats.retention.enabled=false");

    @Test
    void missing_mode_fails_real_spring_binding_context() {
        contextRunner.run(context -> {
            assertNotNull(context.getStartupFailure());
            assertTrue(causeMessages(context.getStartupFailure()).contains("ats.object-store.mode"));
        });
    }

    @Test
    void vendor_value_fails_real_spring_binding_context_before_wiring() {
        contextRunner.withPropertyValues("ats.object-store.mode=s3").run(context -> {
            assertNotNull(context.getStartupFailure());
            assertTrue(causeMessages(context.getStartupFailure()).contains("kapalı küme: in-memory-dev"));
        });
    }

    @Test
    void explicit_dev_opt_in_wires_only_in_memory_adapter() {
        contextRunner.withPropertyValues("ats.object-store.mode=in-memory-dev").run(context -> {
            assertNull(context.getStartupFailure());
            assertInstanceOf(InMemoryObjectStore.class, context.getBean(ObjectStorePort.class));
        });
    }

    private static String causeMessages(Throwable failure) {
        StringBuilder messages = new StringBuilder();
        for (Throwable current = failure; current != null; current = current.getCause()) {
            if (current.getMessage() != null) {
                messages.append(current.getMessage()).append('\n');
            }
        }
        return messages.toString();
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(AppProperties.class)
    static class ObjectStoreBindingConfig {

        @Bean
        ObjectStorePort objectStorePort(AppProperties props) {
            return new WiringConfig().objectStorePort(props);
        }
    }
}
