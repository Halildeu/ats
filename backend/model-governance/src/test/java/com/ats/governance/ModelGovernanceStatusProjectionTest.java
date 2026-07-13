package com.ats.governance;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.contracts.governance.ApprovalStatus;
import com.ats.contracts.governance.Capability;
import com.ats.contracts.governance.GovernanceActorRef;
import com.ats.contracts.governance.ModelApprovalRef;
import com.ats.contracts.governance.ModelGovernanceTransition;
import com.ats.contracts.governance.ModelGovernanceTransitionHashChain;
import com.ats.contracts.governance.TransitionId;
import com.ats.contracts.governance.TransitionReason;
import com.ats.governance.ModelGovernanceStatusProjection.IntegrityIssue;
import com.ats.governance.ModelGovernanceStatusProjection.ProjectionOutcome;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * gov1-1e GLOBAL status projeksiyonu KANITI ({@link ModelGovernanceStatusProjection}): geçerli çok-özneli
 * zincir → doğru cari-durum + authoritative; her bozukluk sınıfı (sequence-boşluk / hash-tamper /
 * genesis-invalid / chain-link / dup-transitionId / illegal-transition / fromStatus-mismatch /
 * ref-capability) İZOLE → tam-1 makine-görünür {@link IntegrityIssue} (silent-skip YOK) + fail-closed
 * (chain kırık ⇒ authoritative değil; özne tainted ⇒ authoritative değil).
 */
class ModelGovernanceStatusProjectionTest {

    private static final GovernanceActorRef ACTOR = new GovernanceActorRef("admin.owner-1");
    private static final String OCCURRED = "2026-07-13T10:00:00Z";
    private static final ModelApprovalRef REF_A = new ModelApprovalRef("mapr_" + "a".repeat(64));
    private static final ModelApprovalRef REF_B = new ModelApprovalRef("mapr_" + "b".repeat(64));
    private static final ModelApprovalRef REF_C = new ModelApprovalRef("mapr_" + "c".repeat(64));
    private static final String GEN = ModelGovernanceTransitionHashChain.GENESIS_PREVIOUS_HASH;

    private static TransitionId id(int n) {
        return new TransitionId(String.format("mgt_00000000-0000-4000-8000-%012d", n));
    }

    /** Kendi-tutarlı (hash-doğru) transition: verilen previousHash/sequence için entryHash helper'dan. */
    private static ModelGovernanceTransition make(
            TransitionId id, ModelApprovalRef ref, Capability cap,
            ApprovalStatus from, ApprovalStatus to, TransitionReason reason,
            String previousHash, long sequence) {
        String eh = ModelGovernanceTransitionHashChain.entryHash(
                previousHash, id, ref, cap, from, to, ACTOR, OCCURRED, reason, sequence);
        return new ModelGovernanceTransition(
                id, ref, cap, from, to, ACTOR, OCCURRED, reason, previousHash, eh, sequence);
    }

    /** GLOBAL zincir kurucu: previousHash + sequence otomatik threadlenir (hep hash-doğru). */
    private static final class Chain {
        final List<ModelGovernanceTransition> rows = new ArrayList<>();
        private String prev = GEN;
        private long seq = 0;

        Chain add(TransitionId id, ModelApprovalRef ref, Capability cap,
                ApprovalStatus from, ApprovalStatus to, TransitionReason reason) {
            ModelGovernanceTransition t = make(id, ref, cap, from, to, reason, prev, seq);
            rows.add(t);
            prev = t.entryHash();
            seq++;
            return this;
        }
    }

    private static boolean hasIssue(ProjectionOutcome out, IntegrityIssue.Kind kind, int index) {
        return out.issues().stream().anyMatch(i -> i.kind() == kind && i.index() == index);
    }

    /* ---- geçerli zincir ---- */

