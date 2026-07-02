package com.ats.review;

import com.ats.consent.ConsentGate;
import com.ats.contracts.EvidenceLedger;
import com.ats.contracts.EvidenceLedger.EvidenceEvent;
import com.ats.contracts.EvidenceLedger.LedgerEntry;
import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.JsonValue;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import com.ats.ops.OperationalEvent;
import com.ats.ops.OperationalEventSink;
import com.ats.ops.PiiClass;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * PRD-P1 F5 human-approve state-machine (ATS-0016 slice-4, port-only) —
 * docs/governance/human-oversight-standard.md §1-§4'ün runtime karşılığı:
 * - "AI karar VERMEZ": FINALIZED'e TEK giriş HUMAN_RATIONALE_RECORDED'dır; ai-tipi
 *   state'ten finalize YAPISAL olarak imkânsız (transition tablosu kapalı küme).
 * - FINALIZED required-on-entry 6 ref birden: human_actor + oversight_role + rationale +
 *   source_evidence_refs + ai_output_version + decision_outcome.
 * - terminal (EXPORTED/WITHDRAWN) çıkışsız; locked (FINALIZED) yalnız terminal'e —
 *   RE-OPEN YASAK.
 * - Consent-withdrawal: finalize fail-closed reddedilir; vaka withdraw() ile WITHDRAWN'a taşınır.
 * - WORM binding (standart §4): ledger entry yalnız POINTER/meta taşır (gerekçe GÖVDESİ
 *   silinebilir düzlemde — `human_decision_rationale`); op-event `evidence.human_decision.finalized`
 *   actor_ref + ledger_entry_ref ile ledger'a İŞARET eder, gövde taşımaz.
 * Dürüst sınır: insan-vs-AI aktör AYRIMI runtime kimlik katmanının işi (P1-UI residual);
 * burada zorlanan şey state-machine + zorunlu insan-akış ref'leridir.
 */
public final class HumanReviewService {

    static final String FINALIZED_EVENT = "evidence.human_decision.finalized";
    static final String APPEND_FAILED_EVENT = "evidence.append.failed";
    static final String LEDGER_EVENT_TYPE = "human_decision.finalized";

    /** human-oversight-standard §2 geçiş tablosunun birebir mirror'ı (tek otorite o tablo). */
    private static final Map<ReviewState, Set<ReviewState>> ALLOWED = Map.of(
            ReviewState.AI_SUGGESTED, Set.of(ReviewState.HUMAN_REVIEWING, ReviewState.WITHDRAWN),
            ReviewState.HUMAN_REVIEWING, Set.of(ReviewState.HUMAN_EDITED, ReviewState.HUMAN_REVIEWED_NO_CHANGE,
                    ReviewState.AI_SUGGESTION_REJECTED, ReviewState.WITHDRAWN),
            ReviewState.HUMAN_EDITED, Set.of(ReviewState.HUMAN_RATIONALE_RECORDED, ReviewState.WITHDRAWN),
            ReviewState.HUMAN_REVIEWED_NO_CHANGE, Set.of(ReviewState.HUMAN_RATIONALE_RECORDED, ReviewState.WITHDRAWN),
            ReviewState.AI_SUGGESTION_REJECTED, Set.of(ReviewState.HUMAN_RATIONALE_RECORDED, ReviewState.WITHDRAWN),
            ReviewState.HUMAN_RATIONALE_RECORDED, Set.of(ReviewState.FINALIZED, ReviewState.WITHDRAWN),
            ReviewState.FINALIZED, Set.of(ReviewState.EXPORTED, ReviewState.WITHDRAWN),
            ReviewState.EXPORTED, Set.of(),
            ReviewState.WITHDRAWN, Set.of());

    public record FinalizeReceipt(String caseKey, String evidenceId) {}

    private final ConsentGate consentGate;
    private final ReviewCaseStore store;
    private final EvidenceLedger ledger;
    private final OperationalEventSink sink;

    public HumanReviewService(ConsentGate consentGate, ReviewCaseStore store,
            EvidenceLedger ledger, OperationalEventSink sink) {
        this.consentGate = consentGate;
        this.store = store;
        this.ledger = ledger;
        this.sink = sink;
    }

