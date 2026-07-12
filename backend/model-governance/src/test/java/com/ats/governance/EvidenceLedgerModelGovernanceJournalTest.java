package com.ats.governance;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.contracts.AIProvider;
import com.ats.contracts.EvidenceLedger;
import com.ats.contracts.governance.ApprovalStatus;
import com.ats.contracts.governance.ApprovedModelSpec;
import com.ats.contracts.governance.Capability;
import com.ats.contracts.governance.ModelGovernanceGate.Decision;
import com.ats.contracts.governance.ModelGovernanceGate.Permit;
import com.ats.contracts.governance.ModelGovernanceGate.Reason;
import com.ats.contracts.governance.ModelGovernanceJournal;
import com.ats.contracts.governance.ModelGovernanceJournal.Attested;
import com.ats.contracts.governance.ModelGovernanceJournal.InvocationContext;
import com.ats.contracts.governance.ModelGovernanceJournal.JournalReceipt;
import com.ats.contracts.governance.ModelGovernanceJournal.PreflightRejected;
import com.ats.contracts.governance.ModelGovernanceJournal.ProviderRejected;
import com.ats.contracts.governance.ModelGovernanceJournal.VerificationRejected;
import com.ats.contracts.governance.ModelInvocationId;
import com.ats.contracts.governance.ModelScope;
import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.EvidenceId;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.JsonValue;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * gov1-1d {@link EvidenceLedgerModelGovernanceJournal} adapter sözleşmesi: her Terminal varyantı
 * doğru eventType/stage/payload; permit↔boot-snapshot re-verify (mismatch → PERMIT_MISMATCH, WORM'a
 * yazılmaz); preflight-red intended-alanları snapshot'tan; payload-güvenlik (secret/claim/transcript/URL
 * yok); observed null-durumları; idempotency-key slot; append-fail → AUDIT_UNAVAILABLE.
 */
class EvidenceLedgerModelGovernanceJournalTest {

    private static final Capability CAP = Capability.TRANSCRIBE;
    private static final TenantId T = new TenantId("t1");
    private static final ActorId A = new ActorId("actor-1");
    private static final InterviewId I = new InterviewId("iv1");
    private static final Instant NOW = Instant.parse("2026-07-13T10:15:30Z");
    private static final Clock CLOCK = Clock.fixed(NOW, ZoneOffset.UTC);

    private static final Set<String> EXPECTED_KEYS = Set.of(
            "invocation_id", "capability", "approval_ref",
            "intended_provider_ref", "intended_model_id", "intended_model_version",
            "endpoint_ref", "invocation_profile_version",
            "observed_model_id", "observed_model_version",
            "decision", "reason_code", "stage", "binding_state");

    private static ApprovedModelSpec spec() {
        return ApprovedModelSpec.of(CAP, "prov-x", "model-x", "v1",
                Set.of("model-x-alias"), Set.of("v1-alias"), "endpoint-x", "ip-1",
                ApprovalStatus.APPROVED, ModelScope.GLOBAL);
    }

    private static Permit permitFrom(ApprovedModelSpec s) {
        return new Permit(s.capability(), s.approvalRef(), s.configuredProviderRef(),
                s.requestedModelId(), s.requestedModelVersion(), s.endpointRef(), s.invocationProfileVersion());
    }

    private static EvidenceLedgerModelGovernanceJournal journal(EvidenceLedger ledger) {
        return new EvidenceLedgerModelGovernanceJournal(ledger, Map.of(CAP, spec()), CLOCK);
    }

    private static final InvocationContext CTX = new InvocationContext(T, I, A);
    private static final ModelInvocationId ID =
            new ModelInvocationId("mgi_00000000-0000-4000-8000-000000000000");

    // ---- capturing / failing fake ledger ----

    static final class CapturingLedger implements EvidenceLedger {
        final List<EvidenceEvent> appended = new ArrayList<>();
        boolean failAppend = false;
        private long seq = 0;

        @Override
        public Outcome<LedgerEntry> append(EvidenceEvent e) {
            if (failAppend) {
                return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "ledger down (test)");
            }
            appended.add(e);
            seq++;
            return Outcome.ok(new LedgerEntry(e.tenantId(), e.actorId(), e.interviewId(), e.eventType(),
                    e.occurredAt(), e.idempotencyKey(), e.contentHash(), e.payload(),
                    new EvidenceId("ev-" + seq), seq, "prev", "hash-" + seq));
        }

