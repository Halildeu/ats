package com.ats.contracts.governance;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * gov1-1e SAF state-machine KANITI ({@link ModelGovernanceTransitions}): 4×4 tam matris (izinli/reddedilen
 * her çift) + gerekçe-tutarlılığı ({@code REVOKED→APPROVED yalnız REAPPROVED}) + self-transition/null
 * fail-closed. Matris {@link TransitionReason} bağlarından türetilir (single-source).
 */
class ModelGovernanceTransitionsTest {

    // İzinli geçişlerin tam kümesi (from|to string anahtar).
    private static final Set<String> ALLOWED = Set.of(
            key(ApprovalStatus.UNINITIALIZED, ApprovalStatus.DRAFT),
            key(ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED),
            key(ApprovalStatus.DRAFT, ApprovalStatus.APPROVED),
            key(ApprovalStatus.APPROVED, ApprovalStatus.REVOKED),
            key(ApprovalStatus.REVOKED, ApprovalStatus.APPROVED));

    private static String key(ApprovalStatus a, ApprovalStatus b) {
        return a.name() + "|" + b.name();
    }

    @Test
    void isAllowed_matches_full_matrix_including_self_and_reverse_rejections() {
        for (ApprovalStatus from : ApprovalStatus.values()) {
            for (ApprovalStatus to : ApprovalStatus.values()) {
                boolean expected = ALLOWED.contains(key(from, to));
                assertEquals(expected, ModelGovernanceTransitions.isAllowed(from, to),
                        "isAllowed(" + from + "→" + to + ") beklenen=" + expected);
            }
        }
    }

    @Test
    void self_transitions_and_return_to_uninitialized_are_rejected() {
        for (ApprovalStatus s : ApprovalStatus.values()) {
            assertFalse(ModelGovernanceTransitions.isAllowed(s, s), s + "→" + s + " self-transition reddedilmeli");
            assertFalse(ModelGovernanceTransitions.isAllowed(s, ApprovalStatus.UNINITIALIZED),
                    s + "→UNINITIALIZED geri-dönüş reddedilmeli");
        }
    }

    @Test
    void isAllowed_null_is_fail_closed() {
        assertFalse(ModelGovernanceTransitions.isAllowed(null, ApprovalStatus.APPROVED));
        assertFalse(ModelGovernanceTransitions.isAllowed(ApprovalStatus.APPROVED, null));
        assertFalse(ModelGovernanceTransitions.isAllowed(null, null));
    }

    @Test
    void reason_consistency_binds_each_transition_to_its_reason() {
        assertTrue(ModelGovernanceTransitions.isConsistent(
                ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED, TransitionReason.INITIAL_APPROVAL));
        assertTrue(ModelGovernanceTransitions.isConsistent(
                ApprovalStatus.REVOKED, ApprovalStatus.APPROVED, TransitionReason.REAPPROVED));
        // REVOKED→APPROVED yalnız REAPPROVED; INITIAL_APPROVAL ile tutarsız.
        assertFalse(ModelGovernanceTransitions.isConsistent(
                ApprovalStatus.REVOKED, ApprovalStatus.APPROVED, TransitionReason.INITIAL_APPROVAL));
        // null gerekçe fail-closed
        assertFalse(ModelGovernanceTransitions.isConsistent(
                ApprovalStatus.REVOKED, ApprovalStatus.APPROVED, null));
    }

    @Test
    void isValidTransition_requires_allowed_and_consistent() {
        // izinli + doğru gerekçe → geçerli
        assertTrue(ModelGovernanceTransitions.isValidTransition(
                ApprovalStatus.APPROVED, ApprovalStatus.REVOKED, TransitionReason.REVOKED_BY_OWNER));
        // izinli çift ama YANLIŞ gerekçe → geçersiz (gerekçe-tutarsızlığı)
        assertFalse(ModelGovernanceTransitions.isValidTransition(
                ApprovalStatus.APPROVED, ApprovalStatus.REVOKED, TransitionReason.REAPPROVED));
        // illegal çift + herhangi gerekçe → geçersiz
        assertFalse(ModelGovernanceTransitions.isValidTransition(
                ApprovalStatus.APPROVED, ApprovalStatus.DRAFT, TransitionReason.DRAFTED));
        // her izinli çift kendi gerekçesiyle geçerli olmalı (tam kapsama)
        for (TransitionReason r : TransitionReason.values()) {
            assertTrue(ModelGovernanceTransitions.isValidTransition(r.fromStatus(), r.toStatus(), r),
                    r + " kendi bağlı geçişiyle geçerli olmalı");
        }
    }
}
