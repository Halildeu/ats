package com.ats.persistence;

import com.ats.dsr.ErasureScope;
import com.ats.dsr.ErasureScopeResolver;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import javax.sql.DataSource;

/**
 * ATS #169 server-authoritative scope resolver. Seal ile bütün scope sorguları aynı PostgreSQL
 * transaction'ındadır; caller key listesi bu adapter'a hiç girmez.
 */
public final class PostgresErasureScopeResolver implements ErasureScopeResolver {

    private static final String SCREENING_RECORDED_EVENT =
            "evidence.screening.protected_attribute.recorded";

    private final DataSource dataSource;

    public PostgresErasureScopeResolver(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public Outcome<ErasureScope> resolveAndSealDsr(
            TenantId tenantId, InterviewId interviewId, String dsarKey) {
        if (tenantId == null || interviewId == null || dsarKey == null || dsarKey.isBlank()) {
            return Outcome.fail(OutcomeCode.INVALID, "tenant/interview/dsarKey zorunlu");
        }
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try {
                seal(connection, tenantId.value(), interviewId.value(), dsarKey);

                List<String> objects = query(connection,
                        "SELECT DISTINCT payload->>'object_key' AS target_ref FROM worm_ledger"
                                + " WHERE tenant_id = ? AND interview_id = ?"
                                + " AND event_type = 'recording.ingested'"
                                + " AND jsonb_exists(payload, 'object_key') ORDER BY target_ref",
                        tenantId, interviewId);
                List<String> transcripts = query(connection,
                        "SELECT transcript_key AS target_ref FROM transcript"
                                + " WHERE tenant_id = ? AND interview_id = ? ORDER BY transcript_key",
                        tenantId, interviewId);
                List<String> citations = query(connection,
                        "SELECT citation_key AS target_ref FROM citation"
                                + " WHERE tenant_id = ? AND interview_id = ? ORDER BY citation_key",
                        tenantId, interviewId);
                List<String> artifacts = query(connection,
                        "SELECT artifact_key AS target_ref FROM export_artifact"
                                + " WHERE tenant_id = ? AND interview_id = ? ORDER BY artifact_key",
                        tenantId, interviewId);
                List<String> reviewCases = query(connection,
                        "SELECT case_key AS target_ref FROM review_case"
                                + " WHERE tenant_id = ? AND interview_id = ?"
                                + " AND state NOT IN ('EXPORTED','WITHDRAWN') ORDER BY case_key",
                        tenantId, interviewId);
                List<String> screeningRefs = query(connection,
                        "SELECT finding_set_ref AS target_ref FROM protected_screening_evidence"
                                + " WHERE tenant_id = ? AND interview_id = ? ORDER BY finding_set_ref",
                        tenantId, interviewId);
                List<String> tombstoneTargets = query(connection,
                        "SELECT source.evidence_id AS target_ref FROM worm_ledger source"
                                + " WHERE source.tenant_id = ? AND source.interview_id = ?"
                                + " AND source.event_type <> 'evidence.tombstoned'"
                                + " AND source.event_type <> '" + SCREENING_RECORDED_EVENT + "'"
                                + " AND NOT EXISTS (SELECT 1 FROM worm_ledger tombstone"
                                + "   WHERE tombstone.tenant_id = source.tenant_id"
                                + "     AND tombstone.event_type = 'evidence.tombstoned'"
                                + "     AND tombstone.payload->>'target_evidence_id' = source.evidence_id)"
                                + " ORDER BY source.seq",
                        tenantId, interviewId);

                ErasureScope scope = new ErasureScope(objects, transcripts, citations, artifacts,
                        reviewCases, screeningRefs, tombstoneTargets);
                connection.commit();
                return Outcome.ok(scope);
            } catch (SQLException ex) {
                connection.rollback();
                if ("23505".equals(ex.getSQLState())) {
                    return Outcome.fail(OutcomeCode.CONFLICT,
                            "interview farklı DSAR ile terminal olarak mühürlü");
                }
                return Pg.sqlFail(ex);
            } catch (IllegalArgumentException ex) {
                connection.rollback();
                return Outcome.fail(OutcomeCode.NOT_CONFIGURED,
                        "server-authoritative erasure scope bozuk/boyut sınırını aşıyor (fail-closed)");
            }
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    private static void seal(
            Connection connection, String tenantId, String interviewId, String dsarKey)
            throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT ats_seal_interview_for_erasure(?,?,?)")) {
            statement.setString(1, tenantId);
            statement.setString(2, interviewId);
            statement.setString(3, dsarKey);
            statement.executeQuery();
        }
    }

    private static List<String> query(
            Connection connection, String sql, TenantId tenantId, InterviewId interviewId)
            throws SQLException {
        ArrayList<String> values = new ArrayList<>();
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, tenantId.value());
            statement.setString(2, interviewId.value());
            try (ResultSet result = statement.executeQuery()) {
                while (result.next()) {
                    String value = result.getString("target_ref");
                    if (value == null || value.isBlank()) {
                        throw new SQLException("server-authoritative scope ref boş", "22000");
                    }
                    values.add(value);
                }
            }
        }
        return List.copyOf(values);
    }
}
