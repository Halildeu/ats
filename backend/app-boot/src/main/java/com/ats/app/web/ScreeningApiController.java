package com.ats.app.web;

import com.ats.app.screening.ScreeningRuntimeService;
import com.ats.app.screening.ScreeningRuntimeService.CitationClaimRequest;
import com.ats.app.screening.ScreeningRuntimeService.ScreeningView;
import com.ats.app.screening.ScreeningRuntimeService.TranscriptSegmentRequest;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.JsonCodec;
import com.ats.kernel.JsonValue;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import com.ats.screening.FindingSetRef;
import com.ats.screening.ScreeningEvidenceStore.StoredEvidence;
import com.ats.screening.ScreeningFinding;
import com.ats.screening.ScreeningSourceKind;
import com.ats.screening.TextSpan;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

/**
 * #156-c reviewer screening API. Request JSON, duplicate/unknown/trailing alanları da reddeden
 * shared-kernel {@link JsonCodec} ile exact tagged-union olarak parse edilir. Tenant/actor yalnız
 * doğrulanmış JWT'den gelir; body ham metin, claim, dil veya tenant/actor kabul etmez.
 */
@RestController
class ScreeningApiController {

    private static final Pattern INTERVIEW_ID = Pattern.compile("[A-Za-z0-9._:-]{1,128}");
    private static final int MAX_BODY_CHARS = 2_048;
    private static final Set<String> TRANSCRIPT_KEYS =
            Set.of("sourceKind", "transcriptKey", "segmentIndex");
    private static final Set<String> CITATION_KEYS =
            Set.of("sourceKind", "citationKey");

    @Schema(name = "TranscriptSegmentScreeningRequest",
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE,
            requiredProperties = {"sourceKind", "transcriptKey", "segmentIndex"})
    record TranscriptSegmentSchema(
            @Schema(allowableValues = "TRANSCRIPT_SEGMENT") String sourceKind,
            String transcriptKey,
            Integer segmentIndex) {}

    @Schema(name = "CitationClaimScreeningRequest",
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE,
            requiredProperties = {"sourceKind", "citationKey"})
    record CitationClaimSchema(
            @Schema(allowableValues = "CITATION_CLAIM") String sourceKind,
            String citationKey) {}

    @Schema(name = "ScreeningSource", additionalProperties = Schema.AdditionalPropertiesValue.FALSE,
            requiredProperties = {"kind", "canonicalSourceRef"})
    record ScreeningSourceResponse(
            String kind,
            String canonicalSourceRef,
            @Schema(nullable = true) Integer segmentIndex) {}

    @Schema(name = "ScreeningTextSpan", additionalProperties = Schema.AdditionalPropertiesValue.FALSE,
            requiredProperties = {"startInclusive", "endExclusive"})
    record ScreeningTextSpanResponse(
            int startInclusive,
            int endExclusive,
            @Schema(nullable = true) Integer segmentIndex) {}

    @Schema(name = "ScreeningFinding", additionalProperties = Schema.AdditionalPropertiesValue.FALSE,
            requiredProperties = {"category", "signal", "sourceKind", "span"})
    record ScreeningFindingResponse(
            String category,
            String signal,
            String sourceKind,
            ScreeningTextSpanResponse span) {}

    @Schema(name = "ScreeningEvidence", additionalProperties = Schema.AdditionalPropertiesValue.FALSE,
            requiredProperties = {"findingSetRef", "runId", "policyRef", "coverage",
                    "disposition", "source", "findings", "evidenceId", "schemaVersion",
                    "occurredAt", "spanUnit"})
    record ScreeningResponse(
            String findingSetRef,
            String runId,
            String policyRef,
            String coverage,
            String disposition,
            ScreeningSourceResponse source,
            List<ScreeningFindingResponse> findings,
            String evidenceId,
            String schemaVersion,
            String occurredAt,
            String spanUnit) {}

    @Schema(name = "ScreeningError", additionalProperties = Schema.AdditionalPropertiesValue.FALSE,
            requiredProperties = {"error", "reason"})
    record ScreeningErrorResponse(String error, String reason) {}

    private final ScreeningRuntimeService service;
    private final TenantAccess tenantAccess;

    ScreeningApiController(ScreeningRuntimeService service, TenantAccess tenantAccess) {
        this.service = service;
        this.tenantAccess = tenantAccess;
    }

