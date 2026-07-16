package com.ats.app.operator;

import com.ats.contracts.governance.ApprovalStatus;
import com.ats.contracts.governance.Capability;
import com.ats.contracts.governance.GovernanceActorRef;
import com.ats.contracts.governance.ModelApprovalRef;
import com.ats.contracts.governance.ModelGovernanceLedger;
import com.ats.contracts.governance.ModelGovernanceTransition;
import com.ats.contracts.governance.ModelGovernanceTransitions;
import com.ats.contracts.governance.TransitionId;
import com.ats.contracts.governance.TransitionReason;
import com.ats.governance.ModelGovernanceStatusProjection;
import com.ats.governance.FileBackedApprovedModelRegistry;
import com.ats.kernel.JsonCodec;
import com.ats.kernel.JsonValue;
import com.ats.kernel.Outcome;
import com.ats.persistence.ModelGovernanceAdminAppender;
import com.ats.persistence.PostgresModelGovernanceLedger;
import java.io.IOException;
import java.io.InputStream;
import java.io.PrintStream;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.SQLFeatureNotSupportedException;
import java.sql.Statement;
import java.time.Clock;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.Set;
import java.util.logging.Logger;
import java.util.regex.Pattern;
import javax.sql.DataSource;

/**
 * Owner-gated model-governance transition operator surface.
 *
 * <p>This is deliberately outside normal Spring composition: normal app boot remains reader-only and
 * never seeds the WORM. The command must be selected explicitly, receives credentials only through a
 * strict stdin envelope, assumes the fixed {@code ats_governance_writer} database role on every
 * connection, and delegates all append/hash/CAS semantics to the canonical PostgreSQL adapter.
 */
public final class ModelGovernanceOperatorCli {

    public static final String COMMAND = "model-governance-transition";
    public static final String CHECK_CONFIRM = "CHECK_MODEL_GOVERNANCE_TRANSITION";
    public static final String APPEND_CONFIRM = "APPEND_MODEL_GOVERNANCE_TRANSITION";

    private static final String WRITER_ROLE = "ats_governance_writer";
    private static final int MAX_STDIN_BYTES = 16 * 1024;
    private static final Set<String> ARG_KEYS = Set.of(
            "mode", "approval-ref", "capability", "expected-from", "to-status",
            "actor-ref", "reason", "transition-id", "confirm");
    private static final Set<String> CREDENTIAL_KEYS = Set.of("jdbcUrl", "username", "password", "sslMode");
    private static final Pattern JDBC_URL = Pattern.compile(
            "jdbc:postgresql://[A-Za-z0-9._-]+(?::[0-9]{1,5})?/[A-Za-z0-9_-]+");
    private static final Pattern DB_USERNAME = Pattern.compile("[A-Za-z_][A-Za-z0-9_-]{0,62}");

    private ModelGovernanceOperatorCli() {}

    public static boolean isOperatorCommand(String[] args) {
        return args != null && args.length > 0 && COMMAND.equals(args[0]);
    }

    /** Exit codes: 0=ok, 2=input/confirmation rejected, 3=state/append rejected, 4=operator failure. */
    public static int run(String[] args, InputStream stdin, PrintStream stdout, PrintStream stderr) {
        try {
            Command command = parseCommand(args);
            Credentials credentials = parseCredentials(stdin);
            try (RoleAssumingDataSource dataSource = new RoleAssumingDataSource(credentials)) {
                // Keep credential/member/admin-attribute failures in the operator-failure boundary;
                // the canonical ledger intentionally collapses SQL failures to WORM_UNAVAILABLE.
                dataSource.assertOperatorBoundary();
                return execute(command, dataSource, stdout, stderr);
            }
        } catch (InputRejected rejected) {
            stderr.println("MODEL_GOVERNANCE_OPERATOR:v1 outcome=REJECTED code=" + rejected.code);
            return 2;
        } catch (Exception failure) {
            // Never print exception messages: JDBC errors can contain endpoint/user details.
            stderr.println("MODEL_GOVERNANCE_OPERATOR:v1 outcome=FAILED code=OPERATOR_FAILURE");
            return 4;
        }
    }

