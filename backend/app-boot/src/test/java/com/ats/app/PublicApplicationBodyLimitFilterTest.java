package com.ats.app;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class PublicApplicationBodyLimitFilterTest {

    @Test
    void canonical_career_submission_is_bounded_before_deserialization() throws Exception {
        var request = new MockHttpServletRequest(
                "POST", "/api/v1/careers/acik/jobs/product-designer/applications");
        request.setContentType(MediaType.APPLICATION_JSON_VALUE);
        request.setContent(new byte[(int) PublicApplicationBodyLimitFilter.MAX_BYTES + 1]);
        var response = new MockHttpServletResponse();

        new PublicApplicationBodyLimitFilter().doFilter(
                request, response, new MockFilterChain());

        assertEquals(413, response.getStatus());
    }

    @Test
    void recruiter_create_is_bounded_before_deserialization() throws Exception {
        assertOversizedJsonRejected("POST", "/api/v1/recruiter/jobs");
    }

    @Test
    void recruiter_update_and_transition_are_bounded_before_deserialization() throws Exception {
        assertOversizedJsonRejected("PUT", "/api/v1/recruiter/jobs/job_123");
        assertOversizedJsonRejected(
                "POST", "/api/v1/recruiter/jobs/job_123/transitions");
    }

    private static void assertOversizedJsonRejected(String method, String uri) throws Exception {
        var request = new MockHttpServletRequest(method, uri);
        request.setContentType(MediaType.APPLICATION_JSON_VALUE);
        request.setContent(new byte[(int) PublicApplicationBodyLimitFilter.MAX_BYTES + 1]);
        var response = new MockHttpServletResponse();

        new PublicApplicationBodyLimitFilter().doFilter(
                request, response, new MockFilterChain());

        assertEquals(413, response.getStatus());
    }
}
