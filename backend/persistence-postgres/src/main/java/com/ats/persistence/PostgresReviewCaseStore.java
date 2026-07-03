package com.ats.persistence;

import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import com.ats.review.ReviewCase;
import com.ats.review.ReviewCaseStore;
import com.ats.review.ReviewState;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import javax.sql.DataSource;

/** ATS-0018 slice-8b — ReviewCaseStore PG adapter'ı (state tablosu: UPDATE'li, DELETE YOK). */
public final class PostgresReviewCaseStore implements ReviewCaseStore {

    private final DataSource ds;

    public PostgresReviewCaseStore(DataSource ds) {
        this.ds = ds;
    }

    @Override
    public Outcome<String> put(ReviewCase rc) {
        if (rc == null || rc.tenantId() == null || rc.interviewId() == null) {
            return Outcome.fail(OutcomeCode.INVALID, "case/tenantId/interviewId zorunlu");
        }
        String key = Pg.newKey(rc.interviewId().value(), "case");
        try (Connection c = ds.getConnection();
                PreparedStatement ps = c.prepareStatement(
                        "INSERT INTO review_case (tenant_id, case_key, interview_id, state, source_evidence_refs,"
                                + " ai_output_version_ref, human_actor_ref, oversight_role_ref, human_change_summary_ref,"
                                + " human_authored_rationale_ref, decision_outcome_ref, export_artifact_ref, reason_code)"
                                + " VALUES (?,?,?,?,?::jsonb,?,?,?,?,?,?,?,?)")) {
            bind(ps, rc, key);
            ps.executeUpdate();
            return Outcome.ok(key);
        } catch (SQLException e) {
            return Pg.sqlFail(e);
        }
    }

    @Override
    public Outcome<ReviewCase> find(TenantId tenantId, InterviewId interviewId, String caseKey) {
        try (Connection c = ds.getConnection();
                PreparedStatement ps = c.prepareStatement(
                        "SELECT * FROM review_case WHERE tenant_id = ? AND case_key = ? AND interview_id = ?")) {
            ps.setString(1, tenantId.value());
            ps.setString(2, caseKey);
            ps.setString(3, interviewId.value());
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    return Outcome.fail(OutcomeCode.NOT_FOUND, "vaka yok (tenant-scope)");
                }
                ReviewState state;
                try {
                    state = ReviewState.valueOf(rs.getString("state"));
                } catch (IllegalArgumentException e) {
                    return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "state değeri bozuk (fail-closed)");
                }
                return Outcome.ok(new ReviewCase(tenantId, interviewId, state,
                        Pg.stringsFromJson(rs.getString("source_evidence_refs")),
                        rs.getString("ai_output_version_ref"),
                        rs.getString("human_actor_ref"),
                        rs.getString("oversight_role_ref"),
                        rs.getString("human_change_summary_ref"),
                        rs.getString("human_authored_rationale_ref"),
                        rs.getString("decision_outcome_ref"),
                        rs.getString("export_artifact_ref"),
                        rs.getString("reason_code")));
            }
        } catch (SQLException e) {
            return Pg.sqlFail(e);
        }
    }

    @Override
    public Outcome<java.util.List<CaseSummary>> listByInterview(TenantId tenantId, InterviewId interviewId) {
        try (Connection c = ds.getConnection();
                PreparedStatement ps = c.prepareStatement(
                        "SELECT case_key, state FROM review_case WHERE tenant_id = ? AND interview_id = ?"
                                + " ORDER BY created_at DESC, case_key")) {
            ps.setString(1, tenantId.value());
            ps.setString(2, interviewId.value());
            try (ResultSet rs = ps.executeQuery()) {
                java.util.List<CaseSummary> out = new java.util.ArrayList<>();
                while (rs.next()) {
                    ReviewState state;
                    try {
                        state = ReviewState.valueOf(rs.getString("state"));
                    } catch (IllegalArgumentException e) {
                        return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "state değeri bozuk (fail-closed)");
                    }
                    out.add(new CaseSummary(rs.getString("case_key"), state));
                }
                return Outcome.ok(out);
            }
        } catch (SQLException e) {
            return Pg.sqlFail(e);
        }
    }

    @Override
    public Outcome<Void> save(TenantId tenantId, String caseKey, ReviewCase rc) {
        try (Connection c = ds.getConnection();
                PreparedStatement ps = c.prepareStatement(
                        "UPDATE review_case SET state = ?, source_evidence_refs = ?::jsonb,"
                                + " ai_output_version_ref = ?, human_actor_ref = ?, oversight_role_ref = ?,"
                                + " human_change_summary_ref = ?, human_authored_rationale_ref = ?,"
                                + " decision_outcome_ref = ?, export_artifact_ref = ?, reason_code = ?,"
                                + " updated_at = now() WHERE tenant_id = ? AND case_key = ?")) {
            ps.setString(1, rc.state().name());
            ps.setString(2, Pg.stringsToJson(rc.sourceEvidenceRefs()));
            ps.setString(3, rc.aiOutputVersionRef());
            ps.setString(4, rc.humanActorRef());
            ps.setString(5, rc.oversightRoleRef());
            ps.setString(6, rc.humanChangeSummaryRef());
            ps.setString(7, rc.humanAuthoredRationaleRef());
            ps.setString(8, rc.decisionOutcomeRef());
            ps.setString(9, rc.exportArtifactRef());
            ps.setString(10, rc.reasonCode());
            ps.setString(11, tenantId.value());
            ps.setString(12, caseKey);
            int updated = ps.executeUpdate();
            if (updated == 0) {
                return Outcome.fail(OutcomeCode.NOT_FOUND, "vaka yok (tenant-scope)");
            }
            return Outcome.ok(null);
        } catch (SQLException e) {
            return Pg.sqlFail(e);
        }
    }

    private static void bind(PreparedStatement ps, ReviewCase rc, String key) throws SQLException {
        ps.setString(1, rc.tenantId().value());
        ps.setString(2, key);
        ps.setString(3, rc.interviewId().value());
        ps.setString(4, rc.state().name());
        ps.setString(5, Pg.stringsToJson(rc.sourceEvidenceRefs()));
        ps.setString(6, rc.aiOutputVersionRef());
        ps.setString(7, rc.humanActorRef());
        ps.setString(8, rc.oversightRoleRef());
        ps.setString(9, rc.humanChangeSummaryRef());
        ps.setString(10, rc.humanAuthoredRationaleRef());
        ps.setString(11, rc.decisionOutcomeRef());
        ps.setString(12, rc.exportArtifactRef());
        ps.setString(13, rc.reasonCode());
    }
}