    @Test
    void valid_multi_subject_chain_projects_correct_current_status_and_is_authoritative() {
        Chain c = new Chain()
                .add(id(1), REF_A, Capability.TRANSCRIBE,
                        ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED, TransitionReason.INITIAL_APPROVAL)
                .add(id(2), REF_B, Capability.CITE,
                        ApprovalStatus.UNINITIALIZED, ApprovalStatus.DRAFT, TransitionReason.DRAFTED)
                .add(id(3), REF_A, Capability.TRANSCRIBE,
                        ApprovalStatus.APPROVED, ApprovalStatus.REVOKED, TransitionReason.REVOKED_BY_OWNER)
                .add(id(4), REF_B, Capability.CITE,
                        ApprovalStatus.DRAFT, ApprovalStatus.APPROVED, TransitionReason.APPROVED_FROM_DRAFT)
                .add(id(5), REF_A, Capability.TRANSCRIBE,
                        ApprovalStatus.REVOKED, ApprovalStatus.APPROVED, TransitionReason.REAPPROVED);

        ProjectionOutcome out = ModelGovernanceStatusProjection.project(c.rows);

        assertTrue(out.issues().isEmpty(), "temiz zincir → bulgu YOK");
        assertTrue(out.chainIntact());
        assertEquals(ApprovalStatus.APPROVED, out.currentStatusOf(REF_A, Capability.TRANSCRIBE));
        assertEquals(ApprovalStatus.APPROVED, out.currentStatusOf(REF_B, Capability.CITE));
        assertTrue(out.isAuthoritative(REF_A, Capability.TRANSCRIBE));
        assertTrue(out.isAuthoritative(REF_B, Capability.CITE));
        // transition'ı olmayan özne → UNINITIALIZED, authoritative (taint yok, chain sağlam)
        assertEquals(ApprovalStatus.UNINITIALIZED, out.currentStatusOf(REF_C, Capability.TRANSCRIBE));
        assertTrue(out.isAuthoritative(REF_C, Capability.TRANSCRIBE));
    }

    @Test
    void empty_worm_is_all_uninitialized_and_authoritative() {
        ProjectionOutcome out = ModelGovernanceStatusProjection.project(List.of());
        assertTrue(out.issues().isEmpty());
        assertTrue(out.chainIntact());
        assertEquals(ApprovalStatus.UNINITIALIZED, out.currentStatusOf(REF_A, Capability.TRANSCRIBE));
        assertTrue(out.isAuthoritative(REF_A, Capability.TRANSCRIBE));
        // null argüman fail-closed
        assertEquals(ApprovalStatus.UNINITIALIZED, out.currentStatusOf(null, Capability.TRANSCRIBE));
        assertFalse(out.isAuthoritative(null, Capability.TRANSCRIBE));
    }

    /* ---- GLOBAL zincir kusurları (chainIntact=false) ---- */

    @Test
    void sequence_gap_is_flagged_and_breaks_chain() {
        ModelGovernanceTransition t0 = make(id(1), REF_A, Capability.TRANSCRIBE,
                ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED, TransitionReason.INITIAL_APPROVAL, GEN, 0);
        // sequence=5 (boşluk) ama link doğru + hash self-tutarlı → yalnız SEQUENCE_BREAK
        ModelGovernanceTransition t1 = make(id(2), REF_A, Capability.TRANSCRIBE,
                ApprovalStatus.APPROVED, ApprovalStatus.REVOKED, TransitionReason.REVOKED_BY_OWNER,
                t0.entryHash(), 5);
        ProjectionOutcome out = ModelGovernanceStatusProjection.project(List.of(t0, t1));
        assertEquals(1, out.issues().size());
        assertTrue(hasIssue(out, IntegrityIssue.Kind.SEQUENCE_BREAK, 1));
        assertFalse(out.chainIntact());
        assertFalse(out.isAuthoritative(REF_A, Capability.TRANSCRIBE), "chain kırık ⇒ authoritative değil");
    }

