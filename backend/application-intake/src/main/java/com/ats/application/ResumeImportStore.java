package com.ats.application;

import com.ats.application.ResumeImportService.ImportState;
import com.ats.application.ResumeImportService.ProposalDraft;
import com.ats.application.ResumeImportService.ProposalState;
import com.ats.application.ResumeImportService.ResumeDraft;
import com.ats.application.ResumeImportService.ResumeField;
import com.ats.application.ResumeImportService.ResumeImport;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import java.util.List;
import java.util.Map;

/**
 * Candidate CV import persistence port. Raw document bytes are deliberately absent:
 * the adapter may persist only transient field proposals and the candidate-confirmed draft.
 */
public interface ResumeImportStore {

    record CreateCommand(
            TenantId tenantId,
            String jobId,
            String jobSlug,
            String importId,
            String candidateAccessDigest,
            String idempotencyKey,
            String requestDigest,
            String noticeVersion,
            String noticeAcceptedAt,
            String uploadExpiresAt,
            String importExpiresAt,
            String occurredAt) {}

    enum CreateState { CREATED, REPLAYED, IDEMPOTENCY_CONFLICT }

    record CreateResult(CreateState state, ResumeImport resumeImport) {}

    record AttachCommand(
            String importId,
            String candidateAccessDigest,
            int expectedVersion,
            String uploadIdempotencyKey,
            String documentDigest,
            int pageCount,
            String parserVersion,
            int protectedSuppressed,
            int unsupportedOutput,
            String occurredAt) {}

    record ReserveUploadCommand(
            String importId,
            String candidateAccessDigest,
            int expectedVersion,
            String uploadIdempotencyKey,
            String documentDigest,
            String reservationExpiresAt,
            String firstUploadImportExpiresAt,
            String occurredAt) {}

    enum ReserveUploadState {
        RESERVED,
        REPLAYED,
        IN_FLIGHT,
        VERSION_CONFLICT,
        DOCUMENT_CONFLICT,
        UPLOAD_WINDOW_CLOSED,
        TERMINAL,
        NOT_FOUND
    }

    record ReserveUploadResult(ReserveUploadState state, ResumeImport resumeImport) {}

    enum AttachState {
        ATTACHED,
        REPLAYED,
        IN_FLIGHT,
        VERSION_CONFLICT,
        DOCUMENT_CONFLICT,
        UPLOAD_WINDOW_CLOSED,
        TERMINAL,
        NOT_FOUND
    }

    record AttachResult(AttachState state, ResumeImport resumeImport) {}

    record FieldCommand(
            String importId,
            String candidateAccessDigest,
            ResumeField field,
            ProposalState state,
            String editedValue,
            int expectedVersion,
            String occurredAt) {}

    enum FieldState { UPDATED, VERSION_CONFLICT, TERMINAL, NOT_FOUND }

    record FieldResult(FieldState state, ResumeImport resumeImport) {}

    record ConfirmCommand(
            String importId,
            String candidateAccessDigest,
            int expectedVersion,
            String occurredAt) {}

    enum ConfirmState {
        CONFIRMED,
        VERSION_CONFLICT,
        NO_SELECTED_FIELDS,
        TERMINAL,
        NOT_FOUND
    }

    record ConfirmResult(ConfirmState state, ResumeImport resumeImport, ResumeDraft draft) {}

    record TerminateCommand(
            String importId,
            String candidateAccessDigest,
            int expectedVersion,
            ImportState terminalState,
            String occurredAt) {}

    enum TerminateState { TERMINATED, REPLAYED, VERSION_CONFLICT, TERMINAL, NOT_FOUND }

    record TerminateResult(TerminateState state, ResumeImport resumeImport) {}

    record ReplaceCommand(
            String importId,
            String candidateAccessDigest,
            int expectedVersion,
            String newUploadExpiresAt,
            String occurredAt) {}

    enum ReplaceState { REPLACED, VERSION_CONFLICT, NO_DOCUMENT, TERMINAL, NOT_FOUND }

    record ReplaceResult(ReplaceState state, ResumeImport resumeImport) {}

    Outcome<CreateResult> create(CreateCommand command);

    Outcome<ResumeImport> find(String importId, String candidateAccessDigest, String occurredAt);

    /**
     * Cross-replica single-flight reservation, acquired before untrusted bytes enter scanner/parser.
     * The reservation stores only digests and a short lease; no raw bytes or extracted values.
     */
    Outcome<ReserveUploadResult> reserveUpload(ReserveUploadCommand command);

    /** Best-effort exact-owner release after a failed scan/parse. */
    Outcome<Void> releaseUpload(
            String importId, String candidateAccessDigest, String uploadIdempotencyKey,
            String documentDigest, String occurredAt);

    Outcome<AttachResult> attach(AttachCommand command, List<ProposalDraft> proposals);

    Outcome<FieldResult> updateField(FieldCommand command);

    Outcome<ConfirmResult> confirm(ConfirmCommand command);

    Outcome<TerminateResult> terminate(TerminateCommand command);

    /** Explicit candidate action: supersede the current document version without extending import TTL. */
    Outcome<ReplaceResult> replace(ReplaceCommand command);

    /**
     * Atomically expires due ACTIVE imports, purges their proposals/document digest and removes
     * expired unconsumed candidate drafts. Values and candidate references are never returned.
     */
    Outcome<Integer> purgeDue(String occurredAt, int limit);

    /**
     * Used by application-submit to bind a confirmed draft in the same DB transaction.
     * {@code nowIso} is the caller-supplied clock (ISO-8601 UTC) used to enforce draft TTL;
     * adapters must not read wall-clock time so that tests and cross-region callers stay deterministic.
     */
    Outcome<ResumeDraft> findConfirmedDraft(
            TenantId tenantId, String jobId, String candidateAccessDigest,
            String importId, int expectedDraftVersion, String nowIso);

    /** Test/operations visibility without candidate values. */
    Outcome<Map<ImportState, Long>> countStates(TenantId tenantId);
}
