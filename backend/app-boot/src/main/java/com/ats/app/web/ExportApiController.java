package com.ats.app.web;

import com.ats.export.ExportContext;
import com.ats.export.ExportContext.CriterionRef;
import com.ats.export.ExportService;
import com.ats.export.ExportService.ExportReceipt;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Outcome;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * F7 evidence-packet export API — ExportService'in fail-closed çekirdeği aynen:
 * YALNIZ FINALIZED vaka; kriter-bağlama (iş-ilişkililik) zorunlu; INSUFFICIENT
 * claim pakete giremez; packet pointer-only (claim metni/karar gövdesi yok).
 * Tüm context alanları OPAK ref'lerdir (çağıran sözleşmesi); tenant/actor
 * token'dan; occurred_at sunucu saati. caseKey/citationKey '/' içerir → gövdede.
 */
@RestController
class ExportApiController {

    private final ExportService exportService;

    ExportApiController(ExportService exportService) {
        this.exportService = exportService;
    }

    private static boolean hasNullElement(List<?> list) {
        return list != null && list.stream().anyMatch(java.util.Objects::isNull);
    }

    private static boolean hasNullEntry(Map<String, String> map) {
        return map != null && map.entrySet().stream()
                .anyMatch(e -> e.getKey() == null || e.getValue() == null);
    }

    record CriterionDto(String criterionId, String jobRelatednessRationaleRef) {}

    record ContextDto(String generatorVersionRef, String locale, String timezone,
            String aiAssistanceDisclosureRef, List<String> consentRefs, String rubricVersionRef,
            List<CriterionDto> criteria, Map<String, String> citationCriterion,
            List<String> wormChainRefs, String redactionPolicyRef, String redactionRunRef,
            String retentionPolicyRef, String schemaDigest, String signatureRef) {}

    record ExportBody(String caseKey, List<String> citationKeys, ContextDto context) {}

    @PostMapping("/api/v1/interviews/{interviewId}/export")
    ResponseEntity<?> exportPacket(Authentication auth,
            @PathVariable("interviewId") String interviewId, @RequestBody ExportBody body) {
        if (body == null || body.caseKey() == null || body.caseKey().isBlank() || body.context() == null) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "INVALID", "reason", "caseKey + context zorunlu"));
        }
        ContextDto c = body.context();
        // fail-closed doğrulama (Codex #66 blocker-2): null eleman NPE→500 yerine 400
        if (hasNullElement(body.citationKeys()) || hasNullElement(c.consentRefs())
                || hasNullElement(c.wormChainRefs()) || hasNullElement(c.criteria())
                || hasNullEntry(c.citationCriterion())) {
            return ResponseEntity.badRequest().body(Map.of("error", "INVALID",
                    "reason", "listelerde/map'te null eleman olamaz (fail-closed)"));
        }
        ExportContext ctx = new ExportContext(
                c.generatorVersionRef(), c.locale(), c.timezone(), c.aiAssistanceDisclosureRef(),
                c.consentRefs() == null ? List.of() : c.consentRefs(),
                c.rubricVersionRef(),
                c.criteria() == null ? List.of()
                        : c.criteria().stream()
                                .map(cr -> new CriterionRef(cr.criterionId(), cr.jobRelatednessRationaleRef()))
                                .toList(),
                c.citationCriterion() == null ? Map.of() : c.citationCriterion(),
                c.wormChainRefs() == null ? List.of() : c.wormChainRefs(),
                c.redactionPolicyRef(), c.redactionRunRef(), c.retentionPolicyRef(),
                c.schemaDigest(), c.signatureRef());
        Outcome<ExportReceipt> out = exportService.exportPacket(
                TenantAccess.tenant(auth), TenantAccess.actor(auth), new InterviewId(interviewId),
                body.caseKey(), body.citationKeys(), ctx, Instant.now().toString());
        if (out instanceof Outcome.Fail<ExportReceipt> fail) {
            return OutcomeHttp.fail(fail);
        }
        ExportReceipt r = ((Outcome.Ok<ExportReceipt>) out).value();
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of(
                "artifactKey", r.artifactKey(),
                "evidenceId", r.evidenceId(),
                "packetDigest", r.packetDigest(),
                "claimCount", r.claimCount()));
    }
}
