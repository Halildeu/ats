package com.ats.app.web;

import com.ats.interview.InterviewMode;
import com.ats.interview.InterviewScorecard;
import com.ats.interview.InterviewScorecard.Rating;
import com.ats.interview.InterviewScorecard.Recommendation;
import com.ats.interview.InterviewStatus;
import com.ats.interview.InterviewStore.CommandState;
import com.ats.interview.InterviewStore.CandidateInterviewView;
import com.ats.interview.InterviewStore.ScorecardResult;
import com.ats.interview.InterviewStore.ScorecardState;
import com.ats.interview.InterviewStore.WorkspaceResult;
import com.ats.interview.InterviewType;
import com.ats.interview.InterviewWorkspace;
import com.ats.interview.InterviewWorkspace.Criterion;
import com.ats.interview.InterviewWorkspace.Participant;
import com.ats.interview.InterviewWorkspace.ParticipantRole;
import com.ats.interview.InterviewWorkspace.ScheduleRevision;
import com.ats.interview.InterviewWorkspaceService;
import com.ats.interview.InterviewWorkspaceService.ScheduleInput;
import com.ats.interview.InterviewWorkspaceService.ScorecardInput;
import com.ats.kernel.Outcome;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.headers.Header;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.net.URI;
import java.util.List;
import java.util.Map;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

/** Product bridge: persisted application -> schedule -> assigned human scorecard -> candidate view. */
@RestController
@Tag(name = "ats-interviews",
        description = "İnsan kontrollü mülakat planlama, rubric ve scorecard")
class InterviewWorkspaceApiController {

    private final InterviewWorkspaceService service;
    private final TenantAccess tenantAccess;
    private final RecruiterAuthorization authorization;

    InterviewWorkspaceApiController(
            InterviewWorkspaceService service,
            TenantAccess tenantAccess,
            RecruiterAuthorization authorization) {
        this.service = service;
        this.tenantAccess = tenantAccess;
        this.authorization = authorization;
    }

    @Schema(name = "InterviewParticipantRequest",
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record ParticipantBody(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String actorRef,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String displayLabel,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) ParticipantRole role) {}

