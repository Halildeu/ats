package com.ats.app.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class PublicApplicationRateLimitFilterTest {

    @Test
    void counts_attempts_before_deserialization_and_returns_no_store_429() throws Exception {
        var limiter = new PublicApplicationRateLimiter(
                Clock.fixed(Instant.parse("2026-07-16T12:00:00Z"), ZoneOffset.UTC));
        var filter = new PublicApplicationRateLimitFilter(limiter);

        for (int i = 0; i < PublicApplicationRateLimiter.LIMIT; i++) {
            var response = new MockHttpServletResponse();
            filter.doFilter(request(), response, new MockFilterChain());
            assertEquals(200, response.getStatus());
        }

        var denied = new MockHttpServletResponse();
        filter.doFilter(request(), denied, new MockFilterChain());
        assertEquals(429, denied.getStatus());
        assertEquals("600", denied.getHeader("Retry-After"));
        assertEquals("no-store", denied.getHeader("Cache-Control"));
        assertTrue(denied.getContentAsString().contains("RATE_LIMITED"));
    }

    private static MockHttpServletRequest request() {
        var request = new MockHttpServletRequest("POST", "/api/v1/jobs/product-designer/applications");
        request.setRemoteAddr("203.0.113.10");
        return request;
    }
}
