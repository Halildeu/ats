package com.ats.app;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.net.URI;
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
        String wrongIssuer = JWT.token(Map.of("tenant", "t-a", "scope", JwtTestSupport.ALL_SCOPES),
                "https://evil.test", List.of(JwtTestSupport.AUDIENCE), "user-1");
        assertEquals(401, putConsent(wrongIssuer, "iv-1", "GRANTED").getStatusCode().value());

        String wrongAud = JWT.token(Map.of("tenant", "t-a", "scope", JwtTestSupport.ALL_SCOPES),
                JwtTestSupport.ISSUER, List.of("other-api"), "user-1");
        assertEquals(401, putConsent(wrongAud, "iv-1", "GRANTED").getStatusCode().value());
    }

    // --- authz fail-closed ---

    @Test
    void token_without_tenant_claim_is_403() {
        String noTenant = JWT.token(Map.of("scope", JwtTestSupport.ALL_SCOPES),
                JwtTestSupport.ISSUER, List.of(JwtTestSupport.AUDIENCE), "user-1");
        assertEquals(403, putConsent(noTenant, "iv-1", "GRANTED").getStatusCode().value());
    }

    @Test
    void requested_privileged_scopes_without_assigned_roles_is_403_escalation_closed() {
        // 39d-2b (Codex 019f4c6c P0, 10. negatif test): rolsüz kullanıcı
        // ayrıcalıklı optional scope'ları AÇIKÇA istemiş ve IdP token'a
        // yazmış olsa bile — resource_access EXPLICIT boş → rol-kapısı 403.
        String escalated = JWT.token(Map.of(
                        "tenant", "t-a",
                        "scope", "ats.consent.write ats.recording.write ats.export.write ats.dsar.write ats.erasure.execute",
                        "resource_access", Map.of()),
                JwtTestSupport.ISSUER, List.of(JwtTestSupport.AUDIENCE), "escalating-user");
        assertEquals(403, putConsent(escalated, "iv-esc", "GRANTED").getStatusCode().value());
        ResponseEntity<String> upload = upload(escalated, "iv-esc", new byte[] {1, 2, 3});
        assertEquals(403, upload.getStatusCode().value());
    }

    @Test
    void token_without_required_scope_is_403() {
        String noScope = JWT.token(Map.of("tenant", "t-a", "scope", "openid profile"),
                JwtTestSupport.ISSUER, List.of(JwtTestSupport.AUDIENCE), "user-1");
        assertEquals(403, putConsent(noScope, "iv-1", "GRANTED").getStatusCode().value());
    }

    @Test
    void scope_separation_consent_scope_cannot_upload_and_vice_versa() {
        // yalnız consent.write: PUT consent OK, POST recording 403
        String consentOnly = JWT.token(Map.of("tenant", "t-sep", "scope", "ats.consent.write"),
                JwtTestSupport.ISSUER, List.of(JwtTestSupport.AUDIENCE), "user-1");
        assertEquals(204, putConsent(consentOnly, "iv-sep", "GRANTED").getStatusCode().value());
        assertEquals(403, upload(consentOnly, "iv-sep",
                "RIFFxxxxWAVE".getBytes(StandardCharsets.UTF_8)).getStatusCode().value());

        // yalnız recording.write: consent PUT 403 (herhangi ats-kullanıcısı consent YAZAMAZ)
        String recordingOnly = JWT.token(Map.of("tenant", "t-sep", "scope", "ats.recording.write"),
                JwtTestSupport.ISSUER, List.of(JwtTestSupport.AUDIENCE), "user-1");
        assertEquals(403, putConsent(recordingOnly, "iv-sep2", "GRANTED").getStatusCode().value());
    }

    @Test
    void unknown_endpoint_is_deny_all_even_with_full_scopes() {
        String token = JWT.token("t-sep", "user-1");
        ResponseEntity<String> resp = rest.exchange("/api/v1/other-surface",
                HttpMethod.GET, new HttpEntity<>(bearer(token)), String.class);
        assertEquals(403, resp.getStatusCode().value(), "bilinmeyen yüzey fail-closed denyAll");
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

        assertTrue(wormCount("api-tenant-a", "consent.recorded") >= 1,
                "consent PUT WORM kanıtı üretmiş olmalı (Codex #64 blocker-2)");
        assertTrue(wormCount("api-tenant-a", "recording.ingested") >= 1,
                "upload WORM satırı üretmiş olmalı");
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

    @Test
    void consent_denied_makes_upload_403() {
        String token = JWT.token("api-tenant-deny", "recruiter-1");
        assertEquals(204, putConsent(token, "iv-deny", "DENIED").getStatusCode().value());
        ResponseEntity<String> up = upload(token, "iv-deny",
                "RIFFxxxxWAVE".getBytes(StandardCharsets.UTF_8));
        assertEquals(403, up.getStatusCode().value(), "body: " + up.getBody());
    }

    @Test
    void unsafe_idempotency_key_is_400() {
        String token = JWT.token("api-tenant-a", "recruiter-1");
        HttpHeaders h = bearer(token);
        h.setContentType(MediaType.APPLICATION_JSON);
        h.set("X-ATS-Idempotency-Key", "kötü anahtar/../{}");
        ResponseEntity<String> resp = rest.exchange("/api/v1/interviews/iv-k/recording-consent",
                HttpMethod.PUT,
                new HttpEntity<>("{\"subjectRef\":\"s-1\",\"state\":\"GRANTED\"}", h), String.class);
        assertEquals(400, resp.getStatusCode().value(), "body: " + resp.getBody());
    }

    @Test
    void invalid_consent_state_is_400() {
        String token = JWT.token("api-tenant-a", "recruiter-1");
        assertEquals(400, putConsent(token, "iv-x", "MAYBE").getStatusCode().value());
    }

    @Test
    void transcript_list_is_scoped_and_pointer_only() throws Exception {
        // content-plane doğrudan seed (transcription orchestration ayrı dilim)
        try (var c = dataSource.getConnection(); var st = c.createStatement()) {
            st.executeUpdate("INSERT INTO transcript (tenant_id, transcript_key, interview_id,"
                    + " source_object_key, language, segments) VALUES ('t-a', 'iv-list/tr-1', 'iv-list',"
                    + " 'obj/iv-list/rec-1', 'tr',"
                    + " '[{\"index\":0,\"speaker_label\":\"S1\",\"start_ms\":0,\"end_ms\":100,"
                    + "\"text\":\"gizli-segment-metni\"}]'::jsonb) ON CONFLICT DO NOTHING");
        }
        String reader = JWT.token(Map.of("tenant", "t-a", "scope", "ats.transcript.read"),
                JwtTestSupport.ISSUER, List.of(JwtTestSupport.AUDIENCE), "user-1");
        ResponseEntity<String> ok = rest.exchange("/api/v1/interviews/iv-list/transcripts",
                HttpMethod.GET, new HttpEntity<>(bearer(reader)), String.class);
        assertEquals(200, ok.getStatusCode().value());
        assertTrue(ok.getBody().contains("iv-list/tr-1"));
        assertTrue(ok.getBody().contains("\"segmentCount\":1"));
        // pointer-only: liste content (segment metni) TAŞIMAZ
        assertFalse(ok.getBody().contains("gizli-segment-metni"));

        // scope ayrımı: transcript.read olmayan token 403
        String consentOnly = JWT.token(Map.of("tenant", "t-a", "scope", "ats.consent.write"),
                JwtTestSupport.ISSUER, List.of(JwtTestSupport.AUDIENCE), "user-1");
        assertEquals(403, rest.exchange("/api/v1/interviews/iv-list/transcripts",
                HttpMethod.GET, new HttpEntity<>(bearer(consentOnly)), String.class)
                .getStatusCode().value());

        // tenant izolasyonu: yabancı tenant BOŞ liste görür (varlık sızdırmaz)
        String foreign = JWT.token(Map.of("tenant", "t-b", "scope", "ats.transcript.read"),
                JwtTestSupport.ISSUER, List.of(JwtTestSupport.AUDIENCE), "user-2");
        ResponseEntity<String> empty = rest.exchange("/api/v1/interviews/iv-list/transcripts",
                HttpMethod.GET, new HttpEntity<>(bearer(foreign)), String.class);
        assertEquals(200, empty.getStatusCode().value());
        assertEquals("[]", empty.getBody());
    }

    @Test
    void review_case_list_is_scoped_and_pointer_only() throws Exception {
        try (var c = dataSource.getConnection(); var st = c.createStatement()) {
            st.executeUpdate("INSERT INTO review_case (tenant_id, case_key, interview_id, state,"
                    + " source_evidence_refs, ai_output_version_ref, human_authored_rationale_ref)"
                    + " VALUES ('t-a', 'iv-cl/case-1', 'iv-cl', 'AI_SUGGESTED', '[\"cit-gizli-ref\"]'::jsonb,"
                    + " 'ai-v1', 'gizli-gerekce-ref') ON CONFLICT DO NOTHING");
        }
        String reader = JWT.token(Map.of("tenant", "t-a", "scope", "ats.review.read"),
                JwtTestSupport.ISSUER, List.of(JwtTestSupport.AUDIENCE), "user-1");
        ResponseEntity<String> ok = rest.exchange("/api/v1/interviews/iv-cl/review-cases",
                HttpMethod.GET, new HttpEntity<>(bearer(reader)), String.class);
        assertEquals(200, ok.getStatusCode().value());
        assertTrue(ok.getBody().contains("iv-cl/case-1"));
        assertTrue(ok.getBody().contains("\"state\":\"AI_SUGGESTED\""));
        // pointer-only: liste ref alanlarını TAŞIMAZ
        assertFalse(ok.getBody().contains("gizli-gerekce-ref"));
        assertFalse(ok.getBody().contains("cit-gizli-ref"));

        // scope ayrımı: review.read olmayan token 403
        String writeOnly = JWT.token(Map.of("tenant", "t-a", "scope", "ats.review.write"),
                JwtTestSupport.ISSUER, List.of(JwtTestSupport.AUDIENCE), "user-1");
        assertEquals(403, rest.exchange("/api/v1/interviews/iv-cl/review-cases",
                HttpMethod.GET, new HttpEntity<>(bearer(writeOnly)), String.class)
                .getStatusCode().value());

        // tenant izolasyonu: yabancı tenant BOŞ liste
        String foreign = JWT.token(Map.of("tenant", "t-b", "scope", "ats.review.read"),
                JwtTestSupport.ISSUER, List.of(JwtTestSupport.AUDIENCE), "user-2");
        ResponseEntity<String> empty = rest.exchange("/api/v1/interviews/iv-cl/review-cases",
                HttpMethod.GET, new HttpEntity<>(bearer(foreign)), String.class);
        assertEquals(200, empty.getStatusCode().value());
        assertEquals("[]", empty.getBody());
    }

    @Test
    void transcribe_requires_its_own_scope() {
        // recording.write TEK BAŞINA yetmez — transcription ayrı yetki sınıfı (intake≠işleme)
        String recordingOnly = JWT.token(Map.of("tenant", "t-a", "scope", "ats.recording.write"),
                JwtTestSupport.ISSUER, List.of(JwtTestSupport.AUDIENCE), "user-1");
        HttpHeaders h = bearer(recordingOnly);
        h.setContentType(MediaType.APPLICATION_JSON);
        assertEquals(403, rest.exchange("/api/v1/interviews/iv-1/transcribe", HttpMethod.POST,
                new HttpEntity<>("{\"sourceObjectKey\":\"iv-1/rec-x\"}", h), String.class)
                .getStatusCode().value());
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
    void chunked_upload_without_content_length_is_411() throws Exception {
        String token = JWT.token("api-tenant-a", "recruiter-1");
        java.net.HttpURLConnection conn = (java.net.HttpURLConnection) java.net.URI.create(
                rest.getRootUri() + "/api/v1/interviews/iv-chunk/recordings").toURL().openConnection();
        conn.setRequestMethod("POST");
        conn.setDoOutput(true);
        conn.setChunkedStreamingMode(64); // Content-Length başlığı GÖNDERİLMEZ
        conn.setRequestProperty("Authorization", "Bearer " + token);
        conn.setRequestProperty("Content-Type", "audio/wav");
        try (var os = conn.getOutputStream()) {
            os.write("RIFFxxxxWAVE".getBytes(StandardCharsets.UTF_8));
        }
        assertEquals(411, conn.getResponseCode(), "chunked/Content-Length'siz upload fail-closed 411");
        conn.disconnect();
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

    // ---- 39d-8: export/receipt GET matcher + EXPORT_READ least-privilege ----

    private String roleToken(String role, String subject) {
        // scope-only → JwtTestSupport resource_access'i aynı rolle türetir (entitled persona)
        return JWT.token(Map.of("tenant", "t-export", "scope", role),
                JwtTestSupport.ISSUER, List.of(JwtTestSupport.AUDIENCE), subject);
    }

    @Test
    void export_receipt_without_token_is_401() {
        ResponseEntity<String> r = rest.exchange(
                "/api/v1/interviews/iv-1/export/receipt?caseKey=case-1",
                HttpMethod.GET, HttpEntity.EMPTY, String.class);
        assertEquals(401, r.getStatusCode().value());
    }

    @Test
    void unrelated_role_cannot_read_export_receipt() {
        ResponseEntity<String> r = rest.exchange(
                "/api/v1/interviews/iv-1/export/receipt?caseKey=case-1",
                HttpMethod.GET, new HttpEntity<>(bearer(roleToken("ats.review.read", "reviewer-1"))),
                String.class);
        assertEquals(403, r.getStatusCode().value());
    }

    @Test
    void export_read_passes_matcher_and_reaches_service() {
        // Vaka fixture'da yok — 404 dönmesi security-filter'ın GEÇİLDİĞİNİ kanıtlar
        // (matcher kaybolsaydı denyAll→403 olurdu; 39d-8 regresyon dersi).
        ResponseEntity<String> r = rest.exchange(
                "/api/v1/interviews/iv-missing/export/receipt?caseKey=case-missing",
                HttpMethod.GET, new HttpEntity<>(bearer(roleToken("ats.export.read", "auditor-1"))),
                String.class);
        assertEquals(404, r.getStatusCode().value());
    }

    @Test
    void export_write_can_also_reach_receipt_endpoint() {
        ResponseEntity<String> r = rest.exchange(
                "/api/v1/interviews/iv-missing/export/receipt?caseKey=case-missing",
                HttpMethod.GET, new HttpEntity<>(bearer(roleToken("ats.export.write", "exporter-1"))),
                String.class);
        assertEquals(404, r.getStatusCode().value());
    }

    @Test
    void export_read_cannot_post_export() {
        HttpHeaders h = bearer(roleToken("ats.export.read", "auditor-1"));
        h.setContentType(MediaType.APPLICATION_JSON);
        ResponseEntity<String> r = rest.exchange(
                "/api/v1/interviews/iv-1/export",
                HttpMethod.POST, new HttpEntity<>("{}", h), String.class);
        assertEquals(403, r.getStatusCode().value(), "salt-okuma rolü export ÜRETEMEZ");
    }

    // ---- 39d-8c: receipt controller-contract hijyeni (Codex backlog) ----

    @Test
    void export_receipt_rejects_blank_oversize_and_control_char_case_keys_with_contract_body() {
        String token = roleToken("ats.export.read", "auditor-1");
        ResponseEntity<String> blank = rest.exchange(
                URI.create("/api/v1/interviews/iv-1/export/receipt?caseKey=%20"),
                HttpMethod.GET, new HttpEntity<>(bearer(token)), String.class);
        assertEquals(400, blank.getStatusCode().value());
        assertTrue(blank.getBody() != null && blank.getBody().contains("\"error\":\"INVALID\""),
                "hata gövdesi {error,reason} kontratında olmalı: " + blank.getBody());
        assertEquals(400, rest.exchange(
                "/api/v1/interviews/iv-1/export/receipt",
                HttpMethod.GET, new HttpEntity<>(bearer(token)), String.class)
                .getStatusCode().value());
        assertEquals(400, rest.exchange(
                "/api/v1/interviews/iv-1/export/receipt?caseKey=" + "a".repeat(513),
                HttpMethod.GET, new HttpEntity<>(bearer(token)), String.class)
                .getStatusCode().value());
        // 512 karakter length-gate'i GEÇER (vaka yok → 404; sınır exact 512):
        assertEquals(404, rest.exchange(
                "/api/v1/interviews/iv-1/export/receipt?caseKey=" + "a".repeat(512),
                HttpMethod.GET, new HttpEntity<>(bearer(token)), String.class)
                .getStatusCode().value());
        assertEquals(400, rest.exchange(
                URI.create("/api/v1/interviews/iv-1/export/receipt?caseKey=ab%01cd"),
                HttpMethod.GET, new HttpEntity<>(bearer(token)), String.class)
                .getStatusCode().value());
    }

    @Test
    void export_receipt_decodes_slash_case_key_and_reaches_service() {
        // '/' içeren opak caseKey encode'lu query-param'la SERVICE'e ulaşır
        // (404 = decode + lookup çalıştı; 400 preflight'a TAKILMADI):
        ResponseEntity<String> r = rest.exchange(
                URI.create("/api/v1/interviews/iv-1/export/receipt?caseKey=i1%2Fcase-77"),
                HttpMethod.GET,
                new HttpEntity<>(bearer(roleToken("ats.export.read", "auditor-1"))),
                String.class);
        assertEquals(404, r.getStatusCode().value());
    }

    @Test
    void export_receipt_error_responses_are_no_store() {
        // Hata gövdeleri de opak ref/reason taşır — HİÇBİR varyant cache'lenmez:
        String token = roleToken("ats.export.read", "auditor-1");
        ResponseEntity<String> notFound = rest.exchange(
                "/api/v1/interviews/iv-1/export/receipt?caseKey=case-yok",
                HttpMethod.GET, new HttpEntity<>(bearer(token)), String.class);
        assertEquals(404, notFound.getStatusCode().value());
        assertEquals("no-store", notFound.getHeaders().getFirst("Cache-Control"));
        assertEquals("no-cache", notFound.getHeaders().getFirst("Pragma"));
        ResponseEntity<String> bad = rest.exchange(
                URI.create("/api/v1/interviews/iv-1/export/receipt?caseKey=%20"),
                HttpMethod.GET, new HttpEntity<>(bearer(token)), String.class);
        assertEquals("no-store", bad.getHeaders().getFirst("Cache-Control"));
    }

    // ---- 39d-11: export/repair POST matcher (AYRI yetki — EXPORT_WRITE YETMEZ) ----

    @Test
    void export_repair_requires_dedicated_authority_not_write_or_read() {
        HttpHeaders wh = bearer(roleToken("ats.export.write", "exporter-1"));
        wh.setContentType(MediaType.APPLICATION_JSON);
        assertEquals(403, rest.exchange("/api/v1/interviews/iv-1/export/repair",
                HttpMethod.POST, new HttpEntity<>("{\"caseKey\":\"c\"}", wh), String.class)
                .getStatusCode().value(), "EXPORT_WRITE repair YAPAMAZ (onay-kapısı)");
        HttpHeaders rh = bearer(roleToken("ats.export.read", "auditor-1"));
        rh.setContentType(MediaType.APPLICATION_JSON);
        assertEquals(403, rest.exchange("/api/v1/interviews/iv-1/export/repair",
                HttpMethod.POST, new HttpEntity<>("{\"caseKey\":\"c\"}", rh), String.class)
                .getStatusCode().value());
        assertEquals(401, rest.exchange("/api/v1/interviews/iv-1/export/repair",
                HttpMethod.POST, HttpEntity.EMPTY, String.class).getStatusCode().value());
    }

    @Test
    void export_repair_scope_passes_matcher_and_cannot_do_normal_export() {
        HttpHeaders h = bearer(roleToken("ats.export.repair", "repair-op-1"));
        h.setContentType(MediaType.APPLICATION_JSON);
        ResponseEntity<String> r = rest.exchange("/api/v1/interviews/iv-missing/export/repair",
                HttpMethod.POST, new HttpEntity<>("{\"caseKey\":\"case-missing\"}", h), String.class);
        assertEquals(404, r.getStatusCode().value(), "fixture yok → 404 = filter GEÇİLDİ kanıtı");
        assertEquals("no-store", r.getHeaders().getFirst("Cache-Control"));
        assertEquals(403, rest.exchange("/api/v1/interviews/iv-1/export",
                HttpMethod.POST, new HttpEntity<>("{}", h), String.class).getStatusCode().value(),
                "repair-token normal export ÜRETEMEZ (least-privilege)");
        ResponseEntity<String> bad = rest.exchange("/api/v1/interviews/iv-1/export/repair",
                HttpMethod.POST, new HttpEntity<>("{\"caseKey\":\" \"}", h), String.class);
        assertEquals(400, bad.getStatusCode().value());
        assertEquals("no-store", bad.getHeaders().getFirst("Cache-Control"));
    }

    // ---- 39d-9: export/artifact GET matcher (EXPORT_READ|EXPORT_WRITE; HEAD YOK) ----

    @Test
    void export_artifact_without_token_is_401() {
        assertEquals(401, rest.exchange(
                "/api/v1/interviews/iv-1/export/artifact?caseKey=case-1",
                HttpMethod.GET, HttpEntity.EMPTY, String.class).getStatusCode().value());
    }

    @Test
    void unrelated_role_cannot_read_export_artifact() {
        assertEquals(403, rest.exchange(
                "/api/v1/interviews/iv-1/export/artifact?caseKey=case-1",
                HttpMethod.GET, new HttpEntity<>(bearer(roleToken("ats.review.read", "reviewer-1"))),
                String.class).getStatusCode().value());
    }

    @Test
    void export_artifact_read_scope_passes_matcher_and_reaches_service() {
        // Vaka fixture'da yok — 404 = filter GEÇİLDİ kanıtı (matcher-kayıp = 403).
        ResponseEntity<String> r = rest.exchange(
                "/api/v1/interviews/iv-missing/export/artifact?caseKey=case-missing",
                HttpMethod.GET, new HttpEntity<>(bearer(roleToken("ats.export.read", "auditor-1"))),
                String.class);
        assertEquals(404, r.getStatusCode().value());
        assertEquals("no-store", r.getHeaders().getFirst("Cache-Control"));
        assertEquals("no-cache", r.getHeaders().getFirst("Pragma"));
    }

    @Test
    void export_artifact_head_is_denied_by_design() {
        // HEAD BİLEREK desteklenmez (artifact-existence oracle'ı): matcher GET-only,
        // HEAD anyRequest denyAll'a düşer → 403 (yetkili read-scope'ta bile).
        assertEquals(403, rest.exchange(
                "/api/v1/interviews/iv-1/export/artifact?caseKey=case-1",
                HttpMethod.HEAD, new HttpEntity<>(bearer(roleToken("ats.export.read", "auditor-1"))),
                String.class).getStatusCode().value());
    }

    @Test
    void export_artifact_rejects_blank_case_key_with_contract_body_and_no_store() {
        ResponseEntity<String> bad = rest.exchange(
                URI.create("/api/v1/interviews/iv-1/export/artifact?caseKey=%20"),
                HttpMethod.GET, new HttpEntity<>(bearer(roleToken("ats.export.read", "auditor-1"))),
                String.class);
        assertEquals(400, bad.getStatusCode().value());
        assertTrue(bad.getBody() != null && bad.getBody().contains("\"error\":\"INVALID\""),
                "hata gövdesi {error,reason} kontratında olmalı: " + bad.getBody());
        assertEquals("no-store", bad.getHeaders().getFirst("Cache-Control"));
        assertEquals("no-cache", bad.getHeaders().getFirst("Pragma"));
    }
}
