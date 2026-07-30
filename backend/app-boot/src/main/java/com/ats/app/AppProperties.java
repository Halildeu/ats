package com.ats.app;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.ConstructorBinding;

/**
 * Fail-closed konfig: DB ve AI uçları için SESSİZ default YOK — eksik/boş değer
 * startup'ı açık mesajla düşürür (yanlış hedefe sessizce bağlanmaktansa hiç
 * kalkmamak). Değerler env'den gelir (ATS_DB_URL, ATS_AI_BASE_URL, ...);
 * parola log'a/hataya yazılmaz.
 */
@ConfigurationProperties(prefix = "ats")
public record AppProperties(
        Db db, Ai ai, Security security, Ingest ingest, Retention retention,
        ResumeImport resumeImport, ObjectStore objectStore, CandidateData candidateData) {

    @ConstructorBinding
    public AppProperties {
        if (resumeImport == null) {
            resumeImport = new ResumeImport(true, 10_485_760, 20, 2);
        }
        if (objectStore == null) {
            throw new IllegalStateException(
                    "eksik zorunlu konfig: ats.object-store.mode (env ATS_OBJECT_STORE_MODE)"
                    + " — fail-closed: G0 object-store kararı yokken yalnız açık in-memory-dev"
                    + " beyanı kabul edilir");
        }
        if (candidateData == null) {
            // Fail-safe: konfig verilmediyse en kısıtlayıcı mod (sentetik-yalnız + prod).
            candidateData = new CandidateData(null, null);
        }
    }

    /** Source-compatible constructor for existing composition tests/callers (no ResumeImport/ObjectStore). */
    public AppProperties(Db db, Ai ai, Security security, Ingest ingest, Retention retention) {
        this(db, ai, security, ingest, retention, null, new ObjectStore("in-memory-dev"), null);
    }

    /** Source-compatible constructor for main baseline (with ResumeImport only). */
    public AppProperties(Db db, Ai ai, Security security, Ingest ingest, Retention retention,
                         ResumeImport resumeImport) {
        this(db, ai, security, ingest, retention, resumeImport, new ObjectStore("in-memory-dev"), null);
    }

    /** Source-compatible constructor before candidate-data policy became explicit. */
    public AppProperties(Db db, Ai ai, Security security, Ingest ingest, Retention retention,
                         ResumeImport resumeImport, ObjectStore objectStore) {
        this(db, ai, security, ingest, retention, resumeImport, objectStore, null);
    }

    /**
     * Aday verisi politikası — ortam-parametrik, prod'da makine tarafından kilitli.
     *
     * <p>KVKK/PII yükümlülüğü şirketten şirkete ve ortamdan ortama değiştiği için bu
     * politika sabit tek-mod değildir: test/dev ortamlarında gerçek(çi) aday verisiyle
     * uçtan uca doğrulama açılabilir. Production'da ise {@code real-allowed} beyanı
     * <strong>boot'u düşürür</strong> — gerçek aday PII'sinin prod aktivasyonu
     * Legal/DPO owner gate'indedir ve config ile gevşetilemez.
     *
     * <p>Fail-safe default: değer verilmezse {@code synthetic-only} + {@code prod}.
     * Yani konfig unutulan/yanlış render edilen bir ortam en kısıtlayıcı moda düşer.
     */
    public record CandidateData(String mode, String environment) {
        public static final String MODE_SYNTHETIC_ONLY = "synthetic-only";
        public static final String MODE_REAL_ALLOWED = "real-allowed";
        public static final String ENV_PROD = "prod";

        private static final java.util.Set<String> MODES =
                java.util.Set.of(MODE_SYNTHETIC_ONLY, MODE_REAL_ALLOWED);
        private static final java.util.Set<String> ENVIRONMENTS =
                java.util.Set.of(ENV_PROD, "test", "dev");

        public CandidateData {
            mode = (mode == null || mode.isBlank()) ? MODE_SYNTHETIC_ONLY : mode.trim();
            environment = (environment == null || environment.isBlank())
                    ? ENV_PROD : environment.trim();
            if (!MODES.contains(mode)) {
                throw new IllegalStateException(
                        "ats.candidate-data.mode kapalı küme " + MODES + "; verilen: " + mode);
            }
            if (!ENVIRONMENTS.contains(environment)) {
                throw new IllegalStateException(
                        "ats.candidate-data.environment kapalı küme " + ENVIRONMENTS
                        + "; verilen: " + environment);
            }
            if (MODE_REAL_ALLOWED.equals(mode) && ENV_PROD.equals(environment)) {
                throw new IllegalStateException(
                        "Production ortamında gerçek aday verisi kapalıdır (fail-closed):"
                        + " ats.candidate-data.mode=real-allowed yalnız non-prod ortam beyanıyla"
                        + " kullanılabilir. Gerçek aday PII'sinin production aktivasyonu"
                        + " Legal/DPO owner gate'indedir.");
            }
        }

        /** CV import ve başvuru formu yalnız sentetik {@code .test} veri kabul eder. */
        public boolean syntheticOnly() {
            return MODE_SYNTHETIC_ONLY.equals(mode);
        }

        /** Gerçek(çi) aday verisi kabul edilir — yalnız non-prod ortamda mümkündür. */
        public boolean realCandidateDataAllowed() {
            return MODE_REAL_ALLOWED.equals(mode);
        }
    }

    /**
     * ATS-0008 D-D / ATS-0018 sınırı: gerçek object-store seçimi G0 owner gate'indedir.
     * Bu dilim vendor/topoloji seçmez; yalnız geçici adapter'ın sessiz production wiring'ini
     * engelleyen açık dev/test opt-in'ini kabul eder.
     */
    public record ObjectStore(String mode) {
        public ObjectStore {
            require(mode, "ats.object-store.mode (env ATS_OBJECT_STORE_MODE)");
            if (!mode.equals("in-memory-dev")) {
                throw new IllegalStateException(
                        "ats.object-store.mode kapalı küme: in-memory-dev (fail-closed;"
                        + " gerçek object-store G0 owner gate'inde açılır); verilen: " + mode);
            }
        }
    }

    /**
     * CV import kapasite sınırları. Sentetik-yalnız kısıtı burada DEĞİL,
     * {@link CandidateData} tek otoritesindedir (tek-source-of-truth).
     */
    public record ResumeImport(
            boolean enabled,
            int maxUploadBytes,
            int maxPages,
            int maxConcurrentParses) {
        public ResumeImport {
            if (maxUploadBytes <= 0) maxUploadBytes = 10_485_760;
            if (maxUploadBytes > 10_485_760) {
                throw new IllegalStateException(
                        "ats.resume-import.max-upload-bytes <= 10 MiB olmalı");
            }
            if (maxPages <= 0) maxPages = 20;
            if (maxPages > 50) {
                throw new IllegalStateException("ats.resume-import.max-pages <= 50 olmalı");
            }
            if (maxConcurrentParses <= 0) maxConcurrentParses = 2;
            if (maxConcurrentParses > 8) {
                throw new IllegalStateException(
                        "ats.resume-import.max-concurrent-parses <= 8 olmalı");
            }
        }
    }

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

    public record Ai(boolean enabled, String provider, String baseUrl, String bearer, Duration timeout,
                     String language, Duration grantTtl, Mtls mtls,
                     String endpointRef, Approvals approvals) {
        public Ai {
            // Faz 25 müşteri-öncelikli ayrıştırma: AI default-off iken ilan/başvuru/İK
            // çekirdeği AI endpoint'i, mTLS materyali veya model onayı olmadan boot eder.
            // enabled=true anında önceki sıkı doğrulamalar aynen fail-closed devreye girer.
            if (provider == null || provider.isBlank()) {
                provider = "http-json";
            }
            if (enabled && !provider.equals("http-json") && !provider.equals("live-stt")) {
                throw new IllegalStateException(
                        "ats.ai.provider kapalı küme: http-json|live-stt (fail-closed boot); verilen: " + provider);
            }
            if (enabled) {
                require(baseUrl, "ats.ai.base-url (env ATS_AI_BASE_URL)");
            }
            // P3-gov0 boot-gate girdileri (Codex durable-fix): endpointRef opak deploy-referansı,
            // approvals capability-başına onay-ref'i. BURADA yalnız blank→null normalize edilir;
            // provider-bağımlı zorunluluk + registry-çözümü + cross-check ModelGovernanceBoot
            // .authorizeProvider'da fail-closed uygulanır (provider semantiği orada canonical).
            endpointRef = blankToNull(endpointRef);
            if (approvals == null) {
                approvals = new Approvals(null, null);
            }
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
            if (enabled && "live-stt".equals(provider) && "required".equals(mtls.mode())
                    && (mtls.keyStorePath() == null || mtls.trustStorePath() == null
                        || mtls.keyStorePassword() == null)) {
                throw new IllegalStateException(
                        "live-stt + mTLS required: ats.ai.mtls.{key-store-path,key-store-password,"
                        + "trust-store-path} zorunlu (fail-closed; plain için ats.ai.mtls.mode=disabled)");
            }
        }
    }

    /**
     * P3-gov0 capability-başına onay-ref'i (Codex durable-fix): gerçek çalıştırılacak
     * yeteneğin ({@code TRANSCRIBE}/{@code CITE}) hangi onaylı-model politikasına ({@code
     * mapr_<hex>}) bağlandığını beyan eder. Enabled-capability GERÇEK provider'dan türetilir
     * ({@code ModelGovernanceBoot}); ilgisiz/eksik ref fail-closed reddedilir. Blank→null.
     */
    public record Approvals(String transcribeRef, String citeRef) {
        public Approvals {
            transcribeRef = blankToNull(transcribeRef);
            citeRef = blankToNull(citeRef);
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

    private static String blankToNull(String v) {
        return (v == null || v.isBlank()) ? null : v;
    }
}
