package com.ats.persistence;

import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import com.ats.offer.OfferPayPeriod;
import com.ats.offer.OfferStatus;
import com.ats.offer.OfferStore;
import com.ats.offer.OfferStore.CandidateOfferView;
import com.ats.offer.OfferStore.CommandState;
import com.ats.offer.OfferStore.Terms;
import com.ats.offer.OfferStore.WorkspaceResult;
import com.ats.offer.OfferWorkspace;
import com.ats.offer.OfferWorkspace.OfferRevision;
import java.sql.Connection;
import java.sql.Date;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import javax.sql.DataSource;

/** Plain-JDBC offer adapter; offer/application transitions are one transaction and CAS guarded. */
public final class PostgresOfferStore implements OfferStore {
    private final DataSource ds;

    public PostgresOfferStore(DataSource ds) {
        this.ds = ds;
    }

    @Override
    public Outcome<WorkspaceResult> create(CreateCommand command) {
        try (Connection c = ds.getConnection()) {
            c.setAutoCommit(false);
            try {
                if (!reserveCommand(c, command.tenantId(), command.actorId().value(),
                        command.idempotencyKey(), "CREATE", command.requestDigest(),
                        command.occurredAt())) {
                    ExistingCommand existing = readCommand(c, command.tenantId(),
                            command.actorId().value(), command.idempotencyKey());
                    c.rollback();
                    return replay(existing, command.requestDigest(), "CREATE");
                }
                ApplicationAnchor application = lockApplication(
                        c, command.tenantId(), command.applicationPublicRef(), null);
                if (application == null) return rollback(c, CommandState.NOT_FOUND, null);
                if (!"INTERVIEW_PENDING".equals(application.status())) {
                    return rollback(c, CommandState.ILLEGAL_TRANSITION, null);
                }
                if (!completedInterviewExists(c, command.tenantId(), application.applicationId())) {
                    return rollback(c, CommandState.INTERVIEW_NOT_COMPLETED, null);
                }
                if (activeOfferExists(c, command.tenantId(), application.applicationId())) {
                    return rollback(c, CommandState.ACTIVE_OFFER_EXISTS, null);
                }
                insertOffer(c, application.applicationId(), command);
                insertRevision(c, command.tenantId(), command.offerId(), 0, command.terms(),
                        OfferStatus.DRAFT, "Teklif taslağı oluşturuldu",
                        command.actorId().value(), command.occurredAt());
                bindCommand(c, command.tenantId(), command.actorId().value(),
                        command.idempotencyKey(), command.offerId(), 0);
                c.commit();
                return map(findById(command.tenantId(), command.offerId()), CommandState.CREATED);
            } catch (IllegalArgumentException ex) {
                c.rollback();
                return corrupt("teklif enum/veri değeri bozuk (fail-closed)");
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
    public Outcome<List<OfferWorkspace>> listRecruiter(
            TenantId tenantId, String applicationPublicRef) {
        String sql = """
                SELECT o.offer_id
                  FROM ats_offer o
                  JOIN ats_application a
                    ON a.tenant_id=o.tenant_id AND a.application_id=o.application_id
                 WHERE o.tenant_id=? AND a.public_ref=?
                   AND a.personal_data_erased_at IS NULL
                 ORDER BY o.created_at DESC, o.offer_id
                """;
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, tenantId.value());
            ps.setString(2, applicationPublicRef);
            List<String> ids = new ArrayList<>();
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) ids.add(rs.getString(1));
            }
            List<OfferWorkspace> result = new ArrayList<>();
            for (String id : ids) {
                OfferWorkspace value = readWorkspace(c, tenantId, id, applicationPublicRef);
                if (value == null) return corrupt("teklif listesi eşleşmedi (fail-closed)");
                result.add(value);
            }
            return Outcome.ok(List.copyOf(result));
        } catch (IllegalArgumentException ex) {
            return corrupt("teklif listesi enum değeri bozuk (fail-closed)");
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    @Override
    public Outcome<OfferWorkspace> findRecruiter(
            TenantId tenantId, String applicationPublicRef, String offerId) {
        try (Connection c = ds.getConnection()) {
            OfferWorkspace value = readWorkspace(c, tenantId, offerId, applicationPublicRef);
            return value == null
                    ? Outcome.fail(OutcomeCode.NOT_FOUND, "teklif bulunamadı")
                    : Outcome.ok(value);
        } catch (IllegalArgumentException ex) {
            return corrupt("teklif enum değeri bozuk (fail-closed)");
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    @Override
    public Outcome<WorkspaceResult> update(UpdateCommand command) {
        try (Connection c = ds.getConnection()) {
            c.setAutoCommit(false);
            try {
                if (!reserveCommand(c, command.tenantId(), command.actorId().value(),
                        command.idempotencyKey(), "UPDATE", command.requestDigest(),
                        command.occurredAt())) {
                    ExistingCommand existing = readCommand(c, command.tenantId(),
                            command.actorId().value(), command.idempotencyKey());
                    c.rollback();
                    return replay(existing, command.requestDigest(), "UPDATE");
                }
                LockedOffer current = lockOffer(c, command.tenantId(),
                        command.applicationPublicRef(), command.offerId());
                if (current == null) return rollback(c, CommandState.NOT_FOUND, null);
                if (current.version() != command.expectedVersion()) {
                    return rollback(c, CommandState.VERSION_CONFLICT,
                            findByIdValue(command.tenantId(), command.offerId()));
                }
                if (current.status() != OfferStatus.DRAFT) {
                    return rollback(c, CommandState.ILLEGAL_TRANSITION,
                            findByIdValue(command.tenantId(), command.offerId()));
                }
                int nextVersion = current.version() + 1;
                updateTerms(c, command, nextVersion);
                insertRevision(c, command.tenantId(), command.offerId(), nextVersion,
                        command.terms(), OfferStatus.DRAFT, command.reason(),
                        command.actorId().value(), command.occurredAt());
                bindCommand(c, command.tenantId(), command.actorId().value(),
                        command.idempotencyKey(), command.offerId(), nextVersion);
                c.commit();
                return map(findById(command.tenantId(), command.offerId()), CommandState.UPDATED);
            } catch (IllegalArgumentException ex) {
                c.rollback();
                return corrupt("teklif güncelleme değeri bozuk (fail-closed)");
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
    public Outcome<WorkspaceResult> transition(RecruiterTransitionCommand command) {
        String type = switch (command.target()) {
            case EXTENDED -> "EXTEND";
            case WITHDRAWN -> "WITHDRAW";
            case HIRED -> "HIRE";
            default -> throw new IllegalArgumentException("unsupported recruiter transition");
        };
        try (Connection c = ds.getConnection()) {
            c.setAutoCommit(false);
            try {
                if (!reserveCommand(c, command.tenantId(), command.actorId().value(),
                        command.idempotencyKey(), type, command.requestDigest(),
                        command.occurredAt())) {
                    ExistingCommand existing = readCommand(c, command.tenantId(),
                            command.actorId().value(), command.idempotencyKey());
                    c.rollback();
                    return replay(existing, command.requestDigest(), type);
                }
                ApplicationAnchor application = lockApplication(
                        c, command.tenantId(), command.applicationPublicRef(), null);
                LockedOffer current = lockOffer(c, command.tenantId(),
                        command.applicationPublicRef(), command.offerId());
                if (application == null || current == null) {
                    return rollback(c, CommandState.NOT_FOUND, null);
                }
                if (current.version() != command.expectedVersion()) {
                    return rollback(c, CommandState.VERSION_CONFLICT,
                            findByIdValue(command.tenantId(), command.offerId()));
                }
                if (!legalRecruiterTransition(current.status(), command.target())) {
                    return rollback(c, CommandState.ILLEGAL_TRANSITION,
                            findByIdValue(command.tenantId(), command.offerId()));
                }
                if (command.target() == OfferStatus.EXTENDED
                        && !current.expiresAt().isAfter(Instant.parse(command.occurredAt()))) {
                    return rollback(c, CommandState.EXPIRED,
                            findByIdValue(command.tenantId(), command.offerId()));
                }
                String applicationTarget = applicationTarget(command.target());
                if (!applicationStatusAllows(application.status(), command.target())) {
                    return rollback(c, CommandState.ILLEGAL_TRANSITION,
                            findByIdValue(command.tenantId(), command.offerId()));
                }
                int nextVersion = current.version() + 1;
                updateOfferStatus(c, command.tenantId(), command.offerId(), current.version(),
                        nextVersion, command.target(), command.occurredAt());
                Terms terms = readTerms(c, command.tenantId(), command.offerId());
                insertRevision(c, command.tenantId(), command.offerId(), nextVersion, terms,
                        command.target(), command.reason(), command.actorId().value(),
                        command.occurredAt());
                transitionApplication(c, command.tenantId(), application,
                        applicationTarget, command.actorId().value(), command.occurredAt());
                bindCommand(c, command.tenantId(), command.actorId().value(),
                        command.idempotencyKey(), command.offerId(), nextVersion);
                c.commit();
                return map(findById(command.tenantId(), command.offerId()), CommandState.UPDATED);
            } catch (IllegalArgumentException ex) {
                c.rollback();
                return corrupt("teklif geçiş değeri bozuk (fail-closed)");
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
    public Outcome<List<CandidateOfferView>> listCandidate(
            String applicationPublicRef, String candidateAccessDigest) {
        String sql = """
                SELECT o.offer_id, a.public_ref, j.title AS job_title, o.role_title,
                       o.start_date, o.employment_type, o.work_mode, o.location,
                       o.compensation_amount, o.currency, o.pay_period, o.expires_at,
                       o.terms_summary, o.status, o.version, o.updated_at
                  FROM ats_application a
                  JOIN ats_job_posting j
                    ON j.tenant_id=a.tenant_id AND j.job_id=a.job_id
                  LEFT JOIN ats_offer o
                    ON o.tenant_id=a.tenant_id AND o.application_id=a.application_id
                   AND o.status <> 'DRAFT'
                 WHERE a.public_ref=? AND a.candidate_access_digest=?
                   AND a.personal_data_erased_at IS NULL
                 ORDER BY o.created_at DESC NULLS LAST, o.offer_id
                """;
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, applicationPublicRef);
            ps.setString(2, candidateAccessDigest);
            List<CandidateOfferView> result = new ArrayList<>();
            boolean applicationFound = false;
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    applicationFound = true;
                    if (rs.getString("offer_id") == null) continue;
                    result.add(new CandidateOfferView(
                            rs.getString("offer_id"), rs.getString("public_ref"),
                            rs.getString("job_title"), rs.getString("role_title"),
                            rs.getDate("start_date").toLocalDate().toString(),
                            rs.getString("employment_type"), rs.getString("work_mode"),
                            rs.getString("location"), rs.getBigDecimal("compensation_amount"),
                            rs.getString("currency").strip(),
                            OfferPayPeriod.valueOf(rs.getString("pay_period")),
                            iso(rs, "expires_at"), rs.getString("terms_summary"),
                            OfferStatus.valueOf(rs.getString("status")), rs.getInt("version"),
                            iso(rs, "updated_at")));
                }
            }
            return applicationFound
                    ? Outcome.ok(List.copyOf(result))
                    : Outcome.fail(OutcomeCode.NOT_FOUND, "başvuru bulunamadı");
        } catch (IllegalArgumentException ex) {
            return corrupt("aday teklif görünümü enum değeri bozuk (fail-closed)");
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    @Override
    public Outcome<WorkspaceResult> respond(CandidateResponseCommand command) {
        try (Connection c = ds.getConnection()) {
            c.setAutoCommit(false);
            try {
                ApplicationAnchor application = lockApplication(
                        c, null, command.applicationPublicRef(), command.candidateAccessDigest());
                if (application == null) return rollback(c, CommandState.NOT_FOUND, null);
                TenantId tenantId = application.tenantId();
                String actorRef = "candidate:" + command.applicationPublicRef();
                String type = command.target() == OfferStatus.ACCEPTED ? "ACCEPT" : "DECLINE";
                if (!reserveCommand(c, tenantId, actorRef, command.idempotencyKey(), type,
                        command.requestDigest(), command.occurredAt())) {
                    ExistingCommand existing = readCommand(
                            c, tenantId, actorRef, command.idempotencyKey());
                    c.rollback();
                    return replay(existing, command.requestDigest(), type);
                }
                LockedOffer current = lockOffer(c, tenantId,
                        command.applicationPublicRef(), command.offerId());
                if (current == null) return rollback(c, CommandState.NOT_FOUND, null);
                if (current.version() != command.expectedVersion()) {
                    return rollback(c, CommandState.VERSION_CONFLICT,
                            findByIdValue(tenantId, command.offerId()));
                }
                if (current.status() != OfferStatus.EXTENDED
                        || !"OFFER_PENDING".equals(application.status())) {
                    return rollback(c, CommandState.ILLEGAL_TRANSITION,
                            findByIdValue(tenantId, command.offerId()));
                }
                if (!current.expiresAt().isAfter(Instant.parse(command.occurredAt()))) {
                    return rollback(c, CommandState.EXPIRED,
                            findByIdValue(tenantId, command.offerId()));
                }
                int nextVersion = current.version() + 1;
                updateOfferStatus(c, tenantId, command.offerId(), current.version(), nextVersion,
                        command.target(), command.occurredAt());
                Terms terms = readTerms(c, tenantId, command.offerId());
                String reason = command.target() == OfferStatus.ACCEPTED
                        ? "Aday ATS süreç teklifini kabul etti"
                        : "Aday ATS süreç teklifini reddetti";
                insertRevision(c, tenantId, command.offerId(), nextVersion, terms,
                        command.target(), reason, actorRef, command.occurredAt());
                transitionApplication(c, tenantId, application,
                        command.target() == OfferStatus.ACCEPTED
                                ? "OFFER_ACCEPTED" : "OFFER_DECLINED",
                        actorRef, command.occurredAt());
                bindCommand(c, tenantId, actorRef, command.idempotencyKey(),
                        command.offerId(), nextVersion);
                c.commit();
                return map(findById(tenantId, command.offerId()), CommandState.UPDATED);
            } catch (IllegalArgumentException ex) {
                c.rollback();
                return corrupt("aday teklif yanıtı bozuk (fail-closed)");
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

    private Outcome<OfferWorkspace> findById(TenantId tenantId, String offerId) {
        try (Connection c = ds.getConnection()) {
            OfferWorkspace value = readWorkspace(c, tenantId, offerId, null);
            return value == null
                    ? Outcome.fail(OutcomeCode.NOT_FOUND, "teklif bulunamadı")
                    : Outcome.ok(value);
        } catch (IllegalArgumentException ex) {
            return corrupt("teklif enum değeri bozuk (fail-closed)");
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    /** Idempotent replay current state'i değil, ilk komutun immutable revision sonucunu döndürür. */
    private Outcome<OfferWorkspace> findByIdAtVersion(
            TenantId tenantId, String offerId, int resultVersion) {
        try (Connection c = ds.getConnection()) {
            OfferWorkspace value = readWorkspaceAtVersion(c, tenantId, offerId, resultVersion);
            return value == null
                    ? Outcome.fail(OutcomeCode.NOT_FOUND, "teklif revision sonucu bulunamadı")
                    : Outcome.ok(value);
        } catch (IllegalArgumentException ex) {
            return corrupt("teklif replay revision değeri bozuk (fail-closed)");
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    private OfferWorkspace findByIdValue(TenantId tenantId, String offerId) {
        Outcome<OfferWorkspace> out = findById(tenantId, offerId);
        return out instanceof Outcome.Ok<OfferWorkspace> ok ? ok.value() : null;
    }

    private static OfferWorkspace readWorkspace(
            Connection c, TenantId tenantId, String offerId, String publicRef) throws SQLException {
        String sql = """
                SELECT o.offer_id, a.public_ref, j.slug, j.title AS job_title, a.full_name,
                       o.role_title, o.start_date, o.employment_type, o.work_mode, o.location,
                       o.compensation_amount, o.currency, o.pay_period, o.expires_at,
                       o.terms_summary, o.status, o.version, o.created_at, o.updated_at
                  FROM ats_offer o
                  JOIN ats_application a
                    ON a.tenant_id=o.tenant_id AND a.application_id=o.application_id
                  JOIN ats_job_posting j
                    ON j.tenant_id=a.tenant_id AND j.job_id=a.job_id
                 WHERE o.tenant_id=? AND o.offer_id=?
                   AND a.personal_data_erased_at IS NULL
                """;
        if (publicRef != null) sql += " AND a.public_ref=?";
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, tenantId.value());
            ps.setString(2, offerId);
            if (publicRef != null) ps.setString(3, publicRef);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) return null;
                return new OfferWorkspace(
                        tenantId, rs.getString("offer_id"), rs.getString("public_ref"),
                        rs.getString("slug"), rs.getString("job_title"), rs.getString("full_name"),
                        rs.getString("role_title"), rs.getDate("start_date").toLocalDate().toString(),
                        rs.getString("employment_type"), rs.getString("work_mode"),
                        rs.getString("location"), rs.getBigDecimal("compensation_amount"),
                        rs.getString("currency").strip(),
                        OfferPayPeriod.valueOf(rs.getString("pay_period")),
                        iso(rs, "expires_at"), rs.getString("terms_summary"),
                        OfferStatus.valueOf(rs.getString("status")), rs.getInt("version"),
                        readRevisions(c, tenantId, offerId), iso(rs, "created_at"),
                        iso(rs, "updated_at"));
            }
        }
    }

    private static OfferWorkspace readWorkspaceAtVersion(
            Connection c, TenantId tenantId, String offerId, int resultVersion)
            throws SQLException {
        String sql = """
                SELECT o.offer_id, a.public_ref, j.slug, j.title AS job_title, a.full_name,
                       r.role_title, r.start_date, r.employment_type, r.work_mode, r.location,
                       r.compensation_amount, r.currency, r.pay_period, r.expires_at,
                       r.terms_summary, r.status, r.version, o.created_at,
                       r.occurred_at AS updated_at
                  FROM ats_offer o
                  JOIN ats_offer_revision r
                    ON r.tenant_id=o.tenant_id AND r.offer_id=o.offer_id AND r.version=?
                  JOIN ats_application a
                    ON a.tenant_id=o.tenant_id AND a.application_id=o.application_id
                  JOIN ats_job_posting j
                    ON j.tenant_id=a.tenant_id AND j.job_id=a.job_id
                 WHERE o.tenant_id=? AND o.offer_id=?
                   AND a.personal_data_erased_at IS NULL
                """;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setInt(1, resultVersion);
            ps.setString(2, tenantId.value());
            ps.setString(3, offerId);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) return null;
                return new OfferWorkspace(
                        tenantId, rs.getString("offer_id"), rs.getString("public_ref"),
                        rs.getString("slug"), rs.getString("job_title"), rs.getString("full_name"),
                        rs.getString("role_title"), rs.getDate("start_date").toLocalDate().toString(),
                        rs.getString("employment_type"), rs.getString("work_mode"),
                        rs.getString("location"), rs.getBigDecimal("compensation_amount"),
                        rs.getString("currency").strip(),
                        OfferPayPeriod.valueOf(rs.getString("pay_period")),
                        iso(rs, "expires_at"), rs.getString("terms_summary"),
                        OfferStatus.valueOf(rs.getString("status")), rs.getInt("version"),
                        readRevisions(c, tenantId, offerId, resultVersion), iso(rs, "created_at"),
                        iso(rs, "updated_at"));
            }
        }
    }

    private static List<OfferRevision> readRevisions(
            Connection c, TenantId tenantId, String offerId) throws SQLException {
        return readRevisions(c, tenantId, offerId, null);
    }

    private static List<OfferRevision> readRevisions(
            Connection c, TenantId tenantId, String offerId, Integer maxVersion) throws SQLException {
        String sql = """
                SELECT version, role_title, start_date, employment_type, work_mode, location,
                       compensation_amount, currency, pay_period, expires_at, terms_summary,
                       status, reason, actor_ref, occurred_at
                 FROM ats_offer_revision
                 WHERE tenant_id=? AND offer_id=?
                """;
        if (maxVersion != null) sql += " AND version<=?";
        sql += " ORDER BY version";
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, tenantId.value()); ps.setString(2, offerId);
            if (maxVersion != null) ps.setInt(3, maxVersion);
            List<OfferRevision> result = new ArrayList<>();
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) result.add(new OfferRevision(
                        rs.getInt("version"), rs.getString("role_title"),
                        rs.getDate("start_date").toLocalDate().toString(),
                        rs.getString("employment_type"), rs.getString("work_mode"),
                        rs.getString("location"), rs.getBigDecimal("compensation_amount"),
                        rs.getString("currency").strip(),
                        OfferPayPeriod.valueOf(rs.getString("pay_period")),
                        iso(rs, "expires_at"), rs.getString("terms_summary"),
                        OfferStatus.valueOf(rs.getString("status")), rs.getString("reason"),
                        rs.getString("actor_ref"), iso(rs, "occurred_at")));
            }
            return List.copyOf(result);
        }
    }

    private static ApplicationAnchor lockApplication(
            Connection c, TenantId tenantId, String publicRef, String candidateDigest)
            throws SQLException {
        String sql = """
                SELECT tenant_id, application_id, status, version
                  FROM ats_application
                 WHERE public_ref=? AND personal_data_erased_at IS NULL
                """;
        if (tenantId != null) sql += " AND tenant_id=?";
        if (candidateDigest != null) sql += " AND candidate_access_digest=?";
        sql += " FOR UPDATE";
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            int i = 1;
            ps.setString(i++, publicRef);
            if (tenantId != null) ps.setString(i++, tenantId.value());
            if (candidateDigest != null) ps.setString(i, candidateDigest);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? new ApplicationAnchor(
                        new TenantId(rs.getString("tenant_id")),
                        rs.getObject("application_id", UUID.class),
                        rs.getString("status"), rs.getInt("version")) : null;
            }
        }
    }

    private static LockedOffer lockOffer(
            Connection c, TenantId tenantId, String publicRef, String offerId) throws SQLException {
        String sql = """
                SELECT o.version, o.status, o.expires_at
                  FROM ats_offer o
                  JOIN ats_application a
                    ON a.tenant_id=o.tenant_id AND a.application_id=o.application_id
                 WHERE o.tenant_id=? AND a.public_ref=? AND o.offer_id=?
                   AND a.personal_data_erased_at IS NULL
                 FOR UPDATE OF o
                """;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, tenantId.value()); ps.setString(2, publicRef); ps.setString(3, offerId);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? new LockedOffer(
                        rs.getInt("version"), OfferStatus.valueOf(rs.getString("status")),
                        rs.getTimestamp("expires_at").toInstant()) : null;
            }
        }
    }

    private static boolean completedInterviewExists(
            Connection c, TenantId tenantId, UUID applicationId) throws SQLException {
        String sql = "SELECT EXISTS (SELECT 1 FROM ats_interview"
                + " WHERE tenant_id=? AND application_id=? AND status='COMPLETED')";
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, tenantId.value()); ps.setObject(2, applicationId);
            try (ResultSet rs = ps.executeQuery()) { rs.next(); return rs.getBoolean(1); }
        }
    }

    private static boolean activeOfferExists(
            Connection c, TenantId tenantId, UUID applicationId) throws SQLException {
        String sql = "SELECT EXISTS (SELECT 1 FROM ats_offer WHERE tenant_id=?"
                + " AND application_id=? AND status IN ('DRAFT','EXTENDED','ACCEPTED'))";
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, tenantId.value()); ps.setObject(2, applicationId);
            try (ResultSet rs = ps.executeQuery()) { rs.next(); return rs.getBoolean(1); }
        }
    }

    private static void insertOffer(
            Connection c, UUID applicationId, CreateCommand command) throws SQLException {
        String sql = """
                INSERT INTO ats_offer
                    (tenant_id, offer_id, application_id, role_title, start_date,
                     employment_type, work_mode, location, compensation_amount, currency,
                     pay_period, expires_at, terms_summary, status, version, created_by,
                     created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', 0, ?, ?, ?)
                """;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            int i = setTerms(ps, 1, command.tenantId(), command.offerId(), applicationId,
                    command.terms());
            ps.setString(i++, command.actorId().value());
            ps.setTimestamp(i++, timestamp(command.occurredAt()));
            ps.setTimestamp(i, timestamp(command.occurredAt()));
            ps.executeUpdate();
        }
    }

    private static int setTerms(
            PreparedStatement ps, int i, TenantId tenantId, String offerId,
            UUID applicationId, Terms terms) throws SQLException {
        ps.setString(i++, tenantId.value()); ps.setString(i++, offerId); ps.setObject(i++, applicationId);
        ps.setString(i++, terms.roleTitle()); ps.setDate(i++, Date.valueOf(terms.startDate()));
        ps.setString(i++, terms.employmentType()); ps.setString(i++, terms.workMode());
        ps.setString(i++, terms.location()); ps.setBigDecimal(i++, terms.compensationAmount());
        ps.setString(i++, terms.currency()); ps.setString(i++, terms.payPeriod().name());
        ps.setTimestamp(i++, timestamp(terms.expiresAt())); ps.setString(i++, terms.termsSummary());
        return i;
    }

    private static void updateTerms(Connection c, UpdateCommand command, int nextVersion)
            throws SQLException {
        String sql = """
                UPDATE ats_offer
                   SET role_title=?, start_date=?, employment_type=?, work_mode=?, location=?,
                       compensation_amount=?, currency=?, pay_period=?, expires_at=?,
                       terms_summary=?, version=?, updated_at=?
                 WHERE tenant_id=? AND offer_id=? AND version=? AND status='DRAFT'
                """;
        Terms t = command.terms();
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            int i = 1;
            ps.setString(i++, t.roleTitle()); ps.setDate(i++, Date.valueOf(t.startDate()));
            ps.setString(i++, t.employmentType()); ps.setString(i++, t.workMode());
            ps.setString(i++, t.location()); ps.setBigDecimal(i++, t.compensationAmount());
            ps.setString(i++, t.currency()); ps.setString(i++, t.payPeriod().name());
            ps.setTimestamp(i++, timestamp(t.expiresAt())); ps.setString(i++, t.termsSummary());
            ps.setInt(i++, nextVersion); ps.setTimestamp(i++, timestamp(command.occurredAt()));
            ps.setString(i++, command.tenantId().value()); ps.setString(i++, command.offerId());
            ps.setInt(i, command.expectedVersion());
            if (ps.executeUpdate() != 1) throw new SQLException("offer update CAS invariant", "23514");
        }
    }

    private static void updateOfferStatus(
            Connection c, TenantId tenantId, String offerId, int expectedVersion,
            int nextVersion, OfferStatus target, String occurredAt) throws SQLException {
        String sql = "UPDATE ats_offer SET status=?, version=?, updated_at=?"
                + " WHERE tenant_id=? AND offer_id=? AND version=?";
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, target.name()); ps.setInt(2, nextVersion);
            ps.setTimestamp(3, timestamp(occurredAt)); ps.setString(4, tenantId.value());
            ps.setString(5, offerId); ps.setInt(6, expectedVersion);
            if (ps.executeUpdate() != 1) throw new SQLException("offer status CAS invariant", "23514");
        }
    }

    private static Terms readTerms(Connection c, TenantId tenantId, String offerId)
            throws SQLException {
        String sql = """
                SELECT role_title, start_date, employment_type, work_mode, location,
                       compensation_amount, currency, pay_period, expires_at, terms_summary
                  FROM ats_offer WHERE tenant_id=? AND offer_id=?
                """;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, tenantId.value()); ps.setString(2, offerId);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) throw new SQLException("offer terms missing", "23514");
                return new Terms(rs.getString("role_title"),
                        rs.getDate("start_date").toLocalDate().toString(),
                        rs.getString("employment_type"), rs.getString("work_mode"),
                        rs.getString("location"), rs.getBigDecimal("compensation_amount"),
                        rs.getString("currency").strip(),
                        OfferPayPeriod.valueOf(rs.getString("pay_period")),
                        iso(rs, "expires_at"), rs.getString("terms_summary"));
            }
        }
    }

    private static void insertRevision(
            Connection c, TenantId tenantId, String offerId, int version, Terms terms,
            OfferStatus status, String reason, String actorRef, String occurredAt)
            throws SQLException {
        String sql = """
                INSERT INTO ats_offer_revision
                    (tenant_id, offer_id, version, role_title, start_date, employment_type,
                     work_mode, location, compensation_amount, currency, pay_period, expires_at,
                     terms_summary, status, reason, actor_ref, occurred_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            int i = 1;
            ps.setString(i++, tenantId.value()); ps.setString(i++, offerId); ps.setInt(i++, version);
            ps.setString(i++, terms.roleTitle()); ps.setDate(i++, Date.valueOf(terms.startDate()));
            ps.setString(i++, terms.employmentType()); ps.setString(i++, terms.workMode());
            ps.setString(i++, terms.location()); ps.setBigDecimal(i++, terms.compensationAmount());
            ps.setString(i++, terms.currency()); ps.setString(i++, terms.payPeriod().name());
            ps.setTimestamp(i++, timestamp(terms.expiresAt())); ps.setString(i++, terms.termsSummary());
            ps.setString(i++, status.name()); ps.setString(i++, reason); ps.setString(i++, actorRef);
            ps.setTimestamp(i, timestamp(occurredAt)); ps.executeUpdate();
        }
    }

    private static void transitionApplication(
            Connection c, TenantId tenantId, ApplicationAnchor application,
            String target, String actorRef, String occurredAt) throws SQLException {
        String sql = "UPDATE ats_application SET status=?, version=version+1, updated_at=?"
                + " WHERE tenant_id=? AND application_id=? AND version=? AND status=?";
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, target); ps.setTimestamp(2, timestamp(occurredAt));
            ps.setString(3, tenantId.value()); ps.setObject(4, application.applicationId());
            ps.setInt(5, application.version()); ps.setString(6, application.status());
            if (ps.executeUpdate() != 1) throw new SQLException("application offer CAS invariant", "23514");
        }
        String eventSql = """
                INSERT INTO ats_application_event
                    (tenant_id, application_id, from_status, to_status, actor_ref, occurred_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """;
        try (PreparedStatement ps = c.prepareStatement(eventSql)) {
            ps.setString(1, tenantId.value()); ps.setObject(2, application.applicationId());
            ps.setString(3, application.status()); ps.setString(4, target);
            ps.setString(5, actorRef); ps.setTimestamp(6, timestamp(occurredAt)); ps.executeUpdate();
        }
    }

    private static boolean legalRecruiterTransition(OfferStatus current, OfferStatus target) {
        return (current == OfferStatus.DRAFT && target == OfferStatus.EXTENDED)
                || (current == OfferStatus.EXTENDED && target == OfferStatus.WITHDRAWN)
                || (current == OfferStatus.ACCEPTED && target == OfferStatus.HIRED);
    }

    private static boolean applicationStatusAllows(String current, OfferStatus target) {
        return switch (target) {
            case EXTENDED -> "INTERVIEW_PENDING".equals(current);
            case WITHDRAWN -> "OFFER_PENDING".equals(current);
            case HIRED -> "OFFER_ACCEPTED".equals(current);
            default -> false;
        };
    }

    private static String applicationTarget(OfferStatus target) {
        return switch (target) {
            case EXTENDED -> "OFFER_PENDING";
            case WITHDRAWN -> "OFFER_WITHDRAWN";
            case HIRED -> "HIRED";
            default -> throw new IllegalArgumentException("application target yok");
        };
    }

    private static boolean reserveCommand(
            Connection c, TenantId tenantId, String actorRef, String key,
            String type, String digest, String occurredAt) throws SQLException {
        String sql = """
                INSERT INTO ats_offer_command_idempotency
                    (tenant_id, actor_ref, idempotency_key, command_type, request_digest,
                     offer_id, result_version, created_at)
                VALUES (?, ?, ?, ?, ?, NULL, NULL, ?)
                ON CONFLICT (tenant_id, actor_ref, idempotency_key) DO NOTHING
                """;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, tenantId.value()); ps.setString(2, actorRef); ps.setString(3, key);
            ps.setString(4, type); ps.setString(5, digest); ps.setTimestamp(6, timestamp(occurredAt));
            return ps.executeUpdate() == 1;
        }
    }

    private static ExistingCommand readCommand(
            Connection c, TenantId tenantId, String actorRef, String key) throws SQLException {
        String sql = """
                SELECT command_type, request_digest, offer_id, result_version
                  FROM ats_offer_command_idempotency
                 WHERE tenant_id=? AND actor_ref=? AND idempotency_key=?
                """;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, tenantId.value()); ps.setString(2, actorRef); ps.setString(3, key);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? new ExistingCommand(
                        tenantId, rs.getString("command_type"), rs.getString("request_digest"),
                        rs.getString("offer_id"), (Integer) rs.getObject("result_version")) : null;
            }
        }
    }

    private static void bindCommand(
            Connection c, TenantId tenantId, String actorRef, String key,
            String offerId, int resultVersion) throws SQLException {
        String sql = """
                UPDATE ats_offer_command_idempotency
                   SET offer_id=?, result_version=?
                 WHERE tenant_id=? AND actor_ref=? AND idempotency_key=? AND offer_id IS NULL
                """;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, offerId); ps.setInt(2, resultVersion); ps.setString(3, tenantId.value());
            ps.setString(4, actorRef); ps.setString(5, key);
            if (ps.executeUpdate() != 1) throw new SQLException("offer idempotency bind invariant", "23514");
        }
    }

    private Outcome<WorkspaceResult> replay(
            ExistingCommand existing, String requestDigest, String commandType) {
        if (existing == null || !requestDigest.equals(existing.requestDigest())
                || !commandType.equals(existing.commandType())) {
            return Outcome.ok(new WorkspaceResult(CommandState.IDEMPOTENCY_CONFLICT, null));
        }
        if (existing.offerId() == null || existing.resultVersion() == null) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED,
                    "offer idempotency kaydı tamamlanmamış (fail-closed)");
        }
        return map(findByIdAtVersion(
                existing.tenantId(), existing.offerId(), existing.resultVersion()),
                CommandState.REPLAYED);
    }

    private static Outcome<WorkspaceResult> rollback(
            Connection c, CommandState state, OfferWorkspace value) throws SQLException {
        c.rollback();
        return Outcome.ok(new WorkspaceResult(state, value));
    }

    private static Outcome<WorkspaceResult> map(
            Outcome<OfferWorkspace> source, CommandState state) {
        if (source instanceof Outcome.Fail<OfferWorkspace> fail) {
            return Outcome.fail(fail.code(), fail.reason());
        }
        return Outcome.ok(new WorkspaceResult(
                state, ((Outcome.Ok<OfferWorkspace>) source).value()));
    }

    private static <T> Outcome<T> corrupt(String reason) {
        return Outcome.fail(OutcomeCode.NOT_CONFIGURED, reason);
    }

    private static Timestamp timestamp(String value) {
        return Timestamp.from(Instant.parse(value));
    }

    private static String iso(ResultSet rs, String column) throws SQLException {
        return rs.getTimestamp(column).toInstant().toString();
    }

    private record ApplicationAnchor(
            TenantId tenantId, UUID applicationId, String status, int version) {}

    private record LockedOffer(int version, OfferStatus status, Instant expiresAt) {}

    private record ExistingCommand(
            TenantId tenantId, String commandType, String requestDigest,
            String offerId, Integer resultVersion) {}
}
