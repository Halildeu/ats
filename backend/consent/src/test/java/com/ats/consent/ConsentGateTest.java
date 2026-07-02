package com.ats.consent;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.consent.RecordingPermission.PermissionState;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import com.ats.ops.InMemoryEventSink;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class ConsentGateTest {

    private static final TenantId T1 = new TenantId("t1");
    private static final TenantId T2 = new TenantId("t2");
    private static final InterviewId I1 = new InterviewId("i1");

    private InMemoryConsentStore store;
    private InMemoryEventSink sink;
    private ConsentGate gate;

    @BeforeEach
    void setUp() {
        store = new InMemoryConsentStore();
        sink = new InMemoryEventSink();
        gate = new ConsentGate(store, sink);
    }

    @Test
    void deny_by_default_when_no_consent_record() {
        Outcome<Void> out = gate.requireRecordingAllowed(T1, I1);
        assertFalse(out.isOk());
        assertEquals(OutcomeCode.DENIED, ((Outcome.Fail<Void>) out).code());
        assertEquals(1, sink.emitted().size());
        assertEquals(ConsentGate.BLOCKED_EVENT, sink.emitted().get(0).eventTypeId());
        assertEquals("consent_record_missing", sink.emitted().get(0).extras().get("reason_code"));
    }

    @Test
    void withdrawn_consent_denies() {
        store.put(new RecordingPermission(T1, I1, "subj-opaque-1", PermissionState.WITHDRAWN, "2026-07-02T00:00:00Z"));
        Outcome<Void> out = gate.requireRecordingAllowed(T1, I1);
        assertFalse(out.isOk());
        assertEquals("consent_state_withdrawn", sink.emitted().get(0).extras().get("reason_code"));
    }

    @Test
    void granted_consent_allows_without_events() {
        store.put(new RecordingPermission(T1, I1, "subj-opaque-1", PermissionState.GRANTED, "2026-07-02T00:00:00Z"));
        assertTrue(gate.requireRecordingAllowed(T1, I1).isOk());
        assertTrue(sink.emitted().isEmpty());
    }

    @Test
    void grant_in_one_tenant_does_not_leak_to_another() {
        store.put(new RecordingPermission(T1, I1, "subj-opaque-1", PermissionState.GRANTED, "2026-07-02T00:00:00Z"));
        Outcome<Void> out = gate.requireRecordingAllowed(T2, I1);
        assertFalse(out.isOk(), "tenant-scope: T1 izni T2'ye sızamaz");
    }

    @Test
    void store_rejects_incomplete_permission() {
        assertFalse(store.put(new RecordingPermission(T1, I1, "subj", null, "2026-07-02T00:00:00Z")).isOk());
        assertFalse(store.put(new RecordingPermission(T1, I1, null, PermissionState.GRANTED, "2026-07-02T00:00:00Z")).isOk());
    }

    @Test
    void malformed_null_state_record_denies_instead_of_throwing() {
        // store validasyonunu bypass eden bozuk kaynak senaryosu (Codex #48 major-4)
        ConsentStore malformed = new ConsentStore() {
            @Override
            public Outcome<Void> put(RecordingPermission p) {
                return Outcome.ok(null);
            }

            @Override
            public Outcome<RecordingPermission> find(TenantId t, InterviewId i) {
                return Outcome.ok(new RecordingPermission(t, i, "subj", null, "2026-07-02T00:00:00Z"));
            }
        };
        ConsentGate malformedGate = new ConsentGate(malformed, sink);
        Outcome<Void> out = malformedGate.requireRecordingAllowed(T1, I1);
        assertFalse(out.isOk());
        assertEquals("consent_state_invalid", sink.emitted().get(0).extras().get("reason_code"));
    }
}
