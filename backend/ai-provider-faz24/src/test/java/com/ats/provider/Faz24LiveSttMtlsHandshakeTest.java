package com.ats.provider;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.contracts.AIProvider;
import com.ats.kernel.Outcome;
import com.sun.net.httpserver.HttpsConfigurator;
import com.sun.net.httpserver.HttpsServer;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.time.Duration;
import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.TrustManagerFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/**
 * DETERMİNİSTİK mTLS handshake conformance (Codex slice-38 zorunlu-3): canlı motora
 * BAĞIMSIZ, tamamen test-fixture CA/server/client materyaliyle GERÇEK TLS client-auth
 * round-trip'i. Loopback {@link HttpsServer} {@code needClientAuth=true} ile kurulur;
 * server cert SAN=localhost/127.0.0.1 → JDK hostname-verification KAPATILMADAN geçer.
 *
 * Kanıt iddiası: "adaptör mTLS ctor'u client cert'i handshake'te sunar ve client-auth
 * zorunlu bir uçtan 200 alır; client cert olmayan bağlam reddedilir." Canlı Faz24
 * motoru round-trip'i AYRI ve owner-CA-gated (test-CA ≠ canlı denetim-PC CA).
 *
 * Fixture: test/resources/mtls/{server,client,truststore}.p12 (keytool, uzun-validity,
 * self-signed TEST CA — secret değil, gerçek CA değil; parola sabit test-değeri).
 */
class Faz24LiveSttMtlsHandshakeTest {

    private static final String STORE_PASS = "atslive-test";
    private static final String TRANSCRIBE_JSON =
            "{\"language\":\"tr\",\"segments\":[{\"start\":0.0,\"end\":1.0,\"text\":\"merhaba\"}]}";

    private static HttpsServer server;
    private static int port;

    @BeforeAll
    static void startMtlsServer() throws Exception {
        SSLContext serverCtx = sslContext("/mtls/server.p12", "/mtls/truststore.p12");
        server = HttpsServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.setHttpsConfigurator(new HttpsConfigurator(serverCtx) {
            @Override
            public void configure(com.sun.net.httpserver.HttpsParameters params) {
                SSLParameters p = serverCtx.getDefaultSSLParameters();
                p.setNeedClientAuth(true); // client-auth ZORUNLU (canlı Caddy davranışını taklit)
                params.setSSLParameters(p);
            }
        });
        server.createContext("/transcribe", exchange -> {
            byte[] out = TRANSCRIBE_JSON.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, out.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(out);
            }
        });
        server.start();
        port = server.getAddress().getPort();
    }

    @AfterAll
    static void stopServer() {
        if (server != null) {
            server.stop(0);
        }
    }

    private static SSLContext sslContext(String keyStoreResource, String trustStoreResource)
            throws Exception {
        KeyStore keyStore = load(keyStoreResource);
        KeyManagerFactory kmf =
                KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
        kmf.init(keyStore, STORE_PASS.toCharArray());
        KeyStore trustStore = load(trustStoreResource);
        TrustManagerFactory tmf =
                TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
        tmf.init(trustStore);
        SSLContext ctx = SSLContext.getInstance("TLS");
        ctx.init(kmf.getKeyManagers(), tmf.getTrustManagers(), null);
        return ctx;
    }

    private static KeyStore load(String resource) throws Exception {
        KeyStore ks = KeyStore.getInstance("PKCS12");
        try (InputStream in = Faz24LiveSttMtlsHandshakeTest.class.getResourceAsStream(resource)) {
            assertTrue(in != null, "fixture eksik: " + resource);
            ks.load(in, STORE_PASS.toCharArray());
        }
        return ks;
    }

    private static AudioSource okSource() {
        return ref -> Outcome.ok(new AudioSource.AudioBlob(
                "RIFFxxxxWAVE".getBytes(StandardCharsets.US_ASCII), "audio/wav"));
    }

    @Test
    void client_cert_context_completes_mtls_round_trip() throws Exception {
        SSLContext clientCtx = sslContext("/mtls/client.p12", "/mtls/truststore.p12");
        // hostname-verification KAPATILMADAN: server SAN=localhost, URL host=localhost
        Faz24LiveSttProvider provider = new Faz24LiveSttProvider(
                "https://localhost:" + port, Duration.ofSeconds(10), okSource(), "tr", clientCtx);

        Outcome<AIProvider.TranscriptResult> out = provider.transcribe("rec-1");

        AIProvider.TranscriptResult result =
                assertInstanceOf(Outcome.Ok.class, out, "mTLS round-trip ok olmalı: " + out) != null
                        ? ((Outcome.Ok<AIProvider.TranscriptResult>) out).value() : null;
        assertEquals("tr", result.language());
        assertEquals(1, result.segments().size());
        assertEquals(Faz24LiveSttProvider.UNDIARIZED_STREAM, result.segments().get(0).speaker());
    }

    @Test
    void context_without_client_cert_is_rejected_by_client_auth() throws Exception {
        // Yalnız truststore (CA) — client key YOK: server needClientAuth=true reddeder.
        KeyStore trustStore = load("/mtls/truststore.p12");
        TrustManagerFactory tmf =
                TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
        tmf.init(trustStore);
        SSLContext noCertCtx = SSLContext.getInstance("TLS");
        noCertCtx.init(null, tmf.getTrustManagers(), null);

        Faz24LiveSttProvider provider = new Faz24LiveSttProvider(
                "https://localhost:" + port, Duration.ofSeconds(10), okSource(), "tr", noCertCtx);

        Outcome<AIProvider.TranscriptResult> out = provider.transcribe("rec-1");

        // handshake client-auth reddi → IOException → fail-closed NOT_CONFIGURED
        Outcome.Fail<AIProvider.TranscriptResult> fail =
                assertInstanceOf(Outcome.Fail.class, out, "client-cert'siz bağlam reddedilmeli: " + out);
        assertEquals(com.ats.kernel.OutcomeCode.NOT_CONFIGURED, fail.code());
    }

    @Test
    void mtls_ctor_rejects_null_ssl_context() {
        assertThrows(IllegalArgumentException.class, () -> new Faz24LiveSttProvider(
                "https://localhost:" + port, Duration.ofSeconds(10), okSource(), "tr", (SSLContext) null));
    }
}
