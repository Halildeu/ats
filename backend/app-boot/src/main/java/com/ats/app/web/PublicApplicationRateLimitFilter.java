package com.ats.app.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/** Counts every bounded public submission attempt before JSON deserialization. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 30)
final class PublicApplicationRateLimitFilter extends OncePerRequestFilter {

    private static final String SUBMISSION_PATH =
            "/api/v1/(?:jobs/[^/]+|careers/[^/]+/jobs/[^/]+)/applications";
    private static final String RESUME_CREATE_PATH =
            "/api/v1/(?:jobs/[^/]+|careers/[^/]+/jobs/[^/]+)/resume-imports";
    private static final String RESUME_UPLOAD_PATH =
            "/api/v1/candidate/resume-imports/[^/]+/document(?:/replace)?";
    private static final String SUBMISSION_BUCKET = "public-application-submit";
    private final PublicApplicationRateLimiter limiter;

    PublicApplicationRateLimitFilter(PublicApplicationRateLimiter limiter) {
        this.limiter = limiter;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String method = request.getMethod();
        String uri = request.getRequestURI();
        return !("POST".equals(method)
                && (uri.matches(SUBMISSION_PATH) || uri.matches(RESUME_CREATE_PATH)
                        || uri.matches(RESUME_UPLOAD_PATH)))
                && !("PUT".equals(method) && uri.matches(RESUME_UPLOAD_PATH));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
            FilterChain chain) throws ServletException, IOException {
        // The default /jobs alias and canonical /careers/{handle}/jobs route
        // reach the same intake surface. Use one per-IP bucket so aliases and
        // attacker-controlled path segments cannot multiply bucket count.
        String uri = request.getRequestURI();
        String bucket = uri.matches(SUBMISSION_PATH) ? SUBMISSION_BUCKET
                : uri.matches(RESUME_CREATE_PATH) ? "public-resume-import-create"
                : uri.endsWith("/document/replace") ? "public-resume-import-replace"
                : "public-resume-import-upload";
        if (!limiter.allow(request.getRemoteAddr(), bucket)) {
            response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
            response.setHeader("Retry-After", "600");
            response.setHeader("Cache-Control", CacheControl.noStore().getHeaderValue());
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.getWriter().write(
                    "{\"error\":\"RATE_LIMITED\",\"reason\":\"daha sonra tekrar deneyin\"}");
            return;
        }
        chain.doFilter(request, response);
    }
}
