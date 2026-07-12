package com.ats.export;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.consent.ConsentGate;
import com.ats.consent.InMemoryConsentStore;
import com.ats.consent.RecordingPermission;
import com.ats.consent.RecordingPermission.PermissionState;
import com.ats.contracts.AIProvider.Entailment;
import com.ats.contracts.EvidenceLedger;
import com.ats.export.ExportContext.CriterionRef;
import com.ats.export.ExportService.ExportReceipt;
import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.EvidenceId;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.JsonValue;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import com.ats.ops.InMemoryEventSink;
import com.ats.orchestration.Citation;
import com.ats.orchestration.InMemoryCitationStore;
import com.ats.review.HumanReviewService;
import com.ats.review.InMemoryReviewCaseStore;
import com.ats.review.ReviewCase;
import com.ats.review.ReviewCaseStore;
import com.ats.review.ReviewState;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class ExportServiceTest {

    private static final TenantId T1 = new TenantId("t1");
    private static final TenantId T2 = new TenantId("t2");
    private static final ActorId HUMAN = new ActorId("human-opaque-1");
    private static final InterviewId I1 = new InterviewId("i1");
    // SENTETİK, ayırt edici claim metni — LEAK-SCAN bunun packet'e sızmadığını doğrular
    private static final String CLAIM_TEXT = "Aday bes yil boyunca dagitik sistem gelistirdigini anlatti LEAKCANARY";

    private InMemoryConsentStore consentStore;
    private InMemoryEventSink sink;
    private InMemoryReviewCaseStore reviewStore;
    private InMemoryCitationStore citationStore;
    private InMemoryExportArtifactStore artifactStore;
    private FakeLedger ledger;
    private HumanReviewService humanReview;
    private ExportService service;
    private String caseKey;
    private String citationKey;

    static final class FakeLedger implements EvidenceLedger {
        final List<LedgerEntry> entries = new ArrayList<>();
        boolean failAppend = false;

        @Override
        public Outcome<LedgerEntry> append(EvidenceEvent e) {
            if (failAppend) {
                return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "ledger unavailable (test)");
            }
            long seq = entries.size() + 1;
            LedgerEntry entry = new LedgerEntry(e.tenantId(), e.actorId(), e.interviewId(), e.eventType(),
                    e.occurredAt(), e.idempotencyKey(), e.contentHash(), e.payload(),
                    new EvidenceId("fake-ev-" + seq), seq, "fake-prev", "fake-hash-" + seq);
            entries.add(entry);
            return Outcome.ok(entry);
        }

        @Override
        public Outcome<LedgerEntry> appendTombstoneEvent(TenantId t, ActorId a, InterviewId i, EvidenceId target, String reason) {
            return Outcome.fail(OutcomeCode.UNSUPPORTED_IN_GATE, "slice dışı");
        }

        @Override
        public Outcome<LedgerEntry> getById(TenantId t, EvidenceId id) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "yok");
        }

        @Override
        public Outcome<List<LedgerEntry>> list(TenantId t, LedgerListFilter f) {
            return Outcome.ok(List.copyOf(entries));
        }
    }

    @BeforeEach
    void setUp() {
        consentStore = new InMemoryConsentStore();
        sink = new InMemoryEventSink();
        reviewStore = new InMemoryReviewCaseStore();
        citationStore = new InMemoryCitationStore();
        artifactStore = new InMemoryExportArtifactStore();
        ledger = new FakeLedger();
        humanReview = new HumanReviewService(new ConsentGate(consentStore, sink), reviewStore, ledger, sink);
        service = new ExportService(reviewStore, citationStore, artifactStore, humanReview, ledger, sink);
        consentStore.put(new RecordingPermission(T1, I1, "subj-opaque", PermissionState.GRANTED, "2026-07-02T00:00:00Z"));

        citationKey = citationStore.put(new Citation(T1, I1, "i1/tr-1", CLAIM_TEXT, List.of(0, 2), Entailment.SUPPORTED))
                .asOptional().orElseThrow();
        // karar-kanıtı ref'i = export edilecek claim (manifest: source_evidence_refs ⊆ claims)
        caseKey = humanReview.open(T1, I1, List.of(citationKey), "aiout-v1").asOptional().orElseThrow();
        humanReview.startReview(T1, I1, caseKey, "human-opaque-1", "role-hiring-panel").asOptional();
        humanReview.recordEdit(T1, new com.ats.kernel.Ids.ActorId("human-opaque-1"), I1, caseKey, "cs-ref").asOptional();
        humanReview.recordRationale(T1, new com.ats.kernel.Ids.ActorId("human-opaque-1"), I1, caseKey, "rat-ref").asOptional();
        humanReview.finalizeDecision(T1, HUMAN, I1, caseKey, "karar-sonuc-a", "2026-07-02T13:00:00Z").asOptional().orElseThrow();
        ledger.entries.clear(); // finalize kaydını temizle — export ledger davranışını izole test et
    }

    private ExportContext ctx() {
        return new ExportContext(
                "gen-v1", "tr-TR", "Europe/Istanbul", "disclosure-ai-assist-v1",
                List.of("consent-cand-01", "consent-interviewer-01"),
                "rubric-v1", List.of(new CriterionRef("c-comm", "jr-comm-v1")),
                Map.of(citationKey, "c-comm"),
                List.of("ledger-entry-501"),
                "redaction-policy-v1", "redaction-run-77", "retention-policy-t1",
                "0".repeat(64), "sig-01");
    }

    private Outcome<ExportService.ExportPacketResult> exportResult() {
        return service.exportPacket(T1, HUMAN, I1, caseKey, List.of(citationKey), ctx(), "2026-07-02T14:00:00Z");
    }

    /** Eski testlerin makbuz-görünümü: fail'i AYNEN taşır, başarıyı receipt'e indirger. */
    private Outcome<ExportReceipt> export() {
        Outcome<ExportService.ExportPacketResult> out = exportResult();
        if (out instanceof Outcome.Fail<ExportService.ExportPacketResult> f) {
            return Outcome.fail(f.code(), f.reason());
        }
        return Outcome.ok(((Outcome.Ok<ExportService.ExportPacketResult>) out).value().receipt());
    }

    @Test
    void happy_path_exports_pointer_only_packet_and_transitions_case() {
        ExportReceipt receipt = export().asOptional().orElseThrow();
        assertEquals(1, receipt.claimCount());
        assertEquals(ReviewState.EXPORTED,
                reviewStore.find(T1, I1, caseKey).asOptional().orElseThrow().state());
        String packet = artifactStore.find(T1, I1, receipt.artifactKey()).asOptional().orElseThrow();
        for (String required : new String[] {"schema_version", "evidence-packet/v1", "human_decision",
                "unsupported_claim_policy", "excluded_raw_content", "packet_digest", "claims",
                "job_relatedness_rationale_ref", "consent_refs", "worm_chain_refs"}) {
            assertTrue(packet.contains(required), "packet zorunlu alan taşımalı: " + required);
        }
        assertEquals(1, ledger.entries.size());
        assertEquals("evidence_packet.exported", ledger.entries.get(0).eventType());
        assertTrue(sink.emitted().stream().anyMatch(e ->
                e.eventTypeId().equals(ExportService.EXPORT_GENERATED_EVENT)
                        && HUMAN.value().equals(e.extras().get("actor_ref"))));
        // schema $defs.ref pattern: slash'lı internal store anahtarı packet'e SIZAMAZ (refSafe '.'-map)
        assertFalse(packet.contains("i1/cit"), "slash'lı internal key packet'e giremez (ref-pattern)");
        assertTrue(packet.contains(ExportService.refSafe(citationKey)), "claim_id = refSafe(citation_key)");
        assertTrue(packet.contains("pkt-" + ExportService.refSafe(caseKey)));
    }

    @Test
    void decision_evidence_must_be_subset_of_exported_claims() {
        String orphanCase = humanReview.open(T1, I1, List.of("baska-kanit-ref"), "aiout-v1").asOptional().orElseThrow();
        humanReview.startReview(T1, I1, orphanCase, "human-opaque-1", "role-1").asOptional();
        humanReview.recordEdit(T1, new com.ats.kernel.Ids.ActorId("human-opaque-1"), I1, orphanCase, "cs").asOptional();
        humanReview.recordRationale(T1, new com.ats.kernel.Ids.ActorId("human-opaque-1"), I1, orphanCase, "rat").asOptional();
        humanReview.finalizeDecision(T1, HUMAN, I1, orphanCase, "karar-sonuc-a", "2026-07-02T13:00:00Z").asOptional().orElseThrow();
        ledger.entries.clear();
        Outcome<ExportService.ExportPacketResult> out = service.exportPacket(T1, HUMAN, I1, orphanCase, List.of(citationKey), ctx(), "2026-07-02T14:00:00Z");
        assertFalse(out.isOk(), "karar-kanıtı claims dışıysa export fail-closed (manifest cross-invariant)");
        assertTrue(ledger.entries.isEmpty());
    }

    @Test
    void unsupported_claim_cannot_ground_decision() {
        String unsupportedKey = citationStore.put(new Citation(T1, I1, "i1/tr-1", "desteklenmeyen iddia",
                List.of(1), Entailment.NOT_SUPPORTED)).asOptional().orElseThrow();
        String c2 = humanReview.open(T1, I1, List.of(unsupportedKey), "aiout-v1").asOptional().orElseThrow();
        humanReview.startReview(T1, I1, c2, "human-opaque-1", "role-1").asOptional();
        humanReview.recordEdit(T1, new com.ats.kernel.Ids.ActorId("human-opaque-1"), I1, c2, "cs").asOptional();
        humanReview.recordRationale(T1, new com.ats.kernel.Ids.ActorId("human-opaque-1"), I1, c2, "rat").asOptional();
        humanReview.finalizeDecision(T1, HUMAN, I1, c2, "karar-sonuc-a", "2026-07-02T13:00:00Z").asOptional().orElseThrow();
        ExportContext c = new ExportContext(
                "gen-v1", "tr-TR", "Europe/Istanbul", "disclosure-ai-assist-v1",
                List.of("consent-1"), "rubric-v1", List.of(new CriterionRef("c-comm", "jr-comm-v1")),
                Map.of(unsupportedKey, "c-comm"), List.of("ledger-entry-501"),
                "redaction-policy-v1", "redaction-run-77", "retention-policy-t1",
                "0".repeat(64), "sig-01");
        Outcome<ExportService.ExportPacketResult> out = service.exportPacket(T1, HUMAN, I1, c2, List.of(unsupportedKey), c, "2026-07-02T14:00:00Z");
        assertFalse(out.isOk(), "unsupported claim karar-kanıtı olamaz (flag-and-exclude-from-decision)");
    }

    @Test
    void slashy_context_ref_rejected_by_ref_pattern() {
        ExportContext slashy = new ExportContext(
                "gen-v1", "tr-TR", "Europe/Istanbul", "disclosure-ai-assist-v1",
                List.of("consent/with/slash"), "rubric-v1", List.of(new CriterionRef("c-comm", "jr-comm-v1")),
                Map.of(citationKey, "c-comm"), List.of("ledger-entry-501"),
                "redaction-policy-v1", "redaction-run-77", "retention-policy-t1",
                "0".repeat(64), "sig-01");
        assertFalse(service.exportPacket(T1, HUMAN, I1, caseKey, List.of(citationKey), slashy, "2026-07-02T14:00:00Z").isOk(),
                "schema ref-pattern ihlali fail-closed reddedilmeli");
    }

    @Test
    void claim_text_never_leaks_into_packet_or_ledger() {
        ExportReceipt receipt = export().asOptional().orElseThrow();
        String packet = artifactStore.find(T1, I1, receipt.artifactKey()).asOptional().orElseThrow();
        assertFalse(packet.contains("LEAKCANARY"), "claim METNİ packet'e sızamaz (pointer-only)");
        assertFalse(ledger.entries.get(0).payload().values().toString().contains("LEAKCANARY"),
                "claim METNİ ledger payload'a sızamaz");
    }

    @Test
    void only_finalized_cases_exportable_and_same_request_replays_without_side_effects() {
        String draft = humanReview.open(T1, I1, List.of("ev-x"), "aiout-v1").asOptional().orElseThrow();
        assertFalse(service.exportPacket(T1, HUMAN, I1, draft, List.of(citationKey), ctx(), "2026-07-02T14:00:00Z").isOk(),
                "AI_SUGGESTED export edilemez");
        ExportService.ExportPacketResult first = exportResult().asOptional().orElseThrow();
        assertEquals(ExportService.ExportDisposition.CREATED, first.disposition());
        // 39d-10: AYNI istek ikinci kez → REPLAYED; hiçbir yeni side-effect yok
        // ("tek ETKİLİ export" invariant'ı korunur — ikinci POST artık hata değil).
        ExportService.ExportPacketResult second = exportResult().asOptional().orElseThrow();
        assertEquals(ExportService.ExportDisposition.REPLAYED, second.disposition());
        assertEquals(first.receipt(), second.receipt(), "replay makbuzu birebir aynı");
        assertEquals(1, artifactStore.size(), "yeni artifact üretilmez");
        assertEquals(1, ledger.entries.size(), "yeni ledger satırı yazılmaz");
        assertTrue(sink.emitted().stream().anyMatch(e ->
                ExportService.REPLAYED_EVENT.equals(e.eventTypeId())
                        && first.receipt().artifactKey().equals(e.extras().get("target_ref"))),
                "replay audit sinyali: target_ref=artifactKey");
    }

    @Test
    void unknown_or_cross_tenant_citation_rejected() {
        assertFalse(service.exportPacket(T1, HUMAN, I1, caseKey, List.of("i1/cit-999"), ctx(), "2026-07-02T14:00:00Z").isOk());
        Outcome<ExportService.ExportPacketResult> cross = service.exportPacket(T2, HUMAN, I1, caseKey, List.of(citationKey), ctx(), "2026-07-02T14:00:00Z");
        assertFalse(cross.isOk(), "cross-tenant vaka/citation erişimi yapısal kapalı");
        assertTrue(ledger.entries.isEmpty());
    }

    @Test
    void criterion_binding_enforced() {
        ExportContext badMap = new ExportContext(
                "gen-v1", "tr-TR", "Europe/Istanbul", "disclosure-ai-assist-v1",
                List.of("consent-cand-01"), "rubric-v1",
                List.of(new CriterionRef("c-comm", "jr-comm-v1")),
                Map.of(citationKey, "c-YOK"),
                List.of("ledger-entry-501"),
                "redaction-policy-v1", "redaction-run-77", "retention-policy-t1",
                "0".repeat(64), "sig-01");
        assertFalse(service.exportPacket(T1, HUMAN, I1, caseKey, List.of(citationKey), badMap, "2026-07-02T14:00:00Z").isOk(),
                "rubric kriterine bağlanamayan claim export'u düşürmeli (iş-ilişkililik zinciri)");
    }

    @Test
    void context_pointer_requirements_enforced() {
        ExportContext emptyConsent = new ExportContext(
                "gen-v1", "tr-TR", "Europe/Istanbul", "disclosure-ai-assist-v1",
                List.of(), "rubric-v1", List.of(new CriterionRef("c-comm", "jr-comm-v1")),
                Map.of(citationKey, "c-comm"), List.of("ledger-entry-501"),
                "redaction-policy-v1", "redaction-run-77", "retention-policy-t1",
                "0".repeat(64), "sig-01");
        assertFalse(service.exportPacket(T1, HUMAN, I1, caseKey, List.of(citationKey), emptyConsent, "2026-07-02T14:00:00Z").isOk(),
                "consent_refs boşsa packet üretilmez");
        ExportContext badDigest = new ExportContext(
                "gen-v1", "tr-TR", "Europe/Istanbul", "disclosure-ai-assist-v1",
                List.of("consent-1"), "rubric-v1", List.of(new CriterionRef("c-comm", "jr-comm-v1")),
                Map.of(citationKey, "c-comm"), List.of("ledger-entry-501"),
                "redaction-policy-v1", "redaction-run-77", "retention-policy-t1",
                "XYZ", "sig-01");
        assertFalse(service.exportPacket(T1, HUMAN, I1, caseKey, List.of(citationKey), badDigest, "2026-07-02T14:00:00Z").isOk());
        assertFalse(service.exportPacket(T1, HUMAN, I1, caseKey, List.of(), ctx(), "2026-07-02T14:00:00Z").isOk(),
                "kanıtsız (citation'sız) packet üretilmez");
    }

    @Test
    void ledger_failure_rolls_back_artifact_and_case_stays_finalized() {
        ledger.failAppend = true;
        Outcome<ExportReceipt> out = export();
        assertFalse(out.isOk());
        assertEquals(0, artifactStore.size(), "fail-closed telafi: kanıtsız artifact kalmamalı");
        assertEquals(ReviewState.FINALIZED,
                reviewStore.find(T1, I1, caseKey).asOptional().orElseThrow().state(),
                "ledger-fail'de EXPORTED geçişi YAPILMAMIŞ olmalı (terminal geri alınamaz)");
        assertTrue(sink.emitted().stream().anyMatch(e ->
                e.eventTypeId().equals(ExportService.APPEND_FAILED_EVENT)
                        && "ledger_unavailable".equals(e.extras().get("reason_code"))));
    }

    @Test
    void packet_digest_is_deterministic_and_bound_to_ledger() {
        ExportReceipt receipt = export().asOptional().orElseThrow();
        assertEquals(receipt.packetDigest(), ledger.entries.get(0).contentHash(),
                "ledger contentHash = packet_digest (bütünlük bağı)");
        assertTrue(receipt.packetDigest().matches("[0-9a-f]{64}"));
    }

    @Test
    void forbidden_key_scanner_fail_closed_unit() {
        JsonValue bad = JsonValue.object(Map.of(
                "claims", new JsonValue.JsonArray(List.of(JsonValue.object(Map.of(
                        "overall_score", JsonValue.of(4.5)))))));
        assertEquals("overall_score", PacketJson.forbiddenKey(bad),
                "skor/affect anahtarları derin taramada yakalanmalı");
        assertEquals(null, PacketJson.forbiddenKey(JsonValue.object(Map.of("claim_id", JsonValue.of("x")))));
    }

    @Test
    void not_supported_maps_to_schema_unsupported_enum() {
        String notSupKey = citationStore.put(new Citation(T1, I1, "i1/tr-1", "desteklenmeyen ek iddia",
                List.of(1), Entailment.NOT_SUPPORTED)).asOptional().orElseThrow();
        ExportContext c = new ExportContext(
                "gen-v1", "tr-TR", "Europe/Istanbul", "disclosure-ai-assist-v1",
                List.of("consent-1"), "rubric-v1", List.of(new CriterionRef("c-comm", "jr-comm-v1")),
                Map.of(citationKey, "c-comm", notSupKey, "c-comm"), List.of("ledger-entry-501"),
                "redaction-policy-v1", "redaction-run-77", "retention-policy-t1",
                "0".repeat(64), "sig-01");
        ExportReceipt receipt = service.exportPacket(T1, HUMAN, I1, caseKey, List.of(citationKey, notSupKey), c, "2026-07-02T14:00:00Z")
                .asOptional().orElseThrow().receipt();
        String packet = artifactStore.find(T1, I1, receipt.artifactKey()).asOptional().orElseThrow();
        assertTrue(packet.contains("\"unsupported\""), "NOT_SUPPORTED → schema enum 'unsupported'");
        assertFalse(packet.contains("not_supported"), "schema-dışı 'not_supported' üretimi yasak");
    }

    @Test
    void insufficient_claim_not_exportable_fail_closed() {
        String insKey = citationStore.put(new Citation(T1, I1, "i1/tr-1", "belirsiz iddia",
                List.of(1), Entailment.INSUFFICIENT)).asOptional().orElseThrow();
        ExportContext c = new ExportContext(
                "gen-v1", "tr-TR", "Europe/Istanbul", "disclosure-ai-assist-v1",
                List.of("consent-1"), "rubric-v1", List.of(new CriterionRef("c-comm", "jr-comm-v1")),
                Map.of(citationKey, "c-comm", insKey, "c-comm"), List.of("ledger-entry-501"),
                "redaction-policy-v1", "redaction-run-77", "retention-policy-t1",
                "0".repeat(64), "sig-01");
        assertFalse(service.exportPacket(T1, HUMAN, I1, caseKey, List.of(citationKey, insKey), c, "2026-07-02T14:00:00Z").isOk(),
                "INSUFFICIENT schema enum dışı — belirsiz iddia denetim paketine giremez (fail-closed)");
    }

    @Test
    void any_exported_claim_without_sources_rejected_min_items() {
        String emptyNotSup = citationStore.put(new Citation(T1, I1, "i1/tr-1", "kaynaksiz unsupported",
                List.of(), Entailment.NOT_SUPPORTED)).asOptional().orElseThrow();
        ExportContext c = new ExportContext(
                "gen-v1", "tr-TR", "Europe/Istanbul", "disclosure-ai-assist-v1",
                List.of("consent-1"), "rubric-v1", List.of(new CriterionRef("c-comm", "jr-comm-v1")),
                Map.of(citationKey, "c-comm", emptyNotSup, "c-comm"), List.of("ledger-entry-501"),
                "redaction-policy-v1", "redaction-run-77", "retention-policy-t1",
                "0".repeat(64), "sig-01");
        assertFalse(service.exportPacket(T1, HUMAN, I1, caseKey, List.of(citationKey, emptyNotSup), c, "2026-07-02T14:00:00Z").isOk(),
                "schema minItems:1 — HER exported claim kaynaklı olmalı");
    }

    @Test
    void supported_citation_without_sources_not_exportable() {
        String badCitation = citationStore.put(new Citation(T1, I1, "i1/tr-1", "kaynaksiz iddia", List.of(), Entailment.SUPPORTED))
                .asOptional().orElseThrow();
        ExportContext c = new ExportContext(
                "gen-v1", "tr-TR", "Europe/Istanbul", "disclosure-ai-assist-v1",
                List.of("consent-1"), "rubric-v1", List.of(new CriterionRef("c-comm", "jr-comm-v1")),
                Map.of(badCitation, "c-comm"), List.of("ledger-entry-501"),
                "redaction-policy-v1", "redaction-run-77", "retention-policy-t1",
                "0".repeat(64), "sig-01");
        assertFalse(service.exportPacket(T1, HUMAN, I1, caseKey, List.of(badCitation), c, "2026-07-02T14:00:00Z").isOk(),
                "kaynaksız SUPPORTED packet'e giremez (ATS-0004 savunma re-check)");
    }

    // ---- 39d-8 exportReceipt (R2 recovery; Codex 019f535a plan-şartları) ----

    private EvidenceLedger.LedgerEntry makeExportEntry(TenantId t, InterviewId i, String ck, String digest,
            double count, String occurredAt, String evidenceId) {
        String key = ExportService.exportIdempotencyKey(t, i, ck);
        EvidenceLedger.LedgerEntry entry = new EvidenceLedger.LedgerEntry(t, HUMAN, i, ExportService.LEDGER_EVENT_TYPE,
                occurredAt, key, digest,
                JsonValue.object(Map.of(
                        "export_artifact_ref", JsonValue.of("artifact-x"),
                        "case_key", JsonValue.of(ck),
                        "packet_digest", JsonValue.of(digest),
                        "claim_count", new JsonValue.JsonNumber(count))),
                new EvidenceId(evidenceId), ledger.entries.size() + 1, "p", "h");
        ledger.entries.add(entry);
        return entry;
    }

    @Test
    void receipt_recovery_after_real_export_is_completed_with_ledger_row_identity() {
        ExportReceipt exported = export().asOptional().orElseThrow();
        var out = service.exportReceipt(T1, HUMAN, I1, caseKey).asOptional().orElseThrow();
        assertEquals("EXPORTED", out.caseState());
        assertEquals("COMPLETED", out.transitionStatus());
        assertEquals(exported.artifactKey(), out.artifactKey());
        // evidenceId LEDGER SATIRININ KENDİSİNDEN (payload'da yok — R2 düzeltmesi):
        assertEquals(exported.evidenceId(), out.evidenceId());
        assertEquals(exported.packetDigest(), out.packetDigest());
        assertEquals(1, out.claimCount());
        assertEquals("2026-07-02T14:00:00Z", out.ledgerRecordedAt());
        assertTrue(sink.emitted().stream()
                .anyMatch(e -> "security.audit_export.receipt_recovered".equals(e.eventTypeId())),
                "salt-okuma erişimi ID-only audit event'i üretmeli");
    }

    @Test
    void receipt_recovery_r4_finalized_case_with_ledger_row_is_incomplete_not_a_success_claim() {
        // Vaka FINALIZED (export HİÇ koşulmadı); ledger'a R4-benzeri satır elle eklenir
        // (artifact+ledger yazıldı, markExported düşmüş senaryosunun kalıntısı):
        makeExportEntry(T1, I1, caseKey, "a".repeat(64), 1.0, "2026-07-02T15:00:00Z", "ev-r4");
        var out = service.exportReceipt(T1, HUMAN, I1, caseKey).asOptional().orElseThrow();
        assertEquals("FINALIZED", out.caseState());
        assertEquals("INCOMPLETE", out.transitionStatus());
        assertEquals("ev-r4", out.evidenceId());
    }

    @Test
    void receipt_recovery_not_found_paths_distinguish_case_vs_ledger() {
        Outcome<ExportService.ExportReceiptRecovery> noCase =
                service.exportReceipt(T1, HUMAN, I1, "case-yok");
        assertTrue(noCase instanceof Outcome.Fail<ExportService.ExportReceiptRecovery> f1
                && f1.code() == OutcomeCode.NOT_FOUND && f1.reason().contains("vaka"));
        Outcome<ExportService.ExportReceiptRecovery> noLedger =
                service.exportReceipt(T1, HUMAN, I1, caseKey);
        assertTrue(noLedger instanceof Outcome.Fail<ExportService.ExportReceiptRecovery> f2
                && f2.code() == OutcomeCode.NOT_FOUND && f2.reason().contains("export ledger"));
    }

    @Test
    void receipt_recovery_cross_binding_violations_fail_closed() {
        // Yanlış eventType:
        EvidenceLedger.LedgerEntry wrongType = makeExportEntry(T1, I1, caseKey, "b".repeat(64), 1.0,
                "2026-07-02T15:00:00Z", "ev-1");
        ledger.entries.set(0, new EvidenceLedger.LedgerEntry(wrongType.tenantId(), wrongType.actorId(),
                wrongType.interviewId(), "evidence.appended", wrongType.occurredAt(),
                wrongType.idempotencyKey(), wrongType.contentHash(), wrongType.payload(),
                wrongType.evidenceId(), wrongType.sequence(), wrongType.previousHash(), wrongType.entryHash()));
        assertFalse(service.exportReceipt(T1, HUMAN, I1, caseKey).isOk(), "eventType mismatch");
        ledger.entries.clear();

        // payload.case_key mismatch (aynı deterministik key, farklı case_key payload'ı):
        EvidenceLedger.LedgerEntry e2 = makeExportEntry(T1, I1, caseKey, "c".repeat(64), 1.0,
                "2026-07-02T15:00:00Z", "ev-2");
        ledger.entries.set(0, new EvidenceLedger.LedgerEntry(e2.tenantId(), e2.actorId(), e2.interviewId(),
                e2.eventType(), e2.occurredAt(), e2.idempotencyKey(), e2.contentHash(),
                JsonValue.object(Map.of(
                        "export_artifact_ref", JsonValue.of("artifact-x"),
                        "case_key", JsonValue.of("BASKA-case"),
                        "packet_digest", JsonValue.of("c".repeat(64)),
                        "claim_count", new JsonValue.JsonNumber(1.0))),
                e2.evidenceId(), e2.sequence(), e2.previousHash(), e2.entryHash()));
        assertFalse(service.exportReceipt(T1, HUMAN, I1, caseKey).isOk(), "case_key mismatch");
        ledger.entries.clear();

        // payload.packet_digest != entry.contentHash (bütünlük bağı):
        EvidenceLedger.LedgerEntry e3 = makeExportEntry(T1, I1, caseKey, "d".repeat(64), 1.0,
                "2026-07-02T15:00:00Z", "ev-3");
        ledger.entries.set(0, new EvidenceLedger.LedgerEntry(e3.tenantId(), e3.actorId(), e3.interviewId(),
                e3.eventType(), e3.occurredAt(), e3.idempotencyKey(), "e".repeat(64),
                e3.payload(), e3.evidenceId(), e3.sequence(), e3.previousHash(), e3.entryHash()));
        assertFalse(service.exportReceipt(T1, HUMAN, I1, caseKey).isOk(),
                "payload digest / contentHash ayrışması");
    }

    @Test
    void receipt_recovery_claim_count_and_timestamp_are_strict() {
        makeExportEntry(T1, I1, caseKey, "1".repeat(64), 2.5, "2026-07-02T15:00:00Z", "ev-a");
        assertFalse(service.exportReceipt(T1, HUMAN, I1, caseKey).isOk(), "2.5 reddedilir");
        ledger.entries.clear();
        makeExportEntry(T1, I1, caseKey, "2".repeat(64), 0.0, "2026-07-02T15:00:00Z", "ev-b");
        assertFalse(service.exportReceipt(T1, HUMAN, I1, caseKey).isOk(), "0 reddedilir (min 1)");
        ledger.entries.clear();
        makeExportEntry(T1, I1, caseKey, "3".repeat(64), 2.0, "bozuk-zaman", "ev-c");
        assertFalse(service.exportReceipt(T1, HUMAN, I1, caseKey).isOk(), "ISO-8601 olmayan occurredAt");
        ledger.entries.clear();
        makeExportEntry(T1, I1, caseKey, "4".repeat(64), 2.0, "2026-07-02T15:00:00Z", "ev-d");
        var ok = service.exportReceipt(T1, HUMAN, I1, caseKey).asOptional().orElseThrow();
        assertEquals(2, ok.claimCount(), "2.0 tam-sayı olarak kabul edilir");
    }

    @Test
    void receipt_recovery_is_read_only_and_tenant_isolated() {
        makeExportEntry(T1, I1, caseKey, "5".repeat(64), 1.0, "2026-07-02T15:00:00Z", "ev-t");
        int artifactsBefore = ledger.entries.size();
        service.exportReceipt(T1, HUMAN, I1, caseKey).asOptional().orElseThrow();
        assertEquals(artifactsBefore, ledger.entries.size(), "salt-okuma: ledger'a yazmaz");
        assertEquals(ReviewState.FINALIZED,
                reviewStore.find(T1, I1, caseKey).asOptional().orElseThrow().state(),
                "case state'ine dokunmaz");
        // Başka tenant aynı caseKey'i SORAMAZ (vaka tenant-scoped → NOT_FOUND):
        assertFalse(service.exportReceipt(T2, HUMAN, I1, caseKey).isOk());
        // caseKey boş / actor boş → INVALID:
        assertFalse(service.exportReceipt(T1, HUMAN, I1, "  ").isOk());
        assertFalse(service.exportReceipt(T1, new ActorId(" "), I1, caseKey).isOk());
    }

    @Test
    void receipt_recovery_rejects_open_or_inreview_case_with_export_ledger_as_integrity_violation() {
        // OPEN vaka + export-ledger satırı = bütünlük ihlali (R4 değil; fail-closed INVALID):
        String openCase = humanReview.open(T1, I1, List.of(citationKey), "aiout-v2")
                .asOptional().orElseThrow();
        makeExportEntry(T1, I1, openCase, "6".repeat(64), 1.0, "2026-07-02T15:00:00Z", "ev-o");
        Outcome<ExportService.ExportReceiptRecovery> open =
                service.exportReceipt(T1, HUMAN, I1, openCase);
        assertTrue(open instanceof Outcome.Fail<ExportService.ExportReceiptRecovery> f
                && f.code() == OutcomeCode.INVALID && f.reason().contains("state"));
        // IN_REVIEW:
        humanReview.startReview(T1, I1, openCase, "human-opaque-1", "role-x").asOptional();
        assertFalse(service.exportReceipt(T1, HUMAN, I1, openCase).isOk());
    }

    @Test
    void receipt_recovery_rejects_missing_or_mistyped_payload_fields() {
        EvidenceLedger.LedgerEntry base = makeExportEntry(T1, I1, caseKey, "7".repeat(64), 1.0,
                "2026-07-02T15:00:00Z", "ev-p");
        // Payload'dan alan DÜŞÜREREK varyantlar (root aynı kalır — Map kopyalanıp key silinir):
        java.util.function.BiFunction<String, JsonValue, EvidenceLedger.LedgerEntry> variant =
                (dropKey, replaceWith) -> {
                    java.util.Map<String, JsonValue> m =
                            new java.util.HashMap<>(((JsonValue.JsonObject) base.payload()).values());
                    if (replaceWith == null) m.remove(dropKey); else m.put(dropKey, replaceWith);
                    return new EvidenceLedger.LedgerEntry(base.tenantId(), base.actorId(),
                            base.interviewId(), base.eventType(), base.occurredAt(),
                            base.idempotencyKey(), base.contentHash(), JsonValue.object(m),
                            base.evidenceId(), base.sequence(), base.previousHash(), base.entryHash());
                };
        record Case(String name, String key, JsonValue value) {}
        for (Case c : List.of(
                new Case("artifact_ref eksik", "export_artifact_ref", null),
                new Case("artifact_ref boş", "export_artifact_ref", JsonValue.of("  ")),
                new Case("digest eksik", "packet_digest", null),
                new Case("digest non-string", "packet_digest", new JsonValue.JsonNumber(1.0)),
                new Case("claim_count eksik", "claim_count", null),
                new Case("claim_count non-number", "claim_count", JsonValue.of("2")))) {
            ledger.entries.clear();
            ledger.entries.add(variant.apply(c.key(), c.value()));
            assertFalse(service.exportReceipt(T1, HUMAN, I1, caseKey).isOk(), c.name());
        }
    }

    @Test
    void receipt_recovery_ledger_lookup_is_tenant_scoped_even_with_same_case_key() {
        // T2'de AYNI caseKey'li vaka + T1'de geçerli export-satırı: T2 sorgusu T1
        // satırını GÖREMEZ (deterministik key tenant'ı içerir + entry.tenant bağı).
        consentStore.put(new RecordingPermission(T2, I1, "subj-2", PermissionState.GRANTED,
                "2026-07-02T00:00:00Z"));
        String cit2 = citationStore.put(new Citation(T2, I1, "i1/tr-1", CLAIM_TEXT,
                List.of(0), Entailment.SUPPORTED)).asOptional().orElseThrow();
        String sameKeyCase = humanReview.open(T2, I1, List.of(cit2), "aiout-v1")
                .asOptional().orElseThrow();
        makeExportEntry(T1, I1, sameKeyCase, "8".repeat(64), 1.0, "2026-07-02T15:00:00Z", "ev-x1");
        Outcome<ExportService.ExportReceiptRecovery> out =
                service.exportReceipt(T2, HUMAN, I1, sameKeyCase);
        assertTrue(out instanceof Outcome.Fail<ExportService.ExportReceiptRecovery> f
                && f.code() == OutcomeCode.NOT_FOUND && f.reason().contains("export ledger"),
                "T2 sorgusu T1 satırına ULAŞAMAZ (ledger-yok NOT_FOUND)");
    }

    // ---- 39d-9 exportArtifact (ledger-bağlı content-plane read; Codex plan-şartları) ----

    private static String sha256Hex(String s) {
        try {
            var md = java.security.MessageDigest.getInstance("SHA-256");
            byte[] d = md.digest(s.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(d.length * 2);
            for (byte b : d) {
                sb.append(Character.forDigit((b >> 4) & 0xF, 16)).append(Character.forDigit(b & 0xF, 16));
            }
            return sb.toString();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    /** 39d-9 satırı: artifact_digest'Lİ ledger entry (makeExportEntry = legacy, digest'siz). */
    private EvidenceLedger.LedgerEntry makeArtifactEntry(String ck, String artifactRef,
            String packetDigest, String artifactDigest, String evidenceId) {
        String key = ExportService.exportIdempotencyKey(T1, I1, ck);
        EvidenceLedger.LedgerEntry entry = new EvidenceLedger.LedgerEntry(T1, HUMAN, I1,
                ExportService.LEDGER_EVENT_TYPE, "2026-07-02T15:00:00Z", key, packetDigest,
                JsonValue.object(Map.of(
                        "export_artifact_ref", JsonValue.of(artifactRef),
                        "case_key", JsonValue.of(ck),
                        "packet_digest", JsonValue.of(packetDigest),
                        "artifact_digest", JsonValue.of(artifactDigest),
                        "claim_count", new JsonValue.JsonNumber(1.0))),
                new EvidenceId(evidenceId), ledger.entries.size() + 1, "p", "h");
        ledger.entries.add(entry);
        return entry;
    }

    @Test
    void artifact_read_happy_path_is_verbatim_and_ledger_digest_bound() {
        ExportReceipt exported = export().asOptional().orElseThrow();
        String stored = artifactStore.find(T1, I1, exported.artifactKey()).asOptional().orElseThrow();

        // exportPacket ledger payload'ı: artifact_digest 64-hex lowercase, depolanan
        // TAM string'in digest'i ve packet_digest'ten (body digest'i) FARKLI.
        JsonValue.JsonObject payload = (JsonValue.JsonObject) ledger.entries.get(0).payload();
        String artifactDigest = ((JsonValue.JsonString) payload.values().get("artifact_digest")).value();
        assertTrue(artifactDigest.matches("[0-9a-f]{64}"), "artifact_digest lowercase 64-hex olmalı");
        assertEquals(sha256Hex(stored), artifactDigest, "digest depolanan TAM string'i bağlamalı");
        assertFalse(artifactDigest.equals(exported.packetDigest()),
                "artifact_digest (integrity-dahil tam string) != packet_digest (body); contentHash packet_digest KALIR");
        assertEquals(exported.packetDigest(), ledger.entries.get(0).contentHash());

        var out = service.exportArtifact(T1, HUMAN, I1, caseKey).asOptional().orElseThrow();
        assertEquals(exported.artifactKey(), out.artifactKey());
        assertEquals(stored, out.packetJson(), "verbatim: servis store string'ini AYNEN döndürür");
        assertTrue(sink.emitted().stream().anyMatch(e ->
                ExportService.ARTIFACT_READ_EVENT.equals(e.eventTypeId())
                        && HUMAN.value().equals(e.extras().get("actor_ref"))
                        && exported.artifactKey().equals(e.extras().get("target_ref"))),
                "başarılı read audit sinyali: target_ref=artifactKey");
        // yeni payload alanı receipt-recovery'yi BOZMAZ (geriye-uyum):
        assertTrue(service.exportReceipt(T1, HUMAN, I1, caseKey).isOk());
    }

    @Test
    void artifact_read_legacy_row_without_artifact_digest_fails_closed_but_receipt_survives() {
        makeExportEntry(T1, I1, caseKey, "9".repeat(64), 1.0, "2026-07-02T15:00:00Z", "ev-l");
        assertTrue(humanReview.markExported(T1, I1, caseKey, "artifact-x").isOk());
        assertTrue(service.exportReceipt(T1, HUMAN, I1, caseKey).isOk(),
                "legacy satır receipt-recovery'yi DÜŞÜRMEZ");
        Outcome<ExportService.ExportArtifactContent> out = service.exportArtifact(T1, HUMAN, I1, caseKey);
        assertTrue(out instanceof Outcome.Fail<ExportService.ExportArtifactContent> f
                && f.code() == OutcomeCode.INVALID && f.reason().contains("legacy"),
                "digest'siz satırda artifact-read fail-closed");
    }

    @Test
    void artifact_read_r4_incomplete_is_denied_even_if_artifact_exists_in_store() {
        String content = "{\"r4\":\"icerik-store-da-var\"}";
        String key = artifactStore.put(T1, I1, content).asOptional().orElseThrow();
        makeArtifactEntry(caseKey, key, "a".repeat(64), sha256Hex(content), "ev-r4a");
        // vaka FINALIZED kalır (markExported yok) → receipt INCOMPLETE, artifact READ YOK
        assertEquals("INCOMPLETE",
                service.exportReceipt(T1, HUMAN, I1, caseKey).asOptional().orElseThrow().transitionStatus());
        Outcome<ExportService.ExportArtifactContent> out = service.exportArtifact(T1, HUMAN, I1, caseKey);
        assertTrue(out instanceof Outcome.Fail<ExportService.ExportArtifactContent> f
                && f.code() == OutcomeCode.INVALID && f.reason().contains("repair"),
                "R4'te artifact store'da DURSA BİLE verilmez (repair önce)");
        assertFalse(sink.emitted().stream().anyMatch(e ->
                ExportService.ARTIFACT_READ_EVENT.equals(e.eventTypeId())));
    }

    @Test
    void artifact_read_digest_mismatch_never_returns_content_and_emits_no_success_audit() {
        String tampered = "{\"tampered\":true}";
        String key = artifactStore.put(T1, I1, tampered).asOptional().orElseThrow();
        makeArtifactEntry(caseKey, key, "b".repeat(64), sha256Hex("{\"original\":true}"), "ev-tam");
        assertTrue(humanReview.markExported(T1, I1, caseKey, key).isOk());
        Outcome<ExportService.ExportArtifactContent> out = service.exportArtifact(T1, HUMAN, I1, caseKey);
        assertTrue(out instanceof Outcome.Fail<ExportService.ExportArtifactContent> f
                && f.code() == OutcomeCode.INVALID && f.reason().contains("bütünlük"),
                "digest uyuşmazlığında içerik cevaba çıkmaz");
        assertFalse(sink.emitted().stream().anyMatch(e ->
                ExportService.ARTIFACT_READ_EVENT.equals(e.eventTypeId())),
                "bütünlük ihlalinde başarı audit'i üretilmez");
    }

    @Test
    void artifact_read_missing_artifact_is_not_found_while_receipt_stays_completed() {
        ExportReceipt exported = export().asOptional().orElseThrow();
        assertTrue(artifactStore.delete(T1, exported.artifactKey()).isOk());
        Outcome<ExportService.ExportArtifactContent> out = service.exportArtifact(T1, HUMAN, I1, caseKey);
        assertTrue(out instanceof Outcome.Fail<ExportService.ExportArtifactContent> f
                && f.code() == OutcomeCode.NOT_FOUND && f.reason().contains("content-plane"),
                "erasure-sonrası yokluk NOT_FOUND (meşru)");
        assertEquals("COMPLETED",
                service.exportReceipt(T1, HUMAN, I1, caseKey).asOptional().orElseThrow().transitionStatus(),
                "WORM makbuz gerçeği content yokluğundan etkilenmez");
    }

    @Test
    void artifact_read_store_operational_error_is_not_flattened_to_not_found() {
        export().asOptional().orElseThrow();
        ExportArtifactStore broken = new ExportArtifactStore() {
            @Override
            public Outcome<String> put(TenantId t, InterviewId i, String p) {
                return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "store down (test)");
            }

            @Override
            public Outcome<String> find(TenantId t, InterviewId i, String k) {
                return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "store down (test)");
            }

            @Override
            public Outcome<Void> delete(TenantId t, String k) {
                return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "store down (test)");
            }
        };
        ExportService degraded = new ExportService(reviewStore, citationStore, broken,
                humanReview, ledger, sink);
        Outcome<ExportService.ExportArtifactContent> out = degraded.exportArtifact(T1, HUMAN, I1, caseKey);
        assertTrue(out instanceof Outcome.Fail<ExportService.ExportArtifactContent> f
                && f.code() == OutcomeCode.NOT_CONFIGURED && f.reason().contains("operasyonel"),
                "store kesintisi 404'e EZİLMEZ (kesinti ≠ silinme)");
    }

    @Test
    void artifact_read_rejects_blank_store_content_as_contract_violation_not_npe() {
        export().asOptional().orElseThrow();
        ExportArtifactStore blankStore = new ExportArtifactStore() {
            @Override
            public Outcome<String> put(TenantId t, InterviewId i, String p) {
                return Outcome.fail(OutcomeCode.UNSUPPORTED_IN_GATE, "test");
            }

            @Override
            public Outcome<String> find(TenantId t, InterviewId i, String k) {
                return Outcome.ok(" ");
            }

            @Override
            public Outcome<Void> delete(TenantId t, String k) {
                return Outcome.fail(OutcomeCode.UNSUPPORTED_IN_GATE, "test");
            }
        };
        ExportService degraded = new ExportService(reviewStore, citationStore, blankStore,
                humanReview, ledger, sink);
        Outcome<ExportService.ExportArtifactContent> out = degraded.exportArtifact(T1, HUMAN, I1, caseKey);
        assertTrue(out instanceof Outcome.Fail<ExportService.ExportArtifactContent> f
                && f.code() == OutcomeCode.INVALID && f.reason().contains("store-kontrat"),
                "Ok(blank) NPE değil fail-closed kontrat ihlali olmalı");
    }

    @Test
    void artifact_read_rejects_blank_case_key_and_blank_actor() {
        assertFalse(service.exportArtifact(T1, HUMAN, I1, " ").isOk());
        assertFalse(service.exportArtifact(T1, new ActorId(" "), I1, caseKey).isOk());
    }

    // ---- 39d-10 idempotent-replay (Codex plan-REVISE matrisi) ----

    private ExportContext ctxWithSignature(String sig) {
        return new ExportContext(
                "gen-v1", "tr-TR", "Europe/Istanbul", "disclosure-ai-assist-v1",
                List.of("consent-cand-01", "consent-interviewer-01"),
                "rubric-v1", List.of(new CriterionRef("c-comm", "jr-comm-v1")),
                Map.of(citationKey, "c-comm"),
                List.of("ledger-entry-501"),
                "redaction-policy-v1", "redaction-run-77", "retention-policy-t1",
                "0".repeat(64), sig);
    }

    @Test
    void replay_requires_same_request_digest_different_context_is_conflict() {
        exportResult().asOptional().orElseThrow();
        int worm = ledger.entries.size();
        Outcome<ExportService.ExportPacketResult> out = service.exportPacket(
                T1, HUMAN, I1, caseKey, List.of(citationKey), ctxWithSignature("sig-DIFFERENT"),
                "2026-07-02T15:00:00Z");
        assertTrue(out instanceof Outcome.Fail<ExportService.ExportPacketResult> f
                && f.code() == OutcomeCode.INVALID && f.reason().contains("FARKLI export isteği"),
                "farklı gövde eski makbuzu replay EDEMEZ (fail-closed conflict)");
        assertEquals(worm, ledger.entries.size(), "conflict side-effect üretmez");
        assertEquals(1, artifactStore.size());
        assertTrue(sink.emitted().stream().noneMatch(e ->
                ExportService.REPLAYED_EVENT.equals(e.eventTypeId())),
                "request_digest conflict replay audit'i ÜRETEMEZ");
    }

    @Test
    void replay_rejected_when_citation_list_differs_even_for_same_case() {
        exportResult().asOptional().orElseThrow();
        String cit2 = citationStore.put(new Citation(T1, I1, "i1/tr-1", "ikinci iddia",
                List.of(1), Entailment.SUPPORTED)).asOptional().orElseThrow();
        ExportContext c = new ExportContext(
                "gen-v1", "tr-TR", "Europe/Istanbul", "disclosure-ai-assist-v1",
                List.of("consent-cand-01", "consent-interviewer-01"),
                "rubric-v1", List.of(new CriterionRef("c-comm", "jr-comm-v1")),
                Map.of(citationKey, "c-comm", cit2, "c-comm"),
                List.of("ledger-entry-501"),
                "redaction-policy-v1", "redaction-run-77", "retention-policy-t1",
                "0".repeat(64), "sig-01");
        Outcome<ExportService.ExportPacketResult> out = service.exportPacket(
                T1, HUMAN, I1, caseKey, List.of(citationKey, cit2), c, "2026-07-02T15:00:00Z");
        assertTrue(out instanceof Outcome.Fail<ExportService.ExportPacketResult> f
                && f.code() == OutcomeCode.INVALID && f.reason().contains("FARKLI export isteği"));
        assertTrue(sink.emitted().stream().noneMatch(e ->
                ExportService.REPLAYED_EVENT.equals(e.eventTypeId())));
    }

    @Test
    void legacy_exported_row_without_request_digest_rejects_post_replay_but_receipt_get_works() {
        makeExportEntry(T1, I1, caseKey, "9".repeat(64), 1.0, "2026-07-02T15:00:00Z", "ev-leg");
        assertTrue(humanReview.markExported(T1, I1, caseKey, "artifact-x").isOk());
        Outcome<ExportService.ExportPacketResult> out = exportResult();
        assertTrue(out instanceof Outcome.Fail<ExportService.ExportPacketResult> f
                && f.code() == OutcomeCode.INVALID && f.reason().contains("legacy")
                && f.reason().contains("receipt"),
                "legacy satırda POST replay yok; receipt GET'e yönlendirilir");
        assertTrue(service.exportReceipt(T1, HUMAN, I1, caseKey).isOk(),
                "receipt-recovery legacy satırda ÇALIŞIR");
        assertEquals(0, artifactStore.size(), "yeni üretim yok");
    }

    @Test
    void r4_finalized_with_ledger_row_is_repair_first_no_new_production() {
        // Bugünkü davranış "yeniden üret → 23505 → hata" idi; artık üretime hiç girilmez.
        makeArtifactEntry(caseKey, "artifact-r4", "a".repeat(64), sha256Hex("{\"x\":1}"), "ev-r4p");
        Outcome<ExportService.ExportPacketResult> out = exportResult();
        assertTrue(out instanceof Outcome.Fail<ExportService.ExportPacketResult> f
                && f.code() == OutcomeCode.UNSUPPORTED_IN_GATE
                && f.reason().contains("repair-first"),
                "R4: deterministik in-progress/repair-first; body: " + out);
        assertEquals(0, artifactStore.size(), "packet YENİDEN üretilmez");
        assertEquals(1, ledger.entries.size(), "append denenmez");
        assertFalse(sink.emitted().stream().anyMatch(e ->
                ExportService.REPLAYED_EVENT.equals(e.eventTypeId())));
    }

    /** Yarış simülatörü: ilk lookup NOT_FOUND (üretime girilir); append fail;
     *  sonraki lookup kazananı görür — o anda onWinnerVisible (ör. kazananın
     *  markExported'ı) koşturulur. */
    private EvidenceLedger raceLedger(EvidenceLedger.LedgerEntry winnerRow, Runnable onWinnerVisible) {
        return new EvidenceLedger() {
            int lookups = 0;
            boolean flipped = false;

            @Override
            public Outcome<LedgerEntry> append(EvidenceEvent e) {
                return Outcome.fail(OutcomeCode.INVALID,
                        "idempotency conflict: aynı (tenant, idempotency_key) farklı içerikle yeniden kullanılamaz (fail-closed)");
            }

            @Override
            public Outcome<LedgerEntry> findByIdempotencyKey(TenantId t, String key) {
                lookups++;
                if (lookups == 1) {
                    return Outcome.fail(OutcomeCode.NOT_FOUND, "yok (henüz)");
                }
                if (winnerRow == null) {
                    return Outcome.fail(OutcomeCode.NOT_FOUND, "yok");
                }
                if (!flipped && onWinnerVisible != null) {
                    flipped = true;
                    onWinnerVisible.run();
                }
                return Outcome.ok(winnerRow);
            }

            @Override
            public Outcome<LedgerEntry> appendTombstoneEvent(TenantId t, ActorId a, InterviewId i,
                    EvidenceId target, String reason) {
                return Outcome.fail(OutcomeCode.UNSUPPORTED_IN_GATE, "slice dışı");
            }

            @Override
            public Outcome<LedgerEntry> getById(TenantId t, EvidenceId id) {
                return Outcome.fail(OutcomeCode.NOT_FOUND, "yok");
            }

            @Override
            public Outcome<List<LedgerEntry>> list(TenantId t, LedgerListFilter f) {
                return Outcome.ok(winnerRow == null ? List.of() : List.of(winnerRow));
            }
        };
    }

    private EvidenceLedger.LedgerEntry winnerRow(String requestDigest, String artifactRef) {
        String key = ExportService.exportIdempotencyKey(T1, I1, caseKey);
        return new EvidenceLedger.LedgerEntry(T1, HUMAN, I1, ExportService.LEDGER_EVENT_TYPE,
                "2026-07-02T15:00:00Z", key, "b".repeat(64),
                JsonValue.object(Map.of(
                        "export_artifact_ref", JsonValue.of(artifactRef),
                        "case_key", JsonValue.of(caseKey),
                        "packet_digest", JsonValue.of("b".repeat(64)),
                        "artifact_digest", JsonValue.of("c".repeat(64)),
                        "request_digest", JsonValue.of(requestDigest),
                        "claim_count", new JsonValue.JsonNumber(1.0))),
                new EvidenceId("ev-win"), 1, "p", "h");
    }

    @Test
    void append_race_loser_reconciles_to_replay_when_winner_exported_same_digest() {
        String digest = ExportService.exportRequestDigest(T1, I1, caseKey, List.of(citationKey), ctx());
        ExportService raced = new ExportService(reviewStore, citationStore, artifactStore,
                humanReview, raceLedger(winnerRow(digest, "artifact-win"),
                        () -> humanReview.markExported(T1, I1, caseKey, "artifact-win")), sink);
        Outcome<ExportService.ExportPacketResult> out = raced.exportPacket(
                T1, HUMAN, I1, caseKey, List.of(citationKey), ctx(), "2026-07-02T16:00:00Z");
        ExportService.ExportPacketResult r = out.asOptional().orElseThrow();
        assertEquals(ExportService.ExportDisposition.REPLAYED, r.disposition());
        assertEquals("artifact-win", r.receipt().artifactKey());
        assertEquals(0, artifactStore.size(), "kaybedenin artifact'i TELAFİ EDİLDİ (rollback)");
    }

    @Test
    void append_race_loser_gets_deterministic_in_progress_when_winner_still_finalized() {
        String digest = ExportService.exportRequestDigest(T1, I1, caseKey, List.of(citationKey), ctx());
        ExportService raced = new ExportService(reviewStore, citationStore, artifactStore,
                humanReview, raceLedger(winnerRow(digest, "artifact-win"), null), sink);
        // vaka FINALIZED kalır (kazanan markExported'a HENÜZ ulaşmadı)
        Outcome<ExportService.ExportPacketResult> out = raced.exportPacket(
                T1, HUMAN, I1, caseKey, List.of(citationKey), ctx(), "2026-07-02T16:00:00Z");
        assertTrue(out instanceof Outcome.Fail<ExportService.ExportPacketResult> f
                && f.code() == OutcomeCode.UNSUPPORTED_IN_GATE,
                "generic 503/400 değil: açık in-progress/R4; body: " + out);
        assertEquals(0, artifactStore.size());
    }

    @Test
    void append_race_with_different_request_digest_never_leaks_winner_receipt() {
        ExportService raced = new ExportService(reviewStore, citationStore, artifactStore,
                humanReview, raceLedger(winnerRow("e".repeat(64), "artifact-win"),
                        () -> humanReview.markExported(T1, I1, caseKey, "artifact-win")), sink);
        Outcome<ExportService.ExportPacketResult> out = raced.exportPacket(
                T1, HUMAN, I1, caseKey, List.of(citationKey), ctx(), "2026-07-02T16:00:00Z");
        assertTrue(out instanceof Outcome.Fail<ExportService.ExportPacketResult> f
                && f.code() == OutcomeCode.INVALID && f.reason().contains("FARKLI export isteği"),
                "yarışı farklı istek kazandıysa makbuz SIZDIRILMAZ");
        assertTrue(sink.emitted().stream().noneMatch(e ->
                ExportService.REPLAYED_EVENT.equals(e.eventTypeId())),
                "yanlış replay audit'i de üretilmez");
    }

    @Test
    void rollback_fail_never_returns_replay_even_when_winner_is_visible() {
        // R1 şartı (Codex): telafi silmesi BAŞARISIZSA kazanan görünür olsa bile
        // replay/success dönülmez — öksüz-artifact alarmı gizlenmez.
        String digest = ExportService.exportRequestDigest(T1, I1, caseKey, List.of(citationKey), ctx());
        ExportArtifactStore stickyStore = new ExportArtifactStore() {
            @Override
            public Outcome<String> put(TenantId t, InterviewId i, String pk) {
                return artifactStore.put(t, i, pk);
            }

            @Override
            public Outcome<String> find(TenantId t, InterviewId i, String k) {
                return artifactStore.find(t, i, k);
            }

            @Override
            public Outcome<Void> delete(TenantId t, String k) {
                return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "delete down (test)");
            }
        };
        ExportService raced = new ExportService(reviewStore, citationStore, stickyStore,
                humanReview, raceLedger(winnerRow(digest, "artifact-win"),
                        () -> humanReview.markExported(T1, I1, caseKey, "artifact-win")), sink);
        Outcome<ExportService.ExportPacketResult> out = raced.exportPacket(
                T1, HUMAN, I1, caseKey, List.of(citationKey), ctx(), "2026-07-02T16:00:00Z");
        assertTrue(out instanceof Outcome.Fail<ExportService.ExportPacketResult> f
                && f.code() == OutcomeCode.NOT_CONFIGURED
                && f.reason().contains("telafi silmesi başarısız"),
                "rollback-fail'de kazanan GÖRÜNSE BİLE replay dönülmez; body: " + out);
        assertEquals(1, artifactStore.size(), "öksüz artifact store'da kaldı (R1 sinyali)");
        assertTrue(sink.emitted().stream().noneMatch(e ->
                ExportService.REPLAYED_EVENT.equals(e.eventTypeId())));
    }

    @Test
    void append_fail_without_winner_row_stays_operational_error_with_rollback() {
        ExportService raced = new ExportService(reviewStore, citationStore, artifactStore,
                humanReview, raceLedger(null, null), sink);
        Outcome<ExportService.ExportPacketResult> out = raced.exportPacket(
                T1, HUMAN, I1, caseKey, List.of(citationKey), ctx(), "2026-07-02T16:00:00Z");
        assertTrue(out instanceof Outcome.Fail<ExportService.ExportPacketResult> f
                && f.code() == OutcomeCode.NOT_CONFIGURED
                && f.reason().contains("artifact geri alındı"),
                "satır yoksa gerçek ledger arızası: mevcut hata korunur; body: " + out);
        assertEquals(0, artifactStore.size(), "rollback gerçekleşti");
    }

    @Test
    void export_payload_request_digest_is_canonical_and_matches_recomputation() {
        exportResult().asOptional().orElseThrow();
        JsonValue.JsonObject payload = (JsonValue.JsonObject) ledger.entries.get(0).payload();
        String rd = ((JsonValue.JsonString) payload.values().get("request_digest")).value();
        assertTrue(rd.matches("[0-9a-f]{64}"));
        assertEquals(ExportService.exportRequestDigest(T1, I1, caseKey, List.of(citationKey), ctx()), rd,
                "payload digest'i aynı girdilerin yeniden-hesabıyla birebir");
        assertFalse(rd.equals(((JsonValue.JsonString) payload.values().get("packet_digest")).value()));
    }

    // ---- 39d-11 repairExportTransition (Codex plan-şartları) ----

    private String r4Fixture(String content) {
        String key = artifactStore.put(T1, I1, content).asOptional().orElseThrow();
        makeArtifactEntry(caseKey, key, "b".repeat(64), sha256Hex(content), "ev-r4h");
        return key;
    }

    @Test
    void repair_intent_key_is_actor_bound_and_digest_encoded() {
        String a = ExportService.exportRepairIntentKey(T1, I1, "c-1", new ActorId("op:a/x"));
        String b = ExportService.exportRepairIntentKey(T1, I1, "c-1", new ActorId("op:b"));
        String a2 = ExportService.exportRepairIntentKey(T1, I1, "c-1", new ActorId("op:a/x"));
        assertEquals(a, a2, "aynı actor deterministik aynı key");
        assertFalse(a.equals(b), "farklı actor FARKLI intent key (takeover kilidi yok)");
        assertFalse(a.contains("op:a/x"), "raw actor ref key'e GİRMEZ (tuple-collision)");
        assertTrue(a.matches(".*:export-repair-intent:c-1:[0-9a-f]{64}$"));
    }

    @Test
    void repair_happy_path_appends_intent_then_cas_then_emits() {
        String artKey = r4Fixture("{\"r4\":\"heal\"}");
        int wormBefore = ledger.entries.size();
        ExportService.ExportRepairResult r = service.repairExportTransition(
                T1, HUMAN, I1, caseKey, "2026-07-12T17:00:00Z").asOptional().orElseThrow();
        assertEquals(ExportService.RepairStatus.REPAIRED, r.status());
        assertEquals(artKey, r.receipt().artifactKey());
        assertEquals(wormBefore + 1, ledger.entries.size(), "kalıcı repair-INTENT satırı yazıldı");
        EvidenceLedger.LedgerEntry intent = ledger.entries.get(ledger.entries.size() - 1);
        assertEquals(ExportService.REPAIR_INTENT_EVENT, intent.eventType());
        assertTrue(intent.idempotencyKey().contains(":export-repair-intent:"));
        assertEquals(ReviewState.EXPORTED,
                reviewStore.find(T1, I1, caseKey).asOptional().orElseThrow().state());
        assertEquals(artKey,
                reviewStore.find(T1, I1, caseKey).asOptional().orElseThrow().exportArtifactRef());
        assertTrue(sink.emitted().stream().anyMatch(e ->
                ExportService.R4_REPAIRED_EVENT.equals(e.eventTypeId())
                        && artKey.equals(e.extras().get("target_ref"))));
        // tekrar-repair: EXPORTED dalı → ALREADY; yeni intent YOK
        ExportService.ExportRepairResult again = service.repairExportTransition(
                T1, HUMAN, I1, caseKey, "2026-07-12T17:01:00Z").asOptional().orElseThrow();
        assertEquals(ExportService.RepairStatus.ALREADY_EXPORTED, again.status());
        assertEquals(wormBefore + 1, ledger.entries.size(), "ikinci çağrı intent ÇOĞALTMAZ");
    }

    @Test
    void repair_precondition_failures_never_write_intent() {
        // legacy (artifact_digest yok)
        makeExportEntry(T1, I1, caseKey, "9".repeat(64), 1.0, "2026-07-02T15:00:00Z", "ev-lg");
        int worm = ledger.entries.size();
        Outcome<ExportService.ExportRepairResult> legacy =
                service.repairExportTransition(T1, HUMAN, I1, caseKey, "2026-07-12T17:00:00Z");
        assertTrue(legacy instanceof Outcome.Fail<ExportService.ExportRepairResult> f1
                && f1.code() == OutcomeCode.INVALID && f1.reason().contains("legacy"));
        assertEquals(worm, ledger.entries.size());
        ledger.entries.clear();
        // artifact yok
        makeArtifactEntry(caseKey, "art-YOK", "b".repeat(64), sha256Hex("x"), "ev-a1");
        Outcome<ExportService.ExportRepairResult> gone =
                service.repairExportTransition(T1, HUMAN, I1, caseKey, "2026-07-12T17:00:00Z");
        assertTrue(gone instanceof Outcome.Fail<ExportService.ExportRepairResult> f2
                && f2.code() == OutcomeCode.NOT_FOUND);
        assertEquals(1, ledger.entries.size(), "intent yazılmadı");
        ledger.entries.clear();
        // digest mismatch
        String k = artifactStore.put(T1, I1, "{\"gercek\":1}").asOptional().orElseThrow();
        makeArtifactEntry(caseKey, k, "b".repeat(64), sha256Hex("{\"farkli\":1}"), "ev-a2");
        Outcome<ExportService.ExportRepairResult> bad =
                service.repairExportTransition(T1, HUMAN, I1, caseKey, "2026-07-12T17:00:00Z");
        assertTrue(bad instanceof Outcome.Fail<ExportService.ExportRepairResult> f3
                && f3.code() == OutcomeCode.INVALID && f3.reason().contains("bütünlük"));
        assertEquals(1, ledger.entries.size(), "intent yazılmadı");
        assertEquals(ReviewState.FINALIZED,
                reviewStore.find(T1, I1, caseKey).asOptional().orElseThrow().state());
        assertTrue(sink.emitted().stream().noneMatch(e ->
                ExportService.R4_REPAIRED_EVENT.equals(e.eventTypeId())));
    }

    @Test
    void repair_intent_append_fail_means_no_repair_at_all() {
        r4Fixture("{\"r4\":\"x\"}");
        ledger.failAppend = true;
        Outcome<ExportService.ExportRepairResult> out =
                service.repairExportTransition(T1, HUMAN, I1, caseKey, "2026-07-12T17:00:00Z");
        assertTrue(out instanceof Outcome.Fail<ExportService.ExportRepairResult> f
                && f.reason().contains("audit'siz repair olmaz"),
                "intent yazılamadıysa repair YAPILMAZ; body: " + out);
        assertEquals(ReviewState.FINALIZED,
                reviewStore.find(T1, I1, caseKey).asOptional().orElseThrow().state(),
                "CAS çağrılmadı — state değişmedi");
    }

    @Test
    void repair_cas_integrity_conflict_after_intent_is_invalid_and_intent_persists() {
        String artKey = r4Fixture("{\"r4\":\"y\"}");
        // CAS anında yarış: markExportedIfFinalized çağrısından hemen önce vaka
        // FARKLI ref'le EXPORTED'a düşer (verify FINALIZED görmüştü).
        ReviewCaseStore racing = new ReviewCaseStore() {
            @Override
            public Outcome<String> put(ReviewCase c) { return reviewStore.put(c); }

            @Override
            public Outcome<ReviewCase> find(TenantId t, InterviewId i, String k) {
                return reviewStore.find(t, i, k);
            }

            @Override
            public Outcome<java.util.List<CaseSummary>> listByInterview(TenantId t, InterviewId i) {
                return reviewStore.listByInterview(t, i);
            }

            @Override
            public Outcome<Void> save(TenantId t, String k, ReviewCase rc) {
                return reviewStore.save(t, k, rc);
            }

            @Override
            public Outcome<ExportTransitionResult> markExportedIfFinalized(
                    TenantId t, InterviewId i, String k, String ref) {
                ReviewCase cur = reviewStore.find(t, i, k).asOptional().orElseThrow();
                reviewStore.save(t, k, cur.withExportArtifact("BAŞKA-art").with(ReviewState.EXPORTED));
                return reviewStore.markExportedIfFinalized(t, i, k, ref);
            }
        };
        HumanReviewService racingHr = new HumanReviewService(
                new ConsentGate(consentStore, sink), racing, ledger, sink);
        ExportService racedSvc = new ExportService(reviewStore, citationStore, artifactStore,
                racingHr, ledger, sink);
        int worm = ledger.entries.size();
        Outcome<ExportService.ExportRepairResult> out =
                racedSvc.repairExportTransition(T1, HUMAN, I1, caseKey, "2026-07-12T17:00:00Z");
        assertTrue(out instanceof Outcome.Fail<ExportService.ExportRepairResult> f
                && f.code() == OutcomeCode.INVALID && f.reason().contains("FARKLI artifact"),
                "body: " + out);
        assertEquals(worm + 1, ledger.entries.size(), "intent NİYET-kaydı olarak kalır");
        assertTrue(sink.emitted().stream().noneMatch(e ->
                ExportService.R4_REPAIRED_EVENT.equals(e.eventTypeId())));
        assertEquals(artKey, artKey); // fixture ref'i kullanılmadı-uyarısı bastırma
    }

    @Test
    void repair_already_exported_requires_case_ledger_ref_match() {
        String artKey = r4Fixture("{\"r4\":\"z\"}");
        assertTrue(humanReview.markExported(T1, I1, caseKey, artKey).isOk());
        int worm = ledger.entries.size();
        ExportService.ExportRepairResult ok = service.repairExportTransition(
                T1, HUMAN, I1, caseKey, "2026-07-12T17:00:00Z").asOptional().orElseThrow();
        assertEquals(ExportService.RepairStatus.ALREADY_EXPORTED, ok.status());
        assertEquals(worm, ledger.entries.size(), "already yolunda intent YAZILMAZ");
        // ref uyuşmazlığı → INVALID
        ReviewCase cur = reviewStore.find(T1, I1, caseKey).asOptional().orElseThrow();
        assertTrue(reviewStore.save(T1, caseKey, cur.withExportArtifact("BAŞKA")).isOk());
        Outcome<ExportService.ExportRepairResult> bad =
                service.repairExportTransition(T1, HUMAN, I1, caseKey, "2026-07-12T17:00:00Z");
        assertTrue(bad instanceof Outcome.Fail<ExportService.ExportRepairResult> f
                && f.code() == OutcomeCode.INVALID && f.reason().contains("uyuşmuyor"));
    }

    @Test
    void artifact_read_rejects_malformed_artifact_digest_in_ledger() {
        String content = "{\"x\":1}";
        String key = artifactStore.put(T1, I1, content).asOptional().orElseThrow();
        makeArtifactEntry(caseKey, key, "c".repeat(64), "BOZUK-DIGEST", "ev-bad");
        assertTrue(humanReview.markExported(T1, I1, caseKey, key).isOk());
        // format-pin base doğrulamada: bozuk digest hem receipt hem artifact yolunu düşürür
        assertFalse(service.exportReceipt(T1, HUMAN, I1, caseKey).isOk());
        assertFalse(service.exportArtifact(T1, HUMAN, I1, caseKey).isOk());
    }
}
