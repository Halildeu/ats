package com.ats.app;

import java.util.List;
import java.util.Map;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.convert.converter.Converter;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.authorization.AuthorizationManager;
import org.springframework.security.web.access.intercept.RequestAuthorizationContext;

/**
 * Authn/z kapısı — İLK veri-endpoint'leriyle BİRLİKTE gelir (slice-9 taahhüdü:
 * kapısız veri yüzeyi açılmaz). Desen endüstri-standardı OAuth2 resource-server:
 *
 *  - JWT imzası JWKS'ten (ats.security.jwks-uri) doğrulanır; iss + aud + exp zorunlu.
 *  - IdP-nötr (herhangi OIDC sağlayıcı; ADR-0001 vendor-coupling yasağı) —
 *    gerçek IdP seçimi/deploy'u ayrı ADR/deploy-wiring işidir.
 *  - Yetki FAIL-CLOSED + endpoint-bazlı scope ayrımı: authority'ler YALNIZ
 *    non-blank tenant claim'i (adı configurable — ATS-0019; ats.security.
 *    tenant-claim-name, default "tenant") varken, İSTENEN scope ile ATANMIŞ
 *    `resource_access.<ats-client>.roles` KESİŞİMİNDEN türetilir (39d-2b:
 *    scope istemek ≠ permission; self-escalation yapısal kapalı). TenantAccess
 *    runtime tenant-extraction'ı AYNI config'i kullanır (biri authority verip diğeri
 *    tenant bulamama YAPISAL imkânsız); fallback claim adı YOK. Tek genel scope YOK;
 *    bilinmeyen yüzey denyAll (yeni endpoint = açık matcher + scope kararı).
 *  - Tenant DAİMA token'dan okunur (istek gövdesi/path'inden ASLA — ATS-0002).
 *  - Açık yüzeyler YALNIZ /healthz + GET /v3/api-docs (ikisi de veri taşımaz —
 *    liveness + şema metadata'sı); onların dışında her şey kimlikli.
 *  - Stateless + CSRF kapalı (bearer-token API standardı).
 *
 * İnce-taneli yetkilendirme (rol/ilişki bazlı; OpenFGA benzeri) AYRI ADR —
 * bu dilim kaba-taneli authn + tenant-izolasyon kapısıdır (dürüst sınır).
 */
@Configuration
@EnableWebSecurity
class SecurityConfig {

