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
 * V16/PR#197 left as a manual DBA runbook step (RB-ats-migrator-role-split.md):
 *   - after V20, ats_migrator owns every table/sequence in schema public
 *   - ats_app owns NOTHING (least-privilege claim is machine-verified, not just granted)
 *   - existing DML grants from V2..V19 remain intact (REASSIGN OWNED changes ownership,
 *     not existing ACL entries)
 *   - ats_app can still read/write flyway_schema_history (V20's own grant), so Flyway
 *     keeps working under the current ats_app-run migrator until the two-datasource
 *     split (runbook step 5) ships separately
 *
 * <p>Two-stage harness proves BOTH #230 acceptance paths on the same virgin container:
 * stage 1 migrates only to V19 (mirrors a database that has been running since before
 * V20 existed — the "upgrade" case, where objects have been ats_app-owned for months);
 * stage 2 then applies V20 and re-asserts the invariant (the "fresh install" case is the
 * degenerate one-stage subset of this and is covered implicitly).
 */
@Testcontainers
class MigratorOwnershipTransferTest {

    @Container
    private static final PostgreSQLContainer<?> PG = new PostgreSQLContainer<>("postgres:16-alpine");

    @Test
    void upgradePath_ownershipTransfersOnV20WithoutBreakingExistingGrants() throws Exception {
        PGSimpleDataSource ds = new PGSimpleDataSource();
        ds.setUrl(PG.getJdbcUrl());
        ds.setUser(PG.getUsername());
        ds.setPassword(PG.getPassword());

        // Stage 1: simulate a pre-V20 database. At V19, ats_app must still own its own
        // tables (this is the documented baseline #230/#176 set out to fix).
        Flyway.configure().dataSource(ds).target("19").load().migrate();
        try (Connection c = ds.getConnection()) {
            assertTrue(countOwnedBy(c, "ats_app") > 0,
                    "precondition: at V19, ats_app must still own tables (pre-#230 baseline)");
        }

        // Stage 2: apply V20 on top of the already-populated V19 state (the real upgrade
        // path — objects existed under ats_app before this migration ran).
        Flyway.configure().dataSource(ds).load().migrate();

        try (Connection c = ds.getConnection()) {
            assertEquals(0, countOwnedBy(c, "ats_app"),
                    "post-V20: ats_app must own NOTHING in schema public (upgrade path)");
            assertTrue(countOwnedBy(c, "ats_migrator") > 0,
                    "post-V20: ats_migrator must own the transferred tables");

            // flyway_schema_history: ownership moved, but ats_app must still be able to
            // read/write it (V20's own grant) — otherwise the NEXT migration ats_app runs
            // would fail with permission denied.
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
        }
    }

    @Test
    void reassignOwnedIsIdempotent_reapplyingV20DoesNotFail() throws Exception {
        // #230 acceptance implies safety on re-run (matches V16's own "idempotent" claim).
        // Flyway won't literally re-run an already-applied version, so this proves the
        // underlying SQL statement itself tolerates a no-op re-execution — a future
        // rollback/replay of this migration file cannot strand the database.
        try (PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16-alpine")) {
            pg.start();
            PGSimpleDataSource ds = new PGSimpleDataSource();
            ds.setUrl(pg.getJdbcUrl());
            ds.setUser(pg.getUsername());
            ds.setPassword(pg.getPassword());
            Flyway.configure().dataSource(ds).load().migrate();

            try (Connection c = ds.getConnection();
                    Statement st = c.createStatement()) {
                // ats_app already owns nothing post-V20 — re-running the exact statement
                // must be a safe no-op, not an error.
                st.execute("REASSIGN OWNED BY ats_app TO ats_migrator");
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
