package com.ats.app.screening;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.contracts.AIProvider.Entailment;
import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import com.ats.ops.InMemoryEventSink;
import com.ats.orchestration.InMemoryCitationStore;
import com.ats.orchestration.InMemoryTranscriptStore;
import com.ats.orchestration.Citation;
import com.ats.orchestration.Transcript;
import com.ats.screening.FindingSetRef;
import com.ats.screening.ProtectedAttributeScreener;
import com.ats.screening.ScreeningEvidenceStore;
import java.time.Clock;
import java.util.List;
import org.junit.jupiter.api.Test;

class ScreeningRuntimeServiceTest {

    @Test
    void duplicate_segment_index_fails_closed_before_screening_persistence() {
        TenantId tenant = new TenantId("tenant-duplicate-segment");
        InterviewId interview = new InterviewId("iv-duplicate-segment");
        InMemoryTranscriptStore transcripts = new InMemoryTranscriptStore();
        String transcriptKey = transcripts.put(new Transcript(
                tenant, interview, "iv-duplicate-segment/rec-" + "a".repeat(64), "tr-TR",
                List.of(
                        new Transcript.Segment(0, "S1", 0, 1_000, "Kaç yaşındasınız?"),
                        new Transcript.Segment(0, "S2", 1_000, 2_000, "Farklı içerik"))))
                .asOptional().orElseThrow();
        RecordingStore evidence = new RecordingStore();
        InMemoryEventSink events = new InMemoryEventSink();
        ScreeningRuntimeService service = new ScreeningRuntimeService(
                ProtectedAttributeScreener.fromClasspath(
                        "screening/protected-attribute-screening-policy.v1.json"),
                evidence, transcripts, new InMemoryCitationStore(), events, Clock.systemUTC());

        Outcome<ScreeningRuntimeService.ScreeningView> out = service.screen(
                new ScreeningRuntimeService.TranscriptSegmentRequest(
                        tenant, new ActorId("reviewer-opaque"), interview,
                        "scrq_00000000-0000-4000-8000-000000000099", transcriptKey, 0));

        assertFalse(out.isOk());
        assertEquals(OutcomeCode.NOT_CONFIGURED,
                ((Outcome.Fail<ScreeningRuntimeService.ScreeningView>) out).code());
        assertFalse(evidence.saveCalled,
                "belirsiz canonical segmentte restricted/WORM kanıt üretilmemeli");
        assertFalse(events.emitted().stream().anyMatch(
                e -> e.eventTypeId().startsWith("evidence.screening.persist")),
                "persist denenmediği için persisted/persist_failed telemetrisi de üretilmemeli");
    }

    @Test
    void blank_transcript_segment_never_becomes_clear_evidence() {
        TenantId tenant = new TenantId("tenant-blank-segment");
        InterviewId interview = new InterviewId("iv-blank-segment");
        InMemoryTranscriptStore transcripts = new InMemoryTranscriptStore();
        String transcriptKey = transcripts.put(new Transcript(
                tenant, interview, "iv-blank-segment/rec-" + "b".repeat(64), "tr-TR",
                List.of(new Transcript.Segment(0, "S1", 0, 1_000, "   "))))
                .asOptional().orElseThrow();
        RecordingStore evidence = new RecordingStore();
        InMemoryEventSink events = new InMemoryEventSink();
        ScreeningRuntimeService service = service(evidence, transcripts,
                new InMemoryCitationStore(), events);

        Outcome<ScreeningRuntimeService.ScreeningView> out = service.screen(
                new ScreeningRuntimeService.TranscriptSegmentRequest(
                        tenant, new ActorId("reviewer-opaque"), interview,
                        "scrq_00000000-0000-4000-8000-000000000101", transcriptKey, 0));

        assertSourceInvalid(out, evidence, events);
    }

