package com.ats.provider;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.kernel.JsonValue;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/**
 * Makine-zorlamalı keşif kanıtı (Codex c — iki katman): canlı motordan 2026-07-03'te
 * çekilen /openapi.json PUBLIC-safe snapshot olarak pinlendi (iç host/port/topoloji
 * içermez — publish öncesi tarandı). Bu test, {@link Faz24LiveSttProvider}'ın wire
 * VARSAYIMLARINI spec'e karşı semantik olarak assert eder: adaptörü kırması gereken
 * şey adaptör varsayımının kırılmasıdır; adaptörü etkilemeyen opsiyonel-alan drift'i
 * bu testi KIRMAZ (tam-snapshot diff bilinçli olarak yapılmaz).
 *
 * Snapshot güncelleme akışı: motor contract'ı bilinçli değiştiğinde yeni /openapi.json
 * pinlenir + bu testteki varsayımlar ve adaptör birlikte revize edilir (PR'da
 * sözleşme-değişikliği beyanı).
 */
class LiveSttOpenApiConformanceTest {

    private static JsonValue.JsonObject spec;

    @BeforeAll
    static void loadPinnedSpec() throws IOException {
        try (InputStream in = LiveSttOpenApiConformanceTest.class
                .getResourceAsStream("/live-stt-openapi-v0.1.0.json")) {
            assertNotNull(in, "pinli spec resource eksik");
            spec = (JsonValue.JsonObject) JsonParse.parse(
                    new String(in.readAllBytes(), StandardCharsets.UTF_8));
        }
    }

    private static JsonValue.JsonObject obj(JsonValue.JsonObject parent, String field) {
        JsonValue v = parent.values().get(field);
        assertInstanceOf(JsonValue.JsonObject.class, v, field + " object olmalı");
        return (JsonValue.JsonObject) v;
    }

    private static String str(JsonValue.JsonObject parent, String field) {
        JsonValue v = parent.values().get(field);
        assertInstanceOf(JsonValue.JsonString.class, v, field + " string olmalı");
        return ((JsonValue.JsonString) v).value();
    }

    private static boolean arrayContainsString(JsonValue.JsonObject parent, String field, String needle) {
        JsonValue v = parent.values().get(field);
        if (!(v instanceof JsonValue.JsonArray a)) {
            return false;
        }
        return a.items().stream()
                .anyMatch(i -> i instanceof JsonValue.JsonString s && s.value().equals(needle));
    }

    @Test
    void pinned_spec_identity() {
        JsonValue.JsonObject info = obj(spec, "info");
        assertEquals("live-stt-service", str(info, "title"));
        assertEquals("0.1.0", str(info, "version"));
        assertTrue(str(spec, "openapi").startsWith("3."));
    }

    @Test
    void transcribe_path_is_unversioned_and_v1_variant_absent() {
        JsonValue.JsonObject paths = obj(spec, "paths");
        assertTrue(paths.values().containsKey("/transcribe"), "adaptör varsayımı: POST /transcribe");
        assertFalse(paths.values().containsKey("/v1/transcribe"),
                "keşif kanıtı: eski varsayımsal /v1/transcribe yolu motorda YOK");
    }

    @Test
    void request_is_multipart_with_required_binary_audio_field() {
        JsonValue.JsonObject post = obj(obj(obj(spec, "paths"), "/transcribe"), "post");
        JsonValue.JsonObject content = obj(obj(post, "requestBody"), "content");
        assertTrue(content.values().containsKey("multipart/form-data"),
                "adaptör varsayımı: multipart/form-data gövde");
        JsonValue.JsonObject bodySchema = obj(obj(obj(spec, "components"), "schemas"),
                "Body_transcribe_endpoint_transcribe_post");
        assertTrue(arrayContainsString(bodySchema, "required", "audio"),
                "adaptör varsayımı: alan adı 'audio' zorunlu");
        JsonValue.JsonObject audioProp = obj(obj(bodySchema, "properties"), "audio");
        assertEquals("binary", str(audioProp, "format"), "audio binary dosya alanı olmalı");
    }

    @Test
    void language_is_optional_query_parameter() {
        JsonValue.JsonObject post = obj(obj(obj(spec, "paths"), "/transcribe"), "post");
        JsonValue params = post.values().get("parameters");
        assertInstanceOf(JsonValue.JsonArray.class, params);
        boolean found = false;
        for (JsonValue item : ((JsonValue.JsonArray) params).items()) {
            JsonValue.JsonObject p = (JsonValue.JsonObject) item;
            if ("language".equals(str(p, "name"))) {
                found = true;
                assertEquals("query", str(p, "in"), "language query parametresi olmalı");
                JsonValue required = p.values().get("required");
                boolean requiredTrue = required instanceof JsonValue.JsonBool b && b.value();
                assertFalse(requiredTrue, "language opsiyonel olmalı (adaptör göndermeyebilir)");
            }
        }
        assertTrue(found, "adaptör varsayımı: language query override mevcut");
    }

    @Test
    void response_segments_carry_float_second_times_and_no_speaker_field() {
        JsonValue.JsonObject schemas = obj(obj(spec, "components"), "schemas");
        JsonValue.JsonObject response = obj(schemas, "TranscribeResponse");
        JsonValue.JsonObject responseProps = obj(response, "properties");
        assertTrue(responseProps.values().containsKey("language"));
        assertTrue(responseProps.values().containsKey("segments"));
        assertTrue(arrayContainsString(response, "required", "language"),
                "adaptör varsayımı: language response'ta zorunlu");
        // spec segments'i required saymaz; adaptör bilinçli olarak SIKI (fail-closed) —
        // bkz. Faz24LiveSttProvider.mapTranscribeResponse notu.
        assertFalse(arrayContainsString(response, "required", "segments"),
                "spec gerçeği pinli: segments spec'te optional (adaptör yine de zorunlu sayar)");

        JsonValue.JsonObject segment = obj(schemas, "TranscriptSegment");
        JsonValue.JsonObject segmentProps = obj(segment, "properties");
        assertEquals("number", str(obj(segmentProps, "start"), "type"),
                "adaptör varsayımı: start float-saniye (ms DEĞİL)");
        assertEquals("number", str(obj(segmentProps, "end"), "type"),
                "adaptör varsayımı: end float-saniye (ms DEĞİL)");
        assertTrue(arrayContainsString(segment, "required", "text"));
        assertFalse(segmentProps.values().containsKey("speaker"),
                "keşif kanıtı: motor speaker/diarization SUNMUYOR → sentinel fallback gerekçesi");
        assertFalse(segmentProps.values().containsKey("start_ms"),
                "keşif kanıtı: eski varsayımsal start_ms alanı motorda YOK");
    }
}
