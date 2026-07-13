package com.ats.governance;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.contracts.governance.ApprovalStatus;
import com.ats.contracts.governance.Capability;
import com.ats.contracts.governance.GovernanceActorRef;
import com.ats.contracts.governance.ModelApprovalRef;
import com.ats.contracts.governance.ModelGovernanceLedger;
import com.ats.contracts.governance.ModelGovernanceLedger.AppendCommand;
import com.ats.contracts.governance.ModelGovernanceLedger.AppendRejection;
import com.ats.contracts.governance.ModelGovernanceTransition;
import com.ats.contracts.governance.ModelGovernanceTransitionHashChain;
import com.ats.contracts.governance.TransitionId;
import com.ats.contracts.governance.TransitionReason;
import com.ats.governance.ModelGovernanceStatusProjection.ProjectionOutcome;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * gov1-1e in-memory adapter KANITI ({@link InMemoryModelGovernanceLedger}): tam yaşam-döngüsü zinciri
 * (UNINITIALIZED→APPROVED→REVOKED→APPROVED) + stale {@code expectedFrom} → conflict + özdeş-replay →
 * idempotent + çakışan-replay → conflict + illegal-transition → red + null-komut → red. Ayrıca
 * adapter-yazımı projeksiyon-doğrulamasından TEMİZ geçer (WRITE-hash == READ-recompute; single-source).
 */
class InMemoryModelGovernanceLedgerTest {

    private static final ModelApprovalRef REF = new ModelApprovalRef("mapr_" + "a".repeat(64));
    private static final Capability CAP = Capability.TRANSCRIBE;
    private static final GovernanceActorRef ACTOR = new GovernanceActorRef("admin.owner-1");
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-07-13T10:00:00Z"), ZoneOffset.UTC);

    private static TransitionId id(int n) {
        return new TransitionId(String.format("mgt_00000000-0000-4000-8000-%012d", n));
    }

    private static AppendCommand cmd(
            TransitionId id, ApprovalStatus from, ApprovalStatus to, TransitionReason reason) {
        return new AppendCommand(REF, CAP, from, to, ACTOR, reason, id);
    }

    private static ModelGovernanceTransition ok(Outcome<ModelGovernanceTransition> o) {
        assertInstanceOf(Outcome.Ok.class, o);
        return ((Outcome.Ok<ModelGovernanceTransition>) o).value();
    }

    private static Outcome.Fail<ModelGovernanceTransition> fail(Outcome<ModelGovernanceTransition> o) {
        assertInstanceOf(Outcome.Fail.class, o);
        return (Outcome.Fail<ModelGovernanceTransition>) o;
    }

    /** readAll() Outcome-sarmalını açar: Ok bekler (in-memory okuma her zaman erişilebilir). */
    private static List<ModelGovernanceTransition> okList(Outcome<List<ModelGovernanceTransition>> o) {
        assertInstanceOf(Outcome.Ok.class, o);
        return ((Outcome.Ok<List<ModelGovernanceTransition>>) o).value();
    }

    @Test
    void full_lifecycle_chain_and_projection_is_clean() {
        InMemoryModelGovernanceLedger ledger = new InMemoryModelGovernanceLedger(CLOCK);

        ModelGovernanceTransition t0 = ok(ledger.append(
                cmd(id(1), ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED, TransitionReason.INITIAL_APPROVAL)));
        ModelGovernanceTransition t1 = ok(ledger.append(
                cmd(id(2), ApprovalStatus.APPROVED, ApprovalStatus.REVOKED, TransitionReason.REVOKED_BY_OWNER)));
        ModelGovernanceTransition t2 = ok(ledger.append(
                cmd(id(3), ApprovalStatus.REVOKED, ApprovalStatus.APPROVED, TransitionReason.REAPPROVED)));

        // sequence GLOBAL monoton, boşluksuz
        assertEquals(0L, t0.sequence());
        assertEquals(1L, t1.sequence());
        assertEquals(2L, t2.sequence());
        // hash-zinciri: genesis → t0 → t1 → t2
        assertEquals(ModelGovernanceTransitionHashChain.GENESIS_PREVIOUS_HASH, t0.previousHash());
        assertEquals(t0.entryHash(), t1.previousHash());
        assertEquals(t1.entryHash(), t2.previousHash());
        // fromStatus adapter tarafından gerçek-cari-durumdan yazıldı
        assertEquals(ApprovalStatus.UNINITIALIZED, t0.fromStatus());
        assertEquals(ApprovalStatus.APPROVED, t1.fromStatus());
        assertEquals(ApprovalStatus.REVOKED, t2.fromStatus());
        // occurredAt injected Clock'tan
        assertEquals("2026-07-13T10:00:00Z", t0.occurredAt());

        List<ModelGovernanceTransition> all = okList(ledger.readAll());
        assertEquals(3, all.size());

        // adapter-yazımı → projeksiyon TEMİZ (WRITE-hash == READ-recompute; single-source kanıtı)
        ProjectionOutcome out = ModelGovernanceStatusProjection.project(all);
        assertTrue(out.issues().isEmpty(), "adapter zinciri projeksiyonda temiz olmalı");
        assertTrue(out.chainIntact());
        assertEquals(ApprovalStatus.APPROVED, out.currentStatusOf(REF, CAP));
        assertTrue(out.isAuthoritative(REF, CAP));
    }

