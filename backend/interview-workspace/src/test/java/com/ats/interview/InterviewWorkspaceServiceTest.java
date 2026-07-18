package com.ats.interview;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.interview.InterviewScorecard.Rating;
import com.ats.interview.InterviewScorecard.Recommendation;
import com.ats.interview.InterviewStore.CandidateInterviewView;
import com.ats.interview.InterviewStore.CreateCommand;
import com.ats.interview.InterviewStore.RescheduleCommand;
import com.ats.interview.InterviewStore.ScorecardCommand;
import com.ats.interview.InterviewStore.ScorecardResult;
import com.ats.interview.InterviewStore.ScorecardState;
import com.ats.interview.InterviewStore.TransitionCommand;
import com.ats.interview.InterviewStore.WorkspaceResult;
import com.ats.interview.InterviewWorkspace.Criterion;
import com.ats.interview.InterviewWorkspace.Participant;
import com.ats.interview.InterviewWorkspace.ParticipantRole;
import com.ats.interview.InterviewWorkspaceService.ScheduleInput;
import com.ats.interview.InterviewWorkspaceService.ScorecardInput;
import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;

class InterviewWorkspaceServiceTest {

    private static final TenantId TENANT = new TenantId("tenant-test");
    private static final ActorId ACTOR = new ActorId("interviewer-test");
    private static final String APPLICATION = "app_123456789012345678901234";
    private static final String INTERVIEW = "int_123456789012345678901234";
    private static final Clock CLOCK = Clock.fixed(
            Instant.parse("2026-07-18T12:00:00Z"), ZoneOffset.UTC);

    @Test
    void protected_or_unstructured_questions_are_rejected_before_store() {
        FakeStore store = new FakeStore();
        InterviewWorkspaceService service = service(store);

        for (String question : List.of(
                "Kaç yaşındasınız ve medeni durumunuz nedir?",
                "Bu ekiple culture fit seviyenizi anlatır mısınız?")) {
            Outcome<WorkspaceResult> result = service.create(
                    TENANT, ACTOR, APPLICATION, "interview-create-key-01",
                    schedule(question, "Europe/Istanbul"));
            Outcome.Fail<WorkspaceResult> fail = assertInstanceOf(Outcome.Fail.class, result);
            assertEquals(OutcomeCode.INVALID, fail.code());
            assertNull(store.create);
        }
    }

    @Test
    void invalid_iana_timezone_is_a_bounded_client_error() {
        FakeStore store = new FakeStore();
        Outcome<WorkspaceResult> result = service(store).create(
                TENANT, ACTOR, APPLICATION, "interview-create-key-02",
                schedule("Müşteri ihtiyacını hangi kanıtlarla doğruladınız?", "Mars/Olympus"));

        Outcome.Fail<WorkspaceResult> fail = assertInstanceOf(Outcome.Fail.class, result);
        assertEquals(OutcomeCode.INVALID, fail.code());
        assertNull(store.create);
    }

    @Test
    void valid_schedule_is_canonical_and_does_not_generate_an_automated_decision() {
        FakeStore store = new FakeStore();
        Outcome<WorkspaceResult> result = service(store).create(
                TENANT, ACTOR, APPLICATION, "interview-create-key-03",
                schedule("Müşteri ihtiyacını hangi kanıtlarla doğruladınız?", "Europe/Istanbul"));

        assertInstanceOf(Outcome.Ok.class, result);
        assertTrue(store.create.interviewId().matches("int_[A-Za-z0-9_-]{24}"));
        assertTrue(store.create.requestDigest().matches("[0-9a-f]{64}"));
        assertEquals("2026-07-18T12:00:00Z", store.create.occurredAt());
        assertEquals(1, store.create.participants().size());
        assertEquals(1, store.create.criteria().size());
    }

