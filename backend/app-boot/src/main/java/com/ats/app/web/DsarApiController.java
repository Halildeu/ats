package com.ats.app.web;

import com.ats.dsr.DsrService;
import com.ats.dsr.DsrService.ErasureReceipt;
import com.ats.dsr.DsrService.ErasureResult;
import com.ats.dsr.DsrService.ErasureStatus;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.swagger.v3.oas.annotations.headers.Header;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * F10 DSAR/erasure API — DsrService fail-closed çekirdeği aynen: TOMBSTONE-ÖNCE
 * sıra (WORM silinmez; tombstone yazılamazsa content silinmez), content-plane
 * silme idempotent, terminal vaka state'i korunur ama content silinir (dürüst
 * receipt). subjectRef OPAK; silme scope'u caller'dan alınmaz, server truth'undan çözülür.
 * Erasure YIKICI ve geri-alınamaz content işlemidir — ayrı yetki sınıfı (ats.erasure.execute; intake=ats.dsar.write);
 * çağıran aktör WORM tombstone + privacy event'lerinde kayıtlıdır.
 */
@RestController
class DsarApiController {

    private final DsrService dsrService;
    private final TenantAccess tenantAccess;

    DsarApiController(DsrService dsrService, TenantAccess tenantAccess) {
        this.dsrService = dsrService;
        this.tenantAccess = tenantAccess;
    }

    record DsarBody(String subjectRef, String reasonCode) {}

