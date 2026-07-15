package com.ats.screening;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import java.lang.reflect.RecordComponent;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

class ScreeningEvidenceContractTest {

    private static final String RUN = "psr_00000000-0000-4000-8000-000000000001";
    private static final String REF = "fsr_" + "1".repeat(64);

    @Test
    void disposition_is_derived_and_only_clear_permits_clean_assertion() {
        for (Coverage coverage : Coverage.values()) {
            ScreeningResult empty = result(coverage, List.of());
            ScreeningDisposition expected = coverage == Coverage.SUPPORTED
                    ? ScreeningDisposition.CLEAR : ScreeningDisposition.SCREENING_UNAVAILABLE;
            assertEquals(expected, ScreeningDisposition.from(empty));
            assertEquals(coverage == Coverage.SUPPORTED,
                    ScreeningDisposition.from(empty).permitsCleanScreeningAssertion());
        }

        ScreeningDisposition flagged = ScreeningDisposition.from(result(
                Coverage.SUPPORTED,
                List.of(new ScreeningFinding(
                        ProtectedCategory.AGE,
                        ScreeningSignal.QUESTION_LIKE_PROTECTED_MENTION,
                        ScreeningSourceKind.TRANSCRIPT_SEGMENT,
                        new TextSpan(3, 7, 2)))));
        assertEquals(ScreeningDisposition.REVIEW_REQUIRED, flagged);
        assertFalse(flagged.permitsCleanScreeningAssertion());
    }

    @Test
    void save_command_rejects_non_supported_findings_and_source_mismatch() {
        ScreeningFinding finding = new ScreeningFinding(
                ProtectedCategory.RELIGION_BELIEF,
                ScreeningSignal.PROTECTED_ATTRIBUTE_MENTION,
                ScreeningSourceKind.INTERVIEW_NOTE,
                TextSpan.of(1, 4));
        assertThrows(IllegalArgumentException.class, () -> command(result(
                Coverage.POLICY_UNAVAILABLE, List.of(finding)), ScreeningSourceKind.INTERVIEW_NOTE));
        assertThrows(IllegalArgumentException.class, () -> command(result(
                Coverage.SUPPORTED, List.of(finding)), ScreeningSourceKind.FREE_TEXT));
    }

    @Test
    void evidence_contract_has_no_raw_or_decision_fields() {
        Set<String> forbidden = Set.of(
                "text", "content", "matched", "normalized", "token", "hash", "score", "confidence",
                "rank", "rating", "recommend", "hire", "reject", "candidateoutcome");
        for (Class<?> type : List.of(
                ScreeningEvidenceStore.SaveCommand.class,
                ScreeningEvidenceStore.SaveReceipt.class,
                ScreeningEvidenceStore.StoredEvidence.class,
                ScreeningEvidenceStore.RequestBinding.class,
                ScreeningEvidenceStore.IdempotentSaveResult.class,
                ScreeningEvidenceStore.RequestReplay.class,
                ScreeningEvidenceStore.PurgeCommand.class,
                ScreeningEvidenceStore.PurgeReceipt.class)) {
            for (RecordComponent component : type.getRecordComponents()) {
                String name = component.getName().toLowerCase(Locale.ROOT).replace("_", "");
                for (String token : forbidden) {
                    assertFalse(name.contains(token), () -> type.getSimpleName()
                            + " yasak alan token'ı taşıyor: " + component.getName());
                }
            }
        }
    }

    @Test
    void request_binding_is_uuid_v4_only_and_runtime_source_union_is_closed() {
        String key = "scrq_00000000-0000-4000-8000-000000000001";
        assertEquals(ScreeningSourceKind.TRANSCRIPT_SEGMENT,
                new ScreeningEvidenceStore.RequestBinding(
                        key, ScreeningSourceKind.TRANSCRIPT_SEGMENT, "iv/tr-1", 0).sourceKind());
        assertEquals(ScreeningSourceKind.CITATION_CLAIM,
                new ScreeningEvidenceStore.RequestBinding(
                        key, ScreeningSourceKind.CITATION_CLAIM, "iv/cit-1", null).sourceKind());

        assertThrows(IllegalArgumentException.class, () -> new ScreeningEvidenceStore.RequestBinding(
                "candidate@example.com", ScreeningSourceKind.CITATION_CLAIM, "iv/cit-1", null));
        assertThrows(IllegalArgumentException.class, () -> new ScreeningEvidenceStore.RequestBinding(
                "scrq_00000000-0000-1000-8000-000000000001",
                ScreeningSourceKind.CITATION_CLAIM, "iv/cit-1", null));
        assertThrows(IllegalArgumentException.class, () -> new ScreeningEvidenceStore.RequestBinding(
                key, ScreeningSourceKind.TRANSCRIPT_SEGMENT, "iv/tr-1", null));
        assertThrows(IllegalArgumentException.class, () -> new ScreeningEvidenceStore.RequestBinding(
                key, ScreeningSourceKind.CITATION_CLAIM, "iv/cit-1", 0));
        assertThrows(IllegalArgumentException.class, () -> new ScreeningEvidenceStore.RequestBinding(
                key, ScreeningSourceKind.FREE_TEXT, "iv/free", null));
    }

    @Test
    void disposition_vocabulary_is_closed() {
        assertEquals(Set.of("CLEAR", "REVIEW_REQUIRED", "SCREENING_UNAVAILABLE"),
                Arrays.stream(ScreeningDisposition.values()).map(Enum::name).collect(Collectors.toSet()));
        assertTrue(Arrays.stream(ScreeningDisposition.values())
                .noneMatch(x -> x.name().contains("REJECT") || x.name().contains("HIRE")));
    }

    @Test
    void public_span_unit_is_kernel_owned_and_stable() {
        assertEquals("UTF16_CODE_UNIT", TextSpan.UNIT);
    }

    private static ScreeningEvidenceStore.SaveCommand command(
            ScreeningResult result, ScreeningSourceKind sourceKind) {
        return new ScreeningEvidenceStore.SaveCommand(
                new TenantId("tenant-a"), new ActorId("actor-a"), new InterviewId("interview-a"),
                result, sourceKind, "2026-07-15T08:00:00Z");
    }

    private static ScreeningResult result(Coverage coverage, List<ScreeningFinding> findings) {
        return new ScreeningResult(
                new ScreeningRunId(RUN),
                new ScreeningPolicyRef(coverage == Coverage.POLICY_UNAVAILABLE ? "paspolicy_v0" : "paspolicy_v1"),
                coverage,
                findings,
                new FindingSetRef(REF));
    }
}
