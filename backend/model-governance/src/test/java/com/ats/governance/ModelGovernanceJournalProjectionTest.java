package com.ats.governance;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.contracts.EvidenceLedger.LedgerEntry;
import com.ats.governance.ModelGovernanceJournalProjection.IntegrityIssue;
import com.ats.governance.ModelGovernanceJournalProjection.InvocationIntegrity;
import com.ats.governance.ModelGovernanceJournalProjection.JournalRecord;
import com.ats.governance.ModelGovernanceJournalProjection.Malformed;
import com.ats.governance.ModelGovernanceJournalProjection.ProjectionResult;
import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.EvidenceId;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.JsonValue;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * gov1-1d crash-gap projeksiyonu state-machine KANITI (dokümantasyon iddiası değil): 6 durum (yeni
 * PRE_PROVIDER_REJECTED dahil) + post/pre-provider varyant + çok-invocation + WORM-satır çıkarımı +
 * Codex 1d blocker-3: governance-bozuk satır SESSİZCE atlanmaz (fail-closed IntegrityIssue).
 */
class ModelGovernanceJournalProjectionTest {

    private static final TenantId T = new TenantId("t1");
    private static final ActorId A = new ActorId("a1");
    private static final InterviewId I = new InterviewId("iv1");

    // Ledger-seviyesi testlerde invocation_id GERÇEK ModelInvocationId biçiminde olmalı (blocker-3).
    private static final String ID_OK = "mgi_00000000-0000-4000-8000-000000000001";
    private static final String ID_GAP = "mgi_00000000-0000-4000-8000-000000000002";
    private static final String ID_CLEAN = "mgi_00000000-0000-4000-8000-000000000003";
    private static final String ID_ORPHAN = "mgi_00000000-0000-4000-8000-000000000004";
    private static final String VALID_ID = "mgi_00000000-0000-4000-8000-00000000000a";

    private static InvocationIntegrity classify(String id, JournalStage... stages) {
        List<JournalRecord> records = new ArrayList<>();
        for (JournalStage s : stages) {
            records.add(new JournalRecord(id, s));
        }
        return ModelGovernanceJournalProjection.classify(records).get(id);
    }

    /* ---- state-machine (saf; JournalRecord doğrudan) ---- */

    @Test
    void authorized_plus_post_provider_terminal_is_complete_invoked() {
        assertEquals(InvocationIntegrity.COMPLETE_INVOKED,
                classify("x", JournalStage.AUTHORIZED, JournalStage.ATTESTED));
        assertEquals(InvocationIntegrity.COMPLETE_INVOKED,
                classify("x", JournalStage.AUTHORIZED, JournalStage.PROVIDER_REJECTED));
        assertEquals(InvocationIntegrity.COMPLETE_INVOKED,
                classify("x", JournalStage.AUTHORIZED, JournalStage.VERIFICATION_REJECTED));
    }

    @Test
    void preflight_rejected_only_is_complete_non_invoked() {
        assertEquals(InvocationIntegrity.COMPLETE_NON_INVOKED,
                classify("x", JournalStage.PREFLIGHT_REJECTED));
    }

    @Test
    void authorized_plus_pre_provider_rejected_is_complete_non_invoked() {
        // Codex 1d blocker-1: authorized YAZILDI ama provider çağrılmadı → crash DEĞİL, temiz non-invoked.
        assertEquals(InvocationIntegrity.COMPLETE_NON_INVOKED,
                classify("x", JournalStage.AUTHORIZED, JournalStage.PRE_PROVIDER_REJECTED));
    }

    @Test
    void pre_provider_rejected_without_authorized_is_integrity_anomaly() {
        // pre-provider terminal, authorized'ı gerektirir → authorized'sız orphan = anomali.
        assertEquals(InvocationIntegrity.INTEGRITY_ANOMALY,
                classify("x", JournalStage.PRE_PROVIDER_REJECTED));
    }

    @Test
    void authorized_without_terminal_is_incomplete_crash_gap() {
        assertEquals(InvocationIntegrity.INCOMPLETE_CRASH_GAP,
                classify("x", JournalStage.AUTHORIZED));
    }

    @Test
    void post_provider_terminal_without_authorized_is_integrity_anomaly() {
        assertEquals(InvocationIntegrity.INTEGRITY_ANOMALY,
                classify("x", JournalStage.ATTESTED));
        assertEquals(InvocationIntegrity.INTEGRITY_ANOMALY,
                classify("x", JournalStage.PROVIDER_REJECTED));
        assertEquals(InvocationIntegrity.INTEGRITY_ANOMALY,
                classify("x", JournalStage.VERIFICATION_REJECTED));
    }