    @Schema(additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record ErasureBody(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String dsarKey) {}

    @Schema(additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record ErasureReceiptResponse(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String dsarKey,
            int tombstoneCount,
            int deletedContentCount,
            int objectDeleteIssuedCount,
            boolean caseTransitioned) {}

    @Schema(additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record ErasureExecutionResponse(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String dsarKey,
            int tombstoneCount,
            int deletedContentCount,
            int objectDeleteIssuedCount,
            boolean caseTransitioned,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED)
            boolean replayed) {}

    @Schema(additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record RunningErasureStatusResponse(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String dsarKey,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED,
                    allowableValues = {"RUNNING"}) String state,
            int completedStepCount,
            int totalStepCount,
            int retryAfterSeconds) {}

    @Schema(additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record FulfilledErasureStatusResponse(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String dsarKey,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED,
                    allowableValues = {"FULFILLED"}) String state,
            int completedStepCount,
            int totalStepCount,
            int retryAfterSeconds,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED)
            ErasureReceiptResponse receipt) {}

    @Schema(additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record ApiErrorResponse(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String error,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String reason) {}

    /** POST-conflict ile status-read arasındaki yarışın tek, testlenebilir transport kararı. */
    record ConflictProjection(ErasureReceipt terminalReceipt, int retryAfterSeconds) {
        boolean terminal() {
            return terminalReceipt != null;
        }
    }

    @PostMapping("/api/v1/interviews/{interviewId}/dsar")
    ResponseEntity<?> receiveDsar(Authentication auth,
            @PathVariable("interviewId") String interviewId, @RequestBody DsarBody body) {
        if (body == null || body.subjectRef() == null || body.subjectRef().isBlank()) {
            return badRequest("subjectRef zorunlu (opak referans)");
        }
        Outcome<String> out = dsrService.receiveDsar(tenantAccess.tenant(auth),
                new InterviewId(interviewId), body.subjectRef(), body.reasonCode());
        if (out instanceof Outcome.Fail<String> fail) {
            ResponseEntity<Map<String, String>> failed = OutcomeHttp.fail(fail);
            return noStore(ResponseEntity.status(failed.getStatusCode())).body(failed.getBody());
        }
        return noStore(ResponseEntity.status(HttpStatus.CREATED))
                .body(Map.of("dsarKey", ((Outcome.Ok<String>) out).value()));
    }

    @PostMapping("/api/v1/interviews/{interviewId}/dsar/erasure")
    @ApiResponses({
            @ApiResponse(responseCode = "200",
                    description = "Yeni yürütme veya doğrulanmış terminal receipt replay'i",
                    headers = @Header(name = "X-ATS-Replay",
                            description = "İlk yürütme için false, terminal replay için true"),
                    content = @Content(schema = @Schema(
                            implementation = ErasureExecutionResponse.class))),
            @ApiResponse(responseCode = "409",
                    description = "Başka canlı worker lease'i; Retry-After ile reconcile zamanı",
                    headers = @Header(name = "Retry-After",
                            description = "Salt-okunur status reconciliation öncesi saniye"),
                    content = @Content(schema = @Schema(
                            implementation = ApiErrorResponse.class))),
    })
    @io.swagger.v3.oas.annotations.parameters.RequestBody(
            required = true,
            content = @Content(schema = @Schema(implementation = ErasureBody.class)))
    ResponseEntity<?> executeErasure(Authentication auth,
            @PathVariable("interviewId") String interviewId,
            @RequestBody(required = false) String rawBody) {
        JsonNode body = null;
        if (rawBody != null && !rawBody.isBlank()) {
            try {
                body = ERASURE_BODY_READER.readTree(rawBody);
            } catch (com.fasterxml.jackson.core.JacksonException exception) {
                return badRequest("gövde geçerli ve duplicate-key içermeyen JSON olmalı");
            }
        }
        // Strict envelope: caller-authored scope/extra alan sessizce ignore edilmez.
        if (body == null || !body.isObject() || body.size() != 1
                || !body.has("dsarKey") || !body.get("dsarKey").isTextual()
                || body.get("dsarKey").textValue().isBlank()) {
            return badRequest("yalnız non-empty dsarKey alanı kabul edilir; scope server-authoritative");
        }
        String dsarKey = body.get("dsarKey").textValue();
        var tenant = tenantAccess.tenant(auth);
        var interview = new InterviewId(interviewId);
        Outcome<ErasureResult> out = dsrService.executeErasure(tenant,
                tenantAccess.actor(auth), interview, dsarKey);
        if (out instanceof Outcome.Fail<ErasureResult> fail) {
            ResponseEntity<Map<String, String>> failed = OutcomeHttp.fail(fail);
            ResponseEntity.BodyBuilder builder = noStore(
                    ResponseEntity.status(failed.getStatusCode()));
            if (fail.code() == OutcomeCode.CONFLICT) {
                Outcome<ErasureStatus> status = dsrService.erasureStatus(
                        tenant, interview, dsarKey);
                ConflictProjection projection = projectConflict(status);
                if (projection.terminal()) {
                    ErasureResult replay = new ErasureResult(
                            projection.terminalReceipt(), true);
                    return noStore(ResponseEntity.ok())
                            .header("X-ATS-Replay", "true")
                            .body(executionBody(replay));
                }
                if (projection.retryAfterSeconds() > 0) {
                    builder.header("Retry-After",
                            Integer.toString(projection.retryAfterSeconds()));
                }
            }
            return builder.body(failed.getBody());
        }
        ErasureResult result = ((Outcome.Ok<ErasureResult>) out).value();
        return noStore(ResponseEntity.ok())
                .header("X-ATS-Replay", Boolean.toString(result.replayed()))
                .body(executionBody(result));
    }

    /** Yan etkisiz timeout/lease reconciliation; aynı ERASURE_EXECUTE yetkisiyle salt-okunur. */
    @GetMapping("/api/v1/interviews/{interviewId}/dsar/erasure/receipt")
    @ApiResponses({
            @ApiResponse(responseCode = "200",
                    description = "RUNNING progress veya FULFILLED terminal receipt",
                    headers = @Header(name = "Retry-After",
                            description = "RUNNING canlı lease için saniye; terminalde yok"),
                    content = @Content(schema = @Schema(
                            oneOf = {RunningErasureStatusResponse.class,
                                    FulfilledErasureStatusResponse.class}))),
            @ApiResponse(responseCode = "404", description = "Execution henüz yok",
                    content = @Content(schema = @Schema(
                            implementation = ApiErrorResponse.class))),
            @ApiResponse(responseCode = "409",
                    description = "Anahtar farklı execution türüne bağlı",
                    content = @Content(schema = @Schema(
                            implementation = ApiErrorResponse.class))),
    })
    ResponseEntity<?> erasureReceipt(Authentication auth,
            @PathVariable("interviewId") String interviewId,
            @io.swagger.v3.oas.annotations.Parameter(required = true,
                    description = "DSAR intake tarafından üretilen opak anahtar")
            @RequestParam(name = "dsarKey", required = false) String dsarKey) {
        if (dsarKey == null || dsarKey.isBlank()) {
            return badRequest("dsarKey zorunlu");
        }
        Outcome<ErasureStatus> out = dsrService.erasureStatus(
                tenantAccess.tenant(auth), new InterviewId(interviewId), dsarKey);
        if (out instanceof Outcome.Fail<ErasureStatus> fail) {
            ResponseEntity<Map<String, String>> failed = OutcomeHttp.fail(fail);
            return noStore(ResponseEntity.status(failed.getStatusCode()))
                    .body(failed.getBody());
        }
        ErasureStatus status = ((Outcome.Ok<ErasureStatus>) out).value();
        Object body = status.receipt() == null
                ? new RunningErasureStatusResponse(
                        status.dsarKey(), status.state().name(), status.completedStepCount(),
                        status.totalStepCount(), status.retryAfterSeconds())
                : new FulfilledErasureStatusResponse(
                        status.dsarKey(), status.state().name(), status.completedStepCount(),
                        status.totalStepCount(), status.retryAfterSeconds(),
                        receiptBody(status.receipt()));
        ResponseEntity.BodyBuilder builder = noStore(ResponseEntity.ok());
        if (status.retryAfterSeconds() > 0) {
            builder.header("Retry-After", Integer.toString(status.retryAfterSeconds()));
        }
        return builder.body(body);
    }

    private static ErasureReceiptResponse receiptBody(ErasureReceipt r) {
        return new ErasureReceiptResponse(
                r.dsarKey(), r.tombstoneCount(), r.deletedContentCount(),
                r.objectDeleteIssuedCount(), r.caseTransitioned());
    }

    private static ErasureExecutionResponse executionBody(ErasureResult result) {
        ErasureReceipt r = result.receipt();
        return new ErasureExecutionResponse(
                r.dsarKey(), r.tombstoneCount(), r.deletedContentCount(),
                r.objectDeleteIssuedCount(), r.caseTransitioned(), result.replayed());
    }

    static ConflictProjection projectConflict(Outcome<ErasureStatus> statusOutcome) {
        if (!(statusOutcome instanceof Outcome.Ok<ErasureStatus> ok)) {
            return new ConflictProjection(null, 0);
        }
        ErasureStatus status = ok.value();
        if (status.receipt() != null) {
            return new ConflictProjection(status.receipt(), 0);
        }
        // acquire() conflict verdiyse RUNNING truth'u için 0, lease'in bu iki
        // okuma arasında dolduğu anlamına gelebilir. Yan etkisiz GET hemen güvenlidir.
        return new ConflictProjection(null, Math.max(1, status.retryAfterSeconds()));
    }

    private static ResponseEntity<Map<String, String>> badRequest(String reason) {
        return noStore(ResponseEntity.badRequest())
                .body(Map.of("error", "INVALID", "reason", reason));
    }

    private static ResponseEntity.BodyBuilder noStore(ResponseEntity.BodyBuilder builder) {
        return builder.header("Cache-Control", "no-store").header("Pragma", "no-cache");
    }

    private static final ObjectMapper ERASURE_BODY_READER = new ObjectMapper()
            .enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION);
}
