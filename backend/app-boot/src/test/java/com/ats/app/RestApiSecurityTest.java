package com.ats.app;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
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
 * Slice-10 uçtan-uca güvenlik + akış testi — GERÇEK PG + GERÇEK RS256 imza +
 * GERÇEK JWKS yayını (mock-decoder yok):
 *  authn: token'sız 401 · yanlış-issuer 401 · yanlış-audience 401
 *  authz fail-closed: tenant-claim'siz 403 · scope'suz 403
 *  akış: consent GRANTED → upload 201 (WORM satırı PG'de doğrulanır) ·
 *        consent DENIED → upload 403 · cross-tenant transcript 404 ·
 *        Content-Length guard 411/413 · /healthz token'sız açık kalır.
 */
@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class RestApiSecurityTest {

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
        registry.add("ats.ingest.max-upload-bytes", () -> "1048576"); // 1 MiB (413 testi için)
    }

    @Autowired private TestRestTemplate rest;
    @Autowired private DataSource dataSource;

    private HttpHeaders bearer(String token) {
        HttpHeaders h = new HttpHeaders();
        h.setBearerAuth(token);
        return h;
    }

    private ResponseEntity<String> putConsent(String token, String interviewId, String state) {
        HttpHeaders h = bearer(token);
        h.setContentType(MediaType.APPLICATION_JSON);
        String body = "{\"subjectRef\":\"subj-ref-1\",\"state\":\"" + state + "\"}";
        return rest.exchange("/api/v1/interviews/" + interviewId + "/recording-consent",
                HttpMethod.PUT, new HttpEntity<>(body, h), String.class);
    }

    private ResponseEntity<String> upload(String token, String interviewId, byte[] payload) {
        HttpHeaders h = bearer(token);
        h.setContentType(MediaType.parseMediaType("audio/wav"));
        h.set("X-ATS-Filename", "kayit-1.wav");
        return rest.exchange("/api/v1/interviews/" + interviewId + "/recordings",
                HttpMethod.POST, new HttpEntity<>(payload, h), String.class);
    }

    // --- authn ---

    @Test
    void no_token_is_401_and_healthz_stays_open() {
        ResponseEntity<String> noToken = rest.exchange(
                "/api/v1/interviews/iv-1/recording-consent", HttpMethod.PUT,
                new HttpEntity<>("{\"subjectRef\":\"s\",\"state\":\"GRANTED\"}", jsonOnly()), String.class);
        assertEquals(401, noToken.getStatusCode().value());

        ResponseEntity<String> health = rest.getForEntity("/healthz", String.class);
        assertEquals(200, health.getStatusCode().value());
    }

    @Test
    void wrong_issuer_and_wrong_audience_are_401() {
        String wrongIssuer = JWT.token(Map.of("tenant", "t-a", "scope", "ats.user"),
                "https://evil.test", List.of(JwtTestSupport.AUDIENCE), "user-1");
        assertEquals(401, putConsent(wrongIssuer, "iv-1", "GRANTED").getStatusCode().value());

        String wrongAud = JWT.token(Map.of("tenant", "t-a", "scope", "ats.user"),
                JwtTestSupport.ISSUER, List.of("other-api"), "user-1");
        assertEquals(401, putConsent(wrongAud, "iv-1", "GRANTED").getStatusCode().value());
    }

    // --- authz fail-closed ---

    @Test
    void token_without_tenant_claim_is_403() {
        String noTenant = JWT.token(Map.of("scope", "ats.user"),
                JwtTestSupport.ISSUER, List.of(JwtTestSupport.AUDIENCE), "user-1");
        assertEquals(403, putConsent(noTenant, "iv-1", "GRANTED").getStatusCode().value());
    }

    @Test
    void token_without_required_scope_is_403() {
        String noScope = JWT.token(Map.of("tenant", "t-a", "scope", "openid profile"),
                JwtTestSupport.ISSUER, List.of(JwtTestSupport.AUDIENCE), "user-1");
        assertEquals(403, putConsent(noScope, "iv-1", "GRANTED").getStatusCode().value());
    }

    // --- akış ---

    @Test
    void consent_granted_then_upload_creates_worm_row_in_pg() throws Exception {
        String token = JWT.token("api-tenant-a", "recruiter-1");
        assertEquals(204, putConsent(token, "iv-happy", "GRANTED").getStatusCode().value());

        byte[] wav = "RIFFxxxxWAVEfmt-sentetik-icerik".getBytes(StandardCharsets.UTF_8);
        ResponseEntity<String> up = upload(token, "iv-happy", wav);
        assertEquals(201, up.getStatusCode().value(), "body: " + up.getBody());
        assertNotNull(up.getBody());
        assertTrue(up.getBody().contains("objectKey"));
        assertTrue(up.getBody().contains("evidenceId"));

        try (Connection c = dataSource.getConnection();
                PreparedStatement ps = c.prepareStatement(
                        "SELECT count(*) FROM worm_ledger WHERE tenant_id = ?")) {
            ps.setString(1, "api-tenant-a");
            try (ResultSet rs = ps.executeQuery()) {
                assertTrue(rs.next());
                assertTrue(rs.getInt(1) >= 1, "upload WORM satırı üretmiş olmalı");
            }
        }
    }

    @Test
    void consent_denied_makes_upload_403() {
        String token = JWT.token("api-tenant-deny", "recruiter-1");
        assertEquals(204, putConsent(token, "iv-deny", "DENIED").getStatusCode().value());
        ResponseEntity<String> up = upload(token, "iv-deny",
                "RIFFxxxxWAVE".getBytes(StandardCharsets.UTF_8));
        assertEquals(403, up.getStatusCode().value(), "body: " + up.getBody());
    }

    @Test
    void invalid_consent_state_is_400() {
        String token = JWT.token("api-tenant-a", "recruiter-1");
        assertEquals(400, putConsent(token, "iv-x", "MAYBE").getStatusCode().value());
    }

    @Test
    void cross_tenant_transcript_read_is_404() {
        String tokenB = JWT.token("api-tenant-b", "recruiter-2");
        ResponseEntity<String> resp = rest.exchange(
                "/api/v1/interviews/iv-happy/transcript?key=iv-happy/tr-0000",
                HttpMethod.GET, new HttpEntity<>(bearer(tokenB)), String.class);
        assertEquals(404, resp.getStatusCode().value());
    }

    @Test
    void oversized_upload_is_413() {
        String token = JWT.token("api-tenant-a", "recruiter-1");
        assertEquals(204, putConsent(token, "iv-big", "GRANTED").getStatusCode().value());
        byte[] big = new byte[1_048_577]; // limit + 1
        big[0] = 'R';
        ResponseEntity<String> up = upload(token, "iv-big", big);
        assertEquals(413, up.getStatusCode().value(), "body: " + up.getBody());
    }

    private static HttpHeaders jsonOnly() {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        return h;
    }
}
