package com.ats.ingest;

import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;

/** Upload-ingest isteği (PRD-P1 F1). filename path-traversal reddi resolved-form kontrolüyle. */
public record UploadRequest(
        TenantId tenantId,
        ActorId actorId,
        InterviewId interviewId,
        String filename,
        String contentType,
        String occurredAtIso) {

    private static final java.util.regex.Pattern SAFE_FILENAME =
            java.util.regex.Pattern.compile("[A-Za-z0-9][A-Za-z0-9._-]{0,254}");

    public static Outcome<UploadRequest> create(
            TenantId tenantId,
            ActorId actorId,
            InterviewId interviewId,
            String filename,
            String contentType,
            String occurredAtIso) {
        if (tenantId == null || actorId == null || interviewId == null) {
            return Outcome.fail(OutcomeCode.INVALID, "tenantId/actorId/interviewId zorunlu");
        }
        if (filename == null || !SAFE_FILENAME.matcher(filename).matches() || filename.contains("..")) {
            return Outcome.fail(OutcomeCode.INVALID, "filename güvenli değil (allowlist + traversal reddi)");
        }
        if (contentType == null || contentType.isBlank()) {
            return Outcome.fail(OutcomeCode.INVALID, "contentType zorunlu");
        }
        if (occurredAtIso == null || occurredAtIso.isBlank()) {
            return Outcome.fail(OutcomeCode.INVALID, "occurredAtIso zorunlu (ISO-8601 string)");
        }
        return Outcome.ok(new UploadRequest(tenantId, actorId, interviewId, filename, contentType, occurredAtIso));
    }
}
