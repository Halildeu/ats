package com.ats.dsr;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import java.util.List;
import org.junit.jupiter.api.Test;

class DsarInputPolicyTest {

    @Test
    void subject_ref_accepts_only_prefixed_opaque_ref_or_uuid_v4() {
        assertTrue(DsarInputPolicy.validSubjectRef("550e8400-e29b-41d4-a716-446655440000"));
        assertTrue(DsarInputPolicy.validSubjectRef("subj-550e8400-e29b-41d4-a716-446655440000"));
        assertTrue(DsarInputPolicy.validSubjectRef("subject:550e8400-e29b-41d4-a716-446655440000"));
        assertTrue(DsarInputPolicy.validSubjectRef("subject_550e8400-e29b-41d4-8716-446655440000"));

        List.of(
                "candidate@example.com",
                "11111111110",
                "+905551112233",
                "Ada Lovelace",
                "https://identity.example/subject/1",
                "eyJhbGciOiJIUzI1NiJ9.payload.signature",
                "subj-11111111110",
                "subj-Ada-Lovelace",
                "550e8400-e29b-11d4-a716-446655440000",
                "550e8400-e29b-51d4-a716-446655440000",
                "550e8400-e29b-41d4-7716-446655440000",
                "550e8400-e29b-41d4-a716-446655440000 ",
                "550e8400-e29b-41d4-a716-446655440000\n",
                "s-1")
                .forEach(value -> assertFalse(
                        DsarInputPolicy.validSubjectRef(value), "reddedilmeliydi: " + value));
    }

    @Test
    void reason_code_is_closed_erasure_operation_not_free_text() {
        assertTrue(DsarInputPolicy.validReasonCode("DATA_SUBJECT_ERASURE"));
        assertFalse(DsarInputPolicy.validReasonCode("kvkk-madde-7"));
        assertFalse(DsarInputPolicy.validReasonCode("KVKK madde 7 talebi"));
        assertFalse(DsarInputPolicy.validReasonCode("candidate@example.com"));
    }

    @Test
    void dsar_request_constructor_is_authoritative_for_all_adapters() {
        assertThrows(IllegalArgumentException.class, () -> new DsarRequest(
                new TenantId("tenant"), new InterviewId("interview"),
                "candidate@example.com", "DATA_SUBJECT_ERASURE", DsarRequest.State.RECEIVED));
        assertThrows(IllegalArgumentException.class, () -> new DsarRequest(
                new TenantId("tenant"), new InterviewId("interview"),
                "550e8400-e29b-41d4-a716-446655440000", "serbest gerekçe", DsarRequest.State.RECEIVED));
    }
}
