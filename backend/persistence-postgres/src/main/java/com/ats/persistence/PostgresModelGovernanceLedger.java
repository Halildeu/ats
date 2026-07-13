package com.ats.persistence;

import com.ats.contracts.governance.ApprovalStatus;
import com.ats.contracts.governance.Capability;
import com.ats.contracts.governance.GovernanceActorRef;
import com.ats.contracts.governance.ModelApprovalRef;
import com.ats.contracts.governance.ModelGovernanceLedger;
import com.ats.contracts.governance.ModelGovernanceTransition;
import com.ats.contracts.governance.ModelGovernanceTransitionHashChain;
import com.ats.contracts.governance.ModelGovernanceTransitions;
import com.ats.contracts.governance.TransitionId;
import com.ats.contracts.governance.TransitionReason;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import javax.sql.DataSource;

/**
 * gov1-1e-b — {@code model_governance_ledger} PostgreSQL adapter'ı (plain-JDBC; JPA YOK). GLOBAL
 * append-only model-governance transition-WORM'unun READ ({@link ModelGovernanceLedger.Reader}) ve WRITE
 * ({@link ModelGovernanceLedger.Appender}) yüzeylerini TEK concrete adapter'da uygular; ama yetkiler
 * bean-düzleminde AYRILIR (least-privilege — app-boot yalnız Reader'a bağlanır, Appender admin CLI/writer'da;
 * bkz. {@link ModelGovernanceAdminAppender}). {@link InMemoryModelGovernanceLedger} davranış-referansıdır;
 * fark yalnız kalıcılık + GLOBAL concurrency (advisory-lock) katmanıdır.
 *
 * <p><b>İnvariantlar (Codex 019f57cb 1e-b kilit-noktaları birebir):</b>
 * <ul>
 *   <li><b>readAll()</b> — sequence ASC tüm satırlar → row-map → transition list. DB/read/row-map hatası →
 *       {@code Outcome.Fail(NOT_CONFIGURED)} (null/{@code Ok(null)} DÖNMEZ; fail-closed non-null liste).
 *       Boş tablo → {@code Ok(emptyList)} (legit {@link ApprovalStatus#UNINITIALIZED} — "okunamadı" DEĞİL).</li>
 *   <li><b>append()</b> — {@code pg_advisory_xact_lock} (GLOBAL single-chain serialize) altında sıralı:
 *       (i) idempotency-önce (aynı transitionId → semantik-özdeş=idempotent-OK, farklı=CONFLICT);
 *       (ii) expected-from CAS (gerçek-latest (ref,capability) status ≠ expectedFrom → STALE_EXPECTED_FROM);
 *       (iii) matris ({@link ModelGovernanceTransitions#isValidTransition} — illegal → ILLEGAL_TRANSITION);
 *       (iv) append: sequence = GLOBAL-last+1 (0-tabanlı boşluksuz), previous_hash = GLOBAL-last entry_hash
 *       (genesis {@link ModelGovernanceTransitionHashChain#GENESIS_PREVIOUS_HASH}), occurred_at = injected
 *       Clock (caller DEĞİL — backdating YOK), entry_hash = TEK helper. Red → INSERT YOK, tipli
 *       {@link ModelGovernanceLedger.AppendRejection}.</li>
 * </ul>
 *
 * <p><b>occurred_at hash bütünlüğü:</b> {@code entryHash} girdisi {@code Instant.toString()} (String) üstünden
 * hesaplanır; timestamptz round-trip'inin hash'i BOZMAması için occurred_at yazımdan ÖNCE mikrosaniyeye
 * budanır ({@code truncatedTo(MICROS)}) — böylece timestamptz'ın µs çözünürlüğü kaybetmez ve read-tarafı
 * {@code getObject(..,OffsetDateTime).toInstant().toString()} aynı kanonik String'i üretir (recompute == saklanan).
 *
 * <p>DÜRÜST SINIR: bağlantı kimliği/rol seçimi deploy düzlemi (Vault/ats-gitops); "prod'da çalışıyor" iddiası
 * yok — davranış Testcontainers-PG16'da kanıtlı. Bu adapter {@code ApprovedModelRegistry}/{@code resolve}'u
 * DEĞİŞTİRMEZ (registry status-source cutover 1e-c).
 */