    @PostMapping(value = "/api/v1/interviews/{interviewId}/screenings",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    @io.swagger.v3.oas.annotations.parameters.RequestBody(required = true,
            content = @Content(schema = @Schema(type = "object", oneOf = {
                    TranscriptSegmentSchema.class, CitationClaimSchema.class})))
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Yeni screening evidence üretildi",
                    content = @Content(schema = @Schema(implementation = ScreeningResponse.class))),
            @ApiResponse(responseCode = "200", description = "Aynı request'in doğrulanmış replay'i",
                    content = @Content(schema = @Schema(implementation = ScreeningResponse.class))),
            @ApiResponse(responseCode = "400", description = "Kapalı request sözleşmesi ihlali",
                    content = @Content(schema = @Schema(implementation = ScreeningErrorResponse.class))),
            @ApiResponse(responseCode = "403", description = "Screening write yetkisi yok",
                    content = @Content(schema = @Schema(implementation = ScreeningErrorResponse.class))),
            @ApiResponse(responseCode = "404", description = "Kanonik kaynak bulunamadı",
                    content = @Content(schema = @Schema(implementation = ScreeningErrorResponse.class))),
            @ApiResponse(responseCode = "409", description = "Idempotency veya gate çatışması",
                    content = @Content(schema = @Schema(implementation = ScreeningErrorResponse.class))),
            @ApiResponse(responseCode = "503", description = "Screening kanıt düzlemi kullanılamıyor",
                    content = @Content(schema = @Schema(implementation = ScreeningErrorResponse.class)))
    })
    ResponseEntity<?> screen(
            Authentication auth,
            @PathVariable("interviewId") String interviewId,
            @io.swagger.v3.oas.annotations.Parameter(
                    required = true,
                    description = "Sistem üretimli scrq_<UUIDv4>; kullanıcı/aday verisi içermez")
            @RequestHeader(value = "X-ATS-Idempotency-Key", required = false)
                    String idempotencyKey,
            @RequestBody String rawBody) {
        if (!validInterviewId(interviewId)) {
            return invalid("interviewId güvenli opak id olmalı (1..128)");
        }
        if (rawBody == null || rawBody.length() > MAX_BODY_CHARS) {
            return invalid("screening JSON gövdesi 1..2048 karakter olmalı");
        }
        JsonValue.JsonObject body;
        try {
            JsonValue parsed = JsonCodec.parse(rawBody);
            if (!(parsed instanceof JsonValue.JsonObject object)) {
                return invalid("screening gövdesi JSON object olmalı");
            }
            body = object;
        } catch (JsonCodec.JsonCodecException ex) {
            return invalid("screening JSON exact sözleşmeyle uyumsuz");
        }
        String sourceKindValue = string(body, "sourceKind");
        if (sourceKindValue == null) {
            return invalid("sourceKind zorunlu string");
        }
        ScreeningSourceKind sourceKind;
        try {
            sourceKind = ScreeningSourceKind.valueOf(sourceKindValue);
        } catch (IllegalArgumentException ex) {
            return invalid("sourceKind kapalı küme dışında");
        }

        InterviewId id = new InterviewId(interviewId);
        Outcome<ScreeningView> out;
        try {
            out = switch (sourceKind) {
                case TRANSCRIPT_SEGMENT -> screenTranscript(
                        auth, id, idempotencyKey, body);
                case CITATION_CLAIM -> screenCitation(
                        auth, id, idempotencyKey, body);
                case INTERVIEW_NOTE, RUBRIC_TEXT, FREE_TEXT -> Outcome.fail(
                        OutcomeCode.UNSUPPORTED_IN_GATE,
                        "kaynak türü kanonik server-side store gelene kadar kapalı");
            };
        } catch (IllegalArgumentException ex) {
            return invalid("screening request alanları exact sözleşmeyle uyumsuz");
        }
        if (out instanceof Outcome.Fail<ScreeningView> fail) {
            return failNoStore(fail);
        }
        ScreeningView view = ((Outcome.Ok<ScreeningView>) out).value();
        HttpStatus status = view.replayed() ? HttpStatus.OK : HttpStatus.CREATED;
        return ResponseEntity.status(status)
                .headers(noStoreHeaders())
                .header("X-ATS-Replay", Boolean.toString(view.replayed()))
                .body(response(view));
    }

    @GetMapping(value = "/api/v1/interviews/{interviewId}/screenings/{findingSetRef}",
            produces = MediaType.APPLICATION_JSON_VALUE)
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Tenant/interview-scope'lu screening evidence",
                    content = @Content(schema = @Schema(implementation = ScreeningResponse.class))),
            @ApiResponse(responseCode = "400", description = "Opak kimlik biçimi geçersiz",
                    content = @Content(schema = @Schema(implementation = ScreeningErrorResponse.class))),
            @ApiResponse(responseCode = "403", description = "Screening read yetkisi yok",
                    content = @Content(schema = @Schema(implementation = ScreeningErrorResponse.class))),
            @ApiResponse(responseCode = "404", description = "Evidence bulunamadı",
                    content = @Content(schema = @Schema(implementation = ScreeningErrorResponse.class))),
            @ApiResponse(responseCode = "503", description = "Screening kanıt düzlemi kullanılamıyor",
                    content = @Content(schema = @Schema(implementation = ScreeningErrorResponse.class)))
    })
    ResponseEntity<?> get(
            Authentication auth,
            @PathVariable("interviewId") String interviewId,
            @PathVariable("findingSetRef") String findingSetRef) {
        if (!validInterviewId(interviewId)) {
            return invalid("interviewId güvenli opak id olmalı (1..128)");
        }
        FindingSetRef ref;
        try {
            ref = new FindingSetRef(findingSetRef);
        } catch (IllegalArgumentException ex) {
            return invalid("findingSetRef biçimi geçersiz");
        }
        Outcome<ScreeningView> out = service.get(
                tenantAccess.tenant(auth), new InterviewId(interviewId), ref);
        if (out instanceof Outcome.Fail<ScreeningView> fail) {
            return failNoStore(fail);
        }
        return ResponseEntity.ok()
                .headers(noStoreHeaders())
                .body(response(((Outcome.Ok<ScreeningView>) out).value()));
    }

    private Outcome<ScreeningView> screenTranscript(
            Authentication auth, InterviewId interviewId, String idempotencyKey,
            JsonValue.JsonObject body) {
        if (!body.values().keySet().equals(TRANSCRIPT_KEYS)) {
            return Outcome.fail(OutcomeCode.INVALID,
                    "TRANSCRIPT_SEGMENT yalnız sourceKind+transcriptKey+segmentIndex kabul eder");
        }
        String transcriptKey = string(body, "transcriptKey");
        Integer segmentIndex = nonNegativeInt(body, "segmentIndex");
        if (transcriptKey == null || segmentIndex == null) {
            return Outcome.fail(OutcomeCode.INVALID,
                    "transcriptKey + non-negative integer segmentIndex zorunlu");
        }
        return service.screen(new TranscriptSegmentRequest(
                tenantAccess.tenant(auth), tenantAccess.actor(auth), interviewId,
                idempotencyKey, transcriptKey, segmentIndex));
    }

    private Outcome<ScreeningView> screenCitation(
            Authentication auth, InterviewId interviewId, String idempotencyKey,
            JsonValue.JsonObject body) {
        if (!body.values().keySet().equals(CITATION_KEYS)) {
            return Outcome.fail(OutcomeCode.INVALID,
                    "CITATION_CLAIM yalnız sourceKind+citationKey kabul eder");
        }
        String citationKey = string(body, "citationKey");
        if (citationKey == null) {
            return Outcome.fail(OutcomeCode.INVALID, "citationKey zorunlu");
        }
        return service.screen(new CitationClaimRequest(
                tenantAccess.tenant(auth), tenantAccess.actor(auth), interviewId,
                idempotencyKey, citationKey));
    }

    private static ScreeningResponse response(ScreeningView view) {
        StoredEvidence evidence = view.evidence();
        ScreeningSourceResponse source = new ScreeningSourceResponse(
                evidence.sourceKind().name(), view.canonicalSourceRef(), view.segmentIndex());
        List<ScreeningFindingResponse> findings = evidence.findings().stream()
                .map(ScreeningApiController::finding)
                .toList();
        return new ScreeningResponse(
                evidence.findingSetRef().value(), evidence.runId().value(),
                evidence.policyRef().value(), evidence.coverage().name(),
                evidence.disposition().name(), source, findings,
                evidence.evidenceId().value(), evidence.schemaVersion(),
                evidence.occurredAt(), TextSpan.UNIT);
    }

    private static ScreeningFindingResponse finding(ScreeningFinding finding) {
        return new ScreeningFindingResponse(
                finding.category().name(), finding.signal().name(),
                finding.sourceKind().name(), new ScreeningTextSpanResponse(
                        finding.span().startInclusive(), finding.span().endExclusive(),
                        finding.span().segmentIndex()));
    }

    private static String string(JsonValue.JsonObject body, String key) {
        JsonValue value = body.values().get(key);
        return value instanceof JsonValue.JsonString string && !string.value().isBlank()
                ? string.value() : null;
    }

    private static Integer nonNegativeInt(JsonValue.JsonObject body, String key) {
        JsonValue value = body.values().get(key);
        if (!(value instanceof JsonValue.JsonNumber number)
                || number.value() != Math.rint(number.value())
                || number.value() < 0 || number.value() > Integer.MAX_VALUE) {
            return null;
        }
        return (int) number.value();
    }

    private static boolean validInterviewId(String value) {
        return value != null && INTERVIEW_ID.matcher(value).matches();
    }

    private static ResponseEntity<?> invalid(String reason) {
        return ResponseEntity.badRequest()
                .headers(noStoreHeaders())
                .body(new ScreeningErrorResponse("INVALID", reason));
    }

    private static ResponseEntity<?> failNoStore(Outcome.Fail<?> fail) {
        ResponseEntity<Map<String, String>> mapped = OutcomeHttp.fail(fail);
        Map<String, String> body = mapped.getBody();
        return ResponseEntity.status(mapped.getStatusCode())
                .headers(noStoreHeaders())
                .body(new ScreeningErrorResponse(
                        body == null ? fail.code().name() : body.get("error"),
                        body == null ? fail.reason() : body.get("reason")));
    }

    private static HttpHeaders noStoreHeaders() {
        HttpHeaders headers = new HttpHeaders();
        headers.setCacheControl(CacheControl.noStore());
        headers.setPragma("no-cache");
        return headers;
    }
}