    /** AI önerisi vaka açar (assist) — required-on-entry: source_evidence_refs + ai_output_version_ref. */
    public Outcome<String> open(TenantId tenantId, InterviewId interviewId,
            List<String> sourceEvidenceRefs, String aiOutputVersionRef) {
        if (sourceEvidenceRefs == null || sourceEvidenceRefs.isEmpty()
                || sourceEvidenceRefs.stream().anyMatch(r -> r == null || r.isBlank())) {
            return Outcome.fail(OutcomeCode.INVALID, "source_evidence_refs zorunlu (AI_SUGGESTED required-on-entry)");
        }
        if (isBlank(aiOutputVersionRef)) {
            return Outcome.fail(OutcomeCode.INVALID, "ai_output_version_ref zorunlu (AI_SUGGESTED required-on-entry)");
        }
        return store.put(new ReviewCase(tenantId, interviewId, ReviewState.AI_SUGGESTED,
                sourceEvidenceRefs, aiOutputVersionRef, null, null, null, null, null, null, null));
    }

    public Outcome<Void> startReview(TenantId tenantId, InterviewId interviewId, String caseKey,
            String humanActorRef, String oversightRoleRef) {
        if (isBlank(humanActorRef) || isBlank(oversightRoleRef)) {
            return Outcome.fail(OutcomeCode.INVALID, "human_actor_ref + oversight_role_ref zorunlu (HUMAN_REVIEWING)");
        }
        return transition(tenantId, new ActorId(humanActorRef), interviewId, caseKey,
                ReviewState.AI_SUGGESTED, ReviewState.HUMAN_REVIEWING,
                c -> c.withHumanActor(humanActorRef, oversightRoleRef));
    }

    public Outcome<Void> recordEdit(TenantId tenantId, ActorId actor, InterviewId interviewId, String caseKey,
            String humanChangeSummaryRef) {
        if (isBlank(humanChangeSummaryRef)) {
            return Outcome.fail(OutcomeCode.INVALID, "human_change_summary_ref zorunlu (HUMAN_EDITED)");
        }
        return transition(tenantId, actor, interviewId, caseKey, ReviewState.HUMAN_REVIEWING, ReviewState.HUMAN_EDITED,
                c -> c.withChangeSummary(humanChangeSummaryRef));
    }

    public Outcome<Void> markReviewedNoChange(TenantId tenantId, ActorId actor, InterviewId interviewId, String caseKey) {
        return transition(tenantId, actor, interviewId, caseKey, ReviewState.HUMAN_REVIEWING,
                ReviewState.HUMAN_REVIEWED_NO_CHANGE, c -> c);
    }

    public Outcome<Void> rejectAiSuggestion(TenantId tenantId, ActorId actor, InterviewId interviewId, String caseKey,
            String humanAuthoredRationaleRef) {
        if (isBlank(humanAuthoredRationaleRef)) {
            return Outcome.fail(OutcomeCode.INVALID, "human_authored_rationale_ref zorunlu (AI_SUGGESTION_REJECTED)");
        }
        return transition(tenantId, actor, interviewId, caseKey, ReviewState.HUMAN_REVIEWING,
                ReviewState.AI_SUGGESTION_REJECTED, c -> c.withRationale(humanAuthoredRationaleRef));
    }

