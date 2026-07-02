package com.ats.export;

import com.ats.contracts.AIProvider.Entailment;
import com.ats.contracts.EvidenceLedger;
import com.ats.contracts.EvidenceLedger.EvidenceEvent;
import com.ats.contracts.EvidenceLedger.LedgerEntry;
import com.ats.export.ExportContext.CriterionRef;
import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.JsonValue;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import com.ats.ops.OperationalEvent;
import com.ats.ops.OperationalEventSink;
import com.ats.ops.PiiClass;
import com.ats.orchestration.Citation;
import com.ats.orchestration.CitationStore;
import com.ats.review.HumanReviewService;
import com.ats.review.ReviewCase;
import com.ats.review.ReviewCaseStore;
import com.ats.review.ReviewState;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * PRD-P1 F7 evidence-packet export orkestrasyonu (ATS-0016 slice-5, port-only) —
 * contracts/samples/evidence-packet.sample.json şekil-mirror'ı:
 * - YALNIZ FINALIZED vaka export edilir (human-oversight §2: FINALIZED→EXPORTED idari geçiş);
 *   EXPORTED terminal olduğundan çift-export yapısal reddedilir.
 * - Packet POINTER-only: claim METNİ, transkript metni, skor/affect ASLA girmez —
 *   yasak-anahtar taraması + citation-claim-metni LEAK-SCAN'i fail-closed (ATS-0004/0012).
 * - Kriter bağlama: her claim'in criterion_id'si rubric kriter setinde olmalı (iş-ilişkililik
 *   zinciri; rubric-standard) — bağlanamayan claim export'u düşürür.
 * - SUPPORTED claim'in kaynak-ref'siz export'u reddedilir (savunma re-check'i).
 * - human_reviewed=true, vaka FINALIZED gate'inden türetilir (per-claim inceleme granülü
 *   P1-UI residual — dürüst sınır).
 * - Sıra: packet → artifact → WORM append (fail→artifact rollback) → EXPORTED geçişi
 *   (terminal geçişi ledger'dan SONRA; terminal geri alınamaz olduğundan önce yapılamaz;
 *   geçiş-fail = operasyonel müdahale sinyali, yutulmaz) → security.audit_export.generated.
 * - PDF/secure-link/e-posta/webhook dağıtımı P1-UI residual; bu slice kanonik JSON artifact üretir.
 */
public final class ExportService {

    static final String EXPORT_GENERATED_EVENT = "security.audit_export.generated";
    static final String APPEND_FAILED_EVENT = "evidence.append.failed";
    static final String LEDGER_EVENT_TYPE = "evidence_packet.exported";
    static final String SCHEMA_VERSION = "evidence-packet/v1";
    static final String UNSUPPORTED_CLAIM_POLICY = "flag-and-exclude-from-decision";

    /**
     * Schema $defs.ref pattern'ının Java mirror'ı (Codex slice-5 blocker-1): packet'e giren HER ref
     * buna uymak zorunda — slash'lı internal store anahtarı packet'e SIZAMAZ (refSafe ile '.'-map'lenir
     * + fail-closed doğrulanır). Ledger payload'ındaki raw case_key packet DEĞİLDİR; schema kapsamı dışı.
     */
    static final java.util.regex.Pattern REF_PATTERN = java.util.regex.Pattern.compile("[A-Za-z][A-Za-z0-9._:-]*");

    static String refSafe(String internalKey) {
        return internalKey == null ? null : internalKey.replace('/', '.');
    }

    public record ExportReceipt(String artifactKey, String evidenceId, String packetDigest, int claimCount) {}

    private final ReviewCaseStore reviewStore;
    private final CitationStore citationStore;
    private final ExportArtifactStore artifactStore;
    private final HumanReviewService humanReview;
    private final EvidenceLedger ledger;
    private final OperationalEventSink sink;

    public ExportService(ReviewCaseStore reviewStore, CitationStore citationStore,
            ExportArtifactStore artifactStore, HumanReviewService humanReview,
            EvidenceLedger ledger, OperationalEventSink sink) {
        this.reviewStore = reviewStore;
        this.citationStore = citationStore;
        this.artifactStore = artifactStore;
        this.humanReview = humanReview;
        this.ledger = ledger;
        this.sink = sink;
    }