    @Schema(name = "InterviewCriterionRequest",
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record CriterionBody(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String key,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String label,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String question,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String evidencePrompt) {}

    @Schema(name = "InterviewCreateRequest",
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE,
            requiredProperties = {"type", "startsAt", "endsAt", "timeZone", "mode",
                    "location", "participants", "criteria"})
    record CreateBody(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) InterviewType type,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String startsAt,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String endsAt,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String timeZone,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) InterviewMode mode,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String location,
            @ArraySchema(arraySchema = @Schema(requiredMode = Schema.RequiredMode.REQUIRED),
                    minItems = 1, maxItems = 12,
                    schema = @Schema(implementation = ParticipantBody.class))
            List<ParticipantBody> participants,
            @ArraySchema(arraySchema = @Schema(requiredMode = Schema.RequiredMode.REQUIRED),
                    minItems = 1, maxItems = 12,
                    schema = @Schema(implementation = CriterionBody.class))
            List<CriterionBody> criteria) {}

    @Schema(name = "InterviewRescheduleRequest",
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record RescheduleBody(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minimum = "0") Integer expectedVersion,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String startsAt,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String endsAt,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String timeZone,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) InterviewMode mode,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String location,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minLength = 5, maxLength = 500)
            String reason) {}

    @Schema(name = "InterviewTransitionRequest",
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record InterviewTransitionBody(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minimum = "0") Integer expectedVersion,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED,
                    allowableValues = {"COMPLETED", "CANCELLED"})
            InterviewStatus target,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minLength = 5, maxLength = 500)
            String reason) {}

    @Schema(name = "InterviewScorecardRatingRequest",
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record RatingBody(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String criterionKey,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minimum = "1", maximum = "4")
            Integer rating,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minLength = 10, maxLength = 2000)
            String evidence) {}

    @Schema(name = "InterviewScorecardRequest",
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE,
            requiredProperties = {"policyVersion", "jobRelatednessConfirmed",
                    "recommendation", "ratings", "summary"})
    record ScorecardBody(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED,
                    allowableValues = {InterviewWorkspaceService.SCORECARD_POLICY_VERSION})
            String policyVersion,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Boolean jobRelatednessConfirmed,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Recommendation recommendation,
            @ArraySchema(arraySchema = @Schema(requiredMode = Schema.RequiredMode.REQUIRED),
                    minItems = 1, maxItems = 12,
                    schema = @Schema(implementation = RatingBody.class))
            List<RatingBody> ratings,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minLength = 10, maxLength = 4000)
            String summary,
            String predecessorScorecardId) {}

    @Schema(name = "InterviewParticipantResponse",
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record ParticipantResponse(String actorRef, String displayLabel, ParticipantRole role) {}

    @Schema(name = "InterviewCriterionResponse",
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record CriterionResponse(String key, String label, String question, String evidencePrompt) {}

    @Schema(name = "InterviewScheduleRevisionResponse",
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record ScheduleRevisionResponse(
            int version, String startsAt, String endsAt, String timeZone,
            InterviewMode mode, String location, InterviewStatus status,
            String reason, String actorRef, String occurredAt) {}

    @Schema(name = "InterviewScorecardRatingResponse",
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record RatingResponse(String criterionKey, int rating, String evidence) {}

    @Schema(name = "InterviewScorecardResponse",
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record ScorecardResponse(
            String scorecardId, String interviewId, String actorRef, String participantLabel,
            @Schema(allowableValues = {InterviewWorkspaceService.SCORECARD_POLICY_VERSION})
            String policyVersion,
            boolean jobRelatednessConfirmed, Recommendation recommendation,
            List<RatingResponse> ratings, String summary, String predecessorScorecardId,
            int revision, String createdAt) {}

    @Schema(name = "InterviewWorkspaceResponse",
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record WorkspaceResponse(
            String interviewId, String applicationPublicRef, String jobSlug, String jobTitle,
            String candidateName, InterviewType type, String startsAt, String endsAt,
            String timeZone, InterviewMode mode, String location, InterviewStatus status,
            int version, List<ParticipantResponse> participants, List<CriterionResponse> criteria,
            List<ScorecardResponse> scorecards, List<ScheduleRevisionResponse> scheduleHistory,
            String createdAt, String updatedAt) {}

    @Schema(name = "CandidateInterviewResponse",
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record CandidateInterviewResponse(
            String interviewId, InterviewType type, String startsAt, String endsAt,
            String timeZone, InterviewMode mode, String location, InterviewStatus status,
            String updatedAt) {}

    @PostMapping("/api/v1/recruiter/applications/{publicRef}/interviews")
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Mülakat planlandı",
                    content = @Content(schema = @Schema(implementation = WorkspaceResponse.class))),
            @ApiResponse(responseCode = "200", description = "Idempotent planlama replay",
                    headers = @Header(name = "X-ATS-Replay", description = "true"),
                    content = @Content(schema = @Schema(implementation = WorkspaceResponse.class))),
            @ApiResponse(responseCode = "400", description = "Geçersiz veya ayrımcı plan/rubric"),
            @ApiResponse(responseCode = "404", description = "Başvuru bulunamadı"),
            @ApiResponse(responseCode = "409", description = "Durum veya idempotency çakışması")
    })
    ResponseEntity<?> create(
            Authentication auth,
            @PathVariable("publicRef") String publicRef,
            @Parameter(required = true)
            @RequestHeader(value = "X-ATS-Idempotency-Key", required = false) String idempotencyKey,
            @RequestBody CreateBody body) {
        ResponseEntity<?> denied = authorize(auth, RecruiterAuthorization.Permission.INTERVIEW_MANAGE);
        if (denied != null) return denied;
        Outcome<WorkspaceResult> out = service.create(
                tenantAccess.tenant(auth), tenantAccess.actor(auth), publicRef,
                idempotencyKey, schedule(body));
        return workspaceResult(out, publicRef, true);
    }

    @GetMapping("/api/v1/recruiter/applications/{publicRef}/interviews")
    @ApiResponse(responseCode = "200", description = "Başvurunun mülakatları",
            content = @Content(array = @ArraySchema(
                    schema = @Schema(implementation = WorkspaceResponse.class))))
    ResponseEntity<?> list(Authentication auth, @PathVariable("publicRef") String publicRef) {
        ResponseEntity<?> denied = authorize(auth, RecruiterAuthorization.Permission.INTERVIEW_VIEW);
        if (denied != null) return denied;
        var out = service.listRecruiter(tenantAccess.tenant(auth), publicRef);
        if (out instanceof Outcome.Fail<List<InterviewWorkspace>> fail) return noStore(OutcomeHttp.fail(fail));
        return noStore(ResponseEntity.ok(((Outcome.Ok<List<InterviewWorkspace>>) out).value()
                .stream().map(InterviewWorkspaceApiController::workspaceResponse).toList()));
    }

    @GetMapping("/api/v1/recruiter/applications/{publicRef}/interviews/{interviewId}")
    @ApiResponse(responseCode = "200", description = "Recruiter mülakat çalışma alanı",
            content = @Content(schema = @Schema(implementation = WorkspaceResponse.class)))
    ResponseEntity<?> detail(
            Authentication auth,
            @PathVariable("publicRef") String publicRef,
            @PathVariable("interviewId") String interviewId) {
        ResponseEntity<?> denied = authorize(auth, RecruiterAuthorization.Permission.INTERVIEW_VIEW);
        if (denied != null) return denied;
        var out = service.findRecruiter(tenantAccess.tenant(auth), publicRef, interviewId);
        if (out instanceof Outcome.Fail<InterviewWorkspace> fail) return noStore(OutcomeHttp.fail(fail));
        return noStore(ResponseEntity.ok(workspaceResponse(
                ((Outcome.Ok<InterviewWorkspace>) out).value())));
    }

    @PutMapping("/api/v1/recruiter/applications/{publicRef}/interviews/{interviewId}")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Mülakat yeniden planlandı veya replay",
                    headers = @Header(name = "X-ATS-Replay", description = "Replay ise true"),
                    content = @Content(schema = @Schema(implementation = WorkspaceResponse.class))),
            @ApiResponse(responseCode = "400", description = "Geçersiz plan"),
            @ApiResponse(responseCode = "404", description = "Mülakat bulunamadı"),
            @ApiResponse(responseCode = "409", description = "Sürüm veya durum çakışması")
    })
    ResponseEntity<?> reschedule(
            Authentication auth,
            @PathVariable("publicRef") String publicRef,
            @PathVariable("interviewId") String interviewId,
            @Parameter(required = true)
            @RequestHeader(value = "X-ATS-Idempotency-Key", required = false) String idempotencyKey,
            @RequestBody RescheduleBody body) {
        ResponseEntity<?> denied = authorize(auth, RecruiterAuthorization.Permission.INTERVIEW_MANAGE);
        if (denied != null) return denied;
        if (body == null || body.expectedVersion() == null) return badRequest("expectedVersion zorunlu");
        ScheduleInput input = new ScheduleInput(
                null, body.startsAt(), body.endsAt(), body.timeZone(), body.mode(), body.location(),
                List.of(), List.of());
        Outcome<WorkspaceResult> out = service.reschedule(
                tenantAccess.tenant(auth), tenantAccess.actor(auth), publicRef, interviewId,
                body.expectedVersion(), idempotencyKey, input, body.reason());
        return workspaceResult(out, publicRef, false);
    }

    @PostMapping("/api/v1/recruiter/applications/{publicRef}/interviews/{interviewId}/transitions")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Mülakat insan kararıyla kapatıldı",
                    headers = @Header(name = "X-ATS-Replay", description = "Replay ise true"),
                    content = @Content(schema = @Schema(implementation = WorkspaceResponse.class))),
            @ApiResponse(responseCode = "400", description = "Geçersiz geçiş"),
            @ApiResponse(responseCode = "404", description = "Mülakat bulunamadı"),
            @ApiResponse(responseCode = "409", description = "Sürüm, durum veya eksik scorecard")
    })
    ResponseEntity<?> transition(
            Authentication auth,
            @PathVariable("publicRef") String publicRef,
            @PathVariable("interviewId") String interviewId,
            @Parameter(required = true)
            @RequestHeader(value = "X-ATS-Idempotency-Key", required = false) String idempotencyKey,
            @RequestBody InterviewTransitionBody body) {
        ResponseEntity<?> denied = authorize(auth, RecruiterAuthorization.Permission.INTERVIEW_MANAGE);
        if (denied != null) return denied;
        if (body == null || body.expectedVersion() == null) return badRequest("expectedVersion zorunlu");
        Outcome<WorkspaceResult> out = service.transition(
                tenantAccess.tenant(auth), tenantAccess.actor(auth), publicRef, interviewId,
                body.expectedVersion(), idempotencyKey, body.target(), body.reason());
        return workspaceResult(out, publicRef, false);
    }

    @GetMapping("/api/v1/interviews/{interviewId}/workspace")
    @ApiResponse(responseCode = "200", description = "Yalnız atanmış görüşmeci çalışma alanı",
            content = @Content(schema = @Schema(implementation = WorkspaceResponse.class)))
    ResponseEntity<?> assignedWorkspace(
            Authentication auth, @PathVariable("interviewId") String interviewId) {
        ResponseEntity<?> denied = authorize(auth, RecruiterAuthorization.Permission.INTERVIEW_VIEW);
        if (denied != null) return denied;
        var out = service.findAssigned(
                tenantAccess.tenant(auth), tenantAccess.actor(auth), interviewId);
        if (out instanceof Outcome.Fail<InterviewWorkspace> fail) return noStore(OutcomeHttp.fail(fail));
        return noStore(ResponseEntity.ok(workspaceResponse(
                ((Outcome.Ok<InterviewWorkspace>) out).value())));
    }

    @PostMapping("/api/v1/interviews/{interviewId}/scorecards")
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "İnsan scorecard revision'ı yazıldı",
                    content = @Content(schema = @Schema(implementation = ScorecardResponse.class))),
            @ApiResponse(responseCode = "200", description = "Idempotent scorecard replay",
                    headers = @Header(name = "X-ATS-Replay", description = "true"),
                    content = @Content(schema = @Schema(implementation = ScorecardResponse.class))),
            @ApiResponse(responseCode = "400", description = "Geçersiz veya eksik scorecard"),
            @ApiResponse(responseCode = "404", description = "Atanmış mülakat bulunamadı"),
            @ApiResponse(responseCode = "409", description = "Durum, rubric veya predecessor çakışması")
    })
    ResponseEntity<?> scorecard(
            Authentication auth,
            @PathVariable("interviewId") String interviewId,
            @Parameter(required = true)
            @RequestHeader(value = "X-ATS-Idempotency-Key", required = false) String idempotencyKey,
            @RequestBody ScorecardBody body) {
        ResponseEntity<?> denied = authorize(auth, RecruiterAuthorization.Permission.SCORECARD_WRITE);
        if (denied != null) return denied;
        ScorecardInput input = body == null ? null : new ScorecardInput(
                body.policyVersion(), body.jobRelatednessConfirmed(), body.recommendation(),
                body.ratings() == null ? List.of() : body.ratings().stream()
                        .map(r -> new Rating(r.criterionKey(), r.rating() == null ? 0 : r.rating(), r.evidence()))
                        .toList(),
                body.summary(), body.predecessorScorecardId());
        Outcome<ScorecardResult> out = service.submitScorecard(
                tenantAccess.tenant(auth), tenantAccess.actor(auth), interviewId,
                idempotencyKey, input);
        if (out instanceof Outcome.Fail<ScorecardResult> fail) return noStore(OutcomeHttp.fail(fail));
        ScorecardResult result = ((Outcome.Ok<ScorecardResult>) out).value();
        return switch (result.state()) {
            case CREATED -> noStore(ResponseEntity.status(HttpStatus.CREATED)
                    .body(scorecardResponse(result.scorecard())));
            case REPLAYED -> noStore(ResponseEntity.ok()
                    .header("X-ATS-Replay", "true")
                    .body(scorecardResponse(result.scorecard())));
            case NOT_ASSIGNED, NOT_FOUND -> noStore(ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(error("NOT_FOUND", "mülakat bulunamadı")));
            case IDEMPOTENCY_CONFLICT -> conflict("IDEMPOTENCY_CONFLICT",
                    "aynı anahtar farklı scorecard gövdesiyle kullanılamaz");
            case INTERVIEW_CLOSED -> conflict("INTERVIEW_CLOSED", "kapalı mülakata scorecard yazılamaz");
            case CRITERIA_MISMATCH -> conflict("CRITERIA_MISMATCH",
                    "scorecard rubric kriterlerinin tamamını exact içermeli");
            case PREDECESSOR_MISMATCH -> conflict("PREDECESSOR_MISMATCH",
                    "scorecard revision en güncel predecessor'a bağlanmalı");
        };
    }

    @GetMapping("/api/v1/candidate/applications/{publicRef}/interviews")
    @ApiResponse(responseCode = "200", description = "Aday-güvenli mülakat takvimi",
            content = @Content(array = @ArraySchema(
                    schema = @Schema(implementation = CandidateInterviewResponse.class))))
    ResponseEntity<?> candidateInterviews(
            @PathVariable("publicRef") String publicRef,
            @Parameter(required = true)
            @RequestHeader(value = "X-ATS-Candidate-Access", required = false) String candidateAccess) {
        var out = service.listCandidate(publicRef, candidateAccess);
        if (out instanceof Outcome.Fail<?> fail) return noStore(OutcomeHttp.fail(fail));
        @SuppressWarnings("unchecked")
        List<CandidateInterviewView> items =
                ((Outcome.Ok<List<CandidateInterviewView>>) out).value();
        return noStore(ResponseEntity.ok(items.stream()
                .map(InterviewWorkspaceApiController::candidateResponse).toList()));
    }

    private static WorkspaceResponse workspaceResponse(InterviewWorkspace value) {
        return new WorkspaceResponse(
                value.interviewId(), value.applicationPublicRef(), value.jobSlug(), value.jobTitle(),
                value.candidateName(), value.type(), value.startsAt(), value.endsAt(),
                value.timeZone(), value.mode(), value.location(), value.status(), value.version(),
                value.participants().stream().map(p -> new ParticipantResponse(
                        p.actorRef(), p.displayLabel(), p.role())).toList(),
                value.criteria().stream().map(c -> new CriterionResponse(
                        c.key(), c.label(), c.question(), c.evidencePrompt())).toList(),
                value.scorecards().stream()
                        .map(InterviewWorkspaceApiController::scorecardResponse).toList(),
                value.scheduleHistory().stream()
                        .map(InterviewWorkspaceApiController::scheduleRevisionResponse).toList(),
                value.createdAt(), value.updatedAt());
    }

    private static ScorecardResponse scorecardResponse(InterviewScorecard value) {
        return new ScorecardResponse(
                value.scorecardId(), value.interviewId(), value.actorRef(), value.participantLabel(),
                value.policyVersion(), value.jobRelatednessConfirmed(), value.recommendation(),
                value.ratings().stream().map(r -> new RatingResponse(
                        r.criterionKey(), r.rating(), r.evidence())).toList(),
                value.summary(), value.predecessorScorecardId(), value.revision(), value.createdAt());
    }

    private static ScheduleRevisionResponse scheduleRevisionResponse(ScheduleRevision value) {
        return new ScheduleRevisionResponse(
                value.version(), value.startsAt(), value.endsAt(), value.timeZone(), value.mode(),
                value.location(), value.status(), value.reason(), value.actorRef(), value.occurredAt());
    }

    private static CandidateInterviewResponse candidateResponse(CandidateInterviewView value) {
        return new CandidateInterviewResponse(
                value.interviewId(), value.type(), value.startsAt(), value.endsAt(),
                value.timeZone(), value.mode(), value.location(), value.status(), value.updatedAt());
    }

    private static ScheduleInput schedule(CreateBody body) {
        if (body == null) return null;
        List<Participant> participants = body.participants() == null ? List.of()
                : body.participants().stream().map(p -> new Participant(
                        p.actorRef(), p.displayLabel(), p.role())).toList();
        List<Criterion> criteria = body.criteria() == null ? List.of()
                : body.criteria().stream().map(c -> new Criterion(
                        c.key(), c.label(), c.question(), c.evidencePrompt())).toList();
        return new ScheduleInput(body.type(), body.startsAt(), body.endsAt(), body.timeZone(),
                body.mode(), body.location(), participants, criteria);
    }

    private ResponseEntity<?> authorize(
            Authentication auth, RecruiterAuthorization.Permission permission) {
        Outcome<Void> out = authorization.require(auth, permission);
        return out instanceof Outcome.Fail<Void> fail ? noStore(OutcomeHttp.fail(fail)) : null;
    }

    private static ResponseEntity<?> workspaceResult(
            Outcome<WorkspaceResult> out, String publicRef, boolean creating) {
        if (out instanceof Outcome.Fail<WorkspaceResult> fail) return noStore(OutcomeHttp.fail(fail));
        WorkspaceResult result = ((Outcome.Ok<WorkspaceResult>) out).value();
        return switch (result.state()) {
            case CREATED -> noStore(ResponseEntity.created(URI.create(
                    "/api/v1/recruiter/applications/" + publicRef + "/interviews/"
                            + result.workspace().interviewId()))
                    .body(workspaceResponse(result.workspace())));
            case UPDATED -> noStore(ResponseEntity.ok(workspaceResponse(result.workspace())));
            case REPLAYED -> noStore(ResponseEntity.ok()
                    .header("X-ATS-Replay", "true")
                    .body(workspaceResponse(result.workspace())));
            case NOT_FOUND -> noStore(ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(error("NOT_FOUND", "mülakat veya başvuru bulunamadı")));
            case VERSION_CONFLICT -> conflict("VERSION_CONFLICT", "mülakat sürümü değişti; yenileyin");
            case IDEMPOTENCY_CONFLICT -> conflict("IDEMPOTENCY_CONFLICT",
                    "aynı anahtar farklı mülakat komutuyla kullanılamaz");
            case ILLEGAL_TRANSITION -> conflict("ILLEGAL_TRANSITION",
                    creating ? "başvuru mülakat planlamaya hazır değil" : "mülakat bu durumda değiştirilemez");
            case INCOMPLETE_SCORECARDS -> conflict("INCOMPLETE_SCORECARDS",
                    "tamamlama için tüm atanmış katılımcıların scorecard'ı gerekli");
            case NOT_ASSIGNED -> noStore(ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(error("NOT_FOUND", "mülakat bulunamadı")));
        };
    }

    private static ResponseEntity<?> badRequest(String reason) {
        return noStore(ResponseEntity.badRequest().body(error("INVALID", reason)));
    }

    private static ResponseEntity<?> conflict(String code, String reason) {
        return noStore(ResponseEntity.status(HttpStatus.CONFLICT).body(error(code, reason)));
    }

    private static Map<String, String> error(String code, String reason) {
        return Map.of("error", code, "reason", reason);
    }

    private static ResponseEntity<?> noStore(ResponseEntity<?> response) {
        HttpHeaders headers = new HttpHeaders();
        headers.putAll(response.getHeaders());
        headers.setCacheControl(CacheControl.noStore());
        return new ResponseEntity<>(response.getBody(), headers, response.getStatusCode());
    }
}
