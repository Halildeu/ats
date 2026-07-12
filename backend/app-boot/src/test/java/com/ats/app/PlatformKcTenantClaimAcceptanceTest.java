package com.ats.app;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;
import java.util.Map;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * slice-39b (ATS-0019): platform-KC JWT acceptance — BOOT'lu uçtan uca (Codex
 * blocker: configurable tenant-claim yalnız authority-derivation'da değil, runtime
 * tenant-extraction'da (TenantAccess) da geçerli olmalı — biri authority verip
 * diğeri tenant'ı bulamama YAPISAL imkânsız). Bu test config `tenant_id` iken
 * platform-KC-style token'ın (yalnız `tenant_id`, `tenant` claim YOK) gerçekten
 * kabul edilip WORM'a doğru tenant'ı yazdığını ve config-uyumsuzluğunun 403
 * (500/kırılma DEĞİL, fallback YOK) olduğunu kanıtlar.
 */
@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class PlatformKcTenantClaimAcceptanceTest {

    @Container
    private static final PostgreSQLContainer<?> PG = new PostgreSQLContainer<>("postgres:16-alpine");

    private static final JwtTestSupport JWT = new JwtTestSupport();

    @AfterAll
    static void stopJwks() {
        JWT.stop();
    }

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) {
        registry.add("ats.db.url", PG::getJdbcUrl);
        registry.add("ats.db.username", PG::getUsername);
        registry.add("ats.db.password", PG::getPassword);
        registry.add("ats.ai.base-url", () -> "http://127.0.0.1:9");
        registry.add("ats.security.jwks-uri", JWT::jwksUri);
        registry.add("ats.security.issuer", () -> JwtTestSupport.ISSUER);
        registry.add("ats.security.audience", () -> JwtTestSupport.AUDIENCE);
        // ATS-0019: platform-KC token'ında tenant claim adı "tenant_id"
        registry.add("ats.security.tenant-claim-name", () -> "tenant_id");
        registry.add("ats.ingest.max-upload-bytes", () -> "1048576");
        // P3-gov0 (Codex REVISE): yaml default'u kaldırılan 3 güven girdisi — shipped kayıttan türet (drift-safe).
        AiGovernanceTestSupport.registerHttpJson(registry);
    }

    @Autowired private TestRestTemplate rest;
    @Autowired private DataSource dataSource;

    private ResponseEntity<String> putConsent(String token, String interviewId) {
        HttpHeaders h = new HttpHeaders();
        h.setBearerAuth(token);
        h.setContentType(MediaType.APPLICATION_JSON);
        String body = "{\"subjectRef\":\"subj-ref-1\",\"state\":\"GRANTED\"}";
        return rest.exchange("/api/v1/interviews/" + interviewId + "/recording-consent",
                HttpMethod.PUT, new HttpEntity<>(body, h), String.class);
    }

    private int wormConsentCount(String tenant) {
        try (var c = dataSource.getConnection();
                var ps = c.prepareStatement(
                        "SELECT count(*) FROM worm_ledger WHERE tenant_id = ? AND event_type = 'consent.recorded'")) {
            ps.setString(1, tenant);
            try (var rs = ps.executeQuery()) {
                rs.next();
                return rs.getInt(1);
            }
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    @Test
    void platform_kc_token_with_configured_tenant_id_claim_is_accepted_and_worm_binds_that_tenant() {
        // Platform-KC-style: tenant claim adı "tenant_id"; "tenant" claim'i YOK
        String token = JWT.token(
                Map.of("tenant_id", "kc-tenant-1", "scope", "ats.consent.write"),
                JwtTestSupport.ISSUER, List.of(JwtTestSupport.AUDIENCE), "kc-user-1");

        ResponseEntity<String> resp = putConsent(token, "iv-kc-1");

        assertEquals(204, resp.getStatusCode().value(), "configured tenant_id claim kabul edilmeli: " + resp.getBody());
        // Runtime tenant-extraction da AYNI config'i kullanmalı → WORM doğru tenant'a bağlanır
        assertEquals(1, wormConsentCount("kc-tenant-1"), "WORM configured claim'in tenant'ına bağlanmalı");
    }

    @Test
    void token_missing_configured_claim_is_403_no_fallback_no_500() {
        // config "tenant_id" bekliyor ama token yalnız "tenant" taşıyor → yetki yok → 403 (fallback YOK)
        String token = JWT.token(
                Map.of("tenant", "legacy-tenant", "scope", "ats.consent.write"),
                JwtTestSupport.ISSUER, List.of(JwtTestSupport.AUDIENCE), "kc-user-2");

        ResponseEntity<String> resp = putConsent(token, "iv-kc-2");

        assertEquals(403, resp.getStatusCode().value(),
                "yanlış-isimli tenant claim'i fail-closed 403 olmalı (500/fallback DEĞİL): " + resp.getStatusCode());
        assertEquals(0, wormConsentCount("legacy-tenant"), "reddedilen istek WORM'a hiçbir şey yazmamalı");
    }
}
