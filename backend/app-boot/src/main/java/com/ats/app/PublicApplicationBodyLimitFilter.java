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
 * JSON deserialize edilmeden önce public application ve recruiter job mutation
 * body sınırı. Chunked/belirsiz uzunluk reddedilir; proxy ve uygulama aynı
 * 64 KiB kontratını taşır.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
final class PublicApplicationBodyLimitFilter extends OncePerRequestFilter {

    static final long MAX_BYTES = 65_536L;
    private static final String SUBMISSION_PATH =
            "/api/v1/(?:jobs/[^/]+|careers/[^/]+/jobs/[^/]+)/applications";
    private static final String RESUME_CREATE_PATH =
            "/api/v1/(?:jobs/[^/]+|careers/[^/]+/jobs/[^/]+)/resume-imports";
    private static final String RESUME_MUTATION_PATH =
            "/api/v1/candidate/resume-imports/[^/]+/(?:fields/[^/]+|document/replace|confirm|terminate)";
    private static final String RECRUITER_CREATE_PATH = "/api/v1/recruiter/jobs";
    private static final String RECRUITER_UPDATE_PATH = "/api/v1/recruiter/jobs/[^/]+";
    private static final String RECRUITER_TRANSITION_PATH =
            "/api/v1/recruiter/jobs/[^/]+/transitions";

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String method = request.getMethod();
        String uri = request.getRequestURI();
        boolean boundedPost = "POST".equals(method)
                && (uri.matches(SUBMISSION_PATH)
                        || uri.matches(RESUME_CREATE_PATH)
                        || uri.matches(RESUME_MUTATION_PATH)
                        || uri.matches(RECRUITER_CREATE_PATH)
                        || uri.matches(RECRUITER_TRANSITION_PATH));
        boolean boundedPut = "PUT".equals(method)
                && (uri.matches(RECRUITER_UPDATE_PATH) || uri.matches(RESUME_MUTATION_PATH));
        return !boundedPost && !boundedPut;
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
        boolean json;
        try {
            json = contentType != null && MediaType.APPLICATION_JSON.isCompatibleWith(
                    MediaType.parseMediaType(contentType));
        } catch (IllegalArgumentException invalid) {
            json = false;
        }
        if (!json) {
            write(response, 415, "APPLICATION_JSON_REQUIRED");
            return;
        }
        chain.doFilter(request, response);
    }

    private static void write(HttpServletResponse response, int status, String error) throws IOException {
        response.setStatus(status);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setHeader("Cache-Control", "no-store");
        response.getWriter().write("{\"error\":\"" + error + "\"}");
    }
}