    @Test
    void entry_hash_tamper_is_flagged_and_breaks_chain() {
        ModelGovernanceTransition good = make(id(1), REF_A, Capability.TRANSCRIBE,
                ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED, TransitionReason.INITIAL_APPROVAL, GEN, 0);
        ModelGovernanceTransition tampered = new ModelGovernanceTransition(
                good.transitionId(), good.approvalRef(), good.capability(), good.fromStatus(), good.toStatus(),
                good.actorRef(), good.occurredAt(), good.reasonCode(), good.previousHash(), "f".repeat(64),
                good.sequence());
        ProjectionOutcome out = ModelGovernanceStatusProjection.project(List.of(tampered));
        assertEquals(1, out.issues().size());
        assertTrue(hasIssue(out, IntegrityIssue.Kind.ENTRY_HASH_MISMATCH, 0));
        assertFalse(out.chainIntact());
    }

    @Test
    void genesis_previous_hash_invalid_is_flagged() {
        // ilk satır previousHash != genesis sentinel (self-tutarlı hash) → yalnız GENESIS_PREVIOUS_HASH_INVALID
        ModelGovernanceTransition t0 = make(id(1), REF_A, Capability.TRANSCRIBE,
                ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED, TransitionReason.INITIAL_APPROVAL,
                "c".repeat(64), 0);
        ProjectionOutcome out = ModelGovernanceStatusProjection.project(List.of(t0));
        assertEquals(1, out.issues().size());
        assertTrue(hasIssue(out, IntegrityIssue.Kind.GENESIS_PREVIOUS_HASH_INVALID, 0));
        assertFalse(out.chainIntact());
    }

    @Test
    void chain_link_broken_is_flagged() {
        ModelGovernanceTransition t0 = make(id(1), REF_A, Capability.TRANSCRIBE,
                ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED, TransitionReason.INITIAL_APPROVAL, GEN, 0);
        // previousHash önceki entryHash'e bağlanmıyor (self-tutarlı hash) → yalnız CHAIN_LINK_BROKEN
        ModelGovernanceTransition t1 = make(id(2), REF_A, Capability.TRANSCRIBE,
                ApprovalStatus.APPROVED, ApprovalStatus.REVOKED, TransitionReason.REVOKED_BY_OWNER,
                "d".repeat(64), 1);
        ProjectionOutcome out = ModelGovernanceStatusProjection.project(List.of(t0, t1));
        assertEquals(1, out.issues().size());
        assertTrue(hasIssue(out, IntegrityIssue.Kind.CHAIN_LINK_BROKEN, 1));
        assertFalse(out.chainIntact());
    }

    /* ---- Özne-seviyesi kusurlar (chainIntact=true, özne tainted) ---- */

    @Test
    void duplicate_transition_id_taints_subject_but_chain_intact() {
        ModelGovernanceTransition t0 = make(id(1), REF_A, Capability.TRANSCRIBE,
                ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED, TransitionReason.INITIAL_APPROVAL, GEN, 0);
        // aynı id(1) tekrar (hash-zinciri doğru) → DUPLICATE_TRANSITION_ID
        ModelGovernanceTransition t1 = make(id(1), REF_A, Capability.TRANSCRIBE,
                ApprovalStatus.APPROVED, ApprovalStatus.REVOKED, TransitionReason.REVOKED_BY_OWNER,
                t0.entryHash(), 1);
        ProjectionOutcome out = ModelGovernanceStatusProjection.project(List.of(t0, t1));
        assertEquals(1, out.issues().size());
        assertTrue(hasIssue(out, IntegrityIssue.Kind.DUPLICATE_TRANSITION_ID, 1));
        assertTrue(out.chainIntact(), "hash-zinciri sağlam");
        assertFalse(out.isAuthoritative(REF_A, Capability.TRANSCRIBE), "özne tainted ⇒ authoritative değil");
    }

