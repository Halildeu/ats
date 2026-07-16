package com.ats.app;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * JSON deserialize edilmeden önce public application body sınırı. Chunked/
 * belirsiz uzunluk reddedilir; proxy ve uygulama aynı 64 KiB kontratını taşır.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
final class PublicApplicationBodyLimitFilter extends OncePerRequestFilter {

    static final long MAX_BYTES = 65_536L;

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !"POST".equals(request.getMethod())
                || !request.getRequestURI().matches("/api/v1/jobs/[^/]+/applications");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
            FilterChain chain) throws ServletException, IOException {
        long length = request.getContentLengthLong();
        if (length < 0) {
            write(response, 411, "CONTENT_LENGTH_REQUIRED");
            return;
        }
        if (length > MAX_BYTES) {
            write(response, 413, "PAYLOAD_TOO_LARGE");
            return;
        }
        String contentType = request.getContentType();
        if (contentType == null || !MediaType.APPLICATION_JSON.isCompatibleWith(
                MediaType.parseMediaType(contentType))) {
            write(response, 415, "APPLICATION_JSON_REQUIRED");
            return;
        }
        chain.doFilter(request, response);
    }

    private static void write(HttpServletResponse response, int status, String error) throws IOException {
        response.setStatus(status);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write("{\"error\":\"" + error + "\"}");
    }
}
