package com.ats.interview;

import java.util.List;

/** İnsan tarafından gönderilen immutable scorecard revision'ı; aggregate/AI skoru yoktur. */
public record InterviewScorecard(
        String scorecardId,
        String interviewId,
        String actorRef,
        String participantLabel,
        String policyVersion,
        boolean jobRelatednessConfirmed,
        Recommendation recommendation,
        List<Rating> ratings,
        String summary,
        String predecessorScorecardId,
        int revision,
        String createdAt) {

    public InterviewScorecard {
        ratings = List.copyOf(ratings);
    }

    public enum Recommendation { ADVANCE, HOLD, NO_HIRE }

    public record Rating(String criterionKey, int rating, String evidence) {}
}
