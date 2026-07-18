package com.ats.app.web;

import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import com.fasterxml.jackson.databind.JsonNode;
import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Platform permission-service projection'ını aynı bearer kimliğiyle doğrular.
 * Frontend route görünürlüğü veya catalog varlığı yetki değildir. Platform PDP
 * yapılandırılmamışsa production davranışı fail-closed'dur; eski ats-api
 * authority uyumluluğu yalnız açık test/rolling-deploy bayrağıyla etkinleşir.
 */
@Component
final class RecruiterAuthorization {

    enum Permission {
        JOB_VIEW,
        JOB_MANAGE,
        JOB_PUBLISH,
        APPLICATION_VIEW,
        APPLICATION_MANAGE,
        INTERVIEW_VIEW,
        INTERVIEW_MANAGE,
        SCORECARD_WRITE
    }

    private final RestClient client;
    private final boolean configured;
    private final boolean allowLegacyAuthorities;

    RecruiterAuthorization(
            @Value("${ats.authorization.platform-base-url:}") String platformBaseUrl,
            @Value("${ats.authorization.timeout:3s}") Duration timeout,
            @Value("${ats.authorization.allow-legacy-authorities:false}")
            boolean allowLegacyAuthorities) {
        this.allowLegacyAuthorities = allowLegacyAuthorities;
        String value = platformBaseUrl == null ? "" : platformBaseUrl.trim();
        configured = !value.isEmpty();
        if (!configured) {
            client = null;
            return;
        }
        URI uri;
        try {
            uri = URI.create(value);
        } catch (IllegalArgumentException ex) {
            throw new IllegalStateException("ats.authorization.platform-base-url geçersiz", ex);
        }
        if (!("http".equals(uri.getScheme()) || "https".equals(uri.getScheme()))
                || uri.getHost() == null || uri.getUserInfo() != null
                || (uri.getPath() != null && !uri.getPath().isEmpty() && !"/".equals(uri.getPath()))
                || uri.getQuery() != null || uri.getFragment() != null) {
            throw new IllegalStateException(
                    "ats.authorization.platform-base-url yalnız güvenilir http(s) service origin olabilir");
        }
        Duration bounded = timeout == null || timeout.isNegative() || timeout.isZero()
                ? Duration.ofSeconds(3) : timeout;
        HttpClient httpClient = HttpClient.newBuilder()
                .connectTimeout(bounded)
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(httpClient);
        factory.setReadTimeout(bounded);
        // Feed RestClient a canonical origin reconstructed from the already
        // validated URI components. This avoids asking two URI parsers to
        // interpret the original operator-provided string independently.
        String origin;
        try {
            origin = new URI(uri.getScheme(), null, uri.getHost(), uri.getPort(),
                    null, null, null).toASCIIString();
        } catch (java.net.URISyntaxException ex) {
            throw new IllegalStateException("ats.authorization.platform-base-url geçersiz", ex);
        }
        client = RestClient.builder().baseUrl(origin).requestFactory(factory).build();
    }

    Outcome<Void> require(Authentication authentication, Permission permission) {
        if (authentication == null || !(authentication.getPrincipal() instanceof Jwt jwt)) {
            return Outcome.fail(OutcomeCode.UNAUTHENTICATED, "JWT kimliği gerekli");
        }
        if (!configured) {
            if (allowLegacyAuthorities && legacyAuthorityAllows(authentication, permission)) {
                return Outcome.ok(null);
            }
            if (allowLegacyAuthorities && hasAnyLegacyAuthority(authentication)) {
                return Outcome.fail(OutcomeCode.DENIED, "ATS yetkisi yok");
            }
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED,
                    "platform ATS yetki doğrulama ucu yapılandırılmamış");
        }
        try {
            JsonNode projection = client.get()
                    .uri("/api/v1/authz/me")
                    .headers(headers -> headers.setBearerAuth(jwt.getTokenValue()))
                    .retrieve()
                    .body(JsonNode.class);
            return projectionAllows(projection, permission)
                    ? Outcome.ok(null)
                    : Outcome.fail(OutcomeCode.DENIED, "ATS yetkisi yok");
        } catch (HttpClientErrorException.Unauthorized ex) {
            return Outcome.fail(OutcomeCode.UNAUTHENTICATED, "platform kimliği reddetti");
        } catch (HttpClientErrorException.Forbidden ex) {
            return Outcome.fail(OutcomeCode.DENIED, "platform ATS yetkisini reddetti");
        } catch (RestClientException ex) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED,
                    "platform ATS yetki doğrulaması kullanılamıyor (fail-closed)");
        }
    }

    static boolean projectionAllows(JsonNode root, Permission permission) {
        if (root == null || !root.isObject()) return false;
        JsonNode modules = root.path("modules");
        JsonNode actions = root.path("actions");
        String moduleGrant = textual(modules.path("ATS"));
        if ("DENY".equals(moduleGrant)) return false;

        if (permission == Permission.JOB_VIEW || permission == Permission.APPLICATION_VIEW
                || permission == Permission.INTERVIEW_VIEW) {
            return Set.of("VIEW", "MANAGE", "ALLOW").contains(moduleGrant);
        }

        String actionKey = switch (permission) {
            case JOB_MANAGE, JOB_PUBLISH -> "ATS_JOB_MANAGE";
            case APPLICATION_MANAGE, INTERVIEW_MANAGE, SCORECARD_WRITE -> "ATS_APPLICATION_MANAGE";
            default -> "";
        };
        String actionGrant = textual(actions.path(actionKey));
        if ("DENY".equals(actionGrant)) return false;
        return "ALLOW".equals(actionGrant)
                || "MANAGE".equals(moduleGrant);
    }

    private static boolean legacyAuthorityAllows(Authentication authentication, Permission permission) {
        Set<String> names = authentication.getAuthorities().stream()
                .map(authority -> authority.getAuthority())
                .collect(java.util.stream.Collectors.toSet());
        return switch (permission) {
            case JOB_VIEW -> names.contains("JOB_READ") || names.contains("JOB_WRITE")
                    || names.contains("JOB_PUBLISH");
            case JOB_MANAGE -> names.contains("JOB_WRITE");
            case JOB_PUBLISH -> names.contains("JOB_PUBLISH");
            case APPLICATION_VIEW, INTERVIEW_VIEW -> names.contains("APPLICATION_READ");
            case APPLICATION_MANAGE, INTERVIEW_MANAGE, SCORECARD_WRITE ->
                    names.contains("APPLICATION_STATUS_WRITE");
        };
    }

    private static boolean hasAnyLegacyAuthority(Authentication authentication) {
        return authentication.getAuthorities().stream()
                .map(authority -> authority.getAuthority())
                .anyMatch(Set.of(
                        "JOB_READ", "JOB_WRITE", "JOB_PUBLISH",
                        "APPLICATION_READ", "APPLICATION_STATUS_WRITE")::contains);
    }

    private static String textual(JsonNode node) {
        return node != null && node.isTextual() ? node.textValue() : "";
    }
}
