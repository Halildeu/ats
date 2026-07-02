package com.ats.app;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.Map;

/**
 * GERÇEK imza + GERÇEK JWKS akışıyla test desteği (mock-decoder yok): RSA-2048
 * anahtar üretir, public key'i lokal HTTP sunucudan JWKS olarak yayınlar,
 * istenen claim'lerle RS256-imzalı JWT basar. Resource-server imzayı bu JWKS'ten
 * doğrular — authn yolu uçtan uca gerçektir.
 */
final class JwtTestSupport {

    static final String ISSUER = "https://issuer.test";
    static final String AUDIENCE = "ats-api";

    private final RSAKey rsaKey;
    private final HttpServer server;

    JwtTestSupport() {
        try {
            KeyPairGenerator gen = KeyPairGenerator.getInstance("RSA");
            gen.initialize(2048);
            KeyPair pair = gen.generateKeyPair();
            this.rsaKey = new RSAKey.Builder((RSAPublicKey) pair.getPublic())
                    .privateKey((RSAPrivateKey) pair.getPrivate())
                    .keyID("test-key-1")
                    .build();
            byte[] jwks = new JWKSet(rsaKey.toPublicJWK()).toString().getBytes(StandardCharsets.UTF_8);
            this.server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/jwks.json", exchange -> {
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, jwks.length);
                try (var os = exchange.getResponseBody()) {
                    os.write(jwks);
                }
            });
            server.start();
        } catch (Exception e) {
            throw new IllegalStateException("JWKS test sunucusu kurulamadı", e);
        }
    }

    String jwksUri() {
        return "http://127.0.0.1:" + server.getAddress().getPort() + "/jwks.json";
    }

    void stop() {
        server.stop(0);
    }

    static final String ALL_SCOPES = "ats.consent.write ats.recording.write ats.transcript.read";

    /** Varsayılan geçerli token: iss+aud+exp + tenant + 3 endpoint-scope'u. */
    String token(String tenant, String subject) {
        return token(Map.of("tenant", tenant, "scope", ALL_SCOPES), ISSUER, List.of(AUDIENCE), subject);
    }

    String token(Map<String, Object> claims, String issuer, List<String> audience, String subject) {
        try {
            JWTClaimsSet.Builder b = new JWTClaimsSet.Builder()
                    .issuer(issuer)
                    .audience(audience)
                    .subject(subject)
                    .issueTime(Date.from(Instant.now()))
                    .expirationTime(Date.from(Instant.now().plusSeconds(300)));
            claims.forEach(b::claim);
            SignedJWT jwt = new SignedJWT(
                    new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(rsaKey.getKeyID()).build(),
                    b.build());
            jwt.sign(new RSASSASigner(rsaKey));
            return jwt.serialize();
        } catch (Exception e) {
            throw new IllegalStateException("test token imzalanamadı", e);
        }
    }
}
