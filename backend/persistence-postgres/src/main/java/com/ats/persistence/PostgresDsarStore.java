package com.ats.persistence;

import com.ats.dsr.DsarRequest;
import com.ats.dsr.DsarStore;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import javax.sql.DataSource;

/** ATS-0018 slice-8b — DsarStore PG adapter'ı (state tablosu; talep gövdesi/kimlik yok — opak ref'ler). */
public final class PostgresDsarStore implements DsarStore {

    private final DataSource ds;

    public PostgresDsarStore(DataSource ds) {
        this.ds = ds;
    }

    @Override
    public Outcome<String> put(DsarRequest r) {
        if (r == null || r.tenantId() == null || r.interviewId() == null) {
            return Outcome.fail(OutcomeCode.INVALID, "dsar/tenantId/interviewId zorunlu");
        }
        String key = Pg.newKey(r.interviewId().value(), "dsar");
        try (Connection c = ds.getConnection();
                PreparedStatement ps = c.prepareStatement(
                        "INSERT INTO dsar_request (tenant_id, dsar_key, interview_id, subject_ref, reason_code, state)"
                                + " VALUES (?,?,?,?,?,?)")) {
            ps.setString(1, r.tenantId().value());
            ps.setString(2, key);
            ps.setString(3, r.interviewId().value());
            ps.setString(4, r.subjectRef());
            ps.setString(5, r.reasonCode());
            ps.setString(6, r.state().name());
            ps.executeUpdate();
            return Outcome.ok(key);
        } catch (SQLException e) {
            return Pg.sqlFail(e);
        }
    }

    @Override
    public Outcome<DsarRequest> find(TenantId tenantId, InterviewId interviewId, String dsarKey) {
        try (Connection c = ds.getConnection();
                PreparedStatement ps = c.prepareStatement(
                        "SELECT subject_ref, reason_code, state FROM dsar_request"
                                + " WHERE tenant_id = ? AND dsar_key = ? AND interview_id = ?")) {
            ps.setString(1, tenantId.value());
            ps.setString(2, dsarKey);
            ps.setString(3, interviewId.value());
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    return Outcome.fail(OutcomeCode.NOT_FOUND, "dsar yok (tenant-scope)");
                }
                DsarRequest.State state;
                try {
                    state = DsarRequest.State.valueOf(rs.getString("state"));
                } catch (IllegalArgumentException e) {
                    return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "state değeri bozuk (fail-closed)");
                }
                return Outcome.ok(new DsarRequest(tenantId, interviewId,
                        rs.getString("subject_ref"), rs.getString("reason_code"), state));
            }
        } catch (SQLException e) {
            return Pg.sqlFail(e);
        }
    }

    @Override
    public Outcome<Void> save(TenantId tenantId, String dsarKey, DsarRequest r) {
        try (Connection c = ds.getConnection();
                PreparedStatement ps = c.prepareStatement(
                        "UPDATE dsar_request SET subject_ref = ?, reason_code = ?, state = ?, updated_at = now()"
                                + " WHERE tenant_id = ? AND dsar_key = ?")) {
            ps.setString(1, r.subjectRef());
            ps.setString(2, r.reasonCode());
            ps.setString(3, r.state().name());
            ps.setString(4, tenantId.value());
            ps.setString(5, dsarKey);
            int updated = ps.executeUpdate();
            if (updated == 0) {
                return Outcome.fail(OutcomeCode.NOT_FOUND, "dsar yok (tenant-scope)");
            }
            return Outcome.ok(null);
        } catch (SQLException e) {
            return Pg.sqlFail(e);
        }
    }
}
