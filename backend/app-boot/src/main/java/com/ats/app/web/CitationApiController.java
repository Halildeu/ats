package com.ats.app.web;

import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Outcome;
import com.ats.orchestration.CitationService;
import com.ats.orchestration.CitationService.CitationReceipt;
import java.time.Instant;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * F4 claim-citation API — CitationService'in fail-closed çekirdeği aynen geçer
 * (claim_mismatch / invalid_refs / kaynaksız-SUPPORTED / INSUFFICIENT dürüst;
 * skor/karar YOK). tenant/actor token'dan; occurred_at sunucu saati.
 * Yanıt pointer-only: citationKey + entailment + refCount (claim metni yanıtta
 * yankılanmaz — istemci zaten gönderdi; content-plane API'si ayrı okuma dilimi).
 */
@RestController
class CitationApiController {

    private final ObjectProvider<CitationService> citationServices;
    private final TenantAccess tenantAccess;

    CitationApiController(ObjectProvider<CitationService> citationServices, TenantAccess tenantAccess) {
        this.citationServices = citationServices;
        this.tenantAccess = tenantAccess;
    }

    record CiteBody(String transcriptKey, String claim) {}

    @PostMapping("/api/v1/interviews/{interviewId}/citations")
    ResponseEntity<?> citeClaim(Authentication auth,
            @PathVariable("interviewId") String interviewId, @RequestBody CiteBody body) {
        CitationService citationService = citationServices.getIfAvailable();
        if (citationService == null) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .cacheControl(org.springframework.http.CacheControl.noStore())
                    .body(Map.of(
                            "error", "AI_NOT_APPROVED",
                            "reason", "AI capability owner-approved governance activation bekliyor"));
        }
        if (body == null || body.transcriptKey() == null || body.transcriptKey().isBlank()
                || body.claim() == null || body.claim().isBlank()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "INVALID", "reason", "transcriptKey + claim zorunlu"));
        }
        Outcome<CitationReceipt> out = citationService.citeClaim(
                tenantAccess.tenant(auth), tenantAccess.actor(auth), new InterviewId(interviewId),
                body.transcriptKey(), body.claim(), Instant.now().toString());
        if (out instanceof Outcome.Fail<CitationReceipt> fail) {
            return OutcomeHttp.fail(fail);
        }
        CitationReceipt r = ((Outcome.Ok<CitationReceipt>) out).value();
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of(
                "citationKey", r.citationKey(),
                "evidenceId", r.evidenceId(),
                "entailment", r.entailment().name(),
                "resolvedRefCount", r.resolvedRefCount()));
    }
}
