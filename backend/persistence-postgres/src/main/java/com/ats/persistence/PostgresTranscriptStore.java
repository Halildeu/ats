package com.ats.persistence;

import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.JsonCodec;
import com.ats.kernel.JsonValue;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import com.ats.orchestration.Transcript;
import com.ats.orchestration.TranscriptStore;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import javax.sql.DataSource;

/** ATS-0018 slice-8b — TranscriptStore PG adapter'ı (plain-JDBC; content-plane, DELETE'li). */
public final class PostgresTranscriptStore implements TranscriptStore {

    private final DataSource ds;

    public PostgresTranscriptStore(DataSource ds) {
        this.ds = ds;
    }

    @Override
    public Outcome<String> put(Transcript t) {
        if (t == null || t.tenantId() == null || t.interviewId() == null) {
            return Outcome.fail(OutcomeCode.INVALID, "transcript/tenantId/interviewId zorunlu");
        }
        String key = Pg.newKey(t.interviewId().value(), "tr");
        List<JsonValue> segs = new ArrayList<>();
        for (Transcript.Segment s : t.segments()) {
            segs.add(JsonValue.object(Map.of(
                    "index", JsonValue.of((double) s.index()),
                    "speaker_label", JsonValue.of(s.speakerLabel()),
                    "start_ms", JsonValue.of((double) s.startMs()),
                    "end_ms", JsonValue.of((double) s.endMs()),
                    "text", JsonValue.of(s.text()))));
        }
        try (Connection c = ds.getConnection();
                PreparedStatement ps = c.prepareStatement(
                        "INSERT INTO transcript (tenant_id, transcript_key, interview_id, source_object_key,"
                                + " language, segments) VALUES (?,?,?,?,?,?::jsonb)")) {
            ps.setString(1, t.tenantId().value());
            ps.setString(2, key);
            ps.setString(3, t.interviewId().value());
            ps.setString(4, t.sourceObjectKey());
            ps.setString(5, t.language());
            ps.setString(6, JsonCodec.canonical(new JsonValue.JsonArray(segs)));
            ps.executeUpdate();
            return Outcome.ok(key);
        } catch (SQLException e) {
            return Pg.sqlFail(e);
        }
    }

    @Override
    public Outcome<Transcript> find(TenantId tenantId, InterviewId interviewId, String transcriptKey) {
        try (Connection c = ds.getConnection();
                PreparedStatement ps = c.prepareStatement(
                        "SELECT interview_id, source_object_key, language, segments FROM transcript"
                                + " WHERE tenant_id = ? AND transcript_key = ? AND interview_id = ?")) {
            ps.setString(1, tenantId.value());
            ps.setString(2, transcriptKey);
            ps.setString(3, interviewId.value());
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    return Outcome.fail(OutcomeCode.NOT_FOUND, "transkript yok (tenant-scope)");
                }
                List<Transcript.Segment> segments = new ArrayList<>();
                JsonValue parsed;
                try {
                    parsed = JsonCodec.parse(rs.getString("segments"));
                } catch (JsonCodec.JsonCodecException e) {
                    return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "segments parse edilemedi (fail-closed)");
                }
                if (!(parsed instanceof JsonValue.JsonArray arr)) {
                    return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "segments array değil (fail-closed)");
                }
                for (JsonValue item : arr.items()) {
                    if (!(item instanceof JsonValue.JsonObject o)) {
                        return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "segment object değil (fail-closed)");
                    }
                    segments.add(new Transcript.Segment(
                            (int) ((JsonValue.JsonNumber) o.values().get("index")).value(),
                            ((JsonValue.JsonString) o.values().get("speaker_label")).value(),
                            (long) ((JsonValue.JsonNumber) o.values().get("start_ms")).value(),
                            (long) ((JsonValue.JsonNumber) o.values().get("end_ms")).value(),
                            ((JsonValue.JsonString) o.values().get("text")).value()));
                }
                return Outcome.ok(new Transcript(tenantId, interviewId,
                        rs.getString("source_object_key"), rs.getString("language"), segments));
            }
        } catch (SQLException | ClassCastException | NullPointerException e) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "transcript okunamadı (fail-closed)");
        }
    }

    @Override
    public Outcome<Void> delete(TenantId tenantId, String transcriptKey) {
        try (Connection c = ds.getConnection();
                PreparedStatement ps = c.prepareStatement(
                        "DELETE FROM transcript WHERE tenant_id = ? AND transcript_key = ?")) {
            ps.setString(1, tenantId.value());
            ps.setString(2, transcriptKey);
            ps.executeUpdate(); // idempotent: 0 satır da OK
            return Outcome.ok(null);
        } catch (SQLException e) {
            return Pg.sqlFail(e);
        }
    }
}
