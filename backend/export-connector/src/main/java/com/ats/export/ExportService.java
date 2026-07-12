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
    static final String RECEIPT_RECOVERED_EVENT = "security.audit_export.receipt_recovered";
    static final String ARTIFACT_READ_EVENT = "security.audit_export.artifact_read";
    static final String REPLAYED_EVENT = "security.audit_export.replayed";
    static final String R4_REPAIRED_EVENT = "security.audit_export.r4_repaired";
    /**
     * 39d-11 WORM İŞ-KANITI event'i (ops-taxonomy'ye GİRMEZ — ayrı düzlem):
     * "repair NİYETİ kalıcı kaydedildi" der; repair'in TAMAMLANDIĞINI TEK BAŞINA
     * KANITLAMAZ (tamamlanma = intent-satırı + case EXPORTED + ref-eşleşmesi).
     */
    static final String REPAIR_INTENT_EVENT = "export.transition_repair_intent";
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

    /**
     * Schema entailment enum eşlemesi (Codex iter-2 blocker): supported | unsupported.
     * INSUFFICIENT schema'da YOK ve denetim paketine belirsiz iddia GİRMEZ (fail-closed reject;
     * partially_supported'a otomatik map semantik olarak yanlış olurdu) — çağıran ya claim'i
     * çözer (yeniden değerlendirme) ya export setinden çıkarır.
     */
    static String schemaEntailment(Entailment e) {
        return switch (e) {
            case SUPPORTED -> "supported";
            case NOT_SUPPORTED -> "unsupported";
            case INSUFFICIENT -> null;
        };
    }

    public record ExportReceipt(String artifactKey, String evidenceId, String packetDigest, int claimCount) {}

    /** 39d-10: POST cevabı artık disposition taşır — CREATED=201, REPLAYED=200 (X-ATS-Replay). */
    public enum ExportDisposition { CREATED, REPLAYED }

    public record ExportPacketResult(ExportReceipt receipt, ExportDisposition disposition) {}

    /**
     * 39d-10 request-fingerprint (Codex blocker-1): replay YALNIZ "aynı istek"
     * için — caseKey eşleşmesi yetmez. Versioned canonical temsil; occurredAt
     * ve actor fingerprint'e GİRMEZ (meşru retry zamanı yeniden damgalar;
     * başka yetkili operatör aynı talebin sonucunu replay alabilir — kendi
     * actor'ıyla audit edilir). citationKeys SIRASI packet claim-sırasını
     * belirlediği için semantiktir — sıra korunur. Ledger'a ham gövde değil
     * yalnız digest yazılır (pointer-only disiplin).
     */
    /**
     * 39d-11 (Codex blocker): intent-key ACTOR-BAĞLIDIR — farklı yetkili operatör
     * devralırken ilk operatörün yarım girişimi idempotency-conflict kilidi
     * YARATMAZ (aynı actor retry'ı ise birebir idempotent replay olur). Raw actor
     * ref key'e girmez (':'/'/' tuple-collision riski) — sha256 digest'i girer.
     */
    static String exportRepairIntentKey(TenantId tenantId, InterviewId interviewId,
            String caseKey, ActorId actorId) {
        return tenantId.value() + ":" + interviewId.value() + ":export-repair-intent:" + caseKey
                + ":" + sha256Hex(actorId.value());
    }

    static String exportRequestDigest(TenantId tenantId, InterviewId interviewId, String caseKey,
            List<String> citationKeys, ExportContext ctx) {
        Map<String, JsonValue> m = new HashMap<>();
        m.put("schema", JsonValue.of("export-request/v1"));
        m.put("tenant", JsonValue.of(tenantId.value()));
        m.put("interview", JsonValue.of(interviewId.value()));
        m.put("case_key", JsonValue.of(caseKey));
        m.put("citation_keys", new JsonValue.JsonArray(citationKeys.stream()
                .map(k -> (JsonValue) JsonValue.of(k)).toList()));
        m.put("generator_version_ref", JsonValue.of(ctx.generatorVersionRef()));
        m.put("locale", JsonValue.of(ctx.locale()));
        m.put("timezone", JsonValue.of(ctx.timezone()));
        m.put("ai_assistance_disclosure_ref", JsonValue.of(ctx.aiAssistanceDisclosureRef()));
        m.put("consent_refs", new JsonValue.JsonArray(ctx.consentRefs().stream()
                .map(k -> (JsonValue) JsonValue.of(k)).toList()));
        m.put("rubric_version_ref", JsonValue.of(ctx.rubricVersionRef()));
        m.put("criteria", new JsonValue.JsonArray(ctx.criteria().stream()
                .map(c -> (JsonValue) JsonValue.object(Map.of(
                        "criterion_id", JsonValue.of(c.criterionId()),
                        "job_relatedness_rationale_ref", JsonValue.of(c.jobRelatednessRationaleRef()))))
                .toList()));
        Map<String, JsonValue> mapping = new HashMap<>();
        for (Map.Entry<String, String> e : ctx.citationCriterion().entrySet()) {
            mapping.put(e.getKey(), JsonValue.of(e.getValue()));
        }
        m.put("citation_criterion", JsonValue.object(mapping));
        m.put("worm_chain_refs", new JsonValue.JsonArray(ctx.wormChainRefs().stream()
                .map(k -> (JsonValue) JsonValue.of(k)).toList()));
        m.put("redaction_policy_ref", JsonValue.of(ctx.redactionPolicyRef()));
        m.put("redaction_run_ref", JsonValue.of(ctx.redactionRunRef()));
        m.put("retention_policy_ref", JsonValue.of(ctx.retentionPolicyRef()));
        m.put("schema_digest", JsonValue.of(ctx.schemaDigest()));
        m.put("signature_ref", JsonValue.of(ctx.signatureRef()));
        return sha256Hex(PacketJson.canonical(JsonValue.object(m)));
    }

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

    public Outcome<ExportPacketResult> exportPacket(TenantId tenantId, ActorId actorId, InterviewId interviewId,
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

        // 39d-10: ÜRETİMDEN ÖNCE deterministik ledger lookup — mevcut export
        // kaydı varsa hiçbir side-effect'e girmeden reconcile edilir (replay /
        // R4-repair-first / farklı-istek-conflict). R4 retry'ının bugünkü
        // "yeniden üret → 23505 → hata" davranışı da burada kapanır.
        String requestDigest = exportRequestDigest(tenantId, interviewId, caseKey, citationKeys, ctx);
        Outcome<LedgerEntry> prior = ledger.findByIdempotencyKey(tenantId,
                exportIdempotencyKey(tenantId, interviewId, caseKey));
        if (prior instanceof Outcome.Ok<LedgerEntry>) {
            return reconcileExistingExport(tenantId, actorId, interviewId, caseKey, requestDigest);
        }
        if (prior instanceof Outcome.Fail<LedgerEntry> priorFail
                && priorFail.code() != OutcomeCode.NOT_FOUND) {
            // Ledger okunamıyorsa üretime GİRİLMEZ (kör çift-üretim riski).
            return Outcome.fail(priorFail.code(), "export ön-kontrolü: ledger okunamadı: " + priorFail.reason());
        }

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
            String entailment = schemaEntailment(citation.entailment());
            if (entailment == null) {
                return Outcome.fail(OutcomeCode.INVALID,
                        "INSUFFICIENT claim export edilemez (schema enum dışı; belirsiz iddia denetim paketine girmez): " + citationKey);
            }
            // schema claims[].source_segment_refs minItems:1 — HER exported claim kaynaklı olmalı
            if (citation.segmentIndexes().isEmpty()) {
                return Outcome.fail(OutcomeCode.INVALID, "kaynaksız claim export edilemez (schema minItems 1): " + citationKey);
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
                    "entailment", JsonValue.of(entailment),
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
        // 39d-9: artifact_digest = DEPOLANAN TAM string'in digest'i (packet_digest =
        // integrity-ÖNCESİ body digest'i = ledger contentHash; ikisi FARKLI ve öyle
        // kalmalı). Read-yolu bu bağla parse etmeden kriptografik bütünlük doğrular.
        String artifactDigest = sha256Hex(packetJson);

        Outcome<String> storedArtifact = artifactStore.put(tenantId, interviewId, packetJson);
        if (!(storedArtifact instanceof Outcome.Ok<String> artifactOk)) {
            return Outcome.fail(OutcomeCode.INVALID, "artifact deposuna yazılamadı");
        }
        String artifactKey = artifactOk.value();

        Outcome<LedgerEntry> appended = ledger.append(new EvidenceEvent(
                tenantId, actorId, interviewId, LEDGER_EVENT_TYPE, occurredAtIso,
                exportIdempotencyKey(tenantId, interviewId, caseKey),
                packetDigest,
                JsonValue.object(Map.of(
                        "export_artifact_ref", JsonValue.of(artifactKey),
                        "case_key", JsonValue.of(caseKey),
                        "packet_digest", JsonValue.of(packetDigest),
                        "artifact_digest", JsonValue.of(artifactDigest),
                        "request_digest", JsonValue.of(requestDigest),
                        "claim_count", JsonValue.of((double) claims.size())))));
        if (!(appended instanceof Outcome.Ok<LedgerEntry> entryOk)) {
            Outcome<Void> rolledBack = artifactStore.delete(tenantId, artifactKey);
            if (rolledBack.isOk()) {
                // 39d-10 (Codex blocker-3): kendi artifact'imiz TELAFİ EDİLDİ →
                // append-fail bir UNIQUE yarışı olabilir; deterministik lookup ile
                // kazanan reconcile edilir (replay / in-progress / farklı-istek).
                // Satır YOKSA gerçek ledger arızasıdır — mevcut hata korunur.
                Outcome<LedgerEntry> winner = ledger.findByIdempotencyKey(tenantId,
                        exportIdempotencyKey(tenantId, interviewId, caseKey));
                if (winner instanceof Outcome.Ok<LedgerEntry>) {
                    return reconcileExistingExport(tenantId, actorId, interviewId, caseKey, requestDigest);
                }
                emit(tenantId, APPEND_FAILED_EVENT, "evidence", "error", PiiClass.ID_ONLY,
                        Map.of("reason_code", "ledger_unavailable"));
                return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "ledger append başarısız (artifact geri alındı)");
            }
            // Rollback-fail (R1 öksüz-artifact adayı): kazanan var olsa bile başarı/
            // replay DÖNÜLMEZ — operasyonel müdahale sinyali gizlenmez (Codex şartı).
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
        return Outcome.ok(new ExportPacketResult(
                new ExportReceipt(artifactKey, entryOk.value().evidenceId().value(), packetDigest, claims.size()),
                ExportDisposition.CREATED));
    }

    /**
     * 39d-10: mevcut export ledger kaydının POST'a reconciliation'ı (side-effect'siz).
     * - EXPORTED + request_digest EŞLEŞİR → REPLAYED (makbuz ledger'dan; yeni
     *   artifact/append/markExported YOK).
     * - EXPORTED + digest yok (legacy) → INVALID; makbuz için GET /export/receipt.
     * - EXPORTED + digest FARKLI → INVALID (aynı vaka için farklı istek; eski
     *   makbuz SIZDIRILMAZ — fail-closed conflict).
     * - FINALIZED (R4/in-progress) → UNSUPPORTED_IN_GATE(409): yeni üretim yok;
     *   repair-first (self-heal AYRI dilim — CAS'sız markExported + best-effort
     *   audit ile güvenli değil; Codex 39d-10 blocker-2).
     * - Diğer bütünlük ihlalleri verifyLedgerReceipt'ten aynen taşınır.
     */
    private Outcome<ExportPacketResult> reconcileExistingExport(TenantId tenantId, ActorId actorId,
            InterviewId interviewId, String caseKey, String requestDigest) {
        Outcome<VerifiedExport> verified = verifyLedgerReceipt(tenantId, actorId, interviewId, caseKey);
        if (verified instanceof Outcome.Fail<VerifiedExport> fail) {
            return Outcome.fail(fail.code(), fail.reason());
        }
        VerifiedExport v = ((Outcome.Ok<VerifiedExport>) verified).value();
        if (v.state() == ReviewState.FINALIZED) {
            return Outcome.fail(OutcomeCode.UNSUPPORTED_IN_GATE,
                    "bu vaka için export kaydı var ama EXPORTED geçişi tamamlanmamış (R4/in-progress):"
                            + " yeni üretim yapılmaz; durum için GET /export/receipt (INCOMPLETE),"
                            + " onarım için runbook R4 (repair-first)");
        }
        // verifyLedgerReceipt yalnız EXPORTED/FINALIZED'ı geçirir → burada EXPORTED.
        if (v.requestDigest() == null) {
            return Outcome.fail(OutcomeCode.INVALID,
                    "legacy export kaydı: istek-eşleşmesi doğrulanamaz (request_digest yok) —"
                            + " POST replay yapılmaz; makbuz için GET /export/receipt kullanın");
        }
        if (!v.requestDigest().equals(requestDigest)) {
            return Outcome.fail(OutcomeCode.INVALID,
                    "aynı vaka için FARKLI export isteği: mevcut makbuz replay edilmez"
                            + " (case başına tek export; fail-closed conflict)");
        }
        emit(tenantId, REPLAYED_EVENT, "security", "notice", PiiClass.ID_ONLY,
                Map.of("actor_ref", actorId.value(), "target_ref", v.artifactKey()));
        return Outcome.ok(new ExportPacketResult(
                new ExportReceipt(v.artifactKey(), v.evidenceId(), v.packetDigest(), v.claimCount()),
                ExportDisposition.REPLAYED));
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

    /**
     * 39d-8: export + receipt-recovery AYNI deterministik ledger key'ini kullanır
     * (drift = recovery'nin yanlış/eski key araması). V1 format canlı ledger
     * kayıtlarıyla uyumluluk için SABİT — sessizce değiştirilmez (tuple-safe V2
     * ancak migration/backward-lookup ile).
     */
    static String exportIdempotencyKey(TenantId tenantId, InterviewId interviewId, String caseKey) {
        return tenantId.value() + ":" + interviewId.value() + ":export:" + caseKey;
    }

    /** 39d-8 receipt-recovery cevabı (R2 residual — Codex 019f535a plan şartları). */
    public record ExportReceiptRecovery(String caseKey, String caseState, String transitionStatus,
            String artifactKey, String evidenceId, String packetDigest, int claimCount,
            String ledgerRecordedAt) {}

    /**
     * 39d-8: ledger-bağlı export makbuzunu KURTARIR (salt-okuma; artifact/ledger/
     * case state'ine DOKUNMAZ). caseState=FINALIZED + ledger-satırı = R4 (transition
     * düşmüş; repair runbook'u) — transitionStatus=INCOMPLETE ile AÇIKÇA işaretlenir,
     * tamamlanmış export gibi SUNULMAZ. Tüm ledger-bağları fail-closed çapraz
     * doğrulanır (payload shape yetmez): eventType + tenant + interview +
     * idempotencyKey + payload.case_key + payload.packet_digest==entry.contentHash.
     * Artifact VARLIĞI burada doğrulanmaz (39d-9 artifact-read yolunun işi);
     * endpoint yalnız 'ledger receipt recovered' iddiasındadır.
     */
    public Outcome<ExportReceiptRecovery> exportReceipt(TenantId tenantId, ActorId actorId,
            InterviewId interviewId, String caseKey) {
        Outcome<VerifiedExport> verified = verifyLedgerReceipt(tenantId, actorId, interviewId, caseKey);
        if (verified instanceof Outcome.Fail<VerifiedExport> fail) {
            return Outcome.fail(fail.code(), fail.reason());
        }
        VerifiedExport v = ((Outcome.Ok<VerifiedExport>) verified).value();
        emit(tenantId, RECEIPT_RECOVERED_EVENT, "security", "notice", PiiClass.ID_ONLY,
                Map.of("actor_ref", actorId.value(), "target_ref", caseKey));
        return Outcome.ok(new ExportReceiptRecovery(caseKey, v.state().name(), v.transitionStatus(),
                v.artifactKey(), v.evidenceId(), v.packetDigest(), v.claimCount(), v.ledgerRecordedAt()));
    }

    /**
     * İki-katman doğrulama (Codex 39d-9 plan şartı): base zincir receipt için
     * YETERLİ; artifact_digest OPSİYONEL taşınır — legacy ledger satırı (alan
     * yok) receipt-recovery'yi DÜŞÜRMEZ, yalnız artifact-read yolunda zorunlu
     * kılınır. Base receipt kontratına artifact_digest zorunluluğu eklemek
     * YASAK (canlı satırlarla geriye-uyumluluk kırılır).
     */
    private record VerifiedExport(ReviewState state, String transitionStatus, String artifactKey,
            String evidenceId, String packetDigest, int claimCount, String ledgerRecordedAt,
            String artifactDigest, String requestDigest, String caseArtifactRef) {}

    private Outcome<VerifiedExport> verifyLedgerReceipt(TenantId tenantId, ActorId actorId,
            InterviewId interviewId, String caseKey) {
        if (caseKey == null || caseKey.isBlank()) {
            return Outcome.fail(OutcomeCode.INVALID, "caseKey zorunlu");
        }
        if (actorId == null || isBlank(actorId.value())) {
            return Outcome.fail(OutcomeCode.INVALID, "actor zorunlu (ID-only erişim denetimi)");
        }
        Outcome<ReviewCase> found = reviewStore.find(tenantId, interviewId, caseKey);
        if (!(found instanceof Outcome.Ok<ReviewCase> caseOk)) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "vaka bulunamadı (tenant scope)");
        }
        String expectedKey = exportIdempotencyKey(tenantId, interviewId, caseKey);
        Outcome<LedgerEntry> looked = ledger.findByIdempotencyKey(tenantId, expectedKey);
        if (!(looked instanceof Outcome.Ok<LedgerEntry> entryOk)) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "bu vaka için export ledger kaydı bulunamadı");
        }
        LedgerEntry entry = entryOk.value();
        // Çapraz-bağ doğrulamaları — herhangi biri tutmazsa bütünlük hatası (fail-closed):
        if (!LEDGER_EVENT_TYPE.equals(entry.eventType())
                || !entry.tenantId().value().equals(tenantId.value())
                || !entry.interviewId().value().equals(interviewId.value())
                || !expectedKey.equals(entry.idempotencyKey())) {
            return Outcome.fail(OutcomeCode.INVALID,
                    "ledger kaydı export-makbuz bağlarıyla uyuşmuyor (operasyonel inceleme gerekir)");
        }
        if (!(entry.payload() instanceof JsonValue.JsonObject obj)) {
            return Outcome.fail(OutcomeCode.INVALID, "ledger payload'ı nesne değil (operasyonel inceleme gerekir)");
        }
        String payloadCase = payloadString(obj, "case_key");
        String artifactKey = payloadString(obj, "export_artifact_ref");
        String packetDigest = payloadString(obj, "packet_digest");
        if (payloadCase == null || !payloadCase.equals(caseKey)
                || artifactKey == null || artifactKey.isBlank()
                || packetDigest == null || !packetDigest.matches("[0-9a-f]{64}")
                || !packetDigest.equals(entry.contentHash())) {
            return Outcome.fail(OutcomeCode.INVALID,
                    "ledger payload'ı makbuz şekliyle/bütünlük bağıyla uyuşmuyor (operasyonel inceleme gerekir)");
        }
        JsonValue rawCount = obj.values().get("claim_count");
        if (!(rawCount instanceof JsonValue.JsonNumber num) || !Double.isFinite(num.value())
                || num.value() < 1 || num.value() > Integer.MAX_VALUE
                || num.value() != Math.rint(num.value())) {
            return Outcome.fail(OutcomeCode.INVALID,
                    "claim_count geçersiz (1..MAX_INT tam sayı olmalı; operasyonel inceleme gerekir)");
        }
        int claimCount = (int) num.value();
        String evidenceId = entry.evidenceId() == null ? null : entry.evidenceId().value();
        if (evidenceId == null || evidenceId.isBlank()) {
            return Outcome.fail(OutcomeCode.INVALID, "ledger evidence_id boş (operasyonel inceleme gerekir)");
        }
        final String recordedAt;
        try {
            recordedAt = java.time.Instant.parse(entry.occurredAt()).toString();
        } catch (RuntimeException ex) {
            return Outcome.fail(OutcomeCode.INVALID, "ledger occurredAt ISO-8601 değil (operasyonel inceleme gerekir)");
        }
        ReviewState state = caseOk.value().state();
        final String transition;
        if (state == ReviewState.EXPORTED) {
            transition = "COMPLETED";
        } else if (state == ReviewState.FINALIZED) {
            transition = "INCOMPLETE"; // R4: artifact+ledger var, markExported düşmüş
        } else {
            // OPEN/IN_REVIEW (+ gelecekteki state'ler) export-ledger'la BİRLİKTE var
            // olamaz — bu sıradan R4 değil state/ledger bütünlük ihlalidir (fail-closed).
            return Outcome.fail(OutcomeCode.INVALID,
                    "export ledger kaydı vaka state'iyle uyuşmuyor (yalnız FINALIZED/EXPORTED; operasyonel inceleme gerekir)");
        }
        // artifact_digest OPSİYONEL: 39d-9 öncesi satırlarda yok (legacy) — base
        // doğrulamayı düşürmez; varsa format burada pin'lenir (bozuksa bütünlük hatası).
        String artifactDigest = payloadString(obj, "artifact_digest");
        if (artifactDigest != null && !artifactDigest.matches("[0-9a-f]{64}")) {
            return Outcome.fail(OutcomeCode.INVALID,
                    "ledger artifact_digest 64-hex değil (operasyonel inceleme gerekir)");
        }
        // request_digest OPSİYONEL (39d-10 öncesi satırlarda yok — legacy); varsa format pin.
        String requestDigest = payloadString(obj, "request_digest");
        if (requestDigest != null && !requestDigest.matches("[0-9a-f]{64}")) {
            return Outcome.fail(OutcomeCode.INVALID,
                    "ledger request_digest 64-hex değil (operasyonel inceleme gerekir)");
        }
        return Outcome.ok(new VerifiedExport(state, transition, artifactKey, evidenceId,
                packetDigest, claimCount, recordedAt, artifactDigest, requestDigest,
                caseOk.value().exportArtifactRef()));
    }

    /** 39d-9 artifact-read cevabı: ledger'dan doğrulanmış key + depolanan TAM packet JSON string'i. */
    public record ExportArtifactContent(String artifactKey, String packetJson) {}

    /**
     * 39d-9: ledger-bağlı export artifact'ini OKUR (content-plane; salt-okuma;
     * hiçbir state'e dokunmaz). Fail-closed sıra:
     * 1) receipt zinciri (vaka + ledger + çapraz-bağlar — verifyLedgerReceipt);
     * 2) yalnız COMPLETED — R4/FINALIZED'de artifact store'da DURSA BİLE verilmez
     *    (önce operasyonel repair + yeniden doğrulama);
     * 3) ledger'da artifact_digest zorunlu — legacy satır (39d-9 öncesi export):
     *    bütünlük doğrulanamaz → INVALID (receipt yolu ETKİLENMEZ);
     * 4) store find — NOT_FOUND = erasure-sonrası meşru content-plane yokluğu;
     *    DİĞER store hataları 404'e EZİLMEZ (kesinti ≠ silinme; erasure-kanıtı
     *    yanlış-pozitifi üretilmez), Outcome code'u aynen taşınır;
     * 5) sha256(depolanan TAM string) == ledger.artifact_digest — uyuşmazsa
     *    içerik cevaba HİÇ çıkmaz.
     * Başarı audit sinyali (artifact_read, target_ref=artifactKey) best-effort
     * operasyonel sinyaldir — "audit kaydı olmadan content-egress olmaz"
     * garantisi DEĞİLDİR (sink fail-closed değil).
     */
    public Outcome<ExportArtifactContent> exportArtifact(TenantId tenantId, ActorId actorId,
            InterviewId interviewId, String caseKey) {
        Outcome<VerifiedExport> verified = verifyLedgerReceipt(tenantId, actorId, interviewId, caseKey);
        if (verified instanceof Outcome.Fail<VerifiedExport> fail) {
            return Outcome.fail(fail.code(), fail.reason());
        }
        VerifiedExport v = ((Outcome.Ok<VerifiedExport>) verified).value();
        if (!"COMPLETED".equals(v.transitionStatus())) {
            return Outcome.fail(OutcomeCode.INVALID,
                    "export geçişi tamamlanmamış (R4); artifact erişiminden önce operasyonel repair"
                            + " + yeniden doğrulama gerekir");
        }
        if (v.artifactDigest() == null) {
            return Outcome.fail(OutcomeCode.INVALID,
                    "legacy ledger kaydı: artifact_digest yok — artifact bütünlüğü doğrulanamaz"
                            + " (fail-closed; makbuz için receipt endpoint'i kullanılabilir)");
        }
        Outcome<String> found = artifactStore.find(tenantId, interviewId, v.artifactKey());
        if (found instanceof Outcome.Fail<String> storeFail) {
            if (storeFail.code() == OutcomeCode.NOT_FOUND) {
                return Outcome.fail(OutcomeCode.NOT_FOUND,
                        "artifact content-plane'de yok (erasure sonrası beklenen; makbuz receipt endpoint'inde)");
            }
            return Outcome.fail(storeFail.code(),
                    "artifact deposu okunamadı (yokluk DEĞİL — operasyonel hata): " + storeFail.reason());
        }
        String packetJson = ((Outcome.Ok<String>) found).value();
        if (packetJson == null || packetJson.isBlank()) {
            // kontrat-guard: PG adapter NOT NULL + put blank'i reddeder; üçüncü-parti
            // adapter Ok(null/blank) dönerse NPE değil fail-closed (Codex non-blocking).
            return Outcome.fail(OutcomeCode.INVALID,
                    "artifact deposu boş içerik döndürdü (store-kontrat ihlali; operasyonel inceleme gerekir)");
        }
        if (!sha256Hex(packetJson).equals(v.artifactDigest())) {
            return Outcome.fail(OutcomeCode.INVALID,
                    "artifact bütünlük ihlali: depolanan içerik ledger artifact_digest'iyle uyuşmuyor"
                            + " (operasyonel inceleme gerekir)");
        }
        emit(tenantId, ARTIFACT_READ_EVENT, "security", "notice", PiiClass.ID_ONLY,
                Map.of("actor_ref", actorId.value(), "target_ref", v.artifactKey()));
        return Outcome.ok(new ExportArtifactContent(v.artifactKey(), packetJson));
    }

    public enum RepairStatus { REPAIRED, ALREADY_EXPORTED }

    public record ExportRepairResult(ExportReceipt receipt, RepairStatus status) {}

    /**
     * 39d-11 R4 self-heal (Codex plan-şartları): FINALIZED + doğrulanmış export
     * ledger-satırı olan vakada EXPORTED geçişini GÜVENLE tamamlar. Sıra:
     * 1) receipt zinciri (çapraz-bağlar) 2) EXPORTED ise ledger↔case artifact-ref
     * eşleşmesi şartıyla ALREADY (yeni intent/CAS yok) 3) artifact_digest ZORUNLU
     * (legacy → INVALID; intent yazılmaz) 4) artifact mevcut+digest-eşleşik
     * (yokluk NOT_FOUND; store-hatası passthrough; hiçbirinde intent yazılmaz)
     * 5) kalıcı WORM repair-INTENT append — YAZILAMAZSA REPAIR YAPILMAZ
     * ("audit'siz repair olmaz" garantisi ledger-önkoşuldur, best-effort sink
     * değil; intent 'niyet' der, 'tamamlandı' DEMEZ — tamamlanma kanıtı intent +
     * case=EXPORTED + ref-eşleşmesi BİRLİKTE) 6) CAS FINALIZED→EXPORTED
     * (TRANSITIONED→REPAIRED + best-effort r4_repaired sinyali;
     * ALREADY_SAME_ARTIFACT→ALREADY; INTEGRITY_CONFLICT→INVALID; geçici
     * store-hatası → intent kalır, retry idempotent).
     */
    public Outcome<ExportRepairResult> repairExportTransition(TenantId tenantId, ActorId actorId,
            InterviewId interviewId, String caseKey, String occurredAtIso) {
        Outcome<VerifiedExport> verified = verifyLedgerReceipt(tenantId, actorId, interviewId, caseKey);
        if (verified instanceof Outcome.Fail<VerifiedExport> fail) {
            return Outcome.fail(fail.code(), fail.reason());
        }
        VerifiedExport v = ((Outcome.Ok<VerifiedExport>) verified).value();
        ExportReceipt receipt = new ExportReceipt(v.artifactKey(), v.evidenceId(),
                v.packetDigest(), v.claimCount());
        if (v.state() == ReviewState.EXPORTED) {
            // already-repaired iddiası için case↔ledger ref bağı ŞART (Codex):
            if (v.caseArtifactRef() == null || !v.caseArtifactRef().equals(v.artifactKey())) {
                return Outcome.fail(OutcomeCode.INVALID,
                        "vaka EXPORTED ama artifact ref'i ledger'la uyuşmuyor (bütünlük ihlali;"
                                + " operasyonel inceleme gerekir)");
            }
            return Outcome.ok(new ExportRepairResult(receipt, RepairStatus.ALREADY_EXPORTED));
        }
        // verifyLedgerReceipt whitelist'i gereği burada FINALIZED (R4).
        if (v.artifactDigest() == null) {
            return Outcome.fail(OutcomeCode.INVALID,
                    "legacy ledger kaydı: artifact_digest yok — otomatik repair yapılamaz"
                            + " (backend müdahalesine eskale edin)");
        }
        Outcome<String> found = artifactStore.find(tenantId, interviewId, v.artifactKey());
        if (found instanceof Outcome.Fail<String> storeFail) {
            if (storeFail.code() == OutcomeCode.NOT_FOUND) {
                return Outcome.fail(OutcomeCode.NOT_FOUND,
                        "repair için gerekli artifact content-plane'de yok");
            }
            return Outcome.fail(storeFail.code(),
                    "artifact deposu okunamadı (repair yapılmadı): " + storeFail.reason());
        }
        String packetJson = ((Outcome.Ok<String>) found).value();
        if (packetJson == null || packetJson.isBlank()
                || !sha256Hex(packetJson).equals(v.artifactDigest())) {
            return Outcome.fail(OutcomeCode.INVALID,
                    "artifact bütünlük doğrulaması geçmedi — repair yapılmadı (operasyonel inceleme)");
        }
        Outcome<LedgerEntry> intent = ledger.append(new EvidenceEvent(
                tenantId, actorId, interviewId, REPAIR_INTENT_EVENT, occurredAtIso,
                exportRepairIntentKey(tenantId, interviewId, caseKey, actorId),
                v.packetDigest(),
                JsonValue.object(Map.of(
                        "case_key", JsonValue.of(caseKey),
                        "export_artifact_ref", JsonValue.of(v.artifactKey()),
                        "repair_actor_ref", JsonValue.of(actorId.value()),
                        "original_export_evidence_id", JsonValue.of(v.evidenceId()),
                        "packet_digest", JsonValue.of(v.packetDigest()),
                        "artifact_digest", JsonValue.of(v.artifactDigest())))));
        if (intent instanceof Outcome.Fail<LedgerEntry> intentFail) {
            return Outcome.fail(intentFail.code(),
                    "repair-intent WORM'a yazılamadı — repair YAPILMADI (audit'siz repair olmaz): "
                            + intentFail.reason());
        }
        Outcome<ReviewCaseStore.ExportTransitionResult> cas =
                humanReview.repairMarkExported(tenantId, interviewId, caseKey, v.artifactKey());
        if (cas instanceof Outcome.Fail<ReviewCaseStore.ExportTransitionResult> casFail) {
            // intent kalır (niyet-kaydı); geçici store hatasında retry idempotent.
            return Outcome.fail(casFail.code(),
                    "repair-geçişi tamamlanamadı (intent kayıtlı; yeniden denenebilir): " + casFail.reason());
        }
        ReviewCaseStore.ExportTransitionResult r =
                ((Outcome.Ok<ReviewCaseStore.ExportTransitionResult>) cas).value();
        return switch (r) {
            case TRANSITIONED -> {
                emit(tenantId, R4_REPAIRED_EVENT, "security", "notice", PiiClass.ID_ONLY,
                        Map.of("actor_ref", actorId.value(), "target_ref", v.artifactKey()));
                yield Outcome.ok(new ExportRepairResult(receipt, RepairStatus.REPAIRED));
            }
            case ALREADY_EXPORTED_SAME_ARTIFACT ->
                Outcome.ok(new ExportRepairResult(receipt, RepairStatus.ALREADY_EXPORTED));
            case INTEGRITY_CONFLICT -> Outcome.fail(OutcomeCode.INVALID,
                    "repair yarışında vaka FARKLI artifact ref'iyle EXPORTED bulundu"
                            + " (bütünlük ihlali; operasyonel inceleme gerekir)");
        };
    }

    private static String payloadString(JsonValue.JsonObject obj, String key) {
        JsonValue v = obj.values().get(key);
        return v instanceof JsonValue.JsonString str ? str.value() : null;
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
