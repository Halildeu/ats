package com.ats.screening;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import java.lang.reflect.RecordComponent;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

/**
 * YAPISAL GARANTİLER (6-ay-sonra makine-uygulanır): kapalı-vokabüler enum kümeleri ve
 * bulgu/sonuç kayıtlarında YASAK alan-adlarının bulunmadığı reflection ile kanıtlanır. Biri
 * ileride {@code score}/{@code confidence}/{@code outcome} alanı veya {@code ILLEGAL_QUESTION}
 * sinyali eklerse bu test KIRMIZI olur.
 */
class StructuralGuaranteeTest {

    /** Aday-karar/derecelendirme sızıntısı yapan alan-adı token'ları (record alanlarında YASAK). */
    private static final List<String> FORBIDDEN_FIELD_TOKENS = List.of(
            "score", "confidence", "severity", "weight", "rank", "rating",
            "recommend", "outcome", "hire", "reject", "aggregat", "numeric", "affect", "sentiment");

    @Test
    void screening_signal_is_exactly_two_mention_values_no_verdict() {
        assertEquals(
                Set.of("PROTECTED_ATTRIBUTE_MENTION", "QUESTION_LIKE_PROTECTED_MENTION"),
                names(ScreeningSignal.values()));
        // hüküm-sinyalleri yasak
        Set<String> n = names(ScreeningSignal.values());
        assertFalse(n.contains("ILLEGAL_QUESTION"));
        assertFalse(n.contains("DISCRIMINATION"));
        assertFalse(n.contains("CANDIDATE_ATTRIBUTE_CONFIRMED"));
    }

    @Test
    void coverage_is_exactly_the_four_closed_states() {
        assertEquals(
                Set.of("SUPPORTED", "UNSUPPORTED_LANGUAGE", "MALFORMED_INPUT", "POLICY_UNAVAILABLE"),
                names(Coverage.values()));
    }

    @Test
    void protected_category_is_the_closed_kvkk_axis_set() {
        assertEquals(13, ProtectedCategory.values().length);
        assertEquals(Set.of(
                "AGE", "RELIGION_BELIEF", "ETHNICITY_RACE", "TRADE_UNION", "HEALTH_DISABILITY",
                "SEX_GENDER_ORIENTATION", "MARITAL_PARENTAL_STATUS", "POLITICAL_OPINION",
                "PHILOSOPHICAL_BELIEF", "CRIMINAL_RECORD", "NATIVE_LANGUAGE_ACCENT",
                "ASSOCIATION_MEMBERSHIP", "PREGNANCY_MATERNITY"),
                names(ProtectedCategory.values()));
    }

    @Test
    void finding_and_result_records_carry_no_scoring_or_verdict_fields() {
        assertNoForbiddenComponents(ScreeningFinding.class);
        assertNoForbiddenComponents(ScreeningResult.class);
        assertNoForbiddenComponents(TextSpan.class);
    }

    private static void assertNoForbiddenComponents(Class<?> recordType) {
        RecordComponent[] comps = recordType.getRecordComponents();
        for (RecordComponent rc : comps) {
            String name = rc.getName().toLowerCase();
            for (String token : FORBIDDEN_FIELD_TOKENS) {
                assertFalse(name.contains(token),
                        () -> recordType.getSimpleName() + " YASAK alan-adı token'ı içeriyor: "
                                + rc.getName() + " (~" + token + ")");
            }
        }
    }

    private static Set<String> names(Enum<?>[] values) {
        return Arrays.stream(values).map(Enum::name).collect(Collectors.toSet());
    }
}
