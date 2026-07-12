package com.ats.persistence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.consent.ConsentGate;
import com.ats.consent.RecordingPermission;
import com.ats.consent.RecordingPermission.PermissionState;
import com.ats.contracts.AIProvider;
import com.ats.contracts.AIProvider.Entailment;
import com.ats.contracts.governance.Capability;
import com.ats.contracts.governance.ModelApprovalRef;
import com.ats.contracts.governance.ModelGovernanceGate;
import com.ats.contracts.governance.ModelGovernanceJournal;
import com.ats.contracts.governance.ModelInvocationId;
import com.ats.dsr.DsarRequest;
import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import com.ats.ops.InMemoryEventSink;
import com.ats.orchestration.Citation;
import com.ats.orchestration.CitationService;
import com.ats.orchestration.Transcript;
import com.ats.review.HumanReviewService;
import com.ats.review.ReviewCase;
import com.ats.review.ReviewCaseStore;
import com.ats.review.ReviewState;
import java.util.List;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.postgresql.ds.PGSimpleDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * ATS-0018 slice-8b — 6 store PG adapter'ının GERÇEK-DB davranış testleri + orkestrasyon
 * PG-smoke'u (in-memory fixture'larla davranış paritesi). "Prod'da çalışıyor" iddiası değildir.
 */
@Testcontainers
class PostgresStoresTest {

    @Container
    private static final PostgreSQLContainer<?> PG = new PostgreSQLContainer<>("postgres:16-alpine");

    private static PGSimpleDataSource ds;
    private static PostgresTranscriptStore transcripts;
    private static PostgresCitationStore citations;
    private static PostgresReviewCaseStore cases;
    private static PostgresDsarStore dsars;
    private static PostgresExportArtifactStore artifacts;
    private static PostgresConsentStore consents;

    private static final TenantId T1 = new TenantId("t1");
    private static final TenantId T2 = new TenantId("t2");
    private static final InterviewId I1 = new InterviewId("i1");
    private static final ActorId HUMAN = new ActorId("human-opaque-1");

    @BeforeAll
    static void migrate() {
        ds = new PGSimpleDataSource();
        ds.setUrl(PG.getJdbcUrl());
        ds.setUser(PG.getUsername());
        ds.setPassword(PG.getPassword());
        Flyway.configure().dataSource(ds).load().migrate();
        transcripts = new PostgresTranscriptStore(ds);
        citations = new PostgresCitationStore(ds);
        cases = new PostgresReviewCaseStore(ds);
        dsars = new PostgresDsarStore(ds);
        artifacts = new PostgresExportArtifactStore(ds);
        consents = new PostgresConsentStore(ds);
    }

    private static Transcript sampleTranscript() {
        return new Transcript(T1, I1, "i1/rec-" + "a".repeat(64), "tr", List.of(
                new Transcript.Segment(0, "S1", 0, 900, "Merhaba, hoş geldiniz"),
                new Transcript.Segment(1, "S2", 900, 2000, "Teşekkürler")));
    }

    @Test
    void transcript_roundtrip_tenant_isolation_and_idempotent_delete() {
        String key = transcripts.put(sampleTranscript()).asOptional().orElseThrow();
        Transcript found = transcripts.find(T1, I1, key).asOptional().orElseThrow();
        assertEquals(2, found.segments().size());
        assertEquals("S1", found.segments().get(0).speakerLabel());
        assertEquals("Merhaba, hoş geldiniz", found.segments().get(0).text());
        assertEquals(900, found.segments().get(0).endMs());
        assertFalse(transcripts.find(T2, I1, key).isOk(), "cross-tenant NOT_FOUND");
        assertTrue(transcripts.delete(T1, key).isOk());
        assertFalse(transcripts.find(T1, I1, key).isOk(), "silindikten sonra NOT_FOUND");
        assertTrue(transcripts.delete(T1, key).isOk(), "delete idempotent");
    }

