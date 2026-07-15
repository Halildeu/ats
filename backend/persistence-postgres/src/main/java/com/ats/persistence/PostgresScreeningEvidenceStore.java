package com.ats.persistence;

import com.ats.contracts.EvidenceLedger.EvidenceEvent;
import com.ats.contracts.EvidenceLedger.LedgerEntry;
import com.ats.kernel.Ids.EvidenceId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.JsonCodec;
import com.ats.kernel.JsonValue;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import com.ats.screening.Coverage;
import com.ats.screening.FindingSetRef;
import com.ats.screening.ProtectedCategory;
import com.ats.screening.ScreeningDisposition;
import com.ats.screening.ScreeningEvidenceStore;
import com.ats.screening.ScreeningFinding;
import com.ats.screening.ScreeningPolicyRef;
import com.ats.screening.ScreeningRunId;
import com.ats.screening.ScreeningSignal;
import com.ats.screening.ScreeningSourceKind;
import com.ats.screening.TextSpan;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import javax.sql.DataSource;

/**
 * ATS #156-b PostgreSQL adapter'ı: pointer-only WORM receipt + kısıtlı/silinebilir bulgu
 * aggregate'i TEK JDBC transaction'ında commit eder.
 *
 * <p>WORM payload'ında kategori/sinyal/bulgu-sayısı/span veya kaynak/bulgu hash'i YOKTUR.
 * {@code contentHash}, yalnız kanonik ve hassas-olmayan receipt envelope'un SHA-256'sıdır.
 * Runtime call-site wiring 156-c; reviewer API/UI 156-d kapsamındadır.
 */
public final class PostgresScreeningEvidenceStore implements ScreeningEvidenceStore {

    static final String RECORDED_EVENT_TYPE = "evidence.screening.protected_attribute.recorded";
    static final String RESTRICTED_STORE_VERSION = "protected_screening_pg_v1";

    private final DataSource dataSource;
    private final PostgresEvidenceLedger ledger;

    public PostgresScreeningEvidenceStore(DataSource dataSource) {
        if (dataSource == null) {
            throw new IllegalArgumentException("dataSource zorunlu");
        }
        this.dataSource = dataSource;
        this.ledger = new PostgresEvidenceLedger(dataSource);
    }