    private static int execute(Command command, DataSource dataSource, PrintStream out, PrintStream err) {
        PostgresModelGovernanceLedger ledger = new PostgresModelGovernanceLedger(dataSource, Clock.systemUTC());
        CheckResult before = check(ledger, command);
        if (!before.accepted()) {
            err.println("MODEL_GOVERNANCE_OPERATOR:v1 outcome=REJECTED code=" + before.code());
            return 3;
        }

        if (command.mode() == Mode.CHECK) {
            out.println("MODEL_GOVERNANCE_CHECK:v1 outcome=OK approvalRef=" + command.approvalRef().value()
                    + " capability=" + command.capability() + " current=" + before.current()
                    + " idempotent=" + before.idempotent());
            return 0;
        }

        ModelGovernanceAdminAppender appender = new ModelGovernanceAdminAppender(ledger);
        Outcome<ModelGovernanceTransition> appended = appender.appendTransition(command.appendCommand());
        if (appended instanceof Outcome.Fail<ModelGovernanceTransition> fail) {
            err.println("MODEL_GOVERNANCE_APPEND:v1 outcome=REJECTED code=" + safeCode(fail.reason()));
            return 3;
        }
        ModelGovernanceTransition transition = ((Outcome.Ok<ModelGovernanceTransition>) appended).value();

        CheckResult after = verifyAfterAppend(ledger, command, transition);
        if (!after.accepted()) {
            err.println("MODEL_GOVERNANCE_APPEND:v1 outcome=FAILED code=" + after.code());
            return 3;
        }
        out.println("MODEL_GOVERNANCE_APPEND:v1 outcome=OK transitionId=" + transition.transitionId().value()
                + " approvalRef=" + transition.approvalRef().value() + " capability=" + transition.capability()
                + " sequence=" + transition.sequence() + " entryHash=" + transition.entryHash()
                + " idempotent=" + before.idempotent());
        return 0;
    }

    private static CheckResult check(PostgresModelGovernanceLedger ledger, Command command) {
        Outcome<List<ModelGovernanceTransition>> read = ledger.readAll();
        if (read instanceof Outcome.Fail<List<ModelGovernanceTransition>>) {
            return CheckResult.reject("WORM_UNAVAILABLE");
        }
        List<ModelGovernanceTransition> transitions = ((Outcome.Ok<List<ModelGovernanceTransition>>) read).value();
        if (transitions == null) {
            return CheckResult.reject("WORM_UNAVAILABLE");
        }
        ModelGovernanceStatusProjection.ProjectionOutcome projection =
                ModelGovernanceStatusProjection.project(transitions);
        if (!projection.issues().isEmpty() || !projection.chainIntact()) {
            return CheckResult.reject("WORM_INTEGRITY_FAILED");
        }

        ModelGovernanceTransition existing = transitions.stream()
                .filter(t -> t.transitionId().equals(command.transitionId()))
                .findFirst()
                .orElse(null);
        ApprovalStatus current = projection.currentStatusOf(command.approvalRef(), command.capability());
        if (!projection.isAuthoritative(command.approvalRef(), command.capability())) {
            return CheckResult.reject("TARGET_STATUS_NOT_AUTHORITATIVE");
        }
        if (existing != null) {
            if (!sameSemanticCommand(existing, command)) {
                return CheckResult.reject("TRANSITION_ID_CONFLICT");
            }
            if (current != command.toStatus()) {
                return CheckResult.reject("IDEMPOTENT_STATE_MISMATCH");
            }
            return CheckResult.ok(current, true);
        }
        if (current != command.expectedFrom()) {
            return CheckResult.reject("STALE_EXPECTED_FROM");
        }
        if (!ModelGovernanceTransitions.isValidTransition(
                command.expectedFrom(), command.toStatus(), command.reason())) {
            return CheckResult.reject("ILLEGAL_TRANSITION");
        }
        return CheckResult.ok(current, false);
    }

