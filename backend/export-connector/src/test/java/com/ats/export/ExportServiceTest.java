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
        humanReview.recordEdit(T1, I1, caseKey, "cs-ref").asOptional();
        humanReview.recordRationale(T1, I1, caseKey, "rat-ref").asOptional();
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

    private Outcome<ExportReceipt> export() {
        return service.exportPacket(T1, HUMAN, I1, caseKey, List.of(citationKey), ctx(), "2026-07-02T14:00:00Z");
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
        humanReview.recordEdit(T1, I1, orphanCase, "cs").asOptional();
        humanReview.recordRationale(T1, I1, orphanCase, "rat").asOptional();
        humanReview.finalizeDecision(T1, HUMAN, I1, orphanCase, "karar-sonuc-a", "2026-07-02T13:00:00Z").asOptional().orElseThrow();
        ledger.entries.clear();
        Outcome<ExportReceipt> out = service.exportPacket(T1, HUMAN, I1, orphanCase, List.of(citationKey), ctx(), "2026-07-02T14:00:00Z");
        assertFalse(out.isOk(), "karar-kanıtı claims dışıysa export fail-closed (manifest cross-invariant)");
        assertTrue(ledger.entries.isEmpty());
    }

    @Test
    void unsupported_claim_cannot_ground_decision() {
        String unsupportedKey = citationStore.put(new Citation(T1, I1, "i1/tr-1", "desteklenmeyen iddia",
                List.of(1), Entailment.NOT_SUPPORTED)).asOptional().orElseThrow();
        String c2 = humanReview.open(T1, I1, List.of(unsupportedKey), "aiout-v1").asOptional().orElseThrow();
        humanReview.startReview(T1, I1, c2, "human-opaque-1", "role-1").asOptional();
        humanReview.recordEdit(T1, I1, c2, "cs").asOptional();
        humanReview.recordRationale(T1, I1, c2, "rat").asOptional();
        humanReview.finalizeDecision(T1, HUMAN, I1, c2, "karar-sonuc-a", "2026-07-02T13:00:00Z").asOptional().orElseThrow();
        ExportContext c = new ExportContext(
                "gen-v1", "tr-TR", "Europe/Istanbul", "disclosure-ai-assist-v1",
                List.of("consent-1"), "rubric-v1", List.of(new CriterionRef("c-comm", "jr-comm-v1")),
                Map.of(unsupportedKey, "c-comm"), List.of("ledger-entry-501"),
                "redaction-policy-v1", "redaction-run-77", "retention-policy-t1",
                "0".repeat(64), "sig-01");
        Outcome<ExportReceipt> out = service.exportPacket(T1, HUMAN, I1, c2, List.of(unsupportedKey), c, "2026-07-02T14:00:00Z");
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
    void only_finalized_cases_exportable_and_double_export_blocked() {
        String draft = humanReview.open(T1, I1, List.of("ev-x"), "aiout-v1").asOptional().orElseThrow();
        assertFalse(service.exportPacket(T1, HUMAN, I1, draft, List.of(citationKey), ctx(), "2026-07-02T14:00:00Z").isOk(),
                "AI_SUGGESTED export edilemez");
        assertTrue(export().isOk());
        assertFalse(export().isOk(), "EXPORTED terminal → çift-export reddedilir");
        assertEquals(1, artifactStore.size());
    }

    @Test
    void unknown_or_cross_tenant_citation_rejected() {
        assertFalse(service.exportPacket(T1, HUMAN, I1, caseKey, List.of("i1/cit-999"), ctx(), "2026-07-02T14:00:00Z").isOk());
        Outcome<ExportReceipt> cross = service.exportPacket(T2, HUMAN, I1, caseKey, List.of(citationKey), ctx(), "2026-07-02T14:00:00Z");
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
                .asOptional().orElseThrow();
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
}
