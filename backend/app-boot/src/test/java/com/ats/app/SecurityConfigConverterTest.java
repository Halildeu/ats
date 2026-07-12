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
 * slice-39d-2b: ROL-KAPILI kesişim (Codex 019f4c6c P0) — authority yalnız
 * `scope ∩ resource_access.<ats-client>.roles ∩ bilinen-permissions`.
 * Boot'suz saf converter testi (Testcontainers gerekmez). (Uçtan-uca
 * iss/aud/tenant/scope/rol HTTP fail-closed'ı RestApiSecurityTest kapsar.)
 */
class SecurityConfigConverterTest {

    private static final String ATS_CLIENT = "ats-api";

    private static Jwt jwt(Map<String, Object> claims) {
        Jwt.Builder b = Jwt.withTokenValue("t")
                .header("alg", "RS256")
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(300));
        claims.forEach(b::claim);
        // Jwt en az bir claim ister; subject güvenli varsayılan
        return b.subject("s").build();
    }

    /** Kısayol: verilen roller `resource_access.ats-api.roles` altında atanmış. */
    private static Map<String, Object> roles(String... assigned) {
        return Map.of(ATS_CLIENT, Map.of("roles", List.of(assigned)));
    }

    private static List<String> names(List<SimpleGrantedAuthority> a) {
        return a.stream().map(SimpleGrantedAuthority::getAuthority).sorted().collect(Collectors.toList());
    }

    @Test
    void default_tenant_claim_derives_authorities_from_scope_role_intersection() {
        var auth = SecurityConfig.deriveAuthorities(
                jwt(Map.of("tenant", "t-1",
                        "scope", "ats.transcript.read ats.citation.write",
                        "resource_access", roles("ats.transcript.read", "ats.citation.write"))),
                "tenant", ATS_CLIENT);
        assertEquals(List.of("CITATION_WRITE", "TRANSCRIPT_READ"), names(auth));
    }

    @Test
    void configurable_tenant_claim_name_reads_platform_claim() {
        // platform-KC token'ında tenant claim adı "tenant_id" olabilir → config ile okunur
        var auth = SecurityConfig.deriveAuthorities(
                jwt(Map.of("tenant_id", "t-1", "scope", "ats.review.read",
                        "resource_access", roles("ats.review.read"))),
                "tenant_id", ATS_CLIENT);
        assertEquals(List.of("REVIEW_READ"), names(auth));
    }

    @Test
    void wrong_configured_claim_name_yields_no_authority_fail_closed() {
        // token "tenant_id" taşıyor ama config "tenant" bekliyor → tenant bulunamaz → yetki YOK
        var auth = SecurityConfig.deriveAuthorities(
                jwt(Map.of("tenant_id", "t-1", "scope", "ats.transcript.read",
                        "resource_access", roles("ats.transcript.read"))),
                "tenant", ATS_CLIENT);
        assertTrue(auth.isEmpty(), "yanlış-isimli tenant claim'i fail-closed olmalı");
    }

    @Test
    void missing_tenant_yields_no_authority_even_with_scope_and_roles() {
        var auth = SecurityConfig.deriveAuthorities(
                jwt(Map.of("scope", "ats.transcript.read ats.export.write",
                        "resource_access", roles("ats.transcript.read", "ats.export.write"))),
                "tenant", ATS_CLIENT);
        assertTrue(auth.isEmpty(), "tenant'sız token yetki alamaz (ATS-0002 fail-closed)");
    }

    @Test
    void blank_tenant_yields_no_authority() {
        var auth = SecurityConfig.deriveAuthorities(
                jwt(Map.of("tenant", "   ", "scope", "ats.transcript.read",
                        "resource_access", roles("ats.transcript.read"))),
                "tenant", ATS_CLIENT);
        assertTrue(auth.isEmpty(), "boş tenant fail-closed");
    }

    @Test
    void missing_scope_yields_no_authority_even_with_roles() {
        // rol ATANMIŞ ama scope İSTENMEMİŞ → kesişim boş (istek yarısı da zorunlu)
        var auth = SecurityConfig.deriveAuthorities(
                jwt(Map.of("tenant", "t-1", "resource_access", roles("ats.export.write"))),
                "tenant", ATS_CLIENT);
        assertTrue(auth.isEmpty(), "scope'suz token yetki alamaz (rol atanmış olsa bile)");
    }

    @Test
    void unknown_scopes_are_dropped_not_mapped() {
        var auth = SecurityConfig.deriveAuthorities(
                jwt(Map.of("tenant", "t-1", "scope", "openid profile ats.dsar.write email",
                        "resource_access", roles("ats.dsar.write"))),
                "tenant", ATS_CLIENT);
        assertEquals(List.of("DSAR_WRITE"), names(auth), "bilinmeyen scope'lar düşer, ats.* map edilir");
    }

    @Test
    void converter_factory_defaults_blank_claim_name_to_tenant() {
        // atsAuthenticationConverter(null/blank, client) → "tenant" default
        var conv = SecurityConfig.atsAuthenticationConverter("  ", ATS_CLIENT);
        var token = conv.convert(jwt(Map.of("tenant", "t-1", "scope", "ats.review.read",
                "resource_access", roles("ats.review.read"))));
        assertEquals(1, token.getAuthorities().size());
        assertEquals("REVIEW_READ", token.getAuthorities().iterator().next().getAuthority());
    }

    // ── 39d-2b rol-kapısı: escalation + fail-closed matrisi (Codex 019f4c6c P0) ──

    @Test
    void requested_scope_without_assigned_role_is_no_authority_self_escalation_closed() {
        // ESCALATION ANA KANITI: kullanıcı ayrıcalıklı scope'ları İSTEMİŞ ve
        // IdP token'a YAZMIŞ olsa bile atanmış ats-api rolü yoksa yetki YOK.
        var auth = SecurityConfig.deriveAuthorities(
                jwt(Map.of("tenant", "t-1",
                        "scope", "ats.export.write ats.dsar.write ats.erasure.execute")),
                "tenant", ATS_CLIENT);
        assertTrue(auth.isEmpty(), "scope istemek ≠ permission (rol-kapısı)");
    }

    @Test
    void intersection_limits_broad_scope_request_to_assigned_roles_only() {
        var auth = SecurityConfig.deriveAuthorities(
                jwt(Map.of("tenant", "t-1",
                        "scope", "ats.transcript.read ats.export.write ats.erasure.execute",
                        "resource_access", roles("ats.transcript.read"))),
                "tenant", ATS_CLIENT);
        assertEquals(List.of("TRANSCRIPT_READ"), names(auth),
                "geniş scope isteği atanmış rollere KIRPILIR");
    }

    @Test
    void role_under_different_client_grants_nothing() {
        var auth = SecurityConfig.deriveAuthorities(
                jwt(Map.of("tenant", "t-1", "scope", "ats.export.write",
                        "resource_access", Map.of("other-client", Map.of("roles", List.of("ats.export.write"))))),
                "tenant", ATS_CLIENT);
        assertTrue(auth.isEmpty(), "başka client'ın rolü ATS yetkisi vermez");
    }

    @Test
    void unknown_permission_in_both_claims_grants_nothing() {
        // iki claim'de de aynı bilinmeyen string → bilinen-permission kesişimi düşürür
        var auth = SecurityConfig.deriveAuthorities(
                jwt(Map.of("tenant", "t-1", "scope", "ats.hacky.thing",
                        "resource_access", roles("ats.hacky.thing"))),
                "tenant", ATS_CLIENT);
        assertTrue(auth.isEmpty(), "bilinmeyen permission iki claim'de olsa da yetki üretmez");
    }

    @Test
    void malformed_resource_access_shapes_fail_closed_without_exception() {
        // string claim
        var a1 = SecurityConfig.deriveAuthorities(
                jwt(Map.of("tenant", "t-1", "scope", "ats.transcript.read",
                        "resource_access", "bozuk")),
                "tenant", ATS_CLIENT);
        assertTrue(a1.isEmpty(), "string resource_access → yetkisiz, istisnasız");
        // roles liste değil
        var a2 = SecurityConfig.deriveAuthorities(
                jwt(Map.of("tenant", "t-1", "scope", "ats.transcript.read",
                        "resource_access", Map.of(ATS_CLIENT, Map.of("roles", "ats.transcript.read")))),
                "tenant", ATS_CLIENT);
        assertTrue(a2.isEmpty(), "string roles → yetkisiz, istisnasız");
        // liste elemanı string değil
        var a3 = SecurityConfig.deriveAuthorities(
                jwt(Map.of("tenant", "t-1", "scope", "ats.transcript.read",
                        "resource_access", Map.of(ATS_CLIENT, Map.of("roles", List.of(42))))),
                "tenant", ATS_CLIENT);
        assertTrue(a3.isEmpty(), "non-string rol elemanı → yetkisiz, istisnasız");
    }

    @Test
    void case_and_whitespace_variants_do_not_match_exact_contract() {
        var auth = SecurityConfig.deriveAuthorities(
                jwt(Map.of("tenant", "t-1", "scope", "ats.export.write",
                        "resource_access", roles("ATS.EXPORT.WRITE", "ats.export.write "))),
                "tenant", ATS_CLIENT);
        assertTrue(auth.isEmpty(), "normalize edilmemiş varyantlar exact kontrata göre deny");
    }

    // ---- 39d-8: ats.export.read → EXPORT_READ (yeni salt-okuma yetkisi) ----

    @Test
    void export_read_scope_and_assigned_role_map_to_export_read_authority() {
        var auth = SecurityConfig.deriveAuthorities(
                jwt(Map.of("tenant", "t-1", "scope", "ats.export.read",
                        "resource_access", roles("ats.export.read"))),
                "tenant", ATS_CLIENT);
        assertEquals(List.of("EXPORT_READ"), names(auth));
    }

    @Test
    void export_read_scope_without_assigned_role_grants_nothing() {
        // scope istenen-yarı; rol atanmadan authority ÜRETİLMEZ (self-escalation kapalı):
        var auth = SecurityConfig.deriveAuthorities(
                jwt(Map.of("tenant", "t-1", "scope", "ats.export.read",
                        "resource_access", Map.of())),
                "tenant", ATS_CLIENT);
        assertTrue(auth.isEmpty());
    }
}
