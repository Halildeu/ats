package com.ats.consent;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.consent.RecordingPermission.PermissionState;
import com.ats.contracts.EvidenceLedger;
import com.ats.contracts.EvidenceLedger.LedgerListFilter;
import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.EvidenceId;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import com.ats.ops.InMemoryEventSink;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Yön-asimetrik fail-closed sözleşme (Codex #64 blocker-2):
 * GRANTED = WORM-önce (kanıtsız permissive state İMKÂNSIZ);
 * DENIED/WITHDRAWN = state-önce (koruyucu etki ledger'ı beklemez).
 */
class ConsentServiceTest {

    private static final TenantId T = new TenantId("cs-t");
    private static final InterviewId IV = new InterviewId("cs-iv");
    private static final ActorId REC = new ActorId("recorder-1");

    static final class RecordingLedger implements EvidenceLedger {
        final List<EvidenceEvent> appended = new ArrayList<>();
        boolean failNext;

        @Override
        public Outcome<LedgerEntry> append(EvidenceEvent e) {
            if (failNext) {
                return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "test: ledger kapalı");
            }
            appended.add(e);
            return Outcome.ok(new LedgerEntry(e.tenantId(), e.actorId(), e.interviewId(), e.eventType(),
                    e.occurredAt(), e.idempotencyKey(), e.contentHash(), e.payload(),
                    new EvidenceId("ev-test"), appended.size(), "prev", "hash"));
        }

        @Override
        public Outcome<LedgerEntry> appendTombstoneEvent(TenantId tenantId,
                com.ats.kernel.Ids.ActorId actorId, InterviewId interviewId,
                EvidenceId targetEvidenceId, String reason) {
            return Outcome.fail(OutcomeCode.UNSUPPORTED_IN_GATE, "test fixture: tombstone yok");
        }

        @Override
        public Outcome<LedgerEntry> getById(TenantId tenantId, EvidenceId id) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "test fixture");
        }

        @Override
        public Outcome<java.util.List<LedgerEntry>> list(TenantId tenantId, LedgerListFilter filter) {
            return Outcome.ok(java.util.List.of());
        }
    }

    private static RecordingPermission perm(PermissionState st) {
        return new RecordingPermission(T, IV, "subj-opak-1", st, "2026-07-02T20:00:00Z");
    }

    @Test
    void granted_appends_worm_evidence_then_activates_state() {
        InMemoryConsentStore store = new InMemoryConsentStore();
        RecordingLedger ledger = new RecordingLedger();
        ConsentService svc = new ConsentService(store, ledger, new InMemoryEventSink());

        assertTrue(svc.record(perm(PermissionState.GRANTED), REC, "rk-1").isOk());
        assertEquals(1, ledger.appended.size());
        assertEquals("consent.recorded", ledger.appended.get(0).eventType());
        assertTrue(store.find(T, IV) instanceof Outcome.Ok<RecordingPermission> ok
                && ok.value().state() == PermissionState.GRANTED);
    }

    @Test
    void granted_with_ledger_down_does_NOT_activate_permission() {
        InMemoryConsentStore store = new InMemoryConsentStore();
        RecordingLedger ledger = new RecordingLedger();
        ledger.failNext = true;
        ConsentService svc = new ConsentService(store, ledger, new InMemoryEventSink());

        Outcome<Void> out = svc.record(perm(PermissionState.GRANTED), REC, "rk-1");
        assertInstanceOf(Outcome.Fail.class, out, "kanıtsız permissive state imkânsız");
        assertInstanceOf(Outcome.Fail.class, store.find(T, IV), "state yazılmamış olmalı");
    }

    @Test
    void withdrawn_applies_restrictive_state_even_if_ledger_down() {
        InMemoryConsentStore store = new InMemoryConsentStore();
        RecordingLedger ledger = new RecordingLedger();
        ledger.failNext = true;
        ConsentService svc = new ConsentService(store, ledger, new InMemoryEventSink());

        Outcome<Void> out = svc.record(perm(PermissionState.WITHDRAWN), REC, "rk-1");
        assertInstanceOf(Outcome.Fail.class, out, "kanıt eksik — hata dönmeli (retry)");
        assertTrue(store.find(T, IV) instanceof Outcome.Ok<RecordingPermission> ok
                && ok.value().state() == PermissionState.WITHDRAWN,
                "koruyucu etki ledger'ı BEKLEMEZ (geri-çekme derhal etkili)");
    }

    @Test
    void worm_payload_is_pointer_only_and_actor_is_recorder_not_subject() {
        InMemoryConsentStore store = new InMemoryConsentStore();
        RecordingLedger ledger = new RecordingLedger();
        ConsentService svc = new ConsentService(store, ledger, new InMemoryEventSink());

        assertTrue(svc.record(perm(PermissionState.DENIED), REC, "rk-1").isOk());
        EvidenceLedger.EvidenceEvent e = ledger.appended.get(0);
        assertEquals("consent:cs-t|cs-iv|rk-1", e.idempotencyKey(), "anahtar request-instance'a bağlı");
        assertEquals("recorder-1", e.actorId().value(), "aktör = kaydı işleyen (subject DEĞİL)");
        assertEquals(2, e.payload().values().size(), "yalnız subject_ref + state");
    }

    @Test
    void regrant_after_withdrawal_produces_new_worm_evidence() {
        // GRANTED → WITHDRAWN → GRANTED: üçüncü adım YENİ hukuki beyandır — yeni kanıt şart
        InMemoryConsentStore store = new InMemoryConsentStore();
        RecordingLedger ledger = new RecordingLedger();
        ConsentService svc = new ConsentService(store, ledger, new InMemoryEventSink());

        assertTrue(svc.record(perm(PermissionState.GRANTED), REC, "rk-g1").isOk());
        assertTrue(svc.record(perm(PermissionState.WITHDRAWN), REC, "rk-w1").isOk());
        assertTrue(svc.record(perm(PermissionState.GRANTED), REC, "rk-g2").isOk());

        long grantedEvents = ledger.appended.stream()
                .filter(e -> "GRANTED".equals(((com.ats.kernel.JsonValue.JsonString)
                        e.payload().values().get("state")).value()))
                .count();
        assertEquals(2, grantedEvents, "iki AYRI GRANTED beyanı = iki AYRI WORM kanıtı");
        assertEquals(3, ledger.appended.stream().map(EvidenceLedger.EvidenceEvent::idempotencyKey)
                .distinct().count(), "üç beyan üç farklı idempotency anahtarı");
    }

    @Test
    void blank_recorder_or_request_key_fails_closed() {
        ConsentService svc = new ConsentService(new InMemoryConsentStore(), new RecordingLedger(),
                new InMemoryEventSink());
        assertInstanceOf(Outcome.Fail.class, svc.record(perm(PermissionState.GRANTED), REC, " "));
        assertInstanceOf(Outcome.Fail.class,
                svc.record(perm(PermissionState.GRANTED), new ActorId(" "), "rk-1"));
    }

    @Test
    void invalid_fields_fail_closed() {
        ConsentService svc = new ConsentService(new InMemoryConsentStore(), new RecordingLedger(),
                new InMemoryEventSink());
        assertInstanceOf(Outcome.Fail.class,
                svc.record(new RecordingPermission(T, IV, " ", PermissionState.GRANTED, "2026-07-02T20:00:00Z"), REC, "rk-1"));
        assertInstanceOf(Outcome.Fail.class, svc.record(null, REC, "rk-1"));
    }
}
