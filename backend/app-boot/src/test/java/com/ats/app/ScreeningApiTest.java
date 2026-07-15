package com.ats.app;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.contracts.AIProvider.Entailment;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.orchestration.Citation;
import com.ats.orchestration.CitationStore;
import com.ats.orchestration.Transcript;
import com.ats.orchestration.TranscriptStore;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.List;
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

/** #156-c gerçek JWT + PostgreSQL 16 API kabul matrisi. */
@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@org.springframework.context.annotation.Import(WormGovernanceTestSeed.class)
class ScreeningApiTest {

    @Container
    private static final PostgreSQLContainer<?> PG =
            new PostgreSQLContainer<>("postgres:16-alpine");
    private static final JwtTestSupport JWT = new JwtTestSupport();
    private static final String TENANT = "screen-api-tenant";

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) {
        registry.add("ats.db.url", PG::getJdbcUrl);
        registry.add("ats.db.username", PG::getUsername);
        registry.add("ats.db.password", PG::getPassword);
        registry.add("ats.security.jwks-uri", JWT::jwksUri);
        registry.add("ats.security.issuer", () -> JwtTestSupport.ISSUER);
        registry.add("ats.security.audience", () -> JwtTestSupport.AUDIENCE);
        registry.add("ats.ai.base-url", () -> "http://127.0.0.1:9");
        AiGovernanceTestSupport.registerHttpJson(registry);
    }

    @AfterAll
    static void stopJwt() {
        JWT.stop();
    }

    @Autowired private TestRestTemplate rest;
    @Autowired private TranscriptStore transcriptStore;
    @Autowired private CitationStore citationStore;
    @Autowired private DataSource dataSource;

    @Test
    void transcript_screening_is_server_resolved_pointer_only_and_replayable() {
        String interview = "iv-screen-1";
        String transcriptKey = seedTranscript(
                interview, "Kaç yaşındasınız?", "Aday Java deneyimini anlattı.");
        String body = "{\"sourceKind\":\"TRANSCRIPT_SEGMENT\",\"transcriptKey\":\""
                + transcriptKey + "\",\"segmentIndex\":0}";

        ResponseEntity<String> first = post(
                interview, requestKey(1), body, token("ats.screening.write", "writer-1"));
        assertEquals(201, first.getStatusCode().value(), "body: " + first.getBody());
        assertEquals("no-store", first.getHeaders().getCacheControl());
        assertEquals("false", first.getHeaders().getFirst("X-ATS-Replay"));
        assertTrue(first.getBody().contains("\"disposition\":\"REVIEW_REQUIRED\""));
        assertTrue(first.getBody().contains("QUESTION_LIKE_PROTECTED_MENTION"));
        assertTrue(first.getBody().contains("\"spanUnit\":\"UTF16_CODE_UNIT\""));
        assertFalse(first.getBody().contains("Kaç yaşındasınız"));
        for (String forbidden : List.of("matchedText", "score", "confidence", "severity",
                "recommendation", "candidateOutcome", "hire", "reject")) {
            assertFalse(first.getBody().contains(forbidden), "yasak response alanı: " + forbidden);
        }
        String findingSetRef = jsonString(first.getBody(), "findingSetRef");

        ResponseEntity<String> replay = post(
                interview, requestKey(1), body, token("ats.screening.write", "writer-1"));
        assertEquals(200, replay.getStatusCode().value(), "body: " + replay.getBody());
        assertEquals("true", replay.getHeaders().getFirst("X-ATS-Replay"));
        assertEquals(findingSetRef, jsonString(replay.getBody(), "findingSetRef"));
        assertEquals(first.getBody(), replay.getBody(),
                "idempotent replay yeni/ayrışan response gövdesi üretmemeli");
        assertEquals(1, count(interview, "evidence.screening.protected_attribute.recorded"));

        ResponseEntity<String> read = rest.exchange(
                "/api/v1/interviews/" + interview + "/screenings/" + findingSetRef,
                HttpMethod.GET, new HttpEntity<>(bearer(token("ats.screening.read", "reader-1"))),
                String.class);
        assertEquals(200, read.getStatusCode().value(), "body: " + read.getBody());
        assertEquals(first.getBody(), read.getBody(),
                "GET canonical evidence görünümü POST gövdesiyle aynı olmalı");
        assertEquals(transcriptKey, jsonString(read.getBody(), "canonicalSourceRef"));
        assertFalse(read.getBody().contains("Kaç yaşındasınız"));

        ResponseEntity<String> crossInterview = rest.exchange(
                "/api/v1/interviews/iv-other/screenings/" + findingSetRef,
                HttpMethod.GET, new HttpEntity<>(bearer(token("ats.screening.read", "reader-1"))),
                String.class);
        assertEquals(404, crossInterview.getStatusCode().value());
    }

    @Test
    void citation_claim_is_resolved_from_store_and_same_key_different_source_conflicts() {
        String interview = "iv-screen-citation";
        String transcriptKey = seedTranscript(interview, "Normal soru", "Normal yanıt");
        String citationKey = citationStore.put(new Citation(
                new TenantId(TENANT), new InterviewId(interview), transcriptKey,
                "Hangi dine inanıyorsunuz?", List.of(0), Entailment.SUPPORTED))
                .asOptional().orElseThrow();
        String token = token("ats.screening.write", "writer-2");
        String body = "{\"sourceKind\":\"CITATION_CLAIM\",\"citationKey\":\""
                + citationKey + "\"}";
        ResponseEntity<String> first = post(interview, requestKey(2), body, token);
        assertEquals(201, first.getStatusCode().value(), "body: " + first.getBody());
        assertTrue(first.getBody().contains("RELIGION_BELIEF"));
        assertFalse(first.getBody().contains("Hangi dine"));

        String otherCitation = citationStore.put(new Citation(
                new TenantId(TENANT), new InterviewId(interview), transcriptKey,
                "Kaç yaşındasınız?", List.of(0), Entailment.SUPPORTED))
                .asOptional().orElseThrow();
        ResponseEntity<String> conflict = post(interview, requestKey(2),
                "{\"sourceKind\":\"CITATION_CLAIM\",\"citationKey\":\""
                        + otherCitation + "\"}", token);
        assertEquals(409, conflict.getStatusCode().value(), "body: " + conflict.getBody());
        assertTrue(conflict.getBody().contains("CONFLICT"));
    }

    @Test
    void strict_json_unsupported_sources_and_scope_intersection_fail_closed() {
        String interview = "iv-screen-strict";
        String transcriptKey = seedTranscript(interview, "Yaşınız nedir?", "Yanıt");
        String writer = token("ats.screening.write", "writer-3");
        String base = "{\"sourceKind\":\"TRANSCRIPT_SEGMENT\",\"transcriptKey\":\""
                + transcriptKey + "\",\"segmentIndex\":0";
        assertEquals(400, post(interview, requestKey(11), base
                + ",\"text\":\"ham veri\"}", writer).getStatusCode().value());
        assertEquals(400, post(interview, requestKey(12), base
                + ",\"segmentIndex\":1}", writer).getStatusCode().value(),
                "duplicate key JsonCodec tarafından reddedilmeli");
        assertEquals(400, post(interview, requestKey(13), base + "} trailing", writer)
                .getStatusCode().value());
        assertEquals(409, post(interview, requestKey(14),
                "{\"sourceKind\":\"FREE_TEXT\"}", writer).getStatusCode().value());

        String readOnly = token("ats.screening.read", "reader-only");
        assertEquals(403, post(interview, requestKey(15), base + "}", readOnly)
                .getStatusCode().value());
        String scopeWithoutRole = JWT.token(
                java.util.Map.of("tenant", TENANT, "scope", "ats.screening.write",
                        "resource_access", java.util.Map.of("ats-api",
                                java.util.Map.of("roles", List.of("ats.transcript.read")))),
                JwtTestSupport.ISSUER, List.of(JwtTestSupport.AUDIENCE), "escalator");
        assertEquals(403, post(interview, requestKey(16), base + "}", scopeWithoutRole)
                .getStatusCode().value());

        assertEquals(400, post(interview, "candidate-email@example.com", base + "}", writer)
                .getStatusCode().value(), "kalıcı request sentinel PII-taşıyabilen serbest key kabul etmemeli");

        HttpHeaders missingKeyHeaders = bearer(writer);
        missingKeyHeaders.setContentType(MediaType.APPLICATION_JSON);
        ResponseEntity<String> missingKey = rest.exchange(
                "/api/v1/interviews/" + interview + "/screenings",
                HttpMethod.POST, new HttpEntity<>(base + "}", missingKeyHeaders), String.class);
        assertEquals(400, missingKey.getStatusCode().value(), "body: " + missingKey.getBody());
        assertTrue(missingKey.getBody().contains("INVALID"));
        assertEquals("no-store", missingKey.getHeaders().getCacheControl());
    }

    private String seedTranscript(String interview, String first, String second) {
        return transcriptStore.put(new Transcript(
                new TenantId(TENANT), new InterviewId(interview),
                interview + "/rec-" + "a".repeat(64), "tr-TR",
                List.of(new Transcript.Segment(0, "S1", 0, 1_000, first),
                        new Transcript.Segment(1, "S2", 1_000, 2_000, second))))
                .asOptional().orElseThrow();
    }

    private ResponseEntity<String> post(
            String interview, String operationKey, String body, String token) {
        HttpHeaders headers = bearer(token);
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("X-ATS-Idempotency-Key", operationKey);
        return rest.exchange(
                "/api/v1/interviews/" + interview + "/screenings",
                HttpMethod.POST, new HttpEntity<>(body, headers), String.class);
    }

    private String token(String scope, String subject) {
        return JWT.token(java.util.Map.of("tenant", TENANT, "scope", scope),
                JwtTestSupport.ISSUER, List.of(JwtTestSupport.AUDIENCE), subject);
    }

    private static HttpHeaders bearer(String token) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        return headers;
    }

    private int count(String interview, String eventType) {
        try (Connection c = dataSource.getConnection(); PreparedStatement ps = c.prepareStatement(
                "SELECT count(*) FROM worm_ledger"
                        + " WHERE tenant_id = ? AND interview_id = ? AND event_type = ?")) {
            ps.setString(1, TENANT);
            ps.setString(2, interview);
            ps.setString(3, eventType);
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                return rs.getInt(1);
            }
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }

    private static String jsonString(String json, String field) {
        String marker = "\"" + field + "\":\"";
        int start = json.indexOf(marker);
        assertNotEquals(-1, start, "alan yok: " + field + " body=" + json);
        start += marker.length();
        return json.substring(start, json.indexOf('"', start));
    }

    private static String requestKey(int sequence) {
        return "scrq_00000000-0000-4000-8000-" + String.format("%012x", sequence);
    }
}
