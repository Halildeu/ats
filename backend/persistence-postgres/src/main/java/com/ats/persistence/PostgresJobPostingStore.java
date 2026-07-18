package com.ats.persistence;

import com.ats.application.JobPosting;
import com.ats.application.JobPostingStatus;
import com.ats.application.JobPostingStore;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import javax.sql.DataSource;

/** ATS-0022 ilan yaşam döngüsü plain-JDBC adapter'ı. */
public final class PostgresJobPostingStore implements JobPostingStore {

    private final DataSource ds;

    public PostgresJobPostingStore(DataSource ds) {
        this.ds = ds;
    }

    @Override
    public Outcome<List<JobPosting>> list(TenantId tenantId) {
        String sql = select() + " WHERE tenant_id = ? ORDER BY updated_at DESC, job_id";
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, tenantId.value());
            List<JobPosting> result = new ArrayList<>();
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) result.add(readJob(rs));
            }
            return Outcome.ok(List.copyOf(result));
        } catch (IllegalArgumentException ex) {
            return corruptStatus();
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    @Override
    public Outcome<JobPosting> find(TenantId tenantId, String jobId) {
        try (Connection c = ds.getConnection()) {
            JobPosting job = readJob(c, tenantId.value(), jobId, false);
            return job == null
                    ? Outcome.fail(OutcomeCode.NOT_FOUND, "ilan bulunamadı")
                    : Outcome.ok(job);
        } catch (IllegalArgumentException ex) {
            return corruptStatus();
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    @Override
    public Outcome<String> findActiveCareerHandle(TenantId tenantId) {
        String sql = """
                SELECT public_handle
                  FROM ats_career_site
                 WHERE tenant_id = ? AND active = true
                """;
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, tenantId.value());
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next()
                        ? Outcome.ok(rs.getString("public_handle"))
                        : Outcome.fail(OutcomeCode.NOT_FOUND, "aktif kariyer sitesi bulunamadı");
            }
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    @Override
    public Outcome<MutationResult> create(CreateCommand command) {
        try (Connection c = ds.getConnection()) {
            c.setAutoCommit(false);
            try {
                Replay replay = reserveOrReplay(c, command.tenantId().value(), command.jobId(),
                        command.idempotencyKey(), command.requestDigest(), command.occurredAt());
                if (replay != null) {
                    c.rollback();
                    return replayResult(replay);
                }

                try {
                    insertJob(c, command);
                } catch (SQLException ex) {
                    c.rollback();
                    if ("23505".equals(ex.getSQLState())) {
                        return Outcome.ok(new MutationResult(MutationState.SLUG_CONFLICT, null));
                    }
                    return Pg.sqlFail(ex);
                }
                insertEvent(c, command.tenantId().value(), command.jobId(), "CREATED", null,
                        JobPostingStatus.DRAFT, 0, command.actorId().value(), command.idempotencyKey(),
                        command.requestDigest(), command.occurredAt());
                bindResponseSnapshot(c, command.tenantId().value(), command.idempotencyKey());
                c.commit();
                return mutationFromCurrent(command.tenantId(), command.jobId(), MutationState.CREATED);
            } catch (IllegalArgumentException ex) {
                c.rollback();
                return corruptMutation();
            } catch (SQLException ex) {
                c.rollback();
                return Pg.sqlFail(ex);
            } finally {
                c.setAutoCommit(true);
            }
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    @Override
    public Outcome<MutationResult> update(UpdateCommand command) {
        try (Connection c = ds.getConnection()) {
            c.setAutoCommit(false);
            try {
                Replay replay = reserveOrReplay(c, command.tenantId().value(), command.jobId(),
                        command.idempotencyKey(), command.requestDigest(), command.occurredAt());
                if (replay != null) {
                    c.rollback();
                    return replayResult(replay);
                }

                JobPosting current = readJob(c, command.tenantId().value(), command.jobId(), true);
                if (current == null) return rollback(c, MutationState.NOT_FOUND, null);
                if (current.version() != command.expectedVersion()) {
                    return rollback(c, MutationState.VERSION_CONFLICT, current);
                }
                if (current.status() == JobPostingStatus.CLOSED
                        || current.status() == JobPostingStatus.ARCHIVED) {
                    return rollback(c, MutationState.ILLEGAL_TRANSITION, current);
                }

                String sql = """
                        UPDATE ats_job_posting
                           SET slug = ?, title = ?, team = ?, location = ?, mode = ?,
                               employment_type = ?, summary = ?, highlights = ?::jsonb,
                               application_fields = ?::jsonb, notice_version = ?,
                               version = version + 1, updated_by = ?, updated_at = ?
                         WHERE tenant_id = ? AND job_id = ? AND version = ?
                        """;
                try (PreparedStatement ps = c.prepareStatement(sql)) {
                    int i = bindContent(ps, command.content());
                    ps.setString(i++, command.actorId().value());
                    ps.setTimestamp(i++, timestamp(command.occurredAt()));
                    ps.setString(i++, command.tenantId().value());
                    ps.setString(i++, command.jobId());
                    ps.setInt(i, command.expectedVersion());
                    if (ps.executeUpdate() != 1) {
                        return rollback(c, MutationState.VERSION_CONFLICT, current);
                    }
                } catch (SQLException ex) {
                    c.rollback();
                    if ("23505".equals(ex.getSQLState())) {
                        return Outcome.ok(new MutationResult(MutationState.SLUG_CONFLICT, current));
                    }
                    return Pg.sqlFail(ex);
                }

                int nextVersion = current.version() + 1;
                insertEvent(c, command.tenantId().value(), command.jobId(), "UPDATED",
                        current.status(), current.status(), nextVersion, command.actorId().value(),
                        command.idempotencyKey(), command.requestDigest(), command.occurredAt());
                bindResponseSnapshot(c, command.tenantId().value(), command.idempotencyKey());
                c.commit();
                return mutationFromCurrent(command.tenantId(), command.jobId(), MutationState.UPDATED);
            } catch (IllegalArgumentException ex) {
                c.rollback();
                return corruptMutation();
            } catch (SQLException ex) {
                c.rollback();
                return Pg.sqlFail(ex);
            } finally {
                c.setAutoCommit(true);
            }
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    @Override
    public Outcome<MutationResult> transition(TransitionCommand command) {
        try (Connection c = ds.getConnection()) {
            c.setAutoCommit(false);
            try {
                Replay replay = reserveOrReplay(c, command.tenantId().value(), command.jobId(),
                        command.idempotencyKey(), command.requestDigest(), command.occurredAt());
                if (replay != null) {
                    c.rollback();
                    return replayResult(replay);
                }

                JobPosting current = readJob(c, command.tenantId().value(), command.jobId(), true);
                if (current == null) return rollback(c, MutationState.NOT_FOUND, null);
                if (current.version() != command.expectedVersion()) {
                    return rollback(c, MutationState.VERSION_CONFLICT, current);
                }
                if (!current.status().canTransitionTo(command.target())) {
                    return rollback(c, MutationState.ILLEGAL_TRANSITION, current);
                }

                boolean published = command.target() == JobPostingStatus.PUBLISHED;
                String sql = """
                        UPDATE ats_job_posting
                           SET status = ?, published = ?, apply_enabled = ?, version = version + 1,
                               updated_by = ?, updated_at = ?
                         WHERE tenant_id = ? AND job_id = ? AND version = ?
                        """;
                try (PreparedStatement ps = c.prepareStatement(sql)) {
                    ps.setString(1, command.target().name());
                    ps.setBoolean(2, published);
                    ps.setBoolean(3, published);
                    ps.setString(4, command.actorId().value());
                    ps.setTimestamp(5, timestamp(command.occurredAt()));
                    ps.setString(6, command.tenantId().value());
                    ps.setString(7, command.jobId());
                    ps.setInt(8, command.expectedVersion());
                    if (ps.executeUpdate() != 1) {
                        return rollback(c, MutationState.VERSION_CONFLICT, current);
                    }
                }

                int nextVersion = current.version() + 1;
                insertEvent(c, command.tenantId().value(), command.jobId(), "TRANSITIONED",
                        current.status(), command.target(), nextVersion, command.actorId().value(),
                        command.idempotencyKey(), command.requestDigest(), command.occurredAt());
                bindResponseSnapshot(c, command.tenantId().value(), command.idempotencyKey());
                c.commit();
                return mutationFromCurrent(command.tenantId(), command.jobId(), MutationState.UPDATED);
            } catch (IllegalArgumentException ex) {
                c.rollback();
                return corruptMutation();
            } catch (SQLException ex) {
                c.rollback();
                return Pg.sqlFail(ex);
            } finally {
                c.setAutoCommit(true);
            }
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    private Replay reserveOrReplay(Connection c, String tenantId, String jobId,
            String idempotencyKey, String requestDigest, String occurredAt) throws SQLException {
        String insert = """
                INSERT INTO ats_job_command_idempotency
                    (tenant_id, idempotency_key, request_digest, job_id,
                     response_version, response_snapshot, created_at)
                VALUES (?, ?, ?, ?, NULL, NULL, ?)
                ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
                """;
        try (PreparedStatement ps = c.prepareStatement(insert)) {
            ps.setString(1, tenantId);
            ps.setString(2, idempotencyKey);
            ps.setString(3, requestDigest);
            ps.setString(4, jobId);
            ps.setTimestamp(5, timestamp(occurredAt));
            if (ps.executeUpdate() == 1) return null;
        }

        // PostgreSQL resolves an uncommitted unique-key/speculative-insert
        // conflict before ON CONFLICT DO NOTHING returns zero. The winning
        // command also binds its response snapshot before committing the same
        // transaction, so the SELECT below cannot observe a legitimate
        // half-completed row; NULL here is durable corruption and fails closed.
        String select = """
                SELECT request_digest, job_id, response_version,
                       response_snapshot ->> 'tenantId' AS snapshot_tenant_id,
                       response_snapshot ->> 'jobId' AS snapshot_job_id,
                       response_snapshot ->> 'slug' AS snapshot_slug,
                       response_snapshot ->> 'title' AS snapshot_title,
                       response_snapshot ->> 'team' AS snapshot_team,
                       response_snapshot ->> 'location' AS snapshot_location,
                       response_snapshot ->> 'mode' AS snapshot_mode,
                       response_snapshot ->> 'employmentType' AS snapshot_employment_type,
                       response_snapshot ->> 'summary' AS snapshot_summary,
                       (response_snapshot -> 'highlights')::text AS snapshot_highlights,
                       (response_snapshot -> 'applicationFields')::text AS snapshot_application_fields,
                       response_snapshot ->> 'noticeVersion' AS snapshot_notice_version,
                       response_snapshot ->> 'status' AS snapshot_status,
                       response_snapshot ->> 'applyEnabled' AS snapshot_apply_enabled,
                       response_snapshot ->> 'version' AS snapshot_version,
                       response_snapshot ->> 'createdAt' AS snapshot_created_at,
                       response_snapshot ->> 'updatedAt' AS snapshot_updated_at
                  FROM ats_job_command_idempotency
                 WHERE tenant_id = ? AND idempotency_key = ?
                """;
        try (PreparedStatement ps = c.prepareStatement(select)) {
            ps.setString(1, tenantId);
            ps.setString(2, idempotencyKey);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next() || rs.getObject("response_version") == null
                        || rs.getString("snapshot_job_id") == null) {
                    throw new SQLException("idempotency completion invariant", "23514");
                }
                return new Replay(
                        rs.getString("request_digest"),
                        snapshot(rs),
                        requestDigest);
            }
        }
    }

    private Outcome<MutationResult> replayResult(Replay replay) {
        if (!replay.requestDigest().equals(replay.expectedDigest())) {
            return Outcome.ok(new MutationResult(MutationState.IDEMPOTENCY_CONFLICT, null));
        }
        return Outcome.ok(new MutationResult(MutationState.REPLAYED, replay.snapshot()));
    }

    private void insertJob(Connection c, CreateCommand command) throws SQLException {
        String sql = """
                INSERT INTO ats_job_posting
                    (tenant_id, job_id, slug, title, team, location, mode, employment_type,
                     summary, highlights, application_fields, notice_version,
                     published, status, apply_enabled, version,
                     created_by, updated_by, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?, false, 'DRAFT', false, 0,
                        ?, ?, ?, ?)
                """;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, command.tenantId().value());
            ps.setString(2, command.jobId());
            int i = bindContent(ps, command.content(), 3);
            ps.setString(i++, command.actorId().value());
            ps.setString(i++, command.actorId().value());
            ps.setTimestamp(i++, timestamp(command.occurredAt()));
            ps.setTimestamp(i, timestamp(command.occurredAt()));
            ps.executeUpdate();
        }
    }

    private void insertEvent(Connection c, String tenantId, String jobId, String eventType,
            JobPostingStatus from, JobPostingStatus to, int resultingVersion, String actor,
            String idempotencyKey, String requestDigest, String occurredAt) throws SQLException {
        String sql = """
                INSERT INTO ats_job_posting_event
                    (tenant_id, job_id, event_type, from_status, to_status, resulting_version,
                     actor_ref, idempotency_key, request_digest, occurred_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, tenantId);
            ps.setString(2, jobId);
            ps.setString(3, eventType);
            ps.setString(4, from == null ? null : from.name());
            ps.setString(5, to.name());
            ps.setInt(6, resultingVersion);
            ps.setString(7, actor);
            ps.setString(8, idempotencyKey);
            ps.setString(9, requestDigest);
            ps.setTimestamp(10, timestamp(occurredAt));
            ps.executeUpdate();
        }
    }

    private void bindResponseSnapshot(Connection c, String tenantId, String key)
            throws SQLException {
        String sql = """
                UPDATE ats_job_command_idempotency AS i
                   SET response_version = j.version,
                       response_snapshot = jsonb_build_object(
                           'tenantId', j.tenant_id,
                           'jobId', j.job_id,
                           'slug', j.slug,
                           'title', j.title,
                           'team', j.team,
                           'location', j.location,
                           'mode', j.mode,
                           'employmentType', j.employment_type,
                           'summary', j.summary,
                           'highlights', j.highlights,
                           'applicationFields', j.application_fields,
                           'noticeVersion', j.notice_version,
                           'status', j.status,
                           'applyEnabled', j.apply_enabled,
                           'version', j.version,
                           'createdAt', j.created_at,
                           'updatedAt', j.updated_at)
                  FROM ats_job_posting AS j
                 WHERE i.tenant_id = ?
                   AND i.idempotency_key = ?
                   AND i.response_version IS NULL
                   AND j.tenant_id = i.tenant_id
                   AND j.job_id = i.job_id
                """;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, tenantId);
            ps.setString(2, key);
            if (ps.executeUpdate() != 1) {
                throw new SQLException("idempotency bind invariant", "23514");
            }
        }
    }

    private Outcome<MutationResult> mutationFromCurrent(
            TenantId tenantId, String jobId, MutationState state) {
        Outcome<JobPosting> found = find(tenantId, jobId);
        if (found instanceof Outcome.Fail<JobPosting> fail) {
            return Outcome.fail(fail.code(), fail.reason());
        }
        return Outcome.ok(new MutationResult(state, ((Outcome.Ok<JobPosting>) found).value()));
    }

    private JobPosting readJob(Connection c, String tenantId, String jobId, boolean lock)
            throws SQLException {
        String sql = select() + " WHERE tenant_id = ? AND job_id = ?" + (lock ? " FOR UPDATE" : "");
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, tenantId);
            ps.setString(2, jobId);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? readJob(rs) : null;
            }
        }
    }

    private static String select() {
        return """
                SELECT tenant_id, job_id, slug, title, team, location, mode,
                       employment_type, summary, highlights::text,
                       application_fields::text, notice_version, status,
                       apply_enabled, version, created_at, updated_at
                  FROM ats_job_posting
                """;
    }

    static JobPosting readJob(ResultSet rs) throws SQLException {
        return new JobPosting(
                new TenantId(rs.getString("tenant_id")), rs.getString("job_id"),
                rs.getString("slug"), rs.getString("title"), rs.getString("team"),
                rs.getString("location"), rs.getString("mode"), rs.getString("employment_type"),
                rs.getString("summary"), Pg.stringsFromJson(rs.getString("highlights")),
                Pg.stringsFromJson(rs.getString("application_fields")), rs.getString("notice_version"),
                JobPostingStatus.valueOf(rs.getString("status")), rs.getBoolean("apply_enabled"),
                rs.getInt("version"), iso(rs, "created_at"), iso(rs, "updated_at"));
    }

    private static JobPosting snapshot(ResultSet rs) throws SQLException {
        try {
            return new JobPosting(
                    new TenantId(rs.getString("snapshot_tenant_id")),
                    rs.getString("snapshot_job_id"), rs.getString("snapshot_slug"),
                    rs.getString("snapshot_title"), rs.getString("snapshot_team"),
                    rs.getString("snapshot_location"), rs.getString("snapshot_mode"),
                    rs.getString("snapshot_employment_type"), rs.getString("snapshot_summary"),
                    Pg.stringsFromJson(rs.getString("snapshot_highlights")),
                    Pg.stringsFromJson(rs.getString("snapshot_application_fields")),
                    rs.getString("snapshot_notice_version"),
                    JobPostingStatus.valueOf(rs.getString("snapshot_status")),
                    rs.getBoolean("snapshot_apply_enabled"), rs.getInt("snapshot_version"),
                    normalizedInstant(rs, "snapshot_created_at"),
                    normalizedInstant(rs, "snapshot_updated_at"));
        } catch (IllegalArgumentException ex) {
            throw new SQLException("idempotency snapshot bozuk", "23514", ex);
        }
    }

    private static int bindContent(PreparedStatement ps, Content content) throws SQLException {
        return bindContent(ps, content, 1);
    }

    private static int bindContent(PreparedStatement ps, Content content, int start) throws SQLException {
        int i = start;
        ps.setString(i++, content.slug());
        ps.setString(i++, content.title());
        ps.setString(i++, content.team());
        ps.setString(i++, content.location());
        ps.setString(i++, content.mode());
        ps.setString(i++, content.employmentType());
        ps.setString(i++, content.summary());
        ps.setString(i++, Pg.stringsToJson(content.highlights()));
        ps.setString(i++, Pg.stringsToJson(content.applicationFields()));
        ps.setString(i++, content.noticeVersion());
        return i;
    }

    private static Outcome<MutationResult> rollback(
            Connection c, MutationState state, JobPosting current) throws SQLException {
        c.rollback();
        return Outcome.ok(new MutationResult(state, current));
    }

    private static <T> Outcome<T> corruptStatus() {
        return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "ilan status değeri bozuk (fail-closed)");
    }

    private static Outcome<MutationResult> corruptMutation() {
        return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "ilan status/id değeri bozuk (fail-closed)");
    }

    private static Timestamp timestamp(String iso) { return Timestamp.from(Instant.parse(iso)); }
    private static String iso(ResultSet rs, String column) throws SQLException {
        return rs.getTimestamp(column).toInstant().toString();
    }

    private static String normalizedInstant(ResultSet rs, String column) throws SQLException {
        try {
            return Instant.parse(rs.getString(column)).toString();
        } catch (IllegalArgumentException ex) {
            throw new SQLException("idempotency snapshot timestamp bozuk", "23514", ex);
        }
    }

    private record Replay(
            String requestDigest,
            JobPosting snapshot,
            String expectedDigest) {}
}