        @Override
        public Outcome<LedgerEntry> appendTombstoneEvent(TenantId t, ActorId a, InterviewId i, EvidenceId x, String r) {
            return Outcome.fail(OutcomeCode.UNSUPPORTED_IN_GATE, "test dışı");
        }

        @Override
        public Outcome<LedgerEntry> getById(TenantId t, EvidenceId id) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "yok");
        }

        @Override
        public Outcome<List<LedgerEntry>> list(TenantId t, LedgerListFilter f) {
            return Outcome.ok(List.of());
        }
    }

    private static JsonValue.JsonObject onlyPayload(CapturingLedger ledger) {
        assertEquals(1, ledger.appended.size(), "tam bir WORM satırı yazılmalı");
        return ledger.appended.get(0).payload();
    }

    private static String str(JsonValue.JsonObject p, String key) {
        return p.values().get(key) instanceof JsonValue.JsonString s ? s.value() : null;
    }

    private static boolean isJsonNull(JsonValue.JsonObject p, String key) {
        return p.values().get(key) instanceof JsonValue.JsonNull;
    }

    // ---- tests ----

    @Test
    void authorized_writes_authorized_event_with_intended_and_null_observed() {
        CapturingLedger ledger = new CapturingLedger();
        Outcome<JournalReceipt> out = journal(ledger).recordAuthorized(CTX, ID, permitFrom(spec()));
        assertInstanceOf(Outcome.Ok.class, out);
        EvidenceLedger.EvidenceEvent ev = ledger.appended.get(0);
        assertEquals(EvidenceLedgerModelGovernanceJournal.AUTHORIZED_EVENT_TYPE, ev.eventType());
        assertEquals(T.value() + ":" + I.value() + ":model-gov:" + ID.value() + ":authorized", ev.idempotencyKey());
        assertEquals(NOW.toString(), ev.occurredAt());
        assertFalse(ev.contentHash().isBlank());
        JsonValue.JsonObject p = ev.payload();
        assertEquals(EXPECTED_KEYS, p.values().keySet(), "kanonik 14-alan şeması");
        assertEquals(ID.value(), str(p, "invocation_id"));
        assertEquals("TRANSCRIBE", str(p, "capability"));
        assertEquals(spec().approvalRef().value(), str(p, "approval_ref"));
        assertEquals("prov-x", str(p, "intended_provider_ref"));
        assertEquals("model-x", str(p, "intended_model_id"));
        assertEquals("v1", str(p, "intended_model_version"));
        assertEquals("endpoint-x", str(p, "endpoint_ref"));
        assertEquals("ip-1", str(p, "invocation_profile_version"));
        assertEquals("authorized", str(p, "stage"));
        assertEquals("RESOLVED", str(p, "binding_state"));
        assertTrue(isJsonNull(p, "observed_model_id"));
        assertTrue(isJsonNull(p, "observed_model_version"));
        assertTrue(isJsonNull(p, "decision"));
        assertTrue(isJsonNull(p, "reason_code"));
    }

    @Test
    void attested_writes_attested_event_with_allow_and_verified_observed() {
        CapturingLedger ledger = new CapturingLedger();
        Permit permit = permitFrom(spec());
        AIProvider.ReportedModelIdentity reported = AIProvider.ReportedModelIdentity.fromProvider("model-x", "v1");
        Decision allow = Decision.allow(permit.approvalRef(), CAP, "model-x", "v1");
        Outcome<JournalReceipt> out = journal(ledger).recordTerminal(CTX, ID, new Attested(permit, reported, allow));
        assertInstanceOf(Outcome.Ok.class, out);
        EvidenceLedger.EvidenceEvent ev = ledger.appended.get(0);
        assertEquals(EvidenceLedgerModelGovernanceJournal.ATTESTED_EVENT_TYPE, ev.eventType());
        assertEquals(T.value() + ":" + I.value() + ":model-gov:" + ID.value() + ":terminal", ev.idempotencyKey());
        JsonValue.JsonObject p = ev.payload();
        assertEquals("attested", str(p, "stage"));
        assertEquals("ALLOW", str(p, "decision"));
        assertTrue(isJsonNull(p, "reason_code"));
        assertEquals("model-x", str(p, "observed_model_id"));
        assertEquals("v1", str(p, "observed_model_version"));
        assertEquals("RESOLVED", str(p, "binding_state"));
    }

    @Test
    void verification_rejected_writes_rejected_event_with_deny_reason_and_reported_observed() {
        CapturingLedger ledger = new CapturingLedger();
        Permit permit = permitFrom(spec());
        AIProvider.ReportedModelIdentity reported = AIProvider.ReportedModelIdentity.fromProvider("rogue-model", "v9");
        Decision deny = Decision.deny(permit.approvalRef(), CAP, Reason.MODEL_VERSION_MISMATCH);
        Outcome<JournalReceipt> out =
                journal(ledger).recordTerminal(CTX, ID, new VerificationRejected(permit, reported, deny));
        assertInstanceOf(Outcome.Ok.class, out);
        EvidenceLedger.EvidenceEvent ev = ledger.appended.get(0);
        assertEquals(EvidenceLedgerModelGovernanceJournal.REJECTED_EVENT_TYPE, ev.eventType());
        JsonValue.JsonObject p = ev.payload();
        assertEquals("verification_rejected", str(p, "stage"));
        assertEquals("DENY", str(p, "decision"));
        assertEquals("MODEL_VERSION_MISMATCH", str(p, "reason_code"));
        // observed = provider-BEYANI (DENY kararı gizlese de forensik için ham-sanitized reported yazılır)
        assertEquals("rogue-model", str(p, "observed_model_id"));
        assertEquals("v9", str(p, "observed_model_version"));
    }

    @Test
    void provider_rejected_writes_rejected_event_provider_failed_null_observed() {
        CapturingLedger ledger = new CapturingLedger();
        Outcome<JournalReceipt> out =
                journal(ledger).recordTerminal(CTX, ID, new ProviderRejected(permitFrom(spec())));
        assertInstanceOf(Outcome.Ok.class, out);
        JsonValue.JsonObject p = onlyPayload(ledger);
        assertEquals("provider_rejected", str(p, "stage"));
        assertEquals("PROVIDER_FAILED", str(p, "reason_code"));
        assertTrue(isJsonNull(p, "decision"), "provider-arızası governance verdict'i değil → decision null");
        assertTrue(isJsonNull(p, "observed_model_id"));
        assertTrue(isJsonNull(p, "observed_model_version"));
        assertEquals("RESOLVED", str(p, "binding_state"));
    }

    @Test
    void preflight_rejected_with_binding_fills_intended_from_snapshot() {
        CapturingLedger ledger = new CapturingLedger();
        Outcome<JournalReceipt> out = journal(ledger)
                .recordTerminal(CTX, ID, new PreflightRejected(CAP, Reason.APPROVAL_NOT_ACTIVE));
        assertInstanceOf(Outcome.Ok.class, out);
        JsonValue.JsonObject p = onlyPayload(ledger);
        assertEquals("preflight_rejected", str(p, "stage"));
        assertEquals("APPROVAL_NOT_ACTIVE", str(p, "reason_code"));
        assertEquals("RESOLVED", str(p, "binding_state"));
        assertEquals(spec().approvalRef().value(), str(p, "approval_ref"));
        assertEquals("model-x", str(p, "intended_model_id"));
        assertTrue(isJsonNull(p, "observed_model_id"), "preflight-red → observed null");
        assertTrue(isJsonNull(p, "decision"));
    }

    @Test
    void preflight_rejected_without_binding_is_unavailable_and_null_intended() {
        CapturingLedger ledger = new CapturingLedger();
        // Boot-snapshot yalnız TRANSCRIBE içerir; CITE preflight-red → binding UNAVAILABLE (UYDURMA yok).
        Outcome<JournalReceipt> out = journal(ledger)
                .recordTerminal(CTX, ID, new PreflightRejected(Capability.CITE, Reason.APPROVAL_NOT_FOUND));
        assertInstanceOf(Outcome.Ok.class, out);
        JsonValue.JsonObject p = onlyPayload(ledger);
        assertEquals("preflight_rejected", str(p, "stage"));
        assertEquals("CITE", str(p, "capability"));
        assertEquals("APPROVAL_NOT_FOUND", str(p, "reason_code"));
        assertEquals("UNAVAILABLE", str(p, "binding_state"));
        assertTrue(isJsonNull(p, "approval_ref"), "binding yoksa approval_ref UYDURULMAZ");
        assertTrue(isJsonNull(p, "intended_provider_ref"));
        assertTrue(isJsonNull(p, "intended_model_id"));
        assertTrue(isJsonNull(p, "endpoint_ref"));
    }

    @Test
    void permit_snapshot_mismatch_on_authorized_fails_closed_without_worm() {
        CapturingLedger ledger = new CapturingLedger();
        ApprovedModelSpec s = spec();
        // Doğru ref ama TAMPERLANMIŞ modelId → forged/unbound permit (audit-bütünlüğü ihlali).
        Permit forged = new Permit(CAP, s.approvalRef(), "prov-x", "TAMPERED", "v1", "endpoint-x", "ip-1");
        Outcome<JournalReceipt> out = journal(ledger).recordAuthorized(CTX, ID, forged);
        assertInstanceOf(Outcome.Fail.class, out);
        assertEquals(Reason.PERMIT_MISMATCH.name(), ((Outcome.Fail<JournalReceipt>) out).reason());
        assertTrue(ledger.appended.isEmpty(), "uyuşmayan permit WORM'a YAZILMAMALI (fail-closed)");
    }

    @Test
    void permit_snapshot_mismatch_on_terminal_fails_closed_without_worm() {
        CapturingLedger ledger = new CapturingLedger();
        ApprovedModelSpec s = spec();
        Permit forged = new Permit(CAP, s.approvalRef(), "prov-x", "model-x", "TAMPERED-VER", "endpoint-x", "ip-1");
        Outcome<JournalReceipt> out = journal(ledger).recordTerminal(CTX, ID, new ProviderRejected(forged));
        assertInstanceOf(Outcome.Fail.class, out);
        assertEquals(Reason.PERMIT_MISMATCH.name(), ((Outcome.Fail<JournalReceipt>) out).reason());
        assertTrue(ledger.appended.isEmpty(), "uyuşmayan permit terminal WORM'a YAZILMAMALI (fail-closed)");
    }

    @Test
    void payload_never_carries_secret_claim_transcript_or_url() {
        CapturingLedger ledger = new CapturingLedger();
        // Provider URL/secret enjekte etmeye çalışsa da ReportedModelIdentity sanitize → null'a düşer.
        AIProvider.ReportedModelIdentity malicious =
                AIProvider.ReportedModelIdentity.fromProvider("http://evil.example/leak?token=sk-XYZ", "v1");
        Permit permit = permitFrom(spec());
        Decision deny = Decision.deny(permit.approvalRef(), CAP, Reason.MODEL_ID_MISMATCH);
        journal(ledger).recordTerminal(CTX, ID, new VerificationRejected(permit, malicious, deny));
        JsonValue.JsonObject p = onlyPayload(ledger);
        // observed_model_id URL/secret taşıyan ham değerden sanitize edilip null'a indirilmeli.
        assertNull(str(p, "observed_model_id"), "URL/secret'lı reported değer sanitize → null");
        assertTrue(isJsonNull(p, "observed_model_id"));
        String flat = p.values().toString();
        assertFalse(flat.contains("://"), "URL WORM payload'a giremez");
        assertFalse(flat.contains("sk-XYZ"), "secret WORM payload'a giremez");
        for (String forbidden : new String[] {"claim", "transcript", "audio", "bearer", "token", "secret"}) {
            assertTrue(p.values().keySet().stream()
                            .noneMatch(k -> k.toLowerCase(java.util.Locale.ROOT).contains(forbidden)),
                    "WORM payload yasak alan taşıyamaz: " + forbidden);
        }
    }

    @Test
    void ledger_append_failure_returns_audit_unavailable() {
        CapturingLedger ledger = new CapturingLedger();
        ledger.failAppend = true;
        Outcome<JournalReceipt> out = journal(ledger).recordAuthorized(CTX, ID, permitFrom(spec()));
        assertInstanceOf(Outcome.Fail.class, out);
        assertEquals(Reason.AUDIT_UNAVAILABLE.name(), ((Outcome.Fail<JournalReceipt>) out).reason());
    }

    @Test
    void receipt_carries_ledger_evidence_pointer() {
        CapturingLedger ledger = new CapturingLedger();
        Outcome<JournalReceipt> out = journal(ledger).recordAuthorized(CTX, ID, permitFrom(spec()));
        JournalReceipt receipt = ((Outcome.Ok<JournalReceipt>) out).value();
        assertEquals("ev-1", receipt.evidenceId(), "Plane-1 pointer = WORM evidenceId");
    }

    @Test
    void null_arguments_fail_closed_without_worm() {
        CapturingLedger ledger = new CapturingLedger();
        assertInstanceOf(Outcome.Fail.class, journal(ledger).recordAuthorized(null, ID, permitFrom(spec())));
        assertInstanceOf(Outcome.Fail.class, journal(ledger).recordTerminal(CTX, ID, (ModelGovernanceJournal.Terminal) null));
        assertTrue(ledger.appended.isEmpty());
    }
}
