package com.ats.app;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.orchestration.Transcript;
import com.ats.orchestration.TranscriptStore;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
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
    private static final ObjectMapper JSON_READER = new ObjectMapper();

    private static HttpServer aiStub() {
        try {
            HttpServer s = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            s.createContext("/v1/cite", exchange -> {
                String req = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
                String marker = "\"claim\":\"";
                int i = req.indexOf(marker) + marker.length();
                String claim = req.substring(i, req.indexOf('"', i));
                // gov1-1c: raporlanan model kimliği shipped approved http-json-cite/v1 ile eşleşir → verify ALLOW.
                byte[] b = ("{\"claim\":\"" + claim
                        + "\",\"source_segment_refs\":[\"seg-0\"],\"entailment\":\"supported\","
                        + "\"model_id\":\"http-json-cite\",\"model_version\":\"v1\"}")
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
        // P3-gov0 (Codex REVISE): yaml default'u kaldırılan 3 güven girdisi — shipped kayıttan türet (drift-safe).
        AiGovernanceTestSupport.registerHttpJson(registry);
    }

    @Autowired private TestRestTemplate rest;
    @Autowired private DataSource dataSource;
    @Autowired private TranscriptStore transcriptStore;
    @Autowired private com.ats.review.ReviewCaseStore reviewCaseStore;

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
    void full_chain_export_then_erasure_end_to_end() throws Exception {
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

        // 39d-10: AYNI gövdeyle ikinci POST → idempotent replay: 200 + X-ATS-Replay
        // + birebir aynı 4 alan + HİÇBİR yeni side-effect (WORM satır sayısı sabit).
        int wormAfterExport = wormTotal(TENANT);
        ResponseEntity<String> replay = post(tok, "/api/v1/interviews/" + iv + "/export", exportBody);
        assertEquals(200, replay.getStatusCode().value(), "body: " + replay.getBody());
        assertEquals("true", replay.getHeaders().getFirst("X-ATS-Replay"));
        JsonNode createdJson = JSON_READER.readTree(exp.getBody());
        JsonNode replayJson = JSON_READER.readTree(replay.getBody());
        for (String f : List.of("artifactKey", "evidenceId", "packetDigest", "claimCount")) {
            assertEquals(createdJson.get(f), replayJson.get(f),
                    "replay makbuz alanı birebir olmalı: " + f);
        }
        assertTrue(replayJson.path("claimCount").isIntegralNumber());
        assertTrue(replayJson.path("claimCount").intValue() >= 1);
        assertEquals(wormAfterExport, wormTotal(TENANT), "replay WORM'a satır YAZMAZ");
        // DEĞİŞTİRİLMİŞ gövde (farklı signatureRef) → replay DEĞİL, fail-closed conflict:
        ResponseEntity<String> conflict = post(tok, "/api/v1/interviews/" + iv + "/export",
                exportBody.replace("\"signatureRef\":\"sig-1\"", "\"signatureRef\":\"sig-BAŞKA\""));
        assertEquals(400, conflict.getStatusCode().value(), "body: " + conflict.getBody());
        assertEquals(wormAfterExport, wormTotal(TENANT));

        // 39d-11 R4 repair E2E: gerçek export'un vakasını test-only save ile
        // FINALIZED'a geri yazarak R4 kurulur (ledger satırı GERÇEK — request/
        // artifact digest'li). repair-token'lı POST → 200 REPAIRED → receipt
        // COMPLETED → aynı gövdeyle export POST yine 200 replay.
        com.ats.review.ReviewCase cur = reviewCaseStore
                .find(new TenantId(TENANT), new InterviewId(iv), caseKey).asOptional().orElseThrow();
        assertTrue(reviewCaseStore.save(new TenantId(TENANT), caseKey,
                cur.with(com.ats.review.ReviewState.FINALIZED)).isOk());
        String repairTok = token("ats.export.repair", "repair-op-1");
        ResponseEntity<String> rep = rest.exchange(
                "/api/v1/interviews/" + iv + "/export/repair",
                HttpMethod.POST, new HttpEntity<>("{\"caseKey\":\"" + caseKey + "\"}",
                        jsonBearer(repairTok)), String.class);
        assertEquals(200, rep.getStatusCode().value(), "body: " + rep.getBody());
        assertEquals("no-store", rep.getHeaders().getCacheControl());
        JsonNode repJson = JSON_READER.readTree(rep.getBody());
        assertEquals("REPAIRED", repJson.path("repairStatus").asText());
        assertEquals(field(exp.getBody(), "artifactKey"), repJson.path("artifactKey").asText());
        assertEquals(1, wormCount(TENANT, "export.transition_repair_intent"),
                "kalıcı repair-INTENT WORM satırı");
        // repair sonrası: receipt COMPLETED + aynı gövde replay 200
        ResponseEntity<String> recAfterRepair = rest.exchange(
                "/api/v1/interviews/" + iv + "/export/receipt?caseKey=" + caseKey,
                HttpMethod.GET,
                new HttpEntity<>(jsonBearer(token("ats.export.read", "auditor-0"))), String.class);
        assertTrue(recAfterRepair.getBody().contains("\"transitionStatus\":\"COMPLETED\""));
        ResponseEntity<String> replay2 = post(tok, "/api/v1/interviews/" + iv + "/export", exportBody);
        assertEquals(200, replay2.getStatusCode().value(), "body: " + replay2.getBody());
        // ikinci repair → ALREADY_EXPORTED + intent çoğalmaz
        ResponseEntity<String> rep2 = rest.exchange(
                "/api/v1/interviews/" + iv + "/export/repair",
                HttpMethod.POST, new HttpEntity<>("{\"caseKey\":\"" + caseKey + "\"}",
                        jsonBearer(repairTok)), String.class);
        assertEquals("ALREADY_EXPORTED", JSON_READER.readTree(rep2.getBody()).path("repairStatus").asText());
        assertEquals(1, wormCount(TENANT, "export.transition_repair_intent"));

        // 39d-8d: receipt-recovery 200 — tam-fixture kontrat. Salt-okuma scope
        // yeter (EXPORT_READ); no-store 200'de de zorunlu; alanlar export
        // cevabıyla birebir eşleşir (makbuz ledger'dan türetilir, yeniden
        // hesaplanmaz).
        String readTok = token("ats.export.read", "auditor-1");
        ResponseEntity<String> rec = rest.exchange(
                "/api/v1/interviews/" + iv + "/export/receipt?caseKey=" + caseKey,
                HttpMethod.GET, new HttpEntity<>(jsonBearer(readTok)), String.class);
        assertEquals(200, rec.getStatusCode().value(), "body: " + rec.getBody());
        assertEquals("no-store", rec.getHeaders().getCacheControl());
        assertEquals("no-cache", rec.getHeaders().getFirst("Pragma"));
        JsonNode receiptJson = JSON_READER.readTree(rec.getBody());
        assertEquals(caseKey, receiptJson.path("caseKey").asText());
        assertEquals("EXPORTED", receiptJson.path("caseState").asText());
        assertEquals("COMPLETED", receiptJson.path("transitionStatus").asText());
        assertEquals(artifactKey, receiptJson.path("artifactKey").asText());
        assertEquals(field(exp.getBody(), "evidenceId"), receiptJson.path("evidenceId").asText());
        assertEquals(field(exp.getBody(), "packetDigest"), receiptJson.path("packetDigest").asText());
        JsonNode claimCount = receiptJson.path("claimCount");
        assertTrue(claimCount.isIntegralNumber(),
                "claimCount JSON integer olmalı (string/float değil); body: " + rec.getBody());
        assertEquals(1, claimCount.intValue());
        java.time.Instant.parse(receiptJson.path("ledgerRecordedAt").asText());

        // 39d-9: artifact-read 200 — salt-okuma scope + no-store + VERBATIM kanıtı:
        // HTTP gövdesinin sha256'sı ledger payload'ındaki artifact_digest'e eşitse
        // HTTP katmanı re-serialize ETMEMİŞTİR (depolanan tam string aynen döndü).
        ResponseEntity<String> art = rest.exchange(
                "/api/v1/interviews/" + iv + "/export/artifact?caseKey=" + caseKey,
                HttpMethod.GET, new HttpEntity<>(jsonBearer(readTok)), String.class);
        assertEquals(200, art.getStatusCode().value(), "body: " + art.getBody());
        assertEquals("no-store", art.getHeaders().getCacheControl());
        assertEquals("no-cache", art.getHeaders().getFirst("Pragma"));
        assertTrue(String.valueOf(art.getHeaders().getContentType()).startsWith("application/json"));
        String ledgerArtifactDigest = ledgerPayloadField(TENANT, "evidence_packet.exported", "artifact_digest");
        assertTrue(ledgerArtifactDigest.matches("[0-9a-f]{64}"));
        assertEquals(ledgerArtifactDigest, sha256Hex(art.getBody()),
                "verbatim ihlali: HTTP gövdesi depolanan string'le birebir değil");
        JsonNode packetJson = JSON_READER.readTree(art.getBody());
        assertEquals(receiptJson.path("packetDigest").asText(),
                packetJson.path("integrity").path("packet_digest").asText(),
                "iki-kaynak doğrulama: packet.integrity.packet_digest == receipt.packetDigest");

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

        // Makbuz gerçeği erasure'dan SAĞ ÇIKAR: erasure scope'u export
        // artifact'i content-plane silme HEDEFİ olarak içerir; recovery GET
        // artifact'in hâlâ erişilebilir olduğunu İDDİA ETMEZ — yalnız
        // immutable ledger receipt metadata'sı (8 alan birebir) aynı kalır.
        ResponseEntity<String> recAfter = rest.exchange(
                "/api/v1/interviews/" + iv + "/export/receipt?caseKey=" + caseKey,
                HttpMethod.GET, new HttpEntity<>(jsonBearer(readTok)), String.class);
        assertEquals(200, recAfter.getStatusCode().value(), "body: " + recAfter.getBody());
        assertEquals("no-store", recAfter.getHeaders().getCacheControl());
        assertEquals("no-cache", recAfter.getHeaders().getFirst("Pragma"));
        JsonNode afterJson = JSON_READER.readTree(recAfter.getBody());
        for (String f : List.of("caseKey", "caseState", "transitionStatus", "artifactKey",
                "evidenceId", "packetDigest", "claimCount", "ledgerRecordedAt")) {
            assertEquals(receiptJson.get(f), afterJson.get(f),
                    "erasure sonrası ledger receipt alanı değişmemeli: " + f);
        }

        // 39d-9: erasure'ın content-plane silmesi ARTIK API'DAN kanıtlı —
        // artifact GET 404 (makbuz 200 kalırken) + hata cevabı da no-store.
        ResponseEntity<String> artGone = rest.exchange(
                "/api/v1/interviews/" + iv + "/export/artifact?caseKey=" + caseKey,
                HttpMethod.GET, new HttpEntity<>(jsonBearer(readTok)), String.class);
        assertEquals(404, artGone.getStatusCode().value(),
                "erasure sonrası artifact content-plane'den GERÇEKTEN silinmiş olmalı; body: " + artGone.getBody());
        assertEquals("no-store", artGone.getHeaders().getCacheControl());
        assertEquals("no-cache", artGone.getHeaders().getFirst("Pragma"));
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
        int wormBefore = wormTotal(TENANT);
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
        // side-effect yok: fail-closed erken çıkış WORM'a satır YAZMAZ (before/after delta)
        assertEquals(wormBefore, wormTotal(TENANT));
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

    private static String sha256Hex(String s) {
        try {
            var md = java.security.MessageDigest.getInstance("SHA-256");
            byte[] d = md.digest(s.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(d.length * 2);
            for (byte b : d) {
                sb.append(Character.forDigit((b >> 4) & 0xF, 16)).append(Character.forDigit(b & 0xF, 16));
            }
            return sb.toString();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    /** worm_ledger payload'ından tek alan (jsonb ->> ; en son satır). */
    private String ledgerPayloadField(String tenant, String eventType, String field) {
        try (Connection c = dataSource.getConnection();
                PreparedStatement ps = c.prepareStatement(
                        "SELECT payload ->> ? FROM worm_ledger"
                                + " WHERE tenant_id = ? AND event_type = ? ORDER BY seq DESC LIMIT 1")) {
            ps.setString(1, field);
            ps.setString(2, tenant);
            ps.setString(3, eventType);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next() || rs.getString(1) == null) {
                    throw new IllegalStateException("ledger payload alanı yok: " + field);
                }
                return rs.getString(1);
            }
        } catch (SQLException e) {
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
