package com.ats.provider;

import com.ats.contracts.AIProvider;
import com.ats.kernel.JsonValue;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import javax.net.ssl.SSLContext;

/**
 * ATS-0017 amendment (2026-07-03 canlı keşif) — Faz 24 self-host live-stt motorunun
 * (faster-whisper, FastAPI "live-stt-service" v0.1.0) GERÇEK wire-contract adaptörü.
 * Keşif, {@link HttpAIProvider}'ın varsayımsal {@code /v1/transcribe} JSON
 * contract'ını yanlışladı; bu sınıf keşfedilen contract'ı konuşur:
 *
 * <pre>
 *   POST {base}/transcribe[?language=xx]   (multipart/form-data; alan adı "audio")
 *     → 200 {"language":"tr", ..., "segments":[{"id":0,"start":0.0,"end":1.5,"text":"..."}]}
 * </pre>
 *
 * DÜRÜST SINIRLAR:
 * <ul>
 *   <li>Motor speaker/diarization SUNMUYOR (spec: "Diarization separate") — tüm
 *       segmentler tek sentinel provider-label {@link #UNDIARIZED_STREAM} alır.
 *       Bu bir diarization sonucu DEĞİLDİR; tek-akış fallback'idir (ATS-0013).
 *       SegmentSanitizer bu label'ı S1'e pseudonymize eder; konuşmacı sayısı/kimliği
 *       iddiası üretilmez.</li>
 *   <li>{@link #cite} bu motorda yok → NOT_CONFIGURED (başka adaptöre delege YOK;
 *       composite provider ayrı boot-wiring diliminin açık kompozisyon işidir).</li>
 *   <li>Kanonik transport mTLS reverse-proxy'dir: public constructor {@code https}
 *       ZORUNLU kılar; plaintext yalnız package-private test constructor'ında ve
 *       yalnız loopback host için açılabilir (deploy yanlışı derlemede/kurulumda
 *       yakalansın diye javadoc değil KOD guard'ı).</li>
 * </ul>
 *
 * FAIL-CLOSED: non-200 / bozuk JSON / eksik-yanlış-tipli alan / NaN-Inf-negatif zaman /
 * ters aralık (raw VE round-sonrası) / blank text / blank language / allowlist-dışı
 * contentType → Outcome.fail. Kısmi/uydurma sonuç asla dönmez; retry ÜST katmanın kararı.
 * Blank-text segment bilinçli olarak DROP değil FAIL'dir: sessiz düşürme motor
 * davranışını maskeler ve zaman çizelgesini değiştirir; canlıda normal olduğu
 * gözlenirse gevşetme ayrı, bilinçli bir iterasyondur.
 */
public final class Faz24LiveSttProvider implements AIProvider {

    /** ATS-0013: diarization yok — tek-akış sentinel'i (konuşmacı/kimlik iddiası değildir). */
    public static final String UNDIARIZED_STREAM = "undiarized_stream";

    /**
     * Bilinçli eşleme: ATS ingest allowlist'inin aynası (ingest-media UploadRequest ile
     * aynı küme) — store'da yalnız bu tipler bulunabilir. Motor ffmpeg-sniff yapar;
     * reddederse HTTP 400 → INVALID yüzeyine düşer. Kapalı küme olduğu için CR/LF/quote
     * içeremez → multipart header-injection yapısal olarak imkânsız.
     */
    static final Set<String> ALLOWED_CONTENT_TYPES = Set.of(
            "audio/wav", "audio/mpeg", "audio/mp4", "audio/webm", "video/mp4", "video/webm");

    private static final Pattern ISO_639_1 = Pattern.compile("[a-z]{2}");
    /** double tamsayı-hassasiyet sınırı (2^53-1) — HttpAIProvider ile aynı guard. */
    private static final double MAX_SAFE_INTEGER = 9_007_199_254_740_991.0;
    private static final Set<String> LOOPBACK_HOSTS = Set.of("127.0.0.1", "localhost");
    private static final String BOUNDARY_BASE = "ats-live-stt-boundary";

