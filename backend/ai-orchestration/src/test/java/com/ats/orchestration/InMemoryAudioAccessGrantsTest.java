package com.ats.orchestration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

/** Deterministik Clock ile one-shot/TTL/tenant-bind davranış testleri (Codex a). */
class InMemoryAudioAccessGrantsTest {

    /** Test-kontrollü saat: expiry deterministik ilerletilir. */
    static final class MutableClock extends Clock {
        private Instant now = Instant.parse("2026-07-03T00:00:00Z");

        void advance(Duration d) {
            now = now.plus(d);
        }

        @Override
        public Instant instant() {
            return now;
        }

        @Override
        public java.time.ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return this;
        }
    }

    private static final TenantId T1 = new TenantId("t-1");

    @Test
    void issue_then_single_redeem_returns_tenant_bound_grant() {
        InMemoryAudioAccessGrants grants =
                new InMemoryAudioAccessGrants(new MutableClock(), Duration.ofSeconds(60));
        String handle = ((Outcome.Ok<String>) grants.issue(T1, "iv-1/rec-abc")).value();
        assertTrue(handle.matches("[0-9a-f]{64}"), "kriptografik-rastgele 64-hex handle");
        AudioAccessGrants.Grant g =
                ((Outcome.Ok<AudioAccessGrants.Grant>) grants.redeem(handle)).value();
        assertEquals(T1, g.tenantId());
        assertEquals("iv-1/rec-abc", g.objectKey());
    }

    @Test
    void second_redeem_fails_one_shot() {
        InMemoryAudioAccessGrants grants =
                new InMemoryAudioAccessGrants(new MutableClock(), Duration.ofSeconds(60));
        String handle = ((Outcome.Ok<String>) grants.issue(T1, "k")).value();
        assertInstanceOf(Outcome.Ok.class, grants.redeem(handle));
        Outcome.Fail<AudioAccessGrants.Grant> second =
                assertInstanceOf(Outcome.Fail.class, grants.redeem(handle));
        assertEquals(OutcomeCode.NOT_FOUND, second.code());
    }

    @Test
    void expired_handle_fails_and_is_consumed_on_redeem_attempt() {
        MutableClock clock = new MutableClock();
        InMemoryAudioAccessGrants grants = new InMemoryAudioAccessGrants(clock, Duration.ofSeconds(30));
        String handle = ((Outcome.Ok<String>) grants.issue(T1, "k")).value();
        clock.advance(Duration.ofSeconds(31));
        Outcome.Fail<AudioAccessGrants.Grant> expired =
                assertInstanceOf(Outcome.Fail.class, grants.redeem(handle));
        assertEquals(OutcomeCode.NOT_FOUND, expired.code());
        // redeem denemesi kaydı tüketti — defter boş
        assertEquals(0, grants.size());
    }

    @Test
    void issue_sweeps_expired_entries_bounded_ledger() {
        MutableClock clock = new MutableClock();
        InMemoryAudioAccessGrants grants = new InMemoryAudioAccessGrants(clock, Duration.ofSeconds(30));
        grants.issue(T1, "k1");
        grants.issue(T1, "k2");
        assertEquals(2, grants.size());
        clock.advance(Duration.ofSeconds(31));
        grants.issue(T1, "k3"); // sweep tetiklenir: k1/k2 expired temizlenir
        assertEquals(1, grants.size());
    }

    @Test
    void unknown_and_blank_handles_fail_closed() {
        InMemoryAudioAccessGrants grants =
                new InMemoryAudioAccessGrants(new MutableClock(), Duration.ofSeconds(30));
        assertEquals(OutcomeCode.NOT_FOUND,
                ((Outcome.Fail<AudioAccessGrants.Grant>) grants.redeem("f".repeat(64))).code());
        assertEquals(OutcomeCode.INVALID,
                ((Outcome.Fail<AudioAccessGrants.Grant>) grants.redeem("  ")).code());
    }

    @Test
    void invalid_issue_inputs_and_ctor_guards() {
        InMemoryAudioAccessGrants grants =
                new InMemoryAudioAccessGrants(new MutableClock(), Duration.ofSeconds(30));
        assertEquals(OutcomeCode.INVALID,
                ((Outcome.Fail<String>) grants.issue(null, "k")).code());
        assertEquals(OutcomeCode.INVALID,
                ((Outcome.Fail<String>) grants.issue(T1, " ")).code());
        assertThrows(IllegalArgumentException.class,
                () -> new InMemoryAudioAccessGrants(null, Duration.ofSeconds(1)));
        assertThrows(IllegalArgumentException.class,
                () -> new InMemoryAudioAccessGrants(new MutableClock(), Duration.ZERO));
    }

    @Test
    void handles_are_unique_per_issue() {
        InMemoryAudioAccessGrants grants =
                new InMemoryAudioAccessGrants(new MutableClock(), Duration.ofSeconds(60));
        String h1 = ((Outcome.Ok<String>) grants.issue(T1, "k")).value();
        String h2 = ((Outcome.Ok<String>) grants.issue(T1, "k")).value();
        assertNotEquals(h1, h2, "aynı key için bile her issue yeni handle üretir");
    }
}
