package com.ats.provider;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.contracts.AIProvider;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Arrays;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * Keşfedilen live-stt wire-contract'ını (2026-07-03 canlı /openapi.json) birebir
 * konuşan JDK HttpServer stub'ı ile adaptör testleri. Stub, gerçek motorun cevap
 * şeklini taklit eder: float-saniye start/end, speaker alanı YOK, multipart giriş.
 */
class Faz24LiveSttProviderTest {

    private static final byte[] WAV_BYTES =
            "RIFFxxxxWAVEfmt-synthetic-audio-bytes".getBytes(StandardCharsets.US_ASCII);

    private static final String HAPPY_BODY = """
            {"text":"merhaba dunya","language":"tr","language_probability":0.98,
             "duration":3.0,"elapsed_ms":120,"model":"medium","compute_type":"float16",
             "device":"cuda","segments":[
               {"id":0,"start":0.0,"end":1.48,"text":"merhaba","avg_logprob":-0.2,"no_speech_prob":0.01},
               {"id":1,"start":1.5,"end":3.0,"text":"dunya"}]}
            """;

    private static HttpServer server;
    private static int port;

    private static volatile int responseStatus;
    private static volatile String responseBody;
    private static volatile String lastQuery;
    private static volatile String lastContentTypeHeader;
    private static volatile byte[] lastRequestBody;
    private static volatile java.util.Map<String, java.util.List<String>> lastRequestHeaders;
    private static final AtomicInteger CALLS = new AtomicInteger();

