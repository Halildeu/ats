package com.ats.app;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Fail-closed konfig: DB ve AI uçları için SESSİZ default YOK — eksik/boş değer
 * startup'ı açık mesajla düşürür (yanlış hedefe sessizce bağlanmaktansa hiç
 * kalkmamak). Değerler env'den gelir (ATS_DB_URL, ATS_AI_BASE_URL, ...);
 * parola log'a/hataya yazılmaz.
 */
@ConfigurationProperties(prefix = "ats")
public record AppProperties(Db db, Ai ai, Security security, Ingest ingest) {

    /**
     * JWT resource-server konfig'i — üçü de ZORUNLU (fail-closed): jwksUri
     * (imza anahtarları), issuer (iss doğrulaması), audience (aud doğrulaması).
     * IdP-nötr: herhangi bir OIDC sağlayıcı (ADR-0001 — vendor coupling yok).
     */
    public record Security(String jwksUri, String issuer, String audience) {
        public Security {
            require(jwksUri, "ats.security.jwks-uri (env ATS_JWKS_URI)");
            require(issuer, "ats.security.issuer (env ATS_JWT_ISSUER)");
            require(audience, "ats.security.audience (env ATS_JWT_AUDIENCE)");
        }
    }

    /** Upload sınırı — Content-Length zorunlu + üst sınır (DoS guard'ı). */
    public record Ingest(long maxUploadBytes) {
        public Ingest {
            if (maxUploadBytes <= 0) {
                maxUploadBytes = 104_857_600L; // 100 MiB
            }
        }
    }

    public record Db(String url, String username, String password) {
        public Db {
            require(url, "ats.db.url (env ATS_DB_URL)");
            require(username, "ats.db.username (env ATS_DB_USERNAME)");
            require(password, "ats.db.password (env ATS_DB_PASSWORD)");
        }
    }

    public record Ai(String baseUrl, String bearer, Duration timeout) {
        public Ai {
            require(baseUrl, "ats.ai.base-url (env ATS_AI_BASE_URL)");
            if (timeout == null || timeout.isZero() || timeout.isNegative()) {
                timeout = Duration.ofSeconds(30);
            }
            // bearer opsiyoneldir (boş → auth başlığı gönderilmez); loglanmaz.
            if (bearer != null && bearer.isBlank()) {
                bearer = null;
            }
        }
    }

    private static void require(String v, String name) {
        if (v == null || v.isBlank()) {
            throw new IllegalStateException("eksik zorunlu konfig: " + name
                    + " — fail-closed: default yok, açıkça verilmeli");
        }
    }
}
