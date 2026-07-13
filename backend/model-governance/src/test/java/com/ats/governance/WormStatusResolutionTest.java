package com.ats.governance;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.contracts.governance.ApprovalStatus;
import com.ats.contracts.governance.ApprovedModelRegistry;
import com.ats.contracts.governance.ApprovedModelSpec;
import com.ats.contracts.governance.Capability;
import com.ats.contracts.governance.GovernanceActorRef;
import com.ats.contracts.governance.ModelApprovalRef;
import com.ats.contracts.governance.ModelGovernanceLedger;
import com.ats.contracts.governance.ModelGovernanceTransition;
import com.ats.contracts.governance.ModelGovernanceTransitionHashChain;
import com.ats.contracts.governance.ModelScope;
import com.ats.contracts.governance.TransitionId;
import com.ats.contracts.governance.TransitionReason;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * gov1-1e-c WORM status-çözümü taksonomisi (Codex 019f57cb — birebir): registry status'u TEK OTORİTE
 * WORM'dan çözer; her sapma tipli fail-closed OutcomeCode üretir. Ayrıca canlı-revoke görünürlüğü (cache
 * YOK kanıtı) ve catalog↔WORM bütünlük ihlalleri.
 */
class WormStatusResolutionTest {

    private static final GovernanceActorRef ACTOR = new GovernanceActorRef("test.owner");
    private static final String OCCURRED = "2026-07-13T10:00:00Z";
    private static final String GEN = ModelGovernanceTransitionHashChain.GENESIS_PREVIOUS_HASH;

    private static ApprovedModelSpec transcribe(String modelId) {
        return ApprovedModelSpec.of(Capability.TRANSCRIBE, "prov-a", modelId, "v1",
                Set.of(), Set.of(), "endpoint-a", "ip-1", ModelScope.GLOBAL);
    }

    private static OutcomeCode code(Outcome<?> o) {
        return ((Outcome.Fail<?>) o).code();
    }

    private static TransitionId id(int n) {
        return new TransitionId(String.format("mgt_00000000-0000-4000-8000-%012d", n));
    }

    /** Kendi-tutarlı (hash-doğru) transition. */
    private static ModelGovernanceTransition row(TransitionId id, ModelApprovalRef ref, Capability cap,
            ApprovalStatus from, ApprovalStatus to, TransitionReason reason, String previousHash, long sequence) {
        String eh = ModelGovernanceTransitionHashChain.entryHash(
                previousHash, id, ref, cap, from, to, ACTOR, OCCURRED, reason, sequence);
        return new ModelGovernanceTransition(id, ref, cap, from, to, ACTOR, OCCURRED, reason, previousHash, eh, sequence);
    }

    /** Verilen ham WORM satırlarını dönen registry (bütünlük/bozukluk senaryoları için). */
    private static ApprovedModelRegistry registryWith(
            List<ApprovedModelSpec> catalog, List<ModelGovernanceTransition> worm) {
        return InMemoryApprovedModelRegistry.of(catalog, () -> Outcome.ok(List.copyOf(worm)));
    }

    // ---- WORM okunamaz → NOT_CONFIGURED ----

    @Test
    void worm_read_fail_denies_not_configured() {
        ApprovedModelSpec spec = transcribe("m");
        ModelGovernanceLedger.Reader down = () -> Outcome.fail(OutcomeCode.NOT_CONFIGURED, "PG down");
        ApprovedModelRegistry registry = InMemoryApprovedModelRegistry.of(List.of(spec), down);
        assertEquals(OutcomeCode.NOT_CONFIGURED, code(registry.resolve(spec.approvalRef(), Capability.TRANSCRIBE)));
    }

    @Test
    void worm_ok_null_denies_not_configured() {
        ApprovedModelSpec spec = transcribe("m");
        ModelGovernanceLedger.Reader nullReader = () -> Outcome.ok(null);
        ApprovedModelRegistry registry = InMemoryApprovedModelRegistry.of(List.of(spec), nullReader);
        assertEquals(OutcomeCode.NOT_CONFIGURED, code(registry.resolve(spec.approvalRef(), Capability.TRANSCRIBE)));
    }

    // ---- GLOBAL zincir kusuru / tainted → NOT_CONFIGURED ----

    @Test
    void broken_hash_chain_denies_not_configured() {
        ApprovedModelSpec spec = transcribe("m");
        // genesis previousHash sentinel DEĞİL → chainIntact=false → hiçbir özne authoritative değil.
        ModelGovernanceTransition bad = row(id(1), spec.approvalRef(), Capability.TRANSCRIBE,
                ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED, TransitionReason.INITIAL_APPROVAL,
                "c".repeat(64), 0);
        ApprovedModelRegistry registry = registryWith(List.of(spec), List.of(bad));
        assertEquals(OutcomeCode.NOT_CONFIGURED, code(registry.resolve(spec.approvalRef(), Capability.TRANSCRIBE)));
    }