    @Test
    void scorecard_requires_human_job_related_confirmation_and_structured_evidence() {
        FakeStore store = new FakeStore();
        InterviewWorkspaceService service = service(store);
        ScorecardInput missingConfirmation = new ScorecardInput(
                InterviewWorkspaceService.SCORECARD_POLICY_VERSION, false,
                Recommendation.ADVANCE,
                List.of(new Rating("delivery", 4, "Somut teslim kanıtı açıkladı.")),
                "İnsan değerlendirmesi özeti.", null);
        Outcome<ScorecardResult> invalid = service.submitScorecard(
                TENANT, ACTOR, INTERVIEW, "scorecard-create-key-01", missingConfirmation);
        assertEquals(OutcomeCode.INVALID,
                assertInstanceOf(Outcome.Fail.class, invalid).code());
        assertNull(store.scorecard);

        ScorecardInput valid = new ScorecardInput(
                InterviewWorkspaceService.SCORECARD_POLICY_VERSION, true,
                Recommendation.HOLD,
                List.of(
                        new Rating("delivery", 3, "Trade-off ve teslim sonucunu somut açıkladı."),
                        new Rating("discovery", 4, "Üç kullanıcı görüşmesi ve metrik kanıtı sundu.")),
                "İki işle ilgili kriter insan tarafından değerlendirildi.", null);
        Outcome<ScorecardResult> created = service.submitScorecard(
                TENANT, ACTOR, INTERVIEW, "scorecard-create-key-02", valid);

        assertInstanceOf(Outcome.Ok.class, created);
        assertEquals(List.of("delivery", "discovery"), store.scorecard.ratings().stream()
                .map(Rating::criterionKey).toList());
        assertTrue(store.scorecard.requestDigest().matches("[0-9a-f]{64}"));
        assertEquals(Recommendation.HOLD, store.scorecard.recommendation());
    }

    @Test
    void candidate_capability_token_is_hashed_before_the_persistence_port() {
        FakeStore store = new FakeStore();
        String token = "A".repeat(43);

        Outcome<List<CandidateInterviewView>> result = service(store)
                .listCandidate(APPLICATION, token);

        assertInstanceOf(Outcome.Ok.class, result);
        assertTrue(store.candidateDigest.matches("[0-9a-f]{64}"));
        assertTrue(!store.candidateDigest.equals(token));
    }

    private static InterviewWorkspaceService service(FakeStore store) {
        return new InterviewWorkspaceService(store, CLOCK, new SecureRandom());
    }

    private static ScheduleInput schedule(String question, String timeZone) {
        return new ScheduleInput(
                InterviewType.BEHAVIORAL,
                "2026-07-19T12:00:00Z",
                "2026-07-19T13:00:00Z",
                timeZone,
                InterviewMode.VIDEO,
                "https://meet.example.test/synthetic-room",
                List.of(new Participant("interviewer-test", "Sentetik Görüşmeci", ParticipantRole.LEAD)),
                List.of(new Criterion(
                        "discovery", "Ürün keşfi", question,
                        "Yöntem ve doğrulanabilir sonucu kanıtla yazın.")));
    }

    private static final class FakeStore implements InterviewStore {
        private CreateCommand create;
        private ScorecardCommand scorecard;
        private String candidateDigest;

        @Override public Outcome<WorkspaceResult> create(CreateCommand command) {
            create = command;
            return Outcome.ok(new WorkspaceResult(CommandState.CREATED, null));
        }
        @Override public Outcome<List<InterviewWorkspace>> listRecruiter(
                TenantId tenantId, String applicationPublicRef) {
            return Outcome.ok(List.of());
        }
        @Override public Outcome<InterviewWorkspace> findRecruiter(
                TenantId tenantId, String applicationPublicRef, String interviewId) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "test");
        }
        @Override public Outcome<InterviewWorkspace> findAssigned(
                TenantId tenantId, ActorId actorId, String interviewId) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "test");
        }
        @Override public Outcome<List<CandidateInterviewView>> listCandidate(
                String applicationPublicRef, String candidateAccessDigest) {
            candidateDigest = candidateAccessDigest;
            return Outcome.ok(List.of());
        }
        @Override public Outcome<WorkspaceResult> reschedule(RescheduleCommand command) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "test");
        }
        @Override public Outcome<WorkspaceResult> transition(TransitionCommand command) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "test");
        }
        @Override public Outcome<ScorecardResult> submitScorecard(ScorecardCommand command) {
            scorecard = command;
            return Outcome.ok(new ScorecardResult(ScorecardState.CREATED, null));
        }
    }
}
