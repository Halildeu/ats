package com.ats.governance;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.contracts.EvidenceLedger.LedgerEntry;
import com.ats.governance.ModelGovernanceJournalProjection.InvocationIntegrity;
import com.ats.governance.ModelGovernanceJournalProjection.JournalRecord;
import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.EvidenceId;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.JsonValue;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/**
 * gov1-1d crash-gap projeksiyonu state-machine KANITI (dokümantasyon iddiası değil): 5 durum +
 * post-provider varyant + çok-invocation + WORM-satır çıkarımı + bozuk/journal-olmayan satır atlama.
 */
class ModelGovernanceJournalProjectionTest {

    private static final TenantId T = new TenantId("t1");
    private static final ActorId A = new ActorId("a1");
    private static final InterviewId I = new InterviewId("iv1");

    private static InvocationIntegrity classify(String id, JournalStage... stages) {
        List<JournalRecord> records = new ArrayList<>();
        for (JournalStage s : stages) {
            records.add(new JournalRecord(id, s));
        }
        return ModelGovernanceJournalProjection.classify(records).get(id);
    }

    /* ---- 5-durum state-machine ---- */

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
                new JournalRecord("orphan", JournalStage.ATTESTED));
        Map<String, InvocationIntegrity> out = ModelGovernanceJournalProjection.classify(records);
        assertEquals(InvocationIntegrity.COMPLETE_INVOKED, out.get("ok"));
        assertEquals(InvocationIntegrity.INCOMPLETE_CRASH_GAP, out.get("gap"));
        assertEquals(InvocationIntegrity.COMPLETE_NON_INVOKED, out.get("clean"));
        assertEquals(InvocationIntegrity.INTEGRITY_ANOMALY, out.get("orphan"));
    }

    /* ---- WORM-satır çıkarımı (fromLedger + classifyLedger) ---- */

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
    void classify_ledger_extracts_journal_rows_and_skips_others() {
        List<LedgerEntry> entries = List.of(
                journalRow("ok", JournalStage.AUTHORIZED),
                journalRow("ok", JournalStage.ATTESTED),
                journalRow("gap", JournalStage.AUTHORIZED),
                // journal-OLMAYAN business satırı → atlanır (haritaya girmez)
                rawRow("transcript.created", Map.of("transcript_key", JsonValue.of("k"))));
        Map<String, InvocationIntegrity> out = ModelGovernanceJournalProjection.classifyLedger(entries);
        assertEquals(2, out.size(), "yalnız journal invocation'ları sınıflandırılmalı");
        assertEquals(InvocationIntegrity.COMPLETE_INVOKED, out.get("ok"));
        assertEquals(InvocationIntegrity.INCOMPLETE_CRASH_GAP, out.get("gap"));
        assertFalse(out.containsKey("k"));
    }

    @Test
    void from_ledger_skips_non_journal_and_malformed_rows() {
        // journal-olmayan eventType → empty
        assertTrue(ModelGovernanceJournalProjection.fromLedger(
                rawRow("transcript.created",
                        Map.of("invocation_id", JsonValue.of("x"), "stage", JsonValue.of("authorized"))))
                .isEmpty());
        // journal eventType ama stage EKSİK → empty (bozuk satır)
        assertTrue(ModelGovernanceJournalProjection.fromLedger(
                rawRow(EvidenceLedgerModelGovernanceJournal.AUTHORIZED_EVENT_TYPE,
                        Map.of("invocation_id", JsonValue.of("x"))))
                .isEmpty());
        // journal eventType ama BİLİNMEYEN stage token → empty (fail-closed)
        assertTrue(ModelGovernanceJournalProjection.fromLedger(
                rawRow(EvidenceLedgerModelGovernanceJournal.REJECTED_EVENT_TYPE,
                        Map.of("invocation_id", JsonValue.of("x"), "stage", JsonValue.of("bogus_stage"))))
                .isEmpty());
        // geçerli journal satırı → present
        Optional<JournalRecord> ok = ModelGovernanceJournalProjection.fromLedger(
                journalRow("x", JournalStage.ATTESTED));
        assertTrue(ok.isPresent());
        assertEquals("x", ok.get().invocationId());
        assertEquals(JournalStage.ATTESTED, ok.get().stage());
    }
}