    @Test
    void multiple_terminal_is_integrity_anomaly() {
        assertEquals(InvocationIntegrity.INTEGRITY_ANOMALY,
                classify("x", JournalStage.AUTHORIZED, JournalStage.ATTESTED, JournalStage.PROVIDER_REJECTED));
        assertEquals(InvocationIntegrity.INTEGRITY_ANOMALY,
                classify("x", JournalStage.PREFLIGHT_REJECTED, JournalStage.PREFLIGHT_REJECTED));
        // authorized + pre-provider + post-provider = çok-terminal → anomali
        assertEquals(InvocationIntegrity.INTEGRITY_ANOMALY,
                classify("x", JournalStage.AUTHORIZED, JournalStage.PRE_PROVIDER_REJECTED, JournalStage.ATTESTED));
    }

    @Test
    void contradictions_are_integrity_anomaly() {
        // authorized + preflight-red (çelişki) + çok-authorized (defansif) → anomali.
        assertEquals(InvocationIntegrity.INTEGRITY_ANOMALY,
                classify("x", JournalStage.AUTHORIZED, JournalStage.PREFLIGHT_REJECTED));
        assertEquals(InvocationIntegrity.INTEGRITY_ANOMALY,
                classify("x", JournalStage.AUTHORIZED, JournalStage.AUTHORIZED));
    }

    @Test
    void multi_invocation_classified_independently() {
        List<JournalRecord> records = List.of(
                new JournalRecord("ok", JournalStage.AUTHORIZED),
                new JournalRecord("ok", JournalStage.ATTESTED),
                new JournalRecord("gap", JournalStage.AUTHORIZED),
                new JournalRecord("clean", JournalStage.PREFLIGHT_REJECTED),
                new JournalRecord("prep", JournalStage.AUTHORIZED),
                new JournalRecord("prep", JournalStage.PRE_PROVIDER_REJECTED),
                new JournalRecord("orphan", JournalStage.ATTESTED));
        Map<String, InvocationIntegrity> out = ModelGovernanceJournalProjection.classify(records);
        assertEquals(InvocationIntegrity.COMPLETE_INVOKED, out.get("ok"));
        assertEquals(InvocationIntegrity.INCOMPLETE_CRASH_GAP, out.get("gap"));
        assertEquals(InvocationIntegrity.COMPLETE_NON_INVOKED, out.get("clean"));
        assertEquals(InvocationIntegrity.COMPLETE_NON_INVOKED, out.get("prep"));
        assertEquals(InvocationIntegrity.INTEGRITY_ANOMALY, out.get("orphan"));
    }

    /* ---- WORM-satır çıkarımı: parseRow + project (ProjectionResult) ---- */

    private static LedgerEntry journalRow(String invocationId, JournalStage stage) {
        String eventType = switch (stage) {
            case AUTHORIZED -> EvidenceLedgerModelGovernanceJournal.AUTHORIZED_EVENT_TYPE;
            case ATTESTED -> EvidenceLedgerModelGovernanceJournal.ATTESTED_EVENT_TYPE;
            default -> EvidenceLedgerModelGovernanceJournal.REJECTED_EVENT_TYPE;
        };
        return new LedgerEntry(T, A, I, eventType, "2026-07-13T10:00:00Z",
                "idem-" + invocationId + "-" + stage, "hash",
                JsonValue.object(Map.of(
                        "invocation_id", JsonValue.of(invocationId),
                        "stage", JsonValue.of(stage.token()))),
                new EvidenceId("ev-" + invocationId + "-" + stage), 1, "prev", "eh");
    }

    private static LedgerEntry rawRow(String eventType, Map<String, JsonValue> payload) {
        return new LedgerEntry(T, A, I, eventType, "2026-07-13T10:00:00Z", "idem", "hash",
                JsonValue.object(payload), new EvidenceId("ev-raw"), 1, "prev", "eh");
    }