    private static CheckResult verifyAfterAppend(
            PostgresModelGovernanceLedger ledger, Command command, ModelGovernanceTransition appended) {
        if (!sameSemanticCommand(appended, command)) {
            return CheckResult.reject("APPEND_EVIDENCE_MISMATCH");
        }
        Outcome<List<ModelGovernanceTransition>> read = ledger.readAll();
        if (!(read instanceof Outcome.Ok<List<ModelGovernanceTransition>> ok) || ok.value() == null) {
            return CheckResult.reject("POST_APPEND_READ_FAILED");
        }
        ModelGovernanceStatusProjection.ProjectionOutcome projection =
                ModelGovernanceStatusProjection.project(ok.value());
        if (!projection.issues().isEmpty()
                || !projection.isAuthoritative(command.approvalRef(), command.capability())
                || projection.currentStatusOf(command.approvalRef(), command.capability()) != command.toStatus()) {
            return CheckResult.reject("POST_APPEND_VERIFY_FAILED");
        }
        long matching = ok.value().stream()
                .filter(t -> t.transitionId().equals(command.transitionId()))
                .count();
        return matching == 1
                ? CheckResult.ok(command.toStatus(), true)
                : CheckResult.reject("POST_APPEND_IDENTITY_FAILED");
    }

    private static boolean sameSemanticCommand(ModelGovernanceTransition transition, Command command) {
        return transition.transitionId().equals(command.transitionId())
                && transition.approvalRef().equals(command.approvalRef())
                && transition.capability() == command.capability()
                && transition.fromStatus() == command.expectedFrom()
                && transition.toStatus() == command.toStatus()
                && transition.actorRef().equals(command.actorRef())
                && transition.reasonCode() == command.reason();
    }

    private static String safeCode(String raw) {
        if (raw == null || !raw.matches("[A-Z0-9_]{1,80}")) {
            return "APPEND_FAILED";
        }
        return raw;
    }

    private static Command parseCommand(String[] args) {
        if (!isOperatorCommand(args)) {
            throw new InputRejected("COMMAND_REQUIRED");
        }
        Map<String, String> values = new HashMap<>();
        for (String raw : Arrays.copyOfRange(args, 1, args.length)) {
            int equals = raw == null ? -1 : raw.indexOf('=');
            if (equals < 3 || equals == raw.length() - 1 || !raw.startsWith("--")) {
                throw new InputRejected("ARGUMENT_FORMAT");
            }
            String key = raw.substring(2, equals);
            String value = raw.substring(equals + 1);
            if (!ARG_KEYS.contains(key) || values.putIfAbsent(key, value) != null) {
                throw new InputRejected("ARGUMENT_SET");
            }
        }
        if (!values.keySet().equals(ARG_KEYS)) {
            throw new InputRejected("ARGUMENT_SET");
        }
        try {
            Mode mode = Mode.valueOf(values.get("mode").toUpperCase());
            String expectedConfirm = mode == Mode.CHECK ? CHECK_CONFIRM : APPEND_CONFIRM;
            if (!expectedConfirm.equals(values.get("confirm"))) {
                throw new InputRejected("CONFIRMATION_REQUIRED");
            }
            Command command = new Command(
                    mode,
                    new ModelApprovalRef(values.get("approval-ref")),
                    Capability.valueOf(values.get("capability")),
                    ApprovalStatus.valueOf(values.get("expected-from")),
                    ApprovalStatus.valueOf(values.get("to-status")),
                    new GovernanceActorRef(values.get("actor-ref")),
                    TransitionReason.valueOf(values.get("reason")),
                    new TransitionId(values.get("transition-id")));
            if (!ModelGovernanceTransitions.isValidTransition(
                    command.expectedFrom(), command.toStatus(), command.reason())) {
                throw new InputRejected("ILLEGAL_TRANSITION");
            }
            assertShippedCatalogBinding(command);
            return command;
        } catch (IllegalArgumentException invalid) {
            if (invalid instanceof InputRejected rejected) {
                throw rejected;
            }
            throw new InputRejected("ARGUMENT_VALUE");
        }
    }