    @Test
    void transcript_list_by_interview_is_tenant_scoped_and_pointer_only() {
        InterviewId iv = new InterviewId("iv-list-1");
        Transcript a = new Transcript(T1, iv, "i1/rec-" + "b".repeat(64), "tr", List.of(
                new Transcript.Segment(0, "S1", 0, 500, "Birinci")));
        Transcript b = new Transcript(T1, iv, "i1/rec-" + "c".repeat(64), "tr", List.of(
                new Transcript.Segment(0, "S1", 0, 500, "Ikinci"),
                new Transcript.Segment(1, "S2", 500, 900, "Devam")));
        String keyA = transcripts.put(a).asOptional().orElseThrow();
        String keyB = transcripts.put(b).asOptional().orElseThrow();

        var listed = transcripts.listByInterview(T1, iv).asOptional().orElseThrow();
        assertEquals(2, listed.size());
        assertTrue(listed.stream().anyMatch(x -> x.transcriptKey().equals(keyA) && x.segmentCount() == 1));
        assertTrue(listed.stream().anyMatch(x -> x.transcriptKey().equals(keyB) && x.segmentCount() == 2));
        assertTrue(listed.stream().allMatch(x -> x.language().equals("tr")));

        // pointer-only: özet content (segment metni) taşımaz — record'da alan yok (derleme garantisi)
        // tenant izolasyonu: yabancı tenant BOŞ liste görür (404 değil — varlık sızdırmaz)
        assertEquals(0, transcripts.listByInterview(T2, iv).asOptional().orElseThrow().size());
        // bilinmeyen mülakat: boş liste
        assertEquals(0, transcripts.listByInterview(T1, new InterviewId("iv-yok")).asOptional().orElseThrow().size());
    }

    @Test
    void review_case_list_by_interview_is_tenant_scoped_and_pointer_only() {
        InterviewId iv = new InterviewId("iv-case-list-1");
        ReviewCase base = new ReviewCase(T1, iv, ReviewState.AI_SUGGESTED,
                List.of("cit-1"), "ai-v1", null, null, null, null, null, null, null);
        String keyA = cases.put(base).asOptional().orElseThrow();
        String keyB = cases.put(base.with(ReviewState.HUMAN_REVIEWING)).asOptional().orElseThrow();

        var listed = cases.listByInterview(T1, iv).asOptional().orElseThrow();
        assertEquals(2, listed.size());
        assertTrue(listed.stream().anyMatch(x -> x.caseKey().equals(keyA) && x.state() == ReviewState.AI_SUGGESTED));
        assertTrue(listed.stream().anyMatch(x -> x.caseKey().equals(keyB) && x.state() == ReviewState.HUMAN_REVIEWING));

        // tenant izolasyonu: yabancı tenant BOŞ liste (varlık sızdırmaz); bilinmeyen mülakat boş
        assertEquals(0, cases.listByInterview(T2, iv).asOptional().orElseThrow().size());
        assertEquals(0, cases.listByInterview(T1, new InterviewId("iv-case-yok")).asOptional().orElseThrow().size());
    }

    @Test
    void citation_roundtrip_preserves_claim_text_in_deletable_plane() {
        String trKey = transcripts.put(sampleTranscript()).asOptional().orElseThrow();
        String key = citations.put(new Citation(T1, I1, trKey, "Aday bes yil calisti",
                List.of(0, 1), Entailment.SUPPORTED)).asOptional().orElseThrow();
        Citation found = citations.find(T1, I1, key).asOptional().orElseThrow();
        assertEquals("Aday bes yil calisti", found.claim());
        assertEquals(List.of(0, 1), found.segmentIndexes());
        assertEquals(Entailment.SUPPORTED, found.entailment());
        assertFalse(citations.find(T2, I1, key).isOk());
        assertTrue(citations.delete(T1, key).isOk());
        assertFalse(citations.find(T1, I1, key).isOk());
    }