    @Test
    void duplicate_transition_id_across_two_subjects_taints_both() {
        Chain c = new Chain()
                .add(id(1), REF_A, Capability.TRANSCRIBE,
                        ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED, TransitionReason.INITIAL_APPROVAL)
                // aynı id(1) FARKLI özne (REF_B/CITE) → DUPLICATE_TRANSITION_ID; HER İKİ özne tainted
                .add(id(1), REF_B, Capability.CITE,
                        ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED, TransitionReason.INITIAL_APPROVAL)
                // ilgisiz 3. özne (farklı id) → authoritative kalır
                .add(id(2), REF_C, Capability.TRANSCRIBE,
                        ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED, TransitionReason.INITIAL_APPROVAL);

        ProjectionOutcome out = ModelGovernanceStatusProjection.project(c.rows);

        assertEquals(1, out.issues().size());
        assertTrue(hasIssue(out, IntegrityIssue.Kind.DUPLICATE_TRANSITION_ID, 1));
        assertTrue(out.chainIntact(), "duplicate özne-seviyesi kusur; hash-zinciri sağlam");
        // duplicate'in HER İKİ tarafı authoritative DEĞİL — ilk özne YANLIŞLIKLA APPROVED bırakılmaz
        assertFalse(out.isAuthoritative(REF_A, Capability.TRANSCRIBE), "ilk özne (id sahibi) de tainted");
        assertFalse(out.isAuthoritative(REF_B, Capability.CITE), "ikinci özne de tainted");
        // ilgisiz 3. özne authoritative kalır
        assertTrue(out.isAuthoritative(REF_C, Capability.TRANSCRIBE));
        assertEquals(ApprovalStatus.APPROVED, out.currentStatusOf(REF_C, Capability.TRANSCRIBE));
    }

    @Test
    void ref_capability_inconsistency_taints_both_subjects() {
        ModelGovernanceTransition t0 = make(id(1), REF_A, Capability.TRANSCRIBE,
                ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED, TransitionReason.INITIAL_APPROVAL, GEN, 0);
        // aynı REF_A farklı capability (CITE) → REF_CAPABILITY_INCONSISTENT
        ModelGovernanceTransition t1 = make(id(2), REF_A, Capability.CITE,
                ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED, TransitionReason.INITIAL_APPROVAL,
                t0.entryHash(), 1);
        ProjectionOutcome out = ModelGovernanceStatusProjection.project(List.of(t0, t1));
        assertEquals(1, out.issues().size());
        assertTrue(hasIssue(out, IntegrityIssue.Kind.REF_CAPABILITY_INCONSISTENT, 1));
        assertTrue(out.chainIntact());
        assertFalse(out.isAuthoritative(REF_A, Capability.CITE));
        assertFalse(out.isAuthoritative(REF_A, Capability.TRANSCRIBE), "çakışan ref'in her iki öznesi tainted");
    }

    @Test
    void from_status_mismatch_is_flagged_and_status_not_advanced() {
        ModelGovernanceTransition t0 = make(id(1), REF_A, Capability.TRANSCRIBE,
                ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED, TransitionReason.INITIAL_APPROVAL, GEN, 0);
        // fromStatus=DRAFT ama cari=APPROVED → FROM_STATUS_MISMATCH (matris geçerli olsa da önce bu yakalanır)
        ModelGovernanceTransition t1 = make(id(2), REF_A, Capability.TRANSCRIBE,
                ApprovalStatus.DRAFT, ApprovalStatus.APPROVED, TransitionReason.APPROVED_FROM_DRAFT,
                t0.entryHash(), 1);
        ProjectionOutcome out = ModelGovernanceStatusProjection.project(List.of(t0, t1));
        assertEquals(1, out.issues().size());
        assertTrue(hasIssue(out, IntegrityIssue.Kind.FROM_STATUS_MISMATCH, 1));
        assertTrue(out.chainIntact());
        assertFalse(out.isAuthoritative(REF_A, Capability.TRANSCRIBE));
        // kusurlu geçiş durumu ilerletmez → son GEÇERLİ durum APPROVED (donmuş; ama authoritative değil)
        assertEquals(ApprovalStatus.APPROVED, out.currentStatusOf(REF_A, Capability.TRANSCRIBE));
    }

