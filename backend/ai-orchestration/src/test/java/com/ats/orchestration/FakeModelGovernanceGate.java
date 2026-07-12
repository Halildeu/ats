package com.ats.orchestration;

import com.ats.contracts.AIProvider;
import com.ats.contracts.governance.Capability;
import com.ats.contracts.governance.ModelApprovalRef;
import com.ats.contracts.governance.ModelGovernanceGate;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;

/**
 * Orkestrasyon testleri için yapılandırılabilir sahte {@link ModelGovernanceGate} (call-count'lu).
 * GERÇEK onaylı-model eşleşmesi adapter unit testinde ({@code RegistryBackedModelGovernanceGateTest})
 * kanıtlanır; bu sahte yalnız orkestrasyonun preflight/verify ALLOW/DENY dallarını (fail-closed
 * discard davranışı) çalıştırmak içindir.
 */
final class FakeModelGovernanceGate implements ModelGovernanceGate {

    private static final ModelApprovalRef REF = new ModelApprovalRef("mapr_" + "0".repeat(64));

    int preflightCalls = 0;
    int verifyCalls = 0;

    private Reason preflightDenyReason; // null → ALLOW (Permit verilir)
    private Reason verifyDenyReason;    // null → ALLOW
    private Outcome<Permit> rawPreflightFail; // set → preflight bunu döner (ham-string/inconsistent gate simülasyonu)
    private boolean nullPermit;   // true → preflight Outcome.ok(null) (sözleşme-ihlali guard testi)
    private boolean nullDecision; // true → verify Outcome.ok(null) (sözleşme-ihlali guard testi)

    static FakeModelGovernanceGate allowing() {
        return new FakeModelGovernanceGate();
    }

    static FakeModelGovernanceGate denyingPreflight(Reason reason) {
        FakeModelGovernanceGate g = new FakeModelGovernanceGate();
        g.preflightDenyReason = reason;
        return g;
    }

    static FakeModelGovernanceGate denyingVerify(Reason reason) {
        FakeModelGovernanceGate g = new FakeModelGovernanceGate();
        g.verifyDenyReason = reason;
        return g;
    }

    /** Bozuk/alternatif gate: preflight ham serbest-string (VEYA enum-token + tutarsız code) Fail döner. */
    static FakeModelGovernanceGate denyingPreflightRaw(OutcomeCode code, String rawToken) {
        FakeModelGovernanceGate g = new FakeModelGovernanceGate();
        g.rawPreflightFail = Outcome.fail(code, rawToken);
        return g;
    }

    /** Sözleşme-ihlali: preflight Outcome.ok(null) Permit döner (fail-closed guard testi). */
    static FakeModelGovernanceGate allowingNullPermit() {
        FakeModelGovernanceGate g = new FakeModelGovernanceGate();
        g.nullPermit = true;
        return g;
    }

    /** Sözleşme-ihlali: verify Outcome.ok(null) Decision döner (fail-closed guard testi). */
    static FakeModelGovernanceGate allowingNullDecision() {
        FakeModelGovernanceGate g = new FakeModelGovernanceGate();
        g.nullDecision = true;
        return g;
    }

    @Override
    public Outcome<Permit> preflight(Capability capability) {
        preflightCalls++;
        if (rawPreflightFail != null) {
            return rawPreflightFail;
        }
        if (preflightDenyReason != null) {
            return ModelGovernanceGate.preflightDeny(preflightDenyReason);
        }
        if (nullPermit) {
            return Outcome.ok(null); // Ok ama null Permit (sözleşme-ihlali)
        }
        return Outcome.ok(new Permit(capability, REF, "prov", "model", "v1", "ep", "ip1"));
    }

    @Override
    public Outcome<Decision> verify(Permit permit, AIProvider.ReportedModelIdentity reported) {
        verifyCalls++;
        if (verifyDenyReason != null) {
            return Outcome.ok(Decision.deny(permit.approvalRef(), permit.capability(), verifyDenyReason));
        }
        if (nullDecision) {
            return Outcome.ok(null); // Ok ama null Decision (sözleşme-ihlali)
        }
        return Outcome.ok(Decision.allow(permit.approvalRef(), permit.capability(), "model", "v1"));
    }
}
