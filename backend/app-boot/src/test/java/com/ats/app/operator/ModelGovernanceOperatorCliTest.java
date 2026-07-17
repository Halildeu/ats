package com.ats.app.operator;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.kernel.JsonCodec;
import com.ats.kernel.JsonValue;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.Arrays;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/** Real-PG acceptance for the owner-gated CLI boundary; normal Spring context is not started. */
@Testcontainers
class ModelGovernanceOperatorCliTest {

    private static final String REF =
            "mapr_549a8e22a2c6f3c445be3e2405262bba5b80a78d72047fd95fa03deaa66a732d";
    private static final String ID = "mgt_01234567-89ab-4cde-8fab-0123456789ab";
    private static final String ACTOR = "cross-ai/faz25/2526";
    private static final String OPERATOR_USERNAME = "governance_operator_test";
    private static final String OPERATOR_PASSWORD = "governance-operator-test-only-password";

    @Container
    private static final PostgreSQLContainer<?> PG = new PostgreSQLContainer<>("postgres:16-alpine");

    @BeforeAll
    static void migrate() {
        Flyway.configure()
                .dataSource(PG.getJdbcUrl(), PG.getUsername(), PG.getPassword())
                .load()
                .migrate();
        try (Connection connection = DriverManager.getConnection(
                        PG.getJdbcUrl(), PG.getUsername(), PG.getPassword());
                Statement statement = connection.createStatement()) {
            statement.execute("CREATE ROLE " + OPERATOR_USERNAME
                    + " LOGIN PASSWORD '" + OPERATOR_PASSWORD
                    + "' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS");
            statement.execute("GRANT ats_governance_writer TO " + OPERATOR_USERNAME);
        } catch (Exception failure) {
            throw new IllegalStateException("test operator role setup failed", failure);
        }
    }

    @Test
    void check_append_and_idempotent_replay_use_canonical_worm_path() throws Exception {
        Run check = run(args("check", ModelGovernanceOperatorCli.CHECK_CONFIRM, ID, ACTOR),
                credentials(OPERATOR_USERNAME, OPERATOR_PASSWORD, false));
        assertEquals(0, check.exit(), diagnostic(check));
        assertTrue(check.out().contains("MODEL_GOVERNANCE_CHECK:v1 outcome=OK"));
        assertTrue(check.out().contains("current=UNINITIALIZED"));
        assertEquals(0, rowCount());

        Run append = run(args("append", ModelGovernanceOperatorCli.APPEND_CONFIRM, ID, ACTOR),
                credentials(OPERATOR_USERNAME, OPERATOR_PASSWORD, false));
        assertEquals(0, append.exit());
        assertTrue(append.out().contains("MODEL_GOVERNANCE_APPEND:v1 outcome=OK"));
        assertTrue(append.out().contains("sequence=0"));
        assertTrue(append.out().matches("(?s).*entryHash=[0-9a-f]{64}.*"));
        assertEquals(1, rowCount());

        Run replay = run(args("append", ModelGovernanceOperatorCli.APPEND_CONFIRM, ID, ACTOR),
                credentials(OPERATOR_USERNAME, OPERATOR_PASSWORD, false));
        assertEquals(0, replay.exit());
        assertTrue(replay.out().contains("idempotent=true"));
        assertEquals(1, rowCount(), "same transitionId and semantic content must not double-write");

        Run conflict = run(args("append", ModelGovernanceOperatorCli.APPEND_CONFIRM, ID, "different/actor"),
                credentials(OPERATOR_USERNAME, OPERATOR_PASSWORD, false));
        assertEquals(3, conflict.exit());
        assertTrue(conflict.err().contains("TRANSITION_ID_CONFLICT"));
        assertEquals(1, rowCount());

        Run stale = run(args("append", ModelGovernanceOperatorCli.APPEND_CONFIRM,
                        "mgt_99999999-8888-4777-8aaa-666666666666", ACTOR),
                credentials(OPERATOR_USERNAME, OPERATOR_PASSWORD, false));
        assertEquals(3, stale.exit());
        assertTrue(stale.err().contains("STALE_EXPECTED_FROM"));
        assertEquals(1, rowCount());
    }

    @Test
    void append_requires_exact_confirmation_before_stdin_is_consumed() {
        String secret = "do-not-echo-confirmation-secret";
        Run result = run(args("append", "WRONG_CONFIRMATION", ID, ACTOR),
                credentials(OPERATOR_USERNAME, secret, false));
        assertEquals(2, result.exit());
        assertTrue(result.err().contains("CONFIRMATION_REQUIRED"));
        assertFalse(result.allOutput().contains(secret));
    }

    @Test
    void credential_envelope_is_exact_key_and_never_echoes_secret() {
        String secret = "do-not-echo-envelope-secret";
        Run result = run(args("check", ModelGovernanceOperatorCli.CHECK_CONFIRM,
                        "mgt_11111111-2222-4333-8aaa-444444444444", ACTOR),
                credentials(OPERATOR_USERNAME, secret, true));
        assertEquals(2, result.exit());
        assertTrue(result.err().contains("CREDENTIAL_ENVELOPE_SCHEMA"));
        assertFalse(result.allOutput().contains(secret));
        assertFalse(result.allOutput().contains(cliJdbcUrl()));
        assertFalse(result.allOutput().contains(PG.getJdbcUrl()));
    }

