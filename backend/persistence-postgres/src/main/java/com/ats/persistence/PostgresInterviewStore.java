package com.ats.persistence;

import com.ats.interview.InterviewMode;
import com.ats.interview.InterviewScorecard;
import com.ats.interview.InterviewScorecard.Rating;
import com.ats.interview.InterviewScorecard.Recommendation;
import com.ats.interview.InterviewStatus;
import com.ats.interview.InterviewStore;
import com.ats.interview.InterviewStore.CandidateInterviewView;
import com.ats.interview.InterviewStore.CommandState;
import com.ats.interview.InterviewStore.ScorecardResult;
import com.ats.interview.InterviewStore.ScorecardState;
import com.ats.interview.InterviewStore.WorkspaceResult;
import com.ats.interview.InterviewType;
import com.ats.interview.InterviewWorkspace;
import com.ats.interview.InterviewWorkspace.Criterion;
import com.ats.interview.InterviewWorkspace.Participant;
import com.ats.interview.InterviewWorkspace.ParticipantRole;
import com.ats.interview.InterviewWorkspace.ScheduleRevision;
import com.ats.kernel.Ids.ActorId;
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
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import javax.sql.DataSource;

/** Plain-JDBC interview workspace adapter; all mutation paths are tenant-scoped and transactional. */
public final class PostgresInterviewStore implements InterviewStore {

    private final DataSource ds;

    public PostgresInterviewStore(DataSource ds) {
        this.ds = ds;
    }