    @Test
    void illegal_matrix_transition_is_flagged() {
        ModelGovernanceTransition t0 = make(id(1), REF_A, Capability.TRANSCRIBE,
                ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED, TransitionReason.INITIAL_APPROVAL, GEN, 0);
        // APPROVED→DRAFT matriste YOK (reason DRAFTED UNINITIALIZED→DRAFT bağlar) → ILLEGAL_TRANSITION
        ModelGovernanceTransition t1 = make(id(2), REF_A, Capability.TRANSCRIBE,
                ApprovalStatus.APPROVED, ApprovalStatus.DRAFT, TransitionReason.DRAFTED, t0.entryHash(), 1);
        ProjectionOutcome out = ModelGovernanceStatusProjection.project(List.of(t0, t1));
        assertEquals(1, out.issues().size());
        assertTrue(hasIssue(out, IntegrityIssue.Kind.ILLEGAL_TRANSITION, 1));
        assertTrue(out.chainIntact());
        assertFalse(out.isAuthoritative(REF_A, Capability.TRANSCRIBE));
    }

    /* ---- isAuthoritativelyApproved (1e-c tek-kontrol tüketim yüzeyi) ---- */

    @Test
    void is_authoritatively_approved_gates_on_authoritative_and_approved() {
        // (1) authoritative + APPROVED → true
        Chain approved = new Chain()
                .add(id(1), REF_A, Capability.TRANSCRIBE,
                        ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED, TransitionReason.INITIAL_APPROVAL);
        ProjectionOutcome a = ModelGovernanceStatusProjection.project(approved.rows);
        assertTrue(a.isAuthoritative(REF_A, Capability.TRANSCRIBE));
        assertTrue(a.isAuthoritativelyApproved(REF_A, Capability.TRANSCRIBE));

        // (2) authoritative + REVOKED → false (durum APPROVED değil)
        Chain revoked = new Chain()
                .add(id(1), REF_A, Capability.TRANSCRIBE,
                        ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED, TransitionReason.INITIAL_APPROVAL)
                .add(id(2), REF_A, Capability.TRANSCRIBE,
                        ApprovalStatus.APPROVED, ApprovalStatus.REVOKED, TransitionReason.REVOKED_BY_OWNER);
        ProjectionOutcome r = ModelGovernanceStatusProjection.project(revoked.rows);
        assertTrue(r.isAuthoritative(REF_A, Capability.TRANSCRIBE), "temiz zincir → authoritative");
        assertEquals(ApprovalStatus.REVOKED, r.currentStatusOf(REF_A, Capability.TRANSCRIBE));
        assertFalse(r.isAuthoritativelyApproved(REF_A, Capability.TRANSCRIBE), "authoritative ama REVOKED");

        // (3) tainted + APPROVED → false (duplicate id → her iki özne tainted; durum APPROVED ama otoriter değil)
        Chain tainted = new Chain()
                .add(id(1), REF_A, Capability.TRANSCRIBE,
                        ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED, TransitionReason.INITIAL_APPROVAL)
                .add(id(1), REF_B, Capability.CITE,
                        ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED, TransitionReason.INITIAL_APPROVAL);
        ProjectionOutcome t = ModelGovernanceStatusProjection.project(tainted.rows);
        assertEquals(ApprovalStatus.APPROVED, t.currentStatusOf(REF_A, Capability.TRANSCRIBE));
        assertFalse(t.isAuthoritative(REF_A, Capability.TRANSCRIBE));
        assertFalse(t.isAuthoritativelyApproved(REF_A, Capability.TRANSCRIBE), "tainted ama APPROVED");

        // null argüman → false (fail-closed; isAuthoritative'ten türer)
        assertFalse(a.isAuthoritativelyApproved(null, Capability.TRANSCRIBE));
        assertFalse(a.isAuthoritativelyApproved(REF_A, null));
    }
}