    private final HttpClient client;
    private final URI transcribeUri;
    private final Duration requestTimeout;
    private final AudioSource audioSource;

    /**
     * Plain (server-auth-only) HTTPS ctor — https zorunlu. mTLS materyali YOKtur;
     * kanonik prod yolu client-auth ise {@link #Faz24LiveSttProvider(String, Duration,
     * AudioSource, String, SSLContext)} ctor'unu kullan (mTLS'i açıkça temsil eder).
     */
    public Faz24LiveSttProvider(String baseUrl, Duration requestTimeout,
                                AudioSource audioSource, String languageOverrideOrNull) {
        this(HttpClient.newBuilder().connectTimeout(requestTimeout).build(),
                baseUrl, requestTimeout, audioSource, languageOverrideOrNull, false);
    }

    /**
     * mTLS (client-auth) ctor — kanonik reverse-proxy yolu (Codex slice-38: null-means-plain
     * bulanıklığı YOK; bu ctor mTLS'i AÇIKÇA temsil eder, {@code sslContext} zorunlu).
     * SSLContext'i client cert + truststore'dan kurmak app-boot'un deploy işidir; JDK
     * default hostname-verification KAPATILMAZ (server cert SAN ↔ URL host eşleşmeli).
     */
    public Faz24LiveSttProvider(String baseUrl, Duration requestTimeout,
                                AudioSource audioSource, String languageOverrideOrNull,
                                SSLContext sslContext) {
        this(mtlsClient(requestTimeout, sslContext),
                baseUrl, requestTimeout, audioSource, languageOverrideOrNull, false);
    }

    private static HttpClient mtlsClient(Duration requestTimeout, SSLContext sslContext) {
        if (sslContext == null) {
            throw new IllegalArgumentException("sslContext zorunlu (mTLS ctor; plain için diğer ctor)");
        }
        if (requestTimeout == null || requestTimeout.isZero() || requestTimeout.isNegative()) {
            throw new IllegalArgumentException("requestTimeout pozitif olmalı");
        }
        return HttpClient.newBuilder().connectTimeout(requestTimeout).sslContext(sslContext).build();
    }

    /** Test constructor'ı: {@code allowPlaintextForLoopback} yalnız loopback host'a http açar. */
    Faz24LiveSttProvider(HttpClient client, String baseUrl, Duration requestTimeout,
                         AudioSource audioSource, String languageOverrideOrNull,
                         boolean allowPlaintextForLoopback) {
        if (baseUrl == null || baseUrl.isBlank()) {
            throw new IllegalArgumentException("baseUrl zorunlu");
        }
        if (audioSource == null) {
            throw new IllegalArgumentException("audioSource zorunlu");
        }
        if (requestTimeout == null || requestTimeout.isZero() || requestTimeout.isNegative()) {
            throw new IllegalArgumentException("requestTimeout pozitif olmalı");
        }
        if (languageOverrideOrNull != null && !ISO_639_1.matcher(languageOverrideOrNull).matches()) {
            throw new IllegalArgumentException("languageOverride ISO 639-1 olmalı (örn. tr)");
        }
        String base = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        URI probe = URI.create(base + "/transcribe");
        String scheme = probe.getScheme();
        boolean https = "https".equals(scheme);
        boolean loopbackPlaintext = "http".equals(scheme) && allowPlaintextForLoopback
                && probe.getHost() != null && LOOPBACK_HOSTS.contains(probe.getHost());
        if (!https && !loopbackPlaintext) {
            throw new IllegalArgumentException(
                    "kanonik transport https (mTLS reverse-proxy); plaintext yalnız loopback test constructor'ı");
        }
        String query = languageOverrideOrNull == null ? ""
                : "?language=" + URLEncoder.encode(languageOverrideOrNull, StandardCharsets.UTF_8);
        this.client = client;
        this.transcribeUri = URI.create(base + "/transcribe" + query);
        this.requestTimeout = requestTimeout;
        this.audioSource = audioSource;
    }

