package com.ats.app;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;

import com.ats.contracts.governance.ApprovalStatus;
import com.ats.contracts.governance.ApprovedModelRegistry;
import com.ats.contracts.governance.ApprovedModelSpec;
import com.ats.contracts.governance.Capability;
import com.ats.contracts.governance.ModelScope;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * P3-gov0 "gate-then-construct" Spring bileşim garantisi (Codex durable-fix): {@code AIProvider}
 * analog bean'i {@link AuthorizedModelBindings}'e DEPEND ettiği için, governance boot-gate
 * ({@link ModelGovernanceBoot#authorizeProvider}) patlarsa provider bean'i HİÇ kurulmaz —
 * governance dekoratif değildir. {@link ApplicationContextRunner} ile Testcontainers'sız (hafif
 * context) doğrulanır; gerçek üretim {@code authorizeProvider} fonksiyonu çağrılır (mantık kopyası YOK).
 */
class ModelGovernanceCompositionTest {

    private static final String HTTP_EP = "http-json-generic-endpoint";

    /** aiProvider analog bean'inin KAÇ kez kurulduğunu sayar (context başına). */
    static final AtomicInteger PROVIDER_CONSTRUCTIONS = new AtomicInteger();

    @BeforeEach
    void reset() {
        PROVIDER_CONSTRUCTIONS.set(0);
    }

    /** WiringConfig'teki authorizedModelBindings→aiProvider bağımlılık kenarının minimal sadık kopyası. */
    @Configuration
    static class GateThenConstructConfig {

        @Bean
        AuthorizedModelBindings authorizedModelBindings(ApprovedModelRegistry registry, GateInputs in) {
            return ModelGovernanceBoot.authorizeProvider(
                    registry, in.provider(), in.endpointRef(), in.approvals());
        }

        /** aiProvider yerine geçen prob: AuthorizedModelBindings'e depend eder (aynı ordering edge). */
        @Bean
        ProviderProbe aiProviderProbe(AuthorizedModelBindings bindings) {
            PROVIDER_CONSTRUCTIONS.incrementAndGet();
            return new ProviderProbe();
        }
    }

    record GateInputs(String provider, String endpointRef, AppProperties.Approvals approvals) {}

    static final class ProviderProbe {}

    private final ApplicationContextRunner runner =
            new ApplicationContextRunner().withUserConfiguration(GateThenConstructConfig.class);

    private static ApprovedModelSpec httpTranscribe() {
        return ApprovedModelSpec.of(Capability.TRANSCRIBE, "http-json-generic", "http-json-stt", "v1",
                Set.of(), Set.of(), HTTP_EP, "ip-http-json-1", ModelScope.GLOBAL);
    }

    private static ApprovedModelSpec httpCite() {
        return ApprovedModelSpec.of(Capability.CITE, "http-json-generic", "http-json-cite", "v1",
                Set.of(), Set.of(), HTTP_EP, "ip-http-json-1", ModelScope.GLOBAL);
    }

    /** gov1-1e-c: WORM-backed registry (verilen spec'ler APPROVED; status catalog'da değil WORM'dan). */
    private static ApprovedModelRegistry registryOf(ApprovedModelSpec... specs) {
        GovernanceWormTestFixture fx = new GovernanceWormTestFixture();
        for (ApprovedModelSpec s : specs) {
            fx.with(s, ApprovalStatus.APPROVED);
        }
        return fx.registry();
    }

    @Test
    void provider_bean_is_constructed_when_authorization_passes() {
        ApprovedModelSpec t = httpTranscribe();
        ApprovedModelSpec c = httpCite();
        runner.withBean(ApprovedModelRegistry.class, () -> registryOf(t, c))
                .withBean(GateInputs.class, () -> new GateInputs("http-json", HTTP_EP,
                        new AppProperties.Approvals(t.approvalRef().value(), c.approvalRef().value())))
                .run(ctx -> {
                    assertThat(ctx).hasNotFailed();
                    assertThat(ctx).hasSingleBean(AuthorizedModelBindings.class);
                    assertThat(ctx).hasSingleBean(ProviderProbe.class);
                    assertEquals(1, PROVIDER_CONSTRUCTIONS.get());
                });
    }

    @Test
    void provider_bean_is_NOT_constructed_when_authorization_fails() {
        // wired endpoint-ref onaylı spec'in endpointRef'iyle uyuşmuyor → authorizeProvider patlar →
        // authorizedModelBindings bean'i fırlatır → ona DEPEND eden provider prob'u HİÇ kurulmaz.
        ApprovedModelSpec t = httpTranscribe();
        ApprovedModelSpec c = httpCite();
        runner.withBean(ApprovedModelRegistry.class, () -> registryOf(t, c))
                .withBean(GateInputs.class, () -> new GateInputs("http-json", "wrong-endpoint",
                        new AppProperties.Approvals(t.approvalRef().value(), c.approvalRef().value())))
                .run(ctx -> {
                    assertThat(ctx).hasFailed();
                    assertThat(ctx.getStartupFailure()).hasMessageContaining("endpointRef uyuşmazlığı");
                    assertEquals(0, PROVIDER_CONSTRUCTIONS.get(),
                            "gate-then-construct: authorization patlarken provider bean'i KURULMAMALI");
                });
    }
}
