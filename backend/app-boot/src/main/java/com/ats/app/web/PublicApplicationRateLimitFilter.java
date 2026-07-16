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

    private static final String PREFIX = "/api/v1/jobs/";
    private static final String SUFFIX = "/applications";
    private final PublicApplicationRateLimiter limiter;

    PublicApplicationRateLimitFilter(PublicApplicationRateLimiter limiter) {
        this.limiter = limiter;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !"POST".equals(request.getMethod())
                || !request.getRequestURI().matches("/api/v1/jobs/[^/]+/applications");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
            FilterChain chain) throws ServletException, IOException {
        String uri = request.getRequestURI();
        String jobSlug = uri.substring(PREFIX.length(), uri.length() - SUFFIX.length());
        if (!limiter.allow(request.getRemoteAddr(), jobSlug)) {
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
