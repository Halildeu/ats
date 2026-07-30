package com.ats.app;

import static org.assertj.core.api.Assertions.assertThat;

import com.ats.contracts.governance.ApprovedModelRegistry;
import com.ats.governance.FileBackedApprovedModelRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * P3-gov0 fail-closed KANIT (Codex REVISE): application.yaml artık GÜVEN girdilerini
 * ({@code ats.ai.endpoint-ref} + {@code ats.ai.approvals.{transcribe,cite}-ref}) DEFAULT'lamaz.
 * Bir deployment YALNIZ {@code base-url} verip bu girdileri beyan etmeden aktif provider'ı
 * (http-json) boot EDEMEZ — {@link ModelGovernanceBoot} gate patlar → composition kalkamaz.
 * Böylece bundled http-json-generic onayı SESSİZCE seçilmez (keyfi base-url generic-onaylı geçmez).
 *
 * <p>SHIPPED registry (FileBacked, gerçek {@code approved-models.json}) + gerçek {@code
 * authorizeProvider} kullanılır (mantık kopyası yok). {@code AppProperties.Ai} kompakt-kurucusu
 * boş env'i (yaml default'u kaldırıldı) blank→null normalize eder — kanıtlanan tam da "beyan
 * yoksa boot yok". Testcontainers gerekmez ({@link ApplicationContextRunner}).
 */
class GovernanceDefaultsFailClosedTest {

    private static final String RESOURCE = "model-governance/approved-models.json";
    private static final String BASE_URL = "http://127.0.0.1:9";

    // gov1-1e-c: registry WORM-backed. SHIPPED kimlikler in-memory WORM'da APPROVED seed'lenir
    // (test-fixture-seed); "beyan yoksa boot yok" fail'leri resolve'dan ÖNCE (endpoint/ref eksikliği)
    // olduğundan bu seed pozitif-boot yolunu WORM-status'le tutarlı kılar.
    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withUserConfiguration(GateConfig.class)
            .withBean(ApprovedModelRegistry.class, () ->
                    FileBackedApprovedModelRegistry.fromClasspath(RESOURCE, AiGovernanceTestSupport.shippedApprovedLedger()));

    /** WiringConfig.authorizedModelBindings kenarının minimal sadık kopyası (aynı üretim fonksiyonu). */
    @Configuration
    static class GateConfig {
        @Bean
        AuthorizedModelBindings authorizedModelBindings(ApprovedModelRegistry registry, AppProperties.Ai ai) {
            return ModelGovernanceBoot.authorizeProvider(
                    registry, ai.provider(), ai.endpointRef(), ai.approvals());
        }
    }

    /**
     * application.yaml'ın boş default'ları → env blank → {@link AppProperties.Ai} kompakt-kurucu
     * normalize eder (endpoint-ref blank→null, approvals blank→null). Böylece "yaml default kaldırıldı"
     * durumunu SADIK kurar (agent'ın elle null geçmesi değil, gerçek normalizasyon yolu).
     */
    private static AppProperties.Ai ai(String endpointRef, String transcribeRef, String citeRef) {
        return new AppProperties.Ai(true, "http-json", BASE_URL, null, null, null, null, null,
                endpointRef, new AppProperties.Approvals(transcribeRef, citeRef));
    }

    @Test
    void only_base_url_without_any_governance_input_fails_context() {
        // endpoint-ref + iki approval-ref de BOŞ (yaml default'u kaldırıldı) → gate endpoint-ref'te patlar.
        runner.withBean(AppProperties.Ai.class, () -> ai("", "", ""))
                .run(ctx -> {
                    assertThat(ctx).hasFailed();
                    assertThat(ctx.getStartupFailure()).hasMessageContaining("endpoint-ref zorunlu");
                });
    }

    @Test
    void base_url_and_endpoint_ref_but_missing_transcribe_ref_fails_context() {
        // endpoint-ref + cite-ref GERÇEK (drift-safe türetilmiş) ama transcribe-ref YOK → gate TRANSCRIBE'de patlar.
        AiGovernanceTestSupport.HttpJsonGovernance g = AiGovernanceTestSupport.httpJson();
        runner.withBean(AppProperties.Ai.class, () -> ai(g.endpointRef(), "", g.citeRef()))
                .run(ctx -> {
                    assertThat(ctx).hasFailed();
                    assertThat(ctx.getStartupFailure())
                            .hasMessageContaining("TRANSCRIBE")
                            .hasMessageContaining("zorunlu");
                });
    }

    @Test
    void all_three_governance_inputs_present_boots() {
        // Pozitif kontrol: 3 girdi de beyan edilince gate GEÇER → context kalkar (shipped kayıt boot-profil
        // ile tutarlı: configuredProviderRef=http-json-generic, endpointRef, invocationProfileVersion eşleşir).
        AiGovernanceTestSupport.HttpJsonGovernance g = AiGovernanceTestSupport.httpJson();
        runner.withBean(AppProperties.Ai.class, () -> ai(g.endpointRef(), g.transcribeRef(), g.citeRef()))
                .run(ctx -> {
                    assertThat(ctx).hasNotFailed();
                    assertThat(ctx).hasSingleBean(AuthorizedModelBindings.class);
                });
    }
}
