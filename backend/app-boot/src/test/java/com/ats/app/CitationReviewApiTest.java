package com.ats.app;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
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
    private static final java.util.concurrent.atomic.AtomicInteger TRANSCRIBE_CALLS =
            new java.util.concurrent.atomic.AtomicInteger();
    private static final HttpServer AI = aiStub();

    private static HttpServer aiStub() {
        try {
            HttpServer s = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            s.createContext("/v1/transcribe", exchange -> {
                TRANSCRIBE_CALLS.incrementAndGet();
                exchange.getRequestBody().readAllBytes(); // audio_ref taşır; stub sentetik döner
                // gov1-1c: raporlanan model kimliği shipped approved-models.json http-json-stt/v1 ile eşleşir
                // → verify ALLOW (aksi halde fail-closed DENY). Enforcement kanıtı ayrı unit/E2E'de.
                String body = "{\"language\":\"tr-TR\",\"segments\":["
                        + "{\"speaker\":\"S1\",\"start_ms\":0,\"end_ms\":4000,\"text\":\"Soru (stub)\"},"
                        + "{\"speaker\":\"S2\",\"start_ms\":4000,\"end_ms\":9000,\"text\":\"Yanit (stub)\"}],"
                        + "\"model_id\":\"http-json-stt\",\"model_version\":\"v1\"}";
                byte[] b = body.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, b.length);
                try (var os = exchange.getResponseBody()) {
                    os.write(b);
                }
            });
            s.createContext("/v1/cite", exchange -> {
                String req = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
                // istekten claim'i çek (basit ayrıştırma; test-stub) — echo sözleşmesi
                String marker = "\"claim\":\"";
                int i = req.indexOf(marker) + marker.length();
                String claim = req.substring(i, req.indexOf('"', i));
                // gov1-1c: model kimliği http-json-cite/v1 (approved) → verify ALLOW; claim-swap dalı da
                // GEÇERLİ kimlik taşır ki iş-katmanı claim_mismatch kontrolüne ULAŞsın (governance'tan sonra).
                String identity = ",\"model_id\":\"http-json-cite\",\"model_version\":\"v1\"}";
                String body = claim.contains("degistir")
                        ? "{\"claim\":\"BAMBASKA BIR CLAIM\",\"source_segment_refs\":[\"seg-0\"],\"entailment\":\"supported\"" + identity
                        : "{\"claim\":\"" + claim + "\",\"source_segment_refs\":[\"seg-0\"],\"entailment\":\"supported\"" + identity;
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
        // P3-gov0 (Codex REVISE): yaml default'u kaldırılan 3 güven girdisi — shipped kayıttan türet (drift-safe).
        AiGovernanceTestSupport.registerHttpJson(registry);
    }

    @Autowired private TestRestTemplate rest;
    @Autowired private DataSource dataSource;
    @Autowired private TranscriptStore transcriptStore;

    private static final String TENANT = "cr-tenant";

    private String fullToken() {
        return JWT.token(java.util.Map.of("tenant", TENANT, "scope",
                        "ats.consent.write ats.recording.write ats.transcription.write ats.transcript.read ats.citation.write ats.review.write ats.review.read"),
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

    // --- transcription (F2→F3 köprüsü) ---

    @Test
    void transcribe_end_to_end_upload_then_stub_provider_then_transcript_readable() throws Exception {
        String token = fullToken();
        String iv = "iv-transcribe-1";
        grantConsent(token, iv);

        // gerçek upload → content-addressed objectKey (serbest string transcribe'a giremez)
        HttpHeaders up = new HttpHeaders();
        up.setBearerAuth(token);
        up.setContentType(MediaType.parseMediaType("audio/wav"));
        up.set("X-ATS-Filename", "kayit.wav");
        ResponseEntity<String> uploaded = rest.exchange("/api/v1/interviews/" + iv + "/recordings",
                HttpMethod.POST, new HttpEntity<>(new byte[128], up), String.class);
        assertEquals(201, uploaded.getStatusCode().value());
        String objectKey = uploaded.getBody().replaceAll(".*\"objectKey\":\"([^\"]+)\".*", "$1");

        ResponseEntity<String> tr = rest.exchange("/api/v1/interviews/" + iv + "/transcribe",
                HttpMethod.POST,
                new HttpEntity<>("{\"sourceObjectKey\":\"" + objectKey + "\"}", jsonBearer(token)),
                String.class);
        assertEquals(201, tr.getStatusCode().value());
        assertTrue(tr.getBody().contains("transcriptKey"));
        assertTrue(tr.getBody().contains("\"segmentCount\":2"));
        String trKey = tr.getBody().replaceAll(".*\"transcriptKey\":\"([^\"]+)\".*", "$1");

        // üretilen transkript gerçek okuma yüzeyinden gelir (S1/S2 stub segmentleri)
        ResponseEntity<String> got = rest.exchange(
                "/api/v1/interviews/" + iv + "/transcript?key=" + trKey, // raw: RestTemplate query-degerindeki slash literal tasinir
                HttpMethod.GET, new HttpEntity<>(jsonBearer(token)), String.class);
        assertEquals(200, got.getStatusCode().value());
        // sanitizer parantez-içi işaretleri STRIP eder (slice-2) — lexical içerik + S1/S2 takma-adlar kalır
        assertTrue(got.getBody().contains("Yanit"));
        assertTrue(got.getBody().contains("\"speakerLabel\":\"S2\""));
        assertFalse(got.getBody().contains("(stub)"), "parantez-içi işaret transkriptte kalmamalı (sanitizer kanıtı)");

        // serbest-string sourceObjectKey fail-closed 4xx (content-addressed TAM-eşleşme)
        ResponseEntity<String> badKey = rest.exchange("/api/v1/interviews/" + iv + "/transcribe",
                HttpMethod.POST,
                new HttpEntity<>("{\"sourceObjectKey\":\"serbest/../kacis\"}", jsonBearer(token)),
                String.class);
        assertTrue(badKey.getStatusCode().is4xxClientError());
    }

    @Test
    void valid_shaped_but_never_ingested_source_key_rejected_before_provider() throws Exception {
        String token = fullToken();
        String iv = "iv-transcribe-ghost";
        grantConsent(token, iv);

        int callsBefore = TRANSCRIBE_CALLS.get();
        String ghostKey = iv + "/rec-" + "a".repeat(64); // format-VALID ama hiç yüklenmemiş
        ResponseEntity<String> tr = rest.exchange("/api/v1/interviews/" + iv + "/transcribe",
                HttpMethod.POST,
                new HttpEntity<>("{\"sourceObjectKey\":\"" + ghostKey + "\"}", jsonBearer(token)),
                String.class);
        assertTrue(tr.getStatusCode().is4xxClientError(), "ingest kanıtı olmadan transcribe reddedilmeli");
        assertTrue(tr.getBody().contains("recording.ingested"));
        // sağlayıcı HİÇ çağrılmadı (kanıt-zinciri kapısı provider'dan ÖNCE)
        assertEquals(callsBefore, TRANSCRIBE_CALLS.get());

        // transcript store'da satır YOK + WORM'da transcript.created YOK
        try (var c = dataSource.getConnection(); var st = c.createStatement()) {
            try (var rs = st.executeQuery(
                    "SELECT count(*) FROM transcript WHERE interview_id = '" + iv + "'")) {
                rs.next();
                assertEquals(0, rs.getInt(1));
            }
            try (var rs = st.executeQuery(
                    "SELECT count(*) FROM worm_ledger WHERE interview_id = '" + iv
                            + "' AND event_type = 'transcript.created'")) {
                rs.next();
                assertEquals(0, rs.getInt(1));
            }
        }
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
        assertTrue(wormCount(TENANT, "claim.citation.recorded") >= 1,
                "citation WORM kanıtı exact event-type ile olmalı");
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

        assertTrue(wormCount(TENANT, "human_decision.finalized") >= 1,
                "finalize WORM kanıtı exact event-type ile olmalı");
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
    void different_reviewer_cannot_continue_anothers_case() {
        // Codex #65 blocker: A start eder, B (aynı tenant, geçerli REVIEW_WRITE) devam EDEMEZ
        String tokenA = fullToken();
        String tokenB = JWT.token(java.util.Map.of("tenant", TENANT, "scope",
                        "ats.review.write ats.review.read"),
                JwtTestSupport.ISSUER, List.of(JwtTestSupport.AUDIENCE), "reviewer-2");
        grantConsent(tokenA, "iv-actor");
        ResponseEntity<String> open = rest.exchange("/api/v1/interviews/iv-actor/review-cases",
                HttpMethod.POST, new HttpEntity<>(
                        "{\"sourceEvidenceRefs\":[\"ev-1\"],\"aiOutputVersionRef\":\"ai-v1\"}",
                        jsonBearer(tokenA)), String.class);
        String caseKey = open.getBody().replaceAll(".*\"caseKey\":\"([^\"]+)\".*", "$1");
        assertEquals(204, rest.exchange("/api/v1/interviews/iv-actor/review-case/transition",
                HttpMethod.POST, new HttpEntity<>(
                        "{\"caseKey\":\"" + caseKey + "\",\"action\":\"START\",\"oversightRoleRef\":\"role-1\"}",
                        jsonBearer(tokenA)), String.class).getStatusCode().value());

        ResponseEntity<String> bTry = rest.exchange("/api/v1/interviews/iv-actor/review-case/transition",
                HttpMethod.POST, new HttpEntity<>(
                        "{\"caseKey\":\"" + caseKey + "\",\"action\":\"REVIEWED_NO_CHANGE\"}",
                        jsonBearer(tokenB)), String.class);
        assertEquals(403, bTry.getStatusCode().value(),
                "başka reviewer devam edemez (accountability); body: " + bTry.getBody());

        ResponseEntity<String> bFinal = rest.exchange("/api/v1/interviews/iv-actor/review-case/finalize",
                HttpMethod.POST, new HttpEntity<>(
                        "{\"caseKey\":\"" + caseKey + "\",\"decisionOutcomeRef\":\"karar-x\"}",
                        jsonBearer(tokenB)), String.class);
        assertEquals(403, bFinal.getStatusCode().value(), "body: " + bFinal.getBody());
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
