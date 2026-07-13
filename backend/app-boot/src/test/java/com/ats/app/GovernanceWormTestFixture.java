package com.ats.app;

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
import com.ats.governance.InMemoryApprovedModelRegistry;
import com.ats.governance.InMemoryModelGovernanceLedger;
import com.ats.kernel.Outcome;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;

/**
 * gov1-1e-c app-boot test fixture (in-memory WORM): boot-gate testlerinin WORM-destekli
 * {@link ApprovedModelRegistry}'sini kurar. Her spec catalog'a eklenir + GLOBAL WORM'da hedef
 * {@link ApprovalStatus}'e ulaşan GEÇERLİ transition zinciri append edilir (status catalog'da DEĞİL,
 * WORM'dan gelir). model-governance test-jar'ına bağımlılık olmadan public main adapter'ları kullanır.
 */
final class GovernanceWormTestFixture {

    private static final GovernanceActorRef ACTOR = new GovernanceActorRef("test.governance-owner");

    private final InMemoryModelGovernanceLedger ledger =
            new InMemoryModelGovernanceLedger(Clock.fixed(Instant.parse("2026-07-13T10:00:00Z"), ZoneOffset.UTC));
    private final List<ApprovedModelSpec> catalog = new ArrayList<>();

    GovernanceWormTestFixture with(ApprovedModelSpec spec, ApprovalStatus target) {
        catalog.add(spec);
        seedTo(spec.approvalRef(), spec.capability(), target);
        return this;
    }

    GovernanceWormTestFixture withUninitialized(ApprovedModelSpec spec) {
        catalog.add(spec);
        return this;
    }

    ApprovedModelRegistry registry() {
        return InMemoryApprovedModelRegistry.of(catalog, ledger);
    }

    Outcome<ModelGovernanceTransition> append(ModelApprovalRef ref, Capability cap,
            ApprovalStatus from, ApprovalStatus to, TransitionReason reason) {
        return ledger.append(new ModelGovernanceLedger.AppendCommand(
                ref, cap, from, to, ACTOR, reason, TransitionId.random()));
    }

    private void seedTo(ModelApprovalRef ref, Capability cap, ApprovalStatus target) {
        switch (target) {
            case UNINITIALIZED -> { /* transition yok */ }
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
