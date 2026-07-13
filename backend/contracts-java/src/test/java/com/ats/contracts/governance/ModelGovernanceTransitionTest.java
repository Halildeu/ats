package com.ats.contracts.governance;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

/**
 * gov1-1e transition TİP-doğrulaması: {@link TransitionId} / {@link GovernanceActorRef} /
 * {@link ModelGovernanceTransition} / {@link TransitionReason} / {@link ApprovalStatus#UNINITIALIZED}
 * fail-closed kurucuları. Bozuk biçim/serbest string/negatif sequence ASLA nesneye dönüşmez.
 */
class ModelGovernanceTransitionTest {

    private static final ModelApprovalRef REF = new ModelApprovalRef("mapr_" + "a".repeat(64));
    private static final GovernanceActorRef ACTOR = new GovernanceActorRef("admin.owner-1");
    private static final String OCCURRED = "2026-07-13T10:00:00Z";
    private static final TransitionId ID = new TransitionId("mgt_00000000-0000-4000-8000-000000000001");

    /* ---- TransitionId ---- */

    @Test
    void transitionId_accepts_uuid_v4_and_rejects_malformed() {
        assertTrue(TransitionId.isValid("mgt_00000000-0000-4000-8000-000000000001"));
        assertFalse(TransitionId.isValid(null));
        assertFalse(TransitionId.isValid("mgt_not-a-uuid"));
        assertFalse(TransitionId.isValid("mgi_00000000-0000-4000-8000-000000000001"), "yanlış önek");
        // v3 (sürüm nibble 3) reddedilir — yalnız v4
        assertFalse(TransitionId.isValid("mgt_00000000-0000-3000-8000-000000000001"));
        // variant nibble 'c' (89ab dışı) reddedilir
        assertFalse(TransitionId.isValid("mgt_00000000-0000-4000-c000-000000000001"));
        assertThrows(IllegalArgumentException.class, () -> new TransitionId("bogus"));
    }

    @Test
    void transitionId_random_is_valid_and_unique() {
        TransitionId a = TransitionId.random();
        TransitionId b = TransitionId.random();
        assertTrue(TransitionId.isValid(a.value()));
        assertNotNull(b.value());
        assertFalse(a.equals(b), "random iki farklı id üretmeli");
    }

    /* ---- GovernanceActorRef ---- */

    @Test
    void actorRef_allowlist_bounded_and_rejects_url_control_and_oversize() {
        assertEquals("admin.owner-1", new GovernanceActorRef("admin.owner-1").value());
        assertThrows(IllegalArgumentException.class, () -> new GovernanceActorRef(null));
        assertThrows(IllegalArgumentException.class, () -> new GovernanceActorRef("  "));
        assertThrows(IllegalArgumentException.class, () -> new GovernanceActorRef("a".repeat(129)),
                ">128 reddedilmeli");
        assertThrows(IllegalArgumentException.class, () -> new GovernanceActorRef("has space"),
                "boşluk allowlist dışı");
        assertThrows(IllegalArgumentException.class, () -> new GovernanceActorRef("bad\nnewline"),
                "kontrol karakteri allowlist dışı");
        assertThrows(IllegalArgumentException.class, () -> new GovernanceActorRef("https://evil/x"),
                "URL/secret guard '://'");
    }

    /* ---- TransitionReason (matris single-source bağları) ---- */

    @Test
    void transitionReason_carries_bound_from_to_pairs() {
        assertEquals(ApprovalStatus.UNINITIALIZED, TransitionReason.DRAFTED.fromStatus());
        assertEquals(ApprovalStatus.DRAFT, TransitionReason.DRAFTED.toStatus());
        assertEquals(ApprovalStatus.UNINITIALIZED, TransitionReason.INITIAL_APPROVAL.fromStatus());
        assertEquals(ApprovalStatus.APPROVED, TransitionReason.INITIAL_APPROVAL.toStatus());
        assertEquals(ApprovalStatus.DRAFT, TransitionReason.APPROVED_FROM_DRAFT.fromStatus());
        assertEquals(ApprovalStatus.APPROVED, TransitionReason.APPROVED_FROM_DRAFT.toStatus());
        assertEquals(ApprovalStatus.APPROVED, TransitionReason.REVOKED_BY_OWNER.fromStatus());
        assertEquals(ApprovalStatus.REVOKED, TransitionReason.REVOKED_BY_OWNER.toStatus());
        assertEquals(ApprovalStatus.REVOKED, TransitionReason.REAPPROVED.fromStatus());
        assertEquals(ApprovalStatus.APPROVED, TransitionReason.REAPPROVED.toStatus());
        // Hiçbir gerekçe self-transition bağlamaz (from != to her gerekçede).
        for (TransitionReason r : TransitionReason.values()) {
            assertFalse(r.fromStatus() == r.toStatus(), r + " self-transition bağlamamalı");
        }
    }

