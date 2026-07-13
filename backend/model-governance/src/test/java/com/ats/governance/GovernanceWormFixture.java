package com.ats.governance;

import com.ats.contracts.governance.ApprovalStatus;
import com.ats.contracts.governance.ApprovedModelRegistry;
import com.ats.contracts.governance.ApprovedModelSpec;
import com.ats.contracts.governance.Capability;
import com.ats.contracts.governance.GovernanceActorRef;
import com.ats.contracts.governance.ModelApprovalRef;
import com.ats.contracts.governance.ModelGovernanceLedger;
import com.ats.contracts.governance.ModelGovernanceTransition;
import com.ats.contracts.governance.TransitionId;
import com.ats.contracts.governance.TransitionReason;
import com.ats.kernel.Outcome;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;

/**
 * gov1-1e-c test fixture: WORM-destekli {@link InMemoryApprovedModelRegistry} kurar. Her spec catalog'a
 * eklenir + GLOBAL WORM'da (InMemory ledger) hedef {@link ApprovalStatus}'e ulaşan GEÇERLİ transition
 * zinciri append edilir — böylece cutover-sonrası "status catalog'dan DEĞİL WORM'dan gelir" gerçek
 * transition-projeksiyonuyla kurulur (sahte status-alanı YOK). Canlı-revoke için {@link #append} açık.
 */
final class GovernanceWormFixture {

    private static final GovernanceActorRef ACTOR = new GovernanceActorRef("test.governance-owner");

    private final InMemoryModelGovernanceLedger ledger =
            new InMemoryModelGovernanceLedger(Clock.fixed(Instant.parse("2026-07-13T10:00:00Z"), ZoneOffset.UTC));
    private final List<ApprovedModelSpec> catalog = new ArrayList<>();

    /** Spec'i catalog'a ekler + WORM'da hedef status'e GEÇERLİ zincirle ilerletir (her spec bir kez). */
    GovernanceWormFixture with(ApprovedModelSpec spec, ApprovalStatus target) {
        catalog.add(spec);
        seedTo(spec.approvalRef(), spec.capability(), target);
        return this;
    }

    /** Yalnız catalog'a ekler; WORM'da HİÇ transition yazmaz (özne UNINITIALIZED kalır → resolve DENIED). */
    GovernanceWormFixture withUninitialized(ApprovedModelSpec spec) {
        catalog.add(spec);
        return this;
    }

    InMemoryModelGovernanceLedger ledger() {
        return ledger;
    }

    List<ApprovedModelSpec> catalog() {
        return List.copyOf(catalog);
    }

    /** Bu fixture'ın canlı WORM'una bağlı tam registry (resolve WORM'dan TAZE status çözer). */
    ApprovedModelRegistry registry() {
        return InMemoryApprovedModelRegistry.of(catalog, ledger);
    }

    /** Aynı canlı WORM'a bağlı dosya-destekli registry (strict-parser yolunu da test etmek için). */
    FileBackedApprovedModelRegistry fileBacked(String json) {
        return FileBackedApprovedModelRegistry.fromJson(json, ledger);
    }

    /** Doğrudan transition append (canlı-revoke/re-approve/özel senaryolar). CAS/matris ledger'da zorlanır. */
    Outcome<ModelGovernanceTransition> append(ModelApprovalRef ref, Capability cap,
            ApprovalStatus from, ApprovalStatus to, TransitionReason reason) {
        return ledger.append(new ModelGovernanceLedger.AppendCommand(
                ref, cap, from, to, ACTOR, reason, TransitionId.random()));
    }

    private void seedTo(ModelApprovalRef ref, Capability cap, ApprovalStatus target) {
        switch (target) {
            case UNINITIALIZED -> { /* transition yok — genesis UNINITIALIZED */ }
            case APPROVED -> approve(ref, cap);
            case DRAFT -> mustOk(append(ref, cap,
                    ApprovalStatus.UNINITIALIZED, ApprovalStatus.DRAFT, TransitionReason.DRAFTED));
            case REVOKED -> {
                approve(ref, cap);
                mustOk(append(ref, cap,
                        ApprovalStatus.APPROVED, ApprovalStatus.REVOKED, TransitionReason.REVOKED_BY_OWNER));
            }
        }
    }

    private void approve(ModelApprovalRef ref, Capability cap) {
        mustOk(append(ref, cap,
                ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED, TransitionReason.INITIAL_APPROVAL));
    }

    private static void mustOk(Outcome<ModelGovernanceTransition> out) {
        if (!(out instanceof Outcome.Ok)) {
            throw new IllegalStateException("fixture WORM seed append başarısız (fail-closed): " + out);
        }
    }
}
