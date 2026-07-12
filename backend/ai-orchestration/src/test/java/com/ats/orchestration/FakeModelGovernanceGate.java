package com.ats.orchestration;

import com.ats.contracts.AIProvider;
import com.ats.contracts.governance.Capability;
import com.ats.contracts.governance.ModelApprovalRef;
import com.ats.contracts.governance.ModelGovernanceGate;
import com.ats.kernel.Outcome;

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

    @Override
    public Outcome<Permit> preflight(Capability capability) {
        preflightCalls++;
        if (preflightDenyReason != null) {
            return ModelGovernanceGate.preflightDeny(preflightDenyReason);
        }
        return Outcome.ok(new Permit(capability, REF, "prov", "model", "v1", "ep", "ip1"));
    }

    @Override
    public Outcome<Decision> verify(Permit permit, AIProvider.ReportedModelIdentity reported) {
        verifyCalls++;
        if (verifyDenyReason != null) {
            return Outcome.ok(Decision.deny(permit.approvalRef(), permit.capability(), verifyDenyReason));
        }
        return Outcome.ok(Decision.allow(permit.approvalRef(), permit.capability(), "model", "v1"));
    }
}
