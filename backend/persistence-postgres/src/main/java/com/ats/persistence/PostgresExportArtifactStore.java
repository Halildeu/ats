package com.ats.persistence;

import com.ats.export.ExportArtifactStore;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import javax.sql.DataSource;

/** ATS-0018 slice-8b — ExportArtifactStore PG adapter'ı (content-plane, DELETE'li; packet pointer-only JSON). */
public final class PostgresExportArtifactStore implements ExportArtifactStore {

    private final DataSource ds;

    public PostgresExportArtifactStore(DataSource ds) {
        this.ds = ds;
    }

    @Override
    public Outcome<String> put(TenantId tenantId, InterviewId interviewId, String canonicalPacketJson) {
        if (tenantId == null || interviewId == null || canonicalPacketJson == null || canonicalPacketJson.isBlank()) {
            return Outcome.fail(OutcomeCode.INVALID, "tenant/interview/packet zorunlu");
        }
        String key = Pg.newKey(interviewId.value(), "pkt");
        try (Connection c = ds.getConnection();
                PreparedStatement ps = c.prepareStatement(
                        "INSERT INTO export_artifact (tenant_id, artifact_key, interview_id, packet_json)"
                                + " VALUES (?,?,?,?)")) {
            ps.setString(1, tenantId.value());
            ps.setString(2, key);
            ps.setString(3, interviewId.value());
            ps.setString(4, canonicalPacketJson);
            ps.executeUpdate();
            return Outcome.ok(key);
        } catch (SQLException e) {
            return Pg.sqlFail(e);
        }
    }

    @Override
    public Outcome<String> find(TenantId tenantId, InterviewId interviewId, String artifactKey) {
        try (Connection c = ds.getConnection();
                PreparedStatement ps = c.prepareStatement(
                        "SELECT packet_json FROM export_artifact"
                                + " WHERE tenant_id = ? AND artifact_key = ? AND interview_id = ?")) {
            ps.setString(1, tenantId.value());
            ps.setString(2, artifactKey);
            ps.setString(3, interviewId.value());
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    return Outcome.fail(OutcomeCode.NOT_FOUND, "artifact yok (tenant-scope)");
                }
                return Outcome.ok(rs.getString(1));
            }
        } catch (SQLException e) {
            return Pg.sqlFail(e);
        }
    }

    @Override
    public Outcome<Void> delete(TenantId tenantId, String artifactKey) {
        try (Connection c = ds.getConnection();
                PreparedStatement ps = c.prepareStatement(
                        "DELETE FROM export_artifact WHERE tenant_id = ? AND artifact_key = ?")) {
            ps.setString(1, tenantId.value());
            ps.setString(2, artifactKey);
            ps.executeUpdate();
            return Outcome.ok(null);
        } catch (SQLException e) {
            return Pg.sqlFail(e);
        }
    }
}
