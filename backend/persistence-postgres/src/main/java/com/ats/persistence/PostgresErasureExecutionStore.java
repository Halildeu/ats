package com.ats.persistence;

import com.ats.dsr.ErasureExecutionStore;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import javax.sql.DataSource;

/** PostgreSQL durable saga ledger: first-writer plan + lease/CAS + terminal receipts. */
public final class PostgresErasureExecutionStore implements ErasureExecutionStore {

    private final DataSource dataSource;

    public PostgresErasureExecutionStore(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public Outcome<Execution> find(
            TenantId tenantId, InterviewId interviewId, String executionKey) {
        try (Connection connection = dataSource.getConnection()) {
            return read(connection, tenantId, interviewId, executionKey, false);
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    @Override
    public Outcome<Execution> begin(BeginCommand command) {
        if (command == null) {
            return Outcome.fail(OutcomeCode.INVALID, "begin command zorunlu");
        }
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try {
                int inserted;
                try (PreparedStatement statement = connection.prepareStatement(
                        "INSERT INTO erasure_execution"
                                + " (tenant_id,execution_key,interview_id,execution_kind,scope_digest,actor_ref,state)"
                                + " VALUES (?,?,?,?,?,?,'RUNNING') ON CONFLICT DO NOTHING")) {
                    statement.setString(1, command.tenantId().value());
                    statement.setString(2, command.executionKey());
                    statement.setString(3, command.interviewId().value());
                    statement.setString(4, command.kind().name());
                    statement.setString(5, command.scopeDigest());
                    statement.setString(6, command.actorRef());
                    inserted = statement.executeUpdate();
                }
                if (inserted == 1) {
                    try (PreparedStatement statement = connection.prepareStatement(
                            "INSERT INTO erasure_execution_step"
                                    + " (tenant_id,execution_key,step_sequence,step_type,target_ref)"
                                    + " VALUES (?,?,?,?,?)")) {
                        for (PlannedStep step : command.steps()) {
                            statement.setString(1, command.tenantId().value());
                            statement.setString(2, command.executionKey());
                            statement.setInt(3, step.sequence());
                            statement.setString(4, step.type().name());
                            statement.setString(5, step.targetRef());
                            statement.addBatch();
                        }
                        statement.executeBatch();
                    }
                }
                Outcome<Execution> loaded = read(connection, command.tenantId(), command.interviewId(),
                        command.executionKey(), true);
                if (!(loaded instanceof Outcome.Ok<Execution> ok)) {
                    connection.rollback();
                    return loaded;
                }
                if (!matches(command, ok.value())) {
                    connection.rollback();
                    return Outcome.fail(OutcomeCode.CONFLICT,
                            "execution key farklı interview/kind/scope/plan ile yeniden kullanılamaz");
                }
                connection.commit();
                return Outcome.ok(ok.value());
            } catch (SQLException ex) {
                connection.rollback();
                return Pg.sqlFail(ex);
            }
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    @Override
    public Outcome<Execution> acquire(
            TenantId tenantId, InterviewId interviewId, String executionKey,
            String leaseOwner, Instant now, Instant leaseUntil) {
        if (!validLease(leaseOwner, now, leaseUntil)) {
            return Outcome.fail(OutcomeCode.INVALID, "lease owner/now/until geçersiz");
        }
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try {
                Outcome<Execution> loaded = read(connection, tenantId, interviewId, executionKey, true);
                if (!(loaded instanceof Outcome.Ok<Execution> ok)) {
                    connection.rollback();
                    return loaded;
                }
                Execution execution = ok.value();
                if (execution.state() == ExecutionState.FULFILLED) {
                    connection.commit();
                    return Outcome.ok(execution);
                }
                if (execution.leaseOwner() != null
                        && !execution.leaseOwner().equals(leaseOwner)
                        && Instant.parse(execution.leaseUntil()).isAfter(now)) {
                    connection.rollback();
                    return Outcome.fail(OutcomeCode.CONFLICT,
                            "execution başka canlı worker lease'inde");
                }
                updateLease(connection, tenantId, executionKey, leaseOwner, leaseUntil);
                Outcome<Execution> acquired = read(
                        connection, tenantId, interviewId, executionKey, false);
                connection.commit();
                return acquired;
            } catch (SQLException ex) {
                connection.rollback();
                return Pg.sqlFail(ex);
            }
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    @Override
    public Outcome<Execution> completeStep(
            TenantId tenantId, InterviewId interviewId, String executionKey,
            String leaseOwner, int sequence, StepEffect effect, Instant now, Instant leaseUntil) {
        if (effect == null || !validLease(leaseOwner, now, leaseUntil)) {
            return Outcome.fail(OutcomeCode.INVALID, "step effect/lease geçersiz");
        }
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try {
                Outcome<Execution> loaded = read(connection, tenantId, interviewId, executionKey, true);
                if (!(loaded instanceof Outcome.Ok<Execution> ok)) {
                    connection.rollback();
                    return loaded;
                }
                Execution execution = ok.value();
                if (!leaseValid(execution, leaseOwner, now)) {
                    connection.rollback();
                    return Outcome.fail(OutcomeCode.CONFLICT, "stale worker step commit edemez");
                }
                if (sequence < 0 || sequence >= execution.steps().size()) {
                    connection.rollback();
                    return Outcome.fail(OutcomeCode.INVALID, "step sequence execution planında yok");
                }
                ExecutionStep step = execution.steps().get(sequence);
                if (step.state() == StepState.COMPLETED) {
                    if (!step.effect().equals(effect)) {
                        connection.rollback();
                        return Outcome.fail(OutcomeCode.CONFLICT,
                                "completed step farklı effect ile yazılamaz");
                    }
                    updateLease(connection, tenantId, executionKey, leaseOwner, leaseUntil);
                } else {
                    boolean earlierPending = execution.steps().stream()
                            .anyMatch(s -> s.sequence() < sequence && s.state() != StepState.COMPLETED);
                    if (earlierPending) {
                        connection.rollback();
                        return Outcome.fail(OutcomeCode.CONFLICT,
                                "önceki saga adımı tamamlanmadan step ilerletilemez");
                    }
                    try (PreparedStatement statement = connection.prepareStatement(
                            "UPDATE erasure_execution_step SET state='COMPLETED',"
                                    + " tombstone_count=?,deleted_content_count=?,case_transitioned=?,completed_at=?"
                                    + " WHERE tenant_id=? AND execution_key=? AND step_sequence=? AND state='PENDING'")) {
                        statement.setInt(1, effect.tombstoneCount());
                        statement.setInt(2, effect.deletedContentCount());
                        statement.setBoolean(3, effect.caseTransitioned());
                        statement.setObject(4, OffsetDateTime.ofInstant(now, ZoneOffset.UTC));
                        statement.setString(5, tenantId.value());
                        statement.setString(6, executionKey);
                        statement.setInt(7, sequence);
                        if (statement.executeUpdate() != 1) {
                            connection.rollback();
                            return Outcome.fail(OutcomeCode.CONFLICT, "step CAS başarısız");
                        }
                    }
                    updateLease(connection, tenantId, executionKey, leaseOwner, leaseUntil);
                }
                Outcome<Execution> completed = read(
                        connection, tenantId, interviewId, executionKey, false);
                connection.commit();
                return completed;
            } catch (SQLException ex) {
                connection.rollback();
                return Pg.sqlFail(ex);
            }
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    @Override
    public Outcome<Execution> fulfill(
            TenantId tenantId, InterviewId interviewId, String executionKey,
            String leaseOwner, Instant now) {
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try {
                Outcome<Execution> loaded = read(connection, tenantId, interviewId, executionKey, true);
                if (!(loaded instanceof Outcome.Ok<Execution> ok)) {
                    connection.rollback();
                    return loaded;
                }
                Execution execution = ok.value();
                if (execution.state() == ExecutionState.FULFILLED) {
                    connection.commit();
                    return Outcome.ok(execution);
                }
                if (!leaseValid(execution, leaseOwner, now)) {
                    connection.rollback();
                    return Outcome.fail(OutcomeCode.CONFLICT,
                            "stale worker execution fulfill edemez");
                }
                if (!execution.allStepsCompleted()) {
                    connection.rollback();
                    return Outcome.fail(OutcomeCode.CONFLICT,
                            "pending step varken execution fulfill edilemez");
                }
                try (PreparedStatement statement = connection.prepareStatement(
                        "UPDATE erasure_execution SET state='FULFILLED',lease_owner=NULL,lease_until=NULL,"
                                + " updated_at=now() WHERE tenant_id=? AND execution_key=? AND state='RUNNING'")) {
                    statement.setString(1, tenantId.value());
                    statement.setString(2, executionKey);
                    if (statement.executeUpdate() != 1) {
                        connection.rollback();
                        return Outcome.fail(OutcomeCode.CONFLICT, "execution fulfill CAS başarısız");
                    }
                }
                Outcome<Execution> fulfilled = read(
                        connection, tenantId, interviewId, executionKey, false);
                connection.commit();
                return fulfilled;
            } catch (SQLException ex) {
                connection.rollback();
                return Pg.sqlFail(ex);
            }
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    @Override
    public Outcome<Void> release(
            TenantId tenantId, InterviewId interviewId, String executionKey, String leaseOwner) {
        try (Connection connection = dataSource.getConnection()) {
            Outcome<Execution> loaded = read(connection, tenantId, interviewId, executionKey, false);
            if (!(loaded instanceof Outcome.Ok<Execution> ok)) {
                Outcome.Fail<Execution> fail = (Outcome.Fail<Execution>) loaded;
                return Outcome.fail(fail.code(), fail.reason());
            }
            if (ok.value().state() == ExecutionState.FULFILLED
                    || ok.value().leaseOwner() == null
                    || !ok.value().leaseOwner().equals(leaseOwner)) {
                return Outcome.ok(null);
            }
            try (PreparedStatement statement = connection.prepareStatement(
                    "UPDATE erasure_execution SET lease_owner=NULL,lease_until=NULL,updated_at=now()"
                            + " WHERE tenant_id=? AND execution_key=? AND interview_id=? AND lease_owner=?")) {
                statement.setString(1, tenantId.value());
                statement.setString(2, executionKey);
                statement.setString(3, interviewId.value());
                statement.setString(4, leaseOwner);
                statement.executeUpdate();
            }
            return Outcome.ok(null);
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    @Override
    public Outcome<List<Execution>> listRunning(TenantId tenantId, ExecutionKind kind) {
        if (tenantId == null || kind == null) {
            return Outcome.fail(OutcomeCode.INVALID, "tenant/kind zorunlu");
        }
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement(
                        "SELECT execution_key,interview_id FROM erasure_execution"
                                + " WHERE tenant_id=? AND execution_kind=? AND state='RUNNING'"
                                + " ORDER BY created_at,execution_key")) {
            statement.setString(1, tenantId.value());
            statement.setString(2, kind.name());
            ArrayList<String[]> keys = new ArrayList<>();
            try (ResultSet result = statement.executeQuery()) {
                while (result.next()) {
                    keys.add(new String[] {result.getString(1), result.getString(2)});
                }
            }
            ArrayList<Execution> executions = new ArrayList<>();
            for (String[] key : keys) {
                Outcome<Execution> loaded = read(connection, tenantId,
                        new InterviewId(key[1]), key[0], false);
                if (!(loaded instanceof Outcome.Ok<Execution> ok)) {
                    Outcome.Fail<Execution> fail = (Outcome.Fail<Execution>) loaded;
                    return Outcome.fail(fail.code(), fail.reason());
                }
                executions.add(ok.value());
            }
            return Outcome.ok(List.copyOf(executions));
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    private Outcome<Execution> read(
            Connection connection, TenantId tenantId, InterviewId interviewId,
            String executionKey, boolean forUpdate) throws SQLException {
        String sql = "SELECT interview_id,execution_kind,scope_digest,actor_ref,state,lease_owner,lease_until"
                + " FROM erasure_execution WHERE tenant_id=? AND execution_key=? AND interview_id=?"
                + (forUpdate ? " FOR UPDATE" : "");
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, tenantId.value());
            statement.setString(2, executionKey);
            statement.setString(3, interviewId.value());
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) {
                    return Outcome.fail(OutcomeCode.NOT_FOUND,
                            "erasure execution yok (tenant/interview-scope)");
                }
                String leaseOwner = result.getString("lease_owner");
                OffsetDateTime leaseUntil = result.getObject("lease_until", OffsetDateTime.class);
                List<ExecutionStep> steps = readSteps(connection, tenantId, executionKey);
                try {
                    return Outcome.ok(new Execution(
                            tenantId,
                            interviewId,
                            executionKey,
                            ExecutionKind.valueOf(result.getString("execution_kind")),
                            result.getString("scope_digest"),
                            result.getString("actor_ref"),
                            ExecutionState.valueOf(result.getString("state")),
                            leaseOwner,
                            leaseUntil == null ? null : leaseUntil.toInstant().toString(),
                            steps));
                } catch (IllegalArgumentException ex) {
                    return Outcome.fail(OutcomeCode.NOT_CONFIGURED,
                            "erasure execution satırı bozuk (fail-closed)");
                }
            }
        }
    }

    private static List<ExecutionStep> readSteps(
            Connection connection, TenantId tenantId, String executionKey) throws SQLException {
        ArrayList<ExecutionStep> steps = new ArrayList<>();
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT step_sequence,step_type,target_ref,state,tombstone_count,"
                        + " deleted_content_count,case_transitioned FROM erasure_execution_step"
                        + " WHERE tenant_id=? AND execution_key=? ORDER BY step_sequence")) {
            statement.setString(1, tenantId.value());
            statement.setString(2, executionKey);
            try (ResultSet result = statement.executeQuery()) {
                while (result.next()) {
                    steps.add(new ExecutionStep(
                            result.getInt("step_sequence"),
                            StepType.valueOf(result.getString("step_type")),
                            result.getString("target_ref"),
                            StepState.valueOf(result.getString("state")),
                            new StepEffect(
                                    result.getInt("tombstone_count"),
                                    result.getInt("deleted_content_count"),
                                    result.getBoolean("case_transitioned"))));
                }
            }
        }
        return List.copyOf(steps);
    }

    private static void updateLease(
            Connection connection, TenantId tenantId, String executionKey,
            String leaseOwner, Instant leaseUntil) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "UPDATE erasure_execution SET lease_owner=?,lease_until=?,updated_at=now()"
                        + " WHERE tenant_id=? AND execution_key=? AND state='RUNNING'")) {
            statement.setString(1, leaseOwner);
            statement.setObject(2, OffsetDateTime.ofInstant(leaseUntil, ZoneOffset.UTC));
            statement.setString(3, tenantId.value());
            statement.setString(4, executionKey);
            if (statement.executeUpdate() != 1) {
                throw new SQLException("lease update CAS başarısız", "40001");
            }
        }
    }

    private static boolean matches(BeginCommand command, Execution execution) {
        if (!command.interviewId().equals(execution.interviewId())
                || command.kind() != execution.kind()
                || !command.scopeDigest().equals(execution.scopeDigest())
                || !command.actorRef().equals(execution.actorRef())
                || command.steps().size() != execution.steps().size()) {
            return false;
        }
        for (int index = 0; index < command.steps().size(); index++) {
            PlannedStep expected = command.steps().get(index);
            ExecutionStep actual = execution.steps().get(index);
            if (expected.sequence() != actual.sequence()
                    || expected.type() != actual.type()
                    || !expected.targetRef().equals(actual.targetRef())) {
                return false;
            }
        }
        return true;
    }

    private static boolean validLease(String owner, Instant now, Instant until) {
        return owner != null && !owner.isBlank() && owner.length() <= 512
                && now != null && until != null && until.isAfter(now);
    }

    private static boolean leaseValid(Execution execution, String owner, Instant now) {
        return execution.state() == ExecutionState.RUNNING
                && execution.leaseOwner() != null
                && execution.leaseOwner().equals(owner)
                && Instant.parse(execution.leaseUntil()).isAfter(now);
    }
}
