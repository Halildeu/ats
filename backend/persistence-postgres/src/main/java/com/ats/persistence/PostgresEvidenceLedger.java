package com.ats.persistence;

import com.ats.contracts.EvidenceLedger;
import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.EvidenceId;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.JsonCodec;
import com.ats.kernel.JsonValue;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import javax.sql.DataSource;

/**
 * ATS-0018 slice-8a — `worm_ledger` PostgreSQL adapter'ı (plain-JDBC; JPA YOK).
 *
 * İnvariantlar (ADR "8a-invariant seti" birebir):
 * - Append-only: UPDATE/DELETE/TRUNCATE DB-trigger'la reddedilir (migration); adapter yalnız
 *   INSERT/SELECT üretir.
 * - Per-tenant hash-chain: append, {@code pg_advisory_xact_lock(tenant)} ile tenant-başına
 *   serileştirilir; genesis prev_hash = "genesis"; entry_hash = sha256(prev_hash || tenant ||
 *   evidence || actor || interview || event_type || occurred_at || idempotency_key ||
 *   content_hash || canonical(payload)) — alan listesi SABİT (ADR), seq hash'e girmez.
 * - Idempotency TENANT-SCOPED: aynı (tenant, idempotency_key) ile tekrar append AYNI entry'yi
 *   döner (güvenli yeniden-koşu; 23505 → mevcut satır okunur).
 * - Tombstone = ayrı satır ({@code event_type='evidence.tombstoned'}; payload = hedef evidence_id
 *   + reason POINTER-only); hedef satır tenant-scope'ta VAR olmalı; hedef DEĞİŞMEZ.
 * - Payload minimizasyonu: content/raw-pii/secret sınıfı ANAHTAR taşıyan payload append EDİLMEZ
 *   (data-lifecycle WORM-içerik-yasağının adapter tarafı; derin key-scan).
 * DÜRÜST SINIR: kolon-düzeyi envelope-encryption/crypto-erase ATS-0007 dilimi; DSN/kimlik deploy
 * düzlemi (Vault/ats-gitops). "Prod'da çalışıyor" iddiası yok — davranış Testcontainers-PG'de kanıtlı.
 */
public final class PostgresEvidenceLedger implements EvidenceLedger {

    static final String GENESIS = "genesis";
    static final String TOMBSTONE_EVENT_TYPE = "evidence.tombstoned";
    private static final String[] FORBIDDEN_PAYLOAD_KEY_SUBSTRINGS = {
            "content", "raw_text", "transcript_text", "raw_pii", "secret", "password", "token", "claim_text"
    };

    private final DataSource dataSource;

