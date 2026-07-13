package com.ats.contracts.governance;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

/**
 * gov1-1e hash-chain helper KANITI ({@link ModelGovernanceTransitionHashChain}): TEK deterministik hesap
 * (aynı girdi → aynı hash), her içerik alanının + zincir-bağının hash'i değiştirmesi (tamper-evident),
 * {@code recompute} == açık-alan {@code entryHash} (single-source; WRITE ve READ tarafı AYNI hesap),
 * genesis sentinel + hex biçim doğrulaması + null fail-closed.
 */
class ModelGovernanceTransitionHashChainTest {

    private static final ModelApprovalRef REF = new ModelApprovalRef("mapr_" + "a".repeat(64));
    private static final ModelApprovalRef REF2 = new ModelApprovalRef("mapr_" + "b".repeat(64));
    private static final GovernanceActorRef ACTOR = new GovernanceActorRef("admin.owner-1");
    private static final GovernanceActorRef ACTOR2 = new GovernanceActorRef("admin.owner-2");
    private static final String OCCURRED = "2026-07-13T10:00:00Z";
    private static final TransitionId ID = new TransitionId("mgt_00000000-0000-4000-8000-000000000001");
    private static final TransitionId ID2 = new TransitionId("mgt_00000000-0000-4000-8000-000000000002");
    private static final String GEN = ModelGovernanceTransitionHashChain.GENESIS_PREVIOUS_HASH;

    private static String baseline() {
        return ModelGovernanceTransitionHashChain.entryHash(
                GEN, ID, REF, Capability.TRANSCRIBE, ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED,
                ACTOR, OCCURRED, TransitionReason.INITIAL_APPROVAL, 0L);
    }

    @Test
    void genesis_sentinel_is_64_hex_zeros() {
        assertEquals("0".repeat(64), GEN);
        assertTrue(ModelGovernanceTransitionHashChain.isHashHex(GEN));
    }

    @Test
    void isHashHex_validates_lowercase_64_hex() {
        assertTrue(ModelGovernanceTransitionHashChain.isHashHex("a".repeat(64)));
        assertTrue(ModelGovernanceTransitionHashChain.isHashHex(baseline()));
        assertFalse(ModelGovernanceTransitionHashChain.isHashHex(null));
        assertFalse(ModelGovernanceTransitionHashChain.isHashHex("a".repeat(63)), "63 kısa");
        assertFalse(ModelGovernanceTransitionHashChain.isHashHex("A".repeat(64)), "uppercase red");
        assertFalse(ModelGovernanceTransitionHashChain.isHashHex("g".repeat(64)), "hex dışı");
    }

    @Test
    void entryHash_is_deterministic_and_64_hex() {
        String h1 = baseline();
        String h2 = baseline();
        assertEquals(h1, h2, "aynı girdi → aynı hash (deterministik)");
        assertTrue(ModelGovernanceTransitionHashChain.isHashHex(h1));
    }

    @Test
    void entryHash_changes_when_any_content_field_or_chain_link_changes() {
        String base = baseline();
        // previousHash (zincir bağı) hash'i etkiler
        assertNotEquals(base, ModelGovernanceTransitionHashChain.entryHash(
                "a".repeat(64), ID, REF, Capability.TRANSCRIBE, ApprovalStatus.UNINITIALIZED,
                ApprovalStatus.APPROVED, ACTOR, OCCURRED, TransitionReason.INITIAL_APPROVAL, 0L));
        // transitionId
        assertNotEquals(base, ModelGovernanceTransitionHashChain.entryHash(
                GEN, ID2, REF, Capability.TRANSCRIBE, ApprovalStatus.UNINITIALIZED,
                ApprovalStatus.APPROVED, ACTOR, OCCURRED, TransitionReason.INITIAL_APPROVAL, 0L));
        // approvalRef
        assertNotEquals(base, ModelGovernanceTransitionHashChain.entryHash(
                GEN, ID, REF2, Capability.TRANSCRIBE, ApprovalStatus.UNINITIALIZED,
                ApprovalStatus.APPROVED, ACTOR, OCCURRED, TransitionReason.INITIAL_APPROVAL, 0L));
        // capability
        assertNotEquals(base, ModelGovernanceTransitionHashChain.entryHash(
                GEN, ID, REF, Capability.CITE, ApprovalStatus.UNINITIALIZED,
                ApprovalStatus.APPROVED, ACTOR, OCCURRED, TransitionReason.INITIAL_APPROVAL, 0L));
        // toStatus
        assertNotEquals(base, ModelGovernanceTransitionHashChain.entryHash(
                GEN, ID, REF, Capability.TRANSCRIBE, ApprovalStatus.UNINITIALIZED,
                ApprovalStatus.DRAFT, ACTOR, OCCURRED, TransitionReason.DRAFTED, 0L));
        // actorRef
        assertNotEquals(base, ModelGovernanceTransitionHashChain.entryHash(
                GEN, ID, REF, Capability.TRANSCRIBE, ApprovalStatus.UNINITIALIZED,
                ApprovalStatus.APPROVED, ACTOR2, OCCURRED, TransitionReason.INITIAL_APPROVAL, 0L));
        // occurredAt
        assertNotEquals(base, ModelGovernanceTransitionHashChain.entryHash(
                GEN, ID, REF, Capability.TRANSCRIBE, ApprovalStatus.UNINITIALIZED,
                ApprovalStatus.APPROVED, ACTOR, "2026-07-13T11:00:00Z", TransitionReason.INITIAL_APPROVAL, 0L));
        // sequence
        assertNotEquals(base, ModelGovernanceTransitionHashChain.entryHash(
                GEN, ID, REF, Capability.TRANSCRIBE, ApprovalStatus.UNINITIALIZED,
                ApprovalStatus.APPROVED, ACTOR, OCCURRED, TransitionReason.INITIAL_APPROVAL, 1L));
    }

    @Test
    void recompute_equals_explicit_entryHash_single_source() {
        String eh = baseline();
        ModelGovernanceTransition t = new ModelGovernanceTransition(
                ID, REF, Capability.TRANSCRIBE, ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED,
                ACTOR, OCCURRED, TransitionReason.INITIAL_APPROVAL, GEN, eh, 0L);
        // READ tarafı recompute == WRITE tarafı açık-alan hesap (iki kopya YOK).
        assertEquals(eh, ModelGovernanceTransitionHashChain.recompute(t));
    }

    @Test
    void entryHash_null_argument_is_fail_closed() {
        assertThrows(IllegalArgumentException.class, () -> ModelGovernanceTransitionHashChain.entryHash(
                null, ID, REF, Capability.TRANSCRIBE, ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED,
                ACTOR, OCCURRED, TransitionReason.INITIAL_APPROVAL, 0L));
        assertThrows(IllegalArgumentException.class, () -> ModelGovernanceTransitionHashChain.entryHash(
                GEN, null, REF, Capability.TRANSCRIBE, ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED,
                ACTOR, OCCURRED, TransitionReason.INITIAL_APPROVAL, 0L));
    }
}
