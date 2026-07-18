package com.ats.app.web;

import com.ats.app.AppProperties;
import com.ats.application.ResumeImportService;
import com.ats.application.ResumeImportService.ResumeDraft;
import com.ats.application.ResumeImportService.ResumeImport;
import com.ats.application.ResumeImportService.ResumeProposal;
import com.ats.application.ResumeImportStore.AttachResult;
import com.ats.application.ResumeImportStore.AttachState;
import com.ats.application.ResumeImportStore.ConfirmResult;
import com.ats.application.ResumeImportStore.ConfirmState;
import com.ats.application.ResumeImportStore.CreateResult;
import com.ats.application.ResumeImportStore.CreateState;
import com.ats.application.ResumeImportStore.FieldResult;
import com.ats.application.ResumeImportStore.FieldState;
import com.ats.application.ResumeImportStore.ReplaceResult;
import com.ats.application.ResumeImportStore.ReplaceState;
import com.ats.application.ResumeImportStore.TerminateResult;
import com.ats.application.ResumeImportStore.TerminateState;
import com.ats.kernel.Outcome;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

/** Candidate-only CV import API. The recruiter surface intentionally has no raw PDF endpoint. */
@RestController
@Tag(name = "candidate-resume-import",
        description = "Aday kontrollü sentetik PDF özgeçmişten düzenlenebilir taslak")
class ResumeImportApiController {

    private final ResumeImportService service;
    private final AppProperties.ResumeImport config;

    ResumeImportApiController(ResumeImportService service, AppProperties properties) {
        this.service = service;
        this.config = properties.resumeImport();
    }

    @Schema(name = "ResumeImportCreateRequest",
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record CreateBody(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED,
                    allowableValues = {ResumeImportService.NOTICE_VERSION}) String noticeVersion,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String noticeAcceptedAt) {}

