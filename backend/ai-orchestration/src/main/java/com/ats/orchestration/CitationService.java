package com.ats.orchestration;

import com.ats.consent.ConsentGate;
import com.ats.contracts.AIProvider;
import com.ats.contracts.AIProvider.CitationResult;
import com.ats.contracts.AIProvider.Entailment;
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
    static final String APPEND_SUCCEEDED_EVENT = "evidence.append.succeeded";
    static final String APPEND_FAILED_EVENT = "evidence.append.failed";
    static final String LEDGER_EVENT_TYPE = "claim.citation.recorded";
    static final int MAX_CLAIM_LENGTH = 500;

    /** Ref formatı: "seg-<index>" (0-based; stored Segment.index() ile birebir çözülmeli). */
    private static final Pattern REF_FORMAT = Pattern.compile("seg-(0|[1-9][0-9]{0,5})");

    public record CitationReceipt(String citationKey, String evidenceId, Entailment entailment, int resolvedRefCount) {}

    private final ConsentGate consentGate;
    private final AIProvider provider;
    private final TranscriptStore transcriptStore;
    private final CitationStore citationStore;
    private final EvidenceLedger ledger;
    private final OperationalEventSink sink;

    public CitationService(
            ConsentGate consentGate,
            AIProvider provider,
            TranscriptStore transcriptStore,
            CitationStore citationStore,
            EvidenceLedger ledger,
            OperationalEventSink sink) {
        this.consentGate = consentGate;
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

        Outcome<CitationResult> cited = provider.cite(canonicalClaim, transcriptKey);
        if (!(cited instanceof Outcome.Ok<CitationResult> citedOk) || citedOk.value() == null) {
            emit(tenantId, PROVIDER_REJECTED_EVENT, "ai_pipeline", "warning", PiiClass.NONE,
                    Map.of("reason_code", "citation_provider_failed"));
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "citation sağlayıcı başarısız (fail-closed)");
        }
        CitationResult result = citedOk.value();

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
