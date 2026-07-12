package com.ats.governance;

import com.ats.contracts.EvidenceLedger.LedgerEntry;
import com.ats.contracts.governance.ModelInvocationId;
import com.ats.kernel.JsonValue;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * gov1-1d crash-gap projeksiyonu (SAF state-machine; framework/persistence YOK). WORM
 * invocation-journal event'lerini {@code invocation_id}'ye göre eşleştirir ve her invocation'ın
 * bütünlük-durumunu MAKİNE-tespit eder — dokümantasyon iddiası değil, {@code classify}/{@code project}
 * test'iyle kanıtlanır. (Sürekli monitör + runbook sonraki ops işidir; burada yalnız saf çekirdek.)
 *
 * <p>Durum matrisi (Codex full ordering):
 * <ul>
 *   <li>AUTHORIZED + tam-1 post-provider terminal → {@link InvocationIntegrity#COMPLETE_INVOKED}</li>
 *   <li>yalnız PREFLIGHT_REJECTED terminal (authorized'sız) → {@link InvocationIntegrity#COMPLETE_NON_INVOKED}</li>
 *   <li>AUTHORIZED + PRE_PROVIDER_REJECTED terminal → {@link InvocationIntegrity#COMPLETE_NON_INVOKED}
 *       (authorized yazıldı ama sağlayıcı çağrılmadı — crash DEĞİL)</li>
 *   <li>AUTHORIZED + terminal YOK → {@link InvocationIntegrity#INCOMPLETE_CRASH_GAP}</li>
 *   <li>terminal↔authorized beklentisi tutmayan (orphan post/pre-provider terminal, authorized+preflight
 *       çelişkisi), çok-terminal, çok-authorized → {@link InvocationIntegrity#INTEGRITY_ANOMALY}</li>
 * </ul>
 *
 * <p><b>Fail-closed görünürlük (Codex 1d blocker-3):</b> journal-prefix'li ({@code
 * ai_pipeline.model_governance.invocation_*}) ama BOZUK satır (payload yok / geçersiz invocation_id /
 * bilinmeyen stage / stage↔eventType tutarsız) SESSİZCE ATLANMAZ — {@link ProjectionResult#issues()}
 * içinde makine-okur bir {@link IntegrityIssue} üretir. Parse-edilebilir invocation_id taşıyan bozuk
 * satır o invocation'ı {@link InvocationIntegrity#INTEGRITY_ANOMALY} yapar; id kullanılamıyorsa
 * rapor-seviyesi bulgu (invocationId null). Journal-DIŞI satır (prefix yok) atlanır.
 */
public final class ModelGovernanceJournalProjection {

    private static final String EVENT_TYPE_PREFIX = "ai_pipeline.model_governance.invocation_";

    private ModelGovernanceJournalProjection() {}

    /** Bir invocation'ın bütünlük sınıflandırması (crash-gap makine-tespit çıktısı). */
    public enum InvocationIntegrity {
        /** authorized + tam-1 post-provider terminal (model çağrıldı, döngü tamam). */
        COMPLETE_INVOKED,
        /** provider hiç çağrılmadan temiz reddedildi (preflight-red-only VEYA authorized+pre-provider-red). */
        COMPLETE_NON_INVOKED,
        /** authorized VAR, terminal YOK — çağrı ile terminal arası crash-gap. */
        INCOMPLETE_CRASH_GAP,
        /** çelişkili/kopuk journal (orphan terminal, çok-terminal, çok-authorized, tutarsız/bozuk satır). */
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
     * Projeksiyon çıktısı: {@code invocation_id → bütünlük} haritası + bozuk governance-satırı
     * bulguları. Bulgular boş olabilir (temiz akış); doluysa ops monitörünün fail-closed sinyalidir
     * (sessiz kayıp YOK). Her iki koleksiyon da değişmez kopya.
     */
    public record ProjectionResult(
            Map<String, InvocationIntegrity> invocations,
            List<IntegrityIssue> issues) {
        public ProjectionResult {
            invocations = Map.copyOf(invocations);
            issues = List.copyOf(issues);
        }
    }

    /**
     * Governance-görünen ama bozuk bir WORM satırının makine-okur bulgusu. {@code invocationId} yalnız
     * invocation'a atfedilebilen bulgularda (id geçerli) doludur; rapor-seviyesi bulgularda null.
     */
    public record IntegrityIssue(String invocationId, Kind kind) {

        /** Bozuk governance-satırı bulgu türü (kapalı küme; ops monitörünün makine-okur yüzeyi). */
        public enum Kind {
            /** governance-prefix'li ama payload YOK (okunamaz) — rapor-seviyesi. */
            MALFORMED_PAYLOAD(true),
            /** invocation_id eksik/blank/JsonString-değil veya gerçek {@link ModelInvocationId} biçiminde değil — rapor-seviyesi. */
            MALFORMED_INVOCATION_ID(true),
            /** stage token eksik/blank/JsonString-değil veya bilinmeyen — invocation'a bağlı (id geçerli). */
            UNKNOWN_STAGE(false),
            /** stage geçerli ama eventType ile tutarsız (ör. authorized eventType + attested stage) — invocation'a bağlı. */
            STAGE_EVENT_TYPE_MISMATCH(false);

            private final boolean reportLevel;

            Kind(boolean reportLevel) {
                this.reportLevel = reportLevel;
            }

            /** true → satır bir invocation'a atfedilemez (id kullanılamaz); bulgu rapor-seviyesidir. */
            public boolean reportLevel() {
                return reportLevel;
            }
        }

        public IntegrityIssue {
            if (kind == null) {
                throw new IllegalArgumentException("IntegrityIssue.kind zorunlu (fail-closed)");
            }
            if (kind.reportLevel() && invocationId != null) {
                throw new IllegalArgumentException(
                        "rapor-seviyesi bulgu invocationId taşıyamaz (fail-closed)");
            }
            if (!kind.reportLevel() && (invocationId == null || invocationId.isBlank())) {
                throw new IllegalArgumentException(
                        "invocation-bağlı bulgu geçerli invocationId taşımalı (fail-closed)");
            }
        }
    }

    /** {@link #parseRow} sonucu (sealed → exhaustive): atla / iyi-record / bozuk-satır bulgusu. */
    sealed interface RowParse permits Skip, Good, Malformed {}

    /** Journal-DIŞI satır (prefix yok) → sınıflandırmaya girmez, bulgu üretmez. */
    record Skip() implements RowParse {}

    /** Geçerli journal satırı → state-machine'e beslenir. */
    record Good(JournalRecord record) implements RowParse {}

    /** Governance-görünen ama bozuk satır → MUTLAKA bulgu (invocationId null → rapor-seviyesi). */
    record Malformed(String invocationId, IntegrityIssue.Kind kind) implements RowParse {}

    /**
     * WORM {@link LedgerEntry}'yi ayrıştırır: journal-dışı → {@link Skip}; geçerli → {@link Good};
     * governance-prefix'li ama bozuk → {@link Malformed} (payload yok / geçersiz invocation_id /
     * bilinmeyen stage / stage↔eventType tutarsız). Bozuk-ama-governance satır ASLA sessizce atlanmaz.
     */
    static RowParse parseRow(LedgerEntry entry) {
        if (entry == null || entry.eventType() == null
                || !entry.eventType().startsWith(EVENT_TYPE_PREFIX)) {
            return new Skip();   // journal-DIŞI (prefix yok) → atlanır
        }
        // Buradan itibaren governance-görünen satır: bozuksa MUTLAKA finding (sessiz kayıp YASAK).
        JsonValue.JsonObject payload = entry.payload();
        if (payload == null) {
            return new Malformed(null, IntegrityIssue.Kind.MALFORMED_PAYLOAD);
        }
        Map<String, JsonValue> values = payload.values();
        String rawId = values.get("invocation_id") instanceof JsonValue.JsonString s ? s.value() : null;
        if (!ModelInvocationId.isValid(rawId)) {
            // id kullanılamaz → invocation'a atfedilemez, rapor-seviyesi bulgu.
            return new Malformed(null, IntegrityIssue.Kind.MALFORMED_INVOCATION_ID);
        }
        JournalStage stage = values.get("stage") instanceof JsonValue.JsonString s
                ? JournalStage.fromToken(s.value()) : null;
        if (stage == null) {
            return new Malformed(rawId, IntegrityIssue.Kind.UNKNOWN_STAGE);
        }
        if (!expectedEventType(stage).equals(entry.eventType())) {
            return new Malformed(rawId, IntegrityIssue.Kind.STAGE_EVENT_TYPE_MISMATCH);
        }
        return new Good(new JournalRecord(rawId, stage));
    }

    /**
     * Stage → beklenen eventType (kanonik; adapter sabitlerine bağlı → vokabüler drift YOK). Rejection
     * aşamalarının tümü tek {@code invocation_rejected} eventType'ını paylaşır (adapter yazım tarafı ile
     * simetrik). Exhaustive switch → yeni stage eklenirse burası derleme-zamanı zorlanır.
     */
    private static String expectedEventType(JournalStage stage) {
        return switch (stage) {
            case AUTHORIZED -> EvidenceLedgerModelGovernanceJournal.AUTHORIZED_EVENT_TYPE;
            case ATTESTED -> EvidenceLedgerModelGovernanceJournal.ATTESTED_EVENT_TYPE;
            case PREFLIGHT_REJECTED, PRE_PROVIDER_REJECTED, PROVIDER_REJECTED, VERIFICATION_REJECTED
                    -> EvidenceLedgerModelGovernanceJournal.REJECTED_EVENT_TYPE;
        };
    }

    /**
     * WORM satır listesinden {@link ProjectionResult}: geçerli satırlar state-machine'e girer;
     * governance-görünen bozuk satırlar {@link IntegrityIssue} üretir (parse-edilebilir invocation_id
     * → o invocation INTEGRITY_ANOMALY'ye override edilir). Journal-dışı satırlar atlanır (ops
     * monitörünün gerçek okuma yüzeyi).
     */
    public static ProjectionResult project(List<LedgerEntry> entries) {
        List<JournalRecord> good = new ArrayList<>();
        List<IntegrityIssue> issues = new ArrayList<>();
        Map<String, InvocationIntegrity> forcedAnomalies = new LinkedHashMap<>();
        for (LedgerEntry e : entries) {
            switch (parseRow(e)) {
                case Skip skip -> { /* journal-dışı satır atlanır */ }
                case Good g -> good.add(g.record());
                case Malformed m -> {
                    issues.add(new IntegrityIssue(m.invocationId(), m.kind()));
                    if (m.invocationId() != null) {
                        // parse-edilebilir invocation_id → bozuk satır o invocation'ı taintler.
                        forcedAnomalies.put(m.invocationId(), InvocationIntegrity.INTEGRITY_ANOMALY);
                    }
                }
            }
        }
        Map<String, InvocationIntegrity> invocations = new LinkedHashMap<>(classify(good));
        invocations.putAll(forcedAnomalies); // malformed-with-id, iyi-satır sınıflandırmasını override eder
        return new ProjectionResult(invocations, issues);
    }

    /** Saf state-machine: {@code invocation_id → bütünlük} (yalnız geçerli record'lar). */
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
        JournalStage terminal = null;
        for (JournalStage s : stages) {
            if (s == JournalStage.AUTHORIZED) {
                authorized++;
            } else if (s.terminal()) {
                terminals++;
                terminal = s;
            }
        }
        if (terminals >= 2) {
            return InvocationIntegrity.INTEGRITY_ANOMALY;   // çok-terminal (idempotency/bütünlük)
        }
        if (authorized >= 2) {
            return InvocationIntegrity.INTEGRITY_ANOMALY;   // çok-authorized (defansif)
        }
        // authorized ∈ {0,1}, terminals ∈ {0,1}
        if (terminals == 0) {
            // authorized==1 → crash-gap; authorized==0 → boş invocation (defansif; buraya düşmemeli).
            return authorized == 1
                    ? InvocationIntegrity.INCOMPLETE_CRASH_GAP
                    : InvocationIntegrity.INTEGRITY_ANOMALY;
        }
        // terminals == 1: terminal'in authorized-beklentisi gerçekle tutmalı.
        boolean hasAuthorized = authorized == 1;
        if (terminal.requiresAuthorized() != hasAuthorized) {
            // preflight-red AUTHORIZED'lı (çelişki) VEYA pre/post-provider terminal AUTHORIZED'sız (orphan).
            return InvocationIntegrity.INTEGRITY_ANOMALY;
        }
        return terminal.postProvider()
                ? InvocationIntegrity.COMPLETE_INVOKED
                : InvocationIntegrity.COMPLETE_NON_INVOKED;
    }
}
