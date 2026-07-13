package com.ats.screening;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

/** Kapalı value-object'ler: opak ref biçimleri fail-closed; random-run kimliği v4 biçimli. */
class ScreeningValueObjectsTest {

    @Test
    void policyRef_format_is_fail_closed() {
        assertTrue(ScreeningPolicyRef.isValid("paspolicy_v1"));
        assertTrue(ScreeningPolicyRef.isValid("paspolicy_v42"));
        assertFalse(ScreeningPolicyRef.isValid("paspolicy_1"));
        assertFalse(ScreeningPolicyRef.isValid("v1"));
        assertFalse(ScreeningPolicyRef.isValid(null));
        assertThrows(IllegalArgumentException.class, () -> new ScreeningPolicyRef("bad-ref"));
    }

    @Test
    void runId_random_is_v4_and_unique() {
        ScreeningRunId a = ScreeningRunId.random();
        ScreeningRunId b = ScreeningRunId.random();
        assertTrue(ScreeningRunId.isValid(a.value()));
        assertTrue(a.value().startsWith("psr_"));
        assertNotEquals(a, b);
        assertFalse(ScreeningRunId.isValid("psr_not-a-uuid"));
        assertThrows(IllegalArgumentException.class, () -> new ScreeningRunId("psr_bad"));
    }

    @Test
    void findingSetRef_is_content_addressed_and_deterministic() {
        FindingSetRef a = FindingSetRef.ofCanonical("AGE|PROTECTED_ATTRIBUTE_MENTION|FREE_TEXT|0|3|null;");
        FindingSetRef a2 = FindingSetRef.ofCanonical("AGE|PROTECTED_ATTRIBUTE_MENTION|FREE_TEXT|0|3|null;");
        FindingSetRef b = FindingSetRef.ofCanonical("");
        assertEquals(a, a2); // aynı içerik → aynı ref
        assertNotEquals(a, b);
        assertTrue(a.value().matches("fsr_[0-9a-f]{64}"));
        assertThrows(IllegalArgumentException.class, () -> new FindingSetRef("fsr_short"));
    }

    @Test
    void textSpan_rejects_empty_or_negative() {
        assertThrows(IllegalArgumentException.class, () -> new TextSpan(-1, 3, null));
        assertThrows(IllegalArgumentException.class, () -> new TextSpan(5, 5, null));
        assertThrows(IllegalArgumentException.class, () -> new TextSpan(5, 4, null));
        assertThrows(IllegalArgumentException.class, () -> new TextSpan(0, 3, -1));
        assertEquals(2, TextSpan.of(0, 2).endExclusive());
    }
}
