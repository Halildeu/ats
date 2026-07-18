package com.ats.app.web;

import com.ats.kernel.Outcome;
import com.ats.offer.OfferPayPeriod;
import com.ats.offer.OfferStatus;
import com.ats.offer.OfferStore.CandidateOfferView;
import com.ats.offer.OfferStore.CommandState;
import com.ats.offer.OfferStore.Terms;
import com.ats.offer.OfferStore.WorkspaceResult;
import com.ats.offer.OfferWorkspace;
import com.ats.offer.OfferWorkspace.OfferRevision;
import com.ats.offer.OfferWorkspaceService;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.headers.Header;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.math.BigDecimal;
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

/** Completed human interview -> offer -> candidate response -> human hire bridge. */
@RestController
@Tag(name = "ats-offers", description = "İnsan kontrollü teklif, aday yanıtı ve işe alım sonucu")
class OfferWorkspaceApiController {
    private final OfferWorkspaceService service;
    private final TenantAccess tenantAccess;
    private final RecruiterAuthorization authorization;

    OfferWorkspaceApiController(
            OfferWorkspaceService service,
            TenantAccess tenantAccess,
            RecruiterAuthorization authorization) {
        this.service = service;
        this.tenantAccess = tenantAccess;
        this.authorization = authorization;
    }

