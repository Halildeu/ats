package com.ats.app;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayOutputStream;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.time.Instant;
import java.util.UUID;
import javax.sql.DataSource;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts.FontName;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
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

/** Real HTTP + PDFBox + PostgreSQL candidate resume import product acceptance. */
@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@org.springframework.context.annotation.Import(WormGovernanceTestSeed.class)
class ResumeImportApiTest {

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
        registry.add("ats.authorization.allow-legacy-authorities", () -> "true");
        AiGovernanceTestSupport.registerHttpJson(registry);
    }

    @AfterAll static void stopJwks() { JWT.stop(); }

    @Autowired private TestRestTemplate rest;
    @Autowired private ObjectMapper json;
    @Autowired private DataSource ds;

    @Test
    void pdf_proposals_are_candidate_controlled_confirmed_and_purged() throws Exception {
        String token = "R".repeat(43);
        HttpHeaders createHeaders = jsonHeaders(token, "create-" + UUID.randomUUID());
        String createBody = """
                {"noticeVersion":"candidate-resume-import-v1","noticeAcceptedAt":"%s"}
                """.formatted(Instant.now());
        ResponseEntity<String> create = rest.exchange(
                "/api/v1/careers/acik/jobs/urun-yoneticisi/resume-imports",
                HttpMethod.POST, new HttpEntity<>(createBody, createHeaders), String.class);
        assertEquals(201, create.getStatusCode().value(), create.getBody());
        JsonNode created = json.readTree(create.getBody());
        String importId = created.path("importId").asText();
        assertTrue(importId.startsWith("ri_"));
        assertEquals("ACTIVE", created.path("state").asText());
        assertEquals(0, created.path("version").asInt());

        byte[] pdf = pdf(
                "Ad Soyad: Deniz Sentetik",
                "E-posta: deniz.resume@example.test",
                "Telefon: +90 555 000 00 00",
                "Sehir: Istanbul",
                "Dogum Tarihi: 1990-01-01",
                "Deneyim: Urun Uzmani - Ornek Teknoloji",
                "Egitim: Ornek Universitesi",
                "Beceriler: urun kesfi, analitik");
        HttpHeaders uploadHeaders = new HttpHeaders();
        uploadHeaders.setContentType(MediaType.APPLICATION_PDF);
        uploadHeaders.set("X-ATS-Candidate-Access", token);
        uploadHeaders.set("X-ATS-Idempotency-Key", "upload-" + UUID.randomUUID());
        uploadHeaders.set("X-ATS-Expected-Version", "0");
        ResponseEntity<String> upload = rest.exchange(
                "/api/v1/candidate/resume-imports/" + importId + "/document",
                HttpMethod.PUT, new HttpEntity<>(pdf, uploadHeaders), String.class);
        assertEquals(201, upload.getStatusCode().value(), upload.getBody());
        JsonNode uploaded = json.readTree(upload.getBody());
        assertEquals(1, uploaded.path("version").asInt());
        assertTrue(uploaded.path("protectedSuppressed").asInt() >= 1);
        assertEquals(0, uploaded.path("unsupportedOutput").asInt());
        assertTrue(uploaded.path("proposals").size() >= 6);
        assertFalse(upload.getBody().contains("1990-01-01"));

        String emailField = findField(uploaded, "email");
        ResponseEntity<String> accepted = mutateField(
                importId, token, "email", 1, "ACCEPTED", null);
        assertEquals(200, accepted.getStatusCode().value(), accepted.getBody());
        JsonNode acceptedJson = json.readTree(accepted.getBody());
        assertEquals(2, acceptedJson.path("version").asInt());

        ResponseEntity<String> edited = mutateField(
                importId, token, "experience", 2, "EDITED", "Düzenlenmiş sentetik deneyim");
        assertEquals(200, edited.getStatusCode().value(), edited.getBody());
        assertEquals(3, json.readTree(edited.getBody()).path("version").asInt());

        HttpHeaders confirmHeaders = jsonHeaders(token, null);
        ResponseEntity<String> confirmed = rest.exchange(
                "/api/v1/candidate/resume-imports/" + importId + "/confirm",
                HttpMethod.POST, new HttpEntity<>("{\"expectedVersion\":3}", confirmHeaders),
                String.class);
        assertEquals(200, confirmed.getStatusCode().value(), confirmed.getBody());
        JsonNode confirmedJson = json.readTree(confirmed.getBody());
        assertEquals("CONFIRMED", confirmedJson.path("resumeImport").path("state").asText());
        assertEquals(0, confirmedJson.path("resumeImport").path("proposals").size());
        assertEquals(emailField, confirmedJson.path("draft").path("fields").path("email").asText());
        assertEquals("Düzenlenmiş sentetik deneyim",
                confirmedJson.path("draft").path("fields").path("experience").asText());
        assertFalse(confirmedJson.path("draft").path("fields").has("education"),
                "UNREVIEWED öneri forma geçmez");

        String applicationBody = applicationPayload(
                "Deniz Sentetik", emailField, "Düzenlenmiş sentetik deneyim",
                importId, confirmedJson.path("draft").path("version").asInt());
        HttpHeaders submitHeaders = jsonHeaders(token, "submit-" + UUID.randomUUID());
        ResponseEntity<String> submitted = rest.exchange(
                "/api/v1/careers/acik/jobs/urun-yoneticisi/applications",
                HttpMethod.POST, new HttpEntity<>(applicationBody, submitHeaders), String.class);
        assertEquals(201, submitted.getStatusCode().value(), submitted.getBody());
        String publicRef = json.readTree(submitted.getBody()).path("publicRef").asText();

        try (Connection c = ds.getConnection()) {
            assertEquals(0, scalar(c,
                    "SELECT count(*) FROM ats_resume_proposal WHERE import_id=?", importId));
            assertEquals(2, scalar(c, """
                    SELECT count(*) FROM ats_candidate_draft_field f
                    JOIN ats_candidate_draft d ON d.tenant_id=f.tenant_id AND d.draft_id=f.draft_id
                    WHERE d.import_id=?
                    """, importId));
            assertEquals(1, scalar(c, """
                    SELECT count(*) FROM ats_candidate_draft
                     WHERE import_id=? AND consumed_application_id IS NOT NULL
                    """, importId));
            try (PreparedStatement ps = c.prepareStatement("""
                    SELECT application_source, resume_import_id
                      FROM ats_application WHERE public_ref=?
                    """)) {
                ps.setString(1, publicRef);
                try (ResultSet rs = ps.executeQuery()) {
                    assertTrue(rs.next());
                    assertEquals("PDF_CONFIRMED", rs.getString("application_source"));
                    assertEquals(importId, rs.getString("resume_import_id"));
                }
            }
        }

        submitHeaders.set("X-ATS-Idempotency-Key", "submit-" + UUID.randomUUID());
        assertEquals(400, rest.exchange(
                "/api/v1/careers/acik/jobs/urun-yoneticisi/applications",
                HttpMethod.POST, new HttpEntity<>(applicationBody, submitHeaders), String.class)
                .getStatusCode().value(), "tüketilmiş taslak ikinci başvuruda kullanılamaz");

        HttpHeaders wrong = new HttpHeaders();
        wrong.set("X-ATS-Candidate-Access", "W".repeat(43));
        assertEquals(404, rest.exchange(
                "/api/v1/candidate/resume-imports/" + importId, HttpMethod.GET,
                new HttpEntity<>(wrong), String.class).getStatusCode().value());
    }

    @Test
    void manual_submit_cancels_active_import_purges_proposals_and_records_source() throws Exception {
        String token = "M".repeat(43);
        ResponseEntity<String> create = rest.exchange(
                "/api/v1/jobs/product-designer/resume-imports", HttpMethod.POST,
                new HttpEntity<>("{\"noticeVersion\":\"candidate-resume-import-v1\","
                        + "\"noticeAcceptedAt\":\"" + Instant.now() + "\"}",
                        jsonHeaders(token, "create-" + UUID.randomUUID())), String.class);
        assertEquals(201, create.getStatusCode().value(), create.getBody());
        String importId = json.readTree(create.getBody()).path("importId").asText();

        HttpHeaders uploadHeaders = new HttpHeaders();
        uploadHeaders.setContentType(MediaType.APPLICATION_PDF);
        uploadHeaders.set("X-ATS-Candidate-Access", token);
        uploadHeaders.set("X-ATS-Expected-Version", "0");
        uploadHeaders.set("X-ATS-Idempotency-Key", "upload-" + UUID.randomUUID());
        ResponseEntity<String> upload = rest.exchange(
                "/api/v1/candidate/resume-imports/" + importId + "/document", HttpMethod.PUT,
                new HttpEntity<>(pdf(
                        "E-posta: manual.after@example.test",
                        "Deneyim: Manuel devam sentetik deneyim"), uploadHeaders), String.class);
        assertEquals(201, upload.getStatusCode().value(), upload.getBody());

        HttpHeaders submitHeaders = jsonHeaders(token, "submit-" + UUID.randomUUID());
        ResponseEntity<String> submitted = rest.exchange(
                "/api/v1/jobs/product-designer/applications", HttpMethod.POST,
                new HttpEntity<>(applicationPayload(
                        "Manuel Devam", "manual.after@example.test",
                        "Manuel devam sentetik deneyim", null, null), submitHeaders), String.class);
        assertEquals(201, submitted.getStatusCode().value(), submitted.getBody());
        String publicRef = json.readTree(submitted.getBody()).path("publicRef").asText();

        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement("""
                SELECT a.application_source, a.resume_import_id, i.state,
                       (SELECT count(*) FROM ats_resume_proposal p
                         WHERE p.tenant_id=i.tenant_id AND p.import_id=i.import_id) proposal_count
                  FROM ats_application a
                  JOIN ats_resume_import i
                    ON i.tenant_id=a.tenant_id AND i.import_id=a.resume_import_id
                 WHERE a.public_ref=?
                """)) {
            ps.setString(1, publicRef);
            try (ResultSet rs = ps.executeQuery()) {
                assertTrue(rs.next());
                assertEquals("MANUAL_AFTER_IMPORT", rs.getString("application_source"));
                assertEquals(importId, rs.getString("resume_import_id"));
                assertEquals("CANCELLED", rs.getString("state"));
                assertEquals(0, rs.getInt("proposal_count"));
            }
        }
    }

    @Test
    void candidate_can_explicitly_replace_pdf_without_extending_import_ttl() throws Exception {
        String token = "P".repeat(43);
        ResponseEntity<String> create = rest.exchange(
                "/api/v1/jobs/product-designer/resume-imports", HttpMethod.POST,
                new HttpEntity<>("{\"noticeVersion\":\"candidate-resume-import-v1\","
                        + "\"noticeAcceptedAt\":\"" + Instant.now() + "\"}",
                        jsonHeaders(token, "create-" + UUID.randomUUID())), String.class);
        assertEquals(201, create.getStatusCode().value(), create.getBody());
        JsonNode created = json.readTree(create.getBody());
        String importId = created.path("importId").asText();

        HttpHeaders uploadHeaders = new HttpHeaders();
        uploadHeaders.setContentType(MediaType.APPLICATION_PDF);
        uploadHeaders.set("X-ATS-Candidate-Access", token);
        uploadHeaders.set("X-ATS-Expected-Version", "0");
        uploadHeaders.set("X-ATS-Idempotency-Key", "upload-" + UUID.randomUUID());
        ResponseEntity<String> first = rest.exchange(
                "/api/v1/candidate/resume-imports/" + importId + "/document", HttpMethod.PUT,
                new HttpEntity<>(pdf("E-posta: replace.one@example.test",
                        "Deneyim: Eski sentetik deneyim"), uploadHeaders), String.class);
        assertEquals(201, first.getStatusCode().value(), first.getBody());
        JsonNode firstJson = json.readTree(first.getBody());
        String immutableExpiry = firstJson.path("expiresAt").asText();
        assertFalse(firstJson.path("firstUploadAt").asText().isBlank());

        ResponseEntity<String> replaced = rest.exchange(
                "/api/v1/candidate/resume-imports/" + importId + "/document/replace",
                HttpMethod.POST,
                new HttpEntity<>("{\"expectedVersion\":1}", jsonHeaders(token, null)),
                String.class);
        assertEquals(200, replaced.getStatusCode().value(), replaced.getBody());
        JsonNode replacedJson = json.readTree(replaced.getBody());
        assertEquals(2, replacedJson.path("version").asInt());
        assertEquals(2, replacedJson.path("documentVersion").asInt());
        assertEquals(0, replacedJson.path("proposals").size());
        assertEquals(immutableExpiry, replacedJson.path("expiresAt").asText());

        uploadHeaders.set("X-ATS-Expected-Version", "2");
        uploadHeaders.set("X-ATS-Idempotency-Key", "upload-" + UUID.randomUUID());
        ResponseEntity<String> second = rest.exchange(
                "/api/v1/candidate/resume-imports/" + importId + "/document", HttpMethod.PUT,
                new HttpEntity<>(pdf("E-posta: replace.two@example.test",
                        "Deneyim: Yeni sentetik deneyim"), uploadHeaders), String.class);
        assertEquals(201, second.getStatusCode().value(), second.getBody());
        JsonNode secondJson = json.readTree(second.getBody());
        assertEquals(2, secondJson.path("documentVersion").asInt());
        assertEquals(immutableExpiry, secondJson.path("expiresAt").asText());
    }

    @Test
    void real_email_eicar_bad_magic_and_stale_version_fail_closed() throws Exception {
        String token = "S".repeat(43);
        HttpHeaders createHeaders = jsonHeaders(token, "create-" + UUID.randomUUID());
        ResponseEntity<String> create = rest.exchange(
                "/api/v1/jobs/product-designer/resume-imports", HttpMethod.POST,
                new HttpEntity<>("{\"noticeVersion\":\"candidate-resume-import-v1\","
                        + "\"noticeAcceptedAt\":\"" + Instant.now() + "\"}", createHeaders),
                String.class);
        String importId = json.readTree(create.getBody()).path("importId").asText();

        HttpHeaders pdfHeaders = new HttpHeaders();
        pdfHeaders.setContentType(MediaType.APPLICATION_PDF);
        pdfHeaders.set("X-ATS-Candidate-Access", token);
        pdfHeaders.set("X-ATS-Expected-Version", "0");
        pdfHeaders.set("X-ATS-Idempotency-Key", "upload-" + UUID.randomUUID());
        ResponseEntity<String> real = rest.exchange(
                "/api/v1/candidate/resume-imports/" + importId + "/document", HttpMethod.PUT,
                new HttpEntity<>(pdf("E-posta: person@example.com", "Deneyim: Test"), pdfHeaders),
                String.class);
        assertEquals(409, real.getStatusCode().value(), real.getBody());
        assertEquals("UNSUPPORTED_IN_GATE", json.readTree(real.getBody()).path("error").asText());

        byte[] eicarPdf = "%PDF-X5O!P%@AP synthetic".getBytes(java.nio.charset.StandardCharsets.US_ASCII);
        pdfHeaders.set("X-ATS-Idempotency-Key", "upload-" + UUID.randomUUID());
        assertEquals(400, rest.exchange(
                "/api/v1/candidate/resume-imports/" + importId + "/document", HttpMethod.PUT,
                new HttpEntity<>(eicarPdf, pdfHeaders), String.class).getStatusCode().value());

        pdfHeaders.setContentType(MediaType.APPLICATION_OCTET_STREAM);
        assertEquals(415, rest.exchange(
                "/api/v1/candidate/resume-imports/" + importId + "/document", HttpMethod.PUT,
                new HttpEntity<>("not-pdf".getBytes(), pdfHeaders), String.class).getStatusCode().value());

        ResponseEntity<String> stale = mutateField(
                importId, token, "email", 99, "ACCEPTED", null);
        assertTrue(stale.getStatusCode().value() == 404 || stale.getStatusCode().value() == 409,
                stale.getBody());
    }

    private ResponseEntity<String> mutateField(
            String importId, String token, String field, int version,
            String state, String editedValue) {
        HttpHeaders headers = jsonHeaders(token, null);
        String body = editedValue == null
                ? "{\"expectedVersion\":" + version + ",\"state\":\"" + state + "\"}"
                : "{\"expectedVersion\":" + version + ",\"state\":\"" + state
                        + "\",\"editedValue\":\"" + editedValue + "\"}";
        return rest.exchange(
                "/api/v1/candidate/resume-imports/" + importId + "/fields/" + field,
                HttpMethod.PUT, new HttpEntity<>(body, headers), String.class);
    }

    private static HttpHeaders jsonHeaders(String token, String idempotency) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("X-ATS-Candidate-Access", token);
        if (idempotency != null) headers.set("X-ATS-Idempotency-Key", idempotency);
        return headers;
    }

    private static String findField(JsonNode importView, String field) {
        for (JsonNode proposal : importView.path("proposals")) {
            if (field.equals(proposal.path("field").asText())) {
                return proposal.path("proposedValue").asText();
            }
        }
        throw new AssertionError("proposal field missing: " + field);
    }

    private static String applicationPayload(
            String fullName,
            String email,
            String experience,
            String resumeImportId,
            Integer resumeDraftVersion) {
        String resumeBinding = resumeImportId == null ? "" : """
                ,"resumeImportId":"%s","resumeDraftVersion":%d
                """.formatted(resumeImportId, resumeDraftVersion).trim();
        String now = Instant.now().toString();
        return """
                {"fullName":"%s","email":"%s","phone":"+90 555 000 00 00",
                 "city":"Istanbul","summary":"Sentetik ürün özeti ve aday açıklaması",
                 "experience":"%s","education":"Ornek Universitesi",
                 "skills":["urun kesfi","analitik"],
                 "noticeVersion":"kvkk-application-v1","noticeAcceptedAt":"%s",
                 "accuracyConfirmedAt":"%s"%s}
                """.formatted(fullName, email, experience, now, now, resumeBinding);
    }

    private static byte[] pdf(String... lines) throws Exception {
        try (PDDocument document = new PDDocument(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            PDPage page = new PDPage();
            document.addPage(page);
            try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                content.beginText();
                content.setFont(new PDType1Font(FontName.HELVETICA), 10);
                content.setLeading(14);
                content.newLineAtOffset(48, 760);
                for (String line : lines) {
                    content.showText(line);
                    content.newLine();
                }
                content.endText();
            }
            document.save(out);
            return out.toByteArray();
        }
    }

    private static long scalar(Connection c, String sql, String importId) throws Exception {
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, importId);
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                return rs.getLong(1);
            }
        }
    }
}
