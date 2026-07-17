package com.ats.application;

import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import java.util.List;

/** Plain-domain ilan yazma/okuma portu; bütün mutasyonlar tenant-scoped ve auditlidir. */
public interface JobPostingStore {

    record Content(
            String slug,
            String title,
            String team,
            String location,
            String mode,
            String employmentType,
            String summary,
            List<String> highlights,
            List<String> applicationFields,
            String noticeVersion) {
        public Content {
            highlights = highlights == null ? List.of() : List.copyOf(highlights);
            applicationFields = applicationFields == null ? List.of() : List.copyOf(applicationFields);
        }
    }

    record CreateCommand(
            TenantId tenantId,
            ActorId actorId,
            String jobId,
            String idempotencyKey,
            String requestDigest,
            Content content,
            String occurredAt) {}

    record UpdateCommand(
            TenantId tenantId,
            ActorId actorId,
            String jobId,
            int expectedVersion,
            String idempotencyKey,
            String requestDigest,
            Content content,
            String occurredAt) {}

    record TransitionCommand(
            TenantId tenantId,
            ActorId actorId,
            String jobId,
            int expectedVersion,
            JobPostingStatus target,
            String idempotencyKey,
            String requestDigest,
            String occurredAt) {}

    enum MutationState {
        CREATED,
        UPDATED,
        REPLAYED,
        IDEMPOTENCY_CONFLICT,
        VERSION_CONFLICT,
        ILLEGAL_TRANSITION,
        SLUG_CONFLICT,
        NOT_FOUND
    }

    record MutationResult(MutationState state, JobPosting job) {}

    Outcome<List<JobPosting>> list(TenantId tenantId);

    Outcome<JobPosting> find(TenantId tenantId, String jobId);

    /** Tenant'ın adaylara açılan aktif, UUID sızdırmayan kariyer adresi. */
    Outcome<String> findActiveCareerHandle(TenantId tenantId);

    Outcome<MutationResult> create(CreateCommand command);

    Outcome<MutationResult> update(UpdateCommand command);

    Outcome<MutationResult> transition(TransitionCommand command);
}
