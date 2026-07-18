package com.ats.app.web;

import com.ats.application.ApplicationIntakeService;
import com.ats.application.ApplicationIntakeService.ApplicationReceipt;
import com.ats.application.ApplicationIntakeService.Submission;
import com.ats.application.ApplicationStore.ApplicationPage;
import com.ats.application.ApplicationStore.CandidateStatusView;
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
    ResponseEntity<?> candidateStatus(
            @PathVariable("publicRef") String publicRef,
            @RequestHeader(value = "X-ATS-Candidate-Access", required = false) String token) {
        Outcome<CandidateStatusView> out = service.candidateStatus(publicRef, token);
        if (out instanceof Outcome.Fail<CandidateStatusView> fail) return OutcomeHttp.fail(fail);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(((Outcome.Ok<CandidateStatusView>) out).value());
    }

    record RecruiterApplicationDto(
            String publicRef, String jobSlug, String jobTitle, String fullName, String email,
            String phone, String city, String linkedIn, String portfolio, String summary,
            String experience, String education, List<String> skills, String note,
            String status, int version, String createdAt, String updatedAt) {}

    record RecruiterPageDto(List<RecruiterApplicationDto> items, int page, int size, long total) {}

    @GetMapping("/api/v1/recruiter/applications")
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
                result.items().stream().map(ApplicationApiController::recruiterDto).toList(),
                result.page(), result.size(), result.total()));
    }

    @Schema(name = "RecruiterApplicationStatusRequest",
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record StatusBody(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minimum = "0")
            Integer expectedVersion,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED,
                    allowableValues = {"UNDER_REVIEW", "INTERVIEW_PENDING"})
            String toStatus) {}

    @PutMapping("/api/v1/recruiter/applications/{publicRef}/status")
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
}
