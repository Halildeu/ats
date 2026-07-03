package com.ats.orchestration;

import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-process grant defteri. Clock enjekte (deterministik test); TTL configurable
 * (kaçak handle'ın raf ömrü sınırlı kalsın — Codex: saf one-shot yetmez, provider
 * çağrısı redeem'e hiç gelmezse kayıt sonsuza kadar kalırdı; issue-anında sweep +
 * TTL bunu kapatır).
 */
public final class InMemoryAudioAccessGrants implements AudioAccessGrants {

    private record Entry(TenantId tenantId, String objectKey, Instant expiresAt) {}

    private final Clock clock;
    private final Duration ttl;
    private final SecureRandom random = new SecureRandom();
    private final Map<String, Entry> grants = new ConcurrentHashMap<>();

    public InMemoryAudioAccessGrants(Clock clock, Duration ttl) {
        if (clock == null) {
            throw new IllegalArgumentException("clock zorunlu");
        }
        if (ttl == null || ttl.isZero() || ttl.isNegative()) {
            throw new IllegalArgumentException("ttl pozitif olmalı");
        }
        this.clock = clock;
        this.ttl = ttl;
    }

    @Override
    public Outcome<String> issue(TenantId tenantId, String objectKey) {
        if (tenantId == null || objectKey == null || objectKey.isBlank()) {
            return Outcome.fail(OutcomeCode.INVALID, "tenantId + objectKey zorunlu");
        }
        sweepExpired();
        byte[] raw = new byte[32];
        random.nextBytes(raw);
        String handle = HexFormat.of().formatHex(raw);
        grants.put(handle, new Entry(tenantId, objectKey, clock.instant().plus(ttl)));
        return Outcome.ok(handle);
    }

    @Override
    public Outcome<Grant> redeem(String handle) {
        if (handle == null || handle.isBlank()) {
            return Outcome.fail(OutcomeCode.INVALID, "handle zorunlu");
        }
        // Atomik one-shot: remove ile tüketilir — expired/valid fark etmeksizin
        // redeem denemesi kaydı siler (ikinci deneme kesin fail).
        Entry entry = grants.remove(handle);
        if (entry == null) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "handle geçersiz/kullanılmış (one-shot fail-closed)");
        }
        if (clock.instant().isAfter(entry.expiresAt())) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "handle süresi doldu (fail-closed)");
        }
        return Outcome.ok(new Grant(entry.tenantId(), entry.objectKey()));
    }

    int size() {
        return grants.size();
    }

    private void sweepExpired() {
        Instant now = clock.instant();
        grants.entrySet().removeIf(e -> now.isAfter(e.getValue().expiresAt()));
    }
}
