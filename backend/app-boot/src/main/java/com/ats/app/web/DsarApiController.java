package com.ats.app.web;

import com.ats.dsr.DsrService;
import com.ats.dsr.DsrService.ErasureReceipt;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Outcome;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
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
        Outcome<ErasureReceipt> out = dsrService.executeErasure(tenantAccess.tenant(auth),
                tenantAccess.actor(auth), new InterviewId(interviewId), dsarKey);
        if (out instanceof Outcome.Fail<ErasureReceipt> fail) {
            ResponseEntity<Map<String, String>> failed = OutcomeHttp.fail(fail);
            return noStore(ResponseEntity.status(failed.getStatusCode())).body(failed.getBody());
        }
        ErasureReceipt r = ((Outcome.Ok<ErasureReceipt>) out).value();
        return noStore(ResponseEntity.ok()).body(Map.of(
                "dsarKey", r.dsarKey(),
                "tombstoneCount", r.tombstoneCount(),
                "deletedContentCount", r.deletedContentCount(),
                "caseTransitioned", r.caseTransitioned()));
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
