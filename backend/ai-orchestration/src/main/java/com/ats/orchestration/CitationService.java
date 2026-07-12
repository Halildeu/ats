package com.ats.orchestration;

import com.ats.consent.ConsentGate;
import com.ats.contracts.AIProvider;
import com.ats.contracts.AIProvider.CitationResult;
import com.ats.contracts.AIProvider.Entailment;
import com.ats.contracts.EvidenceLedger;
import com.ats.contracts.EvidenceLedger.EvidenceEvent;
import com.ats.contracts.EvidenceLedger.LedgerEntry;
import com.ats.contracts.governance.Capability;
import com.ats.contracts.governance.ModelGovernanceGate;
import com.ats.contracts.governance.ModelGovernanceJournal;
import com.ats.contracts.governance.ModelGovernanceJournal.Attested;
import com.ats.contracts.governance.ModelGovernanceJournal.InvocationContext;
import com.ats.contracts.governance.ModelGovernanceJournal.PreflightRejected;
import com.ats.contracts.governance.ModelGovernanceJournal.ProviderRejected;
import com.ats.contracts.governance.ModelGovernanceJournal.VerificationRejected;
import com.ats.contracts.governance.ModelInvocationId;
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
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * PRD-P1 F4 claim-citation orkestrasyonu (ATS-0016 slice-3, port-only):
 * consent RE-CHECK (withdrawal citation üretimini de DURDURUR — ATS-0003) → tenant-scoped
 * transkript doğrulama → AIProvider.cite (sağlayıcı port arkasında; ATS-0017) → FAIL-CLOSED
 * doğrulama (ATS-0004: sağlayıcı claim'i değiştiremez; ref'ler stored segment'lere ÇÖZÜLMEK
 * zorunda — uydurma kaynak asla kabul edilmez; kanıtsız SUPPORTED sunulamaz; INSUFFICIENT
 * dürüst kalır, yukarı yuvarlanmaz; karar/skor üretilmez) → CitationStore → WORM ledger append.
 * Two-plane + minimizasyon (Codex 019f23a6 A2): CLAIM METNİ ve claim-türevi hash LEDGER'A
 * GİRMEZ (ATS-0003 hash-kişisel-veri tuzağı) — payload yalnız citation_key/transcript_key/
 * entailment/ref_count; content-hash ve idempotency claim'den DEĞİL citation_key'den türetilir.
 * Append fail → citation kaydı geri alınır (telafi hatası yutulmaz).
 */
public final class CitationService {

    static final String CITATION_REJECTED_EVENT = "ai_pipeline.citation.rejected";
    static final String PROVIDER_REJECTED_EVENT = "ai_pipeline.provider.request_rejected";
    static final String MODEL_GOVERNANCE_DENIED_EVENT = "ai_pipeline.model_governance.denied";
    static final String APPEND_SUCCEEDED_EVENT = "evidence.append.succeeded";
    static final String APPEND_FAILED_EVENT = "evidence.append.failed";
    static final String LEDGER_EVENT_TYPE = "claim.citation.recorded";
    static final int MAX_CLAIM_LENGTH = 500;

    /** Ref formatı: "seg-<index>" (0-based; stored Segment.index() ile birebir çözülmeli). */
    private static final Pattern REF_FORMAT = Pattern.compile("seg-(0|[1-9][0-9]{0,5})");

    public record CitationReceipt(String citationKey, String evidenceId, Entailment entailment, int resolvedRefCount) {}

    private final ConsentGate consentGate;
    private final ModelGovernanceGate governanceGate;
    private final ModelGovernanceJournal journal;
    private final AIProvider provider;
    private final TranscriptStore transcriptStore;
    private final CitationStore citationStore;
    private final EvidenceLedger ledger;
    private final OperationalEventSink sink;

    public CitationService(
            ConsentGate consentGate,
            ModelGovernanceGate governanceGate,
            ModelGovernanceJournal journal,
            AIProvider provider,
            TranscriptStore transcriptStore,
            CitationStore citationStore,
            EvidenceLedger ledger,
            OperationalEventSink sink) {
        this.consentGate = consentGate;
        this.governanceGate = governanceGate;
        this.journal = journal;
        this.provider = provider;
        this.transcriptStore = transcriptStore;
        this.citationStore = citationStore;
        this.ledger = ledger;
        this.sink = sink;
    }

