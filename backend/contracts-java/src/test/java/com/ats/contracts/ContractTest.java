package com.ats.contracts;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.contracts.AIProvider.CitationResult;
import com.ats.contracts.AIProvider.TranscriptResult;
import com.ats.contracts.ATSConnector.EvidencePacketRef;
import com.ats.contracts.ATSConnector.ExportResult;
import com.ats.contracts.ATSConnector.ExportTarget;
import com.ats.contracts.ATSConnector.WriteBackTarget;
import com.ats.contracts.IdentityTenant.TenantContext;
import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.EvidenceId;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.PacketId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.JsonValue;
import com.ats.kernel.Outcome;
import com.ats.kernel.Outcome.Fail;
import com.ats.kernel.OutcomeCode;
import java.lang.reflect.Method;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * ATS-0001 Java contract testleri — TS #4 pattern'iyle simetrik: conformance +
 * fail-closed + forbidden-surface (Codex WS-3 gate-check (c)).
 */
class ContractTest {

    // ---- reference stub: IdentityTenant (fail-closed + default-deny) ----
    static final class StubIdentityTenant implements IdentityTenant {
        public Outcome<TenantContext> resolveTenant(String token) {
            if (token == null || token.isBlank()) {
                return Outcome.fail(OutcomeCode.UNAUTHENTICATED, "token yok");
            }
            String[] p = token.split(":");
            if (p.length != 3 || !p[0].equals("valid") || p[1].isBlank() || p[2].isBlank()) {
                return Outcome.fail(OutcomeCode.DENIED, "token tanınmadı; default tenant üretilmez");
            }
            return Outcome.ok(new TenantContext(new TenantId(p[1]), new ActorId(p[2])));
        }

        public Outcome<Void> assertTenantScope(TenantContext ctx, TenantId resourceTenantId) {
            if (!ctx.tenantId().equals(resourceTenantId)) {
                return Outcome.fail(OutcomeCode.TENANT_SCOPE_VIOLATION, "kaynak başka tenant (default-deny)");
            }
            return Outcome.ok(null);
        }
    }

    // ---- reference stub: EvidenceLedger (WORM append-only, immutable) ----
    static final class InMemoryEvidenceLedger implements EvidenceLedger {
        private final List<LedgerEntry> entries = new ArrayList<>();

        private static String sha256(String s) {
            try {
                return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes()));
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        }

        public Outcome<LedgerEntry> append(EvidenceEvent event) {
            if (event.tenantId() == null || event.idempotencyKey() == null || event.contentHash() == null) {
                return Outcome.fail(OutcomeCode.INVALID, "tenantId/idempotencyKey/contentHash zorunlu");
            }
            for (LedgerEntry e : entries) {
                if (e.event().tenantId().equals(event.tenantId())
                        && e.event().idempotencyKey().equals(event.idempotencyKey())) {
                    return Outcome.ok(e); // idempotent replay
                }
            }
            String prev = entries.isEmpty() ? null : entries.get(entries.size() - 1).entryHash();
            long seq = entries.size();
            // immutable payload (WORM): JSON-uyumlu kopya
            EvidenceEvent frozen = new EvidenceEvent(event.tenantId(), event.actorId(), event.interviewId(),
                    event.eventType(), event.occurredAt(), event.idempotencyKey(), event.contentHash(),
                    event.payload() == null ? JsonValue.object(Map.of()) : event.payload());
            String hash = sha256(prev + "|" + seq + "|" + frozen);
            LedgerEntry entry = new LedgerEntry(new EvidenceId("ev-" + seq), seq, prev, hash, frozen);
            entries.add(entry);
            return Outcome.ok(entry);
        }

        public Outcome<LedgerEntry> appendTombstoneEvent(TenantId t, ActorId a, InterviewId i,
                EvidenceId target, String reason) {
            return append(new EvidenceEvent(t, a, i, "EVIDENCE_TOMBSTONE",
                    "1970-01-01T00:00:00.000Z", "tombstone:" + target.value(),
                    sha256(target.value() + ":" + reason),
                    JsonValue.object(Map.of("target", JsonValue.of(target.value()),
                            "reason", JsonValue.of(reason)))));
        }