    @Schema(name = "ResumeFieldMutationRequest",
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record FieldBody(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minimum = "0") Integer expectedVersion,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED,
                    allowableValues = {"ACCEPTED", "EDITED", "REJECTED"}) String state,
            String editedValue) {}

    @Schema(name = "ResumeImportVersionRequest",
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record VersionBody(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minimum = "0") Integer expectedVersion) {}

    @Schema(name = "ResumeImportTerminateRequest",
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record TerminateBody(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minimum = "0") Integer expectedVersion,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED,
                    allowableValues = {"CANCELLED", "REJECT_ALL"}) String terminalState) {}

    @Schema(name = "ResumeImportProvenanceResponse",
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record ProvenanceDto(
            int page, double x, double y, double width, double height,
            double confidence, String parserVersion) {}

    @Schema(name = "ResumeProposalResponse",
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record ProposalDto(
            String field, String proposedValue, String candidateValue,
            String state, int version, ProvenanceDto provenance) {}

    @Schema(name = "ResumeImportResponse",
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record ImportDto(
            String importId, String jobSlug, String state, int version, int documentVersion,
            String noticeVersion, String noticeAcceptedAt, String uploadExpiresAt,
            String firstUploadAt, String expiresAt, String parserVersion, int protectedSuppressed,
            int unsupportedOutput, String createdAt, String updatedAt,
            String purgedAt, List<ProposalDto> proposals) {}

    @Schema(name = "CandidateDraftResponse",
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record DraftDto(
            String draftId, String importId, int version,
            Map<String, String> fields, String createdAt) {}

    @Schema(name = "ResumeImportConfirmResponse",
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record ConfirmDto(ImportDto resumeImport, DraftDto draft) {}

    @PostMapping("/api/v1/jobs/{jobSlug}/resume-imports")
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Import oturumu oluşturuldu",
                    content = @Content(schema = @Schema(implementation = ImportDto.class))),
            @ApiResponse(responseCode = "200", description = "İdempotent replay"),
            @ApiResponse(responseCode = "400", description = "Geçersiz istek"),
            @ApiResponse(responseCode = "404", description = "Yayınlanmış ilan bulunamadı"),
            @ApiResponse(responseCode = "409", description = "Idempotency çakışması")
    })
    ResponseEntity<?> create(
            @PathVariable("jobSlug") String jobSlug,
            @Parameter(required = true)
            @RequestHeader(value = "X-ATS-Candidate-Access", required = false) String token,
            @Parameter(required = true)
            @RequestHeader(value = "X-ATS-Idempotency-Key", required = false) String key,
            @RequestBody CreateBody body) {
        return createResult(body == null
                ? Outcome.fail(com.ats.kernel.OutcomeCode.INVALID, "gövde zorunlu")
                : service.create(jobSlug, token, key, body.noticeVersion(), body.noticeAcceptedAt()));
    }

    @PostMapping("/api/v1/careers/{publicHandle}/jobs/{jobSlug}/resume-imports")
    ResponseEntity<?> createForCareer(
            @PathVariable("publicHandle") String publicHandle,
            @PathVariable("jobSlug") String jobSlug,
            @Parameter(required = true)
            @RequestHeader(value = "X-ATS-Candidate-Access", required = false) String token,
            @Parameter(required = true)
            @RequestHeader(value = "X-ATS-Idempotency-Key", required = false) String key,
            @RequestBody CreateBody body) {
        return createResult(body == null
                ? Outcome.fail(com.ats.kernel.OutcomeCode.INVALID, "gövde zorunlu")
                : service.create(publicHandle, jobSlug, token, key,
                        body.noticeVersion(), body.noticeAcceptedAt()));
    }

    @GetMapping("/api/v1/candidate/resume-imports/{importId}")
    ResponseEntity<?> get(
            @PathVariable("importId") String importId,
            @Parameter(required = true)
            @RequestHeader(value = "X-ATS-Candidate-Access", required = false) String token) {
        Outcome<ResumeImport> out = service.find(importId, token);
        if (out instanceof Outcome.Fail<ResumeImport> fail) return OutcomeHttp.fail(fail);
        return ok(dto(((Outcome.Ok<ResumeImport>) out).value()));
    }

    @PutMapping("/api/v1/candidate/resume-imports/{importId}/document")
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "PDF tarandı ve öneriler oluşturuldu",
                    content = @Content(schema = @Schema(implementation = ImportDto.class))),
            @ApiResponse(responseCode = "200", description = "İdempotent upload replay"),
            @ApiResponse(responseCode = "202", description = "Aynı upload tek-uçuş işleminde",
                    content = @Content(schema = @Schema(implementation = ImportDto.class))),
            @ApiResponse(responseCode = "400", description = "PDF doğrulaması başarısız"),
            @ApiResponse(responseCode = "409", description = "Sürüm/belge/state çakışması"),
            @ApiResponse(responseCode = "411", description = "Content-Length zorunlu"),
            @ApiResponse(responseCode = "413", description = "PDF boyutu aşıldı"),
            @ApiResponse(responseCode = "415", description = "application/pdf zorunlu")
    })
    ResponseEntity<?> upload(
            HttpServletRequest request,
            @PathVariable("importId") String importId,
            @Parameter(required = true)
            @RequestHeader(value = "X-ATS-Candidate-Access", required = false) String token,
            @Parameter(required = true)
            @RequestHeader(value = "X-ATS-Idempotency-Key", required = false) String key,
            @Parameter(required = true)
            @RequestHeader(value = "X-ATS-Expected-Version", required = false) Integer expectedVersion)
            throws IOException {
        if (!config.enabled()) return ResponseEntity.notFound().build();
        String contentType = request.getContentType();
        boolean pdf;
        try {
            pdf = contentType != null && MediaType.APPLICATION_PDF.isCompatibleWith(
                    MediaType.parseMediaType(contentType));
        } catch (IllegalArgumentException invalid) {
            pdf = false;
        }
        if (!pdf) {
            return error(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "APPLICATION_PDF_REQUIRED",
                    "Content-Type application/pdf olmalı");
        }
        long length = request.getContentLengthLong();
        if (length < 0) {
            return error(HttpStatus.LENGTH_REQUIRED, "CONTENT_LENGTH_REQUIRED",
                    "Content-Length zorunlu");
        }
        if (length < 1 || length > config.maxUploadBytes()) {
            return error(HttpStatus.PAYLOAD_TOO_LARGE, "PAYLOAD_TOO_LARGE",
                    "PDF 1.." + config.maxUploadBytes() + " bayt olmalı");
        }
        byte[] bytes = request.getInputStream().readNBytes((int) length + 1);
        if (bytes.length != length) {
            return error(HttpStatus.BAD_REQUEST, "LENGTH_MISMATCH",
                    "gövde uzunluğu Content-Length ile eşleşmiyor");
        }
        Outcome<AttachResult> out = service.upload(
                importId, token, expectedVersion == null ? -1 : expectedVersion, key, bytes);
        if (out instanceof Outcome.Fail<AttachResult> fail) return OutcomeHttp.fail(fail);
        AttachResult result = ((Outcome.Ok<AttachResult>) out).value();
        return switch (result.state()) {
            case ATTACHED -> ResponseEntity.status(HttpStatus.CREATED)
                    .cacheControl(CacheControl.noStore()).body(dto(result.resumeImport()));
            case REPLAYED -> ResponseEntity.ok().header("X-ATS-Replay", "true")
                    .cacheControl(CacheControl.noStore()).body(dto(result.resumeImport()));
            case IN_FLIGHT -> ResponseEntity.status(HttpStatus.ACCEPTED)
                    .header("Retry-After", "1").cacheControl(CacheControl.noStore())
                    .body(dto(result.resumeImport()));
            case NOT_FOUND -> error(HttpStatus.NOT_FOUND, "NOT_FOUND", "CV import bulunamadı");
            case UPLOAD_WINDOW_CLOSED -> error(HttpStatus.GONE, result.state().name(),
                    "upload penceresi kapandı; yeni import oluşturun");
            case VERSION_CONFLICT, DOCUMENT_CONFLICT, TERMINAL -> conflict(
                    result.state().name(), result.resumeImport());
        };
    }

    @PostMapping("/api/v1/candidate/resume-imports/{importId}/document/replace")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Eski belge sürümü supersede edildi",
                    content = @Content(schema = @Schema(implementation = ImportDto.class))),
            @ApiResponse(responseCode = "404", description = "Import bulunamadı"),
            @ApiResponse(responseCode = "409", description = "Sürüm/state/belge çakışması")
    })
    ResponseEntity<?> replaceDocument(
            @PathVariable("importId") String importId,
            @Parameter(required = true)
            @RequestHeader(value = "X-ATS-Candidate-Access", required = false) String token,
            @RequestBody VersionBody body) {
        Outcome<ReplaceResult> out = body == null
                ? Outcome.fail(com.ats.kernel.OutcomeCode.INVALID, "gövde zorunlu")
                : service.replace(importId, token,
                        body.expectedVersion() == null ? -1 : body.expectedVersion());
        if (out instanceof Outcome.Fail<ReplaceResult> fail) return OutcomeHttp.fail(fail);
        ReplaceResult result = ((Outcome.Ok<ReplaceResult>) out).value();
        return switch (result.state()) {
            case REPLACED -> ok(dto(result.resumeImport()));
            case NOT_FOUND -> error(HttpStatus.NOT_FOUND, "NOT_FOUND", "CV import bulunamadı");
            case VERSION_CONFLICT, NO_DOCUMENT, TERMINAL -> conflict(
                    result.state().name(), result.resumeImport());
        };
    }

    @PutMapping("/api/v1/candidate/resume-imports/{importId}/fields/{field}")
    ResponseEntity<?> updateField(
            @PathVariable("importId") String importId,
            @PathVariable("field") String field,
            @Parameter(required = true)
            @RequestHeader(value = "X-ATS-Candidate-Access", required = false) String token,
            @RequestBody FieldBody body) {
        Outcome<FieldResult> out = body == null
                ? Outcome.fail(com.ats.kernel.OutcomeCode.INVALID, "gövde zorunlu")
                : service.updateField(importId, token, field, body.state(), body.editedValue(),
                        body.expectedVersion() == null ? -1 : body.expectedVersion());
        if (out instanceof Outcome.Fail<FieldResult> fail) return OutcomeHttp.fail(fail);
        FieldResult result = ((Outcome.Ok<FieldResult>) out).value();
        return switch (result.state()) {
            case UPDATED -> ok(dto(result.resumeImport()));
            case NOT_FOUND -> error(HttpStatus.NOT_FOUND, "NOT_FOUND", "alan/import bulunamadı");
            case VERSION_CONFLICT, TERMINAL -> conflict(
                    result.state().name(), result.resumeImport());
        };
    }

    @PostMapping("/api/v1/candidate/resume-imports/{importId}/confirm")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Seçilen alanlar atomik taslağa aktarıldı",
                    content = @Content(schema = @Schema(implementation = ConfirmDto.class))),
            @ApiResponse(responseCode = "400", description = "Geçersiz istek"),
            @ApiResponse(responseCode = "404", description = "Import bulunamadı"),
            @ApiResponse(responseCode = "409", description = "Sürüm/state/seçim çakışması")
    })
    ResponseEntity<?> confirm(
            @PathVariable("importId") String importId,
            @Parameter(required = true)
            @RequestHeader(value = "X-ATS-Candidate-Access", required = false) String token,
            @RequestBody VersionBody body) {
        Outcome<ConfirmResult> out = body == null
                ? Outcome.fail(com.ats.kernel.OutcomeCode.INVALID, "gövde zorunlu")
                : service.confirm(importId, token,
                        body.expectedVersion() == null ? -1 : body.expectedVersion());
        if (out instanceof Outcome.Fail<ConfirmResult> fail) return OutcomeHttp.fail(fail);
        ConfirmResult result = ((Outcome.Ok<ConfirmResult>) out).value();
        return switch (result.state()) {
            case CONFIRMED -> ok(new ConfirmDto(
                    dto(result.resumeImport()), draftDto(result.draft())));
            case NOT_FOUND -> error(HttpStatus.NOT_FOUND, "NOT_FOUND", "CV import bulunamadı");
            case VERSION_CONFLICT, NO_SELECTED_FIELDS, TERMINAL -> conflict(
                    result.state().name(), result.resumeImport());
        };
    }

    @PostMapping("/api/v1/candidate/resume-imports/{importId}/terminate")
    ResponseEntity<?> terminate(
            @PathVariable("importId") String importId,
            @Parameter(required = true)
            @RequestHeader(value = "X-ATS-Candidate-Access", required = false) String token,
            @RequestBody TerminateBody body) {
        Outcome<TerminateResult> out = body == null
                ? Outcome.fail(com.ats.kernel.OutcomeCode.INVALID, "gövde zorunlu")
                : service.terminate(importId, token,
                        body.expectedVersion() == null ? -1 : body.expectedVersion(),
                        body.terminalState());
        if (out instanceof Outcome.Fail<TerminateResult> fail) return OutcomeHttp.fail(fail);
        TerminateResult result = ((Outcome.Ok<TerminateResult>) out).value();
        return switch (result.state()) {
            case TERMINATED -> ok(dto(result.resumeImport()));
            case REPLAYED -> ResponseEntity.ok().header("X-ATS-Replay", "true")
                    .cacheControl(CacheControl.noStore()).body(dto(result.resumeImport()));
            case NOT_FOUND -> error(HttpStatus.NOT_FOUND, "NOT_FOUND", "CV import bulunamadı");
            case VERSION_CONFLICT, TERMINAL -> conflict(
                    result.state().name(), result.resumeImport());
        };
    }

    private ResponseEntity<?> createResult(Outcome<CreateResult> out) {
        if (!config.enabled()) return ResponseEntity.notFound().build();
        if (out instanceof Outcome.Fail<CreateResult> fail) return OutcomeHttp.fail(fail);
        CreateResult result = ((Outcome.Ok<CreateResult>) out).value();
        if (result.state() == CreateState.IDEMPOTENCY_CONFLICT) {
            return conflict("IDEMPOTENCY_CONFLICT", result.resumeImport());
        }
        ResponseEntity.BodyBuilder response = result.state() == CreateState.CREATED
                ? ResponseEntity.status(HttpStatus.CREATED)
                : ResponseEntity.ok().header("X-ATS-Replay", "true");
        return response.cacheControl(CacheControl.noStore()).body(dto(result.resumeImport()));
    }

    private static ImportDto dto(ResumeImport value) {
        if (value == null) return null;
        return new ImportDto(
                value.importId(), value.jobSlug(), value.state().name(), value.version(),
                value.documentVersion(), value.noticeVersion(), value.noticeAcceptedAt(),
                value.uploadExpiresAt(), value.firstUploadAt(), value.expiresAt(), value.parserVersion(),
                value.protectedSuppressed(), value.unsupportedOutput(), value.createdAt(),
                value.updatedAt(), value.purgedAt(),
                value.proposals().stream().map(ResumeImportApiController::proposalDto).toList());
    }

    private static ProposalDto proposalDto(ResumeProposal value) {
        var p = value.provenance();
        return new ProposalDto(
                value.field().apiName(), value.proposedValue(), value.candidateValue(),
                value.state().name(), value.version(), new ProvenanceDto(
                        p.page(), p.x(), p.y(), p.width(), p.height(), p.confidence(),
                        p.parserVersion()));
    }

    private static DraftDto draftDto(ResumeDraft value) {
        Map<String, String> fields = new java.util.LinkedHashMap<>();
        value.fields().forEach((field, fieldValue) -> fields.put(field.apiName(), fieldValue));
        return new DraftDto(
                value.draftId(), value.importId(), value.version(), Map.copyOf(fields),
                value.createdAt());
    }

    private static ResponseEntity<?> ok(Object body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }

    private static ResponseEntity<?> conflict(String state, ResumeImport current) {
        Map<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("error", state);
        if (current != null) {
            body.put("currentState", current.state().name());
            body.put("currentVersion", current.version());
        }
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .cacheControl(CacheControl.noStore()).body(body);
    }

    private static ResponseEntity<?> error(
            HttpStatus status, String error, String reason) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore())
                .body(Map.of("error", error, "reason", reason));
    }
}
