package com.ats.persistence;

import com.ats.contracts.AIProvider.Entailment;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import com.ats.orchestration.Citation;
import com.ats.orchestration.CitationStore;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import javax.sql.DataSource;

/** ATS-0018 slice-8b — CitationStore PG adapter'ı (claim METNİ silinebilir-düzlem burada; content-plane DELETE'li). */
public final class PostgresCitationStore implements CitationStore {

    private final DataSource ds;

    public PostgresCitationStore(DataSource ds) {
        this.ds = ds;
    }

    @Override
    public Outcome<String> put(Citation c) {
        if (c == null || c.tenantId() == null || c.interviewId() == null) {
            return Outcome.fail(OutcomeCode.INVALID, "citation/tenantId/interviewId zorunlu");
        }
        String key = Pg.newKey(c.interviewId().value(), "cit");
        try (Connection conn = ds.getConnection();
                PreparedStatement ps = conn.prepareStatement(
                        "INSERT INTO citation (tenant_id, citation_key, interview_id, transcript_key, claim,"
                                + " segment_indexes, entailment) VALUES (?,?,?,?,?,?::jsonb,?)")) {
            ps.setString(1, c.tenantId().value());
            ps.setString(2, key);
            ps.setString(3, c.interviewId().value());
            ps.setString(4, c.transcriptKey());
            ps.setString(5, c.claim());
            ps.setString(6, Pg.intsToJson(c.segmentIndexes()));
            ps.setString(7, c.entailment().name());
            ps.executeUpdate();
            return Outcome.ok(key);
        } catch (SQLException e) {
            return Pg.sqlFail(e);
        }
    }

    @Override
    public Outcome<Citation> find(TenantId tenantId, InterviewId interviewId, String citationKey) {
        try (Connection conn = ds.getConnection();
                PreparedStatement ps = conn.prepareStatement(
                        "SELECT transcript_key, claim, segment_indexes, entailment FROM citation"
                                + " WHERE tenant_id = ? AND citation_key = ? AND interview_id = ?")) {
            ps.setString(1, tenantId.value());
            ps.setString(2, citationKey);
            ps.setString(3, interviewId.value());
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    return Outcome.fail(OutcomeCode.NOT_FOUND, "citation yok (tenant-scope)");
                }
                Entailment entailment;
                try {
                    entailment = Entailment.valueOf(rs.getString("entailment"));
                } catch (IllegalArgumentException e) {
                    return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "entailment değeri bozuk (fail-closed)");
                }
                return Outcome.ok(new Citation(tenantId, interviewId,
                        rs.getString("transcript_key"), rs.getString("claim"),
                        Pg.intsFromJson(rs.getString("segment_indexes")), entailment));
            }
        } catch (SQLException e) {
            return Pg.sqlFail(e);
        }
    }

    @Override
    public Outcome<Void> delete(TenantId tenantId, String citationKey) {
        try (Connection conn = ds.getConnection();
                PreparedStatement ps = conn.prepareStatement(
                        "DELETE FROM citation WHERE tenant_id = ? AND citation_key = ?")) {
            ps.setString(1, tenantId.value());
            ps.setString(2, citationKey);
            ps.executeUpdate();
            return Outcome.ok(null);
        } catch (SQLException e) {
            return Pg.sqlFail(e);
        }
    }
}