    @Test
    void project_extracts_journal_rows_skips_others_and_reports_no_issues_on_clean_ledger() {
        List<LedgerEntry> entries = List.of(
                journalRow(ID_OK, JournalStage.AUTHORIZED),
                journalRow(ID_OK, JournalStage.ATTESTED),
                journalRow(ID_GAP, JournalStage.AUTHORIZED),
                journalRow(ID_CLEAN, JournalStage.PREFLIGHT_REJECTED),
                // journal-OLMAYAN business satırı → atlanır (haritaya girmez, bulgu üretmez)
                rawRow("transcript.created", Map.of("transcript_key", JsonValue.of("k"))));
        ProjectionResult result = ModelGovernanceJournalProjection.project(entries);
        assertEquals(3, result.invocations().size(), "yalnız journal invocation'ları sınıflandırılmalı");
        assertEquals(InvocationIntegrity.COMPLETE_INVOKED, result.invocations().get(ID_OK));
        assertEquals(InvocationIntegrity.INCOMPLETE_CRASH_GAP, result.invocations().get(ID_GAP));
        assertEquals(InvocationIntegrity.COMPLETE_NON_INVOKED, result.invocations().get(ID_CLEAN));
        assertFalse(result.invocations().containsKey("k"));
        assertTrue(result.issues().isEmpty(), "temiz ledger → bulgu YOK");
    }

    @Test
    void parse_row_skips_non_journal_rows() {
        assertInstanceOf(ModelGovernanceJournalProjection.Skip.class,
                ModelGovernanceJournalProjection.parseRow(rawRow("transcript.created",
                        Map.of("invocation_id", JsonValue.of(VALID_ID), "stage", JsonValue.of("authorized")))));
        // geçerli journal satırı → Good
        assertInstanceOf(ModelGovernanceJournalProjection.Good.class,
                ModelGovernanceJournalProjection.parseRow(journalRow(VALID_ID, JournalStage.ATTESTED)));
    }

    @Test
    void parse_row_flags_malformed_governance_rows_never_silently_dropping() {
        // biçimsiz invocation_id → rapor-seviyesi (id yok)
        Malformed badId = (Malformed) ModelGovernanceJournalProjection.parseRow(rawRow(
                EvidenceLedgerModelGovernanceJournal.AUTHORIZED_EVENT_TYPE,
                Map.of("invocation_id", JsonValue.of("not-an-id"), "stage", JsonValue.of("authorized"))));
        assertEquals(IntegrityIssue.Kind.MALFORMED_INVOCATION_ID, badId.kind());
        assertNull(badId.invocationId(), "biçimsiz id → invocation'a atfedilemez");

        // eksik stage → UNKNOWN_STAGE (id geçerli → atfedilir)
        Malformed missingStage = (Malformed) ModelGovernanceJournalProjection.parseRow(rawRow(
                EvidenceLedgerModelGovernanceJournal.AUTHORIZED_EVENT_TYPE,
                Map.of("invocation_id", JsonValue.of(VALID_ID))));
        assertEquals(IntegrityIssue.Kind.UNKNOWN_STAGE, missingStage.kind());
        assertEquals(VALID_ID, missingStage.invocationId());

        // bilinmeyen stage token → UNKNOWN_STAGE
        Malformed bogusStage = (Malformed) ModelGovernanceJournalProjection.parseRow(rawRow(
                EvidenceLedgerModelGovernanceJournal.REJECTED_EVENT_TYPE,
                Map.of("invocation_id", JsonValue.of(VALID_ID), "stage", JsonValue.of("bogus_stage"))));
        assertEquals(IntegrityIssue.Kind.UNKNOWN_STAGE, bogusStage.kind());

        // stage↔eventType tutarsız (authorized eventType + attested stage) → mismatch
        Malformed mismatch = (Malformed) ModelGovernanceJournalProjection.parseRow(rawRow(
                EvidenceLedgerModelGovernanceJournal.AUTHORIZED_EVENT_TYPE,
                Map.of("invocation_id", JsonValue.of(VALID_ID), "stage", JsonValue.of("attested"))));
        assertEquals(IntegrityIssue.Kind.STAGE_EVENT_TYPE_MISMATCH, mismatch.kind());
        assertEquals(VALID_ID, mismatch.invocationId());

        // rejected eventType + authorized stage → mismatch (rejected yalnız rejection-stage kümesini taşır)
        Malformed rejectedWithAuth = (Malformed) ModelGovernanceJournalProjection.parseRow(rawRow(
                EvidenceLedgerModelGovernanceJournal.REJECTED_EVENT_TYPE,
                Map.of("invocation_id", JsonValue.of(VALID_ID), "stage", JsonValue.of("authorized"))));
        assertEquals(IntegrityIssue.Kind.STAGE_EVENT_TYPE_MISMATCH, rejectedWithAuth.kind());

        // governance-prefix'li ama payload YOK → rapor-seviyesi MALFORMED_PAYLOAD
        LedgerEntry noPayload = new LedgerEntry(T, A, I,
                EvidenceLedgerModelGovernanceJournal.AUTHORIZED_EVENT_TYPE, "2026-07-13T10:00:00Z",
                "idem", "hash", null, new EvidenceId("ev-null"), 1, "prev", "eh");
        Malformed nullPayload = (Malformed) ModelGovernanceJournalProjection.parseRow(noPayload);
        assertEquals(IntegrityIssue.Kind.MALFORMED_PAYLOAD, nullPayload.kind());
        assertNull(nullPayload.invocationId());
    }