    private static Credentials parseCredentials(InputStream stdin) {
        if (stdin == null) {
            throw new InputRejected("STDIN_REQUIRED");
        }
        try {
            byte[] bytes = stdin.readNBytes(MAX_STDIN_BYTES + 1);
            if (bytes.length == 0 || bytes.length > MAX_STDIN_BYTES) {
                throw new InputRejected("CREDENTIAL_ENVELOPE_SIZE");
            }
            JsonValue parsed = JsonCodec.parse(new String(bytes, StandardCharsets.UTF_8));
            if (!(parsed instanceof JsonValue.JsonObject object)
                    || !object.values().keySet().equals(CREDENTIAL_KEYS)) {
                throw new InputRejected("CREDENTIAL_ENVELOPE_SCHEMA");
            }
            Credentials credentials = new Credentials(
                    requiredString(object, "jdbcUrl"),
                    requiredString(object, "username"),
                    requiredString(object, "password"),
                    SslMode.fromWire(requiredString(object, "sslMode")));
            if (!JDBC_URL.matcher(credentials.jdbcUrl()).matches()
                    || !DB_USERNAME.matcher(credentials.username()).matches()
                    || credentials.password().isEmpty()
                    || credentials.password().length() > 1024) {
                throw new InputRejected("CREDENTIAL_ENVELOPE_VALUE");
            }
            return credentials;
        } catch (InputRejected rejected) {
            throw rejected;
        } catch (IOException | RuntimeException invalid) {
            throw new InputRejected("CREDENTIAL_ENVELOPE_INVALID");
        }
    }

    private static String requiredString(JsonValue.JsonObject object, String key) {
        if (object.values().get(key) instanceof JsonValue.JsonString string) {
            return string.value();
        }
        throw new InputRejected("CREDENTIAL_ENVELOPE_SCHEMA");
    }

    private static void assertShippedCatalogBinding(Command command) {
        try {
            FileBackedApprovedModelRegistry registry = FileBackedApprovedModelRegistry.fromClasspath(
                    "model-governance/approved-models.json");
            long matches = registry.approvedSpecs().stream()
                    .filter(spec -> spec.approvalRef().equals(command.approvalRef()))
                    .filter(spec -> spec.capability() == command.capability())
                    .count();
            if (matches != 1) {
                throw new InputRejected("CATALOG_BINDING_REQUIRED");
            }
        } catch (InputRejected rejected) {
            throw rejected;
        } catch (RuntimeException unavailable) {
            throw new InputRejected("CATALOG_UNAVAILABLE");
        }
    }

    private enum Mode { CHECK, APPEND }

    private enum SslMode {
        DISABLE("disable"),
        VERIFY_FULL("verify-full");

        private final String wire;

        SslMode(String wire) {
            this.wire = wire;
        }

        static SslMode fromWire(String raw) {
            return Arrays.stream(values())
                    .filter(value -> value.wire.equals(raw))
                    .findFirst()
                    .orElseThrow(() -> new InputRejected("CREDENTIAL_SSL_MODE"));
        }
    }

    private record Credentials(String jdbcUrl, String username, String password, SslMode sslMode) {}

    private record Command(
            Mode mode,
            ModelApprovalRef approvalRef,
            Capability capability,
            ApprovalStatus expectedFrom,
            ApprovalStatus toStatus,
            GovernanceActorRef actorRef,
            TransitionReason reason,
            TransitionId transitionId) {

        ModelGovernanceLedger.AppendCommand appendCommand() {
            return new ModelGovernanceLedger.AppendCommand(
                    approvalRef, capability, expectedFrom, toStatus, actorRef, reason, transitionId);
        }
    }

