package com.ats.app.web;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

class PublicApplicationRateLimiterTest {

    @Test
    void allows_ten_per_client_and_job_then_fails_closed() {
        var limiter = new PublicApplicationRateLimiter(
                Clock.fixed(Instant.parse("2026-07-16T12:00:00Z"), ZoneOffset.UTC));

        for (int i = 0; i < 10; i++) assertTrue(limiter.allow("203.0.113.10", "job-a"));
        assertFalse(limiter.allow("203.0.113.10", "job-a"));
        assertTrue(limiter.allow("203.0.113.10", "job-b"));
        assertTrue(limiter.allow("203.0.113.11", "job-a"));
    }
}