    @Override
    public Outcome<SaveReceipt> save(SaveCommand command) {
        if (command == null) {
            return Outcome.fail(OutcomeCode.INVALID, "save command zorunlu");
        }
        JsonValue.JsonObject payload = receiptPayload(command);
        String idempotencyKey = saveIdempotencyKey(
                command.tenantId(), command.interviewId().value(), command.result().findingSetRef());
        EvidenceEvent event = new EvidenceEvent(
                command.tenantId(), command.actorId(), command.interviewId(),
                RECORDED_EVENT_TYPE, command.occurredAt(), idempotencyKey,
                sha256Hex(JsonCodec.canonical(payload)), payload);

        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try {
                Outcome<LedgerEntry> appended = ledger.appendInTransaction(c, event);
                if (!(appended instanceof Outcome.Ok<LedgerEntry> ledgerOk)) {
                    c.rollback();
                    return propagate(appended);
                }
                LedgerEntry entry = ledgerOk.value();
                int inserted = insertHeader(c, command, entry.evidenceId());
                if (inserted == 1) {
                    insertFindings(c, command);
                }
                Outcome<StoredEvidence> stored = getInTransaction(
                        c, command.tenantId(), command.result().findingSetRef());
                if (!(stored instanceof Outcome.Ok<StoredEvidence> storedOk)) {
                    c.rollback();
                    if (inserted == 0 && stored instanceof Outcome.Fail<StoredEvidence> fail
                            && fail.code() == OutcomeCode.NOT_FOUND) {
                        return Outcome.fail(OutcomeCode.INVALID,
                                "screening evidence idempotency conflict: run/ref unique slot çakışması");
                    }
                    return propagate(stored);
                }
                if (!sameLogicalEvidence(command, entry.evidenceId(), storedOk.value())) {
                    c.rollback();
                    return Outcome.fail(OutcomeCode.INVALID,
                            "screening evidence idempotency conflict: aynı run/ref farklı aggregate");
                }
                c.commit();
                return Outcome.ok(new SaveReceipt(
                        command.result().findingSetRef(), command.result().runId(),
                        command.disposition(), entry.evidenceId()));
            } catch (SQLException ex) {
                c.rollback();
                return sqlFail(ex);
            } catch (RuntimeException ex) {
                try {
                    c.rollback();
                } catch (SQLException rollbackFailure) {
                    return sqlFail(rollbackFailure);
                }
                return Outcome.fail(OutcomeCode.NOT_CONFIGURED,
                        "screening evidence transaction runtime hatası (fail-closed)");
            }
        } catch (SQLException ex) {
            return sqlFail(ex);
        }
    }

    @Override
    public Outcome<StoredEvidence> get(TenantId tenantId, FindingSetRef findingSetRef) {
        if (tenantId == null || findingSetRef == null) {
            return Outcome.fail(OutcomeCode.INVALID, "tenantId/findingSetRef zorunlu");
        }
        try (Connection c = dataSource.getConnection()) {
            return getInTransaction(c, tenantId, findingSetRef);
        } catch (SQLException ex) {
            return sqlFail(ex);
        }
    }

    @Override
    public Outcome<PurgeReceipt> purge(PurgeCommand command) {
        if (command == null) {
            return Outcome.fail(OutcomeCode.INVALID, "purge command zorunlu");
        }
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try {
                Outcome<StoredEvidence> stored = getInTransaction(
                        c, command.tenantId(), command.findingSetRef());
                EvidenceId target;
                if (stored instanceof Outcome.Ok<StoredEvidence> ok) {
                    if (!ok.value().interviewId().equals(command.interviewId())) {
                        c.rollback();
                        return Outcome.fail(OutcomeCode.TENANT_SCOPE_VIOLATION,
                                "findingSetRef interview-scope ile uyuşmuyor");
                    }
                    target = ok.value().evidenceId();
                } else if (stored instanceof Outcome.Fail<StoredEvidence> fail
                        && fail.code() == OutcomeCode.NOT_FOUND) {
                    // Idempotent purge replay: restricted aggregate artık yoksa özgün pointer-only
                    // receipt'i deterministik save idempotency anahtarıyla bul.
                    Outcome<LedgerEntry> original = ledger.findByIdempotencyInTransaction(
                            c, command.tenantId(), saveIdempotencyKey(
                                    command.tenantId(), command.interviewId().value(), command.findingSetRef()));
                    if (!(original instanceof Outcome.Ok<LedgerEntry> originalOk)) {
                        c.rollback();
                        return propagate(original);
                    }
                    target = originalOk.value().evidenceId();
                } else {
                    c.rollback();
                    return propagate(stored);
                }

                Outcome<LedgerEntry> tombstone = ledger.appendTombstoneInTransaction(
                        c, command.tenantId(), command.actorId(), command.interviewId(), target,
                        command.reason().name(), command.occurredAt());
                if (!(tombstone instanceof Outcome.Ok<LedgerEntry> tombOk)) {
                    c.rollback();
                    return propagate(tombstone);
                }
                try (PreparedStatement ps = c.prepareStatement(
                        "DELETE FROM protected_screening_evidence"
                                + " WHERE tenant_id = ? AND finding_set_ref = ? AND interview_id = ?")) {
                    ps.setString(1, command.tenantId().value());
                    ps.setString(2, command.findingSetRef().value());
                    ps.setString(3, command.interviewId().value());
                    ps.executeUpdate();
                }
                c.commit();
                return Outcome.ok(new PurgeReceipt(command.findingSetRef(), tombOk.value().evidenceId()));
            } catch (SQLException ex) {
                c.rollback();
                return sqlFail(ex);
            } catch (RuntimeException ex) {
                try {
                    c.rollback();
                } catch (SQLException rollbackFailure) {
                    return sqlFail(rollbackFailure);
                }
                return Outcome.fail(OutcomeCode.NOT_CONFIGURED,
                        "screening purge transaction runtime hatası (fail-closed)");
            }
        } catch (SQLException ex) {
            return sqlFail(ex);
        }
    }

    private static JsonValue.JsonObject receiptPayload(SaveCommand command) {
        Map<String, JsonValue> m = new LinkedHashMap<>();
        m.put("schema_version", JsonValue.of(SCHEMA_VERSION));
        m.put("finding_set_ref", JsonValue.of(command.result().findingSetRef().value()));
        m.put("screening_run_id", JsonValue.of(command.result().runId().value()));
        m.put("policy_ref", JsonValue.of(command.result().policyRef().value()));
        m.put("coverage", JsonValue.of(command.result().coverage().name()));
        m.put("disposition", JsonValue.of(command.disposition().name()));
        m.put("source_kind", JsonValue.of(command.sourceKind().name()));
        m.put("restricted_store_version", JsonValue.of(RESTRICTED_STORE_VERSION));
        return JsonValue.object(m);
    }

    private static String saveIdempotencyKey(
            TenantId tenantId, String interviewId, FindingSetRef findingSetRef) {
        return tenantId.value() + ":" + interviewId + ":protected-screening:"
                + findingSetRef.value() + ":" + SCHEMA_VERSION;
    }

    private static int insertHeader(Connection c, SaveCommand command, EvidenceId evidenceId) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
                "INSERT INTO protected_screening_evidence"
                        + " (tenant_id, finding_set_ref, screening_run_id, interview_id, policy_ref, coverage,"
                        + " disposition, source_kind, worm_evidence_id, schema_version, occurred_at)"
                        + " VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING")) {
            ps.setString(1, command.tenantId().value());
            ps.setString(2, command.result().findingSetRef().value());
            ps.setString(3, command.result().runId().value());
            ps.setString(4, command.interviewId().value());
            ps.setString(5, command.result().policyRef().value());
            ps.setString(6, command.result().coverage().name());
            ps.setString(7, command.disposition().name());
            ps.setString(8, command.sourceKind().name());
            ps.setString(9, evidenceId.value());
            ps.setString(10, SCHEMA_VERSION);
            ps.setString(11, command.occurredAt());
            return ps.executeUpdate();
        }
    }

    private static void insertFindings(Connection c, SaveCommand command) throws SQLException {
        if (command.result().findings().isEmpty()) {
            return;
        }
        try (PreparedStatement ps = c.prepareStatement(
                "INSERT INTO protected_screening_finding"
                        + " (tenant_id, finding_set_ref, finding_index, category_code, signal_code,"
                        + " source_kind, span_start, span_end, segment_index) VALUES (?,?,?,?,?,?,?,?,?)")) {
            for (int i = 0; i < command.result().findings().size(); i++) {
                ScreeningFinding finding = command.result().findings().get(i);
                ps.setString(1, command.tenantId().value());
                ps.setString(2, command.result().findingSetRef().value());
                ps.setInt(3, i);
                ps.setString(4, finding.category().name());
                ps.setString(5, finding.signal().name());
                ps.setString(6, finding.sourceKind().name());
                ps.setInt(7, finding.span().startInclusive());
                ps.setInt(8, finding.span().endExclusive());
                if (finding.span().segmentIndex() == null) {
                    ps.setNull(9, java.sql.Types.INTEGER);
                } else {
                    ps.setInt(9, finding.span().segmentIndex());
                }
                ps.addBatch();
            }
            ps.executeBatch();
        }
    }

    private static Outcome<StoredEvidence> getInTransaction(
            Connection c, TenantId tenantId, FindingSetRef findingSetRef) {
        try (PreparedStatement ps = c.prepareStatement(
                "SELECT * FROM protected_screening_evidence"
                        + " WHERE tenant_id = ? AND finding_set_ref = ?")) {
            ps.setString(1, tenantId.value());
            ps.setString(2, findingSetRef.value());
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    return Outcome.fail(OutcomeCode.NOT_FOUND,
                            "screening evidence yok (tenant-scope)");
                }
                List<ScreeningFinding> findings = readFindings(c, tenantId, findingSetRef);
                return Outcome.ok(new StoredEvidence(
                        tenantId,
                        new com.ats.kernel.Ids.InterviewId(rs.getString("interview_id")),
                        new ScreeningRunId(rs.getString("screening_run_id")),
                        findingSetRef,
                        new ScreeningPolicyRef(rs.getString("policy_ref")),
                        Coverage.valueOf(rs.getString("coverage")),
                        ScreeningDisposition.valueOf(rs.getString("disposition")),
                        ScreeningSourceKind.valueOf(rs.getString("source_kind")),
                        findings,
                        new EvidenceId(rs.getString("worm_evidence_id")),
                        rs.getString("schema_version"),
                        rs.getString("occurred_at")));
            }
        } catch (SQLException ex) {
            return sqlFail(ex);
        } catch (IllegalArgumentException ex) {
            return Outcome.fail(OutcomeCode.INVALID,
                    "restricted screening row kapalı sözleşmeyle uyumsuz (fail-closed)");
        }
    }

    private static List<ScreeningFinding> readFindings(
            Connection c, TenantId tenantId, FindingSetRef findingSetRef) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
                "SELECT category_code, signal_code, source_kind, span_start, span_end, segment_index"
                        + " FROM protected_screening_finding"
                        + " WHERE tenant_id = ? AND finding_set_ref = ? ORDER BY finding_index")) {
            ps.setString(1, tenantId.value());
            ps.setString(2, findingSetRef.value());
            try (ResultSet rs = ps.executeQuery()) {
                List<ScreeningFinding> out = new ArrayList<>();
                while (rs.next()) {
                    Integer segmentIndex = (Integer) rs.getObject("segment_index");
                    out.add(new ScreeningFinding(
                            ProtectedCategory.valueOf(rs.getString("category_code")),
                            ScreeningSignal.valueOf(rs.getString("signal_code")),
                            ScreeningSourceKind.valueOf(rs.getString("source_kind")),
                            new TextSpan(rs.getInt("span_start"), rs.getInt("span_end"), segmentIndex)));
                }
                return List.copyOf(out);
            }
        }
    }

    private static boolean sameLogicalEvidence(
            SaveCommand command, EvidenceId evidenceId, StoredEvidence stored) {
        return stored.tenantId().equals(command.tenantId())
                && stored.interviewId().equals(command.interviewId())
                && stored.runId().equals(command.result().runId())
                && stored.findingSetRef().equals(command.result().findingSetRef())
                && stored.policyRef().equals(command.result().policyRef())
                && stored.coverage() == command.result().coverage()
                && stored.disposition() == command.disposition()
                && stored.sourceKind() == command.sourceKind()
                && stored.findings().equals(command.result().findings())
                && stored.evidenceId().equals(evidenceId)
                && SCHEMA_VERSION.equals(stored.schemaVersion());
        // occurredAt bilinçli olarak kimlik dışıdır: meşru retry yeni çağrı zamanıyla gelebilir;
        // ilk committed timestamp otoritatif kalır (generic EvidenceLedger semantiğiyle aynı).
    }

    private static String sha256Hex(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 mevcut olmalı", ex);
        }
    }

    private static <T, U> Outcome<U> propagate(Outcome<T> source) {
        if (source instanceof Outcome.Fail<T> fail) {
            return Outcome.fail(fail.code(), fail.reason());
        }
        return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "beklenmeyen boş/başarısız persistence sonucu");
    }

    private static <T> Outcome<T> sqlFail(SQLException ex) {
        return Outcome.fail(OutcomeCode.NOT_CONFIGURED,
                "screening evidence DB hatası (fail-closed): " + ex.getSQLState());
    }
}