        public Outcome<LedgerEntry> getById(TenantId tenantId, EvidenceId id) {
            for (LedgerEntry e : entries) {
                if (e.evidenceId().equals(id)) {
                    return e.event().tenantId().equals(tenantId)
                            ? Outcome.ok(e)
                            : Outcome.fail(OutcomeCode.NOT_FOUND, "tenant kapsamı dışı");
                }
            }
            return Outcome.fail(OutcomeCode.NOT_FOUND, "girdi yok");
        }

        public Outcome<List<LedgerEntry>> list(TenantId tenantId, String eventTypeOrNull) {
            List<LedgerEntry> out = new ArrayList<>();
            for (LedgerEntry e : entries) {
                if (e.event().tenantId().equals(tenantId)
                        && (eventTypeOrNull == null || e.event().eventType().equals(eventTypeOrNull))) {
                    out.add(e);
                }
            }
            return Outcome.ok(List.copyOf(out));
        }
    }

    // ---- reference stub: AIProvider / ATSConnector (gate fail-closed) ----
    static final class GateStubAIProvider implements AIProvider {
        public Outcome<TranscriptResult> transcribe(String a) {
            return Outcome.fail(OutcomeCode.UNSUPPORTED_IN_GATE, "STT P1 — G0'a kilitli");
        }
        public Outcome<CitationResult> cite(String c, String t) {
            return Outcome.fail(OutcomeCode.UNSUPPORTED_IN_GATE, "citation P1 — G0'a kilitli");
        }
    }

    static final class GateStubATSConnector implements ATSConnector {
        public Outcome<ExportResult> exportPacket(TenantContext c, EvidencePacketRef p, ExportTarget t) {
            return Outcome.fail(OutcomeCode.UNSUPPORTED_IN_GATE, "export P1 — G0'a kilitli");
        }
        public Outcome<Void> writeBack(TenantContext c, EvidencePacketRef p, WriteBackTarget t) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "narrow write-back 3-koşul yok");
        }
    }

    private static OutcomeCode code(Outcome<?> o) {
        return ((Fail<?>) o).code();
    }

    // ---- IdentityTenant ----
    @Test
    void identity_valid_resolves_invalid_denied_crossTenant_blocked() {
        var id = new StubIdentityTenant();
        assertTrue(id.resolveTenant("valid:t1:a1").isOk());
        assertEquals(OutcomeCode.UNAUTHENTICATED, code(id.resolveTenant("")));
        assertEquals(OutcomeCode.DENIED, code(id.resolveTenant("garbage")));
        var ctx = new TenantContext(new TenantId("t1"), new ActorId("a1"));
        assertTrue(id.assertTenantScope(ctx, new TenantId("t1")).isOk());
        assertEquals(OutcomeCode.TENANT_SCOPE_VIOLATION, code(id.assertTenantScope(ctx, new TenantId("t2"))));
    }

    // ---- EvidenceLedger WORM ----
    @Test
    void ledger_appendOnly_chained_idempotent_tenantScoped() {
        var l = new InMemoryEvidenceLedger();
        var e1 = l.append(evt("k1", "A"));
        var e2 = l.append(evt("k2", "B"));
        assertTrue(e1.isOk() && e2.isOk());
        var a = ((Outcome.Ok<EvidenceLedger.LedgerEntry>) e1).value();
        var b = ((Outcome.Ok<EvidenceLedger.LedgerEntry>) e2).value();
        assertEquals(a.entryHash(), b.previousHash());           // hash-chain
        assertEquals(a.sequence() + 1, b.sequence());
        // idempotent replay
        var a2 = ((Outcome.Ok<EvidenceLedger.LedgerEntry>) l.append(evt("k1", "A"))).value();
        assertEquals(a.evidenceId(), a2.evidenceId());
        // cross-tenant getById sızdırmaz
        assertEquals(OutcomeCode.NOT_FOUND, code(l.getById(new TenantId("other"), a.evidenceId())));
    }

    @Test
    void ledger_payload_is_immutable_WORM() {
        var l = new InMemoryEvidenceLedger();
        var ok = (Outcome.Ok<EvidenceLedger.LedgerEntry>) l.append(evt("k1", "A"));
        var payload = ok.value().event().payload();
        // derin-immutable: hem top-level map hem nested array mutasyonu fırlatır
        boolean topThrew = false, nestedThrew = false;
        try {
            payload.values().put("x", JsonValue.of("y"));
        } catch (UnsupportedOperationException ex) {
            topThrew = true;
        }
        var nested = (JsonValue.JsonArray) payload.values().get("nested");
        try {
            nested.items().add(JsonValue.of(2.0));
        } catch (UnsupportedOperationException ex) {
            nestedThrew = true;
        }
        assertTrue(topThrew && nestedThrew, "WORM payload derin-immutable olmalı");
    }

    private static EvidenceLedger.EvidenceEvent evt(String key, String type) {
        return new EvidenceLedger.EvidenceEvent(new TenantId("t1"), new ActorId("a1"),
                new InterviewId("iv1"), type, "2026-06-29T00:00:00.000Z", key, "h-" + key,
                JsonValue.object(Map.of(
                        "note", JsonValue.of("n"),
                        "nested", new JsonValue.JsonArray(List.of(JsonValue.of(1.0))))));
    }

    // ---- AIProvider / ATSConnector fail-closed ----
    @Test
    void ai_and_ats_fail_closed_in_gate() {
        assertEquals(OutcomeCode.UNSUPPORTED_IN_GATE, code(new GateStubAIProvider().transcribe("x")));
        assertEquals(OutcomeCode.UNSUPPORTED_IN_GATE, code(new GateStubAIProvider().cite("c", "t")));
        var conn = new GateStubATSConnector();
        var pkt = new EvidencePacketRef(new PacketId("p1"), new TenantId("t1"), new InterviewId("iv1"));
        var ctx = new TenantContext(new TenantId("t1"), new ActorId("a1"));
        assertEquals(OutcomeCode.UNSUPPORTED_IN_GATE, code(conn.exportPacket(ctx, pkt, ExportTarget.PDF)));
        assertEquals(OutcomeCode.NOT_CONFIGURED, code(conn.writeBack(ctx, pkt, new WriteBackTarget("d", "x"))));
    }

    // ---- forbidden-surface: ADR-0005 (scoring/affect/auto-reject) + candidate-write ----
    @Test
    void no_forbidden_methods_on_contracts() {
        String[] forbidden = {"score", "rank", "fit", "recommend", "compare", "sentiment",
                "emotion", "affect", "reject", "autodecision", "autoreject",
                "createcandidate", "updatecandidate", "advancecandidate", "writescore", "movestage"};
        for (Class<?> c : List.of(AIProvider.class, ATSConnector.class, EvidenceLedger.class, IdentityTenant.class)) {
            for (Method m : c.getMethods()) {
                String n = m.getName().toLowerCase();
                for (String f : forbidden) {
                    assertFalse(n.contains(f), c.getSimpleName() + " yasak yüzey içeriyor: " + m.getName());
                }
            }
        }
        // EvidenceLedger WORM: update/delete/overwrite/purge yüzeyi yok
        for (Method m : EvidenceLedger.class.getMethods()) {
            String n = m.getName().toLowerCase();
            for (String f : List.of("update", "delete", "overwrite", "purge", "replace", "remove")) {
                assertFalse(n.contains(f), "EvidenceLedger mutasyon yüzeyi: " + m.getName());
            }
        }
        assertInstanceOf(Outcome.class, Outcome.ok("x")); // sanity
    }
}
