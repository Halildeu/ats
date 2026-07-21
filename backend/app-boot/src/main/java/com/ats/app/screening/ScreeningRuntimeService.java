package com.ats.app.screening;

import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import com.ats.ops.OperationalEvent;
import com.ats.ops.OperationalEventSink;
import com.ats.ops.PiiClass;
import com.ats.orchestration.Citation;
import com.ats.orchestration.CitationStore;
import com.ats.orchestration.Transcript;
import com.ats.orchestration.TranscriptStore;
import com.ats.screening.FindingSetRef;
import com.ats.screening.ProtectedAttributeScreener;
import com.ats.screening.ScreeningEvidenceStore;
import com.ats.screening.ScreeningEvidenceStore.IdempotentSaveResult;
import com.ats.screening.ScreeningEvidenceStore.RequestBinding;
import com.ats.screening.ScreeningEvidenceStore.RequestReplay;
import com.ats.screening.ScreeningEvidenceStore.SaveCommand;
import com.ats.screening.ScreeningEvidenceStore.StoredEvidence;
import com.ats.screening.ScreeningResult;
import com.ats.screening.ScreeningSourceKind;
import java.time.Clock;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * ATS #156-c application service: yalnız server-side tenant/interview-scope ile çözülen
 * insert-only canonical content'i tarar ve atomik evidence store'a yazar.
 *
 * <p>Public/generic text metodu YOKTUR. Sealed request yalnız transcript segmenti veya citation
 * key'i taşır; ham içerik controller/body/log/event/WORM/idempotency mapping'e giremez. Screening
 * sonucu aday workflow'unu değiştirmez, skor/karar/öneri üretmez.
 */
public final class ScreeningRuntimeService {

    private static final Logger LOG = LoggerFactory.getLogger(ScreeningRuntimeService.class);
    private static final String PERSISTED_EVENT = "evidence.screening.persisted";
    private static final String PERSIST_FAILED_EVENT = "evidence.screening.persist_failed";

    public sealed interface ScreeningRequest
            permits TranscriptSegmentRequest, CitationClaimRequest {
        TenantId tenantId();
        ActorId actorId();
        InterviewId interviewId();
        String idempotencyKey();
    }

    public record TranscriptSegmentRequest(
            TenantId tenantId,
            ActorId actorId,
            InterviewId interviewId,
            String idempotencyKey,
            String transcriptKey,
            int segmentIndex) implements ScreeningRequest {
        public TranscriptSegmentRequest {
            requireIds(tenantId, actorId, interviewId);
            // Merkezi RequestBinding validator'ı API/service/store arasında aynı kapalı formatı tutar.
            new RequestBinding(idempotencyKey, ScreeningSourceKind.TRANSCRIPT_SEGMENT,
                    transcriptKey, segmentIndex);
        }
    }

    public record CitationClaimRequest(
            TenantId tenantId,
            ActorId actorId,
            InterviewId interviewId,
            String idempotencyKey,
            String citationKey) implements ScreeningRequest {
        public CitationClaimRequest {
            requireIds(tenantId, actorId, interviewId);
            new RequestBinding(idempotencyKey, ScreeningSourceKind.CITATION_CLAIM,
                    citationKey, null);
        }
    }

    /** POST görünümü: restricted evidence + aynı request'e ait server-resolved opak kaynak bağı. */
    public record ScreeningView(
            StoredEvidence evidence,
            String canonicalSourceRef,
            Integer segmentIndex,
            boolean replayed) {
        public ScreeningView {
            Objects.requireNonNull(evidence, "evidence");
            if (canonicalSourceRef == null || canonicalSourceRef.isBlank()) {
                throw new IllegalArgumentException("canonicalSourceRef zorunlu");
            }
        }
    }

    private final ProtectedAttributeScreener screener;
    private final ScreeningEvidenceStore evidenceStore;
    private final TranscriptStore transcriptStore;
    private final CitationStore citationStore;
    private final OperationalEventSink eventSink;
    private final Clock clock;

