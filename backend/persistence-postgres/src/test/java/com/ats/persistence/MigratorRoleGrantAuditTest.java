package com.ats.persistence;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.postgresql.ds.PGSimpleDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Faz 25 #176 P0-FULLATS-DB-01 — proves V16 established the migrator/runtime role split:
 *   - ats_app cannot CREATE in schema public (least privilege)
 *   - ats_app retains USAGE on schema public (existing DML grants keep working)
 *   - ats_migrator has full DDL on schema public
 *   - ats_migrator is NOLOGIN (operator must issue short-lived login role member)
 *
 * Fresh-install harness: this test spins a virgin PG container, runs V1..V16 end to end,
 * then queries pg_catalog + has_*_privilege() to assert the exact post-migration invariant.
 */
@Testcontainers
class MigratorRoleGrantAuditTest {

    @Container
    private static final PostgreSQLContainer<?> PG = new PostgreSQLContainer<>("postgres:16-alpine");

    private static PGSimpleDataSource ds;

    @BeforeAll
    static void migrate() {
        ds = new PGSimpleDataSource();
        ds.setUrl(PG.getJdbcUrl());
        ds.setUser(PG.getUsername());
        ds.setPassword(PG.getPassword());
        Flyway.configure().dataSource(ds).load().migrate();
    }

    @Test
    void ats_app_cannot_create_in_schema_public() throws Exception {
        try (Connection c = ds.getConnection();
             PreparedStatement ps = c.prepareStatement(
                     "SELECT has_schema_privilege('ats_app', 'public', 'CREATE')")) {
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                assertFalse(rs.getBoolean(1),
                        "ats_app MUST NOT have CREATE on schema public post-V16 (least privilege)");
            }
        }
    }

    @Test
    void ats_app_retains_usage_on_schema_public() throws Exception {
        try (Connection c = ds.getConnection();
             PreparedStatement ps = c.prepareStatement(
                     "SELECT has_schema_privilege('ats_app', 'public', 'USAGE')")) {
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                assertTrue(rs.getBoolean(1),
                        "ats_app MUST retain USAGE on schema public so DML grants keep working");
            }
        }
    }

    @Test
    void ats_migrator_has_ddl_authority_on_schema_public() throws Exception {
        try (Connection c = ds.getConnection();
             PreparedStatement ps = c.prepareStatement(
                     "SELECT has_schema_privilege('ats_migrator', 'public', 'CREATE'),"
                             + " has_schema_privilege('ats_migrator', 'public', 'USAGE')")) {
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                assertTrue(rs.getBoolean(1), "ats_migrator MUST have CREATE on schema public");
                assertTrue(rs.getBoolean(2), "ats_migrator MUST have USAGE on schema public");
            }
        }
    }

    @Test
    void ats_migrator_is_nologin() throws Exception {
        try (Connection c = ds.getConnection();
             PreparedStatement ps = c.prepareStatement(
                     "SELECT rolcanlogin FROM pg_catalog.pg_roles WHERE rolname = 'ats_migrator'")) {
            try (ResultSet rs = ps.executeQuery()) {
                assertTrue(rs.next(), "ats_migrator role must exist after V16");
                assertFalse(rs.getBoolean(1),
                        "ats_migrator MUST be NOLOGIN — operator issues short-lived login role member");
            }
        }
    }

    @Test
    void ats_app_dml_grants_from_v2_v5_remain_intact() throws Exception {
        // Sanity: V16 revokes only schema-level CREATE. Table-level DML grants from earlier
        // migrations must be unaffected. Sample a mix of content-plane DELETE and state-plane
        // UPDATE-only tables.
        try (Connection c = ds.getConnection();
             PreparedStatement ps = c.prepareStatement(
                     "SELECT has_table_privilege('ats_app', 'transcript', 'DELETE'),"
                             + " has_table_privilege('ats_app', 'transcript', 'INSERT'),"
                             + " has_table_privilege('ats_app', 'review_case', 'UPDATE'),"
                             + " has_table_privilege('ats_app', 'review_case', 'DELETE')")) {
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                assertTrue(rs.getBoolean(1), "V2 grant: ats_app DELETE ON transcript retained");
                assertTrue(rs.getBoolean(2), "V2 grant: ats_app INSERT ON transcript retained");
                assertTrue(rs.getBoolean(3), "V2 grant: ats_app UPDATE ON review_case retained");
                assertFalse(rs.getBoolean(4), "V2 boundary: ats_app must NOT gain DELETE ON review_case");
            }
        }
    }
}
