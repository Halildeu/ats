package com.ats.governance;

import com.ats.contracts.EvidenceLedger.LedgerEntry;
import com.ats.kernel.JsonValue;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * gov1-1d crash-gap projeksiyonu (SAF state-machine; framework/persistence YOK). WORM
 * invocation-journal event'lerini {@code invocation_id}'ye göre eşleştirir ve her invocation'ın
 * bütünlük-durumunu MAKİNE-tespit eder — dokümantasyon iddiası değil, {@code classify} test'iyle
 * kanıtlanır. (Sürekli monitör + runbook sonraki ops işidir; burada yalnız saf çekirdek.)
 *
 * <p>Durum matrisi (Codex full ordering):
 * <ul>
 *   <li>AUTHORIZED + tam-1 post-provider terminal → {@link InvocationIntegrity#COMPLETE_INVOKED}</li>
 *   <li>yalnız PREFLIGHT_REJECTED terminal → {@link InvocationIntegrity#COMPLETE_NON_INVOKED}</li>
 *   <li>AUTHORIZED + terminal YOK → {@link InvocationIntegrity#INCOMPLETE_CRASH_GAP}</li>
 *   <li>post-provider terminal + AUTHORIZED YOK → {@link InvocationIntegrity#INTEGRITY_ANOMALY}</li>
 *   <li>çok-terminal (veya çok-authorized / authorized+preflight çelişkisi) → {@link
 *       InvocationIntegrity#INTEGRITY_ANOMALY}</li>
 * </ul>
 */
public final class ModelGovernanceJournalProjection {

    private static final String EVENT_TYPE_PREFIX = "ai_pipeline.model_governance.invocation_";

    private ModelGovernanceJournalProjection() {}

    /** Bir invocation'ın bütünlük sınıflandırması (crash-gap makine-tespit çıktısı). */
    public enum InvocationIntegrity {
        /** authorized + tam-1 post-provider terminal (model çağrıldı, döngü tamam). */
        COMPLETE_INVOKED,
        /** yalnız preflight-red terminal (provider hiç çağrılmadı, temiz reddedildi). */
        COMPLETE_NON_INVOKED,
        /** authorized VAR, terminal YOK — çağrı ile terminal arası crash-gap. */
        INCOMPLETE_CRASH_GAP,
        /** çelişkili/kopuk journal (orphan post-provider terminal, çok-terminal, çok-authorized). */
        INTEGRITY_ANOMALY
    }

    /** Tek invocation'a ait gözlenen journal event'i (WORM satırından türetildi). */
    record JournalRecord(String invocationId, JournalStage stage) {
        JournalRecord {
            if (invocationId == null || invocationId.isBlank()) {
                throw new IllegalArgumentException("JournalRecord.invocationId zorunlu (fail-closed)");
            }
            if (stage == null) {
                throw new IllegalArgumentException("JournalRecord.stage zorunlu (fail-closed)");
            }
        }
    }

    /**
     * WORM {@link LedgerEntry}'den journal-record çıkarır; journal-event değilse VEYA
     * invocation_id/stage bozuk/eksikse {@link Optional#empty()} (fail-closed: bozuk satır
     * sınıflandırmaya girmez).
     */
    static Optional<JournalRecord> fromLedger(LedgerEntry entry) {
        if (entry == null || entry.eventType() == null
                || !entry.eventType().startsWith(EVENT_TYPE_PREFIX) || entry.payload() == null) {
            return Optional.empty();
        }
        Map<String, JsonValue> values = entry.payload().values();
        String invocationId = values.get("invocation_id") instanceof JsonValue.JsonString s ? s.value() : null;
        JournalStage stage = values.get("stage") instanceof JsonValue.JsonString s
                ? JournalStage.fromToken(s.value()) : null;
        if (invocationId == null || invocationId.isBlank() || stage == null) {
            return Optional.empty();
        }
        return Optional.of(new JournalRecord(invocationId, stage));
    }

    /**
     * WORM satır listesinden {@code invocation_id → bütünlük} haritası. Journal-olmayan/bozuk
     * satırlar atlanır (ops monitörünün gerçek okuma yüzeyi).
     */
    public static Map<String, InvocationIntegrity> classifyLedger(List<LedgerEntry> entries) {
        List<JournalRecord> records = new ArrayList<>();
        for (LedgerEntry e : entries) {
            fromLedger(e).ifPresent(records::add);
        }
        return classify(records);
    }

    /** Saf state-machine: {@code invocation_id → bütünlük}. */
    static Map<String, InvocationIntegrity> classify(List<JournalRecord> records) {
        Map<String, List<JournalStage>> byId = new LinkedHashMap<>();
        for (JournalRecord r : records) {
            byId.computeIfAbsent(r.invocationId(), k -> new ArrayList<>()).add(r.stage());
        }
        Map<String, InvocationIntegrity> out = new LinkedHashMap<>();
        for (Map.Entry<String, List<JournalStage>> e : byId.entrySet()) {
            out.put(e.getKey(), classifyOne(e.getValue()));
        }
        return out;
    }

    private static InvocationIntegrity classifyOne(List<JournalStage> stages) {
        int authorized = 0;
        int terminals = 0;
        int postProviderTerminals = 0;
        int preflightTerminals = 0;
        for (JournalStage s : stages) {
            if (s == JournalStage.AUTHORIZED) {
                authorized++;
            } else if (s.terminal()) {
                terminals++;
                if (s.postProvider()) {
                    postProviderTerminals++;
                } else {
                    preflightTerminals++;
                }
            }
        }
        if (terminals >= 2) {
            return InvocationIntegrity.INTEGRITY_ANOMALY;   // çok-terminal (idempotency/bütünlük)
        }
        if (authorized >= 2) {
            return InvocationIntegrity.INTEGRITY_ANOMALY;   // çok-authorized (defansif)
        }
        // authorized ∈ {0,1}, terminals ∈ {0,1}
        if (authorized == 1 && terminals == 0) {
            return InvocationIntegrity.INCOMPLETE_CRASH_GAP;
        }
        if (authorized == 1 && terminals == 1) {
            // authorized yalnız post-provider terminal ile bir arada olur (preflight-red ile ÇELİŞKİ).
            return postProviderTerminals == 1
                    ? InvocationIntegrity.COMPLETE_INVOKED
                    : InvocationIntegrity.INTEGRITY_ANOMALY;
        }
        if (authorized == 0 && terminals == 1) {
            // preflight-red-only → non-invoked; post-provider terminal + authorized-yok → anomali.
            return preflightTerminals == 1
                    ? InvocationIntegrity.COMPLETE_NON_INVOKED
                    : InvocationIntegrity.INTEGRITY_ANOMALY;
        }
        // authorized==0 && terminals==0: id en az bir event'ten türedi → buraya düşmemeli (defansif).
        return InvocationIntegrity.INTEGRITY_ANOMALY;
    }
}