    @Test
    void unavailable_reader_fail_is_distinguishable_from_legit_empty_worm() {
        // Legit boş WORM: hiç append yok → Ok(emptyList) → projeksiyon UNINITIALIZED + authoritative
        // ("okundu ve gerçekten boş"). Fail ile KARIŞMAZ.
        InMemoryModelGovernanceLedger empty = new InMemoryModelGovernanceLedger(CLOCK);
        List<ModelGovernanceTransition> legitRows = okList(empty.readAll());
        assertTrue(legitRows.isEmpty(), "hiç append yok → gerçekten boş liste");
        ProjectionOutcome projected = ModelGovernanceStatusProjection.project(legitRows);
        assertEquals(ApprovalStatus.UNINITIALIZED, projected.currentStatusOf(REF, CAP));
        assertTrue(projected.isAuthoritative(REF, CAP), "legit boş WORM → UNINITIALIZED authoritative");

        // Erişilemez okuma (1e-b PG down / unchecked yerine): Reader Fail döner → tüketici projeksiyon
        // YAPMAZ, fail-closed davranır (NOT_CONFIGURED). Ok(emptyList) ile ASLA karışmaz.
        ModelGovernanceLedger.Reader unavailable =
                () -> Outcome.fail(OutcomeCode.NOT_CONFIGURED, "WORM_UNAVAILABLE");
        Outcome<List<ModelGovernanceTransition>> down = unavailable.readAll();
        assertInstanceOf(Outcome.Fail.class, down);
        Outcome.Fail<List<ModelGovernanceTransition>> f =
                (Outcome.Fail<List<ModelGovernanceTransition>>) down;
        assertEquals(OutcomeCode.NOT_CONFIGURED, f.code(), "okuma erişilemez → NOT_CONFIGURED (boş-liste DEĞİL)");
        assertFalse(down.isOk(), "Fail → tüketici APPROVED türetemez (fail-closed)");
    }

    @Test
    void stale_expected_from_is_conflict() {
        InMemoryModelGovernanceLedger ledger = new InMemoryModelGovernanceLedger(CLOCK);
        ok(ledger.append(cmd(id(1), ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED, TransitionReason.INITIAL_APPROVAL)));
        // cari APPROVED; expectedFrom=UNINITIALIZED stale → conflict (farklı id, idempotency değil)
        Outcome.Fail<ModelGovernanceTransition> f = fail(ledger.append(
                cmd(id(2), ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED, TransitionReason.INITIAL_APPROVAL)));
        assertEquals(AppendRejection.STALE_EXPECTED_FROM.name(), f.reason());
        assertEquals(OutcomeCode.INVALID, f.code());
        assertEquals(1, okList(ledger.readAll()).size(), "red → yazım YOK");
    }

    @Test
    void identical_replay_is_idempotent_no_double_write() {
        InMemoryModelGovernanceLedger ledger = new InMemoryModelGovernanceLedger(CLOCK);
        AppendCommand c = cmd(id(1), ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED, TransitionReason.INITIAL_APPROVAL);
        ModelGovernanceTransition first = ok(ledger.append(c));
        // aynı transitionId + byte-özdeş içerik → idempotent-OK, MEVCUT satır döner
        ModelGovernanceTransition replay = ok(ledger.append(c));
        assertSame(first, replay, "replay mevcut satırı döner (çift yazım YOK)");
        assertEquals(1, okList(ledger.readAll()).size());
    }

    @Test
    void conflicting_replay_same_id_different_content_is_conflict() {
        InMemoryModelGovernanceLedger ledger = new InMemoryModelGovernanceLedger(CLOCK);
        ok(ledger.append(cmd(id(1), ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED, TransitionReason.INITIAL_APPROVAL)));
        // aynı id(1) ama farklı içerik (DRAFT/DRAFTED) → TRANSITION_ID_CONFLICT
        Outcome.Fail<ModelGovernanceTransition> f = fail(ledger.append(
                cmd(id(1), ApprovalStatus.UNINITIALIZED, ApprovalStatus.DRAFT, TransitionReason.DRAFTED)));
        assertEquals(AppendRejection.TRANSITION_ID_CONFLICT.name(), f.reason());
        assertEquals(OutcomeCode.INVALID, f.code());
        assertEquals(1, okList(ledger.readAll()).size());
    }

    @Test
    void illegal_transition_is_rejected_without_write() {
        InMemoryModelGovernanceLedger ledger = new InMemoryModelGovernanceLedger(CLOCK);
        // UNINITIALIZED→REVOKED matriste YOK → ILLEGAL_TRANSITION (CAS geçer, matris reddeder)
        Outcome.Fail<ModelGovernanceTransition> f = fail(ledger.append(
                cmd(id(1), ApprovalStatus.UNINITIALIZED, ApprovalStatus.REVOKED, TransitionReason.REVOKED_BY_OWNER)));
        assertEquals(AppendRejection.ILLEGAL_TRANSITION.name(), f.reason());
        assertEquals(OutcomeCode.INVALID, f.code());
        assertTrue(okList(ledger.readAll()).isEmpty(), "red → yazım YOK");
    }

    @Test
    void null_command_is_rejected() {
        InMemoryModelGovernanceLedger ledger = new InMemoryModelGovernanceLedger(CLOCK);
        Outcome.Fail<ModelGovernanceTransition> f = fail(ledger.append(null));
        assertEquals(AppendRejection.INVALID_COMMAND.name(), f.reason());
        assertEquals(OutcomeCode.INVALID, f.code());
    }

    @Test
    void constructor_requires_clock() {
        assertThrows(IllegalArgumentException.class, () -> new InMemoryModelGovernanceLedger(null));
    }
}