    @Override
    public Outcome<WorkspaceResult> create(CreateCommand command) {
        try (Connection c = ds.getConnection()) {
            c.setAutoCommit(false);
            try {
                if (!reserveCommand(c, command.tenantId(), command.actorId(),
                        command.idempotencyKey(), "CREATE", command.requestDigest(),
                        command.occurredAt())) {
                    ExistingCommand existing = readCommand(c, command.tenantId(),
                            command.actorId(), command.idempotencyKey());
                    c.rollback();
                    return replayWorkspace(existing, command.requestDigest(), "CREATE");
                }

                ApplicationAnchor anchor = lockApplication(
                        c, command.tenantId(), command.applicationPublicRef());
                if (anchor == null) {
                    c.rollback();
                    return Outcome.ok(new WorkspaceResult(CommandState.NOT_FOUND, null));
                }
                if (!("UNDER_REVIEW".equals(anchor.status())
                        || "INTERVIEW_PENDING".equals(anchor.status()))) {
                    c.rollback();
                    return Outcome.ok(new WorkspaceResult(CommandState.ILLEGAL_TRANSITION, null));
                }
                insertInterview(c, anchor.applicationId(), command);
                insertParticipants(c, command);
                insertCriteria(c, command);
                insertScheduleRevision(c, command.tenantId(), command.interviewId(), 0,
                        command.startsAt(), command.endsAt(), command.timeZone(), command.mode(),
                        command.location(), InterviewStatus.SCHEDULED, "Mülakat oluşturuldu",
                        command.actorId().value(), command.occurredAt());
                if ("UNDER_REVIEW".equals(anchor.status())) {
                    stageApplicationForInterview(c, command, anchor);
                }
                bindCommand(c, command.tenantId(), command.actorId(), command.idempotencyKey(),
                        command.interviewId(), null, 0);
                c.commit();
                Outcome<InterviewWorkspace> created = findById(
                        command.tenantId(), command.interviewId());
                return mapWorkspace(created, CommandState.CREATED);
            } catch (IllegalArgumentException ex) {
                c.rollback();
                return Outcome.fail(OutcomeCode.NOT_CONFIGURED,
                        "mülakat enum/veri değeri bozuk (fail-closed)");
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
    public Outcome<List<InterviewWorkspace>> listRecruiter(
            TenantId tenantId, String applicationPublicRef) {
        String sql = """
                SELECT i.interview_id
                  FROM ats_interview i
                  JOIN ats_application a
                    ON a.tenant_id = i.tenant_id AND a.application_id = i.application_id
                 WHERE i.tenant_id = ? AND a.public_ref = ?
                   AND a.personal_data_erased_at IS NULL
                 ORDER BY i.starts_at, i.interview_id
                """;
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, tenantId.value());
            ps.setString(2, applicationPublicRef);
            List<String> ids = new ArrayList<>();
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) ids.add(rs.getString("interview_id"));
            }
            List<InterviewWorkspace> result = new ArrayList<>();
            for (String id : ids) {
                InterviewWorkspace item = readWorkspace(c, tenantId, id, null, null);
                if (item == null) return corrupt("mülakat listesi eşleşmedi (fail-closed)");
                result.add(item);
            }
            return Outcome.ok(List.copyOf(result));
        } catch (IllegalArgumentException ex) {
            return corrupt("mülakat listesi enum değeri bozuk (fail-closed)");
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    @Override
    public Outcome<InterviewWorkspace> findRecruiter(
            TenantId tenantId, String applicationPublicRef, String interviewId) {
        try (Connection c = ds.getConnection()) {
            InterviewWorkspace value = readWorkspace(
                    c, tenantId, interviewId, applicationPublicRef, null);
            return value == null
                    ? Outcome.fail(OutcomeCode.NOT_FOUND, "mülakat bulunamadı")
                    : Outcome.ok(value);
        } catch (IllegalArgumentException ex) {
            return corrupt("mülakat enum değeri bozuk (fail-closed)");
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    @Override
    public Outcome<InterviewWorkspace> findAssigned(
            TenantId tenantId, ActorId actorId, String interviewId) {
        try (Connection c = ds.getConnection()) {
            InterviewWorkspace value = readWorkspace(c, tenantId, interviewId, null, actorId);
            return value == null
                    ? Outcome.fail(OutcomeCode.NOT_FOUND, "mülakat bulunamadı")
                    : Outcome.ok(value);
        } catch (IllegalArgumentException ex) {
            return corrupt("mülakat enum değeri bozuk (fail-closed)");
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    @Override
    public Outcome<List<CandidateInterviewView>> listCandidate(
            String applicationPublicRef, String candidateAccessDigest) {
        String sql = """
                SELECT i.interview_id, i.interview_type, i.starts_at, i.ends_at,
                       i.time_zone, i.mode, i.location, i.status, i.updated_at
                  FROM ats_application a
                  JOIN ats_interview i
                    ON i.tenant_id = a.tenant_id AND i.application_id = a.application_id
                 WHERE a.public_ref = ? AND a.candidate_access_digest = ?
                   AND a.personal_data_erased_at IS NULL
                 ORDER BY i.starts_at, i.interview_id
                """;
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, applicationPublicRef);
            ps.setString(2, candidateAccessDigest);
            List<CandidateInterviewView> result = new ArrayList<>();
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    result.add(new CandidateInterviewView(
                            rs.getString("interview_id"),
                            InterviewType.valueOf(rs.getString("interview_type")),
                            iso(rs, "starts_at"), iso(rs, "ends_at"),
                            rs.getString("time_zone"), InterviewMode.valueOf(rs.getString("mode")),
                            rs.getString("location"), InterviewStatus.valueOf(rs.getString("status")),
                            iso(rs, "updated_at")));
                }
            }
            if (result.isEmpty() && !candidateApplicationExists(
                    c, applicationPublicRef, candidateAccessDigest)) {
                return Outcome.fail(OutcomeCode.NOT_FOUND, "başvuru bulunamadı");
            }
            return Outcome.ok(List.copyOf(result));
        } catch (IllegalArgumentException ex) {
            return corrupt("aday mülakat görünümü enum değeri bozuk (fail-closed)");
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    @Override
    public Outcome<WorkspaceResult> reschedule(RescheduleCommand command) {
        try (Connection c = ds.getConnection()) {
            c.setAutoCommit(false);
            try {
                if (!reserveCommand(c, command.tenantId(), command.actorId(),
                        command.idempotencyKey(), "RESCHEDULE", command.requestDigest(),
                        command.occurredAt())) {
                    ExistingCommand existing = readCommand(c, command.tenantId(),
                            command.actorId(), command.idempotencyKey());
                    c.rollback();
                    return replayWorkspace(existing, command.requestDigest(), "RESCHEDULE");
                }
                LockedInterview current = lockInterview(c, command.tenantId(),
                        command.applicationPublicRef(), command.interviewId());
                if (current == null) {
                    c.rollback();
                    return Outcome.ok(new WorkspaceResult(CommandState.NOT_FOUND, null));
                }
                if (current.version() != command.expectedVersion()) {
                    c.rollback();
                    return Outcome.ok(new WorkspaceResult(CommandState.VERSION_CONFLICT,
                            findByIdValue(command.tenantId(), command.interviewId())));
                }
                if (current.status() != InterviewStatus.SCHEDULED) {
                    c.rollback();
                    return Outcome.ok(new WorkspaceResult(CommandState.ILLEGAL_TRANSITION,
                            findByIdValue(command.tenantId(), command.interviewId())));
                }
                int nextVersion = current.version() + 1;
                updateSchedule(c, command, nextVersion);
                insertScheduleRevision(c, command.tenantId(), command.interviewId(), nextVersion,
                        command.startsAt(), command.endsAt(), command.timeZone(), command.mode(),
                        command.location(), current.status(), command.reason(),
                        command.actorId().value(), command.occurredAt());
                bindCommand(c, command.tenantId(), command.actorId(), command.idempotencyKey(),
                        command.interviewId(), null, nextVersion);
                c.commit();
                return mapWorkspace(findById(command.tenantId(), command.interviewId()),
                        CommandState.UPDATED);
            } catch (IllegalArgumentException ex) {
                c.rollback();
                return corrupt("mülakat planlama değeri bozuk (fail-closed)");
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
    public Outcome<WorkspaceResult> transition(TransitionCommand command) {
        String type = command.target() == InterviewStatus.CANCELLED ? "CANCEL" : "COMPLETE";
        try (Connection c = ds.getConnection()) {
            c.setAutoCommit(false);
            try {
                if (!reserveCommand(c, command.tenantId(), command.actorId(),
                        command.idempotencyKey(), type, command.requestDigest(),
                        command.occurredAt())) {
                    ExistingCommand existing = readCommand(c, command.tenantId(),
                            command.actorId(), command.idempotencyKey());
                    c.rollback();
                    return replayWorkspace(existing, command.requestDigest(), type);
                }
                LockedInterview current = lockInterview(c, command.tenantId(),
                        command.applicationPublicRef(), command.interviewId());
                if (current == null) {
                    c.rollback();
                    return Outcome.ok(new WorkspaceResult(CommandState.NOT_FOUND, null));
                }
                if (current.version() != command.expectedVersion()) {
                    c.rollback();
                    return Outcome.ok(new WorkspaceResult(CommandState.VERSION_CONFLICT,
                            findByIdValue(command.tenantId(), command.interviewId())));
                }
                if (current.status() != InterviewStatus.SCHEDULED) {
                    c.rollback();
                    return Outcome.ok(new WorkspaceResult(CommandState.ILLEGAL_TRANSITION,
                            findByIdValue(command.tenantId(), command.interviewId())));
                }
                if (command.target() == InterviewStatus.COMPLETED
                        && !allParticipantsHaveScorecards(c, command.tenantId(), command.interviewId())) {
                    c.rollback();
                    return Outcome.ok(new WorkspaceResult(CommandState.INCOMPLETE_SCORECARDS,
                            findByIdValue(command.tenantId(), command.interviewId())));
                }
                int nextVersion = current.version() + 1;
                updateStatus(c, command, nextVersion);
                insertScheduleRevision(c, command.tenantId(), command.interviewId(), nextVersion,
                        current.startsAt(), current.endsAt(), current.timeZone(), current.mode(),
                        current.location(), command.target(), command.reason(),
                        command.actorId().value(), command.occurredAt());
                bindCommand(c, command.tenantId(), command.actorId(), command.idempotencyKey(),
                        command.interviewId(), null, nextVersion);
                c.commit();
                return mapWorkspace(findById(command.tenantId(), command.interviewId()),
                        CommandState.UPDATED);
            } catch (IllegalArgumentException ex) {
                c.rollback();
                return corrupt("mülakat geçiş değeri bozuk (fail-closed)");
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
    public Outcome<ScorecardResult> submitScorecard(ScorecardCommand command) {
        try (Connection c = ds.getConnection()) {
            c.setAutoCommit(false);
            try {
                if (!reserveCommand(c, command.tenantId(), command.actorId(),
                        command.idempotencyKey(), "SCORECARD", command.requestDigest(),
                        command.occurredAt())) {
                    ExistingCommand existing = readCommand(c, command.tenantId(),
                            command.actorId(), command.idempotencyKey());
                    c.rollback();
                    return replayScorecard(existing, command.requestDigest());
                }
                LockedInterview current = lockAssignedInterview(
                        c, command.tenantId(), command.actorId(), command.interviewId());
                if (current == null) {
                    c.rollback();
                    return Outcome.ok(new ScorecardResult(ScorecardState.NOT_ASSIGNED, null));
                }
                if (current.status() != InterviewStatus.SCHEDULED) {
                    c.rollback();
                    return Outcome.ok(new ScorecardResult(ScorecardState.INTERVIEW_CLOSED, null));
                }
                Set<String> expectedCriteria = readCriterionKeys(
                        c, command.tenantId(), command.interviewId());
                Set<String> submittedCriteria = command.ratings().stream()
                        .map(Rating::criterionKey).collect(java.util.stream.Collectors.toSet());
                if (!expectedCriteria.equals(submittedCriteria)
                        || expectedCriteria.size() != command.ratings().size()) {
                    c.rollback();
                    return Outcome.ok(new ScorecardResult(ScorecardState.CRITERIA_MISMATCH, null));
                }
                LatestScorecard latest = latestScorecard(
                        c, command.tenantId(), command.interviewId(), command.actorId());
                int revision = latest == null ? 1 : latest.revision() + 1;
                String expectedPredecessor = latest == null ? null : latest.scorecardId();
                if (!java.util.Objects.equals(expectedPredecessor,
                        command.predecessorScorecardId())) {
                    c.rollback();
                    return Outcome.ok(new ScorecardResult(
                            ScorecardState.PREDECESSOR_MISMATCH, latest == null ? null
                                    : findScorecardValue(command.tenantId(), latest.scorecardId())));
                }
                insertScorecard(c, command, revision);
                insertRatings(c, command);
                bindCommand(c, command.tenantId(), command.actorId(), command.idempotencyKey(),
                        command.interviewId(), command.scorecardId(), current.version());
                c.commit();
                Outcome<InterviewScorecard> created = findScorecard(
                        command.tenantId(), command.scorecardId());
                if (created instanceof Outcome.Fail<InterviewScorecard> fail) {
                    return Outcome.fail(fail.code(), fail.reason());
                }
                return Outcome.ok(new ScorecardResult(ScorecardState.CREATED,
                        ((Outcome.Ok<InterviewScorecard>) created).value()));
            } catch (IllegalArgumentException ex) {
                c.rollback();
                return Outcome.fail(OutcomeCode.NOT_CONFIGURED,
                        "scorecard enum/veri değeri bozuk (fail-closed)");
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

    private Outcome<WorkspaceResult> replayWorkspace(
            ExistingCommand existing, String requestDigest, String commandType) {
        if (existing == null || !requestDigest.equals(existing.requestDigest())
                || !commandType.equals(existing.commandType())) {
            return Outcome.ok(new WorkspaceResult(CommandState.IDEMPOTENCY_CONFLICT, null));
        }
        if (existing.interviewId() == null) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED,
                    "interview idempotency kaydı tamamlanmamış (fail-closed)");
        }
        Outcome<InterviewWorkspace> replay = findById(existing.tenantId(), existing.interviewId());
        return mapWorkspace(replay, CommandState.REPLAYED);
    }

    private Outcome<ScorecardResult> replayScorecard(
            ExistingCommand existing, String requestDigest) {
        if (existing == null || !requestDigest.equals(existing.requestDigest())
                || !"SCORECARD".equals(existing.commandType())) {
            return Outcome.ok(new ScorecardResult(ScorecardState.IDEMPOTENCY_CONFLICT, null));
        }
        if (existing.resultRef() == null) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED,
                    "scorecard idempotency kaydı tamamlanmamış (fail-closed)");
        }
        Outcome<InterviewScorecard> replay = findScorecard(existing.tenantId(), existing.resultRef());
        if (replay instanceof Outcome.Fail<InterviewScorecard> fail) {
            return Outcome.fail(fail.code(), fail.reason());
        }
        return Outcome.ok(new ScorecardResult(ScorecardState.REPLAYED,
                ((Outcome.Ok<InterviewScorecard>) replay).value()));
    }

    private Outcome<InterviewWorkspace> findById(TenantId tenantId, String interviewId) {
        try (Connection c = ds.getConnection()) {
            InterviewWorkspace value = readWorkspace(c, tenantId, interviewId, null, null);
            return value == null
                    ? Outcome.fail(OutcomeCode.NOT_FOUND, "mülakat bulunamadı")
                    : Outcome.ok(value);
        } catch (IllegalArgumentException ex) {
            return corrupt("mülakat enum değeri bozuk (fail-closed)");
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    private InterviewWorkspace findByIdValue(TenantId tenantId, String interviewId) {
        Outcome<InterviewWorkspace> out = findById(tenantId, interviewId);
        return out instanceof Outcome.Ok<InterviewWorkspace> ok ? ok.value() : null;
    }

    private InterviewWorkspace readWorkspace(
            Connection c, TenantId tenantId, String interviewId,
            String applicationPublicRef, ActorId assignedActor) throws SQLException {
        String sql = """
                SELECT i.interview_id, a.public_ref, j.slug, j.title, a.full_name,
                       i.interview_type, i.starts_at, i.ends_at, i.time_zone, i.mode,
                       i.location, i.status, i.version, i.created_at, i.updated_at
                  FROM ats_interview i
                  JOIN ats_application a
                    ON a.tenant_id = i.tenant_id AND a.application_id = i.application_id
                  JOIN ats_job_posting j
                    ON j.tenant_id = a.tenant_id AND j.job_id = a.job_id
                 WHERE i.tenant_id = ? AND i.interview_id = ?
                   AND a.personal_data_erased_at IS NULL
                """;
        if (applicationPublicRef != null) sql += " AND a.public_ref = ?";
        if (assignedActor != null) sql += " AND EXISTS (SELECT 1 FROM ats_interview_participant p"
                + " WHERE p.tenant_id=i.tenant_id AND p.interview_id=i.interview_id"
                + " AND p.actor_ref=?)";
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            int i = 1;
            ps.setString(i++, tenantId.value());
            ps.setString(i++, interviewId);
            if (applicationPublicRef != null) ps.setString(i++, applicationPublicRef);
            if (assignedActor != null) ps.setString(i, assignedActor.value());
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) return null;
                return new InterviewWorkspace(
                        tenantId, rs.getString("interview_id"), rs.getString("public_ref"),
                        rs.getString("slug"), rs.getString("title"), rs.getString("full_name"),
                        InterviewType.valueOf(rs.getString("interview_type")),
                        iso(rs, "starts_at"), iso(rs, "ends_at"), rs.getString("time_zone"),
                        InterviewMode.valueOf(rs.getString("mode")), rs.getString("location"),
                        InterviewStatus.valueOf(rs.getString("status")), rs.getInt("version"),
                        readParticipants(c, tenantId, interviewId),
                        readCriteria(c, tenantId, interviewId),
                        readScorecards(c, tenantId, interviewId),
                        readScheduleHistory(c, tenantId, interviewId),
                        iso(rs, "created_at"), iso(rs, "updated_at"));
            }
        }
    }

    private static List<Participant> readParticipants(
            Connection c, TenantId tenantId, String interviewId) throws SQLException {
        String sql = """
                SELECT actor_ref, display_label, participant_role
                  FROM ats_interview_participant
                 WHERE tenant_id = ? AND interview_id = ?
                 ORDER BY ordinal, actor_ref
                """;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, tenantId.value()); ps.setString(2, interviewId);
            List<Participant> result = new ArrayList<>();
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) result.add(new Participant(
                        rs.getString("actor_ref"), rs.getString("display_label"),
                        ParticipantRole.valueOf(rs.getString("participant_role"))));
            }
            return List.copyOf(result);
        }
    }

    private static List<Criterion> readCriteria(
            Connection c, TenantId tenantId, String interviewId) throws SQLException {
        String sql = """
                SELECT criterion_key, label, question, evidence_prompt
                  FROM ats_interview_criterion
                 WHERE tenant_id = ? AND interview_id = ?
                 ORDER BY ordinal, criterion_key
                """;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, tenantId.value()); ps.setString(2, interviewId);
            List<Criterion> result = new ArrayList<>();
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) result.add(new Criterion(
                        rs.getString("criterion_key"), rs.getString("label"),
                        rs.getString("question"), rs.getString("evidence_prompt")));
            }
            return List.copyOf(result);
        }
    }

    private List<InterviewScorecard> readScorecards(
            Connection c, TenantId tenantId, String interviewId) throws SQLException {
        String sql = """
                SELECT s.scorecard_id
                  FROM ats_interview_scorecard s
                 WHERE s.tenant_id = ? AND s.interview_id = ?
                 ORDER BY s.created_at, s.actor_ref, s.revision
                """;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, tenantId.value()); ps.setString(2, interviewId);
            List<String> ids = new ArrayList<>();
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) ids.add(rs.getString("scorecard_id"));
            }
            List<InterviewScorecard> result = new ArrayList<>();
            for (String id : ids) {
                InterviewScorecard value = readScorecard(c, tenantId, id);
                if (value == null) throw new SQLException("scorecard history invariant", "23514");
                result.add(value);
            }
            return List.copyOf(result);
        }
    }

    private static List<ScheduleRevision> readScheduleHistory(
            Connection c, TenantId tenantId, String interviewId) throws SQLException {
        String sql = """
                SELECT version, starts_at, ends_at, time_zone, mode, location, status,
                       reason, actor_ref, occurred_at
                  FROM ats_interview_schedule_revision
                 WHERE tenant_id = ? AND interview_id = ?
                 ORDER BY version
                """;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, tenantId.value()); ps.setString(2, interviewId);
            List<ScheduleRevision> result = new ArrayList<>();
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) result.add(new ScheduleRevision(
                        rs.getInt("version"), iso(rs, "starts_at"), iso(rs, "ends_at"),
                        rs.getString("time_zone"), InterviewMode.valueOf(rs.getString("mode")),
                        rs.getString("location"), InterviewStatus.valueOf(rs.getString("status")),
                        rs.getString("reason"), rs.getString("actor_ref"), iso(rs, "occurred_at")));
            }
            return List.copyOf(result);
        }
    }

    private Outcome<InterviewScorecard> findScorecard(TenantId tenantId, String scorecardId) {
        try (Connection c = ds.getConnection()) {
            InterviewScorecard value = readScorecard(c, tenantId, scorecardId);
            return value == null
                    ? Outcome.fail(OutcomeCode.NOT_FOUND, "scorecard bulunamadı")
                    : Outcome.ok(value);
        } catch (IllegalArgumentException ex) {
            return corrupt("scorecard enum değeri bozuk (fail-closed)");
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    private InterviewScorecard findScorecardValue(TenantId tenantId, String scorecardId) {
        Outcome<InterviewScorecard> out = findScorecard(tenantId, scorecardId);
        return out instanceof Outcome.Ok<InterviewScorecard> ok ? ok.value() : null;
    }

    private static InterviewScorecard readScorecard(
            Connection c, TenantId tenantId, String scorecardId) throws SQLException {
        String sql = """
                SELECT s.scorecard_id, s.interview_id, s.actor_ref, p.display_label,
                       s.policy_version, s.job_relatedness_confirmed, s.recommendation,
                       s.summary, s.predecessor_scorecard_id, s.revision, s.created_at
                  FROM ats_interview_scorecard s
                  JOIN ats_interview_participant p
                    ON p.tenant_id=s.tenant_id AND p.interview_id=s.interview_id
                   AND p.actor_ref=s.actor_ref
                 WHERE s.tenant_id = ? AND s.scorecard_id = ?
                """;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, tenantId.value()); ps.setString(2, scorecardId);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) return null;
                return new InterviewScorecard(
                        rs.getString("scorecard_id"), rs.getString("interview_id"),
                        rs.getString("actor_ref"), rs.getString("display_label"),
                        rs.getString("policy_version"), rs.getBoolean("job_relatedness_confirmed"),
                        Recommendation.valueOf(rs.getString("recommendation")),
                        readRatings(c, tenantId, scorecardId), rs.getString("summary"),
                        rs.getString("predecessor_scorecard_id"), rs.getInt("revision"),
                        iso(rs, "created_at"));
            }
        }
    }

    private static List<Rating> readRatings(
            Connection c, TenantId tenantId, String scorecardId) throws SQLException {
        String sql = """
                SELECT criterion_key, rating, evidence
                  FROM ats_interview_scorecard_rating
                 WHERE tenant_id = ? AND scorecard_id = ?
                 ORDER BY ordinal, criterion_key
                """;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, tenantId.value()); ps.setString(2, scorecardId);
            List<Rating> result = new ArrayList<>();
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) result.add(new Rating(
                        rs.getString("criterion_key"), rs.getInt("rating"),
                        rs.getString("evidence")));
            }
            return List.copyOf(result);
        }
    }

    private static ApplicationAnchor lockApplication(
            Connection c, TenantId tenantId, String publicRef) throws SQLException {
        String sql = """
                SELECT application_id, status, version
                  FROM ats_application
                 WHERE tenant_id = ? AND public_ref = ? AND personal_data_erased_at IS NULL
                 FOR UPDATE
                """;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, tenantId.value()); ps.setString(2, publicRef);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? new ApplicationAnchor(
                        rs.getObject("application_id", UUID.class), rs.getString("status"),
                        rs.getInt("version")) : null;
            }
        }
    }

    private static void stageApplicationForInterview(
            Connection c, CreateCommand command, ApplicationAnchor anchor) throws SQLException {
        String update = """
                UPDATE ats_application
                   SET status='INTERVIEW_PENDING', version=version+1, updated_at=?
                 WHERE tenant_id=? AND application_id=? AND version=?
                   AND status='UNDER_REVIEW' AND personal_data_erased_at IS NULL
                """;
        try (PreparedStatement ps = c.prepareStatement(update)) {
            ps.setTimestamp(1, timestamp(command.occurredAt()));
            ps.setString(2, command.tenantId().value());
            ps.setObject(3, anchor.applicationId());
            ps.setInt(4, anchor.version());
            if (ps.executeUpdate() != 1) {
                throw new SQLException("application interview-stage CAS invariant", "23514");
            }
        }
        String event = """
                INSERT INTO ats_application_event
                    (tenant_id, application_id, from_status, to_status, actor_ref, occurred_at)
                VALUES (?, ?, 'UNDER_REVIEW', 'INTERVIEW_PENDING', ?, ?)
                """;
        try (PreparedStatement ps = c.prepareStatement(event)) {
            ps.setString(1, command.tenantId().value());
            ps.setObject(2, anchor.applicationId());
            ps.setString(3, command.actorId().value());
            ps.setTimestamp(4, timestamp(command.occurredAt()));
            ps.executeUpdate();
        }
    }

    private static LockedInterview lockInterview(
            Connection c, TenantId tenantId, String publicRef, String interviewId) throws SQLException {
        String sql = """
                SELECT i.version, i.status, i.starts_at, i.ends_at, i.time_zone, i.mode, i.location
                  FROM ats_interview i
                  JOIN ats_application a
                    ON a.tenant_id=i.tenant_id AND a.application_id=i.application_id
                 WHERE i.tenant_id=? AND i.interview_id=? AND a.public_ref=?
                   AND a.personal_data_erased_at IS NULL
                 FOR UPDATE OF i
                """;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, tenantId.value()); ps.setString(2, interviewId); ps.setString(3, publicRef);
            try (ResultSet rs = ps.executeQuery()) { return rs.next() ? locked(rs) : null; }
        }
    }

    private static LockedInterview lockAssignedInterview(
            Connection c, TenantId tenantId, ActorId actorId, String interviewId) throws SQLException {
        String sql = """
                SELECT i.version, i.status, i.starts_at, i.ends_at, i.time_zone, i.mode, i.location
                  FROM ats_interview i
                  JOIN ats_application a
                    ON a.tenant_id=i.tenant_id AND a.application_id=i.application_id
                  JOIN ats_interview_participant p
                    ON p.tenant_id=i.tenant_id AND p.interview_id=i.interview_id
                 WHERE i.tenant_id=? AND i.interview_id=? AND p.actor_ref=?
                   AND a.personal_data_erased_at IS NULL
                 FOR UPDATE OF i
                """;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, tenantId.value()); ps.setString(2, interviewId);
            ps.setString(3, actorId.value());
            try (ResultSet rs = ps.executeQuery()) { return rs.next() ? locked(rs) : null; }
        }
    }

    private static LockedInterview locked(ResultSet rs) throws SQLException {
        return new LockedInterview(
                rs.getInt("version"), InterviewStatus.valueOf(rs.getString("status")),
                iso(rs, "starts_at"), iso(rs, "ends_at"), rs.getString("time_zone"),
                InterviewMode.valueOf(rs.getString("mode")), rs.getString("location"));
    }

    private static boolean candidateApplicationExists(
            Connection c, String publicRef, String accessDigest) throws SQLException {
        String sql = """
                SELECT 1 FROM ats_application
                 WHERE public_ref=? AND candidate_access_digest=?
                   AND personal_data_erased_at IS NULL
                """;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, publicRef); ps.setString(2, accessDigest);
            try (ResultSet rs = ps.executeQuery()) { return rs.next(); }
        }
    }

    private static void insertInterview(
            Connection c, UUID applicationId, CreateCommand command) throws SQLException {
        String sql = """
                INSERT INTO ats_interview
                    (tenant_id, interview_id, application_id, interview_type, starts_at, ends_at,
                     time_zone, mode, location, status, version, created_by, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'SCHEDULED', 0, ?, ?, ?)
                """;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            int i = 1;
            ps.setString(i++, command.tenantId().value()); ps.setString(i++, command.interviewId());
            ps.setObject(i++, applicationId); ps.setString(i++, command.type().name());
            ps.setTimestamp(i++, timestamp(command.startsAt())); ps.setTimestamp(i++, timestamp(command.endsAt()));
            ps.setString(i++, command.timeZone()); ps.setString(i++, command.mode().name());
            ps.setString(i++, command.location()); ps.setString(i++, command.actorId().value());
            ps.setTimestamp(i++, timestamp(command.occurredAt()));
            ps.setTimestamp(i, timestamp(command.occurredAt()));
            ps.executeUpdate();
        }
    }

    private static void insertParticipants(Connection c, CreateCommand command) throws SQLException {
        String sql = """
                INSERT INTO ats_interview_participant
                    (tenant_id, interview_id, actor_ref, display_label, participant_role, ordinal)
                VALUES (?, ?, ?, ?, ?, ?)
                """;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            for (int i = 0; i < command.participants().size(); i++) {
                Participant p = command.participants().get(i);
                ps.setString(1, command.tenantId().value()); ps.setString(2, command.interviewId());
                ps.setString(3, p.actorRef()); ps.setString(4, p.displayLabel());
                ps.setString(5, p.role().name()); ps.setInt(6, i); ps.addBatch();
            }
            ps.executeBatch();
        }
    }

    private static void insertCriteria(Connection c, CreateCommand command) throws SQLException {
        String sql = """
                INSERT INTO ats_interview_criterion
                    (tenant_id, interview_id, criterion_key, label, question, evidence_prompt, ordinal)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            for (int i = 0; i < command.criteria().size(); i++) {
                Criterion criterion = command.criteria().get(i);
                ps.setString(1, command.tenantId().value()); ps.setString(2, command.interviewId());
                ps.setString(3, criterion.key()); ps.setString(4, criterion.label());
                ps.setString(5, criterion.question()); ps.setString(6, criterion.evidencePrompt());
                ps.setInt(7, i); ps.addBatch();
            }
            ps.executeBatch();
        }
    }

    private static void insertScheduleRevision(
            Connection c, TenantId tenantId, String interviewId, int version,
            String startsAt, String endsAt, String timeZone, InterviewMode mode,
            String location, InterviewStatus status, String reason, String actorRef,
            String occurredAt) throws SQLException {
        String sql = """
                INSERT INTO ats_interview_schedule_revision
                    (tenant_id, interview_id, version, starts_at, ends_at, time_zone, mode,
                     location, status, reason, actor_ref, occurred_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, tenantId.value()); ps.setString(2, interviewId); ps.setInt(3, version);
            ps.setTimestamp(4, timestamp(startsAt)); ps.setTimestamp(5, timestamp(endsAt));
            ps.setString(6, timeZone); ps.setString(7, mode.name()); ps.setString(8, location);
            ps.setString(9, status.name()); ps.setString(10, reason); ps.setString(11, actorRef);
            ps.setTimestamp(12, timestamp(occurredAt)); ps.executeUpdate();
        }
    }

    private static void updateSchedule(
            Connection c, RescheduleCommand command, int nextVersion) throws SQLException {
        String sql = """
                UPDATE ats_interview
                   SET starts_at=?, ends_at=?, time_zone=?, mode=?, location=?,
                       version=?, updated_at=?
                 WHERE tenant_id=? AND interview_id=? AND version=? AND status='SCHEDULED'
                """;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setTimestamp(1, timestamp(command.startsAt())); ps.setTimestamp(2, timestamp(command.endsAt()));
            ps.setString(3, command.timeZone()); ps.setString(4, command.mode().name());
            ps.setString(5, command.location()); ps.setInt(6, nextVersion);
            ps.setTimestamp(7, timestamp(command.occurredAt())); ps.setString(8, command.tenantId().value());
            ps.setString(9, command.interviewId()); ps.setInt(10, command.expectedVersion());
            if (ps.executeUpdate() != 1) throw new SQLException("interview schedule CAS invariant", "23514");
        }
    }

    private static void updateStatus(
            Connection c, TransitionCommand command, int nextVersion) throws SQLException {
        String sql = """
                UPDATE ats_interview
                   SET status=?, version=?, updated_at=?
                 WHERE tenant_id=? AND interview_id=? AND version=? AND status='SCHEDULED'
                """;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, command.target().name()); ps.setInt(2, nextVersion);
            ps.setTimestamp(3, timestamp(command.occurredAt()));
            ps.setString(4, command.tenantId().value()); ps.setString(5, command.interviewId());
            ps.setInt(6, command.expectedVersion());
            if (ps.executeUpdate() != 1) throw new SQLException("interview status CAS invariant", "23514");
        }
    }

    private static void insertScorecard(
            Connection c, ScorecardCommand command, int revision) throws SQLException {
        String sql = """
                INSERT INTO ats_interview_scorecard
                    (tenant_id, scorecard_id, interview_id, actor_ref, policy_version,
                     job_relatedness_confirmed, recommendation, summary,
                     predecessor_scorecard_id, revision, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, command.tenantId().value()); ps.setString(2, command.scorecardId());
            ps.setString(3, command.interviewId()); ps.setString(4, command.actorId().value());
            ps.setString(5, command.policyVersion()); ps.setBoolean(6, command.jobRelatednessConfirmed());
            ps.setString(7, command.recommendation().name()); ps.setString(8, command.summary());
            ps.setString(9, command.predecessorScorecardId()); ps.setInt(10, revision);
            ps.setTimestamp(11, timestamp(command.occurredAt())); ps.executeUpdate();
        }
    }

    private static void insertRatings(Connection c, ScorecardCommand command) throws SQLException {
        String sql = """
                INSERT INTO ats_interview_scorecard_rating
                    (tenant_id, scorecard_id, criterion_key, rating, evidence, ordinal)
                VALUES (?, ?, ?, ?, ?, ?)
                """;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            for (int i = 0; i < command.ratings().size(); i++) {
                Rating rating = command.ratings().get(i);
                ps.setString(1, command.tenantId().value()); ps.setString(2, command.scorecardId());
                ps.setString(3, rating.criterionKey()); ps.setInt(4, rating.rating());
                ps.setString(5, rating.evidence()); ps.setInt(6, i); ps.addBatch();
            }
            ps.executeBatch();
        }
    }

    private static Set<String> readCriterionKeys(
            Connection c, TenantId tenantId, String interviewId) throws SQLException {
        String sql = "SELECT criterion_key FROM ats_interview_criterion WHERE tenant_id=? AND interview_id=?";
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, tenantId.value()); ps.setString(2, interviewId);
            Set<String> result = new HashSet<>();
            try (ResultSet rs = ps.executeQuery()) { while (rs.next()) result.add(rs.getString(1)); }
            return Set.copyOf(result);
        }
    }

    private static LatestScorecard latestScorecard(
            Connection c, TenantId tenantId, String interviewId, ActorId actorId) throws SQLException {
        String sql = """
                SELECT scorecard_id, revision FROM ats_interview_scorecard
                 WHERE tenant_id=? AND interview_id=? AND actor_ref=?
                 ORDER BY revision DESC LIMIT 1
                """;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, tenantId.value()); ps.setString(2, interviewId); ps.setString(3, actorId.value());
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? new LatestScorecard(rs.getString(1), rs.getInt(2)) : null;
            }
        }
    }

    private static boolean allParticipantsHaveScorecards(
            Connection c, TenantId tenantId, String interviewId) throws SQLException {
        String sql = """
                SELECT (SELECT count(*) FROM ats_interview_participant
                         WHERE tenant_id=? AND interview_id=?) =
                       (SELECT count(DISTINCT actor_ref) FROM ats_interview_scorecard
                         WHERE tenant_id=? AND interview_id=?)
                """;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, tenantId.value()); ps.setString(2, interviewId);
            ps.setString(3, tenantId.value()); ps.setString(4, interviewId);
            try (ResultSet rs = ps.executeQuery()) { rs.next(); return rs.getBoolean(1); }
        }
    }

    private static boolean reserveCommand(
            Connection c, TenantId tenantId, ActorId actorId, String key,
            String type, String digest, String occurredAt) throws SQLException {
        String sql = """
                INSERT INTO ats_interview_command_idempotency
                    (tenant_id, actor_ref, idempotency_key, command_type, request_digest,
                     interview_id, result_ref, result_version, created_at)
                VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, ?)
                ON CONFLICT (tenant_id, actor_ref, idempotency_key) DO NOTHING
                """;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, tenantId.value()); ps.setString(2, actorId.value()); ps.setString(3, key);
            ps.setString(4, type); ps.setString(5, digest); ps.setTimestamp(6, timestamp(occurredAt));
            return ps.executeUpdate() == 1;
        }
    }

    private static ExistingCommand readCommand(
            Connection c, TenantId tenantId, ActorId actorId, String key) throws SQLException {
        String sql = """
                SELECT command_type, request_digest, interview_id, result_ref, result_version
                  FROM ats_interview_command_idempotency
                 WHERE tenant_id=? AND actor_ref=? AND idempotency_key=?
                """;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, tenantId.value()); ps.setString(2, actorId.value()); ps.setString(3, key);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? new ExistingCommand(
                        tenantId, rs.getString("command_type"), rs.getString("request_digest"),
                        rs.getString("interview_id"), rs.getString("result_ref"),
                        (Integer) rs.getObject("result_version")) : null;
            }
        }
    }

    private static void bindCommand(
            Connection c, TenantId tenantId, ActorId actorId, String key,
            String interviewId, String resultRef, int resultVersion) throws SQLException {
        String sql = """
                UPDATE ats_interview_command_idempotency
                   SET interview_id=?, result_ref=?, result_version=?
                 WHERE tenant_id=? AND actor_ref=? AND idempotency_key=?
                   AND interview_id IS NULL
                """;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, interviewId); ps.setString(2, resultRef); ps.setInt(3, resultVersion);
            ps.setString(4, tenantId.value()); ps.setString(5, actorId.value()); ps.setString(6, key);
            if (ps.executeUpdate() != 1) throw new SQLException("interview idempotency bind invariant", "23514");
        }
    }

    private static <T> Outcome<T> corrupt(String reason) {
        return Outcome.fail(OutcomeCode.NOT_CONFIGURED, reason);
    }

    private static Outcome<WorkspaceResult> mapWorkspace(
            Outcome<InterviewWorkspace> source, CommandState state) {
        if (source instanceof Outcome.Fail<InterviewWorkspace> fail) {
            return Outcome.fail(fail.code(), fail.reason());
        }
        return Outcome.ok(new WorkspaceResult(state,
                ((Outcome.Ok<InterviewWorkspace>) source).value()));
    }

    private static Timestamp timestamp(String iso) {
        return Timestamp.from(Instant.parse(iso));
    }

    private static String iso(ResultSet rs, String column) throws SQLException {
        return rs.getTimestamp(column).toInstant().toString();
    }

    private record ApplicationAnchor(UUID applicationId, String status, int version) {}

    private record LockedInterview(
            int version, InterviewStatus status, String startsAt, String endsAt,
            String timeZone, InterviewMode mode, String location) {}

    private record LatestScorecard(String scorecardId, int revision) {}

    private record ExistingCommand(
            TenantId tenantId, String commandType, String requestDigest,
            String interviewId, String resultRef, Integer resultVersion) {}
}