    @Test
    void project_surfaces_malformed_rows_as_issues_and_marks_parseable_invocation_anomalous() {
        List<LedgerEntry> entries = List.of(
                // journal-dışı → atlanır, bulgu üretmez
                rawRow("transcript.created", Map.of("x", JsonValue.of("y"))),
                // bilinmeyen stage ama geçerli id → o invocation INTEGRITY_ANOMALY + bulgu
                rawRow(EvidenceLedgerModelGovernanceJournal.REJECTED_EVENT_TYPE,
                        Map.of("invocation_id", JsonValue.of(ID_ORPHAN), "stage", JsonValue.of("bogus_stage"))),
                // biçimsiz id → rapor-seviyesi bulgu (invocations'a girmez)
                rawRow(EvidenceLedgerModelGovernanceJournal.AUTHORIZED_EVENT_TYPE,
                        Map.of("invocation_id", JsonValue.of("not-an-id"), "stage", JsonValue.of("authorized"))));
        ProjectionResult result = ModelGovernanceJournalProjection.project(entries);
        // bozuk-ama-parse-edilebilir invocation makinece GÖRÜNÜR (silent-skip YASAK)
        assertEquals(InvocationIntegrity.INTEGRITY_ANOMALY, result.invocations().get(ID_ORPHAN));
        assertEquals(1, result.invocations().size(), "yalnız parse-edilebilir-id invocation haritada");
        assertEquals(2, result.issues().size(), "iki governance-bozuk satır iki bulgu (journal-dışı üretmez)");
        assertTrue(result.issues().stream().anyMatch(i ->
                i.kind() == IntegrityIssue.Kind.UNKNOWN_STAGE && ID_ORPHAN.equals(i.invocationId())));
        assertTrue(result.issues().stream().anyMatch(i ->
                i.kind() == IntegrityIssue.Kind.MALFORMED_INVOCATION_ID && i.invocationId() == null));
    }

    @Test
    void project_malformed_row_taints_otherwise_good_invocation() {
        // Aynı invocation için geçerli authorized+attested (COMPLETE_INVOKED olurdu) + bozuk satır → override ANOMALY.
        List<LedgerEntry> entries = List.of(
                journalRow(ID_OK, JournalStage.AUTHORIZED),
                journalRow(ID_OK, JournalStage.ATTESTED),
                rawRow(EvidenceLedgerModelGovernanceJournal.REJECTED_EVENT_TYPE,
                        Map.of("invocation_id", JsonValue.of(ID_OK), "stage", JsonValue.of("bogus_stage"))));
        ProjectionResult result = ModelGovernanceJournalProjection.project(entries);
        assertEquals(InvocationIntegrity.INTEGRITY_ANOMALY, result.invocations().get(ID_OK),
                "bozuk satır iyi-sınıflandırmayı override etmeli");
        assertEquals(1, result.issues().size());
    }

    @Test
    void integrity_issue_enforces_report_level_invariant() {
        // rapor-seviyesi bulgu invocationId taşıyamaz; invocation-bağlı bulgu geçerli id taşımalı (fail-closed).
        org.junit.jupiter.api.Assertions.assertThrows(IllegalArgumentException.class,
                () -> new IntegrityIssue(VALID_ID, IntegrityIssue.Kind.MALFORMED_INVOCATION_ID));
        org.junit.jupiter.api.Assertions.assertThrows(IllegalArgumentException.class,
                () -> new IntegrityIssue(null, IntegrityIssue.Kind.UNKNOWN_STAGE));
    }
}
