package com.ats.provider;

import com.ats.contracts.AIProvider;
import com.ats.kernel.JsonValue;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * ATS-0017 (Accepted) — Faz 24 self-host STT/diarization motoru HTTP adaptörü
 * (`AIProvider` portunun arkasında; ADR: kopya değil provider-entegrasyon).
 *
 * Wire-contract (ats-ai FastAPI):
 *  POST {base}/v1/transcribe  {"audio_ref": "..."}         → 200 {"language": "...",
 *      "segments": [{"speaker": "...", "start_ms": n, "end_ms": n, "text": "..."}]}
 *  POST {base}/v1/cite        {"claim": "...", "transcript_ref": "..."} → 200 {"claim": "...",
 *      "source_segment_refs": ["seg-0", ...], "entailment": "supported|unsupported|insufficient"}
 *
 * FAIL-CLOSED: non-200 / bozuk JSON / eksik-yanlış-tipli alan / bilinmeyen entailment /
 * timeout-IO → Outcome.fail (asla kısmi/uydurma sonuç dönmez; retry ÜST katmanın kararı).
 * DÜRÜST SINIR: bu sınıf wire-contract'tır — canlı GPU-host erişimi/deploy + mTLS/secret
 * yönetimi AYRI deployment işi; kalite iddiası yok (Gate C şartı sürer). Bearer token
 * opsiyoneldir ve loglanmaz/toString'e girmez.
 */
public final class HttpAIProvider implements AIProvider {

    private final HttpClient client;
    private final URI transcribeUri;
    private final URI citeUri;
    private final Duration requestTimeout;
    private final String bearerToken;

    public HttpAIProvider(String baseUrl, Duration requestTimeout, String bearerTokenOrNull) {
        this(HttpClient.newBuilder().connectTimeout(requestTimeout).build(),
                baseUrl, requestTimeout, bearerTokenOrNull);
    }

    HttpAIProvider(HttpClient client, String baseUrl, Duration requestTimeout, String bearerTokenOrNull) {
        if (baseUrl == null || baseUrl.isBlank()) {
            throw new IllegalArgumentException("baseUrl zorunlu");
        }
        String base = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.client = client;
        this.transcribeUri = URI.create(base + "/v1/transcribe");
        this.citeUri = URI.create(base + "/v1/cite");
        this.requestTimeout = requestTimeout;
        this.bearerToken = bearerTokenOrNull;
    }

    @Override
    public Outcome<TranscriptResult> transcribe(String audioRef) {
        if (audioRef == null || audioRef.isBlank()) {
            return Outcome.fail(OutcomeCode.INVALID, "audioRef zorunlu");
        }
        Outcome<JsonValue> body = post(transcribeUri,
                "{\"audio_ref\":" + jsonString(audioRef) + "}");
        if (!(body instanceof Outcome.Ok<JsonValue> ok)) {
            return Outcome.fail(((Outcome.Fail<JsonValue>) body).code(), ((Outcome.Fail<JsonValue>) body).reason());
        }
        try {
            JsonValue.JsonObject root = asObject(ok.value(), "root");
            String language = asString(root, "language");
            List<TranscriptSegment> segments = new ArrayList<>();
            for (JsonValue item : asArray(root, "segments").items()) {
                JsonValue.JsonObject seg = asObject(item, "segments[]");
                segments.add(new TranscriptSegment(
                        asString(seg, "speaker"),
                        asLong(seg, "start_ms"),
                        asLong(seg, "end_ms"),
                        asString(seg, "text")));
            }
            return Outcome.ok(new TranscriptResult(language, segments));
        } catch (WireContractException e) {
            return Outcome.fail(OutcomeCode.INVALID, "sağlayıcı cevabı wire-contract dışı (fail-closed): " + e.getMessage());
        }
    }

