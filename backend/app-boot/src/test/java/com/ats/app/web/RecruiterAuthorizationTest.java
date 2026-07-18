package com.ats.app.web;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

class RecruiterAuthorizationTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Test
    void ats_view_allows_reads_but_not_mutations() throws Exception {
        var projection = JSON.readTree("""
                {"modules":{"ATS":"VIEW"},"actions":{}}
                """);
        assertTrue(RecruiterAuthorization.projectionAllows(
                projection, RecruiterAuthorization.Permission.JOB_VIEW));
        assertTrue(RecruiterAuthorization.projectionAllows(
                projection, RecruiterAuthorization.Permission.APPLICATION_VIEW));
        assertFalse(RecruiterAuthorization.projectionAllows(
                projection, RecruiterAuthorization.Permission.JOB_MANAGE));
    }

    @Test
    void ats_manage_or_explicit_action_allows_matching_mutation() throws Exception {
        var moduleManage = JSON.readTree("""
                {"modules":{"ATS":"MANAGE"},"actions":{}}
                """);
        assertTrue(RecruiterAuthorization.projectionAllows(
                moduleManage, RecruiterAuthorization.Permission.JOB_PUBLISH));

        var canonicalJobManage = JSON.readTree("""
                {"modules":{"ATS":"VIEW"},"actions":{"ATS_JOB_MANAGE":"ALLOW"}}
                """);
        assertTrue(RecruiterAuthorization.projectionAllows(
                canonicalJobManage, RecruiterAuthorization.Permission.JOB_MANAGE));
        assertTrue(RecruiterAuthorization.projectionAllows(
                canonicalJobManage, RecruiterAuthorization.Permission.JOB_PUBLISH),
                "canonical platform grant içerik ve yayın yaşam döngüsünü birlikte yönetir");

        var actionOnly = JSON.readTree("""
                {"modules":{"ATS":"VIEW"},"actions":{"ATS_APPLICATION_MANAGE":"ALLOW"}}
                """);
        assertTrue(RecruiterAuthorization.projectionAllows(
                actionOnly, RecruiterAuthorization.Permission.APPLICATION_MANAGE));
        assertFalse(RecruiterAuthorization.projectionAllows(
                actionOnly, RecruiterAuthorization.Permission.JOB_MANAGE));
    }

    @Test
    void action_view_is_not_a_mutation_grant() throws Exception {
        var projection = JSON.readTree("""
                {"modules":{"ATS":"VIEW"},"actions":{"ATS_JOB_MANAGE":"VIEW"}}
                """);

        assertFalse(RecruiterAuthorization.projectionAllows(
                projection, RecruiterAuthorization.Permission.JOB_MANAGE));
        assertFalse(RecruiterAuthorization.projectionAllows(
                projection, RecruiterAuthorization.Permission.JOB_PUBLISH));
    }

    @Test
    void platform_super_admin_without_explicit_ats_grant_is_denied() throws Exception {
        var projection = JSON.readTree("""
                {"superAdmin":true,"modules":{},"actions":{}}
                """);

        assertFalse(RecruiterAuthorization.projectionAllows(
                projection, RecruiterAuthorization.Permission.JOB_VIEW));
        assertFalse(RecruiterAuthorization.projectionAllows(
                projection, RecruiterAuthorization.Permission.JOB_MANAGE));
    }

    @Test
    void explicit_deny_wins_and_malformed_projection_fails_closed() throws Exception {
        var moduleDeny = JSON.readTree("""
                {"modules":{"ATS":"DENY"},"actions":{"ATS_JOB_MANAGE":"ALLOW"}}
                """);
        assertFalse(RecruiterAuthorization.projectionAllows(
                moduleDeny, RecruiterAuthorization.Permission.JOB_MANAGE));

        var actionDeny = JSON.readTree("""
                {"modules":{"ATS":"MANAGE"},"actions":{"ATS_JOB_MANAGE":"DENY"}}
                """);
        assertFalse(RecruiterAuthorization.projectionAllows(
                actionDeny, RecruiterAuthorization.Permission.JOB_MANAGE));
        assertFalse(RecruiterAuthorization.projectionAllows(
                JSON.readTree("[]"), RecruiterAuthorization.Permission.JOB_VIEW));
        assertFalse(RecruiterAuthorization.projectionAllows(
                JSON.readTree("{\"modules\":{\"ATS\":42}}"),
                RecruiterAuthorization.Permission.JOB_VIEW));
    }

    @Test
    void configured_platform_projection_is_authoritative_over_legacy_client_role() throws Exception {
        try (ProjectionServer server = new ProjectionServer(
                "{\"modules\":{\"ATS\":\"DENY\"},\"actions\":{}}")) {
            var authorization = new RecruiterAuthorization(
                    server.baseUrl(), Duration.ofSeconds(1), false);
            var authentication = authentication("ats-platform-token", "JOB_WRITE");

            assertFalse(authorization.require(
                    authentication, RecruiterAuthorization.Permission.JOB_MANAGE).isOk());
            assertEquals("Bearer " + "ats-platform-token", server.authorizationHeader());
        }
    }

    @Test
    void configured_platform_action_allows_without_legacy_client_role() throws Exception {
        try (ProjectionServer server = new ProjectionServer(
                "{\"modules\":{\"ATS\":\"VIEW\"},"
                        + "\"actions\":{\"ATS_JOB_MANAGE\":\"ALLOW\"}}")) {
            var authorization = new RecruiterAuthorization(
                    server.baseUrl(), Duration.ofSeconds(1), false);

            assertTrue(authorization.require(
                    authentication("platform-only-token"),
                    RecruiterAuthorization.Permission.JOB_MANAGE).isOk());
        }
    }

    @Test
    void platform_base_url_accepts_only_an_origin_without_path_query_or_fragment() {
        assertThrows(IllegalStateException.class,
                () -> new RecruiterAuthorization(
                        "https://permission.internal/tenant-a", Duration.ofSeconds(1), false));
        assertThrows(IllegalStateException.class,
                () -> new RecruiterAuthorization(
                        "https://permission.internal?tenant=a", Duration.ofSeconds(1), false));
        assertThrows(IllegalStateException.class,
                () -> new RecruiterAuthorization(
                        "https://permission.internal#authz", Duration.ofSeconds(1), false));
    }

    @Test
    void missing_platform_projection_rejects_legacy_authority_by_default() {
        var authorization = new RecruiterAuthorization("", Duration.ofSeconds(1), false);

        var outcome = authorization.require(
                authentication("legacy-token", "JOB_WRITE"),
                RecruiterAuthorization.Permission.JOB_MANAGE);

        assertFalse(outcome.isOk());
        assertEquals(com.ats.kernel.OutcomeCode.NOT_CONFIGURED,
                ((com.ats.kernel.Outcome.Fail<Void>) outcome).code());
    }

    @Test
    void explicitly_enabled_legacy_compatibility_stays_operation_scoped() {
        var authorization = new RecruiterAuthorization("", Duration.ofSeconds(1), true);

        assertTrue(authorization.require(
                authentication("legacy-token", "JOB_WRITE"),
                RecruiterAuthorization.Permission.JOB_MANAGE).isOk());
        assertFalse(authorization.require(
                authentication("legacy-token", "JOB_WRITE"),
                RecruiterAuthorization.Permission.JOB_PUBLISH).isOk());
    }

    private static JwtAuthenticationToken authentication(String token, String... authorities) {
        Jwt jwt = Jwt.withTokenValue(token)
                .header("alg", "none")
                .subject("user-42")
                .build();
        return new JwtAuthenticationToken(jwt, List.of(authorities).stream()
                .map(SimpleGrantedAuthority::new)
                .toList());
    }

    private static final class ProjectionServer implements AutoCloseable {
        private final HttpServer server;
        private volatile String authorizationHeader;

        ProjectionServer(String responseBody) throws Exception {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/api/v1/authz/me", exchange -> {
                authorizationHeader = exchange.getRequestHeaders().getFirst("Authorization");
                byte[] body = responseBody.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, body.length);
                exchange.getResponseBody().write(body);
                exchange.close();
            });
            server.start();
        }

        String baseUrl() {
            return "http://127.0.0.1:" + server.getAddress().getPort();
        }

        String authorizationHeader() {
            return authorizationHeader;
        }

        @Override
        public void close() {
            server.stop(0);
        }
    }
}
