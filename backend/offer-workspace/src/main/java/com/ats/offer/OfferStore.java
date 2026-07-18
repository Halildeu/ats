package com.ats.offer;

import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import java.math.BigDecimal;
import java.util.List;

/** Framework-free persistence port; application/interview/tenant CAS adapter'da atomiktir. */
public interface OfferStore {

    record Terms(
            String roleTitle,
            String startDate,
            String employmentType,
            String workMode,
            String location,
            BigDecimal compensationAmount,
            String currency,
            OfferPayPeriod payPeriod,
            String expiresAt,
            String termsSummary) {}

    record CreateCommand(
            TenantId tenantId,
            ActorId actorId,
            String applicationPublicRef,
            String offerId,
            String idempotencyKey,
            String requestDigest,
            Terms terms,
            String occurredAt) {}

    record UpdateCommand(
            TenantId tenantId,
            ActorId actorId,
            String applicationPublicRef,
            String offerId,
            int expectedVersion,
            String idempotencyKey,
            String requestDigest,
            Terms terms,
            String reason,
            String occurredAt) {}

    record RecruiterTransitionCommand(
            TenantId tenantId,
            ActorId actorId,
            String applicationPublicRef,
            String offerId,
            int expectedVersion,
            String idempotencyKey,
            String requestDigest,
            OfferStatus target,
            String reason,
            String occurredAt) {}

    record CandidateResponseCommand(
            String applicationPublicRef,
            String offerId,
            String candidateAccessDigest,
            int expectedVersion,
            String idempotencyKey,
            String requestDigest,
            OfferStatus target,
            boolean processAcknowledged,
            String occurredAt) {}

    enum CommandState {
        CREATED,
        UPDATED,
        REPLAYED,
        VERSION_CONFLICT,
        IDEMPOTENCY_CONFLICT,
        ILLEGAL_TRANSITION,
        EXPIRED,
        ACTIVE_OFFER_EXISTS,
        INTERVIEW_NOT_COMPLETED,
        NOT_FOUND
    }

    record WorkspaceResult(CommandState state, OfferWorkspace workspace) {}

    /** Candidate-safe projection: actor, revision reason ve başka aday verisi içermez. */
    record CandidateOfferView(
            String offerId,
            String applicationPublicRef,
            String jobTitle,
            String roleTitle,
            String startDate,
            String employmentType,
            String workMode,
            String location,
            BigDecimal compensationAmount,
            String currency,
            OfferPayPeriod payPeriod,
            String expiresAt,
            String termsSummary,
            OfferStatus status,
            int version,
            String updatedAt) {}

    Outcome<WorkspaceResult> create(CreateCommand command);

    Outcome<List<OfferWorkspace>> listRecruiter(TenantId tenantId, String applicationPublicRef);

    Outcome<OfferWorkspace> findRecruiter(
            TenantId tenantId, String applicationPublicRef, String offerId);

    Outcome<WorkspaceResult> update(UpdateCommand command);

    Outcome<WorkspaceResult> transition(RecruiterTransitionCommand command);

    Outcome<List<CandidateOfferView>> listCandidate(
            String applicationPublicRef, String candidateAccessDigest);

    Outcome<WorkspaceResult> respond(CandidateResponseCommand command);
}