    @Test
    void blank_citation_claim_never_becomes_clear_evidence() {
        TenantId tenant = new TenantId("tenant-bad-citation");
        InterviewId interview = new InterviewId("iv-bad-citation");
        InMemoryTranscriptStore transcripts = new InMemoryTranscriptStore();
        String transcriptKey = transcripts.put(new Transcript(
                tenant, interview, "iv-bad-citation/rec-" + "c".repeat(64), "tr-TR",
                List.of(new Transcript.Segment(0, "S1", 0, 1_000, "Normal içerik"))))
                .asOptional().orElseThrow();
        InMemoryCitationStore citations = new InMemoryCitationStore();
        String citationKey = citations.put(new Citation(
                tenant, interview, transcriptKey, " ", List.of(0), Entailment.SUPPORTED))
                .asOptional().orElseThrow();
        RecordingStore evidence = new RecordingStore();
        InMemoryEventSink events = new InMemoryEventSink();
        ScreeningRuntimeService service = service(evidence, transcripts, citations, events);

        Outcome<ScreeningRuntimeService.ScreeningView> out = service.screen(
                new ScreeningRuntimeService.CitationClaimRequest(
                        tenant, new ActorId("reviewer-opaque"), interview,
                        "scrq_00000000-0000-4000-8000-000000000102", citationKey));

        assertSourceInvalid(out, evidence, events);
    }

    @Test
    void citation_claim_with_missing_transcript_segment_binding_fails_closed() {
        TenantId tenant = new TenantId("tenant-unbound-citation");
        InterviewId interview = new InterviewId("iv-unbound-citation");
        InMemoryTranscriptStore transcripts = new InMemoryTranscriptStore();
        String transcriptKey = transcripts.put(new Transcript(
                tenant, interview, "iv-unbound-citation/rec-" + "d".repeat(64), "tr-TR",
                List.of(new Transcript.Segment(0, "S1", 0, 1_000, "Normal içerik"))))
                .asOptional().orElseThrow();
        InMemoryCitationStore citations = new InMemoryCitationStore();
        String citationKey = citations.put(new Citation(
                tenant, interview, transcriptKey, "Yaşınız nedir?", List.of(99),
                Entailment.SUPPORTED)).asOptional().orElseThrow();
        RecordingStore evidence = new RecordingStore();
        InMemoryEventSink events = new InMemoryEventSink();

        Outcome<ScreeningRuntimeService.ScreeningView> out = service(
                evidence, transcripts, citations, events).screen(
                        new ScreeningRuntimeService.CitationClaimRequest(
                                tenant, new ActorId("reviewer-opaque"), interview,
                                "scrq_00000000-0000-4000-8000-000000000103", citationKey));

        assertSourceInvalid(out, evidence, events);
    }

    private static ScreeningRuntimeService service(
            RecordingStore evidence,
            InMemoryTranscriptStore transcripts,
            InMemoryCitationStore citations,
            InMemoryEventSink events) {
        return new ScreeningRuntimeService(
                ProtectedAttributeScreener.fromClasspath(
                        "screening/protected-attribute-screening-policy.v1.json"),
                evidence, transcripts, citations, events, Clock.systemUTC());
    }

    private static void assertSourceInvalid(
            Outcome<ScreeningRuntimeService.ScreeningView> out,
            RecordingStore evidence,
            InMemoryEventSink events) {
        assertFalse(out.isOk());
        assertEquals(OutcomeCode.NOT_CONFIGURED,
                ((Outcome.Fail<ScreeningRuntimeService.ScreeningView>) out).code());
        assertFalse(evidence.saveCalled);
        assertTrue(events.emitted().stream().anyMatch(event ->
                event.eventTypeId().equals("evidence.screening.persist_failed")
                        && "CANONICAL_SOURCE_INVALID".equals(
                                event.extras().get("reason_code"))));
    }

    private static final class RecordingStore implements ScreeningEvidenceStore {
        private boolean saveCalled;

        @Override
        public Outcome<SaveReceipt> save(SaveCommand command) {
            saveCalled = true;
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "unexpected save");
        }

        @Override
        public Outcome<IdempotentSaveResult> saveIdempotent(
                SaveCommand command, RequestBinding binding) {
            saveCalled = true;
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "unexpected save");
        }

        @Override
        public Outcome<RequestReplay> findRequest(
                TenantId tenantId, InterviewId interviewId, RequestBinding expectedBinding) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "request yok");
        }

        @Override
        public Outcome<RequestReplay> getBoundEvidence(
                TenantId tenantId, InterviewId interviewId, FindingSetRef findingSetRef) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "evidence yok");
        }

        @Override
        public Outcome<StoredEvidence> get(TenantId tenantId, FindingSetRef findingSetRef) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "evidence yok");
        }

        @Override
        public Outcome<PurgeTargetState> inspectPurgeTarget(
                TenantId tenantId, InterviewId interviewId, FindingSetRef findingSetRef) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "evidence yok");
        }

        @Override
        public Outcome<PurgeReceipt> purge(PurgeCommand command) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "evidence yok");
        }
    }
}