    public Outcome<CitationReceipt> citeClaim(
            TenantId tenantId, ActorId actorId, InterviewId interviewId,
            String transcriptKey, String claim, String occurredAtIso) {
        String canonicalClaim = claim == null ? "" : claim.strip();
        if (canonicalClaim.isEmpty() || canonicalClaim.length() > MAX_CLAIM_LENGTH) {
            return Outcome.fail(OutcomeCode.INVALID, "claim boş/uzunluk-sınırı dışı (1.." + MAX_CLAIM_LENGTH + ")");
        }

        Outcome<Void> consent = consentGate.requireRecordingAllowed(tenantId, interviewId);
        if (consent instanceof Outcome.Fail<Void> denied) {
            return Outcome.fail(denied.code(), denied.reason());
        }

        Outcome<Transcript> found = transcriptStore.find(tenantId, interviewId, transcriptKey);
        if (!(found instanceof Outcome.Ok<Transcript> transcriptOk)) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "transkript yok (tenant-scope; cross-tenant erişim yapısal kapalı)");
        }
        Transcript transcript = transcriptOk.value();

        // gov1-1d: her AI invocation'ı için OPAK korelasyon kimliği — preflight'tan HEMEN önce üretilir;
        // authorized + terminal WORM event'leri bu değere bağlanır (crash-gap makine-tespiti).
        InvocationContext journalCtx = new InvocationContext(tenantId, interviewId, actorId);
        ModelInvocationId invocationId = ModelInvocationId.random();

        // gov1-1c: çağrı-ÖNCESİ model-governance kapısı. CITE için onaylı-model APPROVED değilse
        // sağlayıcıya HİÇ çıkılmaz (fail-closed).
        Outcome<ModelGovernanceGate.Permit> preflight = governanceGate.preflight(Capability.CITE);
        if (!(preflight instanceof Outcome.Ok<ModelGovernanceGate.Permit> permitOk)) {
            // Preflight RED → provider HİÇ çağrılmaz; gov1-1d terminal(PreflightRejected) WORM'a yazılır.
            return preflightRejected(journalCtx, invocationId,
                    safeGateReason((Outcome.Fail<ModelGovernanceGate.Permit>) preflight));
        }
        ModelGovernanceGate.Permit permit = permitOk.value();
        if (permit == null) {
            // Fail-closed: gate Ok verdi ama Permit null (sözleşme-ihlali) → preflight-red gibi ele al.
            return preflightRejected(journalCtx, invocationId, ModelGovernanceGate.Reason.REGISTRY_UNAVAILABLE);
        }

        // gov1-1d: çağrı-ÖNCESİ authorized WORM event'i. Append başarısızsa sağlayıcıya HİÇ çıkılmaz
        // (fail-closed AUDIT_UNAVAILABLE).
        if (!journal.recordAuthorized(journalCtx, invocationId, permit).isOk()) {
            return governanceDenied(tenantId, ModelGovernanceGate.Reason.AUDIT_UNAVAILABLE);
        }

        Outcome<CitationResult> cited = provider.cite(canonicalClaim, transcriptKey);
        if (!(cited instanceof Outcome.Ok<CitationResult> citedOk) || citedOk.value() == null) {
            // gov1-1d: terminal(ProviderRejected) WORM'a yazılır (append fail → AUDIT_UNAVAILABLE).
            Outcome<CitationReceipt> audit = journalTerminal(journalCtx, invocationId, new ProviderRejected(permit));
            if (audit != null) {
                return audit;
            }
            emit(tenantId, PROVIDER_REJECTED_EVENT, "ai_pipeline", "warning", PiiClass.NONE,
                    Map.of("reason_code", "citation_provider_failed"));
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "citation sağlayıcı başarısız (fail-closed)");
        }
        CitationResult result = citedOk.value();
        AIProvider.ReportedModelIdentity reported = result.modelIdentity();

        // gov1-1c: sonuç-SONRASI doğrulama. Sağlayıcının RAPORLADIĞI model kimliği onaylı spec ile
        // HARD-REQUIRED eşleşmeli; absent/mismatch/TOCTOU-revoke → sonuç TAMAMEN discard
        // (citation-store/WORM'a GİRMEZ). ALLOW kararı = Decision.allowed() (isOk() tek başına YETMEZ).
        Outcome<ModelGovernanceGate.Decision> verified = governanceGate.verify(permit, reported);
        if (!(verified instanceof Outcome.Ok<ModelGovernanceGate.Decision> decisionOk)) {
            // verify yalnız permit==null'da Fail döner (buraya ulaşılmaz) — yine de fail-closed:
            // sentetik DENY ile terminal(VerificationRejected) yaz, KAPALI Reason ile reddet.
            return verificationRejected(journalCtx, invocationId, permit, reported,
                    safeGateReason((Outcome.Fail<ModelGovernanceGate.Decision>) verified));
        }
        ModelGovernanceGate.Decision decision = decisionOk.value();
        if (decision == null) {
            // Fail-closed: gate Ok verdi ama Decision null (sözleşme-ihlali) → verification-red gibi ele al.
            return verificationRejected(journalCtx, invocationId, permit, reported,
                    ModelGovernanceGate.Reason.REGISTRY_UNAVAILABLE);
        }
        if (!decision.allowed()) {
            // DENY: terminal(VerificationRejected) yaz (append fail → AUDIT_UNAVAILABLE), sonra governance-red.
            Outcome<CitationReceipt> audit =
                    journalTerminal(journalCtx, invocationId, new VerificationRejected(permit, reported, decision));
            if (audit != null) {
                return audit;
            }
            return governanceDenied(tenantId, decision.reasonCode());
        }
        // ALLOW: terminal(Attested) WORM'a business (citation-store/business-WORM)'DAN ÖNCE yazılır. Append
        // başarısızsa business sonucu TAMAMEN discard (store/business-WORM'a GİRMEZ) — fail-closed AUDIT_UNAVAILABLE.
        Outcome<CitationReceipt> attestAudit =
                journalTerminal(journalCtx, invocationId, new Attested(permit, reported, decision));
        if (attestAudit != null) {
            return attestAudit;
        }

        if (result.entailment() == null) {
            return reject(tenantId, "invalid_provider_result", "entailment boş (fail-closed)");
        }
        if (result.claim() == null || !canonicalClaim.equals(result.claim().strip())) {
            return reject(tenantId, "claim_mismatch", "sağlayıcı claim'i değiştiremez (fail-closed)");
        }

        Outcome<List<Integer>> resolved = resolveRefs(tenantId, result.sourceSegmentRefs(), transcript);
        if (!(resolved instanceof Outcome.Ok<List<Integer>> refsOk)) {
            return Outcome.fail(((Outcome.Fail<List<Integer>>) resolved).code(), ((Outcome.Fail<List<Integer>>) resolved).reason());
        }
        List<Integer> segmentIndexes = refsOk.value();

        if (result.entailment() == Entailment.SUPPORTED && segmentIndexes.isEmpty()) {
            return reject(tenantId, "unsupported_without_source",
                    "kaynaksız SUPPORTED sunulamaz (ATS-0004 fail-closed çekirdeği)");
        }

        Citation citation = new Citation(
                tenantId, interviewId, transcriptKey, canonicalClaim, segmentIndexes, result.entailment());
        Outcome<String> stored = citationStore.put(citation);
        if (!(stored instanceof Outcome.Ok<String> keyOk)) {
            return Outcome.fail(OutcomeCode.INVALID, "citation deposuna yazılamadı");
        }
        String citationKey = keyOk.value();

        // Minimizasyon: content-hash + idempotency claim'den DEĞİL, silinebilir-düzlem anahtarından türetilir
        String contentHash = sha256Hex(citationKey + "|" + transcriptKey + "|" + result.entailment() + "|" + segmentIndexes);
        Outcome<LedgerEntry> appended = ledger.append(new EvidenceEvent(
                tenantId, actorId, interviewId, LEDGER_EVENT_TYPE, occurredAtIso,
                tenantId.value() + ":" + interviewId.value() + ":citation:" + citationKey,
                contentHash,
                JsonValue.object(Map.of(
                        "citation_key", JsonValue.of(citationKey),
                        "transcript_key", JsonValue.of(transcriptKey),
                        "entailment", JsonValue.of(result.entailment().name()),
                        "ref_count", JsonValue.of((double) segmentIndexes.size())))));
        if (!(appended instanceof Outcome.Ok<LedgerEntry> entryOk)) {
            Outcome<Void> rolledBack = citationStore.delete(tenantId, citationKey);
            if (rolledBack.isOk()) {
                emitAppendFailed(tenantId, "ledger_unavailable");
                return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "ledger append başarısız (citation geri alındı)");
            }
            emitAppendFailed(tenantId, "ledger_unavailable_rollback_failed");
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED,
                    "ledger append başarısız VE telafi silmesi başarısız — citation kanıtsız kalmış olabilir (operasyonel müdahale gerekir)");
        }

        LedgerEntry entry = entryOk.value();
        emit(tenantId, APPEND_SUCCEEDED_EVENT, "evidence", "info", PiiClass.ID_ONLY,
                Map.of("ledger_entry_ref", entry.evidenceId().value()));
        return Outcome.ok(new CitationReceipt(
                citationKey, entry.evidenceId().value(), result.entailment(), segmentIndexes.size()));
    }

    /** Ref'ler "seg-<n>" formatında olmalı ve stored Segment.index()'e ÇÖZÜLMELİ; duplicate yasak. */
    private Outcome<List<Integer>> resolveRefs(TenantId tenantId, List<String> rawRefs, Transcript transcript) {
        if (rawRefs == null) {
            Outcome<CitationReceipt> r = reject(tenantId, "invalid_refs", "sourceSegmentRefs null (fail-closed)");
            return Outcome.fail(((Outcome.Fail<CitationReceipt>) r).code(), ((Outcome.Fail<CitationReceipt>) r).reason());
        }
        Set<Integer> validIndexes = new LinkedHashSet<>();
        for (Transcript.Segment s : transcript.segments()) {
            validIndexes.add(s.index());
        }
        LinkedHashSet<Integer> resolved = new LinkedHashSet<>();
        for (String ref : rawRefs) {
            if (ref == null || !REF_FORMAT.matcher(ref.strip()).matches()) {
                Outcome<CitationReceipt> r = reject(tenantId, "invalid_refs", "ref formatı geçersiz: " + ref);
                return Outcome.fail(((Outcome.Fail<CitationReceipt>) r).code(), ((Outcome.Fail<CitationReceipt>) r).reason());
            }
            int index = Integer.parseInt(ref.strip().substring("seg-".length()));
            if (!validIndexes.contains(index)) {
                Outcome<CitationReceipt> r = reject(tenantId, "fabricated_ref",
                        "ref stored segment'e çözülmüyor (uydurma kaynak): " + ref);
                return Outcome.fail(((Outcome.Fail<CitationReceipt>) r).code(), ((Outcome.Fail<CitationReceipt>) r).reason());
            }
            if (!resolved.add(index)) {
                Outcome<CitationReceipt> r = reject(tenantId, "invalid_refs", "duplicate ref: " + ref);
                return Outcome.fail(((Outcome.Fail<CitationReceipt>) r).code(), ((Outcome.Fail<CitationReceipt>) r).reason());
            }
        }
        return Outcome.ok(new ArrayList<>(resolved));
    }

    private Outcome<CitationReceipt> reject(TenantId tenantId, String reasonCode, String message) {
        emit(tenantId, CITATION_REJECTED_EVENT, "ai_pipeline", "warning", PiiClass.ID_ONLY,
                Map.of("reason_code", reasonCode));
        return Outcome.fail(OutcomeCode.INVALID, message);
    }

    private void emitAppendFailed(TenantId tenantId, String reasonCode) {
        emit(tenantId, APPEND_FAILED_EVENT, "evidence", "error", PiiClass.ID_ONLY, Map.of("reason_code", reasonCode));
    }

    /**
     * gov1-1d preflight-red terminal'i (provider hiç çağrılmadı) WORM'a yazar + governance-red döner;
     * WORM append başarısızsa fail-closed AUDIT_UNAVAILABLE.
     */
    private Outcome<CitationReceipt> preflightRejected(
            InvocationContext ctx, ModelInvocationId id, ModelGovernanceGate.Reason reason) {
        Outcome<CitationReceipt> audit =
                journalTerminal(ctx, id, new PreflightRejected(Capability.CITE, reason));
        if (audit != null) {
            return audit;
        }
        return governanceDenied(ctx.tenantId(), reason);
    }

    /**
     * gov1-1d verification-red terminal'i (sentetik DENY kararıyla) WORM'a yazar + governance-red döner.
     * Sentetik DENY yalnız verify sözleşme-ihlali (Fail / null-Decision) fail-closed dalları içindir;
     * gerçek DENY kararı doğrudan {@link VerificationRejected} ile taşınır (çağrı yeri).
     */
    private Outcome<CitationReceipt> verificationRejected(
            InvocationContext ctx, ModelInvocationId id, ModelGovernanceGate.Permit permit,
            AIProvider.ReportedModelIdentity reported, ModelGovernanceGate.Reason reason) {
        ModelGovernanceGate.Decision synth =
                ModelGovernanceGate.Decision.deny(permit.approvalRef(), permit.capability(), reason);
        Outcome<CitationReceipt> audit =
                journalTerminal(ctx, id, new VerificationRejected(permit, reported, synth));
        if (audit != null) {
            return audit;
        }
        return governanceDenied(ctx.tenantId(), reason);
    }

    /**
     * gov1-1d terminal WORM append'i dener; başarısızsa fail-closed AUDIT_UNAVAILABLE Outcome'u döner
     * (çağıran onu döndürür — provider-red/verify-red'de reject, attested'da business discard),
     * başarılıysa {@code null} (çağıran devam eder).
     */
    private Outcome<CitationReceipt> journalTerminal(
            InvocationContext ctx, ModelInvocationId id, ModelGovernanceJournal.Terminal terminal) {
        if (journal.recordTerminal(ctx, id, terminal).isOk()) {
            return null;
        }
        return governanceDenied(ctx.tenantId(), ModelGovernanceGate.Reason.AUDIT_UNAVAILABLE);
    }

    /**
     * gov1-1c model-governance RED: Plane-1 observability event (reason-code YALNIZ; ham
     * reported-identity TAŞIMAZ) + fail-closed Outcome. WORM invocation-journal 1d'ye aittir —
     * burada yazılmaz. {@code reasonCode} = tipli {@link ModelGovernanceGate.Reason} token'ı.
     */
    private Outcome<CitationReceipt> governanceDenied(TenantId tenantId, ModelGovernanceGate.Reason reason) {
        // reason_code = KAPALI enum adı (ham/serbest string ASLA); business code = reason.outcomeCode()
        // (sürekli NOT_CONFIGURED değil — DENIED governance reddi 403'e, REGISTRY_UNAVAILABLE 503'e eşlenir).
        emit(tenantId, MODEL_GOVERNANCE_DENIED_EVENT, "ai_pipeline", "warning", PiiClass.NONE,
                Map.of("reason_code", reason.name()));
        return Outcome.fail(reason.outcomeCode(), "model-governance reddi (fail-closed)");
    }

    /**
     * Gate'ten dönen serbest-string Fail token'ını KAPALI {@link ModelGovernanceGate.Reason}'a
     * güvenli çevirir: bilinmeyen token VEYA OutcomeCode-tutarsız (bozuk/alternatif gate) →
     * fail-closed {@link ModelGovernanceGate.Reason#REGISTRY_UNAVAILABLE}. Böylece OperationalEvent
     * reason_code'una ham string (newline/secret/enjekte) ASLA girmez (kapalı enum invariant'ı).
     */
    private static ModelGovernanceGate.Reason safeGateReason(Outcome.Fail<?> fail) {
        String token = fail.reason();
        if (token == null) {
            return ModelGovernanceGate.Reason.REGISTRY_UNAVAILABLE;
        }
        try {
            ModelGovernanceGate.Reason reason = ModelGovernanceGate.Reason.valueOf(token);
            return reason.outcomeCode() == fail.code()
                    ? reason : ModelGovernanceGate.Reason.REGISTRY_UNAVAILABLE;
        } catch (IllegalArgumentException e) {
            return ModelGovernanceGate.Reason.REGISTRY_UNAVAILABLE;
        }
    }

    private void emit(TenantId tenantId, String eventTypeId, String category, String severity,
            PiiClass pii, Map<String, String> extras) {
        OperationalEvent.create(tenantId, eventTypeId, category, severity, pii, extras)
                .asOptional()
                .ifPresent(sink::emit);
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