    @Test
    void tainted_subject_denies_not_configured() {
        ApprovedModelSpec spec = transcribe("m");
        // aynı transitionId iki kez (hash-zinciri doğru) → DUPLICATE_TRANSITION_ID → özne tainted.
        ModelGovernanceTransition t0 = row(id(1), spec.approvalRef(), Capability.TRANSCRIBE,
                ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED, TransitionReason.INITIAL_APPROVAL, GEN, 0);
        ModelGovernanceTransition t1 = row(id(1), spec.approvalRef(), Capability.TRANSCRIBE,
                ApprovalStatus.APPROVED, ApprovalStatus.REVOKED, TransitionReason.REVOKED_BY_OWNER, t0.entryHash(), 1);
        ApprovedModelRegistry registry = registryWith(List.of(spec), List.of(t0, t1));
        assertEquals(OutcomeCode.NOT_CONFIGURED, code(registry.resolve(spec.approvalRef(), Capability.TRANSCRIBE)));
    }

    // ---- catalog ↔ WORM bütünlük ihlalleri → NOT_CONFIGURED ----

    @Test
    void worm_ref_not_in_catalog_denies_not_configured() {
        ApprovedModelSpec inCatalog = transcribe("m-in");
        ApprovedModelSpec notInCatalog = transcribe("m-out"); // catalog'a EKLENMEZ ama WORM'da var
        ModelGovernanceTransition catalogRow = row(id(1), inCatalog.approvalRef(), Capability.TRANSCRIBE,
                ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED, TransitionReason.INITIAL_APPROVAL, GEN, 0);
        ModelGovernanceTransition strayRow = row(id(2), notInCatalog.approvalRef(), Capability.TRANSCRIBE,
                ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED, TransitionReason.INITIAL_APPROVAL,
                catalogRow.entryHash(), 1);
        // catalog SADECE inCatalog; WORM stray ref taşıyor → bütünlük ihlali → tüm resolve NOT_CONFIGURED.
        ApprovedModelRegistry registry = registryWith(List.of(inCatalog), List.of(catalogRow, strayRow));
        assertEquals(OutcomeCode.NOT_CONFIGURED, code(registry.resolve(inCatalog.approvalRef(), Capability.TRANSCRIBE)));
    }

    @Test
    void worm_capability_differs_from_catalog_denies_not_configured() {
        // catalog: ref X → TRANSCRIBE. WORM: aynı ref X ama capability=CITE (tampered/inconsistent).
        ApprovedModelSpec spec = transcribe("m"); // ref, TRANSCRIBE
        ModelGovernanceTransition mismatched = row(id(1), spec.approvalRef(), Capability.CITE,
                ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED, TransitionReason.INITIAL_APPROVAL, GEN, 0);
        ApprovedModelRegistry registry = registryWith(List.of(spec), List.of(mismatched));
        assertEquals(OutcomeCode.NOT_CONFIGURED, code(registry.resolve(spec.approvalRef(), Capability.TRANSCRIBE)));
    }

    // ---- canlı-revoke görünürlüğü (cache YOK kanıtı) ----

    @Test
    void live_revoke_is_visible_without_cache() {
        ApprovedModelSpec spec = transcribe("m");
        GovernanceWormFixture fx = new GovernanceWormFixture().with(spec, ApprovalStatus.APPROVED);
        ApprovedModelRegistry registry = fx.registry(); // AYNI instance boyunca yaşar

        // (1) başta APPROVED → Ok
        assertTrue(registry.resolve(spec.approvalRef(), Capability.TRANSCRIBE).isOk(),
                "başlangıç APPROVED → Ok");

        // (2) canlı REVOKE (admin-append) — registry yeniden kurulMADAN
        Outcome<ModelGovernanceTransition> revoke = fx.append(spec.approvalRef(), Capability.TRANSCRIBE,
                ApprovalStatus.APPROVED, ApprovalStatus.REVOKED, TransitionReason.REVOKED_BY_OWNER);
        assertTrue(revoke.isOk(), "revoke append Ok");

        // (3) AYNI registry instance'ı ile resolve → DENIED (WORM taze okunur; cache olsaydı Ok kalırdı)
        assertEquals(OutcomeCode.DENIED, code(registry.resolve(spec.approvalRef(), Capability.TRANSCRIBE)),
                "canlı revoke anında görünür (cache YOK) → DENIED");

        // (4) re-approve → tekrar Ok (yön: REVOKED→APPROVED yalnız REAPPROVED)
        assertTrue(fx.append(spec.approvalRef(), Capability.TRANSCRIBE,
                ApprovalStatus.REVOKED, ApprovalStatus.APPROVED, TransitionReason.REAPPROVED).isOk());
        assertTrue(registry.resolve(spec.approvalRef(), Capability.TRANSCRIBE).isOk(),
                "re-approve anında görünür → Ok");
    }

    @Test
    void multi_subject_worm_resolves_each_independently() {
        ApprovedModelSpec a = transcribe("m-a");
        ApprovedModelSpec b = transcribe("m-b");
        ApprovedModelSpec c = transcribe("m-c");
        ApprovedModelRegistry registry = new GovernanceWormFixture()
                .with(a, ApprovalStatus.APPROVED)
                .with(b, ApprovalStatus.REVOKED)
                .with(c, ApprovalStatus.DRAFT)
                .registry();
        assertTrue(registry.resolve(a.approvalRef(), Capability.TRANSCRIBE).isOk());
        assertEquals(OutcomeCode.DENIED, code(registry.resolve(b.approvalRef(), Capability.TRANSCRIBE)));
        assertEquals(OutcomeCode.DENIED, code(registry.resolve(c.approvalRef(), Capability.TRANSCRIBE)));
    }
}
