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

    @Test
    void loggable_pii_classes_accepted() {
        for (PiiClass p : new PiiClass[] {PiiClass.NONE, PiiClass.ID_ONLY, PiiClass.PSEUDONYMIZED}) {
            assertTrue(OperationalEvent.create(T1, "evidence.append.succeeded", "evidence", "info", p, Map.of()).isOk());
        }
    }

    @Test
    void forbidden_pii_classes_fail_closed() {
        for (PiiClass p : new PiiClass[] {PiiClass.RAW_PII, PiiClass.CONTENT, PiiClass.SECRET}) {
            Outcome<OperationalEvent> out =
                    OperationalEvent.create(T1, "evidence.append.succeeded", "evidence", "info", p, Map.of());
            assertFalse(out.isOk(), p + " loggable sayılmamalı");
            assertEquals(OutcomeCode.INVALID, ((Outcome.Fail<OperationalEvent>) out).code());
        }
    }

    @Test
    void invalid_event_type_id_rejected() {
        assertFalse(OperationalEvent.create(T1, "NotATaxonomyId", "x", "info", PiiClass.NONE, Map.of()).isOk());
        assertFalse(OperationalEvent.create(T1, "tek_seviye", "x", "info", PiiClass.NONE, Map.of()).isOk());
    }

    @Test
    void tenant_required() {
        assertFalse(OperationalEvent.create(null, "a.b", "x", "info", PiiClass.NONE, Map.of()).isOk());
        assertFalse(OperationalEvent.create(new TenantId(" "), "a.b", "x", "info", PiiClass.NONE, Map.of()).isOk());
    }

    @Test
    void extras_are_immutable() {
        OperationalEvent e = OperationalEvent.create(
                        T1, "evidence.append.succeeded", "evidence", "info", PiiClass.ID_ONLY,
                        Map.of("ledger_entry_ref", "ev-1"))
                .asOptional().orElseThrow();
        assertThrows(UnsupportedOperationException.class, () -> e.extras().put("x", "y"));
    }
}