    public Outcome<ExportReceipt> exportPacket(TenantId tenantId, ActorId actorId, InterviewId interviewId,
            String caseKey, List<String> citationKeys, ExportContext ctx, String occurredAtIso) {
        Outcome<Void> ctxValid = validateContext(ctx);
        if (ctxValid instanceof Outcome.Fail<Void> bad) {
            return Outcome.fail(bad.code(), bad.reason());
        }
        if (citationKeys == null || citationKeys.isEmpty()) {
            return Outcome.fail(OutcomeCode.INVALID, "en az bir citation gerekli (kanıtsız packet üretilmez)");
        }

        Outcome<ReviewCase> found = reviewStore.find(tenantId, interviewId, caseKey);
        if (!(found instanceof Outcome.Ok<ReviewCase> caseOk)) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "vaka yok (tenant-scope)");
        }
        ReviewCase reviewCase = caseOk.value();
        if (reviewCase.state() != ReviewState.FINALIZED) {
            return Outcome.fail(OutcomeCode.INVALID,
                    "yalnız FINALIZED vaka export edilir (EXPORTED terminal → çift-export da burada düşer): " + reviewCase.state());
        }

        Set<String> criterionIds = new LinkedHashSet<>();
        for (CriterionRef c : ctx.criteria()) {
            criterionIds.add(c.criterionId());
        }

        List<JsonValue> claims = new ArrayList<>();
        List<String> claimTexts = new ArrayList<>();
        Map<String, Citation> citationByClaimId = new HashMap<>();
        for (String citationKey : citationKeys) {
            Outcome<Citation> cited = citationStore.find(tenantId, interviewId, citationKey);
            if (!(cited instanceof Outcome.Ok<Citation> citOk)) {
                return Outcome.fail(OutcomeCode.NOT_FOUND, "citation yok (tenant-scope): " + citationKey);
            }
            Citation citation = citOk.value();
            String criterionId = ctx.citationCriterion().get(citationKey);
            if (criterionId == null || !criterionIds.contains(criterionId)) {
                return Outcome.fail(OutcomeCode.INVALID,
                        "claim rubric kriterine bağlanamadı (iş-ilişkililik zinciri kopuk): " + citationKey);
            }
            if (citation.entailment() == Entailment.SUPPORTED && citation.segmentIndexes().isEmpty()) {
                return Outcome.fail(OutcomeCode.INVALID, "kaynaksız SUPPORTED export edilemez: " + citationKey);
            }
            String claimId = refSafe(citationKey);
            List<JsonValue> segRefs = new ArrayList<>();
            for (Integer idx : citation.segmentIndexes()) {
                segRefs.add(JsonValue.of("seg-" + idx));
            }
            claims.add(JsonValue.object(Map.of(
                    "claim_id", JsonValue.of(claimId),
                    // statement_ref = silinebilir-düzlem pointer'ı (claim METNİ packet'e GİRMEZ)
                    "statement_ref", JsonValue.of(claimId),
                    "criterion_id", JsonValue.of(criterionId),
                    "source_segment_refs", new JsonValue.JsonArray(segRefs),
                    "entailment", JsonValue.of(citation.entailment().name().toLowerCase(Locale.ROOT)),
                    "human_reviewed", JsonValue.of(true))));
            claimTexts.add(citation.claim());
            citationByClaimId.put(claimId, citation);
        }

        // Codex slice-5 blocker-2 (manifest cross-invariant): human_decision.source_evidence_refs
        // YALNIZ export edilen claims'e işaret edebilir ve unsupported claim karar-kanıtı OLAMAZ.
        List<String> decisionEvidenceRefs = new ArrayList<>();
        for (String raw : reviewCase.sourceEvidenceRefs()) {
            String safe = refSafe(raw);
            Citation grounding = citationByClaimId.get(safe);
            if (grounding == null) {
                return Outcome.fail(OutcomeCode.INVALID,
                        "karar-kanıtı claims dışı (source_evidence_refs ⊆ claims ihlali): " + raw);
            }
            if (grounding.entailment() == Entailment.NOT_SUPPORTED) {
                return Outcome.fail(OutcomeCode.INVALID,
                        "unsupported claim karar-kanıtı olamaz (" + UNSUPPORTED_CLAIM_POLICY + "): " + raw);
            }
            decisionEvidenceRefs.add(safe);
        }

        // schema $defs.ref pattern fail-closed doğrulama — packet'e giren tüm ref'ler
        Map<String, String> refFields = new HashMap<>();
        refFields.put("packet_id", "pkt-" + refSafe(caseKey));
        refFields.put("export_event_ref", tenantId.value() + ":" + interviewId.value() + ":export:" + refSafe(caseKey));
        refFields.put("generator_version_ref", ctx.generatorVersionRef());
        refFields.put("ai_assistance_disclosure_ref", ctx.aiAssistanceDisclosureRef());
        refFields.put("rubric_version_ref", ctx.rubricVersionRef());
        refFields.put("redaction_policy_ref", ctx.redactionPolicyRef());
        refFields.put("redaction_run_ref", ctx.redactionRunRef());
        refFields.put("retention_policy_ref", ctx.retentionPolicyRef());
        refFields.put("signature_ref", ctx.signatureRef());
        refFields.put("model_version_ref", reviewCase.aiOutputVersionRef());
        refFields.put("human_actor_ref", reviewCase.humanActorRef());
        refFields.put("oversight_role_ref", reviewCase.oversightRoleRef());
        refFields.put("human_authored_rationale_ref", reviewCase.humanAuthoredRationaleRef());
        refFields.put("decision_outcome_ref", reviewCase.decisionOutcomeRef());
        refFields.put("tenant_ref", tenantId.value());
        refFields.put("interview_ref", interviewId.value());
        for (String c : ctx.consentRefs()) {
            refFields.put("consent_ref:" + c, c);
        }
        for (String w : ctx.wormChainRefs()) {
            refFields.put("worm_chain_ref:" + w, w);
        }
        for (CriterionRef c : ctx.criteria()) {
            refFields.put("criterion_id:" + c.criterionId(), c.criterionId());
            refFields.put("job_relatedness_rationale_ref:" + c.criterionId(), c.jobRelatednessRationaleRef());
        }
        for (String claimId : citationByClaimId.keySet()) {
            refFields.put("claim_id:" + claimId, claimId);
        }
        for (Map.Entry<String, String> e : refFields.entrySet()) {
            if (e.getValue() == null || !REF_PATTERN.matcher(e.getValue()).matches()) {
                return Outcome.fail(OutcomeCode.INVALID,
                        "schema ref-pattern ihlali (packet'e slash'lı/geçersiz ref giremez): " + e.getKey());
            }
        }

        JsonValue.JsonObject packetBody = buildPacket(tenantId, interviewId, caseKey, reviewCase,
                claims, decisionEvidenceRefs, ctx, occurredAtIso);
        String forbidden = PacketJson.forbiddenKey(packetBody);
        if (forbidden != null) {
            return Outcome.fail(OutcomeCode.INVALID, "packet yasak-anahtar taşıyor (fail-closed): " + forbidden);
        }
        String bodyJson = PacketJson.canonical(packetBody);
        for (String claimText : claimTexts) {
            if (claimText != null && !claimText.isBlank() && bodyJson.contains(claimText)) {
                return Outcome.fail(OutcomeCode.INVALID, "LEAK: claim metni packet'e sızdı (fail-closed)");
            }
        }
        String packetDigest = sha256Hex(bodyJson);
        JsonValue.JsonObject packet = withIntegrity(packetBody, ctx, packetDigest);
        String packetJson = PacketJson.canonical(packet);

        Outcome<String> storedArtifact = artifactStore.put(tenantId, interviewId, packetJson);
        if (!(storedArtifact instanceof Outcome.Ok<String> artifactOk)) {
            return Outcome.fail(OutcomeCode.INVALID, "artifact deposuna yazılamadı");
        }
        String artifactKey = artifactOk.value();

        Outcome<LedgerEntry> appended = ledger.append(new EvidenceEvent(
                tenantId, actorId, interviewId, LEDGER_EVENT_TYPE, occurredAtIso,
                tenantId.value() + ":" + interviewId.value() + ":export:" + caseKey,
                packetDigest,
                JsonValue.object(Map.of(
                        "export_artifact_ref", JsonValue.of(artifactKey),
                        "case_key", JsonValue.of(caseKey),
                        "packet_digest", JsonValue.of(packetDigest),
                        "claim_count", JsonValue.of((double) claims.size())))));
        if (!(appended instanceof Outcome.Ok<LedgerEntry> entryOk)) {
            Outcome<Void> rolledBack = artifactStore.delete(tenantId, artifactKey);
            if (rolledBack.isOk()) {
                emit(tenantId, APPEND_FAILED_EVENT, "evidence", "error", PiiClass.ID_ONLY,
                        Map.of("reason_code", "ledger_unavailable"));
                return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "ledger append başarısız (artifact geri alındı)");
            }
            emit(tenantId, APPEND_FAILED_EVENT, "evidence", "error", PiiClass.ID_ONLY,
                    Map.of("reason_code", "ledger_unavailable_rollback_failed"));
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED,
                    "ledger append başarısız VE artifact telafi silmesi başarısız (operasyonel müdahale gerekir)");
        }

        Outcome<Void> transitioned = humanReview.markExported(tenantId, interviewId, caseKey, artifactKey);
        if (!transitioned.isOk()) {
            return Outcome.fail(OutcomeCode.INVALID,
                    "EXPORTED geçişi başarısız (artifact + ledger kaydı MEVCUT — operasyonel müdahale gerekir; yutulmadı)");
        }

        emit(tenantId, EXPORT_GENERATED_EVENT, "security", "notice", PiiClass.ID_ONLY,
                Map.of("actor_ref", actorId.value()));
        return Outcome.ok(new ExportReceipt(artifactKey, entryOk.value().evidenceId().value(), packetDigest, claims.size()));
    }

    private JsonValue.JsonObject buildPacket(TenantId tenantId, InterviewId interviewId, String caseKey,
            ReviewCase reviewCase, List<JsonValue> claims, List<String> decisionEvidenceRefs,
            ExportContext ctx, String occurredAtIso) {
        List<JsonValue> consentRefs = ctx.consentRefs().stream().map(JsonValue::of).toList();
        List<JsonValue> interviewRefs = List.of(JsonValue.of(interviewId.value()));
        List<JsonValue> wormRefs = ctx.wormChainRefs().stream().map(JsonValue::of).toList();
        List<JsonValue> criteria = new ArrayList<>();
        for (CriterionRef c : ctx.criteria()) {
            criteria.add(JsonValue.object(Map.of(
                    "criterion_id", JsonValue.of(c.criterionId()),
                    "job_relatedness_rationale_ref", JsonValue.of(c.jobRelatednessRationaleRef()))));
        }
        // blocker-2 fix: karar-kanıtı ref'leri claims'e karşı DOĞRULANMIŞ safe-ref seti
        List<JsonValue> evidenceRefs = decisionEvidenceRefs.stream().map(JsonValue::of).toList();

        Map<String, JsonValue> m = new HashMap<>();
        m.put("schema_version", JsonValue.of(SCHEMA_VERSION));
        m.put("packet_id", JsonValue.of("pkt-" + refSafe(caseKey)));
        m.put("generated_at", JsonValue.of(occurredAtIso));
        m.put("generator_version_ref", JsonValue.of(ctx.generatorVersionRef()));
        m.put("locale", JsonValue.of(ctx.locale()));
        m.put("timezone", JsonValue.of(ctx.timezone()));
        m.put("tenant_ref", JsonValue.of(tenantId.value()));
        m.put("ai_assistance_disclosure_ref", JsonValue.of(ctx.aiAssistanceDisclosureRef()));
        m.put("interview_refs", new JsonValue.JsonArray(interviewRefs));
        m.put("consent_refs", new JsonValue.JsonArray(consentRefs));
        m.put("rubric", JsonValue.object(Map.of(
                "rubric_version_ref", JsonValue.of(ctx.rubricVersionRef()),
                "criteria", new JsonValue.JsonArray(criteria))));
        m.put("claims", new JsonValue.JsonArray(claims));
        m.put("unsupported_claim_policy", JsonValue.of(UNSUPPORTED_CLAIM_POLICY));
        m.put("human_decision", JsonValue.object(Map.of(
                "human_actor_ref", JsonValue.of(reviewCase.humanActorRef()),
                "oversight_role_ref", JsonValue.of(reviewCase.oversightRoleRef()),
                "human_authored_rationale_ref", JsonValue.of(reviewCase.humanAuthoredRationaleRef()),
                "source_evidence_refs", new JsonValue.JsonArray(evidenceRefs),
                "ai_output_version_ref", JsonValue.of(reviewCase.aiOutputVersionRef()),
                "decision_outcome_ref", JsonValue.of(reviewCase.decisionOutcomeRef()))));
        m.put("model_version_ref", JsonValue.of(reviewCase.aiOutputVersionRef()));
        m.put("worm_chain_refs", new JsonValue.JsonArray(wormRefs));
        m.put("redaction", JsonValue.object(Map.of(
                "applied", JsonValue.of(true),
                "redaction_policy_ref", JsonValue.of(ctx.redactionPolicyRef()),
                "redaction_run_ref", JsonValue.of(ctx.redactionRunRef()))));
        m.put("excluded_raw_content", JsonValue.of(true));
        m.put("retention_policy_ref", JsonValue.of(ctx.retentionPolicyRef()));
        m.put("export_event_ref", JsonValue.of(tenantId.value() + ":" + interviewId.value() + ":export:" + refSafe(caseKey)));
        return JsonValue.object(m);
    }

    private static JsonValue.JsonObject withIntegrity(JsonValue.JsonObject body, ExportContext ctx, String packetDigest) {
        Map<String, JsonValue> m = new HashMap<>(body.values());
        m.put("integrity", JsonValue.object(Map.of(
                "digest_algorithm", JsonValue.of("sha256"),
                "schema_digest", JsonValue.of(ctx.schemaDigest()),
                "packet_digest", JsonValue.of(packetDigest),
                "signature_ref", JsonValue.of(ctx.signatureRef()))));
        return JsonValue.object(m);
    }

    private static Outcome<Void> validateContext(ExportContext ctx) {
        if (ctx == null) {
            return Outcome.fail(OutcomeCode.INVALID, "ExportContext zorunlu");
        }
        if (isBlank(ctx.generatorVersionRef()) || isBlank(ctx.locale()) || isBlank(ctx.timezone())
                || isBlank(ctx.aiAssistanceDisclosureRef()) || isBlank(ctx.rubricVersionRef())
                || isBlank(ctx.redactionPolicyRef()) || isBlank(ctx.redactionRunRef())
                || isBlank(ctx.retentionPolicyRef()) || isBlank(ctx.signatureRef())) {
            return Outcome.fail(OutcomeCode.INVALID, "ExportContext ref alanları boş olamaz (pointer-only sözleşme)");
        }
        if (ctx.consentRefs().isEmpty() || ctx.consentRefs().stream().anyMatch(ExportService::isBlank)) {
            return Outcome.fail(OutcomeCode.INVALID, "consent_refs zorunlu (rıza-pointer'sız packet üretilmez)");
        }
        if (ctx.criteria().isEmpty() || ctx.criteria().stream()
                .anyMatch(c -> isBlank(c.criterionId()) || isBlank(c.jobRelatednessRationaleRef()))) {
            return Outcome.fail(OutcomeCode.INVALID, "rubric kriterleri + job-relatedness ref zorunlu");
        }
        if (ctx.wormChainRefs().isEmpty() || ctx.wormChainRefs().stream().anyMatch(ExportService::isBlank)) {
            return Outcome.fail(OutcomeCode.INVALID, "worm_chain_refs zorunlu (denetim zinciri pointer'ı)");
        }
        if (ctx.schemaDigest() == null || !ctx.schemaDigest().matches("[0-9a-f]{64}")) {
            return Outcome.fail(OutcomeCode.INVALID, "schema_digest 64-hex olmalı");
        }
        return Outcome.ok(null);
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
