package com.ats.persistence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.consent.ConsentGate;
import com.ats.consent.InMemoryConsentStore;
import com.ats.contracts.AIProvider.Entailment;
import com.ats.dsr.DsrService;
import com.ats.dsr.DsarRequest;
import com.ats.dsr.InMemoryDsarStore;
import com.ats.dsr.RetentionScanner;
import com.ats.export.InMemoryExportArtifactStore;
import com.ats.ingest.InMemoryObjectStore;
import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.ops.InMemoryEventSink;
import com.ats.orchestration.Citation;
import com.ats.orchestration.InMemoryCitationStore;
import com.ats.orchestration.InMemoryTranscriptStore;
import com.ats.orchestration.Transcript;
import com.ats.review.HumanReviewService;
import com.ats.review.InMemoryReviewCaseStore;
import com.ats.screening.Coverage;
import com.ats.screening.FindingSetRef;
import com.ats.screening.ScreeningEvidenceStore.RequestBinding;
import com.ats.screening.ScreeningEvidenceStore.SaveCommand;
import com.ats.screening.ScreeningEvidenceStore.PurgeTargetState;
import com.ats.screening.ScreeningPolicyRef;
import com.ats.screening.ScreeningResult;
import com.ats.screening.ScreeningRunId;
import com.ats.screening.ScreeningSourceKind;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Clock;
import java.util.List;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.postgresql.ds.PGSimpleDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * ATS-0018 slice-8c — retention purge GERÇEK-DB testi: cutoff'tan eski content silinir,
 * yenisi kalır; per-interview privacy.retention.purged event'i; state/WORM'a dokunulmaz.
 * created_at geri-tarihleme superuser test bağlantısıyla yapılır (app-role'ün UPDATE'i yok).
 */
@Testcontainers
class PostgresRetentionTest {

    @Container
    private static final PostgreSQLContainer<?> PG = new PostgreSQLContainer<>("postgres:16-alpine");

    private static PGSimpleDataSource ds;
    private static PostgresTranscriptStore transcripts;
    private static PostgresCitationStore citations;
    private static PostgresExportArtifactStore artifacts;
    private static PostgresRetentionScanner scanner;

    private static final TenantId T1 = new TenantId("t1");
    private static final TenantId T2 = new TenantId("t2");
    private static final ActorId OPERATOR = new ActorId("scheduler-opaque-1");
    private static final InterviewId OLD_IV = new InterviewId("i-old");
    private static final InterviewId NEW_IV = new InterviewId("i-new");

    @BeforeAll
    static void migrate() {
        ds = new PGSimpleDataSource();
        ds.setUrl(PG.getJdbcUrl());
        ds.setUser(PG.getUsername());
        ds.setPassword(PG.getPassword());
        Flyway.configure().dataSource(ds).load().migrate();
        transcripts = new PostgresTranscriptStore(ds);
        citations = new PostgresCitationStore(ds);
        artifacts = new PostgresExportArtifactStore(ds);
        scanner = new PostgresRetentionScanner(ds);
    }

    private static void backdate(String table, String keyColumn, String key) throws SQLException {
        try (Connection c = ds.getConnection(); Statement st = c.createStatement()) {
            st.execute("UPDATE " + table + " SET created_at = now() - interval '400 days'"
                    + " WHERE " + keyColumn + " = '" + key.replace("'", "''") + "'");
        }
    }

