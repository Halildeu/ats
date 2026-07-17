package com.ats.persistence;

import com.ats.application.ApplicationIntakeService;
import com.ats.application.ApplicationStatus;
import com.ats.application.ApplicationStore;
import com.ats.application.CandidateApplication;
import com.ats.application.JobPosting;
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
import java.util.UUID;
import javax.sql.DataSource;

/** Faz 25 Full ATS plain-JDBC adapter. JPA/Spring Data yoktur. */
public final class PostgresApplicationStore implements ApplicationStore {

    private final DataSource ds;

    public PostgresApplicationStore(DataSource ds) {
        this.ds = ds;
    }

    @Override
    public Outcome<List<JobPosting>> listPublishedJobs(TenantId publicTenantId) {
        String sql = """
                SELECT tenant_id, job_id, slug, title, team, location, mode,
                       employment_type, summary, highlights::text,
                       application_fields::text, notice_version, status,
                       apply_enabled, version, created_at, updated_at
                  FROM ats_job_posting
                 WHERE tenant_id = ? AND status = 'PUBLISHED' AND apply_enabled = true
                 ORDER BY updated_at DESC, slug
                """;
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, publicTenantId.value());
            List<JobPosting> result = new ArrayList<>();
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) result.add(readJob(rs));
            }
            return Outcome.ok(List.copyOf(result));
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    @Override
    public Outcome<JobPosting> findPublishedJob(TenantId publicTenantId, String slug) {
        String sql = """
                SELECT tenant_id, job_id, slug, title, team, location, mode,
                       employment_type, summary, highlights::text,
                       application_fields::text, notice_version, status,
                       apply_enabled, version, created_at, updated_at
                  FROM ats_job_posting
                 WHERE tenant_id = ? AND slug = ?
                   AND status = 'PUBLISHED' AND apply_enabled = true
                """;
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, publicTenantId.value());
            ps.setString(2, slug);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next()
                        ? Outcome.ok(readJob(rs))
                        : Outcome.fail(OutcomeCode.NOT_FOUND, "ilan bulunamadı");
            }
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    @Override
    public Outcome<TenantId> resolveActiveCareerTenant(String publicHandle) {
        String sql = """
                SELECT tenant_id
                  FROM ats_career_site
                 WHERE public_handle = ? AND active = true
                """;
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, publicHandle);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next()
                        ? Outcome.ok(new TenantId(rs.getString("tenant_id")))
                        : Outcome.fail(OutcomeCode.NOT_FOUND, "kariyer sitesi bulunamadı");
            }
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    @Override
    public Outcome<SubmitResult> submit(SubmitCommand command) {
        try (Connection c = ds.getConnection()) {
            c.setAutoCommit(false);
            try {
                JobPosting job = lockPublishedJob(
                        c, command.publicTenantId(), command.publicHandle(), command.jobSlug());
                if (job == null) {
                    c.rollback();
                    return Outcome.fail(OutcomeCode.NOT_FOUND, "ilan bulunamadı");
                }
                if (!job.noticeVersion().equals(command.submission().noticeVersion())) {
                    c.rollback();
                    return Outcome.fail(OutcomeCode.INVALID,
                            "ilan aydınlatma sürümü değişti; formu yenileyin");
                }

                boolean reserved = reserveIdempotency(c, job, command);
                if (!reserved) {
                    ExistingIdempotency existing = readIdempotency(c, job, command.idempotencyKey());
                    c.rollback();
                    if (existing == null || existing.applicationId() == null) {
                        return Outcome.fail(OutcomeCode.NOT_CONFIGURED,
                                "idempotency kaydı tamamlanmamış (fail-closed)");
                    }
                    if (!existing.requestDigest().equals(command.requestDigest())) {
                        return Outcome.ok(new SubmitResult(SubmitState.IDEMPOTENCY_CONFLICT, null));
                    }
                    Outcome<CandidateApplication> replay = findByApplicationId(
                            job.tenantId(), existing.applicationId());
                    if (replay instanceof Outcome.Fail<CandidateApplication> fail) {
                        return Outcome.fail(fail.code(), fail.reason());
                    }
                    return Outcome.ok(new SubmitResult(
                            SubmitState.REPLAYED, ((Outcome.Ok<CandidateApplication>) replay).value()));
                }

                UUID applicationId = UUID.randomUUID();
                insertApplication(c, job, applicationId, command);
                insertEvent(c, job.tenantId(), applicationId, null,
                        ApplicationStatus.SUBMITTED, "candidate:self", command.occurredAt());
                bindIdempotency(c, job, command.idempotencyKey(), applicationId);
                c.commit();

                Outcome<CandidateApplication> created = findByApplicationId(
                        job.tenantId(), applicationId.toString());
                if (created instanceof Outcome.Fail<CandidateApplication> fail) {
                    return Outcome.fail(fail.code(), fail.reason());
                }
                return Outcome.ok(new SubmitResult(
                        SubmitState.CREATED, ((Outcome.Ok<CandidateApplication>) created).value()));
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
    public Outcome<CandidateStatusView> findCandidateStatus(String publicRef, String candidateAccessDigest) {
        String sql = """
                SELECT a.public_ref, j.slug, j.title, a.status, a.version,
                       a.created_at, a.updated_at
                  FROM ats_application a
                  JOIN ats_job_posting j
                    ON j.tenant_id = a.tenant_id AND j.job_id = a.job_id
                 WHERE a.public_ref = ? AND a.candidate_access_digest = ?
                   AND a.personal_data_erased_at IS NULL
                """;
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, publicRef);
            ps.setString(2, candidateAccessDigest);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) return Outcome.fail(OutcomeCode.NOT_FOUND, "başvuru bulunamadı");
                return Outcome.ok(new CandidateStatusView(
                        rs.getString("public_ref"), rs.getString("slug"), rs.getString("title"),
                        ApplicationStatus.valueOf(rs.getString("status")), rs.getInt("version"),
                        iso(rs, "created_at"), iso(rs, "updated_at")));
            }
        } catch (IllegalArgumentException ex) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "status değeri bozuk (fail-closed)");
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    @Override
    public Outcome<ApplicationPage> listRecruiterApplications(
            TenantId tenantId, String jobSlug, ApplicationStatus status, int page, int size) {
        String where = " WHERE a.tenant_id = ? AND a.personal_data_erased_at IS NULL";
        if (jobSlug != null) where += " AND j.slug = ?";
        if (status != null) where += " AND a.status = ?";
        String countSql = "SELECT count(*) FROM ats_application a JOIN ats_job_posting j"
                + " ON j.tenant_id=a.tenant_id AND j.job_id=a.job_id" + where;
        String listSql = applicationSelect() + where
                + " ORDER BY a.created_at DESC, a.application_id LIMIT ? OFFSET ?";
        try (Connection c = ds.getConnection()) {
            long total;
            try (PreparedStatement count = c.prepareStatement(countSql)) {
                bindFilters(count, tenantId, jobSlug, status);
                try (ResultSet rs = count.executeQuery()) { rs.next(); total = rs.getLong(1); }
            }
            List<CandidateApplication> items = new ArrayList<>();
            try (PreparedStatement list = c.prepareStatement(listSql)) {
                int next = bindFilters(list, tenantId, jobSlug, status);
                list.setInt(next++, size);
                list.setLong(next, (long) page * size);
                try (ResultSet rs = list.executeQuery()) {
                    while (rs.next()) items.add(readApplication(rs));
                }
            }
            return Outcome.ok(new ApplicationPage(items, page, size, total));
        } catch (IllegalArgumentException ex) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "status değeri bozuk (fail-closed)");
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    @Override
    public Outcome<TransitionResult> transition(TransitionCommand command) {
        try (Connection c = ds.getConnection()) {
            c.setAutoCommit(false);
            try {
                CandidateApplication current = lockApplication(
                        c, command.tenantId(), command.publicRef());
                if (current == null) {
                    c.rollback();
                    return Outcome.ok(new TransitionResult(TransitionState.NOT_FOUND, null));
                }
                if (current.version() != command.expectedVersion()) {
                    c.rollback();
                    return Outcome.ok(new TransitionResult(TransitionState.VERSION_CONFLICT, current));
                }
                if (!ApplicationIntakeService.isAllowedTransition(current.status(), command.toStatus())) {
                    c.rollback();
                    return Outcome.ok(new TransitionResult(TransitionState.ILLEGAL_TRANSITION, current));
                }
                String update = """
                        UPDATE ats_application
                           SET status = ?, version = version + 1, updated_at = ?
                         WHERE tenant_id = ? AND public_ref = ? AND version = ?
                           AND personal_data_erased_at IS NULL
                        """;
                try (PreparedStatement ps = c.prepareStatement(update)) {
                    ps.setString(1, command.toStatus().name());
                    ps.setTimestamp(2, timestamp(command.occurredAt()));
                    ps.setString(3, command.tenantId().value());
                    ps.setString(4, command.publicRef());
                    ps.setInt(5, command.expectedVersion());
                    if (ps.executeUpdate() != 1) {
                        throw new SQLException("application transition row-lock invariant", "23514");
                    }
                }
                insertEvent(c, command.tenantId(), UUID.fromString(current.applicationId()),
                        current.status(), command.toStatus(), command.actorId().value(), command.occurredAt());
                c.commit();
                Outcome<CandidateApplication> updated = findByApplicationId(
                        command.tenantId(), current.applicationId());
                if (updated instanceof Outcome.Fail<CandidateApplication> fail) {
                    return Outcome.fail(fail.code(), fail.reason());
                }
                return Outcome.ok(new TransitionResult(
                        TransitionState.UPDATED, ((Outcome.Ok<CandidateApplication>) updated).value()));
            } catch (IllegalArgumentException ex) {
                c.rollback();
                return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "status/id değeri bozuk (fail-closed)");
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

    private JobPosting lockPublishedJob(
            Connection c, TenantId publicTenantId, String publicHandle, String slug)
            throws SQLException {
        boolean canonicalHandle = publicHandle != null;
        String sql = canonicalHandle ? """
                SELECT j.tenant_id, j.job_id, j.slug, j.title, j.team, j.location, j.mode,
                       j.employment_type, j.summary, j.highlights::text,
                       j.application_fields::text, j.notice_version, j.status,
                       j.apply_enabled, j.version, j.created_at, j.updated_at
                  FROM ats_job_posting j
                  JOIN ats_career_site c ON c.tenant_id = j.tenant_id
                 WHERE j.tenant_id = ? AND c.public_handle = ? AND c.active = true
                   AND j.slug = ? AND j.status = 'PUBLISHED' AND j.apply_enabled = true
                 FOR SHARE OF j
                """ : """
                SELECT tenant_id, job_id, slug, title, team, location, mode,
                       employment_type, summary, highlights::text,
                       application_fields::text, notice_version, status,
                       apply_enabled, version, created_at, updated_at
                  FROM ats_job_posting
                 WHERE tenant_id = ? AND slug = ?
                   AND status = 'PUBLISHED' AND apply_enabled = true
                 FOR SHARE
                """;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, publicTenantId.value());
            if (canonicalHandle) {
                ps.setString(2, publicHandle);
                ps.setString(3, slug);
            } else {
                ps.setString(2, slug);
            }
            try (ResultSet rs = ps.executeQuery()) { return rs.next() ? readJob(rs) : null; }
        }
    }

    private boolean reserveIdempotency(Connection c, JobPosting job, SubmitCommand command) throws SQLException {
        String sql = """
                INSERT INTO ats_application_idempotency
                    (tenant_id, job_id, idempotency_key, request_digest, application_id, created_at)
                VALUES (?, ?, ?, ?, NULL, ?)
                ON CONFLICT (tenant_id, job_id, idempotency_key) DO NOTHING
                """;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, job.tenantId().value());
            ps.setString(2, job.jobId());
            ps.setString(3, command.idempotencyKey());
            ps.setString(4, command.requestDigest());
            ps.setTimestamp(5, timestamp(command.occurredAt()));
            return ps.executeUpdate() == 1;
        }
    }

    private ExistingIdempotency readIdempotency(Connection c, JobPosting job, String key) throws SQLException {
        String sql = """
                SELECT request_digest, application_id::text
                  FROM ats_application_idempotency
                 WHERE tenant_id = ? AND job_id = ? AND idempotency_key = ?
                """;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, job.tenantId().value()); ps.setString(2, job.jobId()); ps.setString(3, key);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? new ExistingIdempotency(
                        rs.getString("request_digest"), rs.getString("application_id")) : null;
            }
        }
    }

    private void bindIdempotency(Connection c, JobPosting job, String key, UUID appId) throws SQLException {
        String sql = """
                UPDATE ats_application_idempotency SET application_id = ?
                 WHERE tenant_id = ? AND job_id = ? AND idempotency_key = ?
                   AND application_id IS NULL
                """;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setObject(1, appId); ps.setString(2, job.tenantId().value());
            ps.setString(3, job.jobId()); ps.setString(4, key);
            if (ps.executeUpdate() != 1) throw new SQLException("idempotency bind invariant", "23514");
        }
    }

    private void insertApplication(Connection c, JobPosting job, UUID appId, SubmitCommand command)
            throws SQLException {
        var s = command.submission();
        String sql = """
                INSERT INTO ats_application
                    (tenant_id, application_id, public_ref, job_id, full_name, email, phone, city,
                     linkedin_url, portfolio_url, professional_summary, experience, education,
                     skills, note, status, version, candidate_access_digest, notice_version,
                     notice_accepted_at, accuracy_confirmed_at, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, 'SUBMITTED', 0,
                        ?, ?, ?, ?, ?, ?)
                """;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            int i = 1;
            ps.setString(i++, job.tenantId().value()); ps.setObject(i++, appId);
            ps.setString(i++, command.publicRef()); ps.setString(i++, job.jobId());
            ps.setString(i++, s.fullName()); ps.setString(i++, s.email()); ps.setString(i++, s.phone());
            ps.setString(i++, s.city()); ps.setString(i++, s.linkedIn()); ps.setString(i++, s.portfolio());
            ps.setString(i++, s.summary()); ps.setString(i++, s.experience()); ps.setString(i++, s.education());
            ps.setString(i++, Pg.stringsToJson(s.skills())); ps.setString(i++, s.note());
            ps.setString(i++, command.candidateAccessDigest()); ps.setString(i++, s.noticeVersion());
            ps.setTimestamp(i++, timestamp(s.noticeAcceptedAt()));
            ps.setTimestamp(i++, timestamp(s.accuracyConfirmedAt()));
            ps.setTimestamp(i++, timestamp(command.occurredAt()));
            ps.setTimestamp(i, timestamp(command.occurredAt()));
            ps.executeUpdate();
        }
    }

    private void insertEvent(Connection c, TenantId tenantId, UUID applicationId,
            ApplicationStatus from, ApplicationStatus to, String actor, String occurredAt) throws SQLException {
        String sql = """
                INSERT INTO ats_application_event
                    (tenant_id, application_id, from_status, to_status, actor_ref, occurred_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, tenantId.value()); ps.setObject(2, applicationId);
            ps.setString(3, from == null ? null : from.name()); ps.setString(4, to.name());
            ps.setString(5, actor); ps.setTimestamp(6, timestamp(occurredAt)); ps.executeUpdate();
        }
    }

    private Outcome<CandidateApplication> findByApplicationId(TenantId tenantId, String applicationId) {
        String sql = applicationSelect() + " WHERE a.tenant_id = ? AND a.application_id = ?::uuid"
                + " AND a.personal_data_erased_at IS NULL";
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, tenantId.value()); ps.setString(2, applicationId);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? Outcome.ok(readApplication(rs))
                        : Outcome.fail(OutcomeCode.NOT_FOUND, "başvuru bulunamadı");
            }
        } catch (IllegalArgumentException ex) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "status değeri bozuk (fail-closed)");
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    private CandidateApplication lockApplication(Connection c, TenantId tenantId, String publicRef)
            throws SQLException {
        String sql = applicationSelect()
                + " WHERE a.tenant_id = ? AND a.public_ref = ? AND a.personal_data_erased_at IS NULL FOR UPDATE OF a";
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, tenantId.value()); ps.setString(2, publicRef);
            try (ResultSet rs = ps.executeQuery()) { return rs.next() ? readApplication(rs) : null; }
        }
    }

    private static String applicationSelect() {
        return """
                SELECT a.tenant_id, a.application_id::text, a.public_ref, a.job_id,
                       j.slug, j.title, a.full_name, a.email, a.phone, a.city,
                       a.linkedin_url, a.portfolio_url, a.professional_summary,
                       a.experience, a.education, a.skills::text, a.note, a.status,
                       a.version, a.notice_version, a.notice_accepted_at,
                       a.accuracy_confirmed_at, a.created_at, a.updated_at
                  FROM ats_application a
                  JOIN ats_job_posting j
                    ON j.tenant_id = a.tenant_id AND j.job_id = a.job_id
                """;
    }

    private static CandidateApplication readApplication(ResultSet rs) throws SQLException {
        return new CandidateApplication(
                new TenantId(rs.getString("tenant_id")), rs.getString("application_id"),
                rs.getString("public_ref"), rs.getString("job_id"), rs.getString("slug"),
                rs.getString("title"), rs.getString("full_name"), rs.getString("email"),
                rs.getString("phone"), rs.getString("city"), rs.getString("linkedin_url"),
                rs.getString("portfolio_url"), rs.getString("professional_summary"),
                rs.getString("experience"), rs.getString("education"),
                Pg.stringsFromJson(rs.getString("skills")), rs.getString("note"),
                ApplicationStatus.valueOf(rs.getString("status")), rs.getInt("version"),
                rs.getString("notice_version"), iso(rs, "notice_accepted_at"),
                iso(rs, "accuracy_confirmed_at"), iso(rs, "created_at"), iso(rs, "updated_at"));
    }

    private static JobPosting readJob(ResultSet rs) throws SQLException {
        return PostgresJobPostingStore.readJob(rs);
    }

    private static int bindFilters(PreparedStatement ps, TenantId tenantId,
            String jobSlug, ApplicationStatus status) throws SQLException {
        int i = 1;
        ps.setString(i++, tenantId.value());
        if (jobSlug != null) ps.setString(i++, jobSlug);
        if (status != null) ps.setString(i++, status.name());
        return i;
    }

    private static Timestamp timestamp(String iso) { return Timestamp.from(Instant.parse(iso)); }
    private static String iso(ResultSet rs, String column) throws SQLException {
        return rs.getTimestamp(column).toInstant().toString();
    }

    private record ExistingIdempotency(String requestDigest, String applicationId) {}
}
