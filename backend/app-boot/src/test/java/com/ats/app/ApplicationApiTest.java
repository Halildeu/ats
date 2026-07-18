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
        registry.add("ats.authorization.allow-legacy-authorities", () -> "true");
        // Bu sınıf aynı loopback istemcisiyle birden çok bağımsız müşteri
        // yolculuğu doğrular. Production varsayılanı 10 olarak kalır; limiter
        // davranışı kendi bounded birim testlerinde ayrıca doğrulanır.
        registry.add("ats.application.rate-limit.limit", () -> "100");
        AiGovernanceTestSupport.registerHttpJson(registry);
    }

    @AfterAll static void stopJwks() { JWT.stop(); }

    @Autowired private TestRestTemplate rest;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private DataSource ds;

    @Test
    void public_submit_candidate_tracking_and_tenant_recruiter_flow_is_persistent() throws Exception {
        try (Connection c = ds.getConnection();
             PreparedStatement site = c.prepareStatement("""
                     INSERT INTO ats_career_site
                         (tenant_id, public_handle, display_name, active, created_by, updated_by,
                          created_at, updated_at)
                     VALUES ('other-tenant', 'other-careers', 'Other Careers', true,
                             'test', 'test', now(), now())
                     ON CONFLICT (tenant_id) DO NOTHING
                     """);
             PreparedStatement job = c.prepareStatement("""
                     INSERT INTO ats_job_posting
                         (tenant_id, job_id, slug, title, team, location, mode,
                          employment_type, summary, highlights, published)
                     VALUES ('other-tenant', 'other-job', 'urun-yoneticisi', 'SIZMAMALI',
                             'Other', 'Other', 'Other', 'Other', 'Other', '[]'::jsonb, true)
                     ON CONFLICT DO NOTHING
                     """)) {
            site.executeUpdate();
            job.executeUpdate();
        }
        ResponseEntity<String> jobs = rest.getForEntity("/api/v1/jobs", String.class);
        assertEquals(200, jobs.getStatusCode().value());
        assertEquals(3, objectMapper.readTree(jobs.getBody()).size());
        assertFalse(jobs.getBody().contains("SIZMAMALI"), "public katalog tenant disina sizmaz");
        ResponseEntity<String> canonicalJobs = rest.getForEntity(
                "/api/v1/careers/acik/jobs", String.class);
        assertEquals(200, canonicalJobs.getStatusCode().value());
        assertEquals(objectMapper.readTree(jobs.getBody()),
                objectMapper.readTree(canonicalJobs.getBody()));
        assertEquals(404, rest.getForEntity(
                "/api/v1/careers/bilinmeyen/jobs", String.class).getStatusCode().value());

        String acceptedAt = Instant.now().toString();
        String payload = payload("Deniz Sentetik", acceptedAt);
        String idempotency = "idem-" + UUID.randomUUID();
        String submittedAccessToken = "A".repeat(43);
        HttpHeaders submitHeaders = json();
        submitHeaders.set("X-ATS-Idempotency-Key", idempotency);
        submitHeaders.set("X-ATS-Candidate-Access", submittedAccessToken);
        ResponseEntity<String> submit = rest.exchange(
                "/api/v1/careers/acik/jobs/urun-yoneticisi/applications", HttpMethod.POST,
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
        JsonNode summaryItem = inboxBody.path("items").get(0);
        assertEquals("Deniz Sentetik", summaryItem.path("fullName").asText());
        assertFalse(summaryItem.has("phone"));
        assertFalse(summaryItem.has("linkedIn"));
        assertFalse(summaryItem.has("portfolio"));
        assertFalse(summaryItem.has("summary"));
        assertFalse(summaryItem.has("experience"));
        assertFalse(summaryItem.has("education"));
        assertFalse(summaryItem.has("note"), "inbox projection gereksiz PII taşımamalı");

        String otherTenant = token("other-tenant", "ats.application.read", "other-recruiter");
        JsonNode otherInbox = objectMapper.readTree(rest.exchange(
                "/api/v1/recruiter/applications", HttpMethod.GET,
                new HttpEntity<>(bearer(otherTenant)), String.class).getBody());
        assertEquals(0, otherInbox.path("total").asInt(), "cross-tenant varlık sızmaz");

        String writeToken = token(TENANT, "ats.application.status.write", "recruiter-write");
        HttpHeaders statusHeaders = bearer(writeToken);
        statusHeaders.setContentType(MediaType.APPLICATION_JSON);
        ResponseEntity<String> missingVersion = rest.exchange(
                "/api/v1/recruiter/applications/" + publicRef + "/status", HttpMethod.PUT,
                new HttpEntity<>("{\"toStatus\":\"UNDER_REVIEW\"}", statusHeaders),
                String.class);
        assertEquals(400, missingVersion.getStatusCode().value(), missingVersion.getBody());
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
        huge.set("X-ATS-Idempotency-Key", "idem-" + UUID.randomUUID());
        assertEquals(413, rest.exchange(
                "/api/v1/careers/acik/jobs/senior-frontend-developer/applications",
                HttpMethod.POST, new HttpEntity<>(oversized, huge), String.class)
                .getStatusCode().value(), "canonical kariyer yolu aynı body limitini uygular");
    }

    @Test
    void canonical_submit_rejects_optional_fields_disabled_by_the_locked_job() throws Exception {
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement("""
                INSERT INTO ats_job_posting
                    (tenant_id, job_id, slug, title, team, location, mode,
                     employment_type, summary, highlights, published, application_fields)
                VALUES (?, 'restricted-fields-job', 'restricted-fields', 'Kısıtlı Form İlanı',
                        'Ürün', 'Türkiye', 'Uzaktan', 'Tam zamanlı',
                        'Yalnız zorunlu aday alanlarını isteyen sentetik ilan.', '[]'::jsonb, true,
                        '["fullName","email","phone","city","summary","experience","education","skills"]'::jsonb)
                ON CONFLICT DO NOTHING
                """)) {
            ps.setString(1, TENANT);
            ps.executeUpdate();
        }

        String acceptedAt = Instant.now().toString();
        HttpHeaders rejectedHeaders = json();
        rejectedHeaders.set("X-ATS-Idempotency-Key", "restricted-fields-rejected-01");
        rejectedHeaders.set("X-ATS-Candidate-Access", "R".repeat(43));
        ResponseEntity<String> rejected = rest.exchange(
                "/api/v1/careers/acik/jobs/restricted-fields/applications", HttpMethod.POST,
                new HttpEntity<>(payload("Alan İhlali", acceptedAt), rejectedHeaders), String.class);
        assertEquals(400, rejected.getStatusCode().value(), rejected.getBody());
        assertEquals(0, scalar("SELECT count(*) FROM ats_application WHERE job_id = ?",
                "restricted-fields-job"));

        var allowedBody = (com.fasterxml.jackson.databind.node.ObjectNode)
                objectMapper.readTree(payload("İzinli Alan", acceptedAt));
        allowedBody.remove(List.of("linkedIn", "portfolio", "note"));
        HttpHeaders acceptedHeaders = json();
        acceptedHeaders.set("X-ATS-Idempotency-Key", "restricted-fields-accepted-01");
        acceptedHeaders.set("X-ATS-Candidate-Access", "S".repeat(43));
        ResponseEntity<String> accepted = rest.exchange(
                "/api/v1/careers/acik/jobs/restricted-fields/applications", HttpMethod.POST,
                new HttpEntity<>(allowedBody.toString(), acceptedHeaders), String.class);
        assertEquals(201, accepted.getStatusCode().value(), accepted.getBody());
        assertEquals(1, scalar("SELECT count(*) FROM ats_application WHERE job_id = ?",
                "restricted-fields-job"));
    }

    @Test
    void recruiter_detail_immutable_human_evaluation_history_and_candidate_withdrawal_are_real()
            throws Exception {
        String acceptedAt = Instant.now().toString();
        HttpHeaders submitHeaders = json();
        submitHeaders.set("X-ATS-Idempotency-Key", "pipeline-submit-key-001");
        submitHeaders.set("X-ATS-Candidate-Access", "E".repeat(43));
        ResponseEntity<String> submit = rest.exchange(
                "/api/v1/jobs/senior-frontend-developer/applications", HttpMethod.POST,
                new HttpEntity<>(payload("Pipeline Adayı", acceptedAt), submitHeaders), String.class);
        assertEquals(201, submit.getStatusCode().value(), submit.getBody());
        String publicRef = objectMapper.readTree(submit.getBody()).path("publicRef").asText();

        HttpHeaders reader = bearer(token(TENANT, "ats.application.read", "pipeline-reader"));
        ResponseEntity<String> detail = rest.exchange(
                "/api/v1/recruiter/applications/" + publicRef, HttpMethod.GET,
                new HttpEntity<>(reader), String.class);
        assertEquals(200, detail.getStatusCode().value(), detail.getBody());
        JsonNode detailBody = objectMapper.readTree(detail.getBody());
        assertEquals("Pipeline Adayı", detailBody.path("application").path("fullName").asText());
        assertEquals(1, detailBody.path("history").size());
        assertEquals("candidate:self", detailBody.path("history").get(0).path("actorRef").asText());
        assertEquals(0, detailBody.path("evaluations").size());
        assertEquals("no-store", detail.getHeaders().getCacheControl());

        assertEquals(404, rest.exchange(
                "/api/v1/recruiter/applications/" + publicRef, HttpMethod.GET,
                new HttpEntity<>(bearer(token("other-tenant", "ats.application.read", "other"))),
                String.class).getStatusCode().value(), "cross-tenant detail existence sızdırmaz");

        String evaluationPayload = objectMapper.writeValueAsString(Map.of(
                "policyVersion", "structured-evaluation-v1",
                "jobRelatednessConfirmed", true,
                "recommendation", "ADVANCE",
                "criteria", List.of(Map.of(
                        "key", "role_clarity",
                        "label", "Rol netliği",
                        "rating", 4,
                        "evidence", "Aday sentetik ürün örneğinde kullanıcı sonucunu açıkça anlattı.")),
                "summary", "İnsan değerlendirmesi tamamlandı; otomatik aşama değişikliği yapılmayacak."));
        HttpHeaders evaluator = bearer(token(
                TENANT, "ats.application.status.write", "pipeline-evaluator"));
        evaluator.setContentType(MediaType.APPLICATION_JSON);
        evaluator.set("X-ATS-Idempotency-Key", "pipeline-evaluation-key-001");
        ResponseEntity<String> evaluated = rest.exchange(
                "/api/v1/recruiter/applications/" + publicRef + "/evaluations", HttpMethod.POST,
                new HttpEntity<>(evaluationPayload, evaluator), String.class);
        assertEquals(201, evaluated.getStatusCode().value(), evaluated.getBody());
        JsonNode evaluation = objectMapper.readTree(evaluated.getBody());
        String evaluationId = evaluation.path("evaluationId").asText();
        assertTrue(evaluationId.startsWith("eval_"));
        assertEquals(1, evaluation.path("revision").asInt());
        assertEquals("structured-evaluation-v1", evaluation.path("policyVersion").asText());
        assertTrue(evaluation.path("jobRelatednessConfirmed").asBoolean());

        var unconfirmedBody = (com.fasterxml.jackson.databind.node.ObjectNode)
                objectMapper.readTree(evaluationPayload);
        unconfirmedBody.put("jobRelatednessConfirmed", false);
        HttpHeaders unconfirmedHeaders = bearer(token(
                TENANT, "ats.application.status.write", "pipeline-evaluator"));
        unconfirmedHeaders.setContentType(MediaType.APPLICATION_JSON);
        unconfirmedHeaders.set("X-ATS-Idempotency-Key", "pipeline-evaluation-unconfirmed");
        assertEquals(400, rest.exchange(
                "/api/v1/recruiter/applications/" + publicRef + "/evaluations", HttpMethod.POST,
                new HttpEntity<>(unconfirmedBody.toString(), unconfirmedHeaders), String.class)
                .getStatusCode().value());

        ResponseEntity<String> replay = rest.exchange(
                "/api/v1/recruiter/applications/" + publicRef + "/evaluations", HttpMethod.POST,
                new HttpEntity<>(evaluationPayload, evaluator), String.class);
        assertEquals(200, replay.getStatusCode().value(), replay.getBody());
        assertEquals("true", replay.getHeaders().getFirst("X-ATS-Replay"));
        assertEquals(evaluationId, objectMapper.readTree(replay.getBody()).path("evaluationId").asText());

        String conflictingPayload = evaluationPayload.replace("ADVANCE", "HOLD");
        assertEquals(409, rest.exchange(
                "/api/v1/recruiter/applications/" + publicRef + "/evaluations", HttpMethod.POST,
                new HttpEntity<>(conflictingPayload, evaluator), String.class)
                .getStatusCode().value());

        HttpHeaders secondRevisionHeaders = bearer(token(
                TENANT, "ats.application.status.write", "pipeline-evaluator"));
        secondRevisionHeaders.setContentType(MediaType.APPLICATION_JSON);
        secondRevisionHeaders.set("X-ATS-Idempotency-Key", "pipeline-evaluation-key-002");
        ResponseEntity<String> missingPredecessor = rest.exchange(
                "/api/v1/recruiter/applications/" + publicRef + "/evaluations", HttpMethod.POST,
                new HttpEntity<>(evaluationPayload, secondRevisionHeaders), String.class);
        assertEquals(409, missingPredecessor.getStatusCode().value());
        assertEquals("PREDECESSOR_CONFLICT",
                objectMapper.readTree(missingPredecessor.getBody()).path("error").asText());

        var secondBody = (com.fasterxml.jackson.databind.node.ObjectNode)
                objectMapper.readTree(evaluationPayload);
        secondBody.put("predecessorEvaluationId", evaluationId);
        ResponseEntity<String> secondRevision = rest.exchange(
                "/api/v1/recruiter/applications/" + publicRef + "/evaluations", HttpMethod.POST,
                new HttpEntity<>(secondBody.toString(), secondRevisionHeaders), String.class);
        assertEquals(201, secondRevision.getStatusCode().value(), secondRevision.getBody());
        assertEquals(2, objectMapper.readTree(secondRevision.getBody()).path("revision").asInt());

        JsonNode afterEvaluation = objectMapper.readTree(rest.exchange(
                "/api/v1/recruiter/applications/" + publicRef, HttpMethod.GET,
                new HttpEntity<>(reader), String.class).getBody());
        assertEquals("SUBMITTED", afterEvaluation.path("application").path("status").asText(),
                "scorecard otomatik stage değiştirmez");
        assertEquals(2, afterEvaluation.path("evaluations").size());

        HttpHeaders transitionHeaders = bearer(token(
                TENANT, "ats.application.status.write", "pipeline-evaluator"));
        transitionHeaders.setContentType(MediaType.APPLICATION_JSON);
        assertEquals(200, rest.exchange(
                "/api/v1/recruiter/applications/" + publicRef + "/status", HttpMethod.PUT,
                new HttpEntity<>("{\"expectedVersion\":0,\"toStatus\":\"UNDER_REVIEW\"}",
                        transitionHeaders), String.class).getStatusCode().value());
        assertEquals(200, rest.exchange(
                "/api/v1/recruiter/applications/" + publicRef + "/status", HttpMethod.PUT,
                new HttpEntity<>("{\"expectedVersion\":1,\"toStatus\":\"REJECTED\"}",
                        transitionHeaders), String.class).getStatusCode().value());

        HttpHeaders candidate = new HttpHeaders();
        candidate.set("X-ATS-Candidate-Access", "E".repeat(43));
        ResponseEntity<String> candidateStatus = rest.exchange(
                "/api/v1/candidate/applications/" + publicRef, HttpMethod.GET,
                new HttpEntity<>(candidate), String.class);
        JsonNode candidateBody = objectMapper.readTree(candidateStatus.getBody());
        assertEquals("REJECTED", candidateBody.path("status").asText());
        assertEquals("NONE", candidateBody.path("nextAction").asText());
        assertFalse(candidateBody.path("withdrawalAllowed").asBoolean());
        assertEquals(3, candidateBody.path("history").size());
        assertFalse(candidateBody.has("evaluations"));
        assertFalse(candidateStatus.getBody().contains("pipeline-evaluator"));
        assertEquals(409, rest.exchange(
                "/api/v1/candidate/applications/" + publicRef + "/withdraw", HttpMethod.PUT,
                new HttpEntity<>(candidate), String.class).getStatusCode().value());

        HttpHeaders withdrawSubmit = json();
        withdrawSubmit.set("X-ATS-Idempotency-Key", "pipeline-withdraw-submit-01");
        withdrawSubmit.set("X-ATS-Candidate-Access", "F".repeat(43));
        ResponseEntity<String> withdrawReceipt = rest.exchange(
                "/api/v1/jobs/senior-frontend-developer/applications", HttpMethod.POST,
                new HttpEntity<>(payload("Geri Çeken Aday", acceptedAt), withdrawSubmit), String.class);
        String withdrawRef = objectMapper.readTree(withdrawReceipt.getBody()).path("publicRef").asText();
        HttpHeaders withdrawCandidate = new HttpHeaders();
        withdrawCandidate.set("X-ATS-Candidate-Access", "F".repeat(43));
        ResponseEntity<String> withdrawn = rest.exchange(
                "/api/v1/candidate/applications/" + withdrawRef + "/withdraw", HttpMethod.PUT,
                new HttpEntity<>(withdrawCandidate), String.class);
        assertEquals(200, withdrawn.getStatusCode().value(), withdrawn.getBody());
        assertEquals("WITHDRAWN", objectMapper.readTree(withdrawn.getBody()).path("status").asText());
        ResponseEntity<String> withdrawnReplay = rest.exchange(
                "/api/v1/candidate/applications/" + withdrawRef + "/withdraw", HttpMethod.PUT,
                new HttpEntity<>(withdrawCandidate), String.class);
        assertEquals(200, withdrawnReplay.getStatusCode().value());
        assertEquals("true", withdrawnReplay.getHeaders().getFirst("X-ATS-Replay"));

        assertEquals(2, scalar(
                "SELECT count(*) FROM ats_application_evaluation WHERE application_id ="
                        + " (SELECT application_id FROM ats_application WHERE public_ref = ?)",
                publicRef));
    }

    @Test
    void application_interview_schedule_candidate_view_and_assigned_scorecard_are_persistent()
            throws Exception {
        String acceptedAt = Instant.now().toString();
        HttpHeaders submitHeaders = json();
        submitHeaders.set("X-ATS-Idempotency-Key", "interview-submit-key-001");
        submitHeaders.set("X-ATS-Candidate-Access", "G".repeat(43));
        ResponseEntity<String> submit = rest.exchange(
                "/api/v1/jobs/urun-yoneticisi/applications", HttpMethod.POST,
                new HttpEntity<>(payload("Mülakat Adayı", acceptedAt), submitHeaders), String.class);
        assertEquals(201, submit.getStatusCode().value(), submit.getBody());
        String publicRef = objectMapper.readTree(submit.getBody()).path("publicRef").asText();

        Instant start = Instant.now().plusSeconds(86_400);
        Instant end = start.plusSeconds(3_600);
        String schedulePayload = objectMapper.writeValueAsString(Map.ofEntries(
                Map.entry("type", "BEHAVIORAL"),
                Map.entry("startsAt", start.toString()),
                Map.entry("endsAt", end.toString()),
                Map.entry("timeZone", "Europe/Istanbul"),
                Map.entry("mode", "VIDEO"),
                Map.entry("location", "https://meet.example.test/sentetik-oda"),
                Map.entry("participants", List.of(Map.of(
                        "actorRef", "interviewer-1",
                        "displayLabel", "Sentetik Görüşmeci",
                        "role", "LEAD"))),
                Map.entry("criteria", List.of(
                        Map.of(
                                "key", "discovery",
                                "label", "Ürün keşfi",
                                "question", "Müşteri ihtiyacını hangi kanıtlarla doğruladığınızı anlatın.",
                                "evidencePrompt", "Adayın kullandığı araştırma yöntemini ve ölçülebilir sonucu yazın."),
                        Map.of(
                                "key", "delivery",
                                "label", "Ürün teslimi",
                                "question", "Belirsiz bir yol haritasını nasıl teslim planına çevirdiniz?",
                                "evidencePrompt", "Adayın trade-off kararını ve doğrulanabilir teslim sonucunu yazın.")))));

        HttpHeaders manager = bearer(token(
                TENANT, "ats.application.status.write", "interview-recruiter"));
        manager.setContentType(MediaType.APPLICATION_JSON);
        manager.set("X-ATS-Idempotency-Key", "interview-create-before-review");
        ResponseEntity<String> tooEarly = rest.exchange(
                "/api/v1/recruiter/applications/" + publicRef + "/interviews", HttpMethod.POST,
                new HttpEntity<>(schedulePayload, manager), String.class);
        assertEquals(409, tooEarly.getStatusCode().value(), tooEarly.getBody());
        assertEquals("ILLEGAL_TRANSITION",
                objectMapper.readTree(tooEarly.getBody()).path("error").asText());

        HttpHeaders statusHeaders = bearer(token(
                TENANT, "ats.application.status.write", "interview-recruiter"));
        statusHeaders.setContentType(MediaType.APPLICATION_JSON);
        assertEquals(200, rest.exchange(
                "/api/v1/recruiter/applications/" + publicRef + "/status", HttpMethod.PUT,
                new HttpEntity<>("{\"expectedVersion\":0,\"toStatus\":\"UNDER_REVIEW\"}",
                        statusHeaders), String.class).getStatusCode().value());

        var illegal = (com.fasterxml.jackson.databind.node.ObjectNode)
                objectMapper.readTree(schedulePayload);
        ((com.fasterxml.jackson.databind.node.ObjectNode) illegal.path("criteria").get(0))
                .put("question", "Kaç yaşındasınız ve medeni durumunuz nedir?");
        manager.set("X-ATS-Idempotency-Key", "interview-illegal-question");
        ResponseEntity<String> illegalQuestion = rest.exchange(
                "/api/v1/recruiter/applications/" + publicRef + "/interviews", HttpMethod.POST,
                new HttpEntity<>(illegal.toString(), manager), String.class);
        assertEquals(400, illegalQuestion.getStatusCode().value(), illegalQuestion.getBody());

        manager.set("X-ATS-Idempotency-Key", "interview-create-key-001");
        ResponseEntity<String> create = rest.exchange(
                "/api/v1/recruiter/applications/" + publicRef + "/interviews", HttpMethod.POST,
                new HttpEntity<>(schedulePayload, manager), String.class);
        assertEquals(201, create.getStatusCode().value(), create.getBody());
        JsonNode workspace = objectMapper.readTree(create.getBody());
        String interviewId = workspace.path("interviewId").asText();
        assertTrue(interviewId.startsWith("int_"));
        assertEquals("SCHEDULED", workspace.path("status").asText());
        assertEquals(0, workspace.path("version").asInt());
        assertEquals(1, workspace.path("participants").size());
        assertEquals(2, workspace.path("criteria").size());
        assertEquals(0, workspace.path("scorecards").size());
        assertEquals(1, workspace.path("scheduleHistory").size());
        JsonNode applicationAfterSchedule = objectMapper.readTree(rest.exchange(
                "/api/v1/recruiter/applications/" + publicRef, HttpMethod.GET,
                new HttpEntity<>(bearer(token(TENANT, "ats.application.read", "interview-recruiter"))),
                String.class).getBody());
        assertEquals("INTERVIEW_PENDING",
                applicationAfterSchedule.path("application").path("status").asText(),
                "recruiter'ın planlama eylemi aday aşamasını atomik ilerletir");
        assertEquals(2, applicationAfterSchedule.path("application").path("version").asInt());

        ResponseEntity<String> createReplay = rest.exchange(
                "/api/v1/recruiter/applications/" + publicRef + "/interviews", HttpMethod.POST,
                new HttpEntity<>(schedulePayload, manager), String.class);
        assertEquals(200, createReplay.getStatusCode().value(), createReplay.getBody());
        assertEquals("true", createReplay.getHeaders().getFirst("X-ATS-Replay"));
        assertEquals(interviewId,
                objectMapper.readTree(createReplay.getBody()).path("interviewId").asText());

        HttpHeaders candidate = new HttpHeaders();
        candidate.set("X-ATS-Candidate-Access", "G".repeat(43));
        ResponseEntity<String> candidateSchedule = rest.exchange(
                "/api/v1/candidate/applications/" + publicRef + "/interviews", HttpMethod.GET,
                new HttpEntity<>(candidate), String.class);
        assertEquals(200, candidateSchedule.getStatusCode().value(), candidateSchedule.getBody());
        JsonNode candidateItem = objectMapper.readTree(candidateSchedule.getBody()).get(0);
        assertEquals(interviewId, candidateItem.path("interviewId").asText());
        assertEquals("SCHEDULED", candidateItem.path("status").asText());
        assertFalse(candidateItem.has("participants"));
        assertFalse(candidateItem.has("criteria"));
        assertFalse(candidateItem.has("scorecards"));
        assertFalse(candidateItem.has("candidateName"));
        assertFalse(candidateSchedule.getBody().contains("interviewer-1"));

        HttpHeaders wrongCandidate = new HttpHeaders();
        wrongCandidate.set("X-ATS-Candidate-Access", "H".repeat(43));
        assertEquals(404, rest.exchange(
                "/api/v1/candidate/applications/" + publicRef + "/interviews", HttpMethod.GET,
                new HttpEntity<>(wrongCandidate), String.class).getStatusCode().value());

        HttpHeaders interviewerRead = bearer(token(
                TENANT, "ats.application.read", "interviewer-1"));
        ResponseEntity<String> assigned = rest.exchange(
                "/api/v1/interviews/" + interviewId + "/workspace", HttpMethod.GET,
                new HttpEntity<>(interviewerRead), String.class);
        assertEquals(200, assigned.getStatusCode().value(), assigned.getBody());
        assertEquals(404, rest.exchange(
                "/api/v1/interviews/" + interviewId + "/workspace", HttpMethod.GET,
                new HttpEntity<>(bearer(token(TENANT, "ats.application.read", "not-assigned"))),
                String.class).getStatusCode().value(), "atanmamış kişi existence oracle alamaz");

        String scorecardPayload = objectMapper.writeValueAsString(Map.ofEntries(
                Map.entry("policyVersion", "structured-interview-v1"),
                Map.entry("jobRelatednessConfirmed", true),
                Map.entry("recommendation", "ADVANCE"),
                Map.entry("ratings", List.of(
                        Map.of("criterionKey", "discovery", "rating", 4,
                                "evidence", "Aday üç kullanıcı görüşmesi ve dönüşüm metriğiyle ihtiyacı doğruladı."),
                        Map.of("criterionKey", "delivery", "rating", 3,
                                "evidence", "Aday kapsam ve süre trade-off'unu somut teslim örneğiyle açıkladı."))),
                Map.entry("summary", "İşle ilgili iki kriter insan tarafından kanıtla değerlendirildi.")));
        HttpHeaders scorer = bearer(token(
                TENANT, "ats.application.status.write", "interviewer-1"));
        scorer.setContentType(MediaType.APPLICATION_JSON);
        scorer.set("X-ATS-Idempotency-Key", "interview-scorecard-key-001");
        ResponseEntity<String> scored = rest.exchange(
                "/api/v1/interviews/" + interviewId + "/scorecards", HttpMethod.POST,
                new HttpEntity<>(scorecardPayload, scorer), String.class);
        assertEquals(201, scored.getStatusCode().value(), scored.getBody());
        assertEquals(1, objectMapper.readTree(scored.getBody()).path("revision").asInt());

        JsonNode applicationAfterScore = objectMapper.readTree(rest.exchange(
                "/api/v1/recruiter/applications/" + publicRef, HttpMethod.GET,
                new HttpEntity<>(bearer(token(TENANT, "ats.application.read", "interview-recruiter"))),
                String.class).getBody());
        assertEquals("INTERVIEW_PENDING",
                applicationAfterScore.path("application").path("status").asText(),
                "scorecard application stage'ini otomatik değiştirmez");

        manager.set("X-ATS-Idempotency-Key", "interview-complete-key-01");
        ResponseEntity<String> completed = rest.exchange(
                "/api/v1/recruiter/applications/" + publicRef + "/interviews/" + interviewId
                        + "/transitions",
                HttpMethod.POST,
                new HttpEntity<>("{\"expectedVersion\":0,\"target\":\"COMPLETED\","
                        + "\"reason\":\"Tüm insan scorecard kayıtları tamamlandı\"}", manager),
                String.class);
        assertEquals(200, completed.getStatusCode().value(), completed.getBody());
        assertEquals("COMPLETED", objectMapper.readTree(completed.getBody()).path("status").asText());
        assertEquals(1, objectMapper.readTree(completed.getBody()).path("version").asInt());
        assertEquals(2, objectMapper.readTree(completed.getBody()).path("scheduleHistory").size());

        JsonNode candidateCompleted = objectMapper.readTree(rest.exchange(
                "/api/v1/candidate/applications/" + publicRef + "/interviews", HttpMethod.GET,
                new HttpEntity<>(candidate), String.class).getBody()).get(0);
        assertEquals("COMPLETED", candidateCompleted.path("status").asText());
        assertEquals(1, scalar("SELECT count(*) FROM ats_interview WHERE interview_id = ?", interviewId));
        assertEquals(1, scalar("SELECT count(*) FROM ats_interview_scorecard"
                + " WHERE interview_id = ?", interviewId));
        assertEquals(2, scalar("SELECT count(*) FROM ats_interview_schedule_revision"
                + " WHERE interview_id = ?", interviewId));

        manager.set("X-ATS-Idempotency-Key", "interview-create-key-002");
        ResponseEntity<String> secondCreate = rest.exchange(
                "/api/v1/recruiter/applications/" + publicRef + "/interviews", HttpMethod.POST,
                new HttpEntity<>(schedulePayload, manager), String.class);
        assertEquals(201, secondCreate.getStatusCode().value(), secondCreate.getBody());
        String secondInterviewId = objectMapper.readTree(secondCreate.getBody())
                .path("interviewId").asText();

        HttpHeaders rejectHeaders = bearer(token(
                TENANT, "ats.application.status.write", "interview-recruiter"));
        rejectHeaders.setContentType(MediaType.APPLICATION_JSON);
        ResponseEntity<String> rejected = rest.exchange(
                "/api/v1/recruiter/applications/" + publicRef + "/status", HttpMethod.PUT,
                new HttpEntity<>("{\"expectedVersion\":2,\"toStatus\":\"REJECTED\"}",
                        rejectHeaders), String.class);
        assertEquals(200, rejected.getStatusCode().value(), rejected.getBody());
        assertEquals("CANCELLED", scalarString(
                "SELECT status FROM ats_interview WHERE interview_id = ?", secondInterviewId));
        assertEquals("COMPLETED", scalarString(
                "SELECT status FROM ats_interview WHERE interview_id = ?", interviewId));
        assertEquals(2, scalar("SELECT count(*) FROM ats_interview_schedule_revision"
                + " WHERE interview_id = ?", secondInterviewId));
    }

    @Test
    void recruiter_can_create_publish_and_pause_a_real_job_without_exposing_drafts() throws Exception {
        String draftPayload = new ObjectMapper().writeValueAsString(Map.ofEntries(
                Map.entry("title", "Müşteri Başarı Uzmanı"),
                Map.entry("team", "Müşteri Deneyimi"),
                Map.entry("location", "Türkiye"),
                Map.entry("mode", "Uzaktan"),
                Map.entry("employmentType", "Tam zamanlı"),
                Map.entry("summary", "Müşterilerin üründen ölçülebilir değer üretmesini destekleyin."),
                Map.entry("highlights", List.of("Müşteri keşfi", "Ürün geri bildirimi")),
                Map.entry("applicationFields", List.of(
                        "fullName", "email", "phone", "city", "linkedIn", "portfolio",
                        "summary", "experience", "education", "skills", "note")),
                Map.entry("noticeVersion", "kvkk-application-v1")));

        HttpHeaders createHeaders = bearer(token(TENANT, "ats.job.write", "job-recruiter"));
        createHeaders.setContentType(MediaType.APPLICATION_JSON);
        createHeaders.set("X-ATS-Idempotency-Key", "api-job-create-key-001");

        HttpHeaders missingIdempotency = bearer(token(TENANT, "ats.job.write", "job-recruiter"));
        missingIdempotency.setContentType(MediaType.APPLICATION_JSON);
        assertEquals(400, rest.exchange(
                "/api/v1/recruiter/jobs", HttpMethod.POST,
                new HttpEntity<>(draftPayload, missingIdempotency), String.class)
                .getStatusCode().value(), "zorunlu idempotency başlığı runtime'da da doğrulanır");

        HttpHeaders publishOnlyCreate = bearer(token(
                TENANT, "ats.job.publish", "publish-only-recruiter"));
        publishOnlyCreate.setContentType(MediaType.APPLICATION_JSON);
        publishOnlyCreate.set("X-ATS-Idempotency-Key", "api-job-publish-only-01");
        assertEquals(403, rest.exchange(
                "/api/v1/recruiter/jobs", HttpMethod.POST,
                new HttpEntity<>(draftPayload, publishOnlyCreate), String.class)
                .getStatusCode().value(), "JOB_PUBLISH taslak yazma yetkisi değildir");

        assertEquals(403, rest.exchange(
                "/api/v1/recruiter/jobs", HttpMethod.GET,
                new HttpEntity<>(bearer(token(
                        TENANT, "ats.application.read", "application-reader"))), String.class)
                .getStatusCode().value(), "APPLICATION_READ ilan yüzeyine erişmez");

        ResponseEntity<String> create = rest.exchange(
                "/api/v1/recruiter/jobs", HttpMethod.POST,
                new HttpEntity<>(draftPayload, createHeaders), String.class);
        assertEquals(201, create.getStatusCode().value(), create.getBody());
        JsonNode draft = objectMapper.readTree(create.getBody());
        String jobId = draft.path("jobId").asText();
        String slug = draft.path("slug").asText();
        assertTrue(jobId.startsWith("job_"));
        assertEquals("DRAFT", draft.path("status").asText());
        assertFalse(draft.path("applyEnabled").asBoolean());
        assertEquals("kvkk-application-v1", draft.path("noticeVersion").asText());
        assertTrue(draft.path("applicationFields").isArray());
        assertEquals(404, rest.getForEntity("/api/v1/jobs/" + slug, String.class)
                .getStatusCode().value(), "taslak public kariyer yüzeyine çıkmaz");

        HttpHeaders publishHeaders = bearer(token(TENANT, "ats.job.publish", "job-publisher"));
        publishHeaders.setContentType(MediaType.APPLICATION_JSON);

        HttpHeaders writeOnlyTransition = bearer(token(
                TENANT, "ats.job.write", "write-only-recruiter"));
        writeOnlyTransition.setContentType(MediaType.APPLICATION_JSON);
        writeOnlyTransition.set("X-ATS-Idempotency-Key", "api-job-write-only-001");
        assertEquals(403, rest.exchange(
                "/api/v1/recruiter/jobs/" + jobId + "/transitions", HttpMethod.POST,
                new HttpEntity<>("{\"expectedVersion\":0,\"targetStatus\":\"PUBLISHED\"}",
                        writeOnlyTransition), String.class).getStatusCode().value(),
                "JOB_WRITE yayınlama yetkisi değildir");
        HttpHeaders missingVersionHeaders = new HttpHeaders();
        missingVersionHeaders.putAll(publishHeaders);
        missingVersionHeaders.set("X-ATS-Idempotency-Key", "api-job-missing-version-01");
        ResponseEntity<String> missingVersion = rest.exchange(
                "/api/v1/recruiter/jobs/" + jobId + "/transitions", HttpMethod.POST,
                new HttpEntity<>("{\"targetStatus\":\"PUBLISHED\"}", missingVersionHeaders),
                String.class);
        assertEquals(400, missingVersion.getStatusCode().value(), missingVersion.getBody());
        assertEquals("INVALID",
                objectMapper.readTree(missingVersion.getBody()).path("error").asText());

        publishHeaders.set("X-ATS-Idempotency-Key", "api-job-publish-key-01");
        ResponseEntity<String> publish = rest.exchange(
                "/api/v1/recruiter/jobs/" + jobId + "/transitions", HttpMethod.POST,
                new HttpEntity<>("{\"expectedVersion\":0,\"targetStatus\":\"PUBLISHED\"}",
                        publishHeaders), String.class);
        assertEquals(200, publish.getStatusCode().value(), publish.getBody());
        assertEquals("PUBLISHED", objectMapper.readTree(publish.getBody()).path("status").asText());
        assertEquals("acik", objectMapper.readTree(publish.getBody()).path("publicHandle").asText());
        assertEquals(200, rest.getForEntity("/api/v1/jobs/" + slug, String.class)
                .getStatusCode().value());
        assertEquals(200, rest.getForEntity(
                "/api/v1/careers/acik/jobs/" + slug, String.class).getStatusCode().value());

        HttpHeaders pauseHeaders = bearer(token(TENANT, "ats.job.publish", "job-publisher"));
        pauseHeaders.setContentType(MediaType.APPLICATION_JSON);
        pauseHeaders.set("X-ATS-Idempotency-Key", "api-job-pause-key-001");
        ResponseEntity<String> pause = rest.exchange(
                "/api/v1/recruiter/jobs/" + jobId + "/transitions", HttpMethod.POST,
                new HttpEntity<>("{\"expectedVersion\":1,\"targetStatus\":\"PAUSED\"}",
                        pauseHeaders), String.class);
        assertEquals(200, pause.getStatusCode().value(), pause.getBody());
        assertEquals("PAUSED", objectMapper.readTree(pause.getBody()).path("status").asText());
        assertEquals(404, rest.getForEntity("/api/v1/jobs/" + slug, String.class)
                .getStatusCode().value(), "duraklatılan ilan başvuru kabul etmez");

        ResponseEntity<String> latePublishReplay = rest.exchange(
                "/api/v1/recruiter/jobs/" + jobId + "/transitions", HttpMethod.POST,
                new HttpEntity<>("{\"expectedVersion\":0,\"targetStatus\":\"PUBLISHED\"}",
                        publishHeaders), String.class);
        assertEquals(200, latePublishReplay.getStatusCode().value());
        assertEquals("true", latePublishReplay.getHeaders().getFirst("X-ATS-Replay"));
        JsonNode replayBody = objectMapper.readTree(latePublishReplay.getBody());
        assertEquals("PUBLISHED", replayBody.path("status").asText());
        assertEquals(1, replayBody.path("version").asInt(),
                "idempotent retry exact publish response'unu döndürür");
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
    private String scalarString(String sql, String value) throws Exception {
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, value);
            try (ResultSet rs = ps.executeQuery()) { rs.next(); return rs.getString(1); }
        }
    }
}