public final class PostgresModelGovernanceLedger
        implements ModelGovernanceLedger.Reader, ModelGovernanceLedger.Appender {

    /** GLOBAL tek-zincir serileştirme anahtarı (tenant-scope YOK; tüm append'ler tek advisory-lock'ta sıralanır). */
    private static final String GLOBAL_CHAIN_LOCK_KEY = "model_governance_ledger";
    private static final String GENESIS = ModelGovernanceTransitionHashChain.GENESIS_PREVIOUS_HASH;

    private static final String SELECT_COLUMNS =
            "sequence, transition_id, approval_ref, capability, from_status, to_status, actor_ref,"
                    + " occurred_at, reason_code, previous_hash, entry_hash";

    private final DataSource dataSource;
    private final Clock clock;

    public PostgresModelGovernanceLedger(DataSource dataSource, Clock clock) {
        if (dataSource == null) {
            throw new IllegalArgumentException("dataSource zorunlu (fail-closed)");
        }
        if (clock == null) {
            throw new IllegalArgumentException("clock zorunlu (fail-closed; injected Clock — backdating YOK)");
        }
        this.dataSource = dataSource;
        this.clock = clock;
    }

    // ---------------- Reader ----------------

    @Override
    public Outcome<List<ModelGovernanceTransition>> readAll() {
        try (Connection c = dataSource.getConnection();
                PreparedStatement ps = c.prepareStatement(
                        "SELECT " + SELECT_COLUMNS + " FROM model_governance_ledger ORDER BY sequence ASC");
                ResultSet rs = ps.executeQuery()) {
            List<ModelGovernanceTransition> out = new ArrayList<>();
            while (rs.next()) {
                out.add(mapRow(rs));
            }
            // Boş tablo → Ok(emptyList) (legit UNINITIALIZED); non-empty → Ok(immutable-copy).
            return Outcome.ok(List.copyOf(out));
        } catch (SQLException | RuntimeException ex) {
            // DB down / read / row-map (bozuk saklı değer → value-object/record kurucusu fırlatır) hepsi
            // fail-closed: tüketici projeksiyon YAPMAZ (APPROVED asla türetilmez). null/Ok(null) YOK.
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED,
                    "model-governance WORM okunamadı (fail-closed): " + shortReason(ex));
        }
    }

    // ---------------- Appender ----------------

    @Override
    public Outcome<ModelGovernanceTransition> append(ModelGovernanceLedger.AppendCommand command) {
        if (command == null) {
            return reject(ModelGovernanceLedger.AppendRejection.INVALID_COMMAND);
        }
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try {
                advisoryLock(c); // GLOBAL single-chain: bu txn commit/rollback'e kadar tüm append'ler bekler.

                // (i) Idempotency-önce: aynı transitionId varsa semantik-özdeş → idempotent-OK; farklı → conflict.
                ModelGovernanceTransition existing = findByTransitionId(c, command.transitionId().value());
                if (existing != null) {
                    Outcome<ModelGovernanceTransition> idem = contentMatches(existing, command)
                            ? Outcome.ok(existing)
                            : reject(ModelGovernanceLedger.AppendRejection.TRANSITION_ID_CONFLICT);
                    c.rollback(); // salt-okuma; yazım yok (idempotent replay çift-yazmaz).
                    return idem;
                }

                // (ii) expected-from CAS: gerçek-latest (ref,capability) status == command.expectedFrom olmalı.
                ApprovalStatus actualFrom = latestStatus(c, command.approvalRef(), command.capability());
                if (command.expectedFrom() != actualFrom) {
                    c.rollback();
                    return reject(ModelGovernanceLedger.AppendRejection.STALE_EXPECTED_FROM);
                }

                // (iii) matris + gerekçe-tutarlılığı (expectedFrom == actualFrom bu noktada).
                if (!ModelGovernanceTransitions.isValidTransition(
                        command.expectedFrom(), command.toStatus(), command.reasonCode())) {
                    c.rollback();
                    return reject(ModelGovernanceLedger.AppendRejection.ILLEGAL_TRANSITION);
                }

                // (iv) Üretim: GLOBAL-last (sequence, entry_hash) → sequence+1 (0-tabanlı boşluksuz), prev_hash.
                GlobalTail tail = globalTail(c);
                long sequence = tail.sequence() + 1L; // boş → -1+1 = 0 (genesis)
                String previousHash = tail.entryHash(); // boş → GENESIS
                // occurred_at: injected Clock; timestamptz µs round-trip için MICROS'a budanır (hash-safe).
                Instant occurredInstant = clock.instant().truncatedTo(ChronoUnit.MICROS);
                String occurredAt = occurredInstant.toString();
                String entryHash = ModelGovernanceTransitionHashChain.entryHash(
                        previousHash, command.transitionId(), command.approvalRef(), command.capability(),
                        command.expectedFrom(), command.toStatus(), command.actorRef(), occurredAt,
                        command.reasonCode(), sequence);

                insert(c, command, sequence, occurredInstant, occurredAt, previousHash, entryHash);
                c.commit();

                return Outcome.ok(new ModelGovernanceTransition(
                        command.transitionId(), command.approvalRef(), command.capability(),
                        command.expectedFrom(), command.toStatus(), command.actorRef(), occurredAt,
                        command.reasonCode(), previousHash, entryHash, sequence));
            } catch (SQLException | RuntimeException inner) {
                safeRollback(c);
                return Outcome.fail(OutcomeCode.NOT_CONFIGURED,
                        "model-governance WORM append başarısız (fail-closed): " + shortReason(inner));
            }
        } catch (SQLException outer) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED,
                    "model-governance WORM bağlantı hatası (fail-closed): " + outer.getSQLState());
        }
    }

    // ---------------- internals ----------------

    /** GLOBAL zincir kuyruğu: en yüksek sequence satırının (sequence, entry_hash)'i; tablo boşsa (-1, GENESIS). */
    private record GlobalTail(long sequence, String entryHash) {}

    private static void advisoryLock(Connection c) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("SELECT pg_advisory_xact_lock(hashtext(?))")) {
            ps.setString(1, GLOBAL_CHAIN_LOCK_KEY);
            ps.execute();
        }
    }

    private static GlobalTail globalTail(Connection c) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
                "SELECT sequence, entry_hash FROM model_governance_ledger ORDER BY sequence DESC LIMIT 1");
                ResultSet rs = ps.executeQuery()) {
            if (!rs.next()) {
                return new GlobalTail(-1L, GENESIS);
            }
            return new GlobalTail(rs.getLong("sequence"), trimHash(rs.getString("entry_hash")));
        }
    }

    private static ApprovalStatus latestStatus(Connection c, ModelApprovalRef ref, Capability capability)
            throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
                "SELECT to_status FROM model_governance_ledger WHERE approval_ref = ? AND capability = ?"
                        + " ORDER BY sequence DESC LIMIT 1")) {
            ps.setString(1, ref.value());
            ps.setString(2, capability.name());
            try (ResultSet rs = ps.executeQuery()) {
                // Hiç transition yoksa özne genesis'te UNINITIALIZED (fail-closed açık token; null DEĞİL).
                return rs.next() ? ApprovalStatus.valueOf(rs.getString("to_status")) : ApprovalStatus.UNINITIALIZED;
            }
        }
    }

    private static ModelGovernanceTransition findByTransitionId(Connection c, String transitionId)
            throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
                "SELECT " + SELECT_COLUMNS + " FROM model_governance_ledger WHERE transition_id = ?")) {
            ps.setString(1, transitionId);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? mapRow(rs) : null;
            }
        }
    }

    private static void insert(Connection c, ModelGovernanceLedger.AppendCommand command, long sequence,
            Instant occurredInstant, String occurredAt, String previousHash, String entryHash)
            throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
                "INSERT INTO model_governance_ledger (sequence, transition_id, approval_ref, capability,"
                        + " from_status, to_status, actor_ref, occurred_at, reason_code, previous_hash, entry_hash)"
                        + " VALUES (?,?,?,?,?,?,?,?,?,?,?)")) {
            ps.setLong(1, sequence);
            ps.setString(2, command.transitionId().value());
            ps.setString(3, command.approvalRef().value());
            ps.setString(4, command.capability().name());
            ps.setString(5, command.expectedFrom().name());
            ps.setString(6, command.toStatus().name());
            ps.setString(7, command.actorRef().value());
            // occurredAt String'i hash girdisi; DB'ye AYNI instant (µs-budalı) OffsetDateTime olarak yazılır.
            ps.setObject(8, OffsetDateTime.ofInstant(occurredInstant, ZoneOffset.UTC));
            ps.setString(9, command.reasonCode().name());
            ps.setString(10, previousHash);
            ps.setString(11, entryHash);
            ps.executeUpdate();
        }
    }

    /**
     * Row → {@link ModelGovernanceTransition}. Enum {@code valueOf} + value-object/record kurucuları biçim/
     * ISO/hash-hex'i fail-closed doğrular (bozuk saklı değer fırlatır → readAll/append NOT_CONFIGURED'a çevirir).
     * occurred_at timestamptz → {@code toInstant().toString()} (yazımdaki µs-budalı kanonik String'i yeniden üretir).
     */
    private static ModelGovernanceTransition mapRow(ResultSet rs) throws SQLException {
        OffsetDateTime occurred = rs.getObject("occurred_at", OffsetDateTime.class);
        String occurredAt = occurred.toInstant().toString();
        return new ModelGovernanceTransition(
                new TransitionId(rs.getString("transition_id")),
                new ModelApprovalRef(rs.getString("approval_ref")),
                Capability.valueOf(rs.getString("capability")),
                ApprovalStatus.valueOf(rs.getString("from_status")),
                ApprovalStatus.valueOf(rs.getString("to_status")),
                new GovernanceActorRef(rs.getString("actor_ref")),
                occurredAt,
                TransitionReason.valueOf(rs.getString("reason_code")),
                trimHash(rs.getString("previous_hash")),
                trimHash(rs.getString("entry_hash")),
                rs.getLong("sequence"));
    }

    /**
     * Idempotent-replay semantik eşitliği (InMemory {@code contentMatches} birebir): transitionId zaten
     * eşleşti; anlamsal alanlar (approvalRef, capability, fromStatus/expectedFrom, toStatus, actorRef,
     * reasonCode) özdeş mi. Adapter-üretimli occurred_at/hash/sequence KARŞILAŞTIRILMAZ (replay orijinal satırı döner).
     */
    private static boolean contentMatches(
            ModelGovernanceTransition existing, ModelGovernanceLedger.AppendCommand command) {
        return existing.approvalRef().equals(command.approvalRef())
                && existing.capability() == command.capability()
                && existing.fromStatus() == command.expectedFrom()
                && existing.toStatus() == command.toStatus()
                && existing.actorRef().equals(command.actorRef())
                && existing.reasonCode() == command.reasonCode();
    }

    /** CHAR(64) boşluk-dolgusuna karşı savunma (hash'ler daima 64-hex → no-op; format guard'ı için güvenli). */
    private static String trimHash(String value) {
        return value == null ? null : value.trim();
    }

    private static Outcome<ModelGovernanceTransition> reject(ModelGovernanceLedger.AppendRejection rejection) {
        return Outcome.fail(rejection.outcomeCode(), rejection.name());
    }

    private static void safeRollback(Connection c) {
        try {
            c.rollback();
        } catch (SQLException ignore) {
            // rollback hatası fail-closed Outcome'u değiştirmez (zaten fail dönüyoruz).
        }
    }

    private static String shortReason(Exception ex) {
        if (ex instanceof SQLException sql) {
            return "sqlstate=" + sql.getSQLState();
        }
        return ex.getClass().getSimpleName();
    }
}
