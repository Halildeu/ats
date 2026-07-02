package com.ats.provider;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.contracts.AIProvider.CitationResult;
import com.ats.contracts.AIProvider.Entailment;
import com.ats.contracts.AIProvider.TranscriptResult;
import com.ats.kernel.Outcome;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * GERÇEK-soket stub-sunucu testleri (mock değil; JDK com.sun.net.httpserver) —
 * wire-contract davranışı kanıtlanır. CANLI GPU-host bağlantısı DEĞİLDİR (deploy ayrı iş).
 */
class HttpAIProviderTest {

    private HttpServer server;
    private String baseUrl;
    private final AtomicReference<String> nextBody = new AtomicReference<>("{}");
    private final AtomicReference<Integer> nextStatus = new AtomicReference<>(200);
    private final AtomicReference<String> lastAuthHeader = new AtomicReference<>(null);
    private final AtomicReference<String> lastRequestBody = new AtomicReference<>(null);
    private final AtomicReference<Long> delayMs = new AtomicReference<>(0L);

    @BeforeEach
    void setUp() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        com.sun.net.httpserver.HttpHandler handler = exchange -> {
            lastAuthHeader.set(exchange.getRequestHeaders().getFirst("Authorization"));
            lastRequestBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            try {
                Thread.sleep(delayMs.get());
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
            byte[] body = nextBody.get().getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(nextStatus.get(), body.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(body);
            }
        };
        server.createContext("/v1/transcribe", handler);
        server.createContext("/v1/cite", handler);
        server.start();
        baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
    }

    @AfterEach
    void tearDown() {
        server.stop(0);
    }

    private HttpAIProvider provider() {
        return new HttpAIProvider(baseUrl, Duration.ofSeconds(2), null);
    }

    @Test
    void transcribe_happy_path_parses_wire_contract() {
        nextBody.set("""
                {"language":"tr","segments":[
                  {"speaker":"spk_a","start_ms":0,"end_ms":900,"text":"Merhaba"},
                  {"speaker":"spk_b","start_ms":900,"end_ms":2000,"text":"Hoş geldiniz"}]}""");
        TranscriptResult result = provider().transcribe("i1/rec-" + "a".repeat(64)).asOptional().orElseThrow();
        assertEquals("tr", result.language());
        assertEquals(2, result.segments().size());
        assertEquals("spk_a", result.segments().get(0).speaker());
        assertEquals(900, result.segments().get(0).endMs());
        assertTrue(lastRequestBody.get().contains("\"audio_ref\""), "istek gövdesi wire-contract alanını taşımalı");
    }

    @Test
    void cite_happy_path_maps_schema_entailments() {
        nextBody.set("""
                {"claim":"Aday 5 yil calisti","source_segment_refs":["seg-0","seg-2"],"entailment":"supported"}""");
        CitationResult result = provider().cite("Aday 5 yil calisti", "i1/tr-1").asOptional().orElseThrow();
        assertEquals(Entailment.SUPPORTED, result.entailment());
        assertEquals(2, result.sourceSegmentRefs().size());

        nextBody.set("""
                {"claim":"x","source_segment_refs":[],"entailment":"unsupported"}""");
        assertEquals(Entailment.NOT_SUPPORTED, provider().cite("x", "t").asOptional().orElseThrow().entailment());

        nextBody.set("""
                {"claim":"x","source_segment_refs":[],"entailment":"insufficient"}""");
        assertEquals(Entailment.INSUFFICIENT, provider().cite("x", "t").asOptional().orElseThrow().entailment());
    }

    @Test
    void unknown_entailment_fail_closed_never_rounded() {
        nextBody.set("""
                {"claim":"x","source_segment_refs":[],"entailment":"probably_supported"}""");
        Outcome<CitationResult> out = provider().cite("x", "t");
        assertFalse(out.isOk(), "bilinmeyen entailment bir değere yuvarlanamaz (fail-closed)");
    }