    public PostgresEvidenceLedger(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public Outcome<LedgerEntry> append(EvidenceEvent e) {
        if (e == null || e.tenantId() == null || e.actorId() == null || e.interviewId() == null
                || isBlank(e.eventType()) || isBlank(e.occurredAt()) || isBlank(e.idempotencyKey())
                || isBlank(e.contentHash()) || e.payload() == null) {
            return Outcome.fail(OutcomeCode.INVALID, "EvidenceEvent alanları eksik/boş olamaz");
        }
        String forbidden = forbiddenPayloadKey(e.payload());
        if (forbidden != null) {
            return Outcome.fail(OutcomeCode.INVALID,
                    "payload WORM-içerik-yasağını ihlal ediyor (pointer/meta-only): " + forbidden);
        }
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try {
                advisoryLock(c, e.tenantId().value());
                String prevHash = lastEntryHash(c, e.tenantId().value());
                String evidenceId = "ev-" + UUID.randomUUID();
                String canonicalPayload = JsonCodec.canonical(e.payload());
                String entryHash = entryHash(prevHash, e, evidenceId, canonicalPayload);
                long seq;
                try (PreparedStatement ps = c.prepareStatement(
                        "INSERT INTO worm_ledger (tenant_id, evidence_id, actor_ref, interview_id, event_type,"
                                + " occurred_at, idempotency_key, content_hash, payload, prev_hash, entry_hash)"
                                + " VALUES (?,?,?,?,?,?,?,?,?::jsonb,?,?) RETURNING seq")) {
                    ps.setString(1, e.tenantId().value());
                    ps.setString(2, evidenceId);
                    ps.setString(3, e.actorId().value());
                    ps.setString(4, e.interviewId().value());
                    ps.setString(5, e.eventType());
                    ps.setString(6, e.occurredAt());
                    ps.setString(7, e.idempotencyKey());
                    ps.setString(8, e.contentHash());
                    ps.setString(9, canonicalPayload);
                    ps.setString(10, prevHash);
                    ps.setString(11, entryHash);
                    try (ResultSet rs = ps.executeQuery()) {
                        rs.next();
                        seq = rs.getLong(1);
                    }
                }
                c.commit();
                return Outcome.ok(new LedgerEntry(e.tenantId(), e.actorId(), e.interviewId(), e.eventType(),
                        e.occurredAt(), e.idempotencyKey(), e.contentHash(), e.payload(),
                        new EvidenceId(evidenceId), seq, prevHash, entryHash));
            } catch (SQLException inner) {
                c.rollback();
                if ("23505".equals(inner.getSQLState())
                        && String.valueOf(inner.getMessage()).contains("worm_ledger_tenant_idempotency_uq")) {
                    // Codex 8a blocker-1: replay YALNIZ içerik birebir aynıysa idempotent sayılır.
                    // Kimlik = eventType+actor+interview+content_hash+canonical(payload)
                    // (occurred_at HARİÇ — meşru retry zamanı yeniden damgalayabilir; belgelendi).
                    // İçerik farklıysa bu bir ÇAKIŞMADIR: eski satır "OK" diye dönmez, fail-closed.
                    Outcome<LedgerEntry> existing = findByIdempotency(e.tenantId(), e.idempotencyKey());
                    if (!(existing instanceof Outcome.Ok<LedgerEntry> exOk)) {
                        return existing;
                    }
                    LedgerEntry prior = exOk.value();
                    boolean identical = prior.eventType().equals(e.eventType())
                            && prior.actorId().value().equals(e.actorId().value())
                            && prior.interviewId().value().equals(e.interviewId().value())
                            && prior.contentHash().equals(e.contentHash())
                            && JsonCodec.canonical(prior.payload()).equals(JsonCodec.canonical(e.payload()));
                    if (!identical) {
                        return Outcome.fail(OutcomeCode.INVALID,
                                "idempotency conflict: aynı (tenant, idempotency_key) farklı içerikle yeniden kullanılamaz (fail-closed)");
                    }
                    return existing;
                }
                return sqlFail(inner);
            }
        } catch (SQLException outer) {
            return sqlFail(outer);
        }
    }