    @Schema(name = "OfferTermsRequest", additionalProperties = Schema.AdditionalPropertiesValue.FALSE,
            requiredProperties = {"roleTitle","startDate","employmentType","workMode","location",
                    "compensationAmount","currency","payPeriod","expiresAt","termsSummary"})
    record TermsBody(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String roleTitle,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, format = "date") String startDate,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String employmentType,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED,
                    allowableValues = {"REMOTE","HYBRID","ONSITE"}) String workMode,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String location,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minimum = "0.01")
            BigDecimal compensationAmount,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, pattern = "^[A-Z]{3}$")
            String currency,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) OfferPayPeriod payPeriod,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, format = "date-time") String expiresAt,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minLength = 10, maxLength = 4000)
            String termsSummary) {}

    @Schema(name = "OfferUpdateRequest", additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record UpdateBody(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minimum = "0") Integer expectedVersion,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minLength = 5, maxLength = 500)
            String reason,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) TermsBody terms) {}

    @Schema(name = "OfferTransitionRequest", additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record TransitionBody(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minimum = "0") Integer expectedVersion,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED,
                    allowableValues = {"EXTENDED","WITHDRAWN","HIRED"}) OfferStatus target,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minLength = 5, maxLength = 500)
            String reason) {}

    @Schema(name = "CandidateOfferResponseRequest",
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record CandidateResponseBody(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minimum = "0") Integer expectedVersion,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED,
                    allowableValues = {"ACCEPTED","DECLINED"}) OfferStatus target,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED,
                    description = "ATS süreç yanıtının ayrı iş sözleşmesi/e-imza olmadığını onaylar")
            Boolean processAcknowledged) {}

    @Schema(name = "OfferRevisionResponse", additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record RevisionResponse(
            int version, String roleTitle, String startDate, String employmentType,
            String workMode, String location, BigDecimal compensationAmount, String currency,
            OfferPayPeriod payPeriod, String expiresAt, String termsSummary, OfferStatus status,
            String reason, String actorRef, String occurredAt) {}

    @Schema(name = "OfferWorkspaceResponse", additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record WorkspaceResponse(
            String offerId, String applicationPublicRef, String jobSlug, String jobTitle,
            String candidateName, String roleTitle, String startDate, String employmentType,
            String workMode, String location, BigDecimal compensationAmount, String currency,
            OfferPayPeriod payPeriod, String expiresAt, String termsSummary, OfferStatus status,
            int version, List<RevisionResponse> revisions, String createdAt, String updatedAt) {}

    @Schema(name = "CandidateOfferResponse", additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record CandidateOfferResponse(
            String offerId, String applicationPublicRef, String jobTitle, String roleTitle,
            String startDate, String employmentType, String workMode, String location,
            BigDecimal compensationAmount, String currency, OfferPayPeriod payPeriod,
            String expiresAt, String termsSummary, OfferStatus status, int version,
            String updatedAt,
            @Schema(description = "Bu ATS süreç yanıtı ayrı iş sözleşmesi/e-imza değildir")
            String legalBoundary) {}

    @PostMapping("/api/v1/recruiter/applications/{publicRef}/offers")
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Teklif taslağı oluşturuldu",
                    content = @Content(schema = @Schema(implementation = WorkspaceResponse.class))),
            @ApiResponse(responseCode = "200", description = "Idempotent replay",
                    headers = @Header(name = "X-ATS-Replay", description = "true"),
                    content = @Content(schema = @Schema(implementation = WorkspaceResponse.class))),
            @ApiResponse(responseCode = "409", description = "Görüşme/durum/aktif teklif çakışması")
    })
    ResponseEntity<?> create(
            Authentication auth,
            @PathVariable("publicRef") String publicRef,
            @Parameter(required = true)
            @RequestHeader(value = "X-ATS-Idempotency-Key", required = false) String key,
            @RequestBody TermsBody body) {
        ResponseEntity<?> denied = authorize(auth, RecruiterAuthorization.Permission.OFFER_MANAGE);
        if (denied != null) return denied;
        Outcome<WorkspaceResult> out = service.create(
                tenantAccess.tenant(auth), tenantAccess.actor(auth), publicRef, key, terms(body));
        return workspaceResult(out, publicRef);
    }

    @GetMapping("/api/v1/recruiter/applications/{publicRef}/offers")
    @ApiResponse(responseCode = "200", description = "Başvurunun teklifleri",
            content = @Content(array = @ArraySchema(
                    schema = @Schema(implementation = WorkspaceResponse.class))))
    ResponseEntity<?> list(Authentication auth, @PathVariable("publicRef") String publicRef) {
        ResponseEntity<?> denied = authorize(auth, RecruiterAuthorization.Permission.OFFER_VIEW);
        if (denied != null) return denied;
        var out = service.listRecruiter(tenantAccess.tenant(auth), publicRef);
        if (out instanceof Outcome.Fail<List<OfferWorkspace>> fail) {
            return noStore(OutcomeHttp.fail(fail));
        }
        return noStore(ResponseEntity.ok(((Outcome.Ok<List<OfferWorkspace>>) out).value()
                .stream().map(OfferWorkspaceApiController::workspaceResponse).toList()));
    }

    @GetMapping("/api/v1/recruiter/applications/{publicRef}/offers/{offerId}")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Teklif çalışma alanı",
                    content = @Content(schema = @Schema(implementation = WorkspaceResponse.class))),
            @ApiResponse(responseCode = "404", description = "Teklif veya başvuru bulunamadı")
    })
    ResponseEntity<?> detail(
            Authentication auth,
            @PathVariable("publicRef") String publicRef,
            @PathVariable("offerId") String offerId) {
        ResponseEntity<?> denied = authorize(auth, RecruiterAuthorization.Permission.OFFER_VIEW);
        if (denied != null) return denied;
        var out = service.findRecruiter(tenantAccess.tenant(auth), publicRef, offerId);
        if (out instanceof Outcome.Fail<OfferWorkspace> fail) return noStore(OutcomeHttp.fail(fail));
        return noStore(ResponseEntity.ok(workspaceResponse(
                ((Outcome.Ok<OfferWorkspace>) out).value())));
    }

    @PutMapping("/api/v1/recruiter/applications/{publicRef}/offers/{offerId}")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Taslak koşulları güncellendi",
                    content = @Content(schema = @Schema(implementation = WorkspaceResponse.class))),
            @ApiResponse(responseCode = "409", description = "Sürüm/durum/idempotency çakışması")
    })
    ResponseEntity<?> update(
            Authentication auth,
            @PathVariable("publicRef") String publicRef,
            @PathVariable("offerId") String offerId,
            @Parameter(required = true)
            @RequestHeader(value = "X-ATS-Idempotency-Key", required = false) String key,
            @RequestBody UpdateBody body) {
        ResponseEntity<?> denied = authorize(auth, RecruiterAuthorization.Permission.OFFER_MANAGE);
        if (denied != null) return denied;
        if (body == null || body.expectedVersion() == null) return badRequest("expectedVersion zorunlu");
        Outcome<WorkspaceResult> out = service.update(
                tenantAccess.tenant(auth), tenantAccess.actor(auth), publicRef, offerId,
                body.expectedVersion(), key, terms(body.terms()), body.reason());
        return workspaceResult(out, publicRef);
    }

    @PostMapping("/api/v1/recruiter/applications/{publicRef}/offers/{offerId}/transitions")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "İnsan kontrollü teklif geçişi",
                    content = @Content(schema = @Schema(implementation = WorkspaceResponse.class))),
            @ApiResponse(responseCode = "409", description = "Sürüm/durum/son tarih çakışması")
    })
    ResponseEntity<?> transition(
            Authentication auth,
            @PathVariable("publicRef") String publicRef,
            @PathVariable("offerId") String offerId,
            @Parameter(required = true)
            @RequestHeader(value = "X-ATS-Idempotency-Key", required = false) String key,
            @RequestBody TransitionBody body) {
        ResponseEntity<?> denied = authorize(auth, RecruiterAuthorization.Permission.OFFER_MANAGE);
        if (denied != null) return denied;
        if (body == null || body.expectedVersion() == null) return badRequest("expectedVersion zorunlu");
        Outcome<WorkspaceResult> out = service.transition(
                tenantAccess.tenant(auth), tenantAccess.actor(auth), publicRef, offerId,
                body.expectedVersion(), key, body.target(), body.reason());
        return workspaceResult(out, publicRef);
    }

    @GetMapping("/api/v1/candidate/applications/{publicRef}/offers")
    @ApiResponse(responseCode = "200", description = "Aday-güvenli teklif görünümü",
            content = @Content(array = @ArraySchema(
                    schema = @Schema(implementation = CandidateOfferResponse.class))))
    ResponseEntity<?> candidateOffers(
            @PathVariable("publicRef") String publicRef,
            @Parameter(required = true)
            @RequestHeader(value = "X-ATS-Candidate-Access", required = false) String access) {
        var out = service.listCandidate(publicRef, access);
        if (out instanceof Outcome.Fail<?> fail) return noStore(OutcomeHttp.fail(fail));
        @SuppressWarnings("unchecked")
        List<CandidateOfferView> values = ((Outcome.Ok<List<CandidateOfferView>>) out).value();
        return noStore(ResponseEntity.ok(values.stream()
                .map(OfferWorkspaceApiController::candidateResponse).toList()));
    }

    @PostMapping("/api/v1/candidate/applications/{publicRef}/offers/{offerId}/response")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Aday süreç yanıtı kaydedildi",
                    content = @Content(schema = @Schema(implementation = CandidateOfferResponse.class))),
            @ApiResponse(responseCode = "409", description = "Sürüm/durum/son tarih çakışması")
    })
    ResponseEntity<?> candidateRespond(
            @PathVariable("publicRef") String publicRef,
            @PathVariable("offerId") String offerId,
            @Parameter(required = true)
            @RequestHeader(value = "X-ATS-Candidate-Access", required = false) String access,
            @Parameter(required = true)
            @RequestHeader(value = "X-ATS-Idempotency-Key", required = false) String key,
            @RequestBody CandidateResponseBody body) {
        if (body == null || body.expectedVersion() == null) return badRequest("expectedVersion zorunlu");
        Outcome<WorkspaceResult> out = service.respond(
                publicRef, offerId, access, body.expectedVersion(), key,
                body.target(), body.processAcknowledged());
        if (out instanceof Outcome.Fail<WorkspaceResult> fail) return noStore(OutcomeHttp.fail(fail));
        WorkspaceResult result = ((Outcome.Ok<WorkspaceResult>) out).value();
        if (result.state() == CommandState.UPDATED || result.state() == CommandState.REPLAYED) {
            ResponseEntity.BodyBuilder builder = ResponseEntity.ok();
            if (result.state() == CommandState.REPLAYED) builder.header("X-ATS-Replay", "true");
            return noStore(builder.body(candidateResponse(result.workspace())));
        }
        return commandConflict(result);
    }

    private static Terms terms(TermsBody body) {
        return body == null ? null : new Terms(
                body.roleTitle(), body.startDate(), body.employmentType(), body.workMode(),
                body.location(), body.compensationAmount(), body.currency(), body.payPeriod(),
                body.expiresAt(), body.termsSummary());
    }

    private ResponseEntity<?> authorize(
            Authentication auth, RecruiterAuthorization.Permission permission) {
        Outcome<Void> out = authorization.require(auth, permission);
        return out instanceof Outcome.Fail<Void> fail ? noStore(OutcomeHttp.fail(fail)) : null;
    }

    private static ResponseEntity<?> workspaceResult(
            Outcome<WorkspaceResult> out, String publicRef) {
        if (out instanceof Outcome.Fail<WorkspaceResult> fail) return noStore(OutcomeHttp.fail(fail));
        WorkspaceResult result = ((Outcome.Ok<WorkspaceResult>) out).value();
        if (result.state() == CommandState.CREATED) {
            return noStore(ResponseEntity.created(URI.create(
                    "/api/v1/recruiter/applications/" + publicRef + "/offers/"
                            + result.workspace().offerId()))
                    .body(workspaceResponse(result.workspace())));
        }
        if (result.state() == CommandState.UPDATED || result.state() == CommandState.REPLAYED) {
            ResponseEntity.BodyBuilder builder = ResponseEntity.ok();
            if (result.state() == CommandState.REPLAYED) builder.header("X-ATS-Replay", "true");
            return noStore(builder.body(workspaceResponse(result.workspace())));
        }
        return commandConflict(result);
    }

    private static ResponseEntity<?> commandConflict(WorkspaceResult result) {
        return switch (result.state()) {
            case NOT_FOUND -> noStore(ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(error("NOT_FOUND", "teklif veya başvuru bulunamadı")));
            case VERSION_CONFLICT -> conflict("VERSION_CONFLICT", "teklif sürümü değişti; yenileyin");
            case IDEMPOTENCY_CONFLICT -> conflict("IDEMPOTENCY_CONFLICT",
                    "aynı anahtar farklı teklif komutuyla kullanılamaz");
            case ILLEGAL_TRANSITION -> conflict("ILLEGAL_TRANSITION",
                    "teklif veya başvuru bu durumda ilerletilemez");
            case EXPIRED -> conflict("OFFER_EXPIRED", "teklif yanıt süresi doldu");
            case ACTIVE_OFFER_EXISTS -> conflict("ACTIVE_OFFER_EXISTS",
                    "başvurunun açık bir teklifi zaten var");
            case INTERVIEW_NOT_COMPLETED -> conflict("INTERVIEW_NOT_COMPLETED",
                    "teklif için insan scorecard'lı tamamlanmış görüşme gerekli");
            default -> noStore(ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(error("CONFLICT", "teklif komutu tamamlanamadı")));
        };
    }

    private static WorkspaceResponse workspaceResponse(OfferWorkspace value) {
        return new WorkspaceResponse(
                value.offerId(), value.applicationPublicRef(), value.jobSlug(), value.jobTitle(),
                value.candidateName(), value.roleTitle(), value.startDate(), value.employmentType(),
                value.workMode(), value.location(), value.compensationAmount(), value.currency(),
                value.payPeriod(), value.expiresAt(), value.termsSummary(), value.status(),
                value.version(), value.revisions().stream()
                        .map(OfferWorkspaceApiController::revisionResponse).toList(),
                value.createdAt(), value.updatedAt());
    }

    private static RevisionResponse revisionResponse(OfferRevision value) {
        return new RevisionResponse(
                value.version(), value.roleTitle(), value.startDate(), value.employmentType(),
                value.workMode(), value.location(), value.compensationAmount(), value.currency(),
                value.payPeriod(), value.expiresAt(), value.termsSummary(), value.status(),
                value.reason(), value.actorRef(), value.occurredAt());
    }

    private static CandidateOfferResponse candidateResponse(OfferWorkspace value) {
        return new CandidateOfferResponse(
                value.offerId(), value.applicationPublicRef(), value.jobTitle(), value.roleTitle(),
                value.startDate(), value.employmentType(), value.workMode(), value.location(),
                value.compensationAmount(), value.currency(), value.payPeriod(), value.expiresAt(),
                value.termsSummary(), value.status(), value.version(), value.updatedAt(),
                "Bu yanıt ATS sürecini kaydeder; ayrı iş sözleşmesi veya e-imza değildir.");
    }

    private static CandidateOfferResponse candidateResponse(CandidateOfferView value) {
        return new CandidateOfferResponse(
                value.offerId(), value.applicationPublicRef(), value.jobTitle(), value.roleTitle(),
                value.startDate(), value.employmentType(), value.workMode(), value.location(),
                value.compensationAmount(), value.currency(), value.payPeriod(), value.expiresAt(),
                value.termsSummary(), value.status(), value.version(), value.updatedAt(),
                "Bu yanıt ATS sürecini kaydeder; ayrı iş sözleşmesi veya e-imza değildir.");
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
