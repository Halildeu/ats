package com.ats.governance;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.contracts.AIProvider;
import com.ats.contracts.governance.ApprovalStatus;
import com.ats.contracts.governance.ApprovedModelRegistry;
import com.ats.contracts.governance.ApprovedModelSpec;
import com.ats.contracts.governance.Capability;
import com.ats.contracts.governance.ModelApprovalRef;
import com.ats.contracts.governance.ModelGovernanceGate;
import com.ats.contracts.governance.ModelGovernanceGate.Decision;
import com.ats.contracts.governance.ModelGovernanceGate.Permit;
import com.ats.contracts.governance.ModelGovernanceGate.Reason;
import com.ats.contracts.governance.ModelScope;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * gov1-1c {@link RegistryBackedModelGovernanceGate} adapter'ının fail-closed sözleşmesi:
 * preflight/verify tüm {@link Reason}'lar + TOCTOU + matchesReported HARD-REQUIRED.
 */
class RegistryBackedModelGovernanceGateTest {

    private static final String PROV = "prov-a";
    private static final String EP = "endpoint-a";
    private static final String IP = "ip-1";

    private static ApprovedModelSpec transcribe(
            String modelId, String version, ApprovalStatus status, Set<String> idAliases, Set<String> verAliases) {
        return ApprovedModelSpec.of(Capability.TRANSCRIBE, PROV, modelId, version,
                idAliases, verAliases, EP, IP, status, ModelScope.GLOBAL);
    }

    private static ApprovedModelSpec approvedTranscribe() {
        return transcribe("whisper-tr", "v0.1.0", ApprovalStatus.APPROVED, Set.of(), Set.of());
    }

    private static ModelGovernanceGate gate(ApprovedModelRegistry registry, Capability cap, ModelApprovalRef ref) {
        return new RegistryBackedModelGovernanceGate(registry, Map.of(cap, ref));
    }

    private static Permit permitFrom(ApprovedModelSpec spec) {
        return new Permit(spec.capability(), spec.approvalRef(), spec.configuredProviderRef(),
                spec.requestedModelId(), spec.requestedModelVersion(), spec.endpointRef(),
                spec.invocationProfileVersion());
    }

    private static AIProvider.ReportedModelIdentity reported(String id, String version) {
        return AIProvider.ReportedModelIdentity.fromProvider(id, version);
    }

    // Belirli bir Outcome'u zorlayan sahte registry (REGISTRY_UNAVAILABLE / Ok-wrong-capability senaryoları).
    private record FixedResolveRegistry(Outcome<ApprovedModelSpec> fixed) implements ApprovedModelRegistry {
        @Override
        public Outcome<ApprovedModelSpec> resolve(ModelApprovalRef ref, Capability capability) {
            return fixed;
        }