    public Outcome<Void> recordRationale(TenantId tenantId, ActorId actor, InterviewId interviewId, String caseKey,
            String humanAuthoredRationaleRef) {
        if (isBlank(humanAuthoredRationaleRef)) {
            return Outcome.fail(OutcomeCode.INVALID, "human_authored_rationale_ref zorunlu (HUMAN_RATIONALE_RECORDED)");
        }
        Outcome<ReviewCase> found = store.find(tenantId, interviewId, caseKey);
        if (!(found instanceof Outcome.Ok<ReviewCase> ok)) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "vaka yok (tenant-scope)");
        }
        ReviewCase current = ok.value();
        Outcome<Void> actorOk = requireSameActor(current, actor);
        if (actorOk instanceof Outcome.Fail<Void> mismatch) {
            return mismatch;
        }
        if (!ALLOWED.get(current.state()).contains(ReviewState.HUMAN_RATIONALE_RECORDED)) {
            return Outcome.fail(OutcomeCode.INVALID, "geçersiz geçiş: " + current.state() + " → HUMAN_RATIONALE_RECORDED");
        }
        return store.save(tenantId, caseKey,
                current.withRationale(humanAuthoredRationaleRef).with(ReviewState.HUMAN_RATIONALE_RECORDED));
    }

    /**
     * TEK FINALIZED girişi — yalnız HUMAN_RATIONALE_RECORDED'dan; 6 required-on-entry ref birden
     * doğrulanır; consent-withdrawal fail-closed engeller; ledger-fail'de state geri alınır.
     */
    public Outcome<FinalizeReceipt> finalizeDecision(TenantId tenantId, ActorId actorId, InterviewId interviewId,
            String caseKey, String decisionOutcomeRef, String occurredAtIso) {
        if (isBlank(decisionOutcomeRef)) {
            return Outcome.fail(OutcomeCode.INVALID, "decision_outcome_ref zorunlu (FINALIZED required-on-entry)");
        }
        Outcome<Void> consent = consentGate.requireRecordingAllowed(tenantId, interviewId);
        if (consent instanceof Outcome.Fail<Void> denied) {
            return Outcome.fail(denied.code(), denied.reason());
        }
        Outcome<ReviewCase> found = store.find(tenantId, interviewId, caseKey);
        if (!(found instanceof Outcome.Ok<ReviewCase> ok)) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "vaka yok (tenant-scope)");
        }
        ReviewCase current = ok.value();
        Outcome<Void> actorOk = requireSameActor(current, actorId);
        if (actorOk instanceof Outcome.Fail<Void> mismatch) {
            return Outcome.fail(mismatch.code(), mismatch.reason());
        }
        if (current.state() != ReviewState.HUMAN_RATIONALE_RECORDED) {
            return Outcome.fail(OutcomeCode.INVALID,
                    "FINALIZED'e tek giriş HUMAN_RATIONALE_RECORDED'dır (insan gerekçesi olmadan finalize YOK): " + current.state());
        }
        ReviewCase finalized = current.withDecisionOutcome(decisionOutcomeRef).with(ReviewState.FINALIZED);
        if (isBlank(finalized.humanActorRef()) || isBlank(finalized.oversightRoleRef())
                || isBlank(finalized.humanAuthoredRationaleRef()) || finalized.sourceEvidenceRefs().isEmpty()
                || isBlank(finalized.aiOutputVersionRef()) || isBlank(finalized.decisionOutcomeRef())) {
            return Outcome.fail(OutcomeCode.INVALID, "FINALIZED required-on-entry 6 ref birden dolu olmalı");
        }
        Outcome<Void> saved = store.save(tenantId, caseKey, finalized);
        if (!saved.isOk()) {
            return Outcome.fail(OutcomeCode.INVALID, "vaka kaydedilemedi");
        }

        String contentHash = sha256Hex(caseKey + "|" + decisionOutcomeRef + "|" + finalized.humanAuthoredRationaleRef()
                + "|" + finalized.aiOutputVersionRef() + "|" + finalized.sourceEvidenceRefs().size());
        Outcome<LedgerEntry> appended = ledger.append(new EvidenceEvent(
                tenantId, actorId, interviewId, LEDGER_EVENT_TYPE, occurredAtIso,
                tenantId.value() + ":" + interviewId.value() + ":review:" + caseKey,
                contentHash,
                // standart §4: yalnız POINTER/meta — gerekçe/karar GÖVDESİ ledger'a girmez
                JsonValue.object(Map.of(
                        "case_key", JsonValue.of(caseKey),
                        "decision_outcome_ref", JsonValue.of(decisionOutcomeRef),
                        "rationale_ref", JsonValue.of(finalized.humanAuthoredRationaleRef()),
                        "ai_output_version_ref", JsonValue.of(finalized.aiOutputVersionRef()),
                        "oversight_role_ref", JsonValue.of(finalized.oversightRoleRef()),
                        "evidence_ref_count", JsonValue.of((double) finalized.sourceEvidenceRefs().size())))));
        if (!(appended instanceof Outcome.Ok<LedgerEntry> entryOk)) {
            Outcome<Void> rolledBack = store.save(tenantId, caseKey, current);
            if (rolledBack.isOk()) {
                emitAppendFailed(tenantId, "ledger_unavailable");
                return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "ledger append başarısız (finalize geri alındı)");
            }
            emitAppendFailed(tenantId, "ledger_unavailable_rollback_failed");
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED,
                    "ledger append başarısız VE telafi geri-dönüşü başarısız — vaka tutarsız kalmış olabilir (operasyonel müdahale gerekir)");
        }

        LedgerEntry entry = entryOk.value();
        emit(tenantId, FINALIZED_EVENT, "evidence", "notice", PiiClass.ID_ONLY,
                Map.of("actor_ref", actorId.value(), "ledger_entry_ref", entry.evidenceId().value()));
        return Outcome.ok(new FinalizeReceipt(caseKey, entry.evidenceId().value()));
    }

    /**
     * EXPORTED = SİSTEM geçişi (insan-adımı değil): export akışının aktörü
     * ExportService'in kendi WORM kaydında; insan-accountability zinciri
     * (requireSameActor) FINALIZED'a kadar geçerlidir — burada uygulanmaz.
     */
    public Outcome<Void> markExported(TenantId tenantId, InterviewId interviewId, String caseKey,
            String exportArtifactRef) {
        if (isBlank(exportArtifactRef)) {
            return Outcome.fail(OutcomeCode.INVALID, "export_artifact_ref zorunlu (EXPORTED required-on-entry)");
        }
        Outcome<ReviewCase> found = store.find(tenantId, interviewId, caseKey);
        if (!(found instanceof Outcome.Ok<ReviewCase> ok)) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "vaka yok (tenant-scope)");
        }
        ReviewCase current = ok.value();
        if (current.state() != ReviewState.FINALIZED) {
            return Outcome.fail(OutcomeCode.INVALID, "geçersiz geçiş: " + current.state() + " → EXPORTED");
        }
        return store.save(tenantId, caseKey, current.withExportArtifact(exportArtifactRef).with(ReviewState.EXPORTED));
    }

    /** Rıza-geri-çekme/erasure — terminal olmayan HER state'ten; terminal'den ÇIKIŞSIZ (standart §2). */
    public Outcome<Void> withdraw(TenantId tenantId, InterviewId interviewId, String caseKey, String reasonCode) {
        if (isBlank(reasonCode)) {
            return Outcome.fail(OutcomeCode.INVALID, "reason_code zorunlu (WITHDRAWN required-on-entry)");
        }
        Outcome<ReviewCase> found = store.find(tenantId, interviewId, caseKey);
        if (!(found instanceof Outcome.Ok<ReviewCase> ok)) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "vaka yok (tenant-scope)");
        }
        ReviewCase current = ok.value();
        if (current.state().terminal()) {
            return Outcome.fail(OutcomeCode.INVALID, "terminal state çıkışsız: " + current.state());
        }
        return store.save(tenantId, caseKey, current.withReason(reasonCode).with(ReviewState.WITHDRAWN));
    }

    private Outcome<Void> transition(TenantId tenantId, ActorId actor, InterviewId interviewId, String caseKey,
            ReviewState expectedFrom, ReviewState to, java.util.function.UnaryOperator<ReviewCase> update) {
        Outcome<ReviewCase> found = store.find(tenantId, interviewId, caseKey);
        if (!(found instanceof Outcome.Ok<ReviewCase> ok)) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "vaka yok (tenant-scope)");
        }
        ReviewCase current = ok.value();
        Outcome<Void> actorOk = requireSameActor(current, actor);
        if (actorOk instanceof Outcome.Fail<Void> mismatch) {
            return mismatch;
        }
        if (current.state() != expectedFrom || !ALLOWED.get(expectedFrom).contains(to)) {
            return Outcome.fail(OutcomeCode.INVALID, "geçersiz geçiş: " + current.state() + " → " + to);
        }
        return store.save(tenantId, caseKey, update.apply(current).with(to));
    }

    /**
     * Aktör-accountability (Codex #65 blocker): START'ta atanan humanActorRef ile
     * sonraki her insan-adımının çağıranı AYNI olmalı — "kim inceledi/gerekçeledi/
     * finalize etti" kaydı tek kişiye bağlanır. Ekip-devri (handoff) ayrı explicit
     * geçiş olarak tasarlanmadan başka aktör fail-closed reddedilir.
     */
    private static Outcome<Void> requireSameActor(ReviewCase current, ActorId actor) {
        if (actor == null || isBlank(actor.value())) {
            return Outcome.fail(OutcomeCode.INVALID, "actor zorunlu");
        }
        if (!isBlank(current.humanActorRef()) && !current.humanActorRef().equals(actor.value())) {
            return Outcome.fail(OutcomeCode.DENIED,
                    "vaka başka reviewer'a atanmış (human_actor_ref eşleşmiyor; handoff ayrı geçiş)");
        }
        return Outcome.ok(null);
    }

    private void emitAppendFailed(TenantId tenantId, String reasonCode) {
        emit(tenantId, APPEND_FAILED_EVENT, "evidence", "error", PiiClass.ID_ONLY, Map.of("reason_code", reasonCode));
    }

    private void emit(TenantId tenantId, String eventTypeId, String category, String severity,
            PiiClass pii, Map<String, String> extras) {
        OperationalEvent.create(tenantId, eventTypeId, category, severity, pii, extras)
                .asOptional()
                .ifPresent(sink::emit);
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    private static String sha256Hex(String text) {
        try {
            return HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 mevcut olmalı", e);
        }
    }
}
