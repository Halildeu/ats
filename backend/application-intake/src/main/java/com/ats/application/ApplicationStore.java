package com.ats.application;

import com.ats.application.ApplicationIntakeService.Submission;
import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import java.util.List;

/** Plain-domain port; tenant-resolution, atomic idempotency ve CAS persistence adapter'da zorlanır. */
public interface ApplicationStore {

    record SubmitCommand(
            TenantId publicTenantId,
            String jobSlug,
            String publicRef,
            String candidateAccessDigest,
            String idempotencyKey,
            String requestDigest,
            Submission submission,
            String occurredAt) {}

    enum SubmitState { CREATED, REPLAYED, IDEMPOTENCY_CONFLICT }

    record SubmitResult(SubmitState state, CandidateApplication application) {}

    record CandidateStatusView(
            String publicRef,
            String jobSlug,
            String jobTitle,
            ApplicationStatus status,
            int version,
            String createdAt,
            String updatedAt) {}

    record ApplicationPage(List<CandidateApplication> items, int page, int size, long total) {
        public ApplicationPage {
            items = List.copyOf(items);
        }
    }

    record TransitionCommand(
            TenantId tenantId,
            ActorId actorId,
            String publicRef,
            int expectedVersion,
            ApplicationStatus toStatus,
            String occurredAt) {}

    enum TransitionState { UPDATED, VERSION_CONFLICT, ILLEGAL_TRANSITION, NOT_FOUND }

    record TransitionResult(TransitionState state, CandidateApplication application) {}

    Outcome<List<JobPosting>> listPublishedJobs(TenantId publicTenantId);

    Outcome<JobPosting> findPublishedJob(TenantId publicTenantId, String slug);

    /** Application + SUBMITTED event + idempotency satırı tek DB transaction'ında. */
    Outcome<SubmitResult> submit(SubmitCommand command);

    /** Public ref + token digest birlikte zorunlu; uyuşmazlık her zaman NOT_FOUND. */
    Outcome<CandidateStatusView> findCandidateStatus(String publicRef, String candidateAccessDigest);

    Outcome<ApplicationPage> listRecruiterApplications(
            TenantId tenantId, String jobSlug, ApplicationStatus status, int page, int size);

    /** Tenant-scoped compare-and-set durum geçişi + append-only event tek transaction'da. */
    Outcome<TransitionResult> transition(TransitionCommand command);
}