        @Override
        public Outcome<ApprovedModelSpec> resolveConfigured(
                Capability c, String p, String m, String v) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "test-only: kullanılmaz");
        }
    }

    // Çalışma-anında delegate'i değişebilen registry (TOCTOU: preflight APPROVED → verify REVOKED).
    private static final class SwappableRegistry implements ApprovedModelRegistry {
        private ApprovedModelRegistry delegate;

        SwappableRegistry(ApprovedModelRegistry initial) {
            this.delegate = initial;
        }

        void swap(ApprovedModelRegistry next) {
            this.delegate = next;
        }

        @Override
        public Outcome<ApprovedModelSpec> resolve(ModelApprovalRef ref, Capability capability) {
            return delegate.resolve(ref, capability);
        }

        @Override
        public Outcome<ApprovedModelSpec> resolveConfigured(Capability c, String p, String m, String v) {
            return delegate.resolveConfigured(c, p, m, v);
        }
    }

    @SuppressWarnings("unchecked")
    private static <T> T okValue(Outcome<T> out) {
        assertInstanceOf(Outcome.Ok.class, out);
        return ((Outcome.Ok<T>) out).value();
    }

    @SuppressWarnings("unchecked")
    private static void assertPreflightDeny(Outcome<Permit> out, Reason expected) {
        assertInstanceOf(Outcome.Fail.class, out);
        Outcome.Fail<Permit> fail = (Outcome.Fail<Permit>) out;
        assertEquals(expected, Reason.valueOf(fail.reason()), "preflight Reason token");
        assertEquals(expected.outcomeCode(), fail.code(), "preflight OutcomeCode eşlemesi");
    }

    private static Decision assertVerifyDeny(Outcome<Decision> out, Reason expected) {
        Decision decision = okValue(out);
        assertEquals(Decision.Verdict.DENY, decision.verdict());
        assertEquals(expected, decision.reasonCode());
        assertNull(decision.observedModelId(), "DENY ham reported-identity taşımamalı");
        assertNull(decision.observedModelVersion(), "DENY ham reported-identity taşımamalı");
        return decision;
    }

    // ---------------- preflight ----------------

    @Test
    void preflight_approved_yields_permit_from_spec_fields() {
        ApprovedModelSpec spec = approvedTranscribe();
        ModelGovernanceGate gate = gate(
                InMemoryApprovedModelRegistry.of(List.of(spec)), Capability.TRANSCRIBE, spec.approvalRef());

        Permit permit = okValue(gate.preflight(Capability.TRANSCRIBE));
        assertEquals(Capability.TRANSCRIBE, permit.capability());
        assertEquals(spec.approvalRef(), permit.approvalRef());
        assertEquals(PROV, permit.providerRef());
        assertEquals("whisper-tr", permit.modelId());
        assertEquals("v0.1.0", permit.modelVersion());
        assertEquals(EP, permit.endpointRef());
        assertEquals(IP, permit.invocationProfileVersion());
    }

    @Test
    void preflight_no_binding_for_capability_denies_approval_not_found() {
        // binding yalnız TRANSCRIBE için; CITE istenirse ref yok → APPROVAL_NOT_FOUND
        ApprovedModelSpec spec = approvedTranscribe();
        ModelGovernanceGate gate = gate(
                InMemoryApprovedModelRegistry.of(List.of(spec)), Capability.TRANSCRIBE, spec.approvalRef());
        assertPreflightDeny(gate.preflight(Capability.CITE), Reason.APPROVAL_NOT_FOUND);
    }

    @Test
    void preflight_unknown_ref_denies_approval_not_found() {
        ModelApprovalRef unknown = new ModelApprovalRef("mapr_" + "0".repeat(64));
        ModelGovernanceGate gate = gate(
                InMemoryApprovedModelRegistry.empty(), Capability.TRANSCRIBE, unknown);
        assertPreflightDeny(gate.preflight(Capability.TRANSCRIBE), Reason.APPROVAL_NOT_FOUND);
    }

    @Test
    void preflight_revoked_and_draft_deny_approval_not_active() {
        for (ApprovalStatus status : new ApprovalStatus[] {ApprovalStatus.REVOKED, ApprovalStatus.DRAFT}) {
            ApprovedModelSpec spec = transcribe("whisper-tr", "v0.1.0", status, Set.of(), Set.of());
            ModelGovernanceGate gate = gate(
                    InMemoryApprovedModelRegistry.of(List.of(spec)), Capability.TRANSCRIBE, spec.approvalRef());
            assertPreflightDeny(gate.preflight(Capability.TRANSCRIBE), Reason.APPROVAL_NOT_ACTIVE);
        }
    }

    @Test
    void preflight_registry_unavailable_denies() {
        ApprovedModelSpec spec = approvedTranscribe();
        ModelGovernanceGate gate = gate(
                InMemoryApprovedModelRegistry.unavailable(), Capability.TRANSCRIBE, spec.approvalRef());
        assertPreflightDeny(gate.preflight(Capability.TRANSCRIBE), Reason.REGISTRY_UNAVAILABLE);
    }

    @Test
    void preflight_registry_returns_wrong_capability_spec_denies_capability_mismatch() {
        // Savunma-derinliği: registry Ok döner ama spec.capability()=CITE, istenen TRANSCRIBE.
        ApprovedModelSpec citeSpec = ApprovedModelSpec.of(Capability.CITE, PROV, "cite-m", "v1",
                Set.of(), Set.of(), EP, IP, ApprovalStatus.APPROVED, ModelScope.GLOBAL);
        ModelGovernanceGate gate = gate(
                new FixedResolveRegistry(Outcome.ok(citeSpec)), Capability.TRANSCRIBE, citeSpec.approvalRef());
        assertPreflightDeny(gate.preflight(Capability.TRANSCRIBE), Reason.CAPABILITY_MISMATCH);
    }

    @Test
    void preflight_null_capability_fails_closed() {
        ModelGovernanceGate gate = gate(
                InMemoryApprovedModelRegistry.empty(), Capability.TRANSCRIBE,
                new ModelApprovalRef("mapr_" + "0".repeat(64)));
        Outcome.Fail<Permit> fail = assertInstanceOf(Outcome.Fail.class, gate.preflight(null));
        assertEquals(OutcomeCode.INVALID, fail.code());
    }

    // ---------------- verify ----------------

    @Test
    void verify_matching_identity_allows_with_observed_summary() {
        ApprovedModelSpec spec = approvedTranscribe();
        ModelGovernanceGate gate = gate(
                InMemoryApprovedModelRegistry.of(List.of(spec)), Capability.TRANSCRIBE, spec.approvalRef());
        Outcome<Decision> out = gate.verify(permitFrom(spec), reported("whisper-tr", "v0.1.0"));
        Decision decision = okValue(out);
        assertTrue(decision.allowed());
        assertEquals(Decision.Verdict.ALLOW, decision.verdict());
        assertNull(decision.reasonCode());
        assertEquals("whisper-tr", decision.observedModelId());
        assertEquals("v0.1.0", decision.observedModelVersion());
        assertEquals(spec.approvalRef(), decision.approvalRef());
    }

    @Test
    void verify_matching_via_aliases_allows() {
        ApprovedModelSpec spec = transcribe("whisper-tr", "v0.1.0", ApprovalStatus.APPROVED,
                Set.of("whisper-large-v3-tr"), Set.of("2024-11"));
        ModelGovernanceGate gate = gate(
                InMemoryApprovedModelRegistry.of(List.of(spec)), Capability.TRANSCRIBE, spec.approvalRef());
        Decision decision = okValue(gate.verify(permitFrom(spec), reported("whisper-large-v3-tr", "2024-11")));
        assertTrue(decision.allowed());
        assertEquals("whisper-large-v3-tr", decision.observedModelId());
        assertEquals("2024-11", decision.observedModelVersion());
    }

    @Test
    void verify_absent_version_denies_reported_identity_missing() {
        // live-stt gerçeği: reportedModelVersion=null → HARD-REQUIRED fail (beklenen fail-closed).
        ApprovedModelSpec spec = approvedTranscribe();
        ModelGovernanceGate gate = gate(
                InMemoryApprovedModelRegistry.of(List.of(spec)), Capability.TRANSCRIBE, spec.approvalRef());
        assertVerifyDeny(gate.verify(permitFrom(spec), reported("whisper-tr", null)),
                Reason.REPORTED_IDENTITY_MISSING);
    }

    @Test
    void verify_absent_id_denies_reported_identity_missing() {
        ApprovedModelSpec spec = approvedTranscribe();
        ModelGovernanceGate gate = gate(
                InMemoryApprovedModelRegistry.of(List.of(spec)), Capability.TRANSCRIBE, spec.approvalRef());
        assertVerifyDeny(gate.verify(permitFrom(spec), AIProvider.ReportedModelIdentity.notReported()),
                Reason.REPORTED_IDENTITY_MISSING);
    }

    @Test
    void verify_null_envelope_denies_reported_identity_malformed() {
        ApprovedModelSpec spec = approvedTranscribe();
        ModelGovernanceGate gate = gate(
                InMemoryApprovedModelRegistry.of(List.of(spec)), Capability.TRANSCRIBE, spec.approvalRef());
        assertVerifyDeny(gate.verify(permitFrom(spec), null), Reason.REPORTED_IDENTITY_MALFORMED);
    }

    @Test
    void verify_wrong_id_denies_model_id_mismatch() {
        ApprovedModelSpec spec = approvedTranscribe();
        ModelGovernanceGate gate = gate(
                InMemoryApprovedModelRegistry.of(List.of(spec)), Capability.TRANSCRIBE, spec.approvalRef());
        assertVerifyDeny(gate.verify(permitFrom(spec), reported("whisper-en", "v0.1.0")),
                Reason.MODEL_ID_MISMATCH);
    }

    @Test
    void verify_correct_id_wrong_version_denies_model_version_mismatch() {
        ApprovedModelSpec spec = approvedTranscribe();
        ModelGovernanceGate gate = gate(
                InMemoryApprovedModelRegistry.of(List.of(spec)), Capability.TRANSCRIBE, spec.approvalRef());
        assertVerifyDeny(gate.verify(permitFrom(spec), reported("whisper-tr", "v9.9.9")),
                Reason.MODEL_VERSION_MISMATCH);
    }

    @Test
    void verify_toctou_revoked_between_preflight_and_verify_denies_approval_not_active() {
        ApprovedModelSpec approved = approvedTranscribe();
        // REVOKED sürüm AYNI approvalRef'i taşır (status ref girdisi değil) → aynı ref farklı status.
        ApprovedModelSpec revoked = transcribe("whisper-tr", "v0.1.0", ApprovalStatus.REVOKED, Set.of(), Set.of());
        assertEquals(approved.approvalRef(), revoked.approvalRef(), "kurulum: status ref'i değiştirmez");

        SwappableRegistry registry = new SwappableRegistry(InMemoryApprovedModelRegistry.of(List.of(approved)));
        ModelGovernanceGate gate = gate(registry, Capability.TRANSCRIBE, approved.approvalRef());

        // preflight APPROVED:
        Permit permit = okValue(gate.preflight(Capability.TRANSCRIBE));
        // çağrı sırasında REVOKE:
        registry.swap(InMemoryApprovedModelRegistry.of(List.of(revoked)));
        // verify eşleşen kimlikle bile TOCTOU nedeniyle DENY (re-resolve APPROVED değil):
        assertVerifyDeny(gate.verify(permit, reported("whisper-tr", "v0.1.0")), Reason.APPROVAL_NOT_ACTIVE);
    }

    @Test
    void verify_registry_unavailable_at_verify_denies() {
        ApprovedModelSpec spec = approvedTranscribe();
        ModelGovernanceGate gate = gate(
                InMemoryApprovedModelRegistry.unavailable(), Capability.TRANSCRIBE, spec.approvalRef());
        assertVerifyDeny(gate.verify(permitFrom(spec), reported("whisper-tr", "v0.1.0")),
                Reason.REGISTRY_UNAVAILABLE);
    }

    @Test
    void verify_registry_returns_wrong_capability_denies_capability_mismatch() {
        ApprovedModelSpec citeSpec = ApprovedModelSpec.of(Capability.CITE, PROV, "cite-m", "v1",
                Set.of(), Set.of(), EP, IP, ApprovalStatus.APPROVED, ModelScope.GLOBAL);
        ApprovedModelSpec transcribeSpec = approvedTranscribe();
        // permit TRANSCRIBE der, registry Ok(CITE-spec) döner → savunma-derinliği CAPABILITY_MISMATCH.
        ModelGovernanceGate gate = gate(
                new FixedResolveRegistry(Outcome.ok(citeSpec)), Capability.TRANSCRIBE, transcribeSpec.approvalRef());
        assertVerifyDeny(gate.verify(permitFrom(transcribeSpec), reported("whisper-tr", "v0.1.0")),
                Reason.CAPABILITY_MISMATCH);
    }

    @Test
    void verify_null_permit_fails_closed() {
        ModelGovernanceGate gate = gate(
                InMemoryApprovedModelRegistry.empty(), Capability.TRANSCRIBE,
                new ModelApprovalRef("mapr_" + "0".repeat(64)));
        Outcome.Fail<Decision> fail = assertInstanceOf(Outcome.Fail.class,
                gate.verify(null, reported("whisper-tr", "v0.1.0")));
        assertEquals(OutcomeCode.INVALID, fail.code());
    }

    @Test
    void constructor_rejects_null_registry_and_bindings() {
        org.junit.jupiter.api.Assertions.assertThrows(IllegalArgumentException.class,
                () -> new RegistryBackedModelGovernanceGate(null, Map.of()));
        org.junit.jupiter.api.Assertions.assertThrows(IllegalArgumentException.class,
                () -> new RegistryBackedModelGovernanceGate(InMemoryApprovedModelRegistry.empty(), null));
    }
}