    public ScreeningRuntimeService(
            ProtectedAttributeScreener screener,
            ScreeningEvidenceStore evidenceStore,
            TranscriptStore transcriptStore,
            CitationStore citationStore,
            OperationalEventSink eventSink,
            Clock clock) {
        this.screener = Objects.requireNonNull(screener, "screener");
        this.evidenceStore = Objects.requireNonNull(evidenceStore, "evidenceStore");
        this.transcriptStore = Objects.requireNonNull(transcriptStore, "transcriptStore");
        this.citationStore = Objects.requireNonNull(citationStore, "citationStore");
        this.eventSink = Objects.requireNonNull(eventSink, "eventSink");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public Outcome<ScreeningView> screen(ScreeningRequest request) {
        if (request == null) {
            return Outcome.fail(OutcomeCode.INVALID, "screening request zorunlu");
        }
        RequestBinding binding = binding(request);
        Outcome<RequestReplay> prior = evidenceStore.findRequest(
                request.tenantId(), request.interviewId(), binding);
        if (prior instanceof Outcome.Ok<RequestReplay> priorOk) {
            return Outcome.ok(new ScreeningView(
                    priorOk.value().evidence(), binding.canonicalSourceRef(),
                    binding.segmentIndex(), true));
        }
        if (!(prior instanceof Outcome.Fail<RequestReplay> lookupFail)) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED,
                    "screening request lookup kapalı Outcome sözleşmesini ihlal etti");
        }
        if (lookupFail.code() != OutcomeCode.NOT_FOUND) {
            return Outcome.fail(lookupFail.code(), lookupFail.reason());
        }
        return switch (request) {
            case TranscriptSegmentRequest transcript -> screenTranscriptSegment(transcript);
            case CitationClaimRequest citation -> screenCitationClaim(citation);
        };
    }

    public Outcome<ScreeningView> get(
            TenantId tenantId, InterviewId interviewId, FindingSetRef findingSetRef) {
        if (tenantId == null || interviewId == null || findingSetRef == null
                || blank(tenantId.value()) || blank(interviewId.value())) {
            return Outcome.fail(OutcomeCode.INVALID,
                    "tenantId/interviewId/findingSetRef zorunlu");
        }
        Outcome<RequestReplay> found = evidenceStore.getBoundEvidence(
                tenantId, interviewId, findingSetRef);
        if (!(found instanceof Outcome.Ok<RequestReplay> ok)) {
            if (!(found instanceof Outcome.Fail<RequestReplay> fail)) {
                return Outcome.fail(OutcomeCode.NOT_CONFIGURED,
                        "screening evidence lookup kapalı Outcome sözleşmesini ihlal etti");
            }
            return Outcome.fail(fail.code(), fail.reason());
        }
        RequestReplay value = ok.value();
        return Outcome.ok(new ScreeningView(
                value.evidence(), value.binding().canonicalSourceRef(),
                value.binding().segmentIndex(), true));
    }

    private Outcome<ScreeningView> screenTranscriptSegment(TranscriptSegmentRequest request) {
        Outcome<Transcript> found = transcriptStore.find(
                request.tenantId(), request.interviewId(), request.transcriptKey());
        if (!(found instanceof Outcome.Ok<Transcript> transcriptOk)) {
            return Outcome.fail(OutcomeCode.NOT_FOUND,
                    "transkript yok (tenant/interview-scope)");
        }
        Transcript transcript = transcriptOk.value();
        List<Transcript.Segment> matchingSegments = transcript.segments().stream()
                .filter(s -> s.index() == request.segmentIndex())
                .toList();
        if (matchingSegments.isEmpty()) {
            return Outcome.fail(OutcomeCode.NOT_FOUND,
                    "transkript segmenti yok (tenant/interview-scope)");
        }
        if (matchingSegments.size() != 1) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED,
                    "transkript segment indeksi tekil değil (fail-closed)");
        }
        Transcript.Segment segment = matchingSegments.getFirst();
        if (blank(segment.text())) {
            return sourceFailure(request.tenantId(), "CANONICAL_SOURCE_INVALID",
                    "transkript segment metni boş (fail-closed)");
        }
        ScreeningResult result;
        try {
            result = screener.screenSegment(
                    segment.text(), ScreeningSourceKind.TRANSCRIPT_SEGMENT,
                    transcript.language(), request.segmentIndex());
        } catch (RuntimeException ex) {
            return sourceFailure(request.tenantId(), "SCREENER_RUNTIME",
                    "screening kernel çalışma zamanı hatası (fail-closed)");
        }
        RequestBinding binding = new RequestBinding(
                request.idempotencyKey(), ScreeningSourceKind.TRANSCRIPT_SEGMENT,
                request.transcriptKey(), request.segmentIndex());
        return persist(request, result, binding);
    }

    private Outcome<ScreeningView> screenCitationClaim(CitationClaimRequest request) {
        Outcome<Citation> found = citationStore.find(
                request.tenantId(), request.interviewId(), request.citationKey());
        if (!(found instanceof Outcome.Ok<Citation> citationOk)) {
            return Outcome.fail(OutcomeCode.NOT_FOUND,
                    "citation yok (tenant/interview-scope)");
        }
        Citation citation = citationOk.value();
        Outcome<Transcript> transcript = transcriptStore.find(
                request.tenantId(), request.interviewId(), citation.transcriptKey());
        if (!(transcript instanceof Outcome.Ok<Transcript> transcriptOk)) {
            return Outcome.fail(OutcomeCode.NOT_FOUND,
                    "citation kaynak transkripte çözülemiyor (fail-closed)");
        }
        if (blank(citation.claim()) || citation.segmentIndexes().isEmpty()
                || new HashSet<>(citation.segmentIndexes()).size() != citation.segmentIndexes().size()
                || citation.segmentIndexes().stream().anyMatch(index -> index == null || index < 0)
                || citation.segmentIndexes().stream().anyMatch(index ->
                        transcriptOk.value().segments().stream()
                                .filter(segment -> segment.index() == index).count() != 1)) {
            return sourceFailure(request.tenantId(), "CANONICAL_SOURCE_INVALID",
                    "citation claim/segment bağı geçersiz (fail-closed)");
        }
        ScreeningResult result;
        try {
            result = screener.screen(
                    citation.claim(), ScreeningSourceKind.CITATION_CLAIM,
                    transcriptOk.value().language());
        } catch (RuntimeException ex) {
            return sourceFailure(request.tenantId(), "SCREENER_RUNTIME",
                    "screening kernel çalışma zamanı hatası (fail-closed)");
        }
        RequestBinding binding = new RequestBinding(
                request.idempotencyKey(), ScreeningSourceKind.CITATION_CLAIM,
                request.citationKey(), null);
        return persist(request, result, binding);
    }

    private Outcome<ScreeningView> persist(
            ScreeningRequest request, ScreeningResult result, RequestBinding binding) {
        SaveCommand command = new SaveCommand(
                request.tenantId(), request.actorId(), request.interviewId(), result,
                binding.sourceKind(), Instant.now(clock).toString());
        Outcome<IdempotentSaveResult> saved = evidenceStore.saveIdempotent(command, binding);
        if (!(saved instanceof Outcome.Ok<IdempotentSaveResult> savedOk)) {
            Outcome.Fail<IdempotentSaveResult> fail = (Outcome.Fail<IdempotentSaveResult>) saved;
            emit(request.tenantId(), PERSIST_FAILED_EVENT,
                    Map.of("reason_code", persistFailureReason(fail.code())));
            return Outcome.fail(fail.code(), fail.reason());
        }
        IdempotentSaveResult value = savedOk.value();
        if (!value.replayed()) {
            emit(request.tenantId(), PERSISTED_EVENT,
                    Map.of("ledger_entry_ref", value.receipt().evidenceId().value()));
        }
        return Outcome.ok(new ScreeningView(
                value.evidence(), binding.canonicalSourceRef(),
                binding.segmentIndex(), value.replayed()));
    }

    private void emit(TenantId tenantId, String type, Map<String, String> extras) {
        String severity = PERSISTED_EVENT.equals(type) ? "info" : "error";
        Outcome<OperationalEvent> created = OperationalEvent.create(
                tenantId, type, "evidence", severity, PiiClass.ID_ONLY, extras);
        if (!(created instanceof Outcome.Ok<OperationalEvent> ok)) {
            LOG.warn("Screening operational event registry validation failed: type={}", type);
            return;
        }
        try {
            eventSink.emit(ok.value());
        } catch (RuntimeException ex) {
            LOG.warn("Screening operational event sink failed after business outcome: type={}", type);
        }
        // OperationalEvent two-plane telemetry'dir; WORM receipt audit authority'sidir.
        // Sink failure business transactionını geri almaz ve aday workflow'unu değiştirmez.
    }

    private Outcome<ScreeningView> sourceFailure(
            TenantId tenantId, String reasonCode, String reason) {
        emit(tenantId, PERSIST_FAILED_EVENT, Map.of("reason_code", reasonCode));
        return Outcome.fail(OutcomeCode.NOT_CONFIGURED, reason);
    }

    private static String persistFailureReason(OutcomeCode code) {
        return switch (code) {
            case CONFLICT -> "IDEMPOTENCY_CONFLICT";
            case NOT_CONFIGURED -> "STORE_UNAVAILABLE";
            case DENIED, TENANT_SCOPE_VIOLATION, UNAUTHENTICATED -> "SCOPE_REJECTED";
            default -> "STORE_REJECTED";
        };
    }

    private static RequestBinding binding(ScreeningRequest request) {
        return switch (request) {
            case TranscriptSegmentRequest transcript -> new RequestBinding(
                    transcript.idempotencyKey(), ScreeningSourceKind.TRANSCRIPT_SEGMENT,
                    transcript.transcriptKey(), transcript.segmentIndex());
            case CitationClaimRequest citation -> new RequestBinding(
                    citation.idempotencyKey(), ScreeningSourceKind.CITATION_CLAIM,
                    citation.citationKey(), null);
        };
    }

    private static void requireIds(TenantId tenantId, ActorId actorId, InterviewId interviewId) {
        if (tenantId == null || actorId == null || interviewId == null
                || blank(tenantId.value()) || blank(actorId.value()) || blank(interviewId.value())) {
            throw new IllegalArgumentException("tenantId/actorId/interviewId zorunlu");
        }
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }
}
