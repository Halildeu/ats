package com.ats.interview;

import com.ats.interview.InterviewScorecard.Rating;
import com.ats.interview.InterviewScorecard.Recommendation;
import com.ats.interview.InterviewWorkspace.Criterion;
import com.ats.interview.InterviewWorkspace.Participant;
import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import java.util.List;

/** Framework-free persistence port; tenant/application/participant checks adapter'da atomiktir. */
public interface InterviewStore {

    record CreateCommand(
            TenantId tenantId,
            ActorId actorId,
            String applicationPublicRef,
            String interviewId,
            String idempotencyKey,
            String requestDigest,
            InterviewType type,
            String startsAt,
            String endsAt,
            String timeZone,
            InterviewMode mode,
            String location,
            List<Participant> participants,
            List<Criterion> criteria,
            String occurredAt) {
        public CreateCommand {
            participants = List.copyOf(participants);
            criteria = List.copyOf(criteria);
        }
    }

    enum CommandState {
        CREATED,
        UPDATED,
        REPLAYED,
        VERSION_CONFLICT,
        IDEMPOTENCY_CONFLICT,
        ILLEGAL_TRANSITION,
        INCOMPLETE_SCORECARDS,
        NOT_ASSIGNED,
        NOT_FOUND
    }

    record WorkspaceResult(CommandState state, InterviewWorkspace workspace) {}

    record RescheduleCommand(
            TenantId tenantId,
            ActorId actorId,
            String applicationPublicRef,
            String interviewId,
            int expectedVersion,
            String idempotencyKey,
            String requestDigest,
            String startsAt,
            String endsAt,
            String timeZone,
            InterviewMode mode,
            String location,
            String reason,
            String occurredAt) {}

    record TransitionCommand(
            TenantId tenantId,
            ActorId actorId,
            String applicationPublicRef,
            String interviewId,
            int expectedVersion,
            String idempotencyKey,
            String requestDigest,
            InterviewStatus target,
            String reason,
            String occurredAt) {}

    record ScorecardCommand(
            TenantId tenantId,
            ActorId actorId,
            String interviewId,
            String scorecardId,
            String idempotencyKey,
            String requestDigest,
            String policyVersion,
            boolean jobRelatednessConfirmed,
            Recommendation recommendation,
            List<Rating> ratings,
            String summary,
            String predecessorScorecardId,
            String occurredAt) {
        public ScorecardCommand {
            ratings = List.copyOf(ratings);
        }
    }

    enum ScorecardState {
        CREATED,
        REPLAYED,
        IDEMPOTENCY_CONFLICT,
        INTERVIEW_CLOSED,
        NOT_ASSIGNED,
        CRITERIA_MISMATCH,
        PREDECESSOR_MISMATCH,
        NOT_FOUND
    }

    record ScorecardResult(ScorecardState state, InterviewScorecard scorecard) {}

    /** Aday güvenli projeksiyonu: katılımcı, soru, scorecard ve iç gerekçe içermez. */
    record CandidateInterviewView(
            String interviewId,
            InterviewType type,
            String startsAt,
            String endsAt,
            String timeZone,
            InterviewMode mode,
            String location,
            InterviewStatus status,
            String updatedAt) {}

    Outcome<WorkspaceResult> create(CreateCommand command);

    Outcome<List<InterviewWorkspace>> listRecruiter(TenantId tenantId, String applicationPublicRef);

    Outcome<InterviewWorkspace> findRecruiter(
            TenantId tenantId, String applicationPublicRef, String interviewId);

    Outcome<InterviewWorkspace> findAssigned(
            TenantId tenantId, ActorId actorId, String interviewId);

    Outcome<List<CandidateInterviewView>> listCandidate(
            String applicationPublicRef, String candidateAccessDigest);

    Outcome<WorkspaceResult> reschedule(RescheduleCommand command);

    Outcome<WorkspaceResult> transition(TransitionCommand command);

    Outcome<ScorecardResult> submitScorecard(ScorecardCommand command);
}