    @Test
    void approvalStatus_has_uninitialized_genesis_token() {
        // UNINITIALIZED artık WORM-transition-state vokabülerinin parçası (genesis fromStatus token'ı).
        assertNotNull(ApprovalStatus.valueOf("UNINITIALIZED"));
        assertEquals(4, ApprovalStatus.values().length, "UNINITIALIZED + APPROVED + REVOKED + DRAFT");
    }

    /* ---- ModelGovernanceTransition (yapısal fail-closed) ---- */

    private static String validEntryHash() {
        return ModelGovernanceTransitionHashChain.entryHash(
                ModelGovernanceTransitionHashChain.GENESIS_PREVIOUS_HASH, ID, REF, Capability.TRANSCRIBE,
                ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED, ACTOR, OCCURRED,
                TransitionReason.INITIAL_APPROVAL, 0L);
    }

    @Test
    void transition_happy_path_constructs() {
        ModelGovernanceTransition t = new ModelGovernanceTransition(
                ID, REF, Capability.TRANSCRIBE, ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED,
                ACTOR, OCCURRED, TransitionReason.INITIAL_APPROVAL,
                ModelGovernanceTransitionHashChain.GENESIS_PREVIOUS_HASH, validEntryHash(), 0L);
        assertEquals(0L, t.sequence());
        assertEquals(ApprovalStatus.UNINITIALIZED, t.fromStatus());
        assertEquals(ApprovalStatus.APPROVED, t.toStatus());
    }

    @Test
    void transition_rejects_null_fields() {
        String eh = validEntryHash();
        String prev = ModelGovernanceTransitionHashChain.GENESIS_PREVIOUS_HASH;
        assertThrows(IllegalArgumentException.class, () -> new ModelGovernanceTransition(
                null, REF, Capability.TRANSCRIBE, ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED,
                ACTOR, OCCURRED, TransitionReason.INITIAL_APPROVAL, prev, eh, 0L));
        assertThrows(IllegalArgumentException.class, () -> new ModelGovernanceTransition(
                ID, null, Capability.TRANSCRIBE, ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED,
                ACTOR, OCCURRED, TransitionReason.INITIAL_APPROVAL, prev, eh, 0L));
        assertThrows(IllegalArgumentException.class, () -> new ModelGovernanceTransition(
                ID, REF, null, ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED,
                ACTOR, OCCURRED, TransitionReason.INITIAL_APPROVAL, prev, eh, 0L));
        assertThrows(IllegalArgumentException.class, () -> new ModelGovernanceTransition(
                ID, REF, Capability.TRANSCRIBE, null, ApprovalStatus.APPROVED,
                ACTOR, OCCURRED, TransitionReason.INITIAL_APPROVAL, prev, eh, 0L));
        assertThrows(IllegalArgumentException.class, () -> new ModelGovernanceTransition(
                ID, REF, Capability.TRANSCRIBE, ApprovalStatus.UNINITIALIZED, null,
                ACTOR, OCCURRED, TransitionReason.INITIAL_APPROVAL, prev, eh, 0L));
        assertThrows(IllegalArgumentException.class, () -> new ModelGovernanceTransition(
                ID, REF, Capability.TRANSCRIBE, ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED,
                null, OCCURRED, TransitionReason.INITIAL_APPROVAL, prev, eh, 0L));
        assertThrows(IllegalArgumentException.class, () -> new ModelGovernanceTransition(
                ID, REF, Capability.TRANSCRIBE, ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED,
                ACTOR, OCCURRED, null, prev, eh, 0L));
    }

    @Test
    void transition_rejects_malformed_occurredAt_hash_format_and_negative_sequence() {
        String eh = validEntryHash();
        String prev = ModelGovernanceTransitionHashChain.GENESIS_PREVIOUS_HASH;
        // occurredAt ISO değil
        assertThrows(IllegalArgumentException.class, () -> new ModelGovernanceTransition(
                ID, REF, Capability.TRANSCRIBE, ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED,
                ACTOR, "13-07-2026 10:00", TransitionReason.INITIAL_APPROVAL, prev, eh, 0L));
        // previousHash 64-hex değil
        assertThrows(IllegalArgumentException.class, () -> new ModelGovernanceTransition(
                ID, REF, Capability.TRANSCRIBE, ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED,
                ACTOR, OCCURRED, TransitionReason.INITIAL_APPROVAL, "short", eh, 0L));
        // entryHash uppercase-hex (küçük-hex değil) reddedilir
        assertThrows(IllegalArgumentException.class, () -> new ModelGovernanceTransition(
                ID, REF, Capability.TRANSCRIBE, ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED,
                ACTOR, OCCURRED, TransitionReason.INITIAL_APPROVAL, prev, "A".repeat(64), 0L));
        // negatif sequence
        assertThrows(IllegalArgumentException.class, () -> new ModelGovernanceTransition(
                ID, REF, Capability.TRANSCRIBE, ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED,
                ACTOR, OCCURRED, TransitionReason.INITIAL_APPROVAL, prev, eh, -1L));
    }
}
