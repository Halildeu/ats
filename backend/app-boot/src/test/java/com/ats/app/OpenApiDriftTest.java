package com.ats.app;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.fail;

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
            // CI ortamında target artefaktına doğrudan erişilemeyebilir. Yalnız API
            // metadatası olan canonical OpenAPI'yi belirgin sınırlar arasında logla;
            // böylece bilinçli sözleşme değişikliği fail çıktısından incelenip pinlenebilir.
            System.err.println("OPENAPI_LIVE_CANONICAL_BEGIN");
            System.err.println(liveCanonical);
            System.err.println("OPENAPI_LIVE_CANONICAL_END");
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
    void screening_union_and_closed_required_schemas_are_pinned_semantically() throws Exception {
        com.fasterxml.jackson.databind.JsonNode snap = new com.fasterxml.jackson.databind.ObjectMapper()
                .readTree(getClass().getResourceAsStream("/openapi-snapshot.json"));
        com.fasterxml.jackson.databind.JsonNode requestSchema = snap.path("paths")
                .path("/api/v1/interviews/{interviewId}/screenings").path("post")
                .path("requestBody").path("content").path("application/json").path("schema");
        org.junit.jupiter.api.Assertions.assertEquals("object", requestSchema.path("type").asText());
        org.junit.jupiter.api.Assertions.assertEquals(2, requestSchema.path("oneOf").size());
        com.fasterxml.jackson.databind.JsonNode responses = snap.path("paths")
                .path("/api/v1/interviews/{interviewId}/screenings").path("post")
                .path("responses");
        org.junit.jupiter.api.Assertions.assertTrue(
                responses.path("200").path("headers").has("X-ATS-Replay"));
        org.junit.jupiter.api.Assertions.assertTrue(
                responses.path("201").path("headers").has("X-ATS-Replay"));

        com.fasterxml.jackson.databind.JsonNode schemas = snap.path("components").path("schemas");
        for (String name : java.util.List.of(
                "TranscriptSegmentScreeningRequest", "CitationClaimScreeningRequest",
                "ScreeningSource", "ScreeningTextSpan", "ScreeningFinding",
                "ScreeningEvidence", "ScreeningError")) {
            com.fasterxml.jackson.databind.JsonNode schema = schemas.path(name);
            org.junit.jupiter.api.Assertions.assertFalse(schema.isMissingNode(), name);
            org.junit.jupiter.api.Assertions.assertFalse(
                    schema.path("additionalProperties").asBoolean(true), name);
            org.junit.jupiter.api.Assertions.assertTrue(schema.path("required").isArray(), name);
            org.junit.jupiter.api.Assertions.assertFalse(schema.path("required").isEmpty(), name);
        }
    }
}
