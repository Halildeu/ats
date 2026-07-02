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

/**
 * Authn/z kapısı — İLK veri-endpoint'leriyle BİRLİKTE gelir (slice-9 taahhüdü:
 * kapısız veri yüzeyi açılmaz). Desen endüstri-standardı OAuth2 resource-server:
 *
 *  - JWT imzası JWKS'ten (ats.security.jwks-uri) doğrulanır; iss + aud + exp zorunlu.
 *  - IdP-nötr (herhangi OIDC sağlayıcı; ADR-0001 vendor-coupling yasağı) —
 *    gerçek IdP seçimi/deploy'u ayrı ADR/deploy-wiring işidir.
 *  - Yetki FAIL-CLOSED + endpoint-bazlı scope ayrımı: authority'ler YALNIZ
 *    non-blank `tenant` claim'i varken scope'lardan türetilir (ats.consent.write /
 *    ats.recording.write / ats.transcript.read). Tek genel scope YOK; bilinmeyen
 *    yüzey denyAll (yeni endpoint = açık matcher + scope kararı).
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

    static final String TENANT_CLAIM = "tenant";

    /** Endpoint-bazlı scope ayrımı (Codex #64 blocker-1): tek genel scope YOK. */
    private static final Map<String, String> SCOPE_TO_AUTHORITY = Map.of(
            "ats.consent.write", "CONSENT_WRITE",
            "ats.recording.write", "RECORDING_WRITE",
            "ats.transcript.read", "TRANSCRIPT_READ",
            "ats.citation.write", "CITATION_WRITE",
            "ats.review.write", "REVIEW_WRITE",
            "ats.review.read", "REVIEW_READ",
            "ats.export.write", "EXPORT_WRITE",
            "ats.dsar.write", "DSAR_WRITE",
            // yıkıcı content-silme AYRI yetki sınıfı (Codex #66 blocker-1): intake ≠ execute
            "ats.erasure.execute", "ERASURE_EXECUTE");

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http, JwtDecoder decoder) throws Exception {
        http.csrf(csrf -> csrf.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(a -> a
                        .requestMatchers("/healthz").permitAll()
                        // OpenAPI metadata (yalnız şema; KİŞİSEL/İŞ VERİSİ DEĞİL — buyer-trust yüzeyi).
                        // Swagger-UI bilinçle yok; prod'da edge katmanında ayrıca kısıtlanabilir.
                        .requestMatchers(HttpMethod.GET, "/v3/api-docs", "/v3/api-docs/**").permitAll()
                        .requestMatchers(HttpMethod.PUT, "/api/v1/interviews/*/recording-consent")
                            .hasAuthority("CONSENT_WRITE")
                        .requestMatchers(HttpMethod.POST, "/api/v1/interviews/*/recordings")
                            .hasAuthority("RECORDING_WRITE")
                        .requestMatchers(HttpMethod.GET, "/api/v1/interviews/*/transcript")
                            .hasAuthority("TRANSCRIPT_READ")
                        .requestMatchers(HttpMethod.POST, "/api/v1/interviews/*/citations")
                            .hasAuthority("CITATION_WRITE")
                        .requestMatchers(HttpMethod.GET, "/api/v1/interviews/*/review-case")
                            .hasAuthority("REVIEW_READ")
                        .requestMatchers(HttpMethod.POST, "/api/v1/interviews/*/review-cases",
                                "/api/v1/interviews/*/review-case/transition",
                                "/api/v1/interviews/*/review-case/finalize")
                            .hasAuthority("REVIEW_WRITE")
                        .requestMatchers(HttpMethod.POST, "/api/v1/interviews/*/export")
                            .hasAuthority("EXPORT_WRITE")
                        .requestMatchers(HttpMethod.POST, "/api/v1/interviews/*/dsar")
                            .hasAuthority("DSAR_WRITE")
                        .requestMatchers(HttpMethod.POST, "/api/v1/interviews/*/dsar/erasure")
                            .hasAuthority("ERASURE_EXECUTE")
                        // bilinmeyen yüzey: fail-closed (yeni endpoint = açık matcher + scope kararı)
                        .anyRequest().denyAll())
                .oauth2ResourceServer(o -> o.jwt(j -> j
                        .decoder(decoder)
                        .jwtAuthenticationConverter(atsAuthenticationConverter())));
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
     * erişimi yapısal imkânsız; ATS-0002).
     */
    private static Converter<Jwt, AbstractAuthenticationToken> atsAuthenticationConverter() {
        return jwt -> {
            String tenant = jwt.getClaimAsString(TENANT_CLAIM);
            boolean hasTenant = tenant != null && !tenant.isBlank();
            List<SimpleGrantedAuthority> authorities = List.of();
            String scope = jwt.getClaimAsString("scope");
            if (hasTenant && scope != null) {
                authorities = List.of(scope.split(" ")).stream()
                        .map(SCOPE_TO_AUTHORITY::get)
                        .filter(a -> a != null)
                        .map(SimpleGrantedAuthority::new)
                        .toList();
            }
            return new JwtAuthenticationToken(jwt, authorities);
        };
    }
}
