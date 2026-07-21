package com.ats.app.web;

import com.ats.application.JobPosting;
import com.ats.application.JobPostingService;
import com.ats.application.JobPostingService.JobDraft;
import com.ats.application.JobPostingStore.MutationResult;
import com.ats.application.JobPostingStore.MutationState;
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
import org.springframework.http.CacheControl;
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

/** Recruiter-facing ilan oluşturma, düzenleme ve yayınlama API'si. */
@RestController
@Tag(name = "recruiter-jobs", description = "Tenant-scoped ilan oluşturma ve yayınlama")
class JobPostingApiController {

    private final JobPostingService service;
    private final TenantAccess tenantAccess;
    private final RecruiterAuthorization authorization;

    JobPostingApiController(JobPostingService service, TenantAccess tenantAccess,
            RecruiterAuthorization authorization) {
        this.service = service;
        this.tenantAccess = tenantAccess;
        this.authorization = authorization;
    }

    @Schema(name = "RecruiterJobCreateRequest",
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record RecruiterJobCreateRequest(
            String slug,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minLength = 2, maxLength = 180)
            String title,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minLength = 2, maxLength = 120)
            String team,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minLength = 2, maxLength = 160)
            String location,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minLength = 2, maxLength = 80)
            String mode,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minLength = 2, maxLength = 80)
            String employmentType,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minLength = 20, maxLength = 8000)
            String summary,
            @ArraySchema(maxItems = 20, schema = @Schema(maxLength = 160))
            List<String> highlights,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED)
            @ArraySchema(schema = @Schema(allowableValues = {
                    "fullName", "email", "phone", "city", "linkedIn", "portfolio",
                    "summary", "experience", "education", "skills", "note"}))
            List<String> applicationFields,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED,
                    allowableValues = {"kvkk-application-v1"})
            String noticeVersion) {}

    @Schema(name = "RecruiterJobUpdateRequest",
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record RecruiterJobUpdateRequest(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minimum = "0")
            Integer expectedVersion,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED)
            String slug,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minLength = 2, maxLength = 180)
            String title,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minLength = 2, maxLength = 120)
            String team,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minLength = 2, maxLength = 160)
            String location,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minLength = 2, maxLength = 80)
            String mode,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minLength = 2, maxLength = 80)
            String employmentType,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minLength = 20, maxLength = 8000)
            String summary,
            @ArraySchema(maxItems = 20, schema = @Schema(maxLength = 160))
            List<String> highlights,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED)
            @ArraySchema(schema = @Schema(allowableValues = {
                    "fullName", "email", "phone", "city", "linkedIn", "portfolio",
                    "summary", "experience", "education", "skills", "note"}))
            List<String> applicationFields,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED,
                    allowableValues = {"kvkk-application-v1"})
            String noticeVersion) {}

    @Schema(name = "RecruiterJobTransitionRequest",
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record RecruiterJobTransitionRequest(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minimum = "0")
            Integer expectedVersion,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED,
                    allowableValues = {"PUBLISHED", "PAUSED", "CLOSED", "ARCHIVED"})
            String targetStatus) {}

    @Schema(name = "RecruiterJobResponse",
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record RecruiterJobResponse(
            String jobId,
            String publicHandle,
            String slug,
            String title,
            String team,
            String location,
            String mode,
            String employmentType,
            String summary,
            List<String> highlights,
            @ArraySchema(schema = @Schema(allowableValues = {
                    "fullName", "email", "phone", "city", "linkedIn", "portfolio",
                    "summary", "experience", "education", "skills", "note"}))
            List<String> applicationFields,
            @Schema(allowableValues = {"kvkk-application-v1"})
            String noticeVersion,
            @Schema(allowableValues = {"DRAFT", "PUBLISHED", "PAUSED", "CLOSED", "ARCHIVED"})
            String status,
            boolean applyEnabled,
            int version,
            String createdAt,
            String updatedAt) {}

    @GetMapping("/api/v1/recruiter/jobs")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Tenant ilanları",
                    content = @Content(array = @ArraySchema(
                            schema = @Schema(implementation = RecruiterJobResponse.class)))),
            @ApiResponse(responseCode = "401", description = "Kimlik doğrulanmadı"),
            @ApiResponse(responseCode = "403", description = "ATS görüntüleme yetkisi yok"),
            @ApiResponse(responseCode = "503", description = "Yetki doğrulama servisi kullanılamıyor")
    })
    ResponseEntity<?> listRecruiterJobs(Authentication auth) {
        ResponseEntity<?> denied = authorize(auth, RecruiterAuthorization.Permission.JOB_VIEW);
        if (denied != null) return denied;
        var tenant = tenantAccess.tenant(auth);
        Outcome<List<JobPosting>> out = service.list(tenant);
        if (out instanceof Outcome.Fail<List<JobPosting>> fail) return OutcomeHttp.fail(fail);
        String publicHandle = optionalPublicHandle(tenant);
        List<RecruiterJobResponse> jobs = ((Outcome.Ok<List<JobPosting>>) out).value().stream()
                .map(job -> dto(job, publicHandle))
                .toList();
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(jobs);
    }

    @GetMapping("/api/v1/recruiter/jobs/{jobId}")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "İlan",
                    content = @Content(schema = @Schema(implementation = RecruiterJobResponse.class))),
            @ApiResponse(responseCode = "400", description = "Geçersiz ilan kimliği"),
            @ApiResponse(responseCode = "401", description = "Kimlik doğrulanmadı"),
            @ApiResponse(responseCode = "403", description = "ATS görüntüleme yetkisi yok"),
            @ApiResponse(responseCode = "404", description = "İlan bulunamadı"),
            @ApiResponse(responseCode = "503", description = "Yetki doğrulama servisi kullanılamıyor")
    })
    ResponseEntity<?> getRecruiterJob(Authentication auth, @PathVariable("jobId") String jobId) {
        ResponseEntity<?> denied = authorize(auth, RecruiterAuthorization.Permission.JOB_VIEW);
        if (denied != null) return denied;
        var tenant = tenantAccess.tenant(auth);
        Outcome<JobPosting> out = service.find(tenant, jobId);
        if (out instanceof Outcome.Fail<JobPosting> fail) return OutcomeHttp.fail(fail);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(dto(((Outcome.Ok<JobPosting>) out).value(), optionalPublicHandle(tenant)));
    }

    @PostMapping("/api/v1/recruiter/jobs")
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Taslak ilan oluşturuldu",
                    content = @Content(schema = @Schema(implementation = RecruiterJobResponse.class))),
            @ApiResponse(responseCode = "200", description = "İdempotent create replay",
                    headers = @Header(name = "X-ATS-Replay", description = "true"),
                    content = @Content(schema = @Schema(implementation = RecruiterJobResponse.class))),
            @ApiResponse(responseCode = "400", description = "Geçersiz istek"),
            @ApiResponse(responseCode = "401", description = "Kimlik doğrulanmadı"),
            @ApiResponse(responseCode = "403", description = "ATS ilan yönetme yetkisi yok"),
            @ApiResponse(responseCode = "409", description = "Idempotency veya slug çakışması"),
            @ApiResponse(responseCode = "503", description = "Yetki doğrulama servisi kullanılamıyor")
    })
    ResponseEntity<?> createRecruiterJob(
            Authentication auth,
            @Parameter(required = true, description = "16..128 karakter komut idempotency anahtarı")
            @RequestHeader(value = "X-ATS-Idempotency-Key", required = false) String idempotencyKey,
            @RequestBody RecruiterJobCreateRequest body) {
        ResponseEntity<?> denied = authorize(auth, RecruiterAuthorization.Permission.JOB_MANAGE);
        if (denied != null) return denied;
        JobDraft draft = body == null ? null : new JobDraft(
                body.slug(), body.title(), body.team(), body.location(), body.mode(),
                body.employmentType(), body.summary(), body.highlights(),
                body.applicationFields(), body.noticeVersion());
        var tenant = tenantAccess.tenant(auth);
        Outcome<MutationResult> out = service.create(
                tenant, tenantAccess.actor(auth), idempotencyKey, draft);
        return mutation(out, HttpStatus.CREATED, optionalPublicHandle(tenant));
    }

    @PutMapping("/api/v1/recruiter/jobs/{jobId}")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "İlan güncellendi veya replay edildi",
                    headers = @Header(name = "X-ATS-Replay", description = "Replay ise true"),
                    content = @Content(schema = @Schema(implementation = RecruiterJobResponse.class))),
            @ApiResponse(responseCode = "400", description = "Geçersiz istek"),
            @ApiResponse(responseCode = "401", description = "Kimlik doğrulanmadı"),
            @ApiResponse(responseCode = "403", description = "ATS ilan yönetme yetkisi yok"),
            @ApiResponse(responseCode = "404", description = "İlan bulunamadı"),
            @ApiResponse(responseCode = "409", description = "Sürüm, durum, slug veya idempotency çakışması"),
            @ApiResponse(responseCode = "503", description = "Yetki doğrulama servisi kullanılamıyor")
    })
    ResponseEntity<?> updateRecruiterJob(
            Authentication auth,
            @PathVariable("jobId") String jobId,
            @Parameter(required = true, description = "16..128 karakter komut idempotency anahtarı")
            @RequestHeader(value = "X-ATS-Idempotency-Key", required = false) String idempotencyKey,
            @RequestBody RecruiterJobUpdateRequest body) {
        ResponseEntity<?> denied = authorize(auth, RecruiterAuthorization.Permission.JOB_MANAGE);
        if (denied != null) return denied;
        if (body == null || body.expectedVersion() == null || body.expectedVersion() < 0) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "INVALID", "reason", "expectedVersion zorunlu ve negatif olamaz"));
        }
        JobDraft draft = new JobDraft(
                body.slug(), body.title(), body.team(), body.location(), body.mode(),
                body.employmentType(), body.summary(), body.highlights(),
                body.applicationFields(), body.noticeVersion());
        var tenant = tenantAccess.tenant(auth);
        Outcome<MutationResult> out = service.update(
                tenant, tenantAccess.actor(auth), jobId,
                body.expectedVersion(), idempotencyKey, draft);
        return mutation(out, HttpStatus.OK, optionalPublicHandle(tenant));
    }

    @PostMapping("/api/v1/recruiter/jobs/{jobId}/transitions")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Durum değişti veya replay edildi",
                    headers = @Header(name = "X-ATS-Replay", description = "Replay ise true"),
                    content = @Content(schema = @Schema(implementation = RecruiterJobResponse.class))),
            @ApiResponse(responseCode = "400", description = "Geçersiz istek"),
            @ApiResponse(responseCode = "401", description = "Kimlik doğrulanmadı"),
            @ApiResponse(responseCode = "403", description = "ATS ilan yayınlama yetkisi yok"),
            @ApiResponse(responseCode = "404", description = "İlan bulunamadı"),
            @ApiResponse(responseCode = "409", description = "Sürüm, durum veya idempotency çakışması"),
            @ApiResponse(responseCode = "503", description = "Yetki doğrulama servisi kullanılamıyor")
    })
    ResponseEntity<?> transitionRecruiterJob(
            Authentication auth,
            @PathVariable("jobId") String jobId,
            @Parameter(required = true, description = "16..128 karakter komut idempotency anahtarı")
            @RequestHeader(value = "X-ATS-Idempotency-Key", required = false) String idempotencyKey,
            @RequestBody RecruiterJobTransitionRequest body) {
        ResponseEntity<?> denied = authorize(auth, RecruiterAuthorization.Permission.JOB_PUBLISH);
        if (denied != null) return denied;
        if (body == null || body.expectedVersion() == null || body.expectedVersion() < 0) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "INVALID", "reason", "expectedVersion zorunlu ve negatif olamaz"));
        }
        var tenant = tenantAccess.tenant(auth);
        Outcome<MutationResult> out = service.transition(
                tenant, tenantAccess.actor(auth), jobId,
                body.expectedVersion(), idempotencyKey, body.targetStatus());
        return mutation(out, HttpStatus.OK, optionalPublicHandle(tenant));
    }

    private static ResponseEntity<?> mutation(
            Outcome<MutationResult> out, HttpStatus successStatus, String publicHandle) {
        if (out instanceof Outcome.Fail<MutationResult> fail) return OutcomeHttp.fail(fail);
        MutationResult result = ((Outcome.Ok<MutationResult>) out).value();
        if (result.state() == MutationState.CREATED) {
            return ResponseEntity.status(successStatus).cacheControl(CacheControl.noStore())
                    .body(dto(result.job(), publicHandle));
        }
        if (result.state() == MutationState.UPDATED) {
            return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                    .body(dto(result.job(), publicHandle));
        }
        if (result.state() == MutationState.REPLAYED) {
            return ResponseEntity.ok().header("X-ATS-Replay", "true")
                    .cacheControl(CacheControl.noStore()).body(dto(result.job(), publicHandle));
        }
        if (result.state() == MutationState.NOT_FOUND) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "NOT_FOUND", "reason", "ilan bulunamadı"));
        }
        Map<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("error", result.state().name());
        if (result.job() != null) {
            body.put("currentStatus", result.job().status().name());
            body.put("currentVersion", result.job().version());
        }
        return ResponseEntity.status(HttpStatus.CONFLICT).body(body);
    }

    private static RecruiterJobResponse dto(JobPosting job, String publicHandle) {
        return new RecruiterJobResponse(
                job.jobId(), publicHandle, job.slug(), job.title(), job.team(), job.location(), job.mode(),
                job.employmentType(), job.summary(), job.highlights(), job.applicationFields(),
                job.noticeVersion(), job.status().name(),
                job.applyEnabled(), job.version(), job.createdAt(), job.updatedAt());
    }

    private String optionalPublicHandle(com.ats.kernel.Ids.TenantId tenantId) {
        Outcome<String> out = service.activeCareerHandle(tenantId);
        return out instanceof Outcome.Ok<String> ok ? ok.value() : null;
    }

    private ResponseEntity<?> authorize(
            Authentication auth, RecruiterAuthorization.Permission permission) {
        Outcome<Void> out = authorization.require(auth, permission);
        return out instanceof Outcome.Fail<Void> fail ? OutcomeHttp.fail(fail) : null;
    }
}
