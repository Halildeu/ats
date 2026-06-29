package com.ats.contracts;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;
import org.junit.jupiter.api.Test;

/**
 * ATS-0001 parity (Java mirror tarafı) — PARITY.md kanonik **metot-adı yüzeyini**
 * kilitler (TS parity.contract.test.ts AYNI seti doğrular). Kapsam: yalnız metot-adı;
 * tip/shape parity PARITY.md tablosu + kod hizası ile (codegen deferred). Tek-taraflı
 * metot-adı drift'i → test kırmızı (Codex WS-3 SoT-guard).
 */
class ParityTest {

    private static final Map<Class<?>, List<String>> CANONICAL = Map.of(
            IdentityTenant.class, List.of("assertTenantScope", "resolveTenant"),
            EvidenceLedger.class, List.of("append", "appendTombstoneEvent", "getById", "list"),
            AIProvider.class, List.of("cite", "transcribe"),
            ATSConnector.class, List.of("exportPacket", "writeBack"));

    @Test
    void contract_surfaces_match_canonical_parity() {
        for (var entry : CANONICAL.entrySet()) {
            var actual = new TreeSet<>(Arrays.stream(entry.getKey().getMethods())
                    .map(Method::getName).toList());
            var expected = new TreeSet<>(entry.getValue());
            assertEquals(expected, actual,
                    entry.getKey().getSimpleName() + " yüzeyi PARITY.md kanonik setiyle uyuşmuyor");
        }
    }
}