    @Override
    public Outcome<LedgerEntry> appendTombstoneEvent(
            TenantId tenantId, ActorId actorId, InterviewId interviewId, EvidenceId targetEvidenceId, String reason) {
        if (tenantId == null || actorId == null || interviewId == null || targetEvidenceId == null || isBlank(reason)) {
            return Outcome.fail(OutcomeCode.INVALID, "tombstone alanları eksik/boş olamaz");
        }
        Outcome<LedgerEntry> target = getById(tenantId, targetEvidenceId);
        if (!(target instanceof Outcome.Ok<LedgerEntry>)) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "tombstone hedefi tenant-scope'ta yok: " + targetEvidenceId.value());
        }
        // Codex 8a blocker-2 — SEMANTİK NET: hedef başına TEK tombstone satırı.
        // Aynı reason ile replay → idempotent (blocker-1 içerik-eşleşmesi occurred_at'ı dışladığı
        // için güvenli). FARKLI reason ile ikinci tombstone → idempotency-conflict FAIL (sessiz
        // "OK" yok); ayrı denetim olayı gerekiyorsa yeni event-type ile ayrı append tasarlanır.
        JsonValue.JsonObject payload = JsonValue.object(Map.of(
                "target_evidence_id", JsonValue.of(targetEvidenceId.value()),
                "reason_code", JsonValue.of(reason)));
        String contentHash = sha256Hex("tombstone|" + targetEvidenceId.value() + "|" + reason);
        return append(new EvidenceEvent(tenantId, actorId, interviewId, TOMBSTONE_EVENT_TYPE,
                java.time.OffsetDateTime.now(java.time.ZoneOffset.UTC).toString(),
                tenantId.value() + ":tombstone:" + targetEvidenceId.value(), contentHash, payload));
    }

    @Override
    public Outcome<LedgerEntry> getById(TenantId tenantId, EvidenceId id) {
        if (tenantId == null || id == null) {
            return Outcome.fail(OutcomeCode.INVALID, "tenant/evidenceId zorunlu");
        }
        return queryOne("SELECT * FROM worm_ledger WHERE tenant_id = ? AND evidence_id = ?",
                tenantId.value(), id.value());
    }

    @Override
    public Outcome<List<LedgerEntry>> list(TenantId tenantId, LedgerListFilter filter) {
        if (tenantId == null) {
            return Outcome.fail(OutcomeCode.INVALID, "tenant zorunlu");
        }
        StringBuilder sql = new StringBuilder("SELECT * FROM worm_ledger WHERE tenant_id = ?");
        List<String> args = new ArrayList<>();
        args.add(tenantId.value());
        if (filter != null && filter.interviewId() != null) {
            sql.append(" AND interview_id = ?");
            args.add(filter.interviewId().value());
        }
        if (filter != null && filter.eventType() != null) {
            sql.append(" AND event_type = ?");
            args.add(filter.eventType());
        }
        sql.append(" ORDER BY seq");
        try (Connection c = dataSource.getConnection();
                PreparedStatement ps = c.prepareStatement(sql.toString())) {
            for (int k = 0; k < args.size(); k++) {
                ps.setString(k + 1, args.get(k));
            }
            try (ResultSet rs = ps.executeQuery()) {
                List<LedgerEntry> out = new ArrayList<>();
                while (rs.next()) {
                    out.add(mapRow(rs));
                }
                return Outcome.ok(List.copyOf(out));
            }
        } catch (SQLException ex) {
            return sqlFail(ex);
        }
    }

    /** Zincir doğrulaması (ops/denetim): tenant'ın tüm satırlarında entry_hash yeniden hesaplanır. */
    public Outcome<Integer> verifyChain(TenantId tenantId) {
        Outcome<List<LedgerEntry>> all = list(tenantId, null);
        if (!(all instanceof Outcome.Ok<List<LedgerEntry>> ok)) {
            return Outcome.fail(((Outcome.Fail<List<LedgerEntry>>) all).code(), ((Outcome.Fail<List<LedgerEntry>>) all).reason());
        }
        String prev = GENESIS;
        for (LedgerEntry entry : ok.value()) {
            if (!prev.equals(entry.previousHash())) {
                return Outcome.fail(OutcomeCode.INVALID, "zincir kopuk @seq=" + entry.sequence());
            }
            String recomputed = entryHash(prev,
                    new EvidenceEvent(entry.tenantId(), entry.actorId(), entry.interviewId(), entry.eventType(),
                            entry.occurredAt(), entry.idempotencyKey(), entry.contentHash(), entry.payload()),
                    entry.evidenceId().value(), JsonCodec.canonical(entry.payload()));
            if (!recomputed.equals(entry.entryHash())) {
                return Outcome.fail(OutcomeCode.INVALID, "entry_hash uyuşmazlığı @seq=" + entry.sequence());
            }
            prev = entry.entryHash();
        }
        return Outcome.ok(ok.value().size());
    }

    // ---------- internals ----------

    private Outcome<LedgerEntry> findByIdempotency(TenantId tenantId, String idempotencyKey) {
        return queryOne("SELECT * FROM worm_ledger WHERE tenant_id = ? AND idempotency_key = ?",
                tenantId.value(), idempotencyKey);
    }

    private Outcome<LedgerEntry> queryOne(String sql, String a1, String a2) {
        try (Connection c = dataSource.getConnection();
                PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, a1);
            ps.setString(2, a2);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    return Outcome.fail(OutcomeCode.NOT_FOUND, "ledger entry yok (tenant-scope)");
                }
                return Outcome.ok(mapRow(rs));
            }
        } catch (SQLException ex) {
            return sqlFail(ex);
        }
    }

    private static LedgerEntry mapRow(ResultSet rs) throws SQLException {
        JsonValue parsed;
        try {
            parsed = JsonCodec.parse(rs.getString("payload"));
        } catch (JsonCodec.JsonCodecException e) {
            throw new SQLException("payload jsonb parse edilemedi: " + e.getMessage());
        }
        if (!(parsed instanceof JsonValue.JsonObject payload)) {
            throw new SQLException("payload object değil");
        }
        return new LedgerEntry(
                new TenantId(rs.getString("tenant_id")),
                new ActorId(rs.getString("actor_ref")),
                new InterviewId(rs.getString("interview_id")),
                rs.getString("event_type"),
                rs.getString("occurred_at"),
                rs.getString("idempotency_key"),
                rs.getString("content_hash"),
                payload,
                new EvidenceId(rs.getString("evidence_id")),
                rs.getLong("seq"),
                rs.getString("prev_hash"),
                rs.getString("entry_hash"));
    }

    private static void advisoryLock(Connection c, String tenant) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("SELECT pg_advisory_xact_lock(hashtext(?))")) {
            ps.setString(1, "worm_ledger:" + tenant);
            ps.execute();
        }
    }

    private static String lastEntryHash(Connection c, String tenant) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
                "SELECT entry_hash FROM worm_ledger WHERE tenant_id = ? ORDER BY seq DESC LIMIT 1")) {
            ps.setString(1, tenant);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? rs.getString(1) : GENESIS;
            }
        }
    }

    /** ADR-0018 sabit alan-listesi — seq hash'e GİRMEZ (zincir prev_hash ile bağlı). */
    private static String entryHash(String prevHash, EvidenceEvent e, String evidenceId, String canonicalPayload) {
        return sha256Hex(String.join("|",
                prevHash, e.tenantId().value(), evidenceId, e.actorId().value(), e.interviewId().value(),
                e.eventType(), e.occurredAt(), e.idempotencyKey(), e.contentHash(), canonicalPayload));
    }

    private static String forbiddenPayloadKey(JsonValue v) {
        switch (v) {
            case JsonValue.JsonObject o -> {
                for (Map.Entry<String, JsonValue> entry : o.values().entrySet()) {
                    String k = entry.getKey().toLowerCase(Locale.ROOT);
                    for (String f : FORBIDDEN_PAYLOAD_KEY_SUBSTRINGS) {
                        if (k.contains(f)) {
                            return entry.getKey();
                        }
                    }
                    String nested = forbiddenPayloadKey(entry.getValue());
                    if (nested != null) {
                        return nested;
                    }
                }
                return null;
            }
            case JsonValue.JsonArray a -> {
                for (JsonValue item : a.items()) {
                    String nested = forbiddenPayloadKey(item);
                    if (nested != null) {
                        return nested;
                    }
                }
                return null;
            }
            default -> {
                return null;
            }
        }
    }

    private static <T> Outcome<T> sqlFail(SQLException ex) {
        return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "ledger DB hatası (fail-closed): " + ex.getSQLState());
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    private static String sha256Hex(String text) {
        try {
            return HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 mevcut olmalı", e);
        }
    }
}
