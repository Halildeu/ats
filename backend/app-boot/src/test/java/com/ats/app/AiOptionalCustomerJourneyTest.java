package com.ats.app;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.contracts.AIProvider;
import com.ats.contracts.governance.ModelGovernanceGate;
import com.ats.contracts.governance.ModelGovernanceJournal;
import com.ats.orchestration.AudioAccessGrants;
import com.ats.orchestration.CitationService;
import com.ats.orchestration.SegmentSanitizer;
import com.ats.orchestration.TranscriptionService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
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
import org.springframework.context.ApplicationContext;
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
 * Faz 25 müşteri-öncelikli regresyonu: WORM tamamen boş ve AI config'i yokken
 * ilan -> aday başvurusu kalıcı sonucu çalışır; yalnız AI çağrı yolu 503 ile
 * fail-closed kalır. Production boot-seed veya sahte model onayı kullanılmaz.
 */
@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AiOptionalCustomerJourneyTest {

    private static final String TENANT = "00000000-0000-0000-0000-000000000001";
    private static final JwtTestSupport JWT = new JwtTestSupport();

    @Container
    private static final PostgreSQLContainer<?> PG = new PostgreSQLContainer<>("postgres:16-alpine");

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) {
        registry.add("ats.db.url", PG::getJdbcUrl);
        registry.add("ats.db.username", PG::getUsername);
        registry.add("ats.db.password", PG::getPassword);
        registry.add("ats.ai.enabled", () -> "false");
        registry.add("ats.security.jwks-uri", JWT::jwksUri);
        registry.add("ats.security.issuer", () -> JwtTestSupport.ISSUER);
        registry.add("ats.security.audience", () -> JwtTestSupport.AUDIENCE);
    }

    @AfterAll
    static void stopJwks() {
        JWT.stop();
    }

    @Autowired private ApplicationContext context;
    @Autowired private TestRestTemplate rest;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private DataSource dataSource;

    @Test
    void empty_worm_keeps_customer_journey_live_and_ai_path_fail_closed() throws Exception {
        assertEquals(0, scalar("SELECT count(*) FROM model_governance_ledger"));
        assertTrue(context.getBeansOfType(AudioAccessGrants.class).isEmpty());
        assertTrue(context.getBeansOfType(AIProvider.class).isEmpty());
        assertTrue(context.getBeansOfType(SegmentSanitizer.class).isEmpty());
        assertTrue(context.getBeansOfType(TranscriptionService.class).isEmpty());
        assertTrue(context.getBeansOfType(CitationService.class).isEmpty());
        assertTrue(context.getBeansOfType(AuthorizedModelBindings.class).isEmpty());
        assertTrue(context.getBeansOfType(ModelGovernanceGate.class).isEmpty());
        assertTrue(context.getBeansOfType(ModelGovernanceJournal.class).isEmpty());

        ResponseEntity<String> jobs = rest.getForEntity("/api/v1/jobs", String.class);
        assertEquals(200, jobs.getStatusCode().value(), jobs.getBody());
        assertTrue(objectMapper.readTree(jobs.getBody()).size() > 0);

        String acceptedAt = Instant.now().toString();
        String payload = objectMapper.writeValueAsString(Map.ofEntries(
                Map.entry("fullName", "AI Kapalı Aday"),
                Map.entry("email", "ai-kapali@example.test"),
                Map.entry("phone", "+905550000001"),
                Map.entry("city", "İstanbul"),
                Map.entry("linkedIn", "https://www.linkedin.com/in/ai-kapali"),
                Map.entry("portfolio", "https://portfolio.example.test"),
                Map.entry("summary", "AI onayı olmadan çalışan sentetik aday yolculuğu"),
                Map.entry("experience", "Sentetik deneyim"),
                Map.entry("education", "Sentetik eğitim"),
                Map.entry("skills", List.of("Ürün")),
                Map.entry("note", "AI bağımsız çekirdek"),
                Map.entry("noticeVersion", "kvkk-application-v1"),
                Map.entry("noticeAcceptedAt", acceptedAt),
                Map.entry("accuracyConfirmedAt", acceptedAt)));
        HttpHeaders submitHeaders = new HttpHeaders();
        submitHeaders.setContentType(MediaType.APPLICATION_JSON);
        submitHeaders.set("X-ATS-Idempotency-Key", "ai-off-" + UUID.randomUUID());
        submitHeaders.set("X-ATS-Candidate-Access", "A".repeat(43));
        ResponseEntity<String> submitted = rest.exchange(
                "/api/v1/jobs/urun-yoneticisi/applications", HttpMethod.POST,
                new HttpEntity<>(payload, submitHeaders), String.class);
        assertEquals(201, submitted.getStatusCode().value(), submitted.getBody());
        JsonNode receipt = objectMapper.readTree(submitted.getBody());
        assertEquals("SUBMITTED", receipt.path("status").asText());
        String publicRef = receipt.path("publicRef").asText();
        String candidateAccess = receipt.path("candidateAccessToken").asText();
        assertFalse(publicRef.isBlank());

        HttpHeaders candidateHeaders = new HttpHeaders();
        candidateHeaders.set("X-ATS-Candidate-Access", candidateAccess);
        ResponseEntity<String> candidateStatus = rest.exchange(
                "/api/v1/candidate/applications/" + publicRef, HttpMethod.GET,
                new HttpEntity<>(candidateHeaders), String.class);
        assertEquals(200, candidateStatus.getStatusCode().value(), candidateStatus.getBody());
        assertEquals("SUBMITTED", objectMapper.readTree(candidateStatus.getBody()).path("status").asText());

        String readToken = JWT.token(Map.of(
                        "tenant", TENANT,
                        "scope", "ats.application.read"),
                JwtTestSupport.ISSUER, List.of(JwtTestSupport.AUDIENCE), "ai-off-recruiter-read");
        HttpHeaders readHeaders = new HttpHeaders();
        readHeaders.setBearerAuth(readToken);
        ResponseEntity<String> inbox = rest.exchange(
                "/api/v1/recruiter/applications?jobSlug=urun-yoneticisi", HttpMethod.GET,
                new HttpEntity<>(readHeaders), String.class);
        assertEquals(200, inbox.getStatusCode().value(), inbox.getBody());
        assertEquals(publicRef,
                objectMapper.readTree(inbox.getBody()).path("items").get(0).path("publicRef").asText());

        String writeToken = JWT.token(Map.of(
                        "tenant", TENANT,
                        "scope", "ats.application.status.write"),
                JwtTestSupport.ISSUER, List.of(JwtTestSupport.AUDIENCE), "ai-off-recruiter-write");
        HttpHeaders writeHeaders = new HttpHeaders();
        writeHeaders.setBearerAuth(writeToken);
        writeHeaders.setContentType(MediaType.APPLICATION_JSON);
        ResponseEntity<String> transitioned = rest.exchange(
                "/api/v1/recruiter/applications/" + publicRef + "/status", HttpMethod.PUT,
                new HttpEntity<>("{\"expectedVersion\":0,\"toStatus\":\"UNDER_REVIEW\"}", writeHeaders),
                String.class);
        assertEquals(200, transitioned.getStatusCode().value(), transitioned.getBody());
        ResponseEntity<String> candidateAfter = rest.exchange(
                "/api/v1/candidate/applications/" + publicRef, HttpMethod.GET,
                new HttpEntity<>(candidateHeaders), String.class);
        assertEquals("UNDER_REVIEW",
                objectMapper.readTree(candidateAfter.getBody()).path("status").asText());

        String token = JWT.token(Map.of(
                        "tenant", TENANT,
                        "scope", "ats.transcription.write"),
                JwtTestSupport.ISSUER, List.of(JwtTestSupport.AUDIENCE), "ai-off-recruiter");
        HttpHeaders aiHeaders = new HttpHeaders();
        aiHeaders.setBearerAuth(token);
        aiHeaders.setContentType(MediaType.APPLICATION_JSON);
        ResponseEntity<String> transcribe = rest.exchange(
                "/api/v1/interviews/iv-ai-off/transcribe", HttpMethod.POST,
                new HttpEntity<>("{\"sourceObjectKey\":\"opaque-key\"}", aiHeaders), String.class);
        assertEquals(503, transcribe.getStatusCode().value(), transcribe.getBody());
        assertEquals("AI_NOT_APPROVED", objectMapper.readTree(transcribe.getBody()).path("error").asText());
        assertEquals("no-store", transcribe.getHeaders().getCacheControl());
        assertEquals(0, scalar("SELECT count(*) FROM model_governance_ledger"));
    }

    private int scalar(String sql) throws Exception {
        try (Connection c = dataSource.getConnection();
             Statement st = c.createStatement();
             ResultSet rs = st.executeQuery(sql)) {
            rs.next();
            return rs.getInt(1);
        }
    }
}
