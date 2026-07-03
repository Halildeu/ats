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
public record AppProperties(Db db, Ai ai, Security security, Ingest ingest, Retention retention) {

    /**
     * Retention-purge zamanlayıcısı — DEFAULT KAPALI (ATS-0018: zamanlayıcı-tetikleyici
     * composition işi; cutoff politikası config/owner düzlemi). enabled=true iken
     * days/tenants/cron fail-closed zorunlu.
     */
    public record Retention(boolean enabled, String cron, int days, java.util.List<String> tenants) {
        public Retention {
            if (enabled) {
                require(cron, "ats.retention.cron (env ATS_RETENTION_CRON)");
                if (days <= 0) {
                    throw new IllegalStateException("ats.retention.days > 0 olmalı (fail-closed)");
                }
                if (tenants == null || tenants.isEmpty()
                        || tenants.stream().anyMatch(t -> t == null || t.isBlank())) {
                    throw new IllegalStateException(
                            "ats.retention.tenants boş/null-elemanlı olamaz (fail-closed)");
                }
            }
            tenants = tenants == null ? java.util.List.of() : java.util.List.copyOf(tenants);
        }
    }


    /**
     * JWT resource-server konfig'i — üçü de ZORUNLU (fail-closed): jwksUri
     * (imza anahtarları), issuer (iss doğrulaması), audience (aud doğrulaması).
     * IdP-nötr: herhangi bir OIDC sağlayıcı (ADR-0001 — vendor coupling yok).
     */
    public record Security(String jwksUri, String issuer, String audience, String tenantClaimName) {
        public Security {
            require(jwksUri, "ats.security.jwks-uri (env ATS_JWKS_URI)");
            require(issuer, "ats.security.issuer (env ATS_JWT_ISSUER)");
            require(audience, "ats.security.audience (env ATS_JWT_AUDIENCE)");
            // ATS-0019: platform-KC token'ında tenant claim adı farklı olabilir
            // (configurable); default "tenant". YALNIZ JWT claim adı — asla
            // header/body/path fallback'e dönüşmez (tenant token-only, ATS-0002).
            if (tenantClaimName == null || tenantClaimName.isBlank()) {
                tenantClaimName = "tenant";
            }
        }
    }

    /** Upload sınırı — Content-Length zorunlu + üst sınır (DoS guard'ı). */
    public record Ingest(long maxUploadBytes) {
        public Ingest {
            if (maxUploadBytes <= 0) {
                maxUploadBytes = 104_857_600L; // 100 MiB
            }
            if (maxUploadBytes > Integer.MAX_VALUE - 1L) {
                throw new IllegalStateException("ats.ingest.max-upload-bytes tek-parça bellek okuması"
                        + " sınırını aşıyor (<= " + (Integer.MAX_VALUE - 1) + " olmalı)");
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

    public record Ai(String provider, String baseUrl, String bearer, Duration timeout,
                     String language, Duration grantTtl, Mtls mtls) {
        public Ai {
            // slice-36: kapalı küme — bilinmeyen değer BOOT'ta düşürür (fail-closed).
            if (provider == null || provider.isBlank()) {
                provider = "http-json";
            }
            if (!provider.equals("http-json") && !provider.equals("live-stt")) {
                throw new IllegalStateException(
                        "ats.ai.provider kapalı küme: http-json|live-stt (fail-closed boot); verilen: " + provider);
            }
            require(baseUrl, "ats.ai.base-url (env ATS_AI_BASE_URL)");
            if (timeout == null || timeout.isZero() || timeout.isNegative()) {
                timeout = Duration.ofSeconds(30);
            }
            // bearer opsiyoneldir (boş → auth başlığı gönderilmez); loglanmaz.
            if (bearer != null && bearer.isBlank()) {
                bearer = null;
            }
            // live-stt dil override'ı config'ten (magic string değil); P1 default tr.
            if (language == null || language.isBlank()) {
                language = "tr";
            }
            // one-shot ses-erişim grant TTL'i (kaçak handle raf ömrü).
            if (grantTtl == null || grantTtl.isZero() || grantTtl.isNegative()) {
                grantTtl = Duration.ofSeconds(60);
            }
            if (mtls == null) {
                mtls = new Mtls(null, null, null, null);
            }
            // slice-38: live-stt kanonik yol client-auth'tur — mTLS default REQUIRED
            // (fail-closed); plain'e düşmek yalnız AÇIK "disabled" beyanıyla mümkün
            // (Codex: sessiz downgrade YASAK). http-json bu alanı yok sayar.
            if ("live-stt".equals(provider) && "required".equals(mtls.mode())
                    && (mtls.keyStorePath() == null || mtls.trustStorePath() == null
                        || mtls.keyStorePassword() == null)) {
                throw new IllegalStateException(
                        "live-stt + mTLS required: ats.ai.mtls.{key-store-path,key-store-password,"
                        + "trust-store-path} zorunlu (fail-closed; plain için ats.ai.mtls.mode=disabled)");
            }
        }
    }

    /** slice-38 mTLS materyali (PKCS12-only; mode kapalı küme required|disabled). */
    public record Mtls(String mode, String keyStorePath, String keyStorePassword,
                       String trustStorePath) {
        public Mtls {
            if (mode == null || mode.isBlank()) {
                mode = "required"; // live-stt için güvenli default
            }
            if (!mode.equals("required") && !mode.equals("disabled")) {
                throw new IllegalStateException(
                        "ats.ai.mtls.mode kapalı küme: required|disabled (fail-closed); verilen: " + mode);
            }
            if (keyStorePassword != null && keyStorePassword.isBlank()) {
                keyStorePassword = null;
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
