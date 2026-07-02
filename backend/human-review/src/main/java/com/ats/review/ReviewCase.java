package com.ats.review;

import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import java.util.List;

/**
 * İnsan-onay vaka kaydı (SİLİNEBİLİR content düzlemi). Alanlar POINTER'dır (ref) —
 * gerekçe/karar GÖVDESİ burada da yaşamaz (o P1-UI + `human_decision_rationale`
 * data-lifecycle sınıfının işi); WORM ledger yalnız pointer/meta alır (standart §4).
 */
public record ReviewCase(
        TenantId tenantId,
        InterviewId interviewId,
        ReviewState state,
        List<String> sourceEvidenceRefs,
        String aiOutputVersionRef,
        String humanActorRef,
        String oversightRoleRef,
        String humanChangeSummaryRef,
        String humanAuthoredRationaleRef,
        String decisionOutcomeRef,
        String exportArtifactRef,
        String reasonCode) {

    public ReviewCase {
        sourceEvidenceRefs = List.copyOf(sourceEvidenceRefs);
    }

    public ReviewCase with(ReviewState newState) {
        return new ReviewCase(tenantId, interviewId, newState, sourceEvidenceRefs, aiOutputVersionRef,
                humanActorRef, oversightRoleRef, humanChangeSummaryRef, humanAuthoredRationaleRef,
                decisionOutcomeRef, exportArtifactRef, reasonCode);
    }

    public ReviewCase withHumanActor(String actorRef, String roleRef) {
        return new ReviewCase(tenantId, interviewId, state, sourceEvidenceRefs, aiOutputVersionRef,
                actorRef, roleRef, humanChangeSummaryRef, humanAuthoredRationaleRef,
                decisionOutcomeRef, exportArtifactRef, reasonCode);
    }

    public ReviewCase withChangeSummary(String changeSummaryRef) {
        return new ReviewCase(tenantId, interviewId, state, sourceEvidenceRefs, aiOutputVersionRef,
                humanActorRef, oversightRoleRef, changeSummaryRef, humanAuthoredRationaleRef,
                decisionOutcomeRef, exportArtifactRef, reasonCode);
    }

    public ReviewCase withRationale(String rationaleRef) {
        return new ReviewCase(tenantId, interviewId, state, sourceEvidenceRefs, aiOutputVersionRef,
                humanActorRef, oversightRoleRef, humanChangeSummaryRef, rationaleRef,
                decisionOutcomeRef, exportArtifactRef, reasonCode);
    }

    public ReviewCase withDecisionOutcome(String outcomeRef) {
        return new ReviewCase(tenantId, interviewId, state, sourceEvidenceRefs, aiOutputVersionRef,
                humanActorRef, oversightRoleRef, humanChangeSummaryRef, humanAuthoredRationaleRef,
                outcomeRef, exportArtifactRef, reasonCode);
    }

    public ReviewCase withExportArtifact(String artifactRef) {
        return new ReviewCase(tenantId, interviewId, state, sourceEvidenceRefs, aiOutputVersionRef,
                humanActorRef, oversightRoleRef, humanChangeSummaryRef, humanAuthoredRationaleRef,
                decisionOutcomeRef, artifactRef, reasonCode);
    }

    public ReviewCase withReason(String reason) {
        return new ReviewCase(tenantId, interviewId, state, sourceEvidenceRefs, aiOutputVersionRef,
                humanActorRef, oversightRoleRef, humanChangeSummaryRef, humanAuthoredRationaleRef,
                decisionOutcomeRef, exportArtifactRef, reason);
    }
}
