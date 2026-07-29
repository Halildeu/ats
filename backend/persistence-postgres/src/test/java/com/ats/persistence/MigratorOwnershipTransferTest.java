package com.ats.persistence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import org.flywaydb.core.Flyway;
import org.postgresql.ds.PGSimpleDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.junit.jupiter.api.Test;

/**
 * Faz 25 #230 P0-FULLATS-DB-02 — proves V20 finishes the ownership half of #176 that
 * V16/PR#197 left as a manual DBA runbook step (RB-ats-migrator-role-split.md).
 *
 * <p><b>Corrected premise (CI-caught, see below).</b> {@code ats_app} has been NOLOGIN
 * since V1 — a pure grant-collecting group role. No connection is ever literally
 * "{@code ats_app}", so no object is ever owned by it; the true owner of anything created
 * during migration is always the CONNECTING LOGIN IDENTITY (in production: whatever runs
 * Flyway today, before the ats_migrator_login split ships — runbook step 4). An earlier
 * revision of V20 ran {@code REASSIGN OWNED BY ats_app TO ats_migrator}, which is a
 * near-no-op against that role and — worse — fails outright under a least-privilege
 * runner that is not itself a member of {@code ats_app}
 * ({@code MigrationRoleProvisioningPrerequisiteTest} caught this in CI: "permission denied
 * to reassign objects — Only roles with privileges of role \"ats_app\" may reassign
 * objects owned by it"). V20 now runs {@code REASSIGN OWNED BY CURRENT_USER TO
 * ats_migrator} instead, which only requires membership in the target role — the same
 * membership V16's own {@code ALTER DEFAULT PRIVILEGES FOR ROLE ats_migrator} line already
 * required to succeed.
 *
 * <p>This test therefore asserts ownership against the actual connecting principal (the
 * Testcontainers default user), not a hardcoded "ats_app" literal — asserting the latter
 * would silently pass for the wrong reason (the role never owned anything to begin with).
 *
 * <p>Two-stage harness proves both #230 acceptance paths on the same virgin container:
 * stage 1 migrates only to V19 (mirrors a database that has been running since before V20
 * existed — the "upgrade" case, where objects have been runner-owned for months); stage 2
 * then applies V20 and re-asserts the invariant (the "fresh install" case is the
 * degenerate one-stage subset of this and is covered implicitly).
 */
@Testcontainers
class MigratorOwnershipTransferTest {

    @Container
    private static final PostgreSQLContainer<?> PG = new PostgreSQLContainer<>("postgres:16-alpine");

    @Test
    void upgradePath_ownershipTransfersOnV20WithoutBreakingExistingGrants() throws Exception {
        PGSimpleDataSource ds = new PGSimpleDataSource();
        // 30s statement_timeout: an earlier revision of this test hung in CI for hours
        // instead of failing fast (root cause not fully isolated — this bounds any
        // recurrence to a clear, fast failure instead of a silent multi-hour stall).
        // getJdbcUrl() has no query string today, but appending defensively either way.
        String baseUrl = PG.getJdbcUrl();
        String separator = baseUrl.contains("?") ? "&" : "?";
        ds.setUrl(baseUrl + separator + "options=-c%20statement_timeout%3D30000");
        ds.setUser(PG.getUsername());
        ds.setPassword(PG.getPassword());
        String runner = PG.getUsername();

        // Stage 1: simulate a pre-V20 database. At V19, the migration-running principal
        // must still own its own tables (this is the documented baseline #230/#176 set out
        // to fix) — that principal is the actual connecting user, not the NOLOGIN
        // "ats_app" group role, which has never literally owned anything.
        Flyway.configure().dataSource(ds).target("19").load().migrate();
        try (Connection c = ds.getConnection()) {
            assertTrue(countOwnedBy(c, runner) > 0,
                    "precondition: at V19, the migration runner must still own tables"
                            + " (pre-#230 baseline)");
            assertEquals(0, countOwnedBy(c, "ats_migrator"),
                    "precondition: ats_migrator owns nothing before V20 runs");
        }

        // Stage 2: apply V20 on top of the already-populated V19 state (the real upgrade
        // path — objects existed under the runner before this migration ran).
        Flyway.configure().dataSource(ds).load().migrate();

        try (Connection c = ds.getConnection()) {
            assertEquals(0, countOwnedBy(c, runner),
                    "post-V20: the migration runner must own NOTHING in schema public"
                            + " (upgrade path)");
            assertTrue(countOwnedBy(c, "ats_migrator") > 0,
                    "post-V20: ats_migrator must own the transferred tables");

            // flyway_schema_history: ownership moved to ats_migrator, but ats_app (the
            // group role the real runtime/Flyway login inherits from) must still be able
            // to read/write it — otherwise the NEXT migration would fail with permission
            // denied before the datasource split (runbook step 4) ships.
            try (PreparedStatement ps = c.prepareStatement(
                    "SELECT has_table_privilege('ats_app', 'flyway_schema_history', 'SELECT'),"
                            + " has_table_privilege('ats_app', 'flyway_schema_history', 'INSERT'),"
                            + " has_table_privilege('ats_app', 'flyway_schema_history', 'UPDATE'),"
                            + " has_table_privilege('ats_app', 'flyway_schema_history', 'DELETE')");
                    ResultSet rs = ps.executeQuery()) {
                assertTrue(rs.next());
                assertTrue(rs.getBoolean(1), "ats_app must retain SELECT on flyway_schema_history");
                assertTrue(rs.getBoolean(2), "ats_app must retain INSERT on flyway_schema_history"
                        + " (needed for future Flyway runs before the datasource split ships)");
                assertTrue(rs.getBoolean(3), "ats_app must retain UPDATE on flyway_schema_history");
                assertTrue(rs.getBoolean(4), "ats_app must retain DELETE on flyway_schema_history");
            }

            // Regression sanity (same tables the V16 test already exercises): REASSIGN
            // OWNED must transfer ownership WITHOUT touching pre-existing per-table ACLs.
            try (PreparedStatement ps = c.prepareStatement(
                    "SELECT has_table_privilege('ats_app', 'transcript', 'DELETE'),"
                            + " has_table_privilege('ats_app', 'transcript', 'INSERT'),"
                            + " has_table_privilege('ats_app', 'review_case', 'UPDATE'),"
                            + " has_table_privilege('ats_app', 'review_case', 'DELETE')");
                    ResultSet rs = ps.executeQuery()) {
                assertTrue(rs.next());
                assertTrue(rs.getBoolean(1), "V2 grant: ats_app DELETE ON transcript retained post-V20");
                assertTrue(rs.getBoolean(2), "V2 grant: ats_app INSERT ON transcript retained post-V20");
                assertTrue(rs.getBoolean(3), "V2 grant: ats_app UPDATE ON review_case retained post-V20");
                assertFalse(rs.getBoolean(4), "V2 boundary: ats_app must still NOT have DELETE ON review_case");
            }

            // Idempotency (#230 acceptance implies safety on re-run, matches V16's own
            // "idempotent" claim): reuses the SAME already-migrated container instead of
            // spinning up a second one — a prior revision of this test started a second
            // PostgreSQLContainer here purely for this check, which is unnecessary
            // container/resource overhead this test doesn't need.
            try (Statement st = c.createStatement()) {
                st.execute("REASSIGN OWNED BY CURRENT_USER TO ats_migrator");
            }
        }
    }

    private static int countOwnedBy(Connection c, String role) throws Exception {
        try (PreparedStatement ps = c.prepareStatement(
                "SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tableowner = ?")) {
            ps.setString(1, role);
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                return rs.getInt(1);
            }
        }
    }
}
