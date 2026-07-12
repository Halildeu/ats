package com.ats.app.web;

import com.ats.export.ExportContext;
import com.ats.export.ExportContext.CriterionRef;
import com.ats.export.ExportService;
import com.ats.export.ExportService.ExportArtifactContent;
import com.ats.export.ExportService.ExportDisposition;
import com.ats.export.ExportService.ExportPacketResult;
import com.ats.export.ExportService.ExportReceipt;
import com.ats.export.ExportService.ExportReceiptRecovery;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Outcome;
import io.swagger.v3.oas.annotations.headers.Header;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
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
    private final TenantAccess tenantAccess;

    ExportApiController(ExportService exportService, TenantAccess tenantAccess) {
        this.exportService = exportService;
        this.tenantAccess = tenantAccess;
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

    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Yeni kanıt paketi üretildi"),
            @ApiResponse(responseCode = "200",
                    description = "İdempotent replay: aynı request_digest'li mevcut makbuz döndü"
                            + " (yeni side-effect yok)",
                    headers = @Header(name = "X-ATS-Replay",
                            description = "Doğrulanmış replay işareti (true)")),
    })
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
        Outcome<ExportPacketResult> out = exportService.exportPacket(
                tenantAccess.tenant(auth), tenantAccess.actor(auth), new InterviewId(interviewId),
                body.caseKey(), body.citationKeys(), ctx, Instant.now().toString());
        if (out instanceof Outcome.Fail<ExportPacketResult> fail) {
            return OutcomeHttp.fail(fail);
        }
        ExportPacketResult result = ((Outcome.Ok<ExportPacketResult>) out).value();
        ExportReceipt r = result.receipt();
        Map<String, Object> bodyMap = Map.of(
                "artifactKey", r.artifactKey(),
                "evidenceId", r.evidenceId(),
                "packetDigest", r.packetDigest(),
                "claimCount", r.claimCount());
        // 39d-10: yeni üretim 201; DOĞRULANMIŞ idempotent replay 200 + X-ATS-Replay
        // (aynı request_digest — gövde birebir; farklı istek 400 conflict alır).
        if (result.disposition() == ExportDisposition.REPLAYED) {
            return ResponseEntity.ok().header("X-ATS-Replay", "true").body(bodyMap);
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(bodyMap);
    }

    /**
     * 39d-8 receipt-recovery (R2 residual): ledger-bagli export makbuzunu salt-okuma
     * kurtarir. caseState=FINALIZED + makbuz = R4 (transitionStatus=INCOMPLETE —
     * tamamlanmis export DEGIL; repair runbook'u). Cache'lenmez (opak ref + digest):
     * Cache-Control no-store. caseKey '/' icerebilir → query param.
     */
    @GetMapping("/api/v1/interviews/{interviewId}/export/receipt")
    ResponseEntity<?> exportReceipt(Authentication auth,
            @PathVariable("interviewId") String interviewId,
            @RequestParam(name = "caseKey", required = false) String caseKey) {
        // no-store TÜM receipt cevaplarında (39d-8c): hata gövdeleri de opak ref/
        // reason taşıyabilir — shared-cache'e hiçbir varyant yazılmaz.
        if (caseKey == null || caseKey.isBlank() || caseKey.length() > 512
                || caseKey.chars().anyMatch(c -> c < 0x20 || c == 0x7f)) {
            return noStore(ResponseEntity.badRequest()).body(Map.of("error", "INVALID",
                    "reason", "caseKey zorunlu (opak; kontrol-karakteri ve 512 karakterden uzun değer reddedilir)"));
        }
        Outcome<ExportReceiptRecovery> out = exportService.exportReceipt(
                tenantAccess.tenant(auth), tenantAccess.actor(auth),
                new InterviewId(interviewId), caseKey);
        if (out instanceof Outcome.Fail<ExportReceiptRecovery> fail) {
            ResponseEntity<Map<String, String>> failed = OutcomeHttp.fail(fail);
            return noStore(ResponseEntity.status(failed.getStatusCode())).body(failed.getBody());
        }
        ExportReceiptRecovery r = ((Outcome.Ok<ExportReceiptRecovery>) out).value();
        return noStore(ResponseEntity.ok())
                .body(Map.of(
                        "caseKey", r.caseKey(),
                        "caseState", r.caseState(),
                        "transitionStatus", r.transitionStatus(),
                        "artifactKey", r.artifactKey(),
                        "evidenceId", r.evidenceId(),
                        "packetDigest", r.packetDigest(),
                        "claimCount", r.claimCount(),
                        "ledgerRecordedAt", r.ledgerRecordedAt()));
    }

    /**
     * 39d-9 artifact-read: ledger-bağlı export artifact'ini verbatim döndürür
     * (server parse/re-serialize ETMEZ; bütünlük serviste sha256(depolanan tam
     * string)==ledger.artifact_digest ile). GET-only — HEAD DESTEKLENMEZ
     * (SecurityConfig matcher'ı GET; artifact-existence oracle'ı ayrıca
     * açılmaz). Erasure-sonrası 404 = content-plane yokluğunun API kanıtı;
     * store operasyonel hatası 404'e EZİLMEZ (Outcome code'u aynen taşınır).
     * no-store TÜM cevaplarda (opak ref + digest taşır).
     */
    @GetMapping("/api/v1/interviews/{interviewId}/export/artifact")
    ResponseEntity<?> exportArtifact(Authentication auth,
            @PathVariable("interviewId") String interviewId,
            @RequestParam(name = "caseKey", required = false) String caseKey) {
        if (caseKey == null || caseKey.isBlank() || caseKey.length() > 512
                || caseKey.chars().anyMatch(c -> c < 0x20 || c == 0x7f)) {
            return noStore(ResponseEntity.badRequest()).body(Map.of("error", "INVALID",
                    "reason", "caseKey zorunlu (opak; kontrol-karakteri ve 512 karakterden uzun değer reddedilir)"));
        }
        Outcome<ExportArtifactContent> out = exportService.exportArtifact(
                tenantAccess.tenant(auth), tenantAccess.actor(auth),
                new InterviewId(interviewId), caseKey);
        if (out instanceof Outcome.Fail<ExportArtifactContent> fail) {
            ResponseEntity<Map<String, String>> failed = OutcomeHttp.fail(fail);
            return noStore(ResponseEntity.status(failed.getStatusCode())).body(failed.getBody());
        }
        return noStore(ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON))
                .body(((Outcome.Ok<ExportArtifactContent>) out).value().packetJson());
    }

    private static ResponseEntity.BodyBuilder noStore(ResponseEntity.BodyBuilder b) {
        return b.header("Cache-Control", "no-store").header("Pragma", "no-cache");
    }
}
