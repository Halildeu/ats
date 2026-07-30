package com.ats.app.web;

import com.ats.application.ApplicationQuestion;
import com.ats.application.QuestionTextAdvisor;
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

    private final QuestionTextAdvisor questionAdvisor;

    JobPostingApiController(JobPostingService service, TenantAccess tenantAccess,
            RecruiterAuthorization authorization, QuestionTextAdvisor questionAdvisor) {
        this.service = service;
        this.tenantAccess = tenantAccess;
        this.authorization = authorization;
        this.questionAdvisor = questionAdvisor;
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
            String noticeVersion,
            @ArraySchema(maxItems = 10, arraySchema = @Schema(
                    description = "#240: ilana özel başvuru soruları. Boş/yok = soru sorulmaz."))
            List<JobQuestionBody> questions) {}

    /**
     * #240 dilim A: ilana özel başvuru sorusu. YALNIZ soru — otomatik eleme
     * kapsam dışıdır (EU AI Act + KVKK insan kontrolü ilkesi); cevaplar İK'ya
     * gösterilir, karar insanda kalır.
     */
    @Schema(name = "RecruiterJobQuestion",
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record JobQuestionBody(
            @Schema(description = "Adayın gördüğü sıra. Sunucu 1..n olarak YENİDEN "
                    + "numaralandırır; boşluklu/çakışan değer gönderilebilir.",
                    minimum = "1", maximum = "10") Integer position,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minLength = 5, maxLength = 300)
            String text,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED,
                    allowableValues = {"SHORT_TEXT", "LONG_TEXT", "YES_NO", "SINGLE_CHOICE"})
            String kind,
            @Schema(description = "Zorunlu soru: aday cevaplamadan gönderemez.") Boolean required,
            @ArraySchema(maxItems = 8, schema = @Schema(maxLength = 120),
                    arraySchema = @Schema(description = "Yalnız SINGLE_CHOICE için; "
                            + "2..8 benzersiz seçenek. Diğer tiplerde yok sayılır."))
            List<String> options) {}

    @Schema(name = "RecruiterJobQuestionWarning",
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record JobQuestionWarningBody(
            @Schema(description = "Uyarının ait olduğu sorunun sırası") int position,
            @Schema(description = "Korunan kategori ya da ADVISOR_UNAVAILABLE") String category,
            @Schema(description = "Sinyal türü. Eşleşen HAM METİN taşınmaz — screening "
                    + "modülünün açık sınırı.") String signal) {}

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
            String noticeVersion,
            @ArraySchema(maxItems = 10, arraySchema = @Schema(
                    description = "#240: ilana özel başvuru soruları. Boş/yok = soru sorulmaz."))
            List<JobQuestionBody> questions) {}

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
            @ArraySchema(maxItems = 10) List<JobQuestionBody> questions,
            @ArraySchema(arraySchema = @Schema(description = "#240: soru metni korunan bir "
                    + "özelliği çağrıştırıyorsa uyarı. YAZMA yanıtlarında dolar; okuma "
                    + "yanıtlarında daima boştur (uyarı kayıt anının bulgusudur). Kaydı "
                    + "ENGELLEMEZ — karar İK'da. Boş liste 'uyarı yok' demektir; motor "
                    + "kullanılamıyorsa ADVISOR_UNAVAILABLE gelir, sessiz 'temiz' YOK."))
            List<JobQuestionWarningBody> questionWarnings,
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
                body.applicationFields(), body.noticeVersion(), questions(body.questions()));
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
                body.applicationFields(), body.noticeVersion(), questions(body.questions()));
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

    /**
     * #240: uyarılar YAZMA yanıtında döner. Kaydı engellemez; kararı İK verir.
     * Kaydedilen sorular üzerinden hesaplanır (istemcinin gönderdiği ham liste
     * üzerinden değil) — böylece normalizasyondan sonra gerçekte NE kaydedildiyse
     * onun uyarısı görünür.
     */
    private ResponseEntity<?> mutation(
            Outcome<MutationResult> out, HttpStatus successStatus, String publicHandle) {
        if (out instanceof Outcome.Fail<MutationResult> fail) return OutcomeHttp.fail(fail);
        MutationResult result = ((Outcome.Ok<MutationResult>) out).value();
        if (result.state() == MutationState.CREATED) {
            return ResponseEntity.status(successStatus).cacheControl(CacheControl.noStore())
                    .body(dto(result.job(), publicHandle, warnings(result)));
        }
        if (result.state() == MutationState.UPDATED) {
            return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                    .body(dto(result.job(), publicHandle, warnings(result)));
        }
        if (result.state() == MutationState.REPLAYED) {
            return ResponseEntity.ok().header("X-ATS-Replay", "true")
                    .cacheControl(CacheControl.noStore())
                    .body(dto(result.job(), publicHandle, warnings(result)));
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
        return dto(job, publicHandle, List.of());
    }

    private static RecruiterJobResponse dto(
            JobPosting job, String publicHandle, List<QuestionTextAdvisor.Warning> warnings) {
        return new RecruiterJobResponse(
                job.jobId(), publicHandle, job.slug(), job.title(), job.team(), job.location(), job.mode(),
                job.employmentType(), job.summary(), job.highlights(), job.applicationFields(),
                job.noticeVersion(), questionBodies(job.questions()),
                warnings.stream().map(w -> new JobQuestionWarningBody(
                        w.position(), w.category(), w.signal())).toList(),
                job.status().name(),
                job.applyEnabled(), job.version(), job.createdAt(), job.updatedAt());
    }

    /**
     * Gövde -> domain. Bilinmeyen tip {@code null} kalır ve doğrulama onu
     * reddeder (fail-closed): sessizce SHORT_TEXT'e düşmek, İK'nın seçmediği
     * bir cevap biçimini adaya göstermek olurdu.
     */
    private static List<ApplicationQuestion> questions(List<JobQuestionBody> bodies) {
        if (bodies == null) return List.of();
        List<ApplicationQuestion> out = new java.util.ArrayList<>(bodies.size());
        for (int i = 0; i < bodies.size(); i++) {
            JobQuestionBody b = bodies.get(i);
            if (b == null) continue;
            out.add(new ApplicationQuestion(
                    b.position() == null ? i + 1 : b.position(),
                    b.text(),
                    ApplicationQuestion.kindOf(b.kind()),
                    Boolean.TRUE.equals(b.required()),
                    b.options()));
        }
        return out;
    }

    private static List<JobQuestionBody> questionBodies(List<ApplicationQuestion> questions) {
        return questions.stream()
                .map(q -> new JobQuestionBody(q.position(), q.text(), q.kind().name(),
                        q.required(), q.options().isEmpty() ? null : q.options()))
                .toList();
    }

    private List<QuestionTextAdvisor.Warning> warnings(MutationResult result) {
        return result.job() == null || result.job().questions().isEmpty()
                ? List.of() : questionAdvisor.review(result.job().questions());
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
