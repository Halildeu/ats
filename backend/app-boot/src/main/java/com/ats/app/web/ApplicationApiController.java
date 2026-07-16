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
class ApplicationApiController {

    private final ApplicationIntakeService service;
    private final TenantAccess tenantAccess;

    ApplicationApiController(ApplicationIntakeService service, TenantAccess tenantAccess) {
        this.service = service;
        this.tenantAccess = tenantAccess;
    }

    record JobDto(String slug, String title, String team, String location, String mode,
            String employmentType, String summary, List<String> highlights) {}

    @GetMapping("/api/v1/jobs")
    ResponseEntity<?> jobs() {
        Outcome<List<JobPosting>> out = service.listPublishedJobs();
        if (out instanceof Outcome.Fail<List<JobPosting>> fail) return OutcomeHttp.fail(fail);
        return ResponseEntity.ok(((Outcome.Ok<List<JobPosting>>) out).value().stream()
                .map(ApplicationApiController::jobDto).toList());
    }

    @GetMapping("/api/v1/jobs/{jobSlug}")
    ResponseEntity<?> job(@PathVariable("jobSlug") String jobSlug) {
        Outcome<JobPosting> out = service.findPublishedJob(jobSlug);
        if (out instanceof Outcome.Fail<JobPosting> fail) return OutcomeHttp.fail(fail);
        return ResponseEntity.ok(jobDto(((Outcome.Ok<JobPosting>) out).value()));
    }

    record SubmitBody(String fullName, String email, String phone, String city, String linkedIn,
            String portfolio, String summary, String experience, String education,
            List<String> skills, String note, String noticeVersion, String noticeAcceptedAt,
            String accuracyConfirmedAt) {}

    @PostMapping("/api/v1/jobs/{jobSlug}/applications")
    ResponseEntity<?> submit(@PathVariable("jobSlug") String jobSlug,
            @RequestHeader(value = "X-ATS-Idempotency-Key", required = false) String idempotencyKey,
            @RequestHeader(value = "X-ATS-Candidate-Access", required = false) String candidateAccessToken,
            @RequestBody SubmitBody body) {
        Submission submission = body == null ? null : new Submission(
                body.fullName(), body.email(), body.phone(), body.city(), body.linkedIn(),
                body.portfolio(), body.summary(), body.experience(), body.education(), body.skills(),
                body.note(), body.noticeVersion(), body.noticeAcceptedAt(), body.accuracyConfirmedAt());
        Outcome<ApplicationReceipt> out = service.submit(
                jobSlug, idempotencyKey, candidateAccessToken, submission);
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
        return response.cacheControl(CacheControl.noStore()).body(receipt);
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
        Outcome<ApplicationPage> out = service.recruiterInbox(
                tenantAccess.tenant(auth), jobSlug, status, page, size);
        if (out instanceof Outcome.Fail<ApplicationPage> fail) return OutcomeHttp.fail(fail);
        ApplicationPage result = ((Outcome.Ok<ApplicationPage>) out).value();
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(new RecruiterPageDto(
                result.items().stream().map(ApplicationApiController::recruiterDto).toList(),
                result.page(), result.size(), result.total()));
    }

    record StatusBody(int expectedVersion, String toStatus) {}

    @PutMapping("/api/v1/recruiter/applications/{publicRef}/status")
    ResponseEntity<?> updateStatus(Authentication auth,
            @PathVariable("publicRef") String publicRef,
            @RequestBody StatusBody body) {
        if (body == null) return ResponseEntity.badRequest().body(Map.of("error", "INVALID"));
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
                job.employmentType(), job.summary(), job.highlights());
    }

    private static RecruiterApplicationDto recruiterDto(CandidateApplication app) {
        return new RecruiterApplicationDto(
                app.publicRef(), app.jobSlug(), app.jobTitle(), app.fullName(), app.email(),
                app.phone(), app.city(), app.linkedIn(), app.portfolio(), app.summary(),
                app.experience(), app.education(), app.skills(), app.note(), app.status().name(),
                app.version(), app.createdAt(), app.updatedAt());
    }
}