    @Override
    public Outcome<TranscriptResult> transcribe(String audioRef) {
        if (audioRef == null || audioRef.isBlank()) {
            return Outcome.fail(OutcomeCode.INVALID, "audioRef zorunlu");
        }
        Outcome<AudioSource.AudioBlob> blobOutcome = audioSource.read(audioRef);
        if (!(blobOutcome instanceof Outcome.Ok<AudioSource.AudioBlob> okBlob)) {
            Outcome.Fail<AudioSource.AudioBlob> fail = (Outcome.Fail<AudioSource.AudioBlob>) blobOutcome;
            return Outcome.fail(fail.code(), fail.reason());
        }
        AudioSource.AudioBlob blob = okBlob.value();
        if (blob == null || blob.bytes() == null || blob.bytes().length == 0) {
            return Outcome.fail(OutcomeCode.INVALID, "audio içeriği boş (fail-closed)");
        }
        if (blob.contentType() == null || !ALLOWED_CONTENT_TYPES.contains(blob.contentType())) {
            return Outcome.fail(OutcomeCode.INVALID,
                    "contentType allowlist dışı (ingest aynası + header-injection guard)");
        }
        EncodedMultipart multipart = encodeMultipart(blob.bytes(), blob.contentType());
        // HTTP/1.1 pin (2026-07-03 CANLI bulgu): JDK HttpClient default'u cleartext'te
        // h2c-upgrade header'ları gönderir; motorun uvicorn/h11 yığını bu durumda
        // multipart body'yi işlemez (canlıda 400/422 "audio Field required" —
        // curl'e upgrade header'ları eklenerek deneysel doğrulandı). İstek-seviyesi
        // pin, enjekte edilen HttpClient'ın versiyonundan bağımsız çalışır.
        HttpRequest request = HttpRequest.newBuilder(transcribeUri)
                .timeout(requestTimeout)
                .version(HttpClient.Version.HTTP_1_1)
                .header("Content-Type", "multipart/form-data; boundary=" + multipart.boundary())
                .POST(HttpRequest.BodyPublishers.ofByteArray(multipart.body()))
                .build();
        HttpResponse<String> response;
        try {
            response = client.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        } catch (IOException e) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "sağlayıcıya ulaşılamadı/timeout (fail-closed)");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "istek kesildi (fail-closed)");
        }
        int status = response.statusCode();
        if (status != 200) {
            // Keşfedilen hata haritası: 400 decode/content-type, 413 boyut, 415 medya, 422 validation
            // = giriş reddi (INVALID); 401/403/404/502/503/504/500 = transport/konfig/kapasite (NOT_CONFIGURED).
            if (status == 400 || status == 413 || status == 415 || status == 422) {
                return Outcome.fail(OutcomeCode.INVALID,
                        "motor girişi reddetti HTTP " + status + " (fail-closed)");
            }
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED,
                    "sağlayıcı HTTP " + status + " döndü (fail-closed)");
        }
        return mapTranscribeResponse(response.body());
    }

    @Override
    public Outcome<CitationResult> cite(String claim, String transcriptRef) {
        return Outcome.fail(OutcomeCode.NOT_CONFIGURED,
                "live-stt motoru cite yüzeyi sunmuyor (fail-closed; composite provider ayrı dilim, delege yok)");
    }

    private Outcome<TranscriptResult> mapTranscribeResponse(String body) {
        JsonValue parsed;
        try {
            parsed = JsonParse.parse(body);
        } catch (JsonParse.JsonParseException e) {
            return Outcome.fail(OutcomeCode.INVALID,
                    "sağlayıcı cevabı geçersiz JSON (fail-closed): " + e.getMessage());
        }
        try {
            JsonValue.JsonObject root = asObject(parsed, "root");
            String language = asString(root, "language");
            // Not: spec'te segments "required" listesinde değil; adaptör bilinçli olarak
            // spec'ten SIKI davranır (segments'siz cevap işlenemez → fail-closed).
            JsonValue.JsonArray segmentsJson = asArray(root, "segments");
            List<TranscriptSegment> segments = new ArrayList<>();
            for (JsonValue item : segmentsJson.items()) {
                JsonValue.JsonObject seg = asObject(item, "segments[]");
                double startSec = asFiniteNonNegative(seg, "start");
                double endSec = asFiniteNonNegative(seg, "end");
                if (endSec < startSec) {
                    throw new WireContractException("end < start (ters segment aralığı)");
                }
                long startMs = toMillis(startSec, "start");
                long endMs = toMillis(endSec, "end");
                if (endMs < startMs) {
                    throw new WireContractException("round sonrası end_ms < start_ms");
                }
                String text = asString(seg, "text");
                segments.add(new TranscriptSegment(UNDIARIZED_STREAM, startMs, endMs, text));
            }
            return Outcome.ok(new TranscriptResult(language, segments));
        } catch (WireContractException e) {
            return Outcome.fail(OutcomeCode.INVALID,
                    "sağlayıcı cevabı wire-contract dışı (fail-closed): " + e.getMessage());
        }
    }

    record EncodedMultipart(String boundary, byte[] body) {}

    /**
     * JDK HttpClient multipart sunmaz — deterministik encoder. Boundary, payload
     * içinde delimiter dizisi ("--" + boundary) geçmeyene kadar sayaçla türetilir
     * (statik boundary binary audio'da güvenli değil — collision taraması zorunlu).
     * filename sabit "audio": kullanıcı girdisi header'a TAŞINMAZ.
     */
    static EncodedMultipart encodeMultipart(byte[] audio, String contentType) {
        String boundary = BOUNDARY_BASE;
        int counter = 0;
        while (contains(audio, ("--" + boundary).getBytes(StandardCharsets.US_ASCII))) {
            counter++;
            boundary = BOUNDARY_BASE + "-" + counter;
        }
        byte[] head = ("--" + boundary + "\r\n"
                + "Content-Disposition: form-data; name=\"audio\"; filename=\"audio\"\r\n"
                + "Content-Type: " + contentType + "\r\n\r\n")
                .getBytes(StandardCharsets.US_ASCII);
        byte[] tail = ("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.US_ASCII);
        byte[] body = new byte[head.length + audio.length + tail.length];
        System.arraycopy(head, 0, body, 0, head.length);
        System.arraycopy(audio, 0, body, head.length, audio.length);
        System.arraycopy(tail, 0, body, head.length + audio.length, tail.length);
        return new EncodedMultipart(boundary, body);
    }

    private static boolean contains(byte[] haystack, byte[] needle) {
        outer:
        for (int i = 0; i <= haystack.length - needle.length; i++) {
            for (int j = 0; j < needle.length; j++) {
                if (haystack[i + j] != needle[j]) {
                    continue outer;
                }
            }
            return true;
        }
        return false;
    }

    private static long toMillis(double seconds, String field) {
        double ms = seconds * 1000.0;
        if (!(ms <= MAX_SAFE_INTEGER)) {
            throw new WireContractException(field + " ms güvenli tamsayı aralığı dışı");
        }
        return Math.round(ms);
    }

    private static double asFiniteNonNegative(JsonValue.JsonObject o, String field) {
        JsonValue v = o.values().get(field);
        if (!(v instanceof JsonValue.JsonNumber n)) {
            throw new WireContractException(field + " number olmalı");
        }
        double d = n.value();
        if (Double.isNaN(d) || Double.isInfinite(d) || d < 0) {
            throw new WireContractException(field + " finite ve >= 0 olmalı");
        }
        return d;
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
}