    @Test
    void purge_deletes_expired_content_keeps_fresh_and_emits_per_interview_event() throws SQLException {
        // eski (400 gün) içerik
        String oldTr = transcripts.put(new Transcript(T1, OLD_IV, "i-old/rec-" + "a".repeat(64), "tr",
                List.of(new Transcript.Segment(0, "S1", 0, 900, "eski icerik")))).asOptional().orElseThrow();
        String oldCit = citations.put(new Citation(T1, OLD_IV, oldTr, "eski iddia", List.of(0),
                Entailment.SUPPORTED)).asOptional().orElseThrow();
        String oldArt = artifacts.put(T1, OLD_IV, "{\"eski\":\"paket\"}").asOptional().orElseThrow();
        PostgresScreeningEvidenceStore screenings = new PostgresScreeningEvidenceStore(ds);
        ScreeningResult oldScreening = screeningResult(501);
        RequestBinding oldBinding = new RequestBinding(
                requestKey(501), ScreeningSourceKind.TRANSCRIPT_SEGMENT, oldTr, 0);
        requireOk(screenings.saveIdempotent(
                screeningCommand(OLD_IV, oldScreening), oldBinding));
        backdate("transcript", "transcript_key", oldTr);
        backdate("citation", "citation_key", oldCit);
        backdate("export_artifact", "artifact_key", oldArt);
        backdate("protected_screening_evidence", "finding_set_ref", oldScreening.findingSetRef().value());
        // taze içerik
        String freshTr = transcripts.put(new Transcript(T1, NEW_IV, "i-new/rec-" + "b".repeat(64), "tr",
                List.of(new Transcript.Segment(0, "S1", 0, 900, "taze icerik")))).asOptional().orElseThrow();
        ScreeningResult freshScreening = screeningResult(502);
        RequestBinding freshBinding = new RequestBinding(
                requestKey(502), ScreeningSourceKind.TRANSCRIPT_SEGMENT, freshTr, 0);
        requireOk(screenings.saveIdempotent(
                screeningCommand(NEW_IV, freshScreening), freshBinding));
        // cross-tenant eski içerik — T1 purge'u dokunmamalı
        String otherTenantTr = transcripts.put(new Transcript(T2, OLD_IV, "i-old/rec-" + "c".repeat(64), "tr",
                List.of(new Transcript.Segment(0, "S1", 0, 900, "baska tenant")))).asOptional().orElseThrow();
        backdate("transcript", "transcript_key", otherTenantTr);

        String cutoff = java.time.OffsetDateTime.now(java.time.ZoneOffset.UTC).minusDays(365).toString();
        // tarayıcı yalnız eski + tenant-scoped bulur
        List<RetentionScanner.ExpiredContent> expired = scanner.scanExpired(T1, cutoff).asOptional().orElseThrow();
        assertEquals(1, expired.size(), "yalnız T1'in eski interview'ü");
        assertEquals(OLD_IV.value(), expired.get(0).interviewId().value());
        assertEquals(List.of(oldScreening.findingSetRef().value()),
                expired.get(0).screeningFindingSetRefs());

        InMemoryEventSink sink = new InMemoryEventSink();
        InMemoryReviewCaseStore reviewStore = new InMemoryReviewCaseStore();
        PostgresConsentStore consents = new PostgresConsentStore(ds);
        DsrService service = new DsrService(
                new InMemoryDsarStore(), (tenant, interview, key) ->
                        Outcome.fail(com.ats.kernel.OutcomeCode.NOT_CONFIGURED, "test-unused"),
                new PostgresErasureExecutionStore(ds), new InMemoryObjectStore(),
                transcripts, citations, artifacts,
                reviewStore, new HumanReviewService(new ConsentGate(consents, sink), reviewStore,
                        new PostgresEvidenceLedger(ds), sink), new PostgresScreeningEvidenceStore(ds),
                new PostgresEvidenceLedger(ds), sink, Clock.systemUTC());

        DsrService.PurgeReceipt receipt = service.purgeExpired(T1, OPERATOR, scanner, cutoff)
                .asOptional().orElseThrow();
        assertEquals(1, receipt.interviewCount());
        assertEquals(4, receipt.deletedContentCount());
        // eski silindi; taze + diğer tenant duruyor
        assertFalse(transcripts.find(T1, OLD_IV, oldTr).isOk());
        assertFalse(citations.find(T1, OLD_IV, oldCit).isOk());
        assertFalse(artifacts.find(T1, OLD_IV, oldArt).isOk());
        assertFalse(screenings.get(T1, oldScreening.findingSetRef()).isOk());
        Outcome<?> oldReplay = screenings.findRequest(T1, OLD_IV, oldBinding);
        assertFalse(oldReplay.isOk(), "retention sonrası aynı operation key evidence diriltememeli");
        assertTrue(transcripts.find(T1, NEW_IV, freshTr).isOk(), "taze içerik purge'dan etkilenmez");
        assertTrue(screenings.get(T1, freshScreening.findingSetRef()).isOk(),
                "taze screening evidence purge'dan etkilenmez");
        assertTrue(screenings.findRequest(T1, NEW_IV, freshBinding).isOk(),
                "taze request binding aktif kalmalı");
        assertTrue(transcripts.find(T2, OLD_IV, otherTenantTr).isOk(), "cross-tenant içerik dokunulmaz");
        assertTrue(sink.emitted().stream().anyMatch(e ->
                e.eventTypeId().equals("privacy.retention.purged")
                        && "retention_expired".equals(e.extras().get("reason_code"))));
        // idempotent yeniden-koşu: artık süresi dolan yok → no-op receipt
        DsrService.PurgeReceipt rerun = service.purgeExpired(T1, OPERATOR, scanner, cutoff)
                .asOptional().orElseThrow();
        assertEquals(0, rerun.interviewCount());
        assertEquals(0, rerun.deletedContentCount());
    }

