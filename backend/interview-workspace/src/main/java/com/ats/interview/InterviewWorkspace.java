package com.ats.interview;

import com.ats.kernel.Ids.TenantId;
import java.util.List;

/** Recruiter/interviewer iç görünümü; aday API'si bu kaydı doğrudan döndürmez. */
public record InterviewWorkspace(
        TenantId tenantId,
        String interviewId,
        String applicationPublicRef,
        String jobSlug,
        String jobTitle,
        String candidateName,
        InterviewType type,
        String startsAt,
        String endsAt,
        String timeZone,
        InterviewMode mode,
        String location,
        InterviewStatus status,
        int version,
        List<Participant> participants,
        List<Criterion> criteria,
        List<InterviewScorecard> scorecards,
        List<ScheduleRevision> scheduleHistory,
        String createdAt,
        String updatedAt) {

    public InterviewWorkspace {
        participants = List.copyOf(participants);
        criteria = List.copyOf(criteria);
        scorecards = List.copyOf(scorecards);
        scheduleHistory = List.copyOf(scheduleHistory);
    }

    public enum ParticipantRole { LEAD, INTERVIEWER }

    public record Participant(String actorRef, String displayLabel, ParticipantRole role) {}

    /** Soru ve kanıt prompt'u job-related rubric snapshot'ıdır; sonradan sessizce değişmez. */
    public record Criterion(
            String key,
            String label,
            String question,
            String evidencePrompt) {}

    public record ScheduleRevision(
            int version,
            String startsAt,
            String endsAt,
            String timeZone,
            InterviewMode mode,
            String location,
            InterviewStatus status,
            String reason,
            String actorRef,
            String occurredAt) {}
}
