package com.ats.app;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;

/**
 * slice-39b (ATS-0019): platform-KC JWT acceptance — configurable tenant-claim.
 * Boot'suz saf converter testi (Testcontainers gerekmez): tenant-claim ADI
 * config'lenebilir; YALNIZ o JWT claim'i okunur; tenant'sız/scope'suz fail-closed.
 * (Uçtan-uca iss/aud/tenant/scope HTTP fail-closed'ı RestApiSecurityTest kapsar.)
 */
class SecurityConfigConverterTest {

    private static Jwt jwt(Map<String, Object> claims) {
        Jwt.Builder b = Jwt.withTokenValue("t")
                .header("alg", "RS256")
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(300));
        claims.forEach(b::claim);
        // Jwt en az bir claim ister; subject güvenli varsayılan
        return b.subject("s").build();
    }

    private static List<String> names(List<SimpleGrantedAuthority> a) {
        return a.stream().map(SimpleGrantedAuthority::getAuthority).sorted().collect(Collectors.toList());
    }

    @Test
    void default_tenant_claim_derives_authorities_from_scope() {
        var auth = SecurityConfig.deriveAuthorities(
                jwt(Map.of("tenant", "t-1", "scope", "ats.transcript.read ats.citation.write")), "tenant");
        assertEquals(List.of("CITATION_WRITE", "TRANSCRIPT_READ"), names(auth));
    }

    @Test
    void configurable_tenant_claim_name_reads_platform_claim() {
        // platform-KC token'ında tenant claim adı "tenant_id" olabilir → config ile okunur
        var auth = SecurityConfig.deriveAuthorities(
                jwt(Map.of("tenant_id", "t-1", "scope", "ats.review.read")), "tenant_id");
        assertEquals(List.of("REVIEW_READ"), names(auth));
    }

    @Test
    void wrong_configured_claim_name_yields_no_authority_fail_closed() {
        // token "tenant_id" taşıyor ama config "tenant" bekliyor → tenant bulunamaz → yetki YOK
        var auth = SecurityConfig.deriveAuthorities(
                jwt(Map.of("tenant_id", "t-1", "scope", "ats.transcript.read")), "tenant");
        assertTrue(auth.isEmpty(), "yanlış-isimli tenant claim'i fail-closed olmalı");
    }

    @Test
    void missing_tenant_yields_no_authority_even_with_scope() {
        var auth = SecurityConfig.deriveAuthorities(
                jwt(Map.of("scope", "ats.transcript.read ats.export.write")), "tenant");
        assertTrue(auth.isEmpty(), "tenant'sız token yetki alamaz (ATS-0002 fail-closed)");
    }

    @Test
    void blank_tenant_yields_no_authority() {
        var auth = SecurityConfig.deriveAuthorities(
                jwt(Map.of("tenant", "   ", "scope", "ats.transcript.read")), "tenant");
        assertTrue(auth.isEmpty(), "boş tenant fail-closed");
    }

    @Test
    void missing_scope_yields_no_authority() {
        var auth = SecurityConfig.deriveAuthorities(jwt(Map.of("tenant", "t-1")), "tenant");
        assertTrue(auth.isEmpty(), "scope'suz token yetki alamaz");
    }

    @Test
    void unknown_scopes_are_dropped_not_mapped() {
        var auth = SecurityConfig.deriveAuthorities(
                jwt(Map.of("tenant", "t-1", "scope", "openid profile ats.dsar.write email")), "tenant");
        assertEquals(List.of("DSAR_WRITE"), names(auth), "bilinmeyen scope'lar düşer, ats.* map edilir");
    }

    @Test
    void converter_factory_defaults_blank_claim_name_to_tenant() {
        // atsAuthenticationConverter(null/blank) → "tenant" default
        var conv = SecurityConfig.atsAuthenticationConverter("  ");
        var token = conv.convert(jwt(Map.of("tenant", "t-1", "scope", "ats.review.read")));
        assertEquals(1, token.getAuthorities().size());
        assertEquals("REVIEW_READ", token.getAuthorities().iterator().next().getAuthority());
    }
}
