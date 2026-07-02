package com.ats.persistence;

import com.ats.consent.ConsentStore;
import com.ats.consent.RecordingPermission;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import javax.sql.DataSource;

/** ATS-0018 slice-8b — ConsentStore PG adapter'ı (recording_permission_state; UPSERT — state geçişleri UPDATE). */
public final class PostgresConsentStore implements ConsentStore {

    private final DataSource ds;

    public PostgresConsentStore(DataSource ds) {
        this.ds = ds;
    }

    @Override
    public Outcome<Void> put(RecordingPermission p) {
        if (p == null || p.tenantId() == null || p.interviewId() == null) {
            return Outcome.fail(OutcomeCode.INVALID, "permission/tenantId/interviewId zorunlu");
        }
        try (Connection c = ds.getConnection();
                PreparedStatement ps = c.prepareStatement(
                        "INSERT INTO recording_permission (tenant_id, interview_id, subject_ref, state, recorded_at_iso)"
                                + " VALUES (?,?,?,?,?)"
                                + " ON CONFLICT (tenant_id, interview_id) DO UPDATE SET"
                                + " subject_ref = EXCLUDED.subject_ref, state = EXCLUDED.state,"
                                + " recorded_at_iso = EXCLUDED.recorded_at_iso, updated_at = now()")) {
            ps.setString(1, p.tenantId().value());
            ps.setString(2, p.interviewId().value());
            ps.setString(3, p.subjectRef());
            ps.setString(4, p.state().name());
            ps.setString(5, p.recordedAtIso());
            ps.executeUpdate();
            return Outcome.ok(null);
        } catch (SQLException e) {
            return Pg.sqlFail(e);
        }
    }

    @Override
    public Outcome<RecordingPermission> find(TenantId tenantId, InterviewId interviewId) {
        try (Connection c = ds.getConnection();
                PreparedStatement ps = c.prepareStatement(
                        "SELECT subject_ref, state, recorded_at_iso FROM recording_permission"
                                + " WHERE tenant_id = ? AND interview_id = ?")) {
            ps.setString(1, tenantId.value());
            ps.setString(2, interviewId.value());
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    return Outcome.fail(OutcomeCode.NOT_FOUND, "kayıt-izni kaydı yok (tenant-scope)");
                }
                RecordingPermission.PermissionState state;
                try {
                    state = RecordingPermission.PermissionState.valueOf(rs.getString("state"));
                } catch (IllegalArgumentException e) {
                    return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "state değeri bozuk (fail-closed)");
                }
                return Outcome.ok(new RecordingPermission(tenantId, interviewId,
                        rs.getString("subject_ref"), state, rs.getString("recorded_at_iso")));
            }
        } catch (SQLException e) {
            return Pg.sqlFail(e);
        }
    }
}