    @Test
    void review_case_cas_transition_matrix_and_concurrency() throws Exception {
        // 39d-11 CAS matrisi (Codex şartları)
        ReviewCase fin = new ReviewCase(T1, I1, ReviewState.FINALIZED,
                List.of("ev-1"), "ai-v1", "h-1", "role-1", "cs-1", "rat-1", "karar-1", null, null);
        String k1 = cases.put(fin).asOptional().orElseThrow();
        assertEquals(ReviewCaseStore.ExportTransitionResult.TRANSITIONED,
                cases.markExportedIfFinalized(T1, I1, k1, "art-A").asOptional().orElseThrow());
        assertEquals(ReviewCaseStore.ExportTransitionResult.ALREADY_EXPORTED_SAME_ARTIFACT,
                cases.markExportedIfFinalized(T1, I1, k1, "art-A").asOptional().orElseThrow(),
                "aynı ref ikinci çağrı idempotent");
        assertEquals(ReviewCaseStore.ExportTransitionResult.INTEGRITY_CONFLICT,
                cases.markExportedIfFinalized(T1, I1, k1, "art-B").asOptional().orElseThrow(),
                "farklı ref kazananı overwrite EDEMEZ");
        ReviewCase after = cases.find(T1, I1, k1).asOptional().orElseThrow();
        assertEquals(ReviewState.EXPORTED, after.state());
        assertEquals("art-A", after.exportArtifactRef());
        // OPEN state → fail-closed INVALID
        ReviewCase open = new ReviewCase(T1, I1, ReviewState.AI_SUGGESTED,
                List.of("ev-2"), "ai-v1", null, null, null, null, null, null, null);
        String k2 = cases.put(open).asOptional().orElseThrow();
        Outcome<ReviewCaseStore.ExportTransitionResult> bad =
                cases.markExportedIfFinalized(T1, I1, k2, "art-X");
        assertTrue(bad instanceof Outcome.Fail<ReviewCaseStore.ExportTransitionResult> f
                && f.code() == OutcomeCode.INVALID);
        // vaka yok → NOT_FOUND
        Outcome<ReviewCaseStore.ExportTransitionResult> missing =
                cases.markExportedIfFinalized(T1, I1, "i1/case-yok", "art-X");
        assertTrue(missing instanceof Outcome.Fail<ReviewCaseStore.ExportTransitionResult> f2
                && f2.code() == OutcomeCode.NOT_FOUND);

        // Eşzamanlılık: aynı ref ile iki thread → TRANSITIONED + ALREADY (tek güncelleme)
        ReviewCase fin2 = new ReviewCase(T1, I1, ReviewState.FINALIZED,
                List.of("ev-3"), "ai-v1", "h-1", "role-1", "cs-1", "rat-1", "karar-1", null, null);
        String k3 = cases.put(fin2).asOptional().orElseThrow();
        var pool = java.util.concurrent.Executors.newFixedThreadPool(2);
        var gate = new java.util.concurrent.CountDownLatch(1);
        java.util.concurrent.Callable<ReviewCaseStore.ExportTransitionResult> job = () -> {
            gate.await();
            return cases.markExportedIfFinalized(T1, I1, k3, "art-C").asOptional().orElseThrow();
        };
        var f1 = pool.submit(job);
        var f2c = pool.submit(job);
        gate.countDown();
        var results = java.util.List.of(f1.get(), f2c.get());
        pool.shutdown();
        assertTrue(results.contains(ReviewCaseStore.ExportTransitionResult.TRANSITIONED));
        assertTrue(results.contains(ReviewCaseStore.ExportTransitionResult.ALREADY_EXPORTED_SAME_ARTIFACT));
        assertEquals("art-C", cases.find(T1, I1, k3).asOptional().orElseThrow().exportArtifactRef());
    }