    @BeforeAll
    static void startStub() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/transcribe", exchange -> {
            CALLS.incrementAndGet();
            lastQuery = exchange.getRequestURI().getQuery();
            lastContentTypeHeader = exchange.getRequestHeaders().getFirst("Content-Type");
            lastRequestHeaders = java.util.Map.copyOf(exchange.getRequestHeaders());
            lastRequestBody = exchange.getRequestBody().readAllBytes();
            byte[] out = responseBody.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(responseStatus, out.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(out);
            }
        });
        server.start();
        port = server.getAddress().getPort();
    }

    @AfterAll
    static void stopStub() {
        server.stop(0);
    }

    @BeforeEach
    void reset() {
        responseStatus = 200;
        responseBody = HAPPY_BODY;
        lastQuery = null;
        lastContentTypeHeader = null;
        lastRequestBody = null;
        lastRequestHeaders = null;
        CALLS.set(0);
    }

    private static AudioSource okSource() {
        return ref -> Outcome.ok(new AudioSource.AudioBlob(WAV_BYTES, "audio/wav"));
    }

    private static Faz24LiveSttProvider provider(String languageOverrideOrNull, AudioSource source) {
        return new Faz24LiveSttProvider(HttpClient.newHttpClient(),
                "http://127.0.0.1:" + port, Duration.ofSeconds(5), source, languageOverrideOrNull, true);
    }

    // ---- multipart yardımcıları (stub tarafı doğrulama) ----

    private record ParsedPart(String headers, byte[] payload) {}

    private static ParsedPart parseSinglePart(byte[] body, String contentTypeHeader) {
        assertTrue(contentTypeHeader.startsWith("multipart/form-data; boundary="),
                "multipart content-type bekleniyordu: " + contentTypeHeader);
        String boundary = contentTypeHeader.substring("multipart/form-data; boundary=".length());
        String ascii = new String(body, StandardCharsets.ISO_8859_1);
        String opener = "--" + boundary + "\r\n";
        String closer = "\r\n--" + boundary + "--\r\n";
        assertTrue(ascii.startsWith(opener), "gövde boundary ile başlamalı");
        assertTrue(ascii.endsWith(closer), "gövde kapanış boundary'si ile bitmeli");
        int headerEnd = ascii.indexOf("\r\n\r\n");
        assertTrue(headerEnd > 0, "part header'ları bulunamadı");
        String headers = ascii.substring(opener.length(), headerEnd);
        byte[] payload = Arrays.copyOfRange(body, headerEnd + 4, body.length - closer.length());
        return new ParsedPart(headers, payload);
    }

    // ---- mutlu yol + istek şekli ----

    @Test
    void happy_path_maps_discovered_contract_to_transcript_result() {
        Outcome<AIProvider.TranscriptResult> out = provider("tr", okSource()).transcribe("rec-1");
        assertInstanceOf(Outcome.Ok.class, out, "mutlu yol ok olmalı: " + out);
        AIProvider.TranscriptResult result = ((Outcome.Ok<AIProvider.TranscriptResult>) out).value();
        assertEquals("tr", result.language());
        assertEquals(2, result.segments().size());
        assertEquals(0L, result.segments().get(0).startMs());
        assertEquals(1480L, result.segments().get(0).endMs());
        assertEquals(1500L, result.segments().get(1).startMs());
        assertEquals(3000L, result.segments().get(1).endMs());
        assertEquals("merhaba", result.segments().get(0).text());
        // Codex (d): konuşmacı çıkarımı YOK — tüm segmentler aynı sentinel label
        for (AIProvider.TranscriptSegment seg : result.segments()) {
            assertEquals(Faz24LiveSttProvider.UNDIARIZED_STREAM, seg.speaker());
        }
        // gov1-1b: sağlayıcının RAPORLADIĞI model kimliği zarfa taşınır (HAPPY_BODY "model":"medium").
        // Versiyon SUNULMAZ → null. Enforcement gov1-1c'de; burada yalnız envelope.
        assertEquals("medium", result.modelIdentity().reportedModelId());
        assertEquals(null, result.modelIdentity().reportedModelVersion(),
                "live-stt model-versiyonu sunmaz → null");
        assertEquals(1, CALLS.get());
        assertEquals("language=tr", lastQuery);
        ParsedPart part = parseSinglePart(lastRequestBody, lastContentTypeHeader);
        assertTrue(part.headers().contains("name=\"audio\""), "alan adı audio olmalı");
        assertTrue(part.headers().contains("filename=\"audio\""), "sabit güvenli filename");
        assertTrue(part.headers().contains("Content-Type: audio/wav"));
        assertArrayEquals(WAV_BYTES, part.payload(), "audio baytları bozulmadan gitmeli");
    }

    @Test
    void request_is_pinned_http11_without_h2c_upgrade_headers() {
        // 2026-07-03 CANLI bulgudan türetilmiş deterministik transport invariant'ı
        // (Codex blocker): motorun uvicorn/h11 yığını h2c-upgrade header'lı istekte
        // multipart body'yi işlemiyor. JDK HttpServer stub'ı upgrade'i tolere ettiği
        // için canlı test olmadan bu satır silinse CI yeşil kalırdı — bu test
        // .version(HTTP_1_1) pin'i kaldırılırsa KIRMIZI olur (negatif self-test ile
        // doğrulandı: pin'siz koşuda Upgrade+HTTP2-Settings header'ları görünür).
        Outcome<AIProvider.TranscriptResult> out = provider(null, okSource()).transcribe("rec-1");
        assertInstanceOf(Outcome.Ok.class, out);
        assertFalse(lastRequestHeaders.containsKey("Upgrade"),
                "h2c Upgrade header'ı GÖNDERİLMEMELİ (HTTP/1.1 pin)");
        assertFalse(lastRequestHeaders.containsKey("Http2-settings")
                        || lastRequestHeaders.containsKey("HTTP2-Settings"),
                "HTTP2-Settings header'ı GÖNDERİLMEMELİ");
        for (String connection : lastRequestHeaders.getOrDefault("Connection", java.util.List.of())) {
            assertFalse(connection.toLowerCase().contains("upgrade"),
                    "Connection header'ı Upgrade içermemeli: " + connection);
        }
    }

    @Test
    void no_language_override_sends_no_query() {
        Outcome<AIProvider.TranscriptResult> out = provider(null, okSource()).transcribe("rec-1");
        assertInstanceOf(Outcome.Ok.class, out);
        assertEquals(null, lastQuery);
    }

    @Test
    void empty_segments_array_is_valid_empty_transcript() {
        responseBody = "{\"language\":\"tr\",\"segments\":[]}";
        Outcome<AIProvider.TranscriptResult> out = provider(null, okSource()).transcribe("rec-1");
        assertEquals(0, ((Outcome.Ok<AIProvider.TranscriptResult>) out).value().segments().size());
    }

    // ---- gov1-1b: sağlayıcı-raporlu model kimliği zarfı (envelope-only; enforcement 1c) ----

    @Test
    void missing_model_field_yields_not_reported_identity() {
        // "model" alanı yoksa → raporlanmadı (iki alan da null); transcript geçerli kalır
        responseBody = "{\"language\":\"tr\",\"segments\":[]}";
        AIProvider.TranscriptResult result = ((Outcome.Ok<AIProvider.TranscriptResult>)
                provider(null, okSource()).transcribe("rec-1")).value();
        assertEquals(null, result.modelIdentity().reportedModelId(), "model yoksa raporlanmadı → null");
        assertEquals(null, result.modelIdentity().reportedModelVersion());
    }

    @Test
    void malformed_model_value_reduced_to_null_transcript_survives() {
        // present-ama-malformed (boşluk + '://' → allowlist-dışı) → GÜVENLİ temsil (null'a indir);
        // iyi transcript FAIL edilMEZ (envelope-only) ve ham değer taşınmaz.
        responseBody = "{\"language\":\"tr\",\"model\":\"bad model://x\",\"segments\":[]}";
        Outcome<AIProvider.TranscriptResult> out = provider(null, okSource()).transcribe("rec-1");
        assertInstanceOf(Outcome.Ok.class, out, "malformed model transcript'i düşürmemeli: " + out);
        AIProvider.TranscriptResult result = ((Outcome.Ok<AIProvider.TranscriptResult>) out).value();
        assertEquals(null, result.modelIdentity().reportedModelId(), "malformed reported model → null'a indirilmeli");
    }

    // ---- fail-closed cevap-map vakaları ----

    private static Outcome.Fail<AIProvider.TranscriptResult> expectFail(
            String body, OutcomeCode expectedCode) {
        responseBody = body;
        Outcome<AIProvider.TranscriptResult> out = provider(null, okSource()).transcribe("rec-1");
        Outcome.Fail<AIProvider.TranscriptResult> fail =
                assertInstanceOf(Outcome.Fail.class, out, "fail bekleniyordu: " + out);
        assertEquals(expectedCode, fail.code());
        return fail;
    }

    @Test
    void blank_text_segment_fails_closed_not_dropped() {
        // Bilinçli karar (Codex a): DROP motor davranışını maskeler → FAIL
        expectFail("{\"language\":\"tr\",\"segments\":[{\"start\":0.0,\"end\":1.0,\"text\":\"  \"}]}",
                OutcomeCode.INVALID);
    }

    @Test
    void reversed_raw_interval_fails_closed() {
        expectFail("{\"language\":\"tr\",\"segments\":[{\"start\":2.0,\"end\":1.0,\"text\":\"x\"}]}",
                OutcomeCode.INVALID);
    }

    @Test
    void negative_start_fails_closed() {
        expectFail("{\"language\":\"tr\",\"segments\":[{\"start\":-0.5,\"end\":1.0,\"text\":\"x\"}]}",
                OutcomeCode.INVALID);
    }

    @Test
    void non_finite_time_fails_closed() {
        // 1e999 → double Infinity; parse veya guard katmanından bağımsız INVALID
        expectFail("{\"language\":\"tr\",\"segments\":[{\"start\":1e999,\"end\":1e999,\"text\":\"x\"}]}",
                OutcomeCode.INVALID);
    }

    @Test
    void seconds_overflowing_safe_millis_fail_closed() {
        expectFail("{\"language\":\"tr\",\"segments\":[{\"start\":0.0,\"end\":1e16,\"text\":\"x\"}]}",
                OutcomeCode.INVALID);
    }

    @Test
    void missing_segments_field_fails_closed_adapter_stricter_than_spec() {
        // spec'te segments required değil; adaptör bilinçli SIKI (fail-closed)
        expectFail("{\"language\":\"tr\",\"text\":\"merhaba\"}", OutcomeCode.INVALID);
    }

    @Test
    void missing_or_blank_language_fails_closed() {
        expectFail("{\"segments\":[]}", OutcomeCode.INVALID);
        expectFail("{\"language\":\"\",\"segments\":[]}", OutcomeCode.INVALID);
    }

    @Test
    void non_numeric_time_fails_closed() {
        expectFail("{\"language\":\"tr\",\"segments\":[{\"start\":\"0\",\"end\":1.0,\"text\":\"x\"}]}",
                OutcomeCode.INVALID);
    }

    @Test
    void broken_json_fails_closed() {
        expectFail("{not-json", OutcomeCode.INVALID);
    }

    // ---- HTTP hata haritası (keşfedilen error map) ----

    private void expectStatusMapped(int status, OutcomeCode expected) {
        reset();
        responseStatus = status;
        responseBody = "{}";
        Outcome<AIProvider.TranscriptResult> out = provider(null, okSource()).transcribe("rec-1");
        Outcome.Fail<AIProvider.TranscriptResult> fail = assertInstanceOf(Outcome.Fail.class, out);
        assertEquals(expected, fail.code(), "HTTP " + status + " yanlış koda map edildi");
    }

    @Test
    void input_rejection_statuses_map_to_invalid() {
        expectStatusMapped(400, OutcomeCode.INVALID);
        expectStatusMapped(413, OutcomeCode.INVALID);
        expectStatusMapped(415, OutcomeCode.INVALID);
        expectStatusMapped(422, OutcomeCode.INVALID);
    }

    @Test
    void transport_config_capacity_statuses_map_to_not_configured() {
        expectStatusMapped(401, OutcomeCode.NOT_CONFIGURED);
        expectStatusMapped(403, OutcomeCode.NOT_CONFIGURED);
        expectStatusMapped(404, OutcomeCode.NOT_CONFIGURED);
        expectStatusMapped(500, OutcomeCode.NOT_CONFIGURED);
        expectStatusMapped(502, OutcomeCode.NOT_CONFIGURED);
        expectStatusMapped(503, OutcomeCode.NOT_CONFIGURED);
        expectStatusMapped(504, OutcomeCode.NOT_CONFIGURED);
    }

    // ---- giriş guard'ları (HTTP çağrısı YAPILMADAN fail) ----

    @Test
    void blank_audio_ref_fails_before_http() {
        Outcome<AIProvider.TranscriptResult> out = provider(null, okSource()).transcribe("  ");
        assertEquals(OutcomeCode.INVALID, ((Outcome.Fail<AIProvider.TranscriptResult>) out).code());
        assertEquals(0, CALLS.get());
    }

    @Test
    void audio_source_failure_passes_through_code_and_reason_before_http() {
        AudioSource failing = ref -> Outcome.fail(OutcomeCode.NOT_FOUND, "ref yetkisiz/yok");
        Outcome<AIProvider.TranscriptResult> out = provider(null, failing).transcribe("rec-1");
        Outcome.Fail<AIProvider.TranscriptResult> fail = assertInstanceOf(Outcome.Fail.class, out);
        assertEquals(OutcomeCode.NOT_FOUND, fail.code());
        assertEquals("ref yetkisiz/yok", fail.reason());
        assertEquals(0, CALLS.get());
    }

    @Test
    void empty_audio_bytes_fail_before_http() {
        AudioSource empty = ref -> Outcome.ok(new AudioSource.AudioBlob(new byte[0], "audio/wav"));
        Outcome<AIProvider.TranscriptResult> out = provider(null, empty).transcribe("rec-1");
        assertEquals(OutcomeCode.INVALID, ((Outcome.Fail<AIProvider.TranscriptResult>) out).code());
        assertEquals(0, CALLS.get());
    }

    @Test
    void content_type_outside_allowlist_fails_before_http() {
        AudioSource wrong = ref -> Outcome.ok(new AudioSource.AudioBlob(WAV_BYTES, "text/plain"));
        Outcome<AIProvider.TranscriptResult> out = provider(null, wrong).transcribe("rec-1");
        assertEquals(OutcomeCode.INVALID, ((Outcome.Fail<AIProvider.TranscriptResult>) out).code());
        assertEquals(0, CALLS.get());
    }

    @Test
    void header_injection_shaped_content_type_rejected_before_http() {
        AudioSource evil = ref -> Outcome.ok(
                new AudioSource.AudioBlob(WAV_BYTES, "audio/wav\r\nX-Evil: 1"));
        Outcome<AIProvider.TranscriptResult> out = provider(null, evil).transcribe("rec-1");
        assertEquals(OutcomeCode.INVALID, ((Outcome.Fail<AIProvider.TranscriptResult>) out).code());
        assertEquals(0, CALLS.get());
    }

    // ---- multipart boundary collision ----

    @Test
    void boundary_collision_in_audio_bytes_derives_new_boundary() {
        byte[] colliding = ("xx--ats-live-stt-boundary--yy").getBytes(StandardCharsets.US_ASCII);
        Faz24LiveSttProvider.EncodedMultipart encoded =
                Faz24LiveSttProvider.encodeMultipart(colliding, "audio/wav");
        assertNotEquals("ats-live-stt-boundary", encoded.boundary(), "collision'da yeni boundary türetilmeli");
        assertEquals("ats-live-stt-boundary-1", encoded.boundary());
    }

    @Test
    void colliding_audio_roundtrips_intact_end_to_end() {
        byte[] colliding = ("A--ats-live-stt-boundary-B").getBytes(StandardCharsets.US_ASCII);
        AudioSource source = ref -> Outcome.ok(new AudioSource.AudioBlob(colliding, "audio/wav"));
        Outcome<AIProvider.TranscriptResult> out = provider(null, source).transcribe("rec-1");
        assertInstanceOf(Outcome.Ok.class, out);
        ParsedPart part = parseSinglePart(lastRequestBody, lastContentTypeHeader);
        assertArrayEquals(colliding, part.payload(), "collision audio'su bozulmadan gitmeli");
    }

    // ---- cite: bu motorda YOK ----

    @Test
    void cite_is_not_configured_no_delegation() {
        Outcome<AIProvider.CitationResult> out = provider(null, okSource()).cite("claim", "tr-ref");
        Outcome.Fail<AIProvider.CitationResult> fail = assertInstanceOf(Outcome.Fail.class, out);
        assertEquals(OutcomeCode.NOT_CONFIGURED, fail.code());
        assertEquals(0, CALLS.get());
    }

    // ---- constructor guard'ları (Codex zorunlu-revizyon-2: HTTPS kodda) ----

    @Nested
    class ConstructorGuards {

        @Test
        void public_constructor_accepts_https() {
            new Faz24LiveSttProvider("https://stt.example.internal:8243",
                    Duration.ofSeconds(5), okSource(), "tr");
        }

        @Test
        void public_constructor_rejects_plaintext_even_loopback() {
            assertThrows(IllegalArgumentException.class, () -> new Faz24LiveSttProvider(
                    "http://127.0.0.1:8200", Duration.ofSeconds(5), okSource(), null));
        }

        @Test
        void test_constructor_rejects_plaintext_for_non_loopback() {
            assertThrows(IllegalArgumentException.class, () -> new Faz24LiveSttProvider(
                    HttpClient.newHttpClient(), "http://stt.example.internal:8200",
                    Duration.ofSeconds(5), okSource(), null, true));
        }

        @Test
        void invalid_language_override_rejected() {
            assertThrows(IllegalArgumentException.class, () -> new Faz24LiveSttProvider(
                    "https://x", Duration.ofSeconds(5), okSource(), "türkçe"));
            assertThrows(IllegalArgumentException.class, () -> new Faz24LiveSttProvider(
                    "https://x", Duration.ofSeconds(5), okSource(), "TR"));
        }

        @Test
        void non_positive_timeout_rejected() {
            assertThrows(IllegalArgumentException.class, () -> new Faz24LiveSttProvider(
                    "https://x", Duration.ZERO, okSource(), null));
        }

        @Test
        void null_audio_source_rejected() {
            assertThrows(IllegalArgumentException.class, () -> new Faz24LiveSttProvider(
                    "https://x", Duration.ofSeconds(5), null, null));
        }
    }

    // ---- rounding hassasiyeti ----

    @Test
    void seconds_round_half_up_to_millis() {
        responseBody = "{\"language\":\"tr\",\"segments\":"
                + "[{\"start\":1.0004,\"end\":1.0006,\"text\":\"x\"}]}";
        Outcome<AIProvider.TranscriptResult> out = provider(null, okSource()).transcribe("rec-1");
        AIProvider.TranscriptSegment seg =
                ((Outcome.Ok<AIProvider.TranscriptResult>) out).value().segments().get(0);
        assertEquals(1000L, seg.startMs());
        assertEquals(1001L, seg.endMs());
        assertFalse(seg.endMs() < seg.startMs());
    }
}
