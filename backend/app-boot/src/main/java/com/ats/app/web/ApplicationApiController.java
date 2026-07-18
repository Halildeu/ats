package com.ats.app.web;

import com.ats.application.ApplicationIntakeService;
import com.ats.application.ApplicationIntakeService.ApplicationReceipt;
import com.ats.application.ApplicationIntakeService.EvaluationSubmission;
import com.ats.application.ApplicationIntakeService.Submission;
import com.ats.application.ApplicationEvaluation;
import com.ats.application.ApplicationEvaluation.Criterion;
import com.ats.application.ApplicationEvaluation.Recommendation;
import com.ats.application.ApplicationStore.ApplicationPage;
import com.ats.application.ApplicationStore.ApplicationHistoryEvent;
import com.ats.application.ApplicationStore.CandidateStatusView;
import com.ats.application.ApplicationStore.CandidateTimelineEvent;
import com.ats.application.ApplicationStore.EvaluationResult;
import com.ats.application.ApplicationStore.EvaluationState;
import com.ats.application.ApplicationStore.RecruiterApplicationDetail;
import com.ats.application.ApplicationStore.RecruiterApplicationSummary;
import com.ats.application.ApplicationStore.TransitionResult;
import com.ats.application.ApplicationStore.TransitionState;
import com.ats.application.CandidateApplication;
import com.ats.application.JobPosting;
import com.ats.kernel.Outcome;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.headers.Header;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Full ATS customer vertical: careers, candidate tracking and recruiter inbox. */
@RestController
@Tag(name = "public-careers", description = "Tenant-handle bağlı public ilan ve başvuru")
class ApplicationApiController {

    private final ApplicationIntakeService service;
    private final TenantAccess tenantAccess;
    private final RecruiterAuthorization authorization;

    ApplicationApiController(ApplicationIntakeService service, TenantAccess tenantAccess,
            RecruiterAuthorization authorization) {
        this.service = service;
        this.tenantAccess = tenantAccess;
        this.authorization = authorization;
    }