    @Override
    public Outcome<CitationResult> cite(String claim, String transcriptRef) {
        if (claim == null || claim.isBlank() || transcriptRef == null || transcriptRef.isBlank()) {
            return Outcome.fail(OutcomeCode.INVALID, "claim + transcriptRef zorunlu");
        }
        Outcome<JsonValue> body = post(citeUri,
                "{\"claim\":" + jsonString(claim) + ",\"transcript_ref\":" + jsonString(transcriptRef) + "}");
        if (!(body instanceof Outcome.Ok<JsonValue> ok)) {
            return Outcome.fail(((Outcome.Fail<JsonValue>) body).code(), ((Outcome.Fail<JsonValue>) body).reason());
        }
        try {
            JsonValue.JsonObject root = asObject(ok.value(), "root");
            String resultClaim = asString(root, "claim");
            List<String> refs = new ArrayList<>();
            for (JsonValue item : asArray(root, "source_segment_refs").items()) {
                if (!(item instanceof JsonValue.JsonString str)) {
                    throw new WireContractException("source_segment_refs[] string olmalı");
                }
                refs.add(str.value());
            }
            Entailment entailment = switch (asString(root, "entailment")) {
                case "supported" -> Entailment.SUPPORTED;
                case "unsupported" -> Entailment.NOT_SUPPORTED;
                case "insufficient" -> Entailment.INSUFFICIENT;
                // fail-closed: bilinmeyen entailment ASLA bir değere yuvarlanmaz
                default -> throw new WireContractException("bilinmeyen entailment");
            };
            return Outcome.ok(new CitationResult(resultClaim, refs, entailment));
        } catch (WireContractException e) {
            return Outcome.fail(OutcomeCode.INVALID, "sağlayıcı cevabı wire-contract dışı (fail-closed): " + e.getMessage());
        }
    }

    private Outcome<JsonValue> post(URI uri, String jsonBody) {
        HttpRequest.Builder builder = HttpRequest.newBuilder(uri)
                .timeout(requestTimeout)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(jsonBody, StandardCharsets.UTF_8));
        if (bearerToken != null && !bearerToken.isBlank()) {
            builder.header("Authorization", "Bearer " + bearerToken);
        }
        HttpResponse<String> response;
        try {
            response = client.send(builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        } catch (IOException e) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "sağlayıcıya ulaşılamadı/timeout (fail-closed)");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "istek kesildi (fail-closed)");
        }
        if (response.statusCode() != 200) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED,
                    "sağlayıcı HTTP " + response.statusCode() + " döndü (fail-closed)");
        }
        try {
            return Outcome.ok(JsonParse.parse(response.body()));
        } catch (JsonParse.JsonParseException e) {
            return Outcome.fail(OutcomeCode.INVALID, "sağlayıcı cevabı geçersiz JSON (fail-closed): " + e.getMessage());
        }
    }

    private static final class WireContractException extends RuntimeException {
        WireContractException(String message) {
            super(message);
        }
    }

    private static JsonValue.JsonObject asObject(JsonValue v, String field) {
        if (!(v instanceof JsonValue.JsonObject o)) {
            throw new WireContractException(field + " object olmalı");
        }
        return o;
    }

    private static JsonValue.JsonArray asArray(JsonValue.JsonObject o, String field) {
        JsonValue v = o.values().get(field);
        if (!(v instanceof JsonValue.JsonArray a)) {
            throw new WireContractException(field + " array olmalı");
        }
        return a;
    }

    private static String asString(JsonValue.JsonObject o, String field) {
        JsonValue v = o.values().get(field);
        if (!(v instanceof JsonValue.JsonString s) || s.value().isBlank()) {
            throw new WireContractException(field + " non-blank string olmalı");
        }
        return s.value();
    }

    private static long asLong(JsonValue.JsonObject o, String field) {
        JsonValue v = o.values().get(field);
        if (!(v instanceof JsonValue.JsonNumber n) || n.value() < 0 || n.value() != Math.rint(n.value())) {
            throw new WireContractException(field + " negatif-olmayan tamsayı olmalı");
        }
        return (long) n.value();
    }

    private static String jsonString(String s) {
        StringBuilder sb = new StringBuilder("\"");
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> {
                    if (c < 0x20) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
                }
            }
        }
        return sb.append('"').toString();
    }
}