    @Test
    void invalid_cutoff_and_blank_args_fail_closed() {
        assertFalse(scanner.scanExpired(T1, "dun aksam").isOk(), "ISO-8601 olmayan cutoff reddedilir");
        assertFalse(scanner.scanExpired(T1, " ").isOk());
        InMemoryEventSink sink = new InMemoryEventSink();
        InMemoryReviewCaseStore rs = new InMemoryReviewCaseStore();
        DsrService service = new DsrService(
                new InMemoryDsarStore(), (tenant, interview, key) ->
                        Outcome.fail(com.ats.kernel.OutcomeCode.NOT_CONFIGURED, "test-unused"),
                new PostgresErasureExecutionStore(ds), new InMemoryObjectStore(),
                transcripts, citations, artifacts,
                rs, new HumanReviewService(new ConsentGate(new PostgresConsentStore(ds), sink), rs,
                        new PostgresEvidenceLedger(ds), sink), new PostgresScreeningEvidenceStore(ds),
                new PostgresEvidenceLedger(ds), sink, Clock.systemUTC());
        Outcome<DsrService.PurgeReceipt> out = service.purgeExpired(T1, OPERATOR, null, "2026-07-02T00:00:00Z");
        assertFalse(out.isOk(), "scanner null fail-closed");
    }

    @Test
    void dsar_execute_erasure_purges_real_screening_store_and_keeps_terminal_replay_sentinel() {
        TenantId tenant = new TenantId("screening-dsar-tenant");
        InterviewId interview = new InterviewId("i-screening-dsar");
        ActorId dpo = new ActorId("dpo-screening-opaque");
        PostgresScreeningEvidenceStore screenings = new PostgresScreeningEvidenceStore(ds);
        ScreeningResult result = screeningResult(503);
        RequestBinding binding = new RequestBinding(
                requestKey(503), ScreeningSourceKind.TRANSCRIPT_SEGMENT,
                "i-screening-dsar/tr-source-503", 0);
        requireOk(screenings.saveIdempotent(new SaveCommand(
                tenant, dpo, interview, result, ScreeningSourceKind.TRANSCRIPT_SEGMENT,
                "2026-07-15T08:00:00Z"), binding));

        InMemoryDsarStore dsars = new InMemoryDsarStore();
        InMemoryEventSink sink = new InMemoryEventSink();
        InMemoryReviewCaseStore reviews = new InMemoryReviewCaseStore();
        DsrService service = new DsrService(
                dsars, new PostgresErasureScopeResolver(ds),
                new PostgresErasureExecutionStore(ds), new InMemoryObjectStore(),
                new InMemoryTranscriptStore(), new InMemoryCitationStore(),
                new InMemoryExportArtifactStore(), reviews,
                new HumanReviewService(
                        new ConsentGate(new InMemoryConsentStore(), sink), reviews,
                        new PostgresEvidenceLedger(ds), sink),
                screenings, new PostgresEvidenceLedger(ds), sink, Clock.systemUTC());
        String dsarKey = service.receiveDsar(
                tenant, interview, "subject-opaque-503", "DATA_SUBJECT_ERASURE")
                .asOptional().orElseThrow();

        DsrService.ErasureReceipt receipt = service.executeErasure(
                tenant, dpo, interview, dsarKey)
                .asOptional().orElseThrow().receipt();

        assertEquals(1, receipt.tombstoneCount());
        assertEquals(1, receipt.deletedContentCount());
        assertFalse(screenings.get(tenant, result.findingSetRef()).isOk());
        assertEquals(PurgeTargetState.PURGED,
                screenings.inspectPurgeTarget(tenant, interview, result.findingSetRef())
                        .asOptional().orElseThrow());
        assertFalse(screenings.findRequest(tenant, interview, binding).isOk(),
                "DSAR sonrası aynı operation key evidence diriltememeli");
        assertEquals(DsarRequest.State.FULFILLED,
                dsars.find(tenant, interview, dsarKey).asOptional().orElseThrow().state());
    }

    private static SaveCommand screeningCommand(InterviewId interviewId, ScreeningResult result) {
        return new SaveCommand(
                T1, OPERATOR, interviewId, result, ScreeningSourceKind.TRANSCRIPT_SEGMENT,
                "2026-07-15T08:00:00Z");
    }

    private static ScreeningResult screeningResult(int seed) {
        return new ScreeningResult(
                new ScreeningRunId(
                        "psr_00000000-0000-4000-8000-" + String.format("%012x", seed)),
                new ScreeningPolicyRef("paspolicy_v1"), Coverage.SUPPORTED, List.of(),
                new FindingSetRef("fsr_" + String.format("%064x", seed)));
    }

    private static String requestKey(int seed) {
        return "scrq_00000000-0000-4000-8000-" + String.format("%012x", seed);
    }

    private static <T> T requireOk(Outcome<T> outcome) {
        if (outcome instanceof Outcome.Ok<T> ok) {
            return ok.value();
        }
        Outcome.Fail<T> fail = (Outcome.Fail<T>) outcome;
        throw new AssertionError("Outcome başarısız: " + fail.code() + " / " + fail.reason());
    }
}