    @Test
    void non_200_fail_closed() {
        nextStatus.set(500);
        assertFalse(provider().transcribe("ref").isOk());
        nextStatus.set(404);
        assertFalse(provider().cite("c", "t").isOk());
    }

    @Test
    void malformed_json_and_missing_fields_fail_closed() {
        nextBody.set("{bozuk json%%");
        assertFalse(provider().transcribe("ref").isOk(), "bozuk JSON fail-closed");
        nextBody.set("{\"language\":\"tr\"}");
        assertFalse(provider().transcribe("ref").isOk(), "segments alanı eksik → fail-closed");
        nextBody.set("""
                {"language":"tr","segments":[{"speaker":"s","start_ms":-5,"end_ms":1,"text":"x"}]}""");
        assertFalse(provider().transcribe("ref").isOk(), "negatif start_ms → fail-closed");
        nextBody.set("""
                {"claim":"x","source_segment_refs":[0],"entailment":"supported"}""");
        assertFalse(provider().cite("x", "t").isOk(), "ref array'inde string-dışı eleman → fail-closed");
        // Codex blocker-1: bozuk \\u escape RuntimeException DEĞİL Outcome.fail üretmeli
        nextBody.set("{\"language\":\"tr\",\"segments\":[{\"speaker\":\"s\",\"start_ms\":0,\"end_ms\":1,\"text\":\"\\\\uZZZZ\"}]}");
        assertFalse(provider().transcribe("ref").isOk(), "bozuk unicode-escape fail-closed Outcome olmalı");
    }

    @Test
    void reversed_or_overflowing_segment_range_fail_closed() {
        nextBody.set("""
                {"language":"tr","segments":[{"speaker":"s","start_ms":900,"end_ms":100,"text":"x"}]}""");
        assertFalse(provider().transcribe("ref").isOk(), "end_ms < start_ms ters aralık fail-closed (Codex blocker-2)");
        nextBody.set("""
                {"language":"tr","segments":[{"speaker":"s","start_ms":1e20,"end_ms":1e20,"text":"x"}]}""");
        assertFalse(provider().transcribe("ref").isOk(), "2^53-1 üstü long-dışı değer fail-closed");
    }

    @Test
    void timeout_fail_closed() {
        delayMs.set(3000L);
        nextBody.set("{\"language\":\"tr\",\"segments\":[]}");
        HttpAIProvider fast = new HttpAIProvider(baseUrl, Duration.ofMillis(200), null);
        Outcome<TranscriptResult> out = fast.transcribe("ref");
        assertFalse(out.isOk(), "timeout fail-closed (retry üst katmanın kararı)");
        delayMs.set(0L);
    }

    @Test
    void unreachable_host_fail_closed() {
        HttpAIProvider dead = new HttpAIProvider("http://127.0.0.1:1", Duration.ofMillis(300), null);
        assertFalse(dead.transcribe("ref").isOk());
    }

    @Test
    void bearer_token_sent_when_configured_and_absent_otherwise() {
        nextBody.set("{\"language\":\"tr\",\"segments\":[]}");
        new HttpAIProvider(baseUrl, Duration.ofSeconds(2), "test-opaque-token").transcribe("ref");
        assertEquals("Bearer test-opaque-token", lastAuthHeader.get());
        provider().transcribe("ref");
        assertEquals(null, lastAuthHeader.get(), "token yapılandırılmadıysa Authorization header YOK");
    }

    @Test
    void blank_inputs_rejected_before_network() {
        assertFalse(provider().transcribe(" ").isOk());
        assertFalse(provider().cite(" ", "t").isOk());
        assertFalse(provider().cite("c", " ").isOk());
    }

    @Test
    void empty_segments_accepted_wire_valid() {
        nextBody.set("{\"language\":\"tr\",\"segments\":[]}");
        TranscriptResult result = provider().transcribe("ref").asOptional().orElseThrow();
        assertNotNull(result.segments());
        assertEquals(0, result.segments().size(), "boş segment listesi wire-valid (fail-closed kararı üst katmanda)");
    }
}