    /** Endpoint-bazlı scope ayrımı (Codex #64 blocker-1): tek genel scope YOK. */
    // Map.of 10-çift sınırı: 11. scope (39d-8 ats.export.read) ile ofEntries'e geçildi.
    private static final Map<String, String> SCOPE_TO_AUTHORITY = Map.ofEntries(
            Map.entry("ats.consent.write", "CONSENT_WRITE"),
            Map.entry("ats.recording.write", "RECORDING_WRITE"),
            // STT işleme = PII-üreten ayrı yetenek (upload'dan ayrık yetki sınıfı)
            Map.entry("ats.transcription.write", "TRANSCRIPTION_WRITE"),
            Map.entry("ats.transcript.read", "TRANSCRIPT_READ"),
            Map.entry("ats.citation.write", "CITATION_WRITE"),
            Map.entry("ats.review.write", "REVIEW_WRITE"),
            Map.entry("ats.review.read", "REVIEW_READ"),
            Map.entry("ats.application.read", "APPLICATION_READ"),
            Map.entry("ats.application.status.write", "APPLICATION_STATUS_WRITE"),
            Map.entry("ats.job.read", "JOB_READ"),
            Map.entry("ats.job.write", "JOB_WRITE"),
            Map.entry("ats.job.publish", "JOB_PUBLISH"),
            // 39d-8: salt-okuma makbuz-recovery — write'a mecbur bırakmayan ayrı read yetkisi
            Map.entry("ats.export.read", "EXPORT_READ"),
            Map.entry("ats.export.repair", "EXPORT_REPAIR"),
            Map.entry("ats.export.write", "EXPORT_WRITE"),
            Map.entry("ats.dsar.write", "DSAR_WRITE"),
            // yıkıcı content-silme AYRI yetki sınıfı (Codex #66 blocker-1): intake ≠ execute
            Map.entry("ats.erasure.execute", "ERASURE_EXECUTE"));

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http, JwtDecoder decoder, AppProperties props)
            throws Exception {
        AuthorizationManager<RequestAuthorizationContext> tenantAuthenticated =
                tenantAuthenticated(props.security().tenantClaimName());
        http.csrf(csrf -> csrf.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(a -> a
                        .requestMatchers("/healthz").permitAll()
                        // OpenAPI metadata (yalnız şema; KİŞİSEL/İŞ VERİSİ DEĞİL — buyer-trust yüzeyi).
                        // Swagger-UI bilinçle yok; prod'da edge katmanında ayrıca kısıtlanabilir.
                        .requestMatchers(HttpMethod.GET, "/v3/api-docs", "/v3/api-docs/**").permitAll()
                        // Careers standardı: yayınlanmış ilan ve adayın kendi başvuru/takip
                        // yüzeyi public; tenant request'ten değil server-side ilandan çözülür.
                        .requestMatchers(HttpMethod.GET, "/api/v1/jobs", "/api/v1/jobs/*").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/v1/jobs/*/applications").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/v1/jobs/*/resume-imports").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/careers/*/jobs",
                                "/api/v1/careers/*/jobs/*").permitAll()
                        .requestMatchers(HttpMethod.POST,
                                "/api/v1/careers/*/jobs/*/applications").permitAll()
                        .requestMatchers(HttpMethod.POST,
                                "/api/v1/careers/*/jobs/*/resume-imports").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/candidate/applications/*").permitAll()
                        .requestMatchers(HttpMethod.GET,
                                "/api/v1/candidate/applications/*/interviews").permitAll()
                        .requestMatchers(HttpMethod.GET,
                                "/api/v1/candidate/applications/*/offers").permitAll()
                        .requestMatchers(HttpMethod.POST,
                                "/api/v1/candidate/applications/*/offers/*/response").permitAll()
                        .requestMatchers(HttpMethod.PUT,
                                "/api/v1/candidate/applications/*/withdraw").permitAll()
                        .requestMatchers(HttpMethod.GET,
                                "/api/v1/candidate/resume-imports/*").permitAll()
                        .requestMatchers(HttpMethod.PUT,
                                "/api/v1/candidate/resume-imports/*/document",
                                "/api/v1/candidate/resume-imports/*/fields/*").permitAll()
                        .requestMatchers(HttpMethod.POST,
                                "/api/v1/candidate/resume-imports/*/document/replace",
                                "/api/v1/candidate/resume-imports/*/confirm",
                                "/api/v1/candidate/resume-imports/*/terminate").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/recruiter/applications",
                                "/api/v1/recruiter/applications/*")
                            .access(tenantAuthenticated)
                        .requestMatchers(HttpMethod.PUT, "/api/v1/recruiter/applications/*/status")
                            .access(tenantAuthenticated)
                        .requestMatchers(HttpMethod.POST,
                                "/api/v1/recruiter/applications/*/evaluations")
                            .access(tenantAuthenticated)
                        .requestMatchers(HttpMethod.GET,
                                "/api/v1/recruiter/applications/*/interviews",
                                "/api/v1/recruiter/applications/*/interviews/*")
                            .access(tenantAuthenticated)
                        .requestMatchers(HttpMethod.POST,
                                "/api/v1/recruiter/applications/*/interviews",
                                "/api/v1/recruiter/applications/*/interviews/*/transitions")
                            .access(tenantAuthenticated)
                        .requestMatchers(HttpMethod.PUT,
                                "/api/v1/recruiter/applications/*/interviews/*")
                            .access(tenantAuthenticated)
                        .requestMatchers(HttpMethod.GET,
                                "/api/v1/recruiter/applications/*/offers",
                                "/api/v1/recruiter/applications/*/offers/*")
                            .access(tenantAuthenticated)
                        .requestMatchers(HttpMethod.POST,
                                "/api/v1/recruiter/applications/*/offers",
                                "/api/v1/recruiter/applications/*/offers/*/transitions")
                            .access(tenantAuthenticated)
                        .requestMatchers(HttpMethod.PUT,
                                "/api/v1/recruiter/applications/*/offers/*")
                            .access(tenantAuthenticated)
                        .requestMatchers(HttpMethod.GET, "/api/v1/recruiter/jobs",
                                "/api/v1/recruiter/jobs/*")
                            .access(tenantAuthenticated)
                        .requestMatchers(HttpMethod.POST, "/api/v1/recruiter/jobs")
                            .access(tenantAuthenticated)
                        .requestMatchers(HttpMethod.PUT, "/api/v1/recruiter/jobs/*")
                            .access(tenantAuthenticated)
                        .requestMatchers(HttpMethod.POST, "/api/v1/recruiter/jobs/*/transitions")
                            .access(tenantAuthenticated)
                        .requestMatchers(HttpMethod.PUT, "/api/v1/interviews/*/recording-consent")
                            .hasAuthority("CONSENT_WRITE")
                        .requestMatchers(HttpMethod.GET, "/api/v1/interviews/*/workspace")
                            .access(tenantAuthenticated)
                        .requestMatchers(HttpMethod.POST, "/api/v1/interviews/*/scorecards")
                            .access(tenantAuthenticated)
                        .requestMatchers(HttpMethod.POST, "/api/v1/interviews/*/recordings")
                            .hasAuthority("RECORDING_WRITE")
                        .requestMatchers(HttpMethod.POST, "/api/v1/interviews/*/transcribe")
                            .hasAuthority("TRANSCRIPTION_WRITE")
                        .requestMatchers(HttpMethod.GET, "/api/v1/interviews/*/transcript",
                                "/api/v1/interviews/*/transcripts")
                            .hasAuthority("TRANSCRIPT_READ")
                        .requestMatchers(HttpMethod.POST, "/api/v1/interviews/*/citations")
                            .hasAuthority("CITATION_WRITE")
                        .requestMatchers(HttpMethod.GET, "/api/v1/interviews/*/review-case",
                                "/api/v1/interviews/*/review-cases")
                            .hasAuthority("REVIEW_READ")
                        .requestMatchers(HttpMethod.POST, "/api/v1/interviews/*/review-cases",
                                "/api/v1/interviews/*/review-case/transition",
                                "/api/v1/interviews/*/review-case/finalize")
                            .hasAuthority("REVIEW_WRITE")
                        .requestMatchers(HttpMethod.GET, "/api/v1/interviews/*/export/receipt",
                                "/api/v1/interviews/*/export/artifact")
                            // Salt-okuma recovery + artifact-read: read YA DA write (yazan
                            // okuyabilir; ops/audit'e write vermeden — least-privilege).
                            // BİLEREK yalnız GET: HEAD desteklenmez (artifact-existence
                            // oracle'ı açılmaz) — HEAD anyRequest denyAll'a düşer.
                            .hasAnyAuthority("EXPORT_READ", "EXPORT_WRITE")
                        .requestMatchers(HttpMethod.POST, "/api/v1/interviews/*/export")
                            .hasAuthority("EXPORT_WRITE")
                        .requestMatchers(HttpMethod.POST, "/api/v1/interviews/*/export/repair")
                            // 39d-11: AYRI onay-kapısı — EXPORT_WRITE repair YAPAMAZ
                            // (runbook 'onaylı repair' disiplini rol-atamasıyla).
                            .hasAuthority("EXPORT_REPAIR")
                        .requestMatchers(HttpMethod.POST, "/api/v1/interviews/*/dsar")
                            .hasAuthority("DSAR_WRITE")
                        .requestMatchers(HttpMethod.POST, "/api/v1/interviews/*/dsar/erasure")
                            .hasAuthority("ERASURE_EXECUTE")
                        // bilinmeyen yüzey: fail-closed (yeni endpoint = açık matcher + scope kararı)
                        .anyRequest().denyAll())
                .oauth2ResourceServer(o -> o.jwt(j -> j
                        .decoder(decoder)
                        .jwtAuthenticationConverter(atsAuthenticationConverter(
                                props.security().tenantClaimName(),
                                props.security().audience()))));
        return http.build();
    }

    @Bean
    JwtDecoder jwtDecoder(AppProperties props) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder
                .withJwkSetUri(props.security().jwksUri())
                .build();
        OAuth2TokenValidator<Jwt> withIssuer = JwtValidators.createDefaultWithIssuer(props.security().issuer());
        OAuth2TokenValidator<Jwt> audience = audienceValidator(props.security().audience());
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(withIssuer, audience));
        return decoder;
    }

    private static OAuth2TokenValidator<Jwt> audienceValidator(String requiredAudience) {
        OAuth2Error err = new OAuth2Error("invalid_token", "aud claim'i beklenen audience'ı içermiyor", null);
        return jwt -> jwt.getAudience() != null && jwt.getAudience().contains(requiredAudience)
                ? OAuth2TokenValidatorResult.success()
                : OAuth2TokenValidatorResult.failure(err);
    }

    /**
     * Authority'ler YALNIZ tenant-claim non-blank iken scope'lardan türetilir
     * (fail-closed: tenant'sız token hiçbir authority alamaz — tenant'sız veri
     * erişimi yapısal imkânsız; ATS-0002). tenant-claim ADI configurable
     * (ATS-0019: platform-KC token'ında farklı olabilir); YALNIZ o JWT claim'i
     * okunur — istek gövdesi/path/header fallback ASLA yok.
     */
    static Converter<Jwt, AbstractAuthenticationToken> atsAuthenticationConverter(
            String tenantClaimName, String atsClientId) {
        String claim = (tenantClaimName == null || tenantClaimName.isBlank()) ? "tenant" : tenantClaimName;
        return jwt -> new JwtAuthenticationToken(jwt, deriveAuthorities(jwt, claim, atsClientId));
    }

    /**
     * Test-görünür saf türetim — ROL-KAPILI kesişim (39d-2b; Codex 019f4c6c
     * P0, Seçenek A):
     *
     *   effective = requestedScope ∩ resource_access.&lt;ats-client&gt;.roles
     *               ∩ SCOPE_TO_AUTHORITY (bilinen 10 permission)
     *
     * OAuth scope İSTENEN yetkidir, tek başına permission DEĞİLDİR — IdP'de
     * optional scope'u herhangi bir oturumlu kullanıcı isteyebilir
     * (self-escalation). Gerçek entitlement kullanıcıya ATANMIŞ ats-client
     * rolüdür (Keycloak client-role yayını: `resource_access` anahtarı =
     * audience client-id'si). Exact eşleşme; substring/prefix/wildcard YOK;
     * rolün BAŞKA client altında yayınlanması ATS yetkisi vermez.
     */
    static List<SimpleGrantedAuthority> deriveAuthorities(
            Jwt jwt, String tenantClaimName, String atsClientId) {
        String tenant = jwt.getClaimAsString(tenantClaimName);
        boolean hasTenant = tenant != null && !tenant.isBlank();
        String scope = jwt.getClaimAsString("scope");
        if (!hasTenant || scope == null) {
            return List.of();
        }
        java.util.Set<String> assigned = assignedAtsRoles(jwt, atsClientId);
        return List.of(scope.split(" ")).stream()
                .filter(assigned::contains)
                .map(SCOPE_TO_AUTHORITY::get)
                .filter(a -> a != null)
                .map(SimpleGrantedAuthority::new)
                .toList();
    }

    /**
     * `resource_access.&lt;atsClientId&gt;.roles` tip-güvenli okuma: beklenmeyen
     * HER şekil (claim yok / obje değil / roles liste değil / eleman string
     * değil / boş) BOŞ küme döner. Fail-closed; ClassCastException veya 500
     * üretmez — bozuk claim'li token yalnız yetkisiz kalır.
     */
    private static java.util.Set<String> assignedAtsRoles(Jwt jwt, String atsClientId) {
        Object ra = jwt.getClaim("resource_access");
        if (!(ra instanceof Map<?, ?> raMap)) {
            return java.util.Set.of();
        }
        Object client = raMap.get(atsClientId);
        if (!(client instanceof Map<?, ?> clientMap)) {
            return java.util.Set.of();
        }
        Object roles = clientMap.get("roles");
        if (!(roles instanceof List<?> list)) {
            return java.util.Set.of();
        }
        java.util.Set<String> out = new java.util.HashSet<>();
        for (Object r : list) {
            if (r instanceof String v && !v.isBlank()) {
                out.add(v);
            }
        }
        return java.util.Set.copyOf(out);
    }

    /** Valid JWT + exact configured non-blank tenant claim; product permission controller guard'dadır. */
    private static AuthorizationManager<RequestAuthorizationContext> tenantAuthenticated(
            String tenantClaimName) {
        String claim = tenantClaimName == null || tenantClaimName.isBlank()
                ? "tenant" : tenantClaimName;
        return (authentication, context) -> {
            org.springframework.security.core.Authentication auth = authentication.get();
            boolean granted = auth != null && auth.isAuthenticated()
                    && auth.getPrincipal() instanceof Jwt jwt
                    && jwt.getClaimAsString(claim) != null
                    && !jwt.getClaimAsString(claim).isBlank();
            return new AuthorizationDecision(granted);
        };
    }
}
