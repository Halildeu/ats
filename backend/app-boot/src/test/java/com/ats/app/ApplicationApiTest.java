package com.ats.app;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
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

/** Gerçek PG + gerçek RS256/JWKS ile müşteri-dikey acceptance testi. */
@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@org.springframework.context.annotation.Import(WormGovernanceTestSeed.class)
class ApplicationApiTest {

    private static final String TENANT = "00000000-0000-0000-0000-000000000001";
    private static final JwtTestSupport JWT = new JwtTestSupport();

    @Container
    private static final PostgreSQLContainer<?> PG = new PostgreSQLContainer<>("postgres:16-alpine");

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) {
        registry.add("ats.db.url", PG::getJdbcUrl);
        registry.add("ats.db.username", PG::getUsername);
        registry.add("ats.db.password", PG::getPassword);
        registry.add("ats.ai.base-url", () -> "http://127.0.0.1:9");
        registry.add("ats.security.jwks-uri", JWT::jwksUri);
        registry.add("ats.security.issuer", () -> JwtTestSupport.ISSUER);
        registry.add("ats.security.audience", () -> JwtTestSupport.AUDIENCE);
        AiGovernanceTestSupport.registerHttpJson(registry);
    }

    @AfterAll static void stopJwks() { JWT.stop(); }

    @Autowired private TestRestTemplate rest;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private DataSource ds;

    @Test
    void public_submit_candidate_tracking_and_tenant_recruiter_flow_is_persistent() throws Exception {
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement("""
                INSERT INTO ats_job_posting
                    (tenant_id, job_id, slug, title, team, location, mode,
                     employment_type, summary, highlights, published)
                VALUES ('other-tenant', 'other-job', 'urun-yoneticisi', 'SIZMAMALI',
                        'Other', 'Other', 'Other', 'Other', 'Other', '[]'::jsonb, true)
                ON CONFLICT DO NOTHING
                """)) {
            ps.executeUpdate();
        }
        ResponseEntity<String> jobs = rest.getForEntity("/api/v1/jobs", String.class);
        assertEquals(200, jobs.getStatusCode().value());
        assertEquals(3, objectMapper.readTree(jobs.getBody()).size());
        assertFalse(jobs.getBody().contains("SIZMAMALI"), "public katalog tenant disina sizmaz");

        String acceptedAt = Instant.now().toString();
        String payload = payload("Deniz Sentetik", acceptedAt);
        String idempotency = "idem-" + UUID.randomUUID();
        String submittedAccessToken = "A".repeat(43);
        HttpHeaders submitHeaders = json();
        submitHeaders.set("X-ATS-Idempotency-Key", idempotency);
        submitHeaders.set("X-ATS-Candidate-Access", submittedAccessToken);
        ResponseEntity<String> submit = rest.exchange(
                "/api/v1/jobs/urun-yoneticisi/applications", HttpMethod.POST,
                new HttpEntity<>(payload, submitHeaders), String.class);
        assertEquals(201, submit.getStatusCode().value(), submit.getBody());
        JsonNode receipt = objectMapper.readTree(submit.getBody());
        String publicRef = receipt.path("publicRef").asText();
        String accessToken = receipt.path("candidateAccessToken").asText();
        assertTrue(publicRef.startsWith("app_"));
        assertEquals(submittedAccessToken, accessToken);
        assertEquals("SUBMITTED", receipt.path("status").asText());

        HttpHeaders candidateHeaders = new HttpHeaders();
        candidateHeaders.set("X-ATS-Candidate-Access", accessToken);
        ResponseEntity<String> status = rest.exchange(
                "/api/v1/candidate/applications/" + publicRef, HttpMethod.GET,
                new HttpEntity<>(candidateHeaders), String.class);
        assertEquals(200, status.getStatusCode().value());
        JsonNode candidateView = objectMapper.readTree(status.getBody());
        assertEquals("SUBMITTED", candidateView.path("status").asText());
        assertFalse(candidateView.has("email"), "aday status yüzeyi PII taşımaz");

        HttpHeaders wrongCandidate = new HttpHeaders();
        wrongCandidate.set("X-ATS-Candidate-Access", "x".repeat(43));
        assertEquals(404, rest.exchange(
                "/api/v1/candidate/applications/" + publicRef, HttpMethod.GET,
                new HttpEntity<>(wrongCandidate), String.class).getStatusCode().value());

        String readToken = token(TENANT, "ats.application.read", "recruiter-read");
        ResponseEntity<String> inbox = rest.exchange(
                "/api/v1/recruiter/applications?jobSlug=urun-yoneticisi", HttpMethod.GET,
                new HttpEntity<>(bearer(readToken)), String.class);
        assertEquals(200, inbox.getStatusCode().value(), inbox.getBody());
        JsonNode inboxBody = objectMapper.readTree(inbox.getBody());
        assertEquals(1, inboxBody.path("total").asInt());
        assertEquals("Deniz Sentetik", inboxBody.path("items").get(0).path("fullName").asText());

        String otherTenant = token("other-tenant", "ats.application.read", "other-recruiter");
        JsonNode otherInbox = objectMapper.readTree(rest.exchange(
                "/api/v1/recruiter/applications", HttpMethod.GET,
                new HttpEntity<>(bearer(otherTenant)), String.class).getBody());
        assertEquals(0, otherInbox.path("total").asInt(), "cross-tenant varlık sızmaz");

        String writeToken = token(TENANT, "ats.application.status.write", "recruiter-write");
        HttpHeaders statusHeaders = bearer(writeToken);
        statusHeaders.setContentType(MediaType.APPLICATION_JSON);
        ResponseEntity<String> transitioned = rest.exchange(
                "/api/v1/recruiter/applications/" + publicRef + "/status", HttpMethod.PUT,
                new HttpEntity<>("{\"expectedVersion\":0,\"toStatus\":\"UNDER_REVIEW\"}", statusHeaders),
                String.class);
        assertEquals(200, transitioned.getStatusCode().value(), transitioned.getBody());
        assertEquals(1, objectMapper.readTree(transitioned.getBody()).path("version").asInt());

        ResponseEntity<String> stale = rest.exchange(
                "/api/v1/recruiter/applications/" + publicRef + "/status", HttpMethod.PUT,
                new HttpEntity<>("{\"expectedVersion\":0,\"toStatus\":\"INTERVIEW_PENDING\"}", statusHeaders),
                String.class);
        assertEquals(409, stale.getStatusCode().value());
        assertEquals("VERSION_CONFLICT", objectMapper.readTree(stale.getBody()).path("error").asText());

        ResponseEntity<String> statusAfter = rest.exchange(
                "/api/v1/candidate/applications/" + publicRef, HttpMethod.GET,
                new HttpEntity<>(candidateHeaders), String.class);
        assertEquals("UNDER_REVIEW", objectMapper.readTree(statusAfter.getBody()).path("status").asText());

        try (Connection c = ds.getConnection();
             PreparedStatement ps = c.prepareStatement("""
                     SELECT count(*), min(candidate_access_digest), max(candidate_access_digest)
                       FROM ats_application WHERE public_ref = ?
                     """)) {
            ps.setString(1, publicRef);
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                assertEquals(1, rs.getInt(1));
                assertEquals(64, rs.getString(2).length());
                assertFalse(rs.getString(2).equals(accessToken), "raw takip anahtarı DB'ye yazılmaz");
            }
        }
        assertEquals(2, scalar("SELECT count(*) FROM ats_application_event WHERE application_id ="
                + " (SELECT application_id FROM ats_application WHERE public_ref = ?)", publicRef));
    }

    @Test
    void idempotency_unknown_fields_scope_separation_and_body_limit_fail_closed() throws Exception {
        String acceptedAt = Instant.now().toString();
        String idempotency = "idem-" + UUID.randomUUID();
        String candidateAccess = "B".repeat(43);
        HttpHeaders h = json(); h.set("X-ATS-Idempotency-Key", idempotency);
        h.set("X-ATS-Candidate-Access", candidateAccess);
        String firstPayload = payload("Başvuru Bir", acceptedAt);
        assertEquals(201, rest.exchange("/api/v1/jobs/product-designer/applications", HttpMethod.POST,
                new HttpEntity<>(firstPayload, h), String.class).getStatusCode().value());

        ResponseEntity<String> replay = rest.exchange("/api/v1/jobs/product-designer/applications", HttpMethod.POST,
                new HttpEntity<>(firstPayload, h), String.class);
        assertEquals(200, replay.getStatusCode().value());
        assertEquals("true", replay.getHeaders().getFirst("X-ATS-Replay"));
        assertTrue(objectMapper.readTree(replay.getBody()).path("replayed").asBoolean());
        assertEquals(candidateAccess,
                objectMapper.readTree(replay.getBody()).path("candidateAccessToken").asText());

        ResponseEntity<String> conflict = rest.exchange("/api/v1/jobs/product-designer/applications", HttpMethod.POST,
                new HttpEntity<>(payload("Başvuru İki", acceptedAt), h), String.class);
        assertEquals(409, conflict.getStatusCode().value());

        String withTenant = firstPayload.substring(0, firstPayload.length() - 1)
                + ",\"tenantId\":\"forged\"}";
        HttpHeaders unknown = json(); unknown.set("X-ATS-Idempotency-Key", "idem-" + UUID.randomUUID());
        unknown.set("X-ATS-Candidate-Access", "C".repeat(43));
        ResponseEntity<String> unknownResponse = rest.exchange(
                "/api/v1/jobs/product-designer/applications", HttpMethod.POST,
                new HttpEntity<>(withTenant, unknown), String.class);
        assertEquals(400, unknownResponse.getStatusCode().value());
        assertEquals("no-store", unknownResponse.getHeaders().getCacheControl());
        assertEquals("INVALID_REQUEST",
                objectMapper.readTree(unknownResponse.getBody()).path("error").asText());

        HttpHeaders malformed = json();
        malformed.set("X-ATS-Idempotency-Key", "idem-" + UUID.randomUUID());
        malformed.set("X-ATS-Candidate-Access", "D".repeat(43));
        ResponseEntity<String> malformedResponse = rest.exchange(
                "/api/v1/jobs/product-designer/applications", HttpMethod.POST,
                new HttpEntity<>("{\"fullName\":", malformed), String.class);
        assertEquals(400, malformedResponse.getStatusCode().value());
        assertEquals("no-store", malformedResponse.getHeaders().getCacheControl());

        String readOnly = token(TENANT, "ats.application.read", "read-only");
        HttpHeaders readOnlyHeaders = bearer(readOnly); readOnlyHeaders.setContentType(MediaType.APPLICATION_JSON);
        assertEquals(403, rest.exchange(
                "/api/v1/recruiter/applications/app_" + "a".repeat(24) + "/status", HttpMethod.PUT,
                new HttpEntity<>("{\"expectedVersion\":0,\"toStatus\":\"UNDER_REVIEW\"}", readOnlyHeaders),
                String.class).getStatusCode().value());

        HttpHeaders huge = json(); huge.set("X-ATS-Idempotency-Key", "idem-" + UUID.randomUUID());
        String oversized = "{\"fullName\":\"" + "a".repeat(70_000) + "\"}";
        assertEquals(413, rest.exchange("/api/v1/jobs/senior-frontend-developer/applications", HttpMethod.POST,
                new HttpEntity<>(oversized, huge), String.class).getStatusCode().value());
    }

    private static String payload(String name, String acceptedAt) throws Exception {
        return new ObjectMapper().writeValueAsString(Map.ofEntries(
                Map.entry("fullName", name), Map.entry("email", "deniz@example.test"),
                Map.entry("phone", "+905550000000"), Map.entry("city", "İstanbul"),
                Map.entry("linkedIn", "https://www.linkedin.com/in/sentetik"),
                Map.entry("portfolio", "https://portfolio.example.test"),
                Map.entry("summary", "Ürün alanında sentetik profesyonel özet"),
                Map.entry("experience", "Sentetik deneyim kaydı"),
                Map.entry("education", "Sentetik lisans kaydı"),
                Map.entry("skills", List.of("Ürün keşfi", "Araştırma")),
                Map.entry("note", "Sentetik başvuru"),
                Map.entry("noticeVersion", "kvkk-application-v1"),
                Map.entry("noticeAcceptedAt", acceptedAt),
                Map.entry("accuracyConfirmedAt", acceptedAt)));
    }

    private String token(String tenant, String scope, String subject) {
        return JWT.token(Map.of("tenant", tenant, "scope", scope),
                JwtTestSupport.ISSUER, List.of(JwtTestSupport.AUDIENCE), subject);
    }

    private static HttpHeaders json() {
        HttpHeaders h = new HttpHeaders(); h.setContentType(MediaType.APPLICATION_JSON); return h;
    }
    private static HttpHeaders bearer(String token) {
        HttpHeaders h = new HttpHeaders(); h.setBearerAuth(token); return h;
    }
    private int scalar(String sql, String value) throws Exception {
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, value);
            try (ResultSet rs = ps.executeQuery()) { rs.next(); return rs.getInt(1); }
        }
    }
}