    @Schema(name = "PublicJobResponse",
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record JobDto(String slug, String title, String team, String location, String mode,
            String employmentType, String summary, List<String> highlights,
            @io.swagger.v3.oas.annotations.media.ArraySchema(
                    schema = @Schema(allowableValues = {
                            "fullName", "email", "phone", "city", "linkedIn", "portfolio",
                            "summary", "experience", "education", "skills", "note"}))
            List<String> applicationFields,
            @Schema(allowableValues = {ApplicationIntakeService.NOTICE_VERSION})
            String noticeVersion) {}

    @GetMapping("/api/v1/jobs")
    @ApiResponse(responseCode = "200", description = "Varsayılan tenant yayınlanmış ilanları",
            content = @Content(array = @ArraySchema(
                    schema = @Schema(implementation = JobDto.class))))
    ResponseEntity<?> jobs() {
        return jobs(service.listPublishedJobs());
    }

    @GetMapping("/api/v1/careers/{publicHandle}/jobs")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Kariyer sitesi yayınlanmış ilanları",
                    content = @Content(array = @ArraySchema(
                            schema = @Schema(implementation = JobDto.class)))),
            @ApiResponse(responseCode = "404", description = "Aktif kariyer sitesi bulunamadı")
    })
    ResponseEntity<?> careerJobs(@PathVariable("publicHandle") String publicHandle) {
        return jobs(service.listPublishedJobs(publicHandle));
    }

    private ResponseEntity<?> jobs(Outcome<List<JobPosting>> out) {
        if (out instanceof Outcome.Fail<List<JobPosting>> fail) return OutcomeHttp.fail(fail);
        return ResponseEntity.ok(((Outcome.Ok<List<JobPosting>>) out).value().stream()
                .map(ApplicationApiController::jobDto).toList());
    }

    @GetMapping("/api/v1/jobs/{jobSlug}")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Yayınlanmış ilan",
                    content = @Content(schema = @Schema(implementation = JobDto.class))),
            @ApiResponse(responseCode = "404", description = "İlan bulunamadı")
    })
    ResponseEntity<?> job(@PathVariable("jobSlug") String jobSlug) {
        return job(service.findPublishedJob(jobSlug));
    }

    @GetMapping("/api/v1/careers/{publicHandle}/jobs/{jobSlug}")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Tenant-handle bağlı yayınlanmış ilan",
                    content = @Content(schema = @Schema(implementation = JobDto.class))),
            @ApiResponse(responseCode = "404", description = "Kariyer sitesi veya ilan bulunamadı")
    })
    ResponseEntity<?> careerJob(
            @PathVariable("publicHandle") String publicHandle,
            @PathVariable("jobSlug") String jobSlug) {
        return job(service.findPublishedJob(publicHandle, jobSlug));
    }

    private ResponseEntity<?> job(Outcome<JobPosting> out) {
        if (out instanceof Outcome.Fail<JobPosting> fail) return OutcomeHttp.fail(fail);
        return ResponseEntity.ok(jobDto(((Outcome.Ok<JobPosting>) out).value()));
    }

    @Schema(name = "ApplicationSubmitRequest",
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record SubmitBody(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String fullName,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String email,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String phone,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String city,
            String linkedIn,
            String portfolio,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String summary,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String experience,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String education,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<String> skills,
            String note,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED,
                    allowableValues = {ApplicationIntakeService.NOTICE_VERSION})
            String noticeVersion,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String noticeAcceptedAt,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String accuracyConfirmedAt,
            @Schema(pattern = "^ri_[A-Za-z0-9_-]{24}$") String resumeImportId,
            @Schema(minimum = "0") Integer resumeDraftVersion) {}

    @Schema(name = "ApplicationReceiptResponse",
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record ApplicationReceiptDto(
            String publicRef,
            String candidateAccessToken,
            @Schema(allowableValues = {"SUBMITTED"}) String status,
            int version,
            String submittedAt,
            boolean replayed) {}

    @PostMapping("/api/v1/jobs/{jobSlug}/applications")
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Başvuru kalıcı olarak oluşturuldu",
                    content = @Content(schema = @Schema(implementation = ApplicationReceiptDto.class))),
            @ApiResponse(responseCode = "200", description = "İdempotent başvuru replay",
                    headers = @Header(name = "X-ATS-Replay", description = "true"),
                    content = @Content(schema = @Schema(implementation = ApplicationReceiptDto.class))),
            @ApiResponse(responseCode = "400", description = "Geçersiz başvuru"),
            @ApiResponse(responseCode = "404", description = "Yayınlanmış ilan bulunamadı"),
            @ApiResponse(responseCode = "409", description = "Idempotency çakışması"),
            @ApiResponse(responseCode = "413", description = "İstek gövdesi çok büyük")
    })
    ResponseEntity<?> submit(@PathVariable("jobSlug") String jobSlug,
            @Parameter(required = true)
            @RequestHeader(value = "X-ATS-Idempotency-Key", required = false) String idempotencyKey,
            @Parameter(required = true)
            @RequestHeader(value = "X-ATS-Candidate-Access", required = false) String candidateAccessToken,
            @RequestBody SubmitBody body) {
        Submission submission = body == null ? null : new Submission(
                body.fullName(), body.email(), body.phone(), body.city(), body.linkedIn(),
                body.portfolio(), body.summary(), body.experience(), body.education(), body.skills(),
                body.note(), body.noticeVersion(), body.noticeAcceptedAt(), body.accuracyConfirmedAt(),
                body.resumeImportId(), body.resumeDraftVersion());
        return submit(service.submit(
                jobSlug, idempotencyKey, candidateAccessToken, submission));
    }

    @PostMapping("/api/v1/careers/{publicHandle}/jobs/{jobSlug}/applications")
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Tenant-handle bağlı başvuru oluşturuldu",
                    content = @Content(schema = @Schema(implementation = ApplicationReceiptDto.class))),
            @ApiResponse(responseCode = "200", description = "İdempotent başvuru replay",
                    headers = @Header(name = "X-ATS-Replay", description = "true"),
                    content = @Content(schema = @Schema(implementation = ApplicationReceiptDto.class))),
            @ApiResponse(responseCode = "400", description = "Geçersiz başvuru"),
            @ApiResponse(responseCode = "404", description = "Kariyer sitesi veya ilan bulunamadı"),
            @ApiResponse(responseCode = "409", description = "Idempotency çakışması"),
            @ApiResponse(responseCode = "413", description = "İstek gövdesi çok büyük")
    })
    ResponseEntity<?> submitToCareer(
            @PathVariable("publicHandle") String publicHandle,
            @PathVariable("jobSlug") String jobSlug,
            @Parameter(required = true)
            @RequestHeader(value = "X-ATS-Idempotency-Key", required = false) String idempotencyKey,
            @Parameter(required = true)
            @RequestHeader(value = "X-ATS-Candidate-Access", required = false) String candidateAccessToken,
            @RequestBody SubmitBody body) {
        Submission submission = body == null ? null : new Submission(
                body.fullName(), body.email(), body.phone(), body.city(), body.linkedIn(),
                body.portfolio(), body.summary(), body.experience(), body.education(), body.skills(),
                body.note(), body.noticeVersion(), body.noticeAcceptedAt(), body.accuracyConfirmedAt(),
                body.resumeImportId(), body.resumeDraftVersion());
        return submit(service.submit(
                publicHandle, jobSlug, idempotencyKey, candidateAccessToken, submission));
    }

    private ResponseEntity<?> submit(Outcome<ApplicationReceipt> out) {
        if (out instanceof Outcome.Fail<ApplicationReceipt> fail) {
            if (fail.reason().startsWith("IDEMPOTENCY_CONFLICT:")) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                        .body(Map.of("error", "IDEMPOTENCY_CONFLICT", "reason", fail.reason()));
            }
            return OutcomeHttp.fail(fail);
        }
        ApplicationReceipt receipt = ((Outcome.Ok<ApplicationReceipt>) out).value();
        ResponseEntity.BodyBuilder response = receipt.replayed()
                ? ResponseEntity.ok().header("X-ATS-Replay", "true")
                : ResponseEntity.status(HttpStatus.CREATED);
        return response.cacheControl(CacheControl.noStore()).body(new ApplicationReceiptDto(
                receipt.publicRef(), receipt.candidateAccessToken(), receipt.status().name(),
                receipt.version(), receipt.submittedAt(), receipt.replayed()));
    }

    @GetMapping("/api/v1/candidate/applications/{publicRef}")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Aday-görünür durum ve geçmiş",
                    content = @Content(schema = @Schema(implementation = CandidateStatusDto.class))),
            @ApiResponse(responseCode = "404", description = "Başvuru bulunamadı")
    })
    ResponseEntity<?> candidateStatus(
            @PathVariable("publicRef") String publicRef,
            @Parameter(required = true)
            @RequestHeader(value = "X-ATS-Candidate-Access", required = false) String token) {
        Outcome<CandidateStatusView> out = service.candidateStatus(publicRef, token);
        if (out instanceof Outcome.Fail<CandidateStatusView> fail) return OutcomeHttp.fail(fail);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(candidateStatusDto(((Outcome.Ok<CandidateStatusView>) out).value()));
    }

    @Schema(name = "CandidateApplicationTimelineEventResponse",
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record CandidateTimelineDto(
            @Schema(allowableValues = {
                    "SUBMITTED", "UNDER_REVIEW", "INTERVIEW_PENDING", "REJECTED", "WITHDRAWN"})
            String status,
            String occurredAt) {}

    @Schema(name = "CandidateApplicationStatusResponse",
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record CandidateStatusDto(
            String publicRef,
            String jobSlug,
            String jobTitle,
            @Schema(allowableValues = {
                    "SUBMITTED", "UNDER_REVIEW", "INTERVIEW_PENDING", "REJECTED", "WITHDRAWN"})
            String status,
            int version,
            String createdAt,
            String updatedAt,
            List<CandidateTimelineDto> history,
            @Schema(allowableValues = {"WAIT_FOR_REVIEW", "PREPARE_FOR_INTERVIEW", "NONE"})
            String nextAction,
            boolean withdrawalAllowed) {}

    @PutMapping("/api/v1/candidate/applications/{publicRef}/withdraw")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Başvuru geri çekildi veya replay",
                    content = @Content(schema = @Schema(implementation = CandidateStatusDto.class))),
            @ApiResponse(responseCode = "404", description = "Başvuru bulunamadı"),
            @ApiResponse(responseCode = "409", description = "Terminal başvuru geri çekilemez")
    })
    ResponseEntity<?> withdrawCandidate(
            @PathVariable("publicRef") String publicRef,
            @Parameter(required = true)
            @RequestHeader(value = "X-ATS-Candidate-Access", required = false) String token) {
        Outcome<TransitionResult> out = service.withdraw(publicRef, token);
        if (out instanceof Outcome.Fail<TransitionResult> fail) return OutcomeHttp.fail(fail);
        TransitionResult result = ((Outcome.Ok<TransitionResult>) out).value();
        if (result.state() == TransitionState.NOT_FOUND) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "NOT_FOUND", "reason", "başvuru bulunamadı"));
        }
        if (result.state() == TransitionState.ILLEGAL_TRANSITION) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of(
                    "error", "ILLEGAL_TRANSITION",
                    "currentStatus", result.application().status().name(),
                    "currentVersion", result.application().version()));
        }
        Outcome<CandidateStatusView> current = service.candidateStatus(publicRef, token);
        if (current instanceof Outcome.Fail<CandidateStatusView> fail) return OutcomeHttp.fail(fail);
        ResponseEntity.BodyBuilder response = ResponseEntity.ok().cacheControl(CacheControl.noStore());
        if (result.state() == TransitionState.REPLAYED) response.header("X-ATS-Replay", "true");
        return response.body(candidateStatusDto(((Outcome.Ok<CandidateStatusView>) current).value()));
    }

    @Schema(name = "RecruiterApplicationResponse",
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record RecruiterApplicationDto(
            String publicRef, String jobSlug, String jobTitle, String fullName, String email,
            String phone, String city, String linkedIn, String portfolio, String summary,
            String experience, String education, List<String> skills, String note,
            @Schema(allowableValues = {
                    "SUBMITTED", "UNDER_REVIEW", "INTERVIEW_PENDING", "REJECTED", "WITHDRAWN"})
            String status, int version, String createdAt, String updatedAt) {}

    @Schema(name = "RecruiterApplicationSummaryResponse",
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record RecruiterApplicationSummaryDto(
            String publicRef, String jobSlug, String jobTitle, String fullName, String email,
            String city, List<String> skills,
            @Schema(allowableValues = {
                    "SUBMITTED", "UNDER_REVIEW", "INTERVIEW_PENDING", "REJECTED", "WITHDRAWN"})
            String status, int version,
            String createdAt, String updatedAt) {}

    @Schema(name = "RecruiterApplicationPageResponse",
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record RecruiterPageDto(
            List<RecruiterApplicationSummaryDto> items, int page, int size, long total) {}

    @Schema(name = "RecruiterApplicationHistoryEventResponse",
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record RecruiterHistoryDto(
            long eventId,
            String fromStatus,
            String toStatus,
            String actorRef,
            String occurredAt) {}

    @Schema(name = "RecruiterApplicationEvaluationCriterionResponse",
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record EvaluationCriterionDto(String key, String label, int rating, String evidence) {}

    @Schema(name = "RecruiterApplicationEvaluationResponse",
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record EvaluationDto(
            String evaluationId,
            String actorRef,
            @Schema(allowableValues = {"structured-evaluation-v1"})
            String policyVersion,
            boolean jobRelatednessConfirmed,
            @Schema(allowableValues = {"ADVANCE", "HOLD", "NO_HIRE"})
            String recommendation,
            List<EvaluationCriterionDto> criteria,
            String summary,
            String predecessorEvaluationId,
            int revision,
            String createdAt) {}

    @Schema(name = "RecruiterApplicationDetailResponse",
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record RecruiterDetailDto(
            RecruiterApplicationDto application,
            List<RecruiterHistoryDto> history,
            List<EvaluationDto> evaluations) {}

    @GetMapping("/api/v1/recruiter/applications")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "PII-minimize recruiter inbox",
                    content = @Content(schema = @Schema(implementation = RecruiterPageDto.class))),
            @ApiResponse(responseCode = "401", description = "Kimlik doğrulanmadı"),
            @ApiResponse(responseCode = "403", description = "ATS başvuru görüntüleme yetkisi yok"),
            @ApiResponse(responseCode = "503", description = "Yetki doğrulama servisi kullanılamıyor")
    })
    ResponseEntity<?> recruiterInbox(Authentication auth,
            @RequestParam(value = "jobSlug", required = false) String jobSlug,
            @RequestParam(value = "status", required = false) String status,
            @RequestParam(value = "page", defaultValue = "0") int page,
            @RequestParam(value = "size", defaultValue = "20") int size) {
        Outcome<Void> allowed = authorization.require(
                auth, RecruiterAuthorization.Permission.APPLICATION_VIEW);
        if (allowed instanceof Outcome.Fail<Void> fail) return OutcomeHttp.fail(fail);
        Outcome<ApplicationPage> out = service.recruiterInbox(
                tenantAccess.tenant(auth), jobSlug, status, page, size);
        if (out instanceof Outcome.Fail<ApplicationPage> fail) return OutcomeHttp.fail(fail);
        ApplicationPage result = ((Outcome.Ok<ApplicationPage>) out).value();
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(new RecruiterPageDto(
                result.items().stream().map(ApplicationApiController::recruiterSummaryDto).toList(),
                result.page(), result.size(), result.total()));
    }

    @GetMapping("/api/v1/recruiter/applications/{publicRef}")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Tenant-bound başvuru detayı",
                    content = @Content(schema = @Schema(implementation = RecruiterDetailDto.class))),
            @ApiResponse(responseCode = "401", description = "Kimlik doğrulanmadı"),
            @ApiResponse(responseCode = "403", description = "ATS başvuru görüntüleme yetkisi yok"),
            @ApiResponse(responseCode = "404", description = "Başvuru bulunamadı"),
            @ApiResponse(responseCode = "503", description = "Yetki doğrulama servisi kullanılamıyor")
    })
    ResponseEntity<?> recruiterApplication(
            Authentication auth, @PathVariable("publicRef") String publicRef) {
        Outcome<Void> allowed = authorization.require(
                auth, RecruiterAuthorization.Permission.APPLICATION_VIEW);
        if (allowed instanceof Outcome.Fail<Void> fail) return OutcomeHttp.fail(fail);
        Outcome<RecruiterApplicationDetail> out = service.recruiterApplication(
                tenantAccess.tenant(auth), publicRef);
        if (out instanceof Outcome.Fail<RecruiterApplicationDetail> fail) {
            return OutcomeHttp.fail(fail);
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(recruiterDetailDto(
                        ((Outcome.Ok<RecruiterApplicationDetail>) out).value()));
    }

    @Schema(name = "RecruiterApplicationStatusRequest",
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record StatusBody(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minimum = "0")
            Integer expectedVersion,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED,
                    allowableValues = {"UNDER_REVIEW", "INTERVIEW_PENDING", "REJECTED"})
            String toStatus) {}

    @Schema(name = "RecruiterApplicationEvaluationCriterionRequest",
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record EvaluationCriterionBody(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED,
                    pattern = "^[a-z][a-z0-9_-]{1,63}$")
            String key,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED,
                    minLength = 2, maxLength = 120)
            String label,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minimum = "1", maximum = "4")
            Integer rating,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED,
                    minLength = 10, maxLength = 2000)
            String evidence) {}

    @Schema(name = "RecruiterApplicationEvaluationRequest",
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record EvaluationBody(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED,
                    allowableValues = {"structured-evaluation-v1"})
            String policyVersion,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED)
            Boolean jobRelatednessConfirmed,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED,
                    allowableValues = {"ADVANCE", "HOLD", "NO_HIRE"})
            String recommendation,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED)
            @ArraySchema(minItems = 1, maxItems = 12,
                    schema = @Schema(implementation = EvaluationCriterionBody.class))
            List<EvaluationCriterionBody> criteria,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED,
                    minLength = 10, maxLength = 4000)
            String summary,
            @Schema(pattern = "^eval_[A-Za-z0-9_-]{24}$")
            String predecessorEvaluationId) {}

    @PutMapping("/api/v1/recruiter/applications/{publicRef}/status")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "İnsan kontrollü durum değişti",
                    content = @Content(schema = @Schema(implementation = RecruiterApplicationDto.class))),
            @ApiResponse(responseCode = "400", description = "Geçersiz durum komutu"),
            @ApiResponse(responseCode = "401", description = "Kimlik doğrulanmadı"),
            @ApiResponse(responseCode = "403", description = "ATS başvuru yönetme yetkisi yok"),
            @ApiResponse(responseCode = "404", description = "Başvuru bulunamadı"),
            @ApiResponse(responseCode = "409", description = "Sürüm veya geçiş çakışması"),
            @ApiResponse(responseCode = "503", description = "Yetki doğrulama servisi kullanılamıyor")
    })
    ResponseEntity<?> updateStatus(Authentication auth,
            @PathVariable("publicRef") String publicRef,
            @RequestBody StatusBody body) {
        Outcome<Void> allowed = authorization.require(
                auth, RecruiterAuthorization.Permission.APPLICATION_MANAGE);
        if (allowed instanceof Outcome.Fail<Void> fail) return OutcomeHttp.fail(fail);
        if (body == null || body.expectedVersion() == null || body.expectedVersion() < 0) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "INVALID",
                    "reason", "expectedVersion zorunlu ve negatif olamaz"));
        }
        Outcome<TransitionResult> out = service.transition(
                tenantAccess.tenant(auth), tenantAccess.actor(auth), publicRef,
                body.expectedVersion(), body.toStatus());
        if (out instanceof Outcome.Fail<TransitionResult> fail) return OutcomeHttp.fail(fail);
        TransitionResult result = ((Outcome.Ok<TransitionResult>) out).value();
        if (result.state() == TransitionState.NOT_FOUND) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "NOT_FOUND", "reason", "başvuru bulunamadı"));
        }
        if (result.state() != TransitionState.UPDATED) {
            Map<String, Object> bodyMap = new java.util.LinkedHashMap<>();
            bodyMap.put("error", result.state().name());
            if (result.application() != null) {
                bodyMap.put("currentStatus", result.application().status().name());
                bodyMap.put("currentVersion", result.application().version());
            }
            return ResponseEntity.status(HttpStatus.CONFLICT).body(bodyMap);
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(recruiterDto(result.application()));
    }

    @PostMapping("/api/v1/recruiter/applications/{publicRef}/evaluations")
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Immutable değerlendirme oluşturuldu",
                    content = @Content(schema = @Schema(implementation = EvaluationDto.class))),
            @ApiResponse(responseCode = "200", description = "İdempotent değerlendirme replay",
                    headers = @Header(name = "X-ATS-Replay", description = "true"),
                    content = @Content(schema = @Schema(implementation = EvaluationDto.class))),
            @ApiResponse(responseCode = "400", description = "Geçersiz değerlendirme"),
            @ApiResponse(responseCode = "401", description = "Kimlik doğrulanmadı"),
            @ApiResponse(responseCode = "403", description = "ATS başvuru yönetme yetkisi yok"),
            @ApiResponse(responseCode = "404", description = "Başvuru bulunamadı"),
            @ApiResponse(responseCode = "409", description = "Idempotency, predecessor veya durum çakışması"),
            @ApiResponse(responseCode = "503", description = "Yetki doğrulama servisi kullanılamıyor")
    })
    ResponseEntity<?> submitEvaluation(
            Authentication auth,
            @PathVariable("publicRef") String publicRef,
            @Parameter(required = true)
            @RequestHeader(value = "X-ATS-Idempotency-Key", required = false)
            String idempotencyKey,
            @RequestBody EvaluationBody body) {
        Outcome<Void> allowed = authorization.require(
                auth, RecruiterAuthorization.Permission.APPLICATION_MANAGE);
        if (allowed instanceof Outcome.Fail<Void> fail) return OutcomeHttp.fail(fail);
        Recommendation recommendation = null;
        if (body != null && body.recommendation() != null) {
            try {
                recommendation = Recommendation.valueOf(body.recommendation());
            } catch (IllegalArgumentException ignored) {
                // Domain validation returns the canonical fail-closed 400.
            }
        }
        List<Criterion> criteria = body == null || body.criteria() == null
                ? List.of()
                : body.criteria().stream()
                        .map(item -> new Criterion(
                                item.key(), item.label(), item.rating() == null ? 0 : item.rating(),
                                item.evidence()))
                        .toList();
        EvaluationSubmission submission = body == null ? null : new EvaluationSubmission(
                body.policyVersion(), body.jobRelatednessConfirmed(), recommendation, criteria,
                body.summary(), body.predecessorEvaluationId());
        Outcome<EvaluationResult> out = service.submitEvaluation(
                tenantAccess.tenant(auth), tenantAccess.actor(auth), publicRef,
                idempotencyKey, submission);
        if (out instanceof Outcome.Fail<EvaluationResult> fail) return OutcomeHttp.fail(fail);
        EvaluationResult result = ((Outcome.Ok<EvaluationResult>) out).value();
        return switch (result.state()) {
            case CREATED -> ResponseEntity.status(HttpStatus.CREATED)
                    .cacheControl(CacheControl.noStore()).body(evaluationDto(result.evaluation()));
            case REPLAYED -> ResponseEntity.ok().header("X-ATS-Replay", "true")
                    .cacheControl(CacheControl.noStore()).body(evaluationDto(result.evaluation()));
            case NOT_FOUND -> ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "NOT_FOUND", "reason", "başvuru bulunamadı"));
            case IDEMPOTENCY_CONFLICT -> ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "IDEMPOTENCY_CONFLICT"));
            case APPLICATION_CLOSED -> ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "APPLICATION_CLOSED"));
            case PREDECESSOR_CONFLICT -> {
                Map<String, Object> response = new java.util.LinkedHashMap<>();
                response.put("error", "PREDECESSOR_CONFLICT");
                if (result.evaluation() != null) {
                    response.put("currentEvaluation", evaluationDto(result.evaluation()));
                }
                yield ResponseEntity.status(HttpStatus.CONFLICT).body(response);
            }
        };
    }

    private static JobDto jobDto(JobPosting job) {
        return new JobDto(job.slug(), job.title(), job.team(), job.location(), job.mode(),
                job.employmentType(), job.summary(), job.highlights(), job.applicationFields(),
                job.noticeVersion());
    }

    private static RecruiterApplicationDto recruiterDto(CandidateApplication app) {
        return new RecruiterApplicationDto(
                app.publicRef(), app.jobSlug(), app.jobTitle(), app.fullName(), app.email(),
                app.phone(), app.city(), app.linkedIn(), app.portfolio(), app.summary(),
                app.experience(), app.education(), app.skills(), app.note(), app.status().name(),
                app.version(), app.createdAt(), app.updatedAt());
    }

    private static RecruiterApplicationSummaryDto recruiterSummaryDto(
            RecruiterApplicationSummary app) {
        return new RecruiterApplicationSummaryDto(
                app.publicRef(), app.jobSlug(), app.jobTitle(), app.fullName(), app.email(),
                app.city(), app.skills(), app.status().name(), app.version(),
                app.createdAt(), app.updatedAt());
    }

    private static CandidateStatusDto candidateStatusDto(CandidateStatusView status) {
        return new CandidateStatusDto(
                status.publicRef(), status.jobSlug(), status.jobTitle(), status.status().name(),
                status.version(), status.createdAt(), status.updatedAt(),
                status.history().stream().map(ApplicationApiController::candidateTimelineDto).toList(),
                status.nextAction(), status.withdrawalAllowed());
    }

    private static CandidateTimelineDto candidateTimelineDto(CandidateTimelineEvent event) {
        return new CandidateTimelineDto(event.status().name(), event.occurredAt());
    }

    private static RecruiterDetailDto recruiterDetailDto(RecruiterApplicationDetail detail) {
        return new RecruiterDetailDto(
                recruiterDto(detail.application()),
                detail.history().stream().map(ApplicationApiController::historyDto).toList(),
                detail.evaluations().stream().map(ApplicationApiController::evaluationDto).toList());
    }

    private static RecruiterHistoryDto historyDto(ApplicationHistoryEvent event) {
        return new RecruiterHistoryDto(
                event.eventId(),
                event.fromStatus() == null ? null : event.fromStatus().name(),
                event.toStatus().name(), event.actorRef(), event.occurredAt());
    }

    private static EvaluationDto evaluationDto(ApplicationEvaluation evaluation) {
        return new EvaluationDto(
                evaluation.evaluationId(), evaluation.actorRef(), evaluation.policyVersion(),
                evaluation.jobRelatednessConfirmed(), evaluation.recommendation().name(),
                evaluation.criteria().stream()
                        .map(item -> new EvaluationCriterionDto(
                                item.key(), item.label(), item.rating(), item.evidence()))
                        .toList(),
                evaluation.summary(), evaluation.predecessorEvaluationId(),
                evaluation.revision(), evaluation.createdAt());
    }
}
