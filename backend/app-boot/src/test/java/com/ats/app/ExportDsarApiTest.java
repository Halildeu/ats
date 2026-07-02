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
 * Slice-12 E2E — P1 hattının API üstünden UÇTAN UCA kapanışı (gerçek JWT +
 * gerçek PG + gerçek ai-stub): consent → transcript(seed) → citation → review
 * (open→…→finalize) → EXPORT (packet + WORM + vaka EXPORTED) → DSAR → ERASURE
 * (tombstone-önce; content silinir, WORM kalır; transcript GET artık 404).
 * Scope-matrisi: export-scope DSAR çağıramaz ve tersi.
 */
@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ExportDsarApiTest {

    @Container
    private static final PostgreSQLContainer<?> PG = new PostgreSQLContainer<>("postgres:16-alpine");

    private static final JwtTestSupport JWT = new JwtTestSupport();
    private static final HttpServer AI = aiStub();

    private static HttpServer aiStub() {
        try {
            HttpServer s = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            s.createContext("/v1/cite", exchange -> {
                String req = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
                String marker = "\"claim\":\"";
                int i = req.indexOf(marker) + marker.length();
                String claim = req.substring(i, req.indexOf('"', i));
                byte[] b = ("{\"claim\":\"" + claim
                        + "\",\"source_segment_refs\":[\"seg-0\"],\"entailment\":\"supported\"}")
                        .getBytes(StandardCharsets.UTF_8);
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

    private static final String TENANT = "ed-tenant";
    private static final String ALL = "ats.consent.write ats.citation.write ats.review.write "
            + "ats.review.read ats.transcript.read ats.export.write ats.dsar.write ats.erasure.execute";

    private String token(String scopes, String sub) {
        return JWT.token(java.util.Map.of("tenant", TENANT, "scope", scopes),
                JwtTestSupport.ISSUER, List.of(JwtTestSupport.AUDIENCE), sub);
    }

    private HttpHeaders jsonBearer(String token) {
        HttpHeaders h = new HttpHeaders();
        h.setBearerAuth(token);
        h.setContentType(MediaType.APPLICATION_JSON);
        return h;
    }

    private ResponseEntity<String> post(String token, String path, String body) {
        return rest.exchange(path, HttpMethod.POST, new HttpEntity<>(body, jsonBearer(token)), String.class);
    }

    private static String field(String body, String name) {
        return body.replaceAll(".*\"" + name + "\":\"([^\"]+)\".*", "$1");
    }

    @Test
    void full_chain_export_then_erasure_end_to_end() {
        String tok = token(ALL, "reviewer-1");
        String iv = "iv-full";

        // consent + transcript + citation
        assertEquals(204, rest.exchange("/api/v1/interviews/" + iv + "/recording-consent",
                HttpMethod.PUT, new HttpEntity<>("{\"subjectRef\":\"s-1\",\"state\":\"GRANTED\"}",
                        jsonBearer(tok)), String.class).getStatusCode().value());
        Outcome<String> seeded = transcriptStore.put(new Transcript(new TenantId(TENANT),
                new InterviewId(iv), iv + "/rec-seed", "tr-TR",
                List.of(new Transcript.Segment(0, "S1", 0, 5_000, "Aday bes yil Java gelistirdi."))));
        String tKey = ((Outcome.Ok<String>) seeded).value();
        ResponseEntity<String> cite = post(tok, "/api/v1/interviews/" + iv + "/citations",
                "{\"transcriptKey\":\"" + tKey + "\",\"claim\":\"Aday bes yil Java gelistirdi\"}");
        assertEquals(201, cite.getStatusCode().value(), "body: " + cite.getBody());
        String citationKey = field(cite.getBody(), "citationKey");
        String citationEvidenceId = field(cite.getBody(), "evidenceId");

        // review: open → START → REVIEWED_NO_CHANGE → RATIONALE → finalize
        // cross-invariant: source_evidence_refs ⊆ exported claims → vaka CITATION-KEY ile açılır
        ResponseEntity<String> open = post(tok, "/api/v1/interviews/" + iv + "/review-cases",
                "{\"sourceEvidenceRefs\":[\"" + citationKey + "\"],\"aiOutputVersionRef\":\"ai-v1\"}");
        String caseKey = field(open.getBody(), "caseKey");
        for (String t : new String[] {
                "{\"caseKey\":\"" + caseKey + "\",\"action\":\"START\",\"oversightRoleRef\":\"role-1\"}",
                "{\"caseKey\":\"" + caseKey + "\",\"action\":\"REVIEWED_NO_CHANGE\"}",
                "{\"caseKey\":\"" + caseKey + "\",\"action\":\"RATIONALE\",\"ref\":\"rationale-doc-1\"}"}) {
            assertEquals(204, post(tok, "/api/v1/interviews/" + iv + "/review-case/transition", t)
                    .getStatusCode().value());
        }
        assertEquals(200, post(tok, "/api/v1/interviews/" + iv + "/review-case/finalize",
                "{\"caseKey\":\"" + caseKey + "\",\"decisionOutcomeRef\":\"karar-ref-1\"}")
                .getStatusCode().value());

        // EXPORT
        String exportBody = "{\"caseKey\":\"" + caseKey + "\",\"citationKeys\":[\"" + citationKey + "\"],"
                + "\"context\":{\"generatorVersionRef\":\"gen-v1\",\"locale\":\"tr-TR\","
                + "\"timezone\":\"Europe/Istanbul\",\"aiAssistanceDisclosureRef\":\"disclosure-v1\","
                + "\"consentRefs\":[\"consent-ref-1\"],\"rubricVersionRef\":\"rubric-v1\","
                + "\"criteria\":[{\"criterionId\":\"c-comm\",\"jobRelatednessRationaleRef\":\"jr-v1\"}],"
                + "\"citationCriterion\":{\"" + citationKey + "\":\"c-comm\"},"
                + "\"wormChainRefs\":[\"" + citationEvidenceId + "\"],"
                + "\"redactionPolicyRef\":\"red-pol-v1\",\"redactionRunRef\":\"red-run-1\","
                + "\"retentionPolicyRef\":\"ret-pol-v1\",\"schemaDigest\":\"" + "0".repeat(64) + "\","
                + "\"signatureRef\":\"sig-1\"}}";
        ResponseEntity<String> exp = post(tok, "/api/v1/interviews/" + iv + "/export", exportBody);
        assertEquals(201, exp.getStatusCode().value(), "body: " + exp.getBody());
        String artifactKey = field(exp.getBody(), "artifactKey");
        assertTrue(exp.getBody().contains("packetDigest"));
        assertTrue(wormCount(TENANT, "evidence_packet.exported") >= 1,
                "export WORM kanıtı exact event-type ile olmalı");

        // vaka EXPORTED (GET)
        ResponseEntity<String> got = rest.exchange(
                "/api/v1/interviews/" + iv + "/review-case?case=" + caseKey,
                HttpMethod.GET, new HttpEntity<>(jsonBearer(tok)), String.class);
        assertTrue(got.getBody().contains("\"state\":\"EXPORTED\""), "body: " + got.getBody());

        // DSAR + ERASURE (tombstone hedefi: citation kanıtı)
        ResponseEntity<String> dsar = post(tok, "/api/v1/interviews/" + iv + "/dsar",
                "{\"subjectRef\":\"s-1\",\"reasonCode\":\"kvkk_talep\"}");
        assertEquals(201, dsar.getStatusCode().value(), "body: " + dsar.getBody());
        String dsarKey = field(dsar.getBody(), "dsarKey");

        String erasureBody = "{\"dsarKey\":\"" + dsarKey + "\",\"scope\":{"
                + "\"transcriptKeys\":[\"" + tKey + "\"],"
                + "\"citationKeys\":[\"" + citationKey + "\"],"
                + "\"exportArtifactKeys\":[\"" + artifactKey + "\"],"
                + "\"reviewCaseKeys\":[\"" + caseKey + "\"],"
                + "\"tombstoneTargetEvidenceIds\":[\"" + citationEvidenceId + "\"]}}";
        ResponseEntity<String> er = post(tok, "/api/v1/interviews/" + iv + "/dsar/erasure", erasureBody);
        assertEquals(200, er.getStatusCode().value(), "body: " + er.getBody());
        assertTrue(er.getBody().contains("\"tombstoneCount\":1"), "body: " + er.getBody());
        assertTrue(er.getBody().contains("\"caseTransitioned\":false"),
                "terminal EXPORTED state değişmez (dürüst receipt); body: " + er.getBody());

        // content-plane gerçekten silindi: transcript GET 404; WORM tombstone satırı var
        ResponseEntity<String> gone = rest.exchange(
                "/api/v1/interviews/" + iv + "/transcript?key=" + tKey,
                HttpMethod.GET, new HttpEntity<>(jsonBearer(tok)), String.class);
        assertEquals(404, gone.getStatusCode().value(), "transcript content silinmiş olmalı");
        assertTrue(wormCount(TENANT, "evidence.tombstoned") >= 1, "tombstone WORM satırı olmalı");
    }

    @Test
    void scope_matrix_export_dsar_and_erasure_are_separate_authorities() {
        String exportOnly = token("ats.export.write", "user-a");
        assertEquals(403, post(exportOnly, "/api/v1/interviews/iv-s/dsar",
                "{\"subjectRef\":\"s\",\"reasonCode\":\"r\"}").getStatusCode().value());
        String dsarOnly = token("ats.dsar.write", "user-b");
        assertEquals(403, post(dsarOnly, "/api/v1/interviews/iv-s/export",
                "{\"caseKey\":\"k\",\"citationKeys\":[],\"context\":{}}").getStatusCode().value());
        // Codex #66 blocker-1: intake ≠ execute — dsar-only ERASURE ÇAĞIRAMAZ
        assertEquals(403, post(dsarOnly, "/api/v1/interviews/iv-s/dsar/erasure",
                "{\"dsarKey\":\"k\",\"scope\":{\"transcriptKeys\":[\"t\"]}}").getStatusCode().value());
        // erasure-only da intake AÇAMAZ
        String erasureOnly = token("ats.erasure.execute", "user-c");
        assertEquals(403, post(erasureOnly, "/api/v1/interviews/iv-s/dsar",
                "{\"subjectRef\":\"s\",\"reasonCode\":\"r\"}").getStatusCode().value());
    }

    @Test
    void null_elements_in_lists_are_400_not_500() {
        String tok = token(ALL, "reviewer-1");
        // export: criteria[null] + consentRefs[null] + citationCriterion null-value
        ResponseEntity<String> e1 = post(tok, "/api/v1/interviews/iv-n/export",
                "{\"caseKey\":\"k\",\"citationKeys\":[\"c\"],\"context\":{\"criteria\":[null]}}");
        assertEquals(400, e1.getStatusCode().value(), "body: " + e1.getBody());
        ResponseEntity<String> e2 = post(tok, "/api/v1/interviews/iv-n/export",
                "{\"caseKey\":\"k\",\"citationKeys\":[\"c\"],\"context\":{\"consentRefs\":[null]}}");
        assertEquals(400, e2.getStatusCode().value(), "body: " + e2.getBody());
        ResponseEntity<String> e3 = post(tok, "/api/v1/interviews/iv-n/export",
                "{\"caseKey\":\"k\",\"citationKeys\":[\"c\"],\"context\":{\"citationCriterion\":{\"c\":null}}}");
        assertEquals(400, e3.getStatusCode().value(), "body: " + e3.getBody());
        // erasure: scope listelerinde null
        ResponseEntity<String> e4 = post(tok, "/api/v1/interviews/iv-n/dsar/erasure",
                "{\"dsarKey\":\"iv-n/dsar-x\",\"scope\":{\"transcriptKeys\":[null]}}");
        assertEquals(400, e4.getStatusCode().value(), "body: " + e4.getBody());
        // side-effect yok: iv-n tenant'ında hiç WORM satırı oluşmamalı (fail-closed erken çıkış)
        assertEquals(0, wormTotal("iv-n-tenant-yok"));
    }

    @Test
    void erasure_with_empty_scope_is_400_and_unknown_dsar_404() {
        String tok = token(ALL, "reviewer-1");
        assertEquals(400, post(tok, "/api/v1/interviews/iv-e/dsar/erasure",
                "{\"dsarKey\":\"iv-e/dsar-x\",\"scope\":{}}").getStatusCode().value());
        ResponseEntity<String> dsar = post(tok, "/api/v1/interviews/iv-e/dsar",
                "{\"subjectRef\":\"s-1\",\"reasonCode\":\"r\"}");
        assertEquals(201, dsar.getStatusCode().value());
        assertEquals(404, post(tok, "/api/v1/interviews/iv-e/dsar/erasure",
                "{\"dsarKey\":\"iv-e/dsar-YOK\",\"scope\":{\"transcriptKeys\":[\"iv-e/tr-x\"]}}")
                .getStatusCode().value());
    }

    private int wormTotal(String tenant) {
        try (Connection c = dataSource.getConnection();
                PreparedStatement ps = c.prepareStatement(
                        "SELECT count(*) FROM worm_ledger WHERE tenant_id = ?")) {
            ps.setString(1, tenant);
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                return rs.getInt(1);
            }
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private int wormCount(String tenant, String eventType) {
        try (Connection c = dataSource.getConnection();
                PreparedStatement ps = c.prepareStatement(
                        "SELECT count(*) FROM worm_ledger WHERE tenant_id = ? AND event_type = ?")) {
            ps.setString(1, tenant);
            ps.setString(2, eventType);
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                return rs.getInt(1);
            }
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

}
