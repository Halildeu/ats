package com.ats.app;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.orchestration.Transcript;
import com.ats.orchestration.TranscriptStore;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
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

/**
 * Slice-11 E2E — GERÇEK JWT (RS256+JWKS) + GERÇEK PG + GERÇEK ai-stub (ATS-0017
 * wire-contract'ının /v1/cite şekli; mock-provider DEĞİL, gerçek soket):
 *  citation: consent→transcript(seed)→POST citations 201 + citation WORM satırı PG'de;
 *  claim'i değiştiren sağlayıcı → 422-değil-201-değil: fail-closed (claim_mismatch);
 *  review: open→start→rationale→finalize (API üstünden) + human_decision WORM satırı;
 *  finalize atlamalı geçişte reddedilir; scope-matrisi: citation-scope review yazamaz.
 *
 * DÜRÜST SINIR: transcript SEED store-bean'iyle yapılır (STT canlı akışı ayrı iş —
 * ats-ai Faz24 endpoint'i); burada kanıtlanan şey API+servis+PG+WORM zinciri.
 */
@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class CitationReviewApiTest {

    @Container
    private static final PostgreSQLContainer<?> PG = new PostgreSQLContainer<>("postgres:16-alpine");

    private static final JwtTestSupport JWT = new JwtTestSupport();

    /** ATS-0017 wire-contract /v1/cite stub'ı: claim'i AYNEN yankılar, seg-0'ı kaynak verir. */
    private static final HttpServer AI = aiStub();

    private static HttpServer aiStub() {
        try {
            HttpServer s = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            s.createContext("/v1/cite", exchange -> {
                String req = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
                // istekten claim'i çek (basit ayrıştırma; test-stub) — echo sözleşmesi
                String marker = "\"claim\":\"";
                int i = req.indexOf(marker) + marker.length();
                String claim = req.substring(i, req.indexOf('"', i));
                String body = claim.contains("degistir")
                        ? "{\"claim\":\"BAMBASKA BIR CLAIM\",\"source_segment_refs\":[\"seg-0\"],\"entailment\":\"supported\"}"
                        : "{\"claim\":\"" + claim + "\",\"source_segment_refs\":[\"seg-0\"],\"entailment\":\"supported\"}";
                byte[] b = body.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, b.length);
                try (var os = exchange.getResponseBody()) {
                    os.write(b);
                }
            });
            s.start();
            return s;
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    @AfterAll
    static void stop() {
        JWT.stop();
        AI.stop(0);
    }

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) {
        registry.add("ats.db.url", PG::getJdbcUrl);
        registry.add("ats.db.username", PG::getUsername);
        registry.add("ats.db.password", PG::getPassword);
        registry.add("ats.ai.base-url", () -> "http://127.0.0.1:" + AI.getAddress().getPort());
        registry.add("ats.security.jwks-uri", JWT::jwksUri);
        registry.add("ats.security.issuer", () -> JwtTestSupport.ISSUER);
        registry.add("ats.security.audience", () -> JwtTestSupport.AUDIENCE);
    }

    @Autowired private TestRestTemplate rest;
    @Autowired private DataSource dataSource;
    @Autowired private TranscriptStore transcriptStore;

    private static final String TENANT = "cr-tenant";

    private String fullToken() {
        return JWT.token(java.util.Map.of("tenant", TENANT, "scope",
                        "ats.consent.write ats.citation.write ats.review.write ats.review.read"),
                JwtTestSupport.ISSUER, List.of(JwtTestSupport.AUDIENCE), "reviewer-1");
    }

    private HttpHeaders jsonBearer(String token) {
        HttpHeaders h = new HttpHeaders();
        h.setBearerAuth(token);
        h.setContentType(MediaType.APPLICATION_JSON);
        return h;
    }

    private void grantConsent(String token, String interviewId) {
        ResponseEntity<String> r = rest.exchange(
                "/api/v1/interviews/" + interviewId + "/recording-consent", HttpMethod.PUT,
                new HttpEntity<>("{\"subjectRef\":\"s-1\",\"state\":\"GRANTED\"}", jsonBearer(token)),
                String.class);
        assertEquals(204, r.getStatusCode().value());
    }

    private String seedTranscript(String interviewId) {
        Outcome<String> key = transcriptStore.put(new Transcript(new TenantId(TENANT),
                new InterviewId(interviewId), interviewId + "/rec-seed", "tr-TR",
                List.of(new Transcript.Segment(0, "S1", 0, 5_000, "Aday bes yil Java gelistirdigini soyledi."),
                        new Transcript.Segment(1, "S2", 5_000, 9_000, "Takim buyuklugu soruldu."))));
        return ((Outcome.Ok<String>) key).value();
    }

    // --- citation ---

    @Test
    void citation_end_to_end_with_real_ai_stub_and_worm_row() {
        String token = fullToken();
        grantConsent(token, "iv-cite");
        String tKey = seedTranscript("iv-cite");

        ResponseEntity<String> resp = rest.exchange("/api/v1/interviews/iv-cite/citations",
                HttpMethod.POST, new HttpEntity<>(
                        "{\"transcriptKey\":\"" + tKey + "\",\"claim\":\"Aday bes yil Java gelistirdi\"}",
                        jsonBearer(token)), String.class);
        assertEquals(201, resp.getStatusCode().value(), "body: " + resp.getBody());
        assertTrue(resp.getBody().contains("\"entailment\":\"SUPPORTED\""));
        assertTrue(resp.getBody().contains("citationKey"));
        assertTrue(wormCount(TENANT, "citation.recorded") >= 1
                || wormCount(TENANT, "ai.citation.recorded") >= 1
                || wormCountLike(TENANT, "%citation%") >= 1, "citation WORM kanıtı olmalı");
    }

    @Test
    void provider_altering_claim_is_rejected_fail_closed() {
        String token = fullToken();
        grantConsent(token, "iv-cite2");
        String tKey = seedTranscript("iv-cite2");

        ResponseEntity<String> resp = rest.exchange("/api/v1/interviews/iv-cite2/citations",
                HttpMethod.POST, new HttpEntity<>(
                        "{\"transcriptKey\":\"" + tKey + "\",\"claim\":\"bunu degistir saglayici\"}",
                        jsonBearer(token)), String.class);
        assertTrue(resp.getStatusCode().is4xxClientError(), "claim_mismatch fail-closed; body: " + resp.getBody());
        assertTrue(resp.getBody().contains("claim"), "body: " + resp.getBody());
    }

    // --- review ---

    @Test
    void review_open_to_finalize_end_to_end_with_worm_row() {
        String token = fullToken();
        grantConsent(token, "iv-rev");

        ResponseEntity<String> open = rest.exchange("/api/v1/interviews/iv-rev/review-cases",
                HttpMethod.POST, new HttpEntity<>(
                        "{\"sourceEvidenceRefs\":[\"ev-1\",\"ev-2\"],\"aiOutputVersionRef\":\"ai-v1\"}",
                        jsonBearer(token)), String.class);
        assertEquals(201, open.getStatusCode().value(), "body: " + open.getBody());
        String caseKey = open.getBody().replaceAll(".*\"caseKey\":\"([^\"]+)\".*", "$1");

        // caseKey '/' içerir -> transition/finalize gövdede, GET query-param (path'te asla)
        ResponseEntity<String> start = rest.exchange("/api/v1/interviews/iv-rev/review-case/transition",
                HttpMethod.POST, new HttpEntity<>(
                        "{\"caseKey\":\"" + caseKey + "\",\"action\":\"START\",\"oversightRoleRef\":\"role-hiring-lead\"}",
                        jsonBearer(token)), String.class);
        assertEquals(204, start.getStatusCode().value(), "body: " + start.getBody());
        // standart §2: rationale HUMAN_REVIEWING'den DEĞİL, inceleme-sonucu state'lerinden girilir
        ResponseEntity<String> noChange = rest.exchange("/api/v1/interviews/iv-rev/review-case/transition",
                HttpMethod.POST, new HttpEntity<>(
                        "{\"caseKey\":\"" + caseKey + "\",\"action\":\"REVIEWED_NO_CHANGE\"}",
                        jsonBearer(token)), String.class);
        assertEquals(204, noChange.getStatusCode().value(), "body: " + noChange.getBody());
        ResponseEntity<String> rationale = rest.exchange("/api/v1/interviews/iv-rev/review-case/transition",
                HttpMethod.POST, new HttpEntity<>(
                        "{\"caseKey\":\"" + caseKey + "\",\"action\":\"RATIONALE\",\"ref\":\"rationale-doc-7\"}",
                        jsonBearer(token)), String.class);
        assertEquals(204, rationale.getStatusCode().value(), "body: " + rationale.getBody());

        ResponseEntity<String> fin = rest.exchange("/api/v1/interviews/iv-rev/review-case/finalize",
                HttpMethod.POST, new HttpEntity<>(
                        "{\"caseKey\":\"" + caseKey + "\",\"decisionOutcomeRef\":\"karar-sonuc-ref-1\"}",
                        jsonBearer(token)), String.class);
        assertEquals(200, fin.getStatusCode().value(), "body: " + fin.getBody());
        assertTrue(fin.getBody().contains("evidenceId"));

        ResponseEntity<String> got = rest.exchange(
                "/api/v1/interviews/iv-rev/review-case?case=" + caseKey, HttpMethod.GET,
                new HttpEntity<>(jsonBearer(token)), String.class);
        assertEquals(200, got.getStatusCode().value());
        assertTrue(got.getBody().contains("\"state\":\"FINALIZED\""), "body: " + got.getBody());
        assertTrue(got.getBody().contains("reviewer-1"), "humanActorRef token-sub olmalı");

        assertTrue(wormCountLike(TENANT, "%human_decision%") >= 1, "finalize WORM kanıtı olmalı");
    }

    @Test
    void finalize_from_ai_state_is_structurally_impossible_via_api() {
        String token = fullToken();
        grantConsent(token, "iv-rev2");
        ResponseEntity<String> open = rest.exchange("/api/v1/interviews/iv-rev2/review-cases",
                HttpMethod.POST, new HttpEntity<>(
                        "{\"sourceEvidenceRefs\":[\"ev-1\"],\"aiOutputVersionRef\":\"ai-v1\"}",
                        jsonBearer(token)), String.class);
        String caseKey = open.getBody().replaceAll(".*\"caseKey\":\"([^\"]+)\".*", "$1");

        ResponseEntity<String> fin = rest.exchange(
                "/api/v1/interviews/iv-rev2/review-case/finalize", HttpMethod.POST,
                new HttpEntity<>("{\"caseKey\":\"" + caseKey + "\",\"decisionOutcomeRef\":\"karar-sonuc-ref-2\"}",
                        jsonBearer(token)), String.class);
        assertTrue(fin.getStatusCode().is4xxClientError(),
                "AI_SUGGESTED'dan finalize imkânsız; body: " + fin.getBody());
    }

    @Test
    void scope_matrix_citation_scope_cannot_write_review() {
        String citationOnly = JWT.token(java.util.Map.of("tenant", TENANT, "scope", "ats.citation.write"),
                JwtTestSupport.ISSUER, List.of(JwtTestSupport.AUDIENCE), "user-x");
        ResponseEntity<String> resp = rest.exchange("/api/v1/interviews/iv-x/review-cases",
                HttpMethod.POST, new HttpEntity<>(
                        "{\"sourceEvidenceRefs\":[\"ev-1\"],\"aiOutputVersionRef\":\"ai-v1\"}",
                        jsonBearer(citationOnly)), String.class);
        assertEquals(403, resp.getStatusCode().value());
    }

    private int wormCount(String tenant, String eventType) {
        return queryCount("SELECT count(*) FROM worm_ledger WHERE tenant_id = ? AND event_type = ?",
                tenant, eventType);
    }

    private int wormCountLike(String tenant, String eventTypeLike) {
        return queryCount("SELECT count(*) FROM worm_ledger WHERE tenant_id = ? AND event_type LIKE ?",
                tenant, eventTypeLike);
    }

    private int queryCount(String sql, String p1, String p2) {
        try (Connection c = dataSource.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, p1);
            ps.setString(2, p2);
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                return rs.getInt(1);
            }
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
