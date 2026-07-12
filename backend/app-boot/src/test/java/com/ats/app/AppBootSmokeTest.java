package com.ats.app;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.consent.ConsentGate;
import com.ats.contracts.EvidenceLedger;
import com.ats.dsr.DsrService;
import com.ats.dsr.RetentionScanner;
import com.ats.export.ExportService;
import com.ats.ingest.IngestService;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.orchestration.CitationService;
import com.ats.orchestration.TranscriptionService;
import com.ats.review.HumanReviewService;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.context.ApplicationContext;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Boot-smoke: composition GERÇEK PG16 üstünde ayağa kalkar — Flyway V1..V3
 * migrate olur, /healthz gerçek DB ping'iyle 200 döner, tüm servis bean'leri
 * kurulur, consent-gate deny-by-default PG üstünde canlıdır.
 *
 * İDDİA SINIRI: bu test "deployable composition çalışıyor" kanıtıdır; AI ucu
 * canlılığı iddia edilmez (base-url stub; çağrı yolu slice-7 testlerinde).
 */
@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AppBootSmokeTest {

    @Container
    private static final PostgreSQLContainer<?> PG = new PostgreSQLContainer<>("postgres:16-alpine");

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) {
        registry.add("ats.db.url", PG::getJdbcUrl);
        registry.add("ats.db.username", PG::getUsername);
        registry.add("ats.db.password", PG::getPassword);
        // stub uç: boot canlılık iddia etmez; çağrı anında fail-closed (slice-7).
        registry.add("ats.ai.base-url", () -> "http://127.0.0.1:9");
        // security konfig'i fail-closed zorunlu (slice-10) — smoke, JWKS'i ÇEKMEZ
        // (decoder lazy); token'lı akışlar RestApiSecurityTest'te gerçek imzayla.
        registry.add("ats.security.jwks-uri", () -> "http://127.0.0.1:9/jwks.json");
        registry.add("ats.security.issuer", () -> "https://issuer.test");
        registry.add("ats.security.audience", () -> "ats-api");
        // P3-gov0 (Codex REVISE): yaml default'u kaldırılan 3 güven girdisi — shipped kayıttan türet (drift-safe).
        AiGovernanceTestSupport.registerHttpJson(registry);
    }

    @Autowired private ApplicationContext ctx;
    @Autowired private DataSource dataSource;
    @Autowired private TestRestTemplate rest;

    @Test
    void flyway_migrated_all_versions_on_startup() throws Exception {
        try (Connection c = dataSource.getConnection(); Statement st = c.createStatement();
                ResultSet rs = st.executeQuery(
                        "SELECT count(*) FROM flyway_schema_history WHERE success AND version IS NOT NULL")) {
            assertTrue(rs.next());
            assertTrue(rs.getInt(1) >= 3, "V1..V3 migrate edilmiş olmalı; bulunan: " + rs.getInt(1));
        }
    }

    @Test
    void healthz_returns_ok_with_real_db_ping() {
        ResponseEntity<String> resp = rest.getForEntity("/healthz", String.class);
        assertEquals(200, resp.getStatusCode().value());
        assertNotNull(resp.getBody());
        assertTrue(resp.getBody().contains("\"status\":\"ok\""), "body: " + resp.getBody());
        assertTrue(resp.getBody().contains("\"db\":\"ok\""), "body: " + resp.getBody());
    }

    @Test
    void all_domain_services_are_wired() {
        assertNotNull(ctx.getBean(IngestService.class));
        assertNotNull(ctx.getBean(TranscriptionService.class));
        assertNotNull(ctx.getBean(CitationService.class));
        assertNotNull(ctx.getBean(HumanReviewService.class));
        assertNotNull(ctx.getBean(ExportService.class));
        assertNotNull(ctx.getBean(DsrService.class));
        assertNotNull(ctx.getBean(EvidenceLedger.class));
        assertNotNull(ctx.getBean(RetentionScanner.class));
    }

    @Test
    void openapi_metadata_is_public_and_describes_api() {
        org.springframework.http.ResponseEntity<String> resp =
                rest.getForEntity("/v3/api-docs", String.class);
        assertEquals(200, resp.getStatusCode().value());
        assertTrue(resp.getBody().contains("/api/v1/interviews/{interviewId}/transcript"),
                "spec veri-endpoint'lerini tarif etmeli; body: kırpıldı");
    }

    @Test
    void retention_scheduler_is_absent_by_default() {
        assertTrue(ctx.getBeansOfType(RetentionScheduler.RetentionJob.class).isEmpty(),
                "default-off: enabled=true verilmeden scheduler bean'i KURULMAZ");
    }

    @Test
    void consent_gate_is_deny_by_default_on_real_pg() {
        ConsentGate gate = ctx.getBean(ConsentGate.class);
        Outcome<Void> out = gate.requireRecordingAllowed(
                new TenantId("boot-smoke-tenant"), new InterviewId("boot-smoke-iv"));
        assertInstanceOf(Outcome.Fail.class, out,
                "rıza kaydı olmadan kayıt izni VERİLEMEZ (deny-by-default)");
    }
}
