package com.ats.app;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.fail;

import com.ats.application.ApplicationIntakeService;
import com.ats.kernel.JsonCodec;
import com.ats.kernel.JsonValue;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * OpenAPI sözleşme drift-guard'ı: /v3/api-docs çıktısı repo'daki snapshot'a
 * PİNLİDİR. Bilinçsiz endpoint/DTO değişikliği bu testi kırar (sessiz API
 * sözleşme kayması yapısal imkânsız). Bilinçli değişiklikte akış:
 *
 *   1. Testi koş — fail çıktısı canlı canonical'i target/openapi-live.json'a yazar.
 *   2. Diff'i İNCELE (sözleşme değişikliği PR'da açıkça beyan edilir).
 *   3. cp target/openapi-live.json src/test/resources/openapi-snapshot.json
 *
 * Normalize: "servers" alanı çıkarılır (test portu her koşuda değişir);
 * karşılaştırma kernel JsonCodec.canonical ile — anahtar-sıralı, deterministik.
 */
@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@org.springframework.context.annotation.Import(WormGovernanceTestSeed.class)
class OpenApiDriftTest {

    @Container
    private static final PostgreSQLContainer<?> PG = new PostgreSQLContainer<>("postgres:16-alpine");

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) {
        registry.add("ats.db.url", PG::getJdbcUrl);
        registry.add("ats.db.username", PG::getUsername);
        registry.add("ats.db.password", PG::getPassword);
        registry.add("ats.ai.base-url", () -> "http://127.0.0.1:9");
        registry.add("ats.security.jwks-uri", () -> "http://127.0.0.1:9/jwks.json");
        registry.add("ats.security.issuer", () -> "https://drift-issuer.local");
        registry.add("ats.security.audience", () -> "ats-api");
        registry.add("ats.ingest.max-upload-bytes", () -> "1048576");
        // P3-gov0 (Codex REVISE): yaml default'u kaldırılan 3 güven girdisi — shipped kayıttan türet (drift-safe).
        AiGovernanceTestSupport.registerHttpJson(registry);
    }

    @Autowired private TestRestTemplate rest;

    @Test
    void api_docs_matches_pinned_snapshot() throws Exception {
        String live = rest.getForEntity("/v3/api-docs", String.class).getBody();
        String liveCanonical = normalizedCanonical(live);

        String pinned;
        try (InputStream in = getClass().getResourceAsStream("/openapi-snapshot.json")) {
            if (in == null) {
                writeLive(liveCanonical);
                fail("openapi-snapshot.json test-resource'u yok — canlı canonical target/openapi-live.json'a"
                        + " yazıldı; inceleyip src/test/resources/openapi-snapshot.json olarak pinleyin.");
                return;
            }
            pinned = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
        String pinnedCanonical = normalizedCanonical(pinned);

        if (!pinnedCanonical.equals(liveCanonical)) {
            writeLive(liveCanonical);
        }
        assertEquals(pinnedCanonical, liveCanonical,
                "API sözleşmesi pinlenen snapshot'tan SAPTI. Bilinçsiz değişiklikse geri alın;"
                        + " bilinçliyse diff'i inceleyip canlı çıktıyı pinleyin:"
                        + " cp target/openapi-live.json src/test/resources/openapi-snapshot.json"
                        + " (PR'da API-sözleşme değişikliği olarak açıkça beyan edin).");
    }

    /** "servers" (test-portu değişken) çıkarılır; kalan JSON anahtar-sıralı canonical'e indirgenir. */
    private static String normalizedCanonical(String rawJson) {
        JsonValue parsed;
        try {
            parsed = JsonCodec.parse(rawJson);
        } catch (JsonCodec.JsonCodecException e) {
            throw new IllegalStateException("api-docs çıktısı JSON parse edilemedi (fail-closed)", e);
        }
        if (!(parsed instanceof JsonValue.JsonObject obj)) {
            throw new IllegalStateException("api-docs kökü object değil (fail-closed)");
        }
        Map<String, JsonValue> pruned = new LinkedHashMap<>(obj.values());
        pruned.remove("servers");
        return JsonCodec.canonical(JsonValue.object(pruned));
    }

    private static void writeLive(String canonical) throws IOException {
        Path out = Path.of("target", "openapi-live.json");
        Files.createDirectories(out.getParent());
        Files.writeString(out, canonical, StandardCharsets.UTF_8);
    }
    @org.junit.jupiter.api.Test
    void repair_request_body_contract_is_pinned_semantically() throws Exception {
        // Codex 39d-11 iter-2: runtime raw-String parse etse de DIŞ kontrat
        // RepairBody-object + required=true olarak snapshot'ta pinli kalmalı.
        com.fasterxml.jackson.databind.JsonNode snap = new com.fasterxml.jackson.databind.ObjectMapper()
                .readTree(getClass().getResourceAsStream("/openapi-snapshot.json"));
        com.fasterxml.jackson.databind.JsonNode rb = snap.path("paths")
                .path("/api/v1/interviews/{interviewId}/export/repair").path("post").path("requestBody");
        org.junit.jupiter.api.Assertions.assertTrue(rb.path("required").asBoolean(false));
        String ref = rb.path("content").path("application/json").path("schema").path("$ref").asText();
        org.junit.jupiter.api.Assertions.assertTrue(ref.endsWith("/RepairBody"), ref);
        com.fasterxml.jackson.databind.JsonNode props = snap.path("components").path("schemas")
                .path("RepairBody").path("properties");
        org.junit.jupiter.api.Assertions.assertTrue(props.has("caseKey"), props.toString());
    }

    @org.junit.jupiter.api.Test
    void recruiter_job_contract_is_typed_versioned_and_does_not_shadow_review_transition()
            throws Exception {
        com.fasterxml.jackson.databind.JsonNode snap = new com.fasterxml.jackson.databind.ObjectMapper()
                .readTree(getClass().getResourceAsStream("/openapi-snapshot.json"));

        com.fasterxml.jackson.databind.JsonNode create = snap.path("paths")
                .path("/api/v1/recruiter/jobs").path("post");
        org.junit.jupiter.api.Assertions.assertTrue(
                create.path("responses").has("201"), create.toString());
        org.junit.jupiter.api.Assertions.assertTrue(
                create.path("responses").path("201").path("content").path("*/*")
                        .path("schema").path("$ref").asText()
                        .endsWith("/RecruiterJobResponse"), create.toString());
        org.junit.jupiter.api.Assertions.assertTrue(
                java.util.stream.StreamSupport.stream(
                                create.path("parameters").spliterator(), false)
                        .anyMatch(p -> "X-ATS-Idempotency-Key".equals(p.path("name").asText())
                                && p.path("required").asBoolean(false)),
                create.toString());

        com.fasterxml.jackson.databind.JsonNode transition = snap.path("components").path("schemas")
                .path("RecruiterJobTransitionRequest");
        org.junit.jupiter.api.Assertions.assertTrue(
                java.util.stream.StreamSupport.stream(
                                transition.path("required").spliterator(), false)
                        .anyMatch(v -> "expectedVersion".equals(v.asText())),
                transition.toString());
        org.junit.jupiter.api.Assertions.assertEquals(0,
                transition.path("properties").path("expectedVersion").path("minimum").asInt(-1));
        org.junit.jupiter.api.Assertions.assertEquals(
                java.util.Set.of("PUBLISHED", "PAUSED", "CLOSED", "ARCHIVED"),
                textValues(transition.path("properties").path("targetStatus").path("enum")));
        org.junit.jupiter.api.Assertions.assertFalse(
                transition.path("additionalProperties").asBoolean(true));

        com.fasterxml.jackson.databind.JsonNode update = snap.path("paths")
                .path("/api/v1/recruiter/jobs/{jobId}").path("put");
        com.fasterxml.jackson.databind.JsonNode transitionOperation = snap.path("paths")
                .path("/api/v1/recruiter/jobs/{jobId}/transitions").path("post");
        for (com.fasterxml.jackson.databind.JsonNode operation
                : java.util.List.of(create, update, transitionOperation)) {
            org.junit.jupiter.api.Assertions.assertTrue(
                    hasRequiredParameter(operation, "X-ATS-Idempotency-Key"),
                    operation.toString());
            org.junit.jupiter.api.Assertions.assertTrue(operation.path("responses").has("403"),
                    operation.toString());
            org.junit.jupiter.api.Assertions.assertTrue(operation.path("responses").has("503"),
                    operation.toString());
            org.junit.jupiter.api.Assertions.assertTrue(operation.path("responses").path("200")
                    .path("headers").has("X-ATS-Replay"), operation.toString());
        }

        com.fasterxml.jackson.databind.JsonNode response = snap.path("components").path("schemas")
                .path("RecruiterJobResponse");
        org.junit.jupiter.api.Assertions.assertTrue(
                response.path("properties").has("publicHandle"), response.toString());
        org.junit.jupiter.api.Assertions.assertTrue(
                response.path("properties").has("applicationFields"), response.toString());
        org.junit.jupiter.api.Assertions.assertEquals(
                java.util.Set.of(ApplicationIntakeService.NOTICE_VERSION),
                textValues(response.path("properties").path("noticeVersion").path("enum")));
        org.junit.jupiter.api.Assertions.assertFalse(
                response.path("additionalProperties").asBoolean(true));

        for (String requestName : java.util.List.of(
                "RecruiterJobCreateRequest", "RecruiterJobUpdateRequest")) {
            com.fasterxml.jackson.databind.JsonNode request = snap.path("components").path("schemas")
                    .path(requestName);
            org.junit.jupiter.api.Assertions.assertTrue(
                    textValues(request.path("required")).contains("applicationFields"), request.toString());
            org.junit.jupiter.api.Assertions.assertTrue(
                    textValues(request.path("required")).contains("noticeVersion"), request.toString());
            org.junit.jupiter.api.Assertions.assertEquals(
                    java.util.Set.of(ApplicationIntakeService.NOTICE_VERSION),
                    textValues(request.path("properties").path("noticeVersion").path("enum")));
            org.junit.jupiter.api.Assertions.assertEquals(20,
                    request.path("properties").path("highlights").path("maxItems").asInt(-1));
            org.junit.jupiter.api.Assertions.assertEquals(160,
                    request.path("properties").path("highlights").path("items")
                            .path("maxLength").asInt(-1));
        }

        com.fasterxml.jackson.databind.JsonNode reviewTransition = snap.path("components")
                .path("schemas").path("TransitionBody").path("properties");
        org.junit.jupiter.api.Assertions.assertTrue(reviewTransition.has("caseKey"),
                "recruiter DTO review TransitionBody'yi gölgelememeli: " + reviewTransition);
        org.junit.jupiter.api.Assertions.assertFalse(reviewTransition.has("expectedVersion"),
                reviewTransition.toString());
    }

    @org.junit.jupiter.api.Test
    void public_career_contract_is_tenant_bound_typed_strict_and_retry_safe() throws Exception {
        com.fasterxml.jackson.databind.JsonNode snap = new com.fasterxml.jackson.databind.ObjectMapper()
                .readTree(getClass().getResourceAsStream("/openapi-snapshot.json"));
        com.fasterxml.jackson.databind.JsonNode paths = snap.path("paths");
        org.junit.jupiter.api.Assertions.assertTrue(
                paths.has("/api/v1/careers/{publicHandle}/jobs"));
        org.junit.jupiter.api.Assertions.assertTrue(
                paths.has("/api/v1/careers/{publicHandle}/jobs/{jobSlug}"));
        com.fasterxml.jackson.databind.JsonNode submit = paths
                .path("/api/v1/careers/{publicHandle}/jobs/{jobSlug}/applications")
                .path("post");
        org.junit.jupiter.api.Assertions.assertTrue(
                hasRequiredParameter(submit, "X-ATS-Idempotency-Key"), submit.toString());
        org.junit.jupiter.api.Assertions.assertTrue(
                hasRequiredParameter(submit, "X-ATS-Candidate-Access"), submit.toString());
        org.junit.jupiter.api.Assertions.assertTrue(submit.path("responses").has("201"));
        org.junit.jupiter.api.Assertions.assertTrue(submit.path("responses").has("200"));
        org.junit.jupiter.api.Assertions.assertTrue(submit.path("responses").path("200")
                .path("headers").has("X-ATS-Replay"), submit.toString());
        org.junit.jupiter.api.Assertions.assertTrue(submit.path("responses").has("404"));
        org.junit.jupiter.api.Assertions.assertTrue(
                submit.path("requestBody").path("content").path("application/json")
                        .path("schema").path("$ref").asText()
                        .endsWith("/ApplicationSubmitRequest"));

        com.fasterxml.jackson.databind.JsonNode schemas = snap.path("components").path("schemas");
        for (String name : java.util.List.of(
                "ApplicationSubmitRequest", "ApplicationReceiptResponse", "PublicJobResponse")) {
            org.junit.jupiter.api.Assertions.assertFalse(
                    schemas.path(name).path("additionalProperties").asBoolean(true), name);
        }
        org.junit.jupiter.api.Assertions.assertEquals(
                java.util.Set.of(ApplicationIntakeService.NOTICE_VERSION),
                textValues(schemas.path("ApplicationSubmitRequest").path("properties")
                        .path("noticeVersion").path("enum")));
        org.junit.jupiter.api.Assertions.assertTrue(
                schemas.path("PublicJobResponse").path("properties").has("applicationFields"));
        org.junit.jupiter.api.Assertions.assertEquals(
                java.util.Set.of(ApplicationIntakeService.NOTICE_VERSION),
                textValues(schemas.path("PublicJobResponse").path("properties")
                        .path("noticeVersion").path("enum")));
        com.fasterxml.jackson.databind.JsonNode status = schemas
                .path("RecruiterApplicationStatusRequest");
        org.junit.jupiter.api.Assertions.assertTrue(
                textValues(status.path("required")).contains("expectedVersion"));
        org.junit.jupiter.api.Assertions.assertEquals(0,
                status.path("properties").path("expectedVersion").path("minimum").asInt(-1));
    }

    @org.junit.jupiter.api.Test
    void application_pipeline_contract_is_typed_pii_minimized_and_human_controlled()
            throws Exception {
        com.fasterxml.jackson.databind.JsonNode snap = new com.fasterxml.jackson.databind.ObjectMapper()
                .readTree(getClass().getResourceAsStream("/openapi-snapshot.json"));
        com.fasterxml.jackson.databind.JsonNode paths = snap.path("paths");
        com.fasterxml.jackson.databind.JsonNode schemas = snap.path("components").path("schemas");

        com.fasterxml.jackson.databind.JsonNode candidateStatus = paths
                .path("/api/v1/candidate/applications/{publicRef}").path("get");
        com.fasterxml.jackson.databind.JsonNode candidateWithdraw = paths
                .path("/api/v1/candidate/applications/{publicRef}/withdraw").path("put");
        org.junit.jupiter.api.Assertions.assertTrue(
                hasRequiredParameter(candidateStatus, "X-ATS-Candidate-Access"));
        org.junit.jupiter.api.Assertions.assertTrue(
                hasRequiredParameter(candidateWithdraw, "X-ATS-Candidate-Access"));
        org.junit.jupiter.api.Assertions.assertTrue(candidateWithdraw.path("responses").has("409"));

        com.fasterxml.jackson.databind.JsonNode inbox = paths
                .path("/api/v1/recruiter/applications").path("get");
        org.junit.jupiter.api.Assertions.assertTrue(inbox.path("responses").path("200")
                .path("content").path("*/*").path("schema").path("$ref").asText()
                .endsWith("/RecruiterApplicationPageResponse"));
        com.fasterxml.jackson.databind.JsonNode summary = schemas
                .path("RecruiterApplicationSummaryResponse");
        org.junit.jupiter.api.Assertions.assertFalse(
                summary.path("additionalProperties").asBoolean(true));
        for (String omitted : java.util.List.of(
                "phone", "linkedIn", "portfolio", "summary", "experience", "education", "note")) {
            org.junit.jupiter.api.Assertions.assertFalse(
                    summary.path("properties").has(omitted), omitted + " inbox'ta olmamalı");
        }

        com.fasterxml.jackson.databind.JsonNode detail = paths
                .path("/api/v1/recruiter/applications/{publicRef}").path("get");
        org.junit.jupiter.api.Assertions.assertTrue(detail.path("responses").path("200")
                .path("content").path("*/*").path("schema").path("$ref").asText()
                .endsWith("/RecruiterApplicationDetailResponse"));

        com.fasterxml.jackson.databind.JsonNode evaluation = paths
                .path("/api/v1/recruiter/applications/{publicRef}/evaluations").path("post");
        org.junit.jupiter.api.Assertions.assertTrue(
                hasRequiredParameter(evaluation, "X-ATS-Idempotency-Key"));
        org.junit.jupiter.api.Assertions.assertTrue(evaluation.path("responses").has("201"));
        org.junit.jupiter.api.Assertions.assertTrue(evaluation.path("responses").path("200")
                .path("headers").has("X-ATS-Replay"));
        com.fasterxml.jackson.databind.JsonNode evaluationRequest = schemas
                .path("RecruiterApplicationEvaluationRequest");
        org.junit.jupiter.api.Assertions.assertFalse(
                evaluationRequest.path("additionalProperties").asBoolean(true));
        org.junit.jupiter.api.Assertions.assertTrue(textValues(evaluationRequest.path("required"))
                .containsAll(java.util.Set.of("policyVersion", "jobRelatednessConfirmed",
                        "recommendation", "criteria", "summary")));
        org.junit.jupiter.api.Assertions.assertEquals(
                java.util.Set.of(ApplicationIntakeService.EVALUATION_POLICY_VERSION),
                textValues(evaluationRequest.path("properties").path("policyVersion").path("enum")));
        org.junit.jupiter.api.Assertions.assertEquals(1,
                evaluationRequest.path("properties").path("criteria").path("minItems").asInt(-1));
        org.junit.jupiter.api.Assertions.assertEquals(12,
                evaluationRequest.path("properties").path("criteria").path("maxItems").asInt(-1));

        for (String strictResponse : java.util.List.of(
                "CandidateApplicationStatusResponse", "RecruiterApplicationPageResponse",
                "RecruiterApplicationResponse", "RecruiterApplicationDetailResponse",
                "RecruiterApplicationEvaluationResponse")) {
            org.junit.jupiter.api.Assertions.assertFalse(
                    schemas.path(strictResponse).path("additionalProperties").asBoolean(true),
                    strictResponse);
        }
        org.junit.jupiter.api.Assertions.assertEquals(
                java.util.Set.of("UNDER_REVIEW", "INTERVIEW_PENDING", "REJECTED"),
                textValues(schemas.path("RecruiterApplicationStatusRequest")
                        .path("properties").path("toStatus").path("enum")));
    }

    @org.junit.jupiter.api.Test
    void interview_contract_is_strict_candidate_safe_and_human_controlled() throws Exception {
        com.fasterxml.jackson.databind.JsonNode snap = new com.fasterxml.jackson.databind.ObjectMapper()
                .readTree(getClass().getResourceAsStream("/openapi-snapshot.json"));
        com.fasterxml.jackson.databind.JsonNode paths = snap.path("paths");
        com.fasterxml.jackson.databind.JsonNode schemas = snap.path("components").path("schemas");

        com.fasterxml.jackson.databind.JsonNode create = paths
                .path("/api/v1/recruiter/applications/{publicRef}/interviews").path("post");
        com.fasterxml.jackson.databind.JsonNode reschedule = paths
                .path("/api/v1/recruiter/applications/{publicRef}/interviews/{interviewId}")
                .path("put");
        com.fasterxml.jackson.databind.JsonNode transition = paths
                .path("/api/v1/recruiter/applications/{publicRef}/interviews/{interviewId}/transitions")
                .path("post");
        com.fasterxml.jackson.databind.JsonNode scorecard = paths
                .path("/api/v1/interviews/{interviewId}/scorecards").path("post");
        for (com.fasterxml.jackson.databind.JsonNode operation
                : java.util.List.of(create, reschedule, transition, scorecard)) {
            org.junit.jupiter.api.Assertions.assertTrue(
                    hasRequiredParameter(operation, "X-ATS-Idempotency-Key"), operation.toString());
            org.junit.jupiter.api.Assertions.assertTrue(operation.path("responses").has("409"),
                    operation.toString());
        }
        org.junit.jupiter.api.Assertions.assertTrue(create.path("responses").has("201"));
        org.junit.jupiter.api.Assertions.assertTrue(scorecard.path("responses").has("201"));
        org.junit.jupiter.api.Assertions.assertTrue(create.path("responses").path("201")
                .path("content").path("*/*").path("schema").path("$ref").asText()
                .endsWith("/InterviewWorkspaceResponse"));
        org.junit.jupiter.api.Assertions.assertTrue(scorecard.path("responses").path("201")
                .path("content").path("*/*").path("schema").path("$ref").asText()
                .endsWith("/InterviewScorecardResponse"));

        com.fasterxml.jackson.databind.JsonNode candidate = paths
                .path("/api/v1/candidate/applications/{publicRef}/interviews").path("get");
        org.junit.jupiter.api.Assertions.assertTrue(
                hasRequiredParameter(candidate, "X-ATS-Candidate-Access"));
        com.fasterxml.jackson.databind.JsonNode candidateProperties = schemas
                .path("CandidateInterviewResponse").path("properties");
        for (String internal : java.util.List.of(
                "participants", "criteria", "scorecards", "candidateName", "actorRef", "reason")) {
            org.junit.jupiter.api.Assertions.assertFalse(candidateProperties.has(internal), internal);
        }

        for (String strict : java.util.List.of(
                "InterviewCreateRequest", "InterviewRescheduleRequest",
                "InterviewTransitionRequest", "InterviewScorecardRequest",
                "InterviewWorkspaceResponse", "InterviewScorecardResponse",
                "CandidateInterviewResponse")) {
            org.junit.jupiter.api.Assertions.assertFalse(
                    schemas.path(strict).path("additionalProperties").asBoolean(true), strict);
        }
        org.junit.jupiter.api.Assertions.assertTrue(
                textValues(schemas.path("InterviewCreateRequest").path("required"))
                        .containsAll(java.util.Set.of("participants", "criteria")));
        org.junit.jupiter.api.Assertions.assertTrue(
                textValues(schemas.path("InterviewScorecardRequest").path("required"))
                        .contains("ratings"));
        org.junit.jupiter.api.Assertions.assertEquals(
                java.util.Set.of("COMPLETED", "CANCELLED"),
                textValues(schemas.path("InterviewTransitionRequest")
                        .path("properties").path("target").path("enum")));
        org.junit.jupiter.api.Assertions.assertEquals(
                java.util.Set.of("structured-interview-v1"),
                textValues(schemas.path("InterviewScorecardRequest")
                        .path("properties").path("policyVersion").path("enum")));
        org.junit.jupiter.api.Assertions.assertTrue(
                schemas.path("TransitionBody").path("properties").has("caseKey"),
                "interview DTO review TransitionBody'yi gölgelememeli");
    }

    @org.junit.jupiter.api.Test
    void offer_contract_is_strict_candidate_safe_versioned_and_human_controlled() throws Exception {
        com.fasterxml.jackson.databind.JsonNode snap = new com.fasterxml.jackson.databind.ObjectMapper()
                .readTree(getClass().getResourceAsStream("/openapi-snapshot.json"));
        com.fasterxml.jackson.databind.JsonNode paths = snap.path("paths");
        com.fasterxml.jackson.databind.JsonNode schemas = snap.path("components").path("schemas");

        com.fasterxml.jackson.databind.JsonNode create = paths
                .path("/api/v1/recruiter/applications/{publicRef}/offers").path("post");
        com.fasterxml.jackson.databind.JsonNode update = paths
                .path("/api/v1/recruiter/applications/{publicRef}/offers/{offerId}").path("put");
        com.fasterxml.jackson.databind.JsonNode transition = paths
                .path("/api/v1/recruiter/applications/{publicRef}/offers/{offerId}/transitions")
                .path("post");
        for (com.fasterxml.jackson.databind.JsonNode operation
                : java.util.List.of(create, update, transition)) {
            org.junit.jupiter.api.Assertions.assertTrue(
                    hasRequiredParameter(operation, "X-ATS-Idempotency-Key"), operation.toString());
        }
        org.junit.jupiter.api.Assertions.assertTrue(create.path("responses").has("201"));
        org.junit.jupiter.api.Assertions.assertTrue(create.path("responses").has("409"));
        org.junit.jupiter.api.Assertions.assertTrue(create.path("responses").path("201")
                .path("content").path("*/*").path("schema").path("$ref").asText()
                .endsWith("/OfferWorkspaceResponse"));

        com.fasterxml.jackson.databind.JsonNode candidateList = paths
                .path("/api/v1/candidate/applications/{publicRef}/offers").path("get");
        com.fasterxml.jackson.databind.JsonNode candidateRespond = paths
                .path("/api/v1/candidate/applications/{publicRef}/offers/{offerId}/response")
                .path("post");
        org.junit.jupiter.api.Assertions.assertTrue(
                hasRequiredParameter(candidateList, "X-ATS-Candidate-Access"));
        org.junit.jupiter.api.Assertions.assertTrue(
                hasRequiredParameter(candidateRespond, "X-ATS-Candidate-Access"));
        org.junit.jupiter.api.Assertions.assertTrue(
                hasRequiredParameter(candidateRespond, "X-ATS-Idempotency-Key"));
        org.junit.jupiter.api.Assertions.assertTrue(candidateRespond.path("responses").has("409"));

        com.fasterxml.jackson.databind.JsonNode candidateProperties = schemas
                .path("CandidateOfferResponse").path("properties");
        org.junit.jupiter.api.Assertions.assertTrue(candidateProperties.has("legalBoundary"));
        for (String internal : java.util.List.of(
                "candidateName", "jobSlug", "revisions", "createdAt", "createdBy",
                "actorRef", "reason")) {
            org.junit.jupiter.api.Assertions.assertFalse(candidateProperties.has(internal), internal);
        }

        for (String strict : java.util.List.of(
                "OfferTermsRequest", "OfferUpdateRequest", "OfferTransitionRequest",
                "CandidateOfferResponseRequest", "OfferRevisionResponse",
                "OfferWorkspaceResponse", "CandidateOfferResponse")) {
            org.junit.jupiter.api.Assertions.assertTrue(schemas.has(strict), strict);
            org.junit.jupiter.api.Assertions.assertFalse(
                    schemas.path(strict).path("additionalProperties").asBoolean(true), strict);
        }
        org.junit.jupiter.api.Assertions.assertTrue(
                textValues(schemas.path("OfferTermsRequest").path("required"))
                        .containsAll(java.util.Set.of(
                                "roleTitle", "startDate", "employmentType", "workMode", "location",
                                "compensationAmount", "currency", "payPeriod", "expiresAt",
                                "termsSummary")));
        org.junit.jupiter.api.Assertions.assertTrue(
                textValues(schemas.path("OfferUpdateRequest").path("required"))
                        .containsAll(java.util.Set.of("expectedVersion", "reason", "terms")));
        org.junit.jupiter.api.Assertions.assertTrue(
                textValues(schemas.path("CandidateOfferResponseRequest").path("required"))
                        .containsAll(java.util.Set.of(
                                "expectedVersion", "target", "processAcknowledged")));
        org.junit.jupiter.api.Assertions.assertEquals(0,
                schemas.path("OfferTransitionRequest").path("properties")
                        .path("expectedVersion").path("minimum").asInt(-1));

        java.util.Set<String> applicationStatuses = java.util.Set.of(
                "SUBMITTED", "UNDER_REVIEW", "INTERVIEW_PENDING", "OFFER_PENDING",
                "OFFER_ACCEPTED", "OFFER_DECLINED", "OFFER_WITHDRAWN", "HIRED",
                "REJECTED", "WITHDRAWN");
        for (String responseName : java.util.List.of(
                "CandidateApplicationStatusResponse",
                "CandidateApplicationTimelineEventResponse",
                "RecruiterApplicationResponse",
                "RecruiterApplicationSummaryResponse")) {
            org.junit.jupiter.api.Assertions.assertEquals(
                    applicationStatuses,
                    textValues(schemas.path(responseName).path("properties")
                            .path("status").path("enum")),
                    responseName);
        }
        org.junit.jupiter.api.Assertions.assertEquals(
                java.util.Set.of(
                        "WAIT_FOR_REVIEW", "PREPARE_FOR_INTERVIEW", "REVIEW_OFFER",
                        "WAIT_FOR_HIRE_CONFIRMATION", "NONE"),
                textValues(schemas.path("CandidateApplicationStatusResponse")
                        .path("properties").path("nextAction").path("enum")));
        org.junit.jupiter.api.Assertions.assertEquals(
                java.util.Set.of("UNDER_REVIEW", "INTERVIEW_PENDING", "REJECTED"),
                textValues(schemas.path("RecruiterApplicationStatusRequest")
                        .path("properties").path("toStatus").path("enum")),
                "genel status ucu teklif/işe-alım durumlarını üretememeli");
    }

    private static boolean hasRequiredParameter(
            com.fasterxml.jackson.databind.JsonNode operation, String name) {
        return java.util.stream.StreamSupport.stream(
                        operation.path("parameters").spliterator(), false)
                .anyMatch(parameter -> name.equals(parameter.path("name").asText())
                        && parameter.path("required").asBoolean(false));
    }

    private static java.util.Set<String> textValues(com.fasterxml.jackson.databind.JsonNode array) {
        java.util.Set<String> values = new java.util.HashSet<>();
        array.forEach(value -> values.add(value.asText()));
        return java.util.Set.copyOf(values);
    }
}
