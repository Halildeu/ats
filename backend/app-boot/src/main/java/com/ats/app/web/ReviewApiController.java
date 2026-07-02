package com.ats.app.web;

import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.review.HumanReviewService;
import com.ats.review.HumanReviewService.FinalizeReceipt;
import com.ats.review.ReviewCase;
import com.ats.review.ReviewCaseStore;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * F5 human-review API — state-machine HumanReviewService'te (tek-FINALIZED-girişi,
 * required-on-entry ref'ler, no-auto-finalize); controller yalnız ince eşleme.
 *
 * caseKey '/' içerir (content-addressed depo anahtarı) — transcript kararıyla
 * tutarlı: path-segment DEĞİL, gövde/query-param taşır (encoded-slash reddi).
 * Geçişler TEK endpoint + KAPALI action enum'u (bilinmeyen action 400; hepsi
 * aynı REVIEW_WRITE scope'unda — ince-taneli rol ayrımı ayrı ADR).
 *
 * Aktör modeli: humanActorRef DAİMA token sub'ı (gövdeden aktör kabul edilmez —
 * başkası adına review yapısal imkânsız); oversightRoleRef gövdeden (rol beyanı).
 */
@RestController
class ReviewApiController {

    private final HumanReviewService reviewService;
    private final ReviewCaseStore reviewStore;

    ReviewApiController(HumanReviewService reviewService, ReviewCaseStore reviewStore) {
        this.reviewService = reviewService;
        this.reviewStore = reviewStore;
    }

    record OpenBody(List<String> sourceEvidenceRefs, String aiOutputVersionRef) {}

    @PostMapping("/api/v1/interviews/{interviewId}/review-cases")
    ResponseEntity<?> open(Authentication auth,
            @PathVariable("interviewId") String interviewId, @RequestBody OpenBody body) {
        if (body == null) {
            return badRequest("gövde zorunlu");
        }
        Outcome<String> out = reviewService.open(TenantAccess.tenant(auth),
                new InterviewId(interviewId), body.sourceEvidenceRefs(), body.aiOutputVersionRef());
        if (out instanceof Outcome.Fail<String> fail) {
            return OutcomeHttp.fail(fail);
        }
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(Map.of("caseKey", ((Outcome.Ok<String>) out).value()));
    }

    enum TransitionAction { START, EDIT, REVIEWED_NO_CHANGE, REJECT, RATIONALE }

    record TransitionBody(String caseKey, String action, String ref, String oversightRoleRef) {}

    @PostMapping("/api/v1/interviews/{interviewId}/review-case/transition")
    ResponseEntity<?> transition(Authentication auth,
            @PathVariable("interviewId") String interviewId, @RequestBody TransitionBody body) {
        if (body == null || body.caseKey() == null || body.caseKey().isBlank() || body.action() == null) {
            return badRequest("caseKey + action zorunlu");
        }
        TransitionAction action;
        try {
            action = TransitionAction.valueOf(body.action());
        } catch (IllegalArgumentException e) {
            return badRequest("action START|EDIT|REVIEWED_NO_CHANGE|REJECT|RATIONALE olmalı");
        }
        TenantId tenant = TenantAccess.tenant(auth);
        InterviewId iv = new InterviewId(interviewId);
        var actor = TenantAccess.actor(auth); // HER insan-adımı actor-aware (accountability zinciri)
        Outcome<Void> out = switch (action) {
            case START -> reviewService.startReview(tenant, iv, body.caseKey(),
                    actor.value(), body.oversightRoleRef());
            case EDIT -> reviewService.recordEdit(tenant, actor, iv, body.caseKey(), body.ref());
            case REVIEWED_NO_CHANGE -> reviewService.markReviewedNoChange(tenant, actor, iv, body.caseKey());
            case REJECT -> reviewService.rejectAiSuggestion(tenant, actor, iv, body.caseKey(), body.ref());
            case RATIONALE -> reviewService.recordRationale(tenant, actor, iv, body.caseKey(), body.ref());
        };
        if (out instanceof Outcome.Fail<Void> fail) {
            return OutcomeHttp.fail(fail);
        }
        return ResponseEntity.noContent().build();
    }

    record FinalizeBody(String caseKey, String decisionOutcomeRef) {}

    @PostMapping("/api/v1/interviews/{interviewId}/review-case/finalize")
    ResponseEntity<?> finalizeDecision(Authentication auth,
            @PathVariable("interviewId") String interviewId, @RequestBody FinalizeBody body) {
        if (body == null || body.caseKey() == null || body.caseKey().isBlank()) {
            return badRequest("caseKey zorunlu");
        }
        Outcome<FinalizeReceipt> out = reviewService.finalizeDecision(TenantAccess.tenant(auth),
                TenantAccess.actor(auth), new InterviewId(interviewId), body.caseKey(),
                body.decisionOutcomeRef(), Instant.now().toString());
        if (out instanceof Outcome.Fail<FinalizeReceipt> fail) {
            return OutcomeHttp.fail(fail);
        }
        FinalizeReceipt r = ((Outcome.Ok<FinalizeReceipt>) out).value();
        return ResponseEntity.ok(Map.of("caseKey", r.caseKey(), "evidenceId", r.evidenceId()));
    }

    record CaseDto(String state, List<String> sourceEvidenceRefs, String aiOutputVersionRef,
            String humanActorRef, String oversightRoleRef, String humanChangeSummaryRef,
            String humanAuthoredRationaleRef, String decisionOutcomeRef, String exportArtifactRef,
            String reasonCode) {}

    @GetMapping("/api/v1/interviews/{interviewId}/review-case")
    ResponseEntity<?> getCase(Authentication auth, @PathVariable("interviewId") String interviewId,
            @RequestParam("case") String caseKey) {
        TenantId tenant = TenantAccess.tenant(auth);
        Outcome<ReviewCase> out = reviewStore.find(tenant, new InterviewId(interviewId), caseKey);
        if (out instanceof Outcome.Fail<ReviewCase> fail) {
            return OutcomeHttp.fail(fail);
        }
        ReviewCase c = ((Outcome.Ok<ReviewCase>) out).value();
        return ResponseEntity.ok(new CaseDto(c.state().name(), c.sourceEvidenceRefs(),
                c.aiOutputVersionRef(), c.humanActorRef(), c.oversightRoleRef(),
                c.humanChangeSummaryRef(), c.humanAuthoredRationaleRef(), c.decisionOutcomeRef(),
                c.exportArtifactRef(), c.reasonCode()));
    }

    private static ResponseEntity<Map<String, String>> badRequest(String reason) {
        return ResponseEntity.badRequest().body(Map.of("error", "INVALID", "reason", reason));
    }
}
