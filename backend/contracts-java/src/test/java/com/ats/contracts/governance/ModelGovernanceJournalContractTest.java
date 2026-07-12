package com.ats.contracts.governance;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.contracts.AIProvider;
import com.ats.contracts.governance.ModelGovernanceGate.Decision;
import com.ats.contracts.governance.ModelGovernanceGate.Permit;
import com.ats.contracts.governance.ModelGovernanceGate.Reason;
import com.ats.contracts.governance.ModelGovernanceJournal.Attested;
import com.ats.contracts.governance.ModelGovernanceJournal.InvocationContext;
import com.ats.contracts.governance.ModelGovernanceJournal.JournalReceipt;
import com.ats.contracts.governance.ModelGovernanceJournal.PreflightRejected;
import com.ats.contracts.governance.ModelGovernanceJournal.ProviderRejected;
import com.ats.contracts.governance.ModelGovernanceJournal.VerificationRejected;
import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import org.junit.jupiter.api.Test;

/** gov1-1d port değer-nesnesi değişmezleri: ModelInvocationId biçimi + sealed Terminal compact-ctor. */
class ModelGovernanceJournalContractTest {

    private static final ModelApprovalRef REF = new ModelApprovalRef("mapr_" + "0".repeat(64));
    private static final Permit PERMIT = new Permit(Capability.TRANSCRIBE, REF, "p", "m", "v", "e", "ip");
    private static final AIProvider.ReportedModelIdentity REPORTED =
            AIProvider.ReportedModelIdentity.fromProvider("m", "v");

    private static Decision allow() {
        return Decision.allow(REF, Capability.TRANSCRIBE, "m", "v");
    }

    private static Decision deny() {
        return Decision.deny(REF, Capability.TRANSCRIBE, Reason.MODEL_ID_MISMATCH);
    }

    @Test
    void model_invocation_id_random_is_valid_v4_lowercase() {
        ModelInvocationId id = ModelInvocationId.random();
        assertTrue(id.value().startsWith("mgi_"));
        assertTrue(id.value().matches(
                "mgi_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"));
        // round-trip: geçerli değer yeniden kurulabilir
        assertEquals(id, new ModelInvocationId(id.value()));
    }

    @Test
    void model_invocation_id_rejects_malformed() {
        for (String bad : new String[] {
                null, "", "  ", "mgi_", "not-an-id",
                "mgi_00000000-0000-0000-0000-000000000000",  // sürüm nibble 4 değil
                "mgi_00000000-0000-4000-0000-000000000000",  // variant nibble [89ab] değil
                "mgi_00000000-0000-4000-8000-00000000000",   // kısa
                "MGI_00000000-0000-4000-8000-000000000000",  // büyük harf prefix
                "mgi_00000000-0000-4000-8000-00000000000G"}) { // hex-dışı
            assertThrows(IllegalArgumentException.class, () -> new ModelInvocationId(bad),
                    "geçersiz reddedilmeli: " + bad);
        }
    }

    @Test
    void attested_requires_allow_decision() {
        assertThrows(IllegalArgumentException.class, () -> new Attested(PERMIT, REPORTED, deny()));
        // ALLOW kabul
        assertTrue(new Attested(PERMIT, REPORTED, allow()).decision().allowed());
    }

    @Test
    void verification_rejected_requires_deny_decision() {
        assertThrows(IllegalArgumentException.class, () -> new VerificationRejected(PERMIT, REPORTED, allow()));
        // DENY kabul
        assertTrue(!new VerificationRejected(PERMIT, REPORTED, deny()).decision().allowed());
    }

    @Test
    void permit_carrying_variants_require_matching_capability() {
        Decision citeAllow = Decision.allow(REF, Capability.CITE, "m", "v");
        Decision citeDeny = Decision.deny(REF, Capability.CITE, Reason.MODEL_ID_MISMATCH);
        // permit=TRANSCRIBE, decision.capability=CITE → fail-closed
        assertThrows(IllegalArgumentException.class, () -> new Attested(PERMIT, REPORTED, citeAllow));
        assertThrows(IllegalArgumentException.class, () -> new VerificationRejected(PERMIT, REPORTED, citeDeny));
    }

    @Test
    void provider_rejected_reason_is_fixed_provider_failed() {
        assertEquals(Reason.PROVIDER_FAILED, new ProviderRejected(PERMIT).reason());
        assertThrows(IllegalArgumentException.class, () -> new ProviderRejected(null));
    }

    @Test
    void preflight_rejected_requires_capability_and_reason() {
        assertThrows(IllegalArgumentException.class, () -> new PreflightRejected(null, Reason.REGISTRY_UNAVAILABLE));
        assertThrows(IllegalArgumentException.class, () -> new PreflightRejected(Capability.TRANSCRIBE, null));
        assertEquals(Capability.CITE, new PreflightRejected(Capability.CITE, Reason.APPROVAL_NOT_FOUND).capability());
    }

    @Test
    void invocation_context_and_receipt_reject_blanks() {
        assertThrows(IllegalArgumentException.class,
                () -> new InvocationContext(null, new InterviewId("i"), new ActorId("a")));
        assertThrows(IllegalArgumentException.class,
                () -> new InvocationContext(new TenantId("t"), null, new ActorId("a")));
        assertThrows(IllegalArgumentException.class,
                () -> new InvocationContext(new TenantId("t"), new InterviewId("i"), null));
        assertThrows(IllegalArgumentException.class, () -> new JournalReceipt(null));
        assertThrows(IllegalArgumentException.class, () -> new JournalReceipt("  "));
        assertEquals("ev-1", new JournalReceipt("ev-1").evidenceId());
    }
}