    private record CheckResult(boolean accepted, String code, ApprovalStatus current, boolean idempotent) {
        static CheckResult ok(ApprovalStatus current, boolean idempotent) {
            return new CheckResult(true, "OK", current, idempotent);
        }

        static CheckResult reject(String code) {
            return new CheckResult(false, code, null, false);
        }
    }

    private static final class InputRejected extends IllegalArgumentException {
        private final String code;

        private InputRejected(String code) {
            super(code);
            this.code = code;
        }
    }

    /** DriverManager DataSource with a fixed role assumption and no credential-bearing diagnostics. */
    private static final class RoleAssumingDataSource implements DataSource, AutoCloseable {
        private final String jdbcUrl;
        private final String username;
        private final SslMode sslMode;
        private String password;

        private RoleAssumingDataSource(Credentials credentials) {
            this.jdbcUrl = credentials.jdbcUrl();
            this.username = credentials.username();
            this.password = credentials.password();
            this.sslMode = credentials.sslMode();
        }

        private void assertOperatorBoundary() throws SQLException {
            try (Connection ignored = getConnection()) {
                // Opening the connection proves SET ROLE and all session assertions before ledger use.
            }
        }

        @Override
        public Connection getConnection() throws SQLException {
            if (password == null) {
                throw new SQLException("closed", "08003");
            }
            Properties properties = new Properties();
            properties.setProperty("user", username);
            properties.setProperty("password", password);
            properties.setProperty("sslmode", sslMode.wire);
            return assumeWriterRole(DriverManager.getConnection(jdbcUrl, properties));
        }

        private static Connection assumeWriterRole(Connection connection) throws SQLException {
            try {
                try (Statement setRole = connection.createStatement()) {
                    setRole.execute("SET ROLE " + WRITER_ROLE);
                }
                try (Statement assertion = connection.createStatement();
                        ResultSet rs = assertion.executeQuery(
                                "SELECT current_user, session_user, "
                                        + "COALESCE((SELECT rolsuper OR rolcreatedb OR rolcreaterole "
                                        + "OR rolreplication OR rolbypassrls FROM pg_roles "
                                        + "WHERE rolname=session_user), true), "
                                        + "pg_has_role(session_user, 'ats_governance_writer', 'member')")) {
                    if (!rs.next()
                            || !WRITER_ROLE.equals(rs.getString(1))
                            || WRITER_ROLE.equals(rs.getString(2))
                            || rs.getBoolean(3)
                            || !rs.getBoolean(4)
                            || rs.next()) {
                        throw new SQLException("writer role assertion failed", "28000");
                    }
                }
                return connection;
            } catch (SQLException failure) {
                try {
                    connection.close();
                } catch (SQLException ignored) {
                    // Original fail-closed error remains authoritative.
                }
                throw failure;
            }
        }

        @Override
        public Connection getConnection(String ignoredUser, String ignoredPassword) throws SQLException {
            throw new SQLException("explicit per-call credentials disabled", "0A000");
        }

        @Override
        public PrintWriter getLogWriter() {
            return null;
        }

        @Override
        public void setLogWriter(PrintWriter out) throws SQLFeatureNotSupportedException {
            if (out != null) {
                throw new SQLFeatureNotSupportedException("log writer disabled");
            }
        }

        @Override
        public void setLoginTimeout(int seconds) {
            DriverManager.setLoginTimeout(seconds);
        }

        @Override
        public int getLoginTimeout() {
            return DriverManager.getLoginTimeout();
        }

        @Override
        public Logger getParentLogger() throws SQLFeatureNotSupportedException {
            throw new SQLFeatureNotSupportedException("parent logger unsupported");
        }

        @Override
        public <T> T unwrap(Class<T> iface) throws SQLException {
            if (iface != null && iface.isInstance(this)) {
                return iface.cast(this);
            }
            throw new SQLException("not a wrapper", "0A000");
        }

        @Override
        public boolean isWrapperFor(Class<?> iface) {
            return iface != null && iface.isInstance(this);
        }

        @Override
        public void close() {
            password = null;
        }
    }
}
