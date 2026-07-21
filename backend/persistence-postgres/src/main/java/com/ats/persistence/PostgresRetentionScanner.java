package com.ats.persistence;

import com.ats.dsr.RetentionScanner;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import javax.sql.DataSource;

/**
 * ATS-0018 slice-8c — retention taraması PG adapter'ı: created_at < cutoff olan CONTENT-plane
 * satırları (transcript/citation/export_artifact) tenant-scoped + interview-gruplu döner.
 * WORM/state tabloları TARANMAZ (silinebilir düzlem değiller). Cutoff ISO-8601 fail-closed parse.
 */
public final class PostgresRetentionScanner implements RetentionScanner {

    private final DataSource ds;

    public PostgresRetentionScanner(DataSource ds) {
        this.ds = ds;
    }

    @Override
    public Outcome<List<ExpiredContent>> scanExpired(TenantId tenantId, String cutoffIso) {
        if (tenantId == null || cutoffIso == null || cutoffIso.isBlank()) {
            return Outcome.fail(OutcomeCode.INVALID, "tenant + cutoffIso zorunlu");
        }
        final OffsetDateTime cutoff;
        try {
            cutoff = OffsetDateTime.parse(cutoffIso);
        } catch (DateTimeParseException e) {
            return Outcome.fail(OutcomeCode.INVALID, "cutoffIso ISO-8601 değil (fail-closed)");
        }
        Map<String, Expired> byInterview = new LinkedHashMap<>();
        try (Connection c = ds.getConnection()) {
            collect(c, tenantId, cutoff, "SELECT interview_id, transcript_key FROM transcript"
                    + " WHERE tenant_id = ? AND created_at < ?", byInterview, Kind.TRANSCRIPT);
            collect(c, tenantId, cutoff, "SELECT interview_id, citation_key FROM citation"
                    + " WHERE tenant_id = ? AND created_at < ?", byInterview, Kind.CITATION);
            collect(c, tenantId, cutoff, "SELECT interview_id, artifact_key FROM export_artifact"
                    + " WHERE tenant_id = ? AND created_at < ?", byInterview, Kind.ARTIFACT);
            collect(c, tenantId, cutoff,
                    "SELECT interview_id, finding_set_ref FROM protected_screening_evidence"
                            + " WHERE tenant_id = ? AND created_at < ?",
                    byInterview, Kind.SCREENING);
        } catch (SQLException e) {
            return Pg.sqlFail(e);
        }
        List<ExpiredContent> out = new ArrayList<>();
        for (Map.Entry<String, Expired> entry : byInterview.entrySet()) {
            Expired x = entry.getValue();
            out.add(new ExpiredContent(new InterviewId(entry.getKey()),
                    x.transcripts, x.citations, x.artifacts, x.screeningFindingSetRefs));
        }
        return Outcome.ok(List.copyOf(out));
    }

    private enum Kind { TRANSCRIPT, CITATION, ARTIFACT, SCREENING }

    private static final class Expired {
        final List<String> transcripts = new ArrayList<>();
        final List<String> citations = new ArrayList<>();
        final List<String> artifacts = new ArrayList<>();
        final List<String> screeningFindingSetRefs = new ArrayList<>();
    }

    private static void collect(Connection c, TenantId tenant, OffsetDateTime cutoff, String sql,
            Map<String, Expired> byInterview, Kind kind) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, tenant.value());
            ps.setObject(2, cutoff);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Expired x = byInterview.computeIfAbsent(rs.getString(1), k -> new Expired());
                    String key = rs.getString(2);
                    switch (kind) {
                        case TRANSCRIPT -> x.transcripts.add(key);
                        case CITATION -> x.citations.add(key);
                        case ARTIFACT -> x.artifacts.add(key);
                        case SCREENING -> x.screeningFindingSetRefs.add(key);
                    }
                }
            }
        }
    }
}