    @Test
    void review_case_full_field_roundtrip_and_save_notfound() {
        ReviewCase rc = new ReviewCase(T1, I1, ReviewState.AI_SUGGESTED,
                List.of("cit-ref-1"), "aiout-v1", null, null, null, null, null, null, null);
        String key = cases.put(rc).asOptional().orElseThrow();
        ReviewCase loaded = cases.find(T1, I1, key).asOptional().orElseThrow();
        assertEquals(ReviewState.AI_SUGGESTED, loaded.state());
        assertEquals(List.of("cit-ref-1"), loaded.sourceEvidenceRefs());
        ReviewCase updated = loaded.withHumanActor("human-1", "role-1").with(ReviewState.HUMAN_REVIEWING);
        assertTrue(cases.save(T1, key, updated).isOk());
        ReviewCase reloaded = cases.find(T1, I1, key).asOptional().orElseThrow();
        assertEquals(ReviewState.HUMAN_REVIEWING, reloaded.state());
        assertEquals("human-1", reloaded.humanActorRef());
        assertEquals("role-1", reloaded.oversightRoleRef());
        Outcome<Void> ghost = cases.save(T1, "i1/case-yok", updated);
        assertFalse(ghost.isOk(), "olmayan vaka save NOT_FOUND");
        assertFalse(cases.find(T2, I1, key).isOk(), "cross-tenant NOT_FOUND");
    }

    @Test
    void dsar_roundtrip_and_state_update() {
        String key = dsars.put(new DsarRequest(T1, I1, "subj-opaque", "erasure_request",
                DsarRequest.State.RECEIVED)).asOptional().orElseThrow();
        DsarRequest found = dsars.find(T1, I1, key).asOptional().orElseThrow();
        assertEquals(DsarRequest.State.RECEIVED, found.state());
        assertTrue(dsars.save(T1, key, found.fulfilled()).isOk());
        assertEquals(DsarRequest.State.FULFILLED, dsars.find(T1, I1, key).asOptional().orElseThrow().state());
        assertFalse(dsars.find(T2, I1, key).isOk());
    }

    @Test
    void export_artifact_roundtrip_and_delete() {
        String key = artifacts.put(T1, I1, "{\"schema_version\":\"evidence-packet/v1\"}").asOptional().orElseThrow();
        assertTrue(artifacts.find(T1, I1, key).asOptional().orElseThrow().contains("evidence-packet/v1"));
        assertFalse(artifacts.find(T2, I1, key).isOk());
        assertTrue(artifacts.delete(T1, key).isOk());
        assertFalse(artifacts.find(T1, I1, key).isOk());
    }

    @Test
    void consent_upsert_transitions_state() {
        InterviewId iv = new InterviewId("i-consent");
        assertTrue(consents.put(new RecordingPermission(T1, iv, "subj", PermissionState.GRANTED,
                "2026-07-02T00:00:00Z")).isOk());
        assertEquals(PermissionState.GRANTED, consents.find(T1, iv).asOptional().orElseThrow().state());
        assertTrue(consents.put(new RecordingPermission(T1, iv, "subj", PermissionState.WITHDRAWN,
                "2026-07-02T01:00:00Z")).isOk(), "UPSERT: aynı (tenant,interview) state geçişi");
        assertEquals(PermissionState.WITHDRAWN, consents.find(T1, iv).asOptional().orElseThrow().state());
        assertFalse(consents.find(T2, iv).isOk(), "cross-tenant NOT_FOUND");
    }

    @Test
    void app_role_privilege_matrix_content_deletable_state_not() throws java.sql.SQLException {
        String trKey = transcripts.put(sampleTranscript()).asOptional().orElseThrow();
        String caseKey = cases.put(new ReviewCase(T1, I1, ReviewState.AI_SUGGESTED,
                List.of("r"), "v", null, null, null, null, null, null, null)).asOptional().orElseThrow();
        try (java.sql.Connection c = ds.getConnection(); java.sql.Statement st = c.createStatement()) {
            st.execute("SET ROLE ats_app");
            // content-plane: DELETE İZİNLİ
            st.execute("DELETE FROM transcript WHERE tenant_id = 't1' AND transcript_key = '"
                    + trKey.replace("'", "''") + "'");
            // state tablosu: DELETE YASAK (grant yok) — state-machine korunur
            org.junit.jupiter.api.Assertions.assertThrows(java.sql.SQLException.class,
                    () -> st.execute("DELETE FROM review_case WHERE tenant_id = 't1'"),
                    "state tablosunda app-role DELETE edemez");
            st.execute("RESET ROLE");
        }
        assertTrue(cases.find(T1, I1, caseKey).isOk(), "state satırı duruyor");
    }

