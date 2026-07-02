package com.ats.ops;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.util.Map;
import org.junit.jupiter.api.Test;

class OperationalEventTest {

    private static final TenantId T1 = new TenantId("t1");

    private static Outcome<OperationalEvent> appendSucceeded(PiiClass pii, Map<String, String> extras) {
        return OperationalEvent.create(T1, "evidence.append.succeeded", "evidence", "info", pii, extras);
    }

    @Test
    void registry_conformant_envelope_accepted() {
        assertTrue(appendSucceeded(PiiClass.ID_ONLY, Map.of("ledger_entry_ref", "ev-1")).isOk());
        assertTrue(OperationalEvent.create(T1, "evidence.recording.blocked_no_consent", "evidence", "warning",
                        PiiClass.ID_ONLY, Map.of("reason_code", "consent_record_missing")).isOk());
    }

    @Test
    void citation_rejected_spec_accepted_and_mismatch_fail_closed() {
        // taxonomy Â§2: ai_pipeline.citation.rejected = ai_pipeline / warning / id-only / reason_code
        assertTrue(OperationalEvent.create(T1, "ai_pipeline.citation.rejected", "ai_pipeline", "warning",
                PiiClass.ID_ONLY, Map.of("reason_code", "fabricated_ref")).isOk());
        assertFalse(OperationalEvent.create(T1, "ai_pipeline.citation.rejected", "ai_pipeline", "error",
                PiiClass.ID_ONLY, Map.of("reason_code", "fabricated_ref")).isOk(), "yanlÄ±Å severity reddedilmeli");
        assertFalse(OperationalEvent.create(T1, "ai_pipeline.citation.rejected", "ai_pipeline", "warning",
                PiiClass.ID_ONLY, Map.of()).isOk(), "reason_code zorunlu");
    }

    @Test
    void human_decision_finalized_spec_accepted_and_mismatch_fail_closed() {
        // taxonomy Â§2: evidence.human_decision.finalized = evidence / notice / id-only / actor_ref+ledger_entry_ref
        assertTrue(OperationalEvent.create(T1, "evidence.human_decision.finalized", "evidence", "notice",
                PiiClass.ID_ONLY, Map.of("actor_ref", "actor-1", "ledger_entry_ref", "ev-1")).isOk());
        assertFalse(OperationalEvent.create(T1, "evidence.human_decision.finalized", "evidence", "info",
                PiiClass.ID_ONLY, Map.of("actor_ref", "actor-1", "ledger_entry_ref", "ev-1")).isOk(),
                "yanlÄ±Å severity reddedilmeli");
        assertFalse(OperationalEvent.create(T1, "evidence.human_decision.finalized", "evidence", "notice",
                PiiClass.ID_ONLY, Map.of("actor_ref", "actor-1")).isOk(), "ledger_entry_ref zorunlu (two-plane pointer)");
    }

    @Test
    void audit_export_generated_spec_accepted_and_mismatch_fail_closed() {
        // taxonomy §2: security.audit_export.generated = security / notice / id-only / actor_ref
        assertTrue(OperationalEvent.create(T1, "security.audit_export.generated", "security", "notice",
                PiiClass.ID_ONLY, Map.of("actor_ref", "actor-1")).isOk());
        assertFalse(OperationalEvent.create(T1, "security.audit_export.generated", "security", "warning",
                PiiClass.ID_ONLY, Map.of("actor_ref", "actor-1")).isOk(), "yanlış severity reddedilmeli");
        assertFalse(OperationalEvent.create(T1, "security.audit_export.generated", "security", "notice",
                PiiClass.ID_ONLY, Map.of()).isOk(), "actor_ref zorunlu");
    }

    @Test
    void unknown_event_type_fail_closed() {
        Outcome<OperationalEvent> out = OperationalEvent.create(
                T1, "evidence.made.up_event", "evidence", "info", PiiClass.NONE, Map.of());
        assertFalse(out.isOk(), "registry-dÄ±ÅÄ± event Ã¼retilememeli (fail-closed)");
        assertEquals(OutcomeCode.INVALID, ((Outcome.Fail<OperationalEvent>) out).code());
    }

    @Test
    void spec_mismatch_rejected() {
        // yanlÄ±Å severity
        assertFalse(OperationalEvent.create(T1, "evidence.append.succeeded", "evidence", "critical",
                PiiClass.ID_ONLY, Map.of("ledger_entry_ref", "ev-1")).isOk());
        // yanlÄ±Å pii_class (taxonomy id-only der)
        assertFalse(appendSucceeded(PiiClass.PSEUDONYMIZED, Map.of("ledger_entry_ref", "ev-1")).isOk());
        // yanlÄ±Å category
        assertFalse(OperationalEvent.create(T1, "evidence.append.succeeded", "auth", "info",
                PiiClass.ID_ONLY, Map.of("ledger_entry_ref", "ev-1")).isOk());
    }

    @Test
    void missing_required_extra_rejected() {
        assertFalse(appendSucceeded(PiiClass.ID_ONLY, Map.of()).isOk());
        assertFalse(appendSucceeded(PiiClass.ID_ONLY, Map.of("ledger_entry_ref", " ")).isOk());
    }

    @Test
    void forbidden_pii_classes_fail_closed() {
        for (PiiClass p : new PiiClass[] {PiiClass.RAW_PII, PiiClass.CONTENT, PiiClass.SECRET}) {
            assertFalse(appendSucceeded(p, Map.of("ledger_entry_ref", "ev-1")).isOk(), p + " loggable sayÄ±lmamalÄ±");
        }
    }

    @Test
    void tenant_required() {
        assertFalse(OperationalEvent.create(null, "evidence.append.succeeded", "evidence", "info",
                PiiClass.ID_ONLY, Map.of("ledger_entry_ref", "ev-1")).isOk());
        assertFalse(OperationalEvent.create(new TenantId(" "), "evidence.append.succeeded", "evidence", "info",
                PiiClass.ID_ONLY, Map.of("ledger_entry_ref", "ev-1")).isOk());
    }

    @Test
    void extras_are_immutable() {
        OperationalEvent e = appendSucceeded(PiiClass.ID_ONLY, Map.of("ledger_entry_ref", "ev-1"))
                .asOptional().orElseThrow();
        assertThrows(UnsupportedOperationException.class, () -> e.extras().put("x", "y"));
    }
}
