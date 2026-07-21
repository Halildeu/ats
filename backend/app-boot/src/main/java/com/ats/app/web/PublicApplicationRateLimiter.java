package com.ats.app.web;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.HashMap;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Tek-replica test workload'u için bounded abuse guard. Raw IP loglanmaz veya
 * saklanmaz; yalnız süreç-içi SHA-256 bucket anahtarı tutulur. Çok-replika
 * ölçeğinde edge/global limiter ayrıca zorunludur.
 */
@Component
final class PublicApplicationRateLimiter {

    static final int LIMIT = 10;
    static final int MAX_BUCKETS = 10_000;
    static final Duration WINDOW = Duration.ofMinutes(10);
    private final Map<String, Bucket> buckets = new HashMap<>();
    private final Clock clock;
    private final int limit;

    @Autowired
    PublicApplicationRateLimiter(
            @Value("${ats.application.rate-limit.limit:10}") int limit) {
        this(Clock.systemUTC(), limit);
    }

    PublicApplicationRateLimiter(Clock clock) {
        this(clock, LIMIT);
    }

    PublicApplicationRateLimiter(Clock clock, int limit) {
        if (limit < 1 || limit > 10_000) {
            throw new IllegalArgumentException("rate limit 1..10000 olmalı");
        }
        this.clock = clock;
        this.limit = limit;
    }

    synchronized boolean allow(String remoteAddress, String jobSlug) {
        Instant now = clock.instant();
        String key = sha256((remoteAddress == null ? "unknown" : remoteAddress) + "|" + jobSlug);
        if (!buckets.containsKey(key) && buckets.size() >= MAX_BUCKETS) {
            buckets.entrySet().removeIf(e -> !now.isBefore(e.getValue().startedAt().plus(WINDOW)));
            if (buckets.size() >= MAX_BUCKETS) return false;
        }
        Bucket current = buckets.get(key);
        Bucket result = current == null || !now.isBefore(current.startedAt().plus(WINDOW))
                ? new Bucket(now, 1)
                : new Bucket(current.startedAt(), current.count() + 1);
        buckets.put(key, result);
        return result.count() <= limit;
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }

    private record Bucket(Instant startedAt, int count) {}
}