    /**
     * PG-smoke için allow-all model-governance kapısı: governance semantiği burada test EDİLMEZ
     * (adapter + orkestrasyon testlerinin işi); bu yalnız PG store round-trip'ini çalıştırmak için
     * gate constructor-param'ını karşılar.
     */
    private static ModelGovernanceGate allowAllGate() {
        ModelApprovalRef ref = new ModelApprovalRef("mapr_" + "0".repeat(64));
        return new ModelGovernanceGate() {
            @Override
            public Outcome<Permit> preflight(Capability capability) {
                return Outcome.ok(new Permit(capability, ref, "prov", "model", "v1", "ep", "ip1"));
            }

            @Override
            public Outcome<Decision> verify(Permit permit, AIProvider.ReportedModelIdentity reported) {
                return Outcome.ok(Decision.allow(permit.approvalRef(), permit.capability(), "model", "v1"));
            }
        };
    }

    /**
     * PG-smoke için no-op invocation-journal: gov1-1d journal semantiği burada test EDİLMEZ (adapter +
     * orkestrasyon testlerinin işi); bu yalnız CitationService constructor-param'ını karşılar.
     */
    private static ModelGovernanceJournal noopJournal() {
        return new ModelGovernanceJournal() {
            @Override
            public Outcome<JournalReceipt> recordAuthorized(InvocationContext ctx, ModelInvocationId id, ModelGovernanceGate.Permit permit) {
                return Outcome.ok(new JournalReceipt("journal-smoke-auth"));
            }

            @Override
            public Outcome<JournalReceipt> recordTerminal(InvocationContext ctx, ModelInvocationId id, Terminal terminal) {
                return Outcome.ok(new JournalReceipt("journal-smoke-term"));
            }
        };
    }

    /** Orkestrasyon PG-smoke: CitationService, TAMAMEN PG store'lar + PG WORM ledger ile uçtan uca. */
    @Test
    void citation_service_end_to_end_on_postgres_stores() {
        InterviewId iv = new InterviewId("i-smoke");
        InMemoryEventSink sink = new InMemoryEventSink();
        PostgresEvidenceLedger ledger = new PostgresEvidenceLedger(ds);
        assertTrue(consents.put(new RecordingPermission(T1, iv, "subj", PermissionState.GRANTED,
                "2026-07-02T00:00:00Z")).isOk());
        String trKey = transcripts.put(new Transcript(T1, iv, "i-smoke/rec-" + "b".repeat(64), "tr", List.of(
                new Transcript.Segment(0, "S1", 0, 900, "Backend projesinde bes yil calistim"))))
                .asOptional().orElseThrow();
        AIProvider scripted = new AIProvider() {
            @Override
            public Outcome<TranscriptResult> transcribe(String audioRef) {
                return Outcome.fail(OutcomeCode.UNSUPPORTED_IN_GATE, "smoke dışı");
            }

            @Override
            public Outcome<CitationResult> cite(String claim, String transcriptRef) {
                return Outcome.ok(new CitationResult(claim, List.of("seg-0"), Entailment.SUPPORTED,
                        AIProvider.ReportedModelIdentity.notReported()));
            }
        };
        CitationService service = new CitationService(new ConsentGate(consents, sink), allowAllGate(), noopJournal(), scripted,
                transcripts, citations, ledger, sink);
        CitationService.CitationReceipt receipt = service
                .citeClaim(T1, HUMAN, iv, trKey, "Aday backend'de bes yil calisti", "2026-07-02T12:00:00Z")
                .asOptional().orElseThrow();
        assertEquals(Entailment.SUPPORTED, receipt.entailment());
        // citation PG'de; ledger entry PG WORM'da; claim metni ledger payload'ında YOK
        assertTrue(citations.find(T1, iv, receipt.citationKey()).isOk());
        var entry = ledger.getById(T1, new com.ats.kernel.Ids.EvidenceId(receipt.evidenceId())).asOptional().orElseThrow();
        assertFalse(entry.payload().values().toString().contains("bes yil"),
                "two-plane: claim metni PG WORM payload'ına sızamaz");
        assertTrue(ledger.verifyChain(T1).isOk());
    }
}