    @Test
    void jdbc_query_parameters_are_rejected_and_tls_mode_is_a_closed_envelope_field() {
        byte[] envelope = credentials(
                cliJdbcUrl() + "?sslmode=disable", OPERATOR_USERNAME, OPERATOR_PASSWORD, false);
        Run result = run(args("check", ModelGovernanceOperatorCli.CHECK_CONFIRM,
                        "mgt_12345678-1234-4abc-8def-123456789abc", ACTOR), envelope);
        assertEquals(2, result.exit());
        assertTrue(result.err().contains("CREDENTIAL_ENVELOPE_VALUE"));
        assertFalse(result.allOutput().contains(OPERATOR_PASSWORD));
        assertFalse(result.allOutput().contains(cliJdbcUrl()));
        assertFalse(result.allOutput().contains(PG.getJdbcUrl()));
    }

    @Test
    void connection_must_assume_exact_writer_role() throws Exception {
        String username = "not_writer";
        String password = "not-writer-test-only-password";
        try (Connection connection = DriverManager.getConnection(
                        PG.getJdbcUrl(), PG.getUsername(), PG.getPassword());
                Statement statement = connection.createStatement()) {
            statement.execute("CREATE ROLE " + username + " LOGIN PASSWORD '" + password + "'");
        }

        Run result = run(args("check", ModelGovernanceOperatorCli.CHECK_CONFIRM,
                        "mgt_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", ACTOR),
                credentials(username, password, false));
        assertEquals(4, result.exit(), diagnostic(result));
        assertTrue(result.err().contains("OPERATOR_FAILURE"));
        assertFalse(result.allOutput().contains(password));
        assertFalse(result.allOutput().contains(cliJdbcUrl()));
        assertFalse(result.allOutput().contains(PG.getJdbcUrl()));
    }

    @Test
    void superuser_session_is_rejected_even_though_it_can_set_role() {
        Run result = run(args("check", ModelGovernanceOperatorCli.CHECK_CONFIRM,
                        "mgt_bbbbbbbb-cccc-4ddd-8eee-ffffffffffff", ACTOR),
                credentials(PG.getUsername(), PG.getPassword(), false));
        assertEquals(4, result.exit(), diagnostic(result));
        assertTrue(result.err().contains("OPERATOR_FAILURE"));
        assertFalse(result.allOutput().contains(PG.getPassword()));
        assertFalse(result.allOutput().contains(cliJdbcUrl()));
        assertFalse(result.allOutput().contains(PG.getJdbcUrl()));
    }

    @Test
    void catalog_unknown_approval_ref_is_rejected_before_credentials() {
        String[] unknown = args("check", ModelGovernanceOperatorCli.CHECK_CONFIRM,
                "mgt_cccccccc-dddd-4eee-8aaa-bbbbbbbbbbbb", ACTOR);
        unknown[2] = "--approval-ref=mapr_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
        String secret = "catalog-reject-must-not-consume-secret";
        Run result = run(unknown, credentials(OPERATOR_USERNAME, secret, false));
        assertEquals(2, result.exit());
        assertTrue(result.err().contains("CATALOG_BINDING_REQUIRED"));
        assertFalse(result.allOutput().contains(secret));
    }

    private static String[] args(String mode, String confirm, String transitionId, String actor) {
        return new String[] {
            ModelGovernanceOperatorCli.COMMAND,
            "--mode=" + mode,
            "--approval-ref=" + REF,
            "--capability=TRANSCRIBE",
            "--expected-from=UNINITIALIZED",
            "--to-status=APPROVED",
            "--actor-ref=" + actor,
            "--reason=INITIAL_APPROVAL",
            "--transition-id=" + transitionId,
            "--confirm=" + confirm
        };
    }

    private static byte[] credentials(String username, String password, boolean extraKey) {
        return credentials(cliJdbcUrl(), username, password, extraKey);
    }

    /** Testcontainers appends loggerLevel, while the production CLI intentionally forbids URL queries. */
    private static String cliJdbcUrl() {
        String jdbcUrl = PG.getJdbcUrl();
        int queryStart = jdbcUrl.indexOf('?');
        return queryStart < 0 ? jdbcUrl : jdbcUrl.substring(0, queryStart);
    }

    private static byte[] credentials(String jdbcUrl, String username, String password, boolean extraKey) {
        Map<String, JsonValue> values = new java.util.LinkedHashMap<>();
        values.put("jdbcUrl", JsonValue.of(jdbcUrl));
        values.put("username", JsonValue.of(username));
        values.put("password", JsonValue.of(password));
        values.put("sslMode", JsonValue.of("disable"));
        if (extraKey) {
            values.put("unexpected", JsonValue.of("rejected"));
        }
        return JsonCodec.canonical(JsonValue.object(values)).getBytes(StandardCharsets.UTF_8);
    }

    private static Run run(String[] args, byte[] stdin) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ByteArrayOutputStream err = new ByteArrayOutputStream();
        int exit = ModelGovernanceOperatorCli.run(
                Arrays.copyOf(args, args.length),
                new ByteArrayInputStream(stdin),
                new PrintStream(out, true, StandardCharsets.UTF_8),
                new PrintStream(err, true, StandardCharsets.UTF_8));
        return new Run(exit, out.toString(StandardCharsets.UTF_8), err.toString(StandardCharsets.UTF_8));
    }

    private static String diagnostic(Run run) {
        Matcher code = Pattern.compile("code=([A-Z0-9_]{1,80})").matcher(run.allOutput());
        return code.find() ? "operator code=" + code.group(1) : "operator code missing";
    }

    private static int rowCount() throws Exception {
        try (Connection connection = DriverManager.getConnection(
                        PG.getJdbcUrl(), PG.getUsername(), PG.getPassword());
                Statement statement = connection.createStatement();
                ResultSet rows = statement.executeQuery("SELECT count(*) FROM model_governance_ledger")) {
            assertTrue(rows.next());
            return rows.getInt(1);
        }
    }

    private record Run(int exit, String out, String err) {
        String allOutput() {
            return out + err;
        }
    }
}
