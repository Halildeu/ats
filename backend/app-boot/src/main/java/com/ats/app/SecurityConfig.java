package com.ats.app;

import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.convert.converter.Converter;
import org.springframework.security.authentication.AbstractAuthenticationToken;
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
 *  - Yetki FAIL-CLOSED: ATS_USER authority'si YALNIZ token'da (a) non-blank
 *    `tenant` claim'i VE (b) `scope` içinde `ats.user` varsa verilir. İkisinden
 *    biri yoksa TÜM veri-endpoint'leri 403 (tenant'sız erişim yapısal imkânsız).
 *  - Tenant DAİMA token'dan okunur (istek gövdesi/path'inden ASLA — ATS-0002).
 *  - /healthz açık kalır (veri taşımaz); onun dışında her şey kimlikli.
 *  - Stateless + CSRF kapalı (bearer-token API standardı).
 *
 * İnce-taneli yetkilendirme (rol/ilişki bazlı; OpenFGA benzeri) AYRI ADR —
 * bu dilim kaba-taneli authn + tenant-izolasyon kapısıdır (dürüst sınır).
 */
@Configuration
@EnableWebSecurity
class SecurityConfig {

    static final String TENANT_CLAIM = "tenant";
    static final String REQUIRED_SCOPE = "ats.user";

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http, JwtDecoder decoder) throws Exception {
        http.csrf(csrf -> csrf.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(a -> a
                        .requestMatchers("/healthz").permitAll()
                        .anyRequest().hasAuthority("ATS_USER"))
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

    /** ATS_USER yalnız tenant-claim + ats.user scope birlikteyken (fail-closed). */
    private static Converter<Jwt, AbstractAuthenticationToken> atsAuthenticationConverter() {
        return jwt -> {
            String tenant = jwt.getClaimAsString(TENANT_CLAIM);
            String scope = jwt.getClaimAsString("scope");
            boolean hasScope = scope != null && List.of(scope.split(" ")).contains(REQUIRED_SCOPE);
            boolean hasTenant = tenant != null && !tenant.isBlank();
            List<SimpleGrantedAuthority> authorities = (hasTenant && hasScope)
                    ? List.of(new SimpleGrantedAuthority("ATS_USER"))
                    : List.of();
            return new JwtAuthenticationToken(jwt, authorities);
        };
    }
}
