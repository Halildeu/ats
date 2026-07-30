package com.ats.persistence;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.postgresql.ds.PGSimpleDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Pins the role-provisioning prerequisite of the migration chain (#202).
 *
 * <p>Why this exists. {@link MigratorRoleGrantAuditTest} calls itself a "fresh-install
 * harness", but it runs Flyway as the Testcontainers <em>superuser</em>. Superusers have
 * CREATEROLE, so that harness silently exercises a path no deployment uses: in the cluster
 * the chain runs as {@code ats_app}, a least-privilege login with {@code rolcreaterole = f}.
 * The gap is not theoretical. On k3d-test the migration chain stopped at
 *
 * <pre>
 *   V16__migrator_role_least_privilege.sql
 *   SQLSTATE 42501: permission denied to create role
 *     Where: CREATE ROLE ats_migrator NOLOGIN
 * </pre>
 *
 * and the rollout hung for <b>14 hours</b> without looking broken: the previous ReplicaSet
 * kept serving, Endpoints stayed populated, health checks stayed green. Only a
 * {@code KubeReplicaSetSplit} alert surfaced it.
 *
 * <p>What the chain actually requires. Three migrations provision roles -- V1
 * ({@code ats_app}), V4 ({@code ats_governance_writer}) and V16 ({@code ats_migrator}) --
 * each guarded by {@code IF NOT EXISTS}. The guard means an install works iff the roles
 * already exist; otherwise the runner needs CREATEROLE. V16 was simply the first role that
 * had not been created out of band, so it was the first to fail. Nothing about V16 is
 * special, and fixing V16 alone would not make a clean install work.
 *
 * <p>Why the migrations are not changed instead. They are applied everywhere, and Flyway
 * validates checksums on start, so editing an applied file -- even a comment -- breaks
 * every existing install with a checksum mismatch. The contract therefore has to be
 * enforced from outside, which is what these two cases do: one proves the prerequisite is
 * real, the other proves the documented remedy discharges it. Both run against their own
 * virgin container, because roles are cluster-wide and one case would otherwise satisfy
 * the other's precondition.
 *
 * @see <a href="https://github.com/Halildeu/ats/issues/202">#202</a>
 * @see docs/runbooks/RB-ats-migrator-role-split.md
 */
@Testcontainers
class MigrationRoleProvisioningPrerequisiteTest {

    /** No roles pre-provisioned: the chain must stop, and stop early. */
    @Container
    private static final PostgreSQLContainer<?> BARE =
            new PostgreSQLContainer<>("postgres:16-alpine");

    /** Roles pre-provisioned by a privileged principal, per the runbook. */
    @Container
    private static final PostgreSQLContainer<?> PROVISIONED =
            new PostgreSQLContainer<>("postgres:16-alpine");

    private static final String DEPLOYER = "ats_deployer";
    private static final String DEPLOYER_PASSWORD = "prerequisite-test-only";
    private static final String FRESH_DB = "ats_fresh";

    /** Least-privilege login that mirrors the deployment identity (no CREATEROLE). */
    private static void createDeployerAndDatabase(PostgreSQLContainer<?> pg) throws Exception {
        try (Connection admin = superuser(pg).getConnection();
             Statement st = admin.createStatement()) {
            st.execute("CREATE ROLE " + DEPLOYER + " LOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB"
                    + " PASSWORD '" + DEPLOYER_PASSWORD + "'");
            st.execute("CREATE DATABASE " + FRESH_DB + " OWNER " + DEPLOYER);
        }
    }

    private static PGSimpleDataSource superuser(PostgreSQLContainer<?> pg) {
        PGSimpleDataSource ds = new PGSimpleDataSource();
        ds.setUrl(pg.getJdbcUrl());
        ds.setUser(pg.getUsername());
        ds.setPassword(pg.getPassword());
        return ds;
    }

    private static PGSimpleDataSource asDeployer(PostgreSQLContainer<?> pg) {
        PGSimpleDataSource ds = new PGSimpleDataSource();
        ds.setUrl(pg.getJdbcUrl().replaceFirst("/[^/?]+(\\?|$)", "/" + FRESH_DB + "$1"));
        ds.setUser(DEPLOYER);
        ds.setPassword(DEPLOYER_PASSWORD);
        return ds;
    }

    private static boolean flag(DataSource ds, String sql) throws Exception {
        try (Connection c = ds.getConnection();
             Statement st = c.createStatement();
             ResultSet rs = st.executeQuery(sql)) {
            rs.next();
            return rs.getBoolean(1);
        }
    }

    @Test
    void chain_stops_when_roles_are_absent_and_the_runner_cannot_create_them() throws Exception {
        createDeployerAndDatabase(BARE);

        RuntimeException failure = assertThrows(RuntimeException.class,
                () -> Flyway.configure().dataSource(asDeployer(BARE)).load().migrate(),
                "a least-privilege runner MUST NOT be able to provision roles silently");

        String trace = stackTraceOf(failure);
        assertTrue(trace.contains("42501") || trace.contains("permission denied to create role"),
                "expected SQLSTATE 42501 (permission denied to create role), got:\n" + trace);

        // Fail-closed, and fail *early*: nothing may be left half-applied. The first
        // role-provisioning migration is V1, so the chain must not reach V16 at all.
        assertFalse(flag(superuser(BARE),
                        "SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ats_migrator')"),
                "no role may be created when the runner lacks CREATEROLE");
    }

    @Test
    void chain_completes_for_the_same_runner_once_roles_are_pre_provisioned() throws Exception {
        createDeployerAndDatabase(PROVISIONED);
        try (Connection admin = superuser(PROVISIONED).getConnection();
             Statement st = admin.createStatement()) {
            // Exactly the remedy the runbook prescribes -- nothing more.
            st.execute("CREATE ROLE ats_app NOLOGIN");
            st.execute("CREATE ROLE ats_governance_writer NOLOGIN");
            st.execute("CREATE ROLE ats_migrator NOLOGIN");
            // Creating the role is not sufficient: V16 runs
            // `ALTER DEFAULT PRIVILEGES FOR ROLE ats_migrator`, and Postgres requires the
            // caller to be a *member* of that role to alter its defaults. Without this
            // grant the chain still stops, at `permission denied to change default
            // privileges` -- a second dead end one step past the first.
            st.execute("GRANT ats_migrator TO " + DEPLOYER);
        }

        DataSource deployer = asDeployer(PROVISIONED);
        Flyway.configure().dataSource(deployer).load().migrate();

        assertEquals(highestMigrationOnClasspath(), latestAppliedVersion(deployer),
                "the whole chain must apply once the prerequisite is discharged");
        assertFalse(flag(deployer, "SELECT has_schema_privilege('ats_app','public','CREATE')"),
                "V16 invariant still holds under a least-privilege runner");
        assertTrue(flag(deployer, "SELECT has_schema_privilege('ats_migrator','public','CREATE')"),
                "ats_migrator must hold DDL authority after the chain");
        assertTrue(flag(deployer,
                        "SELECT tableowner = current_user FROM pg_catalog.pg_tables"
                                + " WHERE schemaname = 'public'"
                                + " AND tablename = 'flyway_schema_history'"),
                "fresh install: Flyway must retain ownership of its locked history table");
        assertFalse(flag(deployer,
                        "SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_tables"
                                + " WHERE schemaname = 'public'"
                                + " AND tablename <> 'flyway_schema_history'"
                                + " AND tableowner = current_user)"),
                "fresh install: deployer must own no managed ATS tables after V20");
        assertFalse(flag(deployer,
                        "SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_sequences"
                                + " WHERE schemaname = 'public'"
                                + " AND sequenceowner = current_user)"),
                "fresh install: deployer must own no ATS sequences after V20");
        assertTrue(flag(deployer,
                        "SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_tables"
                                + " WHERE schemaname = 'public'"
                                + " AND tablename <> 'flyway_schema_history'"
                                + " AND tableowner = 'ats_migrator')"),
                "fresh install: ats_migrator must own managed ATS tables after V20");
        assertTrue(flag(deployer,
                        "SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_sequences"
                                + " WHERE schemaname = 'public'"
                                + " AND sequenceowner = 'ats_migrator')"),
                "fresh install: ats_migrator must own ATS sequences after V20");
    }

    private static String latestAppliedVersion(DataSource ds) throws Exception {
        try (Connection c = ds.getConnection();
             Statement st = c.createStatement();
             ResultSet rs = st.executeQuery(
                     "SELECT version FROM flyway_schema_history"
                             + " WHERE success ORDER BY installed_rank DESC LIMIT 1")) {
            return rs.next() ? rs.getString(1) : null;
        }
    }

    private static String stackTraceOf(Throwable t) {
        StringBuilder sb = new StringBuilder();
        for (Throwable c = t; c != null; c = c.getCause()) {
            sb.append(c).append('\n');
        }
        return sb.toString();
    }

    /**
     * The claim under test is "the chain ran to its end", not "the chain is exactly N long".
     * Pinning the literal made every new migration fail this test for no safety gain, so the
     * expectation is derived from the migrations actually on the classpath.
     */
    private static String highestMigrationOnClasspath() throws Exception {
        java.net.URL dir = MigrationRoleProvisioningPrerequisiteTest.class
                .getClassLoader().getResource("db/migration");
        assertNotNull(dir, "db/migration must be on the test classpath");
        java.io.File[] files = new java.io.File(dir.toURI()).listFiles();
        assertNotNull(files, "db/migration must be readable");
        int highest = 0;
        for (java.io.File f : files) {
            java.util.regex.Matcher m =
                    java.util.regex.Pattern.compile("^V(\\d+)__").matcher(f.getName());
            if (m.find()) highest = Math.max(highest, Integer.parseInt(m.group(1)));
        }
        assertTrue(highest > 0, "no V<n>__ migration found on the classpath");
        return String.valueOf(highest);
    }
}
