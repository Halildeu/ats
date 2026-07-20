package com.ats.app.web;

import com.ats.dsr.DsrService;
import com.ats.dsr.DsrService.ErasureReceipt;
import com.ats.dsr.ErasureScope;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Outcome;
import com.ats.screening.FindingSetRef;
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
 * F10 DSAR/erasure API — DsrService fail-closed çekirdeği aynen: TOMBSTONE-ÖNCE
 * sıra (WORM silinmez; tombstone yazılamazsa content silinmez), content-plane
 * silme idempotent, terminal vaka state'i korunur ama content silinir (dürüst
 * receipt). subjectRef OPAK; scope anahtarları '/' içerir → gövdede.
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

    @PostMapping("/api/v1/interviews/{interviewId}/dsar")
    ResponseEntity<?> receiveDsar(Authentication auth,
            @PathVariable("interviewId") String interviewId, @RequestBody DsarBody body) {
        if (body == null || body.subjectRef() == null || body.subjectRef().isBlank()) {
            return badRequest("subjectRef zorunlu (opak referans)");
        }
        Outcome<String> out = dsrService.receiveDsar(tenantAccess.tenant(auth),
                new InterviewId(interviewId), body.subjectRef(), body.reasonCode());
        if (out instanceof Outcome.Fail<String> fail) {
            return OutcomeHttp.fail(fail);
        }
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(Map.of("dsarKey", ((Outcome.Ok<String>) out).value()));
    }

    record ScopeDto(List<String> transcriptKeys, List<String> citationKeys,
            List<String> exportArtifactKeys, List<String> reviewCaseKeys,
            List<String> screeningFindingSetRefs,
            List<String> tombstoneTargetEvidenceIds) {}

    record ErasureBody(String dsarKey, ScopeDto scope) {}

    @PostMapping("/api/v1/interviews/{interviewId}/dsar/erasure")
    ResponseEntity<?> executeErasure(Authentication auth,
            @PathVariable("interviewId") String interviewId, @RequestBody ErasureBody body) {
        if (body == null || body.dsarKey() == null || body.dsarKey().isBlank() || body.scope() == null) {
            return badRequest("dsarKey + scope zorunlu");
        }
        ScopeDto s = body.scope();
        // fail-closed doğrulama (Codex #66 blocker-2): null eleman NPE→500 yerine 400
        if (hasNullElement(s.transcriptKeys()) || hasNullElement(s.citationKeys())
                || hasNullElement(s.exportArtifactKeys()) || hasNullElement(s.reviewCaseKeys())
                || hasNullElement(s.screeningFindingSetRefs())
                || hasNullElement(s.tombstoneTargetEvidenceIds())) {
            return badRequest("scope listelerinde null eleman olamaz (fail-closed)");
        }
        for (String ref : orEmpty(s.screeningFindingSetRefs())) {
            try {
                new FindingSetRef(ref);
            } catch (IllegalArgumentException ex) {
                return badRequest("screeningFindingSetRefs yalnız fsr_<64 lowercase hex> kabul eder");
            }
        }
        ErasureScope scope = new ErasureScope(
                orEmpty(s.transcriptKeys()), orEmpty(s.citationKeys()),
                orEmpty(s.exportArtifactKeys()), orEmpty(s.reviewCaseKeys()),
                orEmpty(s.screeningFindingSetRefs()),
                orEmpty(s.tombstoneTargetEvidenceIds()));
        Outcome<ErasureReceipt> out = dsrService.executeErasure(tenantAccess.tenant(auth),
                tenantAccess.actor(auth), new InterviewId(interviewId), body.dsarKey(), scope);
        if (out instanceof Outcome.Fail<ErasureReceipt> fail) {
            return OutcomeHttp.fail(fail);
        }
        ErasureReceipt r = ((Outcome.Ok<ErasureReceipt>) out).value();
        return ResponseEntity.ok(Map.of(
                "dsarKey", r.dsarKey(),
                "tombstoneCount", r.tombstoneCount(),
                "deletedContentCount", r.deletedContentCount(),
                "caseTransitioned", r.caseTransitioned()));
    }

    private static List<String> orEmpty(List<String> v) {
        return v == null ? List.of() : v;
    }

    private static boolean hasNullElement(List<String> list) {
        return list != null && list.stream().anyMatch(java.util.Objects::isNull);
    }

    private static ResponseEntity<Map<String, String>> badRequest(String reason) {
        return ResponseEntity.badRequest().body(Map.of("error", "INVALID", "reason", reason));
    }
}
