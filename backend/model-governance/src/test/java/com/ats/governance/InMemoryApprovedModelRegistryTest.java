package com.ats.governance;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.contracts.governance.ApprovalStatus;
import com.ats.contracts.governance.ApprovedModelSpec;
import com.ats.contracts.governance.Capability;
import com.ats.contracts.governance.ModelApprovalRef;
import com.ats.contracts.governance.ModelScope;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

/** resolve/resolveConfigured fail-closed sözleşmesi (APPROVED-only; her sapma DENY). */
class InMemoryApprovedModelRegistryTest {

    private static ApprovedModelSpec transcribe(String modelId, String version, ApprovalStatus status) {
        return ApprovedModelSpec.of(Capability.TRANSCRIBE, "prov-a", modelId, version,
                Set.of(), Set.of(), "endpoint-a", "ip-1", status, ModelScope.GLOBAL);
    }

    private static OutcomeCode code(Outcome<?> o) {
        return ((Outcome.Fail<?>) o).code();
    }

    @Test
    void resolve_approved_ok_revoked_and_draft_deny() {
        ApprovedModelSpec approved = transcribe("m-ok", "v1", ApprovalStatus.APPROVED);
        ApprovedModelSpec revoked = transcribe("m-revoked", "v1", ApprovalStatus.REVOKED);
        ApprovedModelSpec draft = transcribe("m-draft", "v1", ApprovalStatus.DRAFT);
        var registry = InMemoryApprovedModelRegistry.of(List.of(approved, revoked, draft));

        assertTrue(registry.resolve(approved.approvalRef(), Capability.TRANSCRIBE).isOk());
        assertEquals(OutcomeCode.DENIED, code(registry.resolve(revoked.approvalRef(), Capability.TRANSCRIBE)));
        assertEquals(OutcomeCode.DENIED, code(registry.resolve(draft.approvalRef(), Capability.TRANSCRIBE)));
    }

    @Test
    void resolve_unknown_ref_and_capability_mismatch_deny() {
        ApprovedModelSpec approved = transcribe("m-ok", "v1", ApprovalStatus.APPROVED);
        var registry = InMemoryApprovedModelRegistry.of(List.of(approved));

        ModelApprovalRef unknown = new ModelApprovalRef("mapr_" + "0".repeat(64));
        assertEquals(OutcomeCode.NOT_FOUND, code(registry.resolve(unknown, Capability.TRANSCRIBE)));
        // kayıt TRANSCRIBE; CITE ile çözmeye çalışmak DENY
        assertEquals(OutcomeCode.DENIED, code(registry.resolve(approved.approvalRef(), Capability.CITE)));
    }

    @Test
    void resolve_configured_exact_match_ok_and_mismatches_deny() {
        ApprovedModelSpec approved = transcribe("whisper-tr", "v0.1.0", ApprovalStatus.APPROVED);
        var registry = InMemoryApprovedModelRegistry.of(List.of(approved));

        assertInstanceOf(Outcome.Ok.class,
                registry.resolveConfigured(Capability.TRANSCRIBE, "prov-a", "whisper-tr", "v0.1.0"));
        // provider mismatch
        assertEquals(OutcomeCode.NOT_FOUND,
                code(registry.resolveConfigured(Capability.TRANSCRIBE, "prov-b", "whisper-tr", "v0.1.0")));
        // model mismatch
        assertEquals(OutcomeCode.NOT_FOUND,
                code(registry.resolveConfigured(Capability.TRANSCRIBE, "prov-a", "whisper-en", "v0.1.0")));
        // version mismatch
        assertEquals(OutcomeCode.NOT_FOUND,
                code(registry.resolveConfigured(Capability.TRANSCRIBE, "prov-a", "whisper-tr", "v9.9.9")));
        // capability mismatch
        assertEquals(OutcomeCode.NOT_FOUND,
                code(registry.resolveConfigured(Capability.CITE, "prov-a", "whisper-tr", "v0.1.0")));
    }

    @Test
    void resolve_configured_non_approved_status_deny() {
        ApprovedModelSpec revoked = transcribe("whisper-tr", "v0.1.0", ApprovalStatus.REVOKED);
        var registry = InMemoryApprovedModelRegistry.of(List.of(revoked));
        assertEquals(OutcomeCode.DENIED,
                code(registry.resolveConfigured(Capability.TRANSCRIBE, "prov-a", "whisper-tr", "v0.1.0")));
    }

    @Test
    void empty_registry_denies() {
        var registry = InMemoryApprovedModelRegistry.empty();
        assertEquals(OutcomeCode.NOT_FOUND,
                code(registry.resolve(new ModelApprovalRef("mapr_" + "0".repeat(64)), Capability.TRANSCRIBE)));
        assertEquals(OutcomeCode.NOT_FOUND,
                code(registry.resolveConfigured(Capability.TRANSCRIBE, "prov-a", "m", "v")));
    }

    @Test
    void unavailable_registry_denies_fail_closed() {
        var registry = InMemoryApprovedModelRegistry.unavailable();
        assertEquals(OutcomeCode.NOT_CONFIGURED,
                code(registry.resolve(new ModelApprovalRef("mapr_" + "0".repeat(64)), Capability.TRANSCRIBE)));
        assertEquals(OutcomeCode.NOT_CONFIGURED,
                code(registry.resolveConfigured(Capability.TRANSCRIBE, "prov-a", "m", "v")));
    }

    @Test
    void invalid_arguments_fail_closed() {
        var registry = InMemoryApprovedModelRegistry.of(List.of(transcribe("m", "v", ApprovalStatus.APPROVED)));
        assertEquals(OutcomeCode.INVALID, code(registry.resolve(null, Capability.TRANSCRIBE)));
        assertEquals(OutcomeCode.INVALID, code(registry.resolveConfigured(Capability.TRANSCRIBE, " ", "m", "v")));
    }
}
