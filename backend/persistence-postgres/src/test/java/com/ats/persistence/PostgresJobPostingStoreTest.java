package com.ats.persistence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.application.ApplicationStore;
import com.ats.application.JobPostingStatus;
import com.ats.application.JobPostingStore;
import com.ats.application.JobPostingStore.Content;
import com.ats.application.JobPostingStore.CreateCommand;
import com.ats.application.JobPostingStore.MutationState;
import com.ats.application.JobPostingStore.TransitionCommand;
import com.ats.application.JobPostingStore.UpdateCommand;
import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.TenantId;
import java.sql.SQLException;
import java.util.List;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.postgresql.ds.PGSimpleDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers
class PostgresJobPostingStoreTest {

    @Container
    private static final PostgreSQLContainer<?> PG = new PostgreSQLContainer<>("postgres:16-alpine");

    private static PGSimpleDataSource ds;
    private static PostgresJobPostingStore jobs;
    private static ApplicationStore applications;

    private static final TenantId TENANT = new TenantId("tenant-job-test");
    private static final TenantId OTHER = new TenantId("tenant-job-other");
    private static final ActorId ACTOR = new ActorId("recruiter-42");
    private static final String NOW = "2026-07-17T12:00:00Z";

    @BeforeAll
    static void migrate() {
        ds = new PGSimpleDataSource();
        ds.setUrl(PG.getJdbcUrl());
        ds.setUser(PG.getUsername());
        ds.setPassword(PG.getPassword());
        Flyway.configure().dataSource(ds).load().migrate();
        jobs = new PostgresJobPostingStore(ds);
        applications = new PostgresApplicationStore(ds);
        try (var c = ds.getConnection(); var ps = c.prepareStatement("""
                INSERT INTO ats_career_site
                    (tenant_id, public_handle, display_name, active, created_by, updated_by,
                     created_at, updated_at)
                VALUES (?, 'job-test', 'Job Test Kariyer', true, 'test', 'test', now(), now())
                ON CONFLICT (tenant_id) DO NOTHING
                """)) {
            ps.setString(1, TENANT.value());
            ps.executeUpdate();
        } catch (SQLException ex) {
            throw new IllegalStateException(ex);
        }
    }

    @Test
    void create_replay_update_publish_pause_is_atomic_tenant_scoped_and_audited() throws Exception {
        String jobId = "job_" + "A".repeat(24);
        String createKey = "job-create-pg-key-01";
        Content initial = content("platform-muhendisi", "Platform Mühendisi");
        CreateCommand create = new CreateCommand(
                TENANT, ACTOR, jobId, createKey, "a".repeat(64), initial, NOW);

        var created = jobs.create(create).asOptional().orElseThrow();
        assertEquals(MutationState.CREATED, created.state());
        assertEquals(JobPostingStatus.DRAFT, created.job().status());
        assertFalse(created.job().applyEnabled());
        assertEquals(0, created.job().version());
        assertEquals(initial.applicationFields(), created.job().applicationFields());
        assertEquals(initial.noticeVersion(), created.job().noticeVersion());
        assertEquals(1, eventCount(TENANT, jobId));

        var replayed = jobs.create(create).asOptional().orElseThrow();
        assertEquals(MutationState.REPLAYED, replayed.state());
        assertEquals(created.job(), replayed.job(),
                "idempotent create replay exact original response'u döndürür");
        assertEquals(1, eventCount(TENANT, jobId), "replay yeni event üretmez");

        CreateCommand conflictingRetry = new CreateCommand(
                TENANT, ACTOR, "job_" + "B".repeat(24), createKey,
                "b".repeat(64), content("baska-ilan", "Başka İlan"), NOW);
        assertEquals(MutationState.IDEMPOTENCY_CONFLICT,
                jobs.create(conflictingRetry).asOptional().orElseThrow().state());

        UpdateCommand update = new UpdateCommand(
                TENANT, ACTOR, jobId, 0, "job-update-pg-key-01", "c".repeat(64),
                content("kidemli-platform-muhendisi", "Kıdemli Platform Mühendisi"), NOW);
        var updated = jobs.update(update).asOptional().orElseThrow();
        assertEquals(MutationState.UPDATED, updated.state());
        assertEquals(1, updated.job().version());
        assertEquals("kidemli-platform-muhendisi", updated.job().slug());

        var stale = jobs.update(new UpdateCommand(
                TENANT, ACTOR, jobId, 0, "job-update-pg-key-02", "d".repeat(64),
                update.content(), NOW)).asOptional().orElseThrow();
        assertEquals(MutationState.VERSION_CONFLICT, stale.state());
        assertEquals(1, stale.job().version());

        var published = jobs.transition(new TransitionCommand(
                TENANT, ACTOR, jobId, 1, JobPostingStatus.PUBLISHED,
                "job-publish-pg-key1", "e".repeat(64), NOW)).asOptional().orElseThrow();
        assertEquals(MutationState.UPDATED, published.state());
        assertEquals(JobPostingStatus.PUBLISHED, published.job().status());
        assertTrue(published.job().applyEnabled());
        assertEquals(2, published.job().version());
        assertEquals(1, applications.listPublishedJobs(TENANT).asOptional().orElseThrow().size());
        assertEquals("job-test", jobs.findActiveCareerHandle(TENANT).asOptional().orElseThrow());

        var paused = jobs.transition(new TransitionCommand(
                TENANT, ACTOR, jobId, 2, JobPostingStatus.PAUSED,
                "job-pause-pg-key-01", "f".repeat(64), NOW)).asOptional().orElseThrow();
        assertEquals(JobPostingStatus.PAUSED, paused.job().status());
        assertFalse(paused.job().applyEnabled());
        assertEquals(0, applications.listPublishedJobs(TENANT).asOptional().orElseThrow().size());
        assertEquals(4, eventCount(TENANT, jobId));

        var lateCreateReplay = jobs.create(create).asOptional().orElseThrow();
        assertEquals(MutationState.REPLAYED, lateCreateReplay.state());
        assertEquals(JobPostingStatus.DRAFT, lateCreateReplay.job().status());
        assertEquals(0, lateCreateReplay.job().version(),
                "create retry exact original response snapshot'ını döndürür");

        var lateUpdateReplay = jobs.update(update).asOptional().orElseThrow();
        assertEquals(MutationState.REPLAYED, lateUpdateReplay.state());
        assertEquals(updated.job(), lateUpdateReplay.job(),
                "idempotent update replay timestamp formatı dahil exact response döndürür");
        assertEquals(JobPostingStatus.DRAFT, lateUpdateReplay.job().status());
        assertEquals(1, lateUpdateReplay.job().version(),
                "update retry sonraki transition'ları response'a sızdırmaz");

        var latePublishReplay = jobs.transition(new TransitionCommand(
                TENANT, ACTOR, jobId, 1, JobPostingStatus.PUBLISHED,
                "job-publish-pg-key1", "e".repeat(64), NOW)).asOptional().orElseThrow();
        assertEquals(MutationState.REPLAYED, latePublishReplay.state());
        assertEquals(published.job(), latePublishReplay.job(),
                "idempotent transition replay timestamp formatı dahil exact response döndürür");
        assertEquals(JobPostingStatus.PUBLISHED, latePublishReplay.job().status());
        assertEquals(2, latePublishReplay.job().version());

        assertFalse(jobs.find(OTHER, jobId).isOk(), "cross-tenant varlık sızdırmaz");
    }

    @Test
    void app_role_can_write_but_cannot_hard_delete_job() throws Exception {
        String jobId = "job_" + "C".repeat(24);
        jobs.create(new CreateCommand(
                TENANT, ACTOR, jobId, "job-create-pg-key-02", "1".repeat(64),
                content("silinemez-ilan", "Silinemez İlan"), NOW)).asOptional().orElseThrow();

        try (var c = ds.getConnection(); var st = c.createStatement()) {
            st.execute("SET ROLE ats_app");
            assertThrows(SQLException.class,
                    () -> st.execute("DELETE FROM ats_job_posting WHERE tenant_id='tenant-job-test'"));
            st.execute("RESET ROLE");
        }
        assertTrue(jobs.find(TENANT, jobId).isOk());
    }

    @Test
    void rolling_v5_writer_is_mirrored_into_canonical_status_without_breaking_constraints()
            throws Exception {
        try (var c = ds.getConnection(); var ps = c.prepareStatement("""
                INSERT INTO ats_job_posting
                    (tenant_id, job_id, slug, title, team, location, mode,
                     employment_type, summary, highlights, published)
                VALUES (?, ?, ?, ?, 'Legacy', 'Türkiye', 'Uzaktan', 'Tam zamanlı',
                        'Rolling deploy sırasında eski pod tarafından yazılan ilan.', '[]'::jsonb, true)
                """)) {
            ps.setString(1, TENANT.value());
            ps.setString(2, "job_" + "L".repeat(24));
            ps.setString(3, "legacy-rolling-ilan");
            ps.setString(4, "Legacy Rolling İlan");
            assertEquals(1, ps.executeUpdate());
        }

        var legacy = jobs.find(TENANT, "job_" + "L".repeat(24)).asOptional().orElseThrow();
        assertEquals(JobPostingStatus.PUBLISHED, legacy.status());
        assertTrue(legacy.applyEnabled());
        assertEquals(1, eventCount(TENANT, legacy.jobId()),
                "rolling writer insert'i audit zincirinde görünür");

        try (var c = ds.getConnection(); var ps = c.prepareStatement("""
                UPDATE ats_job_posting SET published=false
                 WHERE tenant_id=? AND job_id=?
                """)) {
            ps.setString(1, TENANT.value());
            ps.setString(2, legacy.jobId());
            assertEquals(1, ps.executeUpdate());
        }
        var paused = jobs.find(TENANT, legacy.jobId()).asOptional().orElseThrow();
        assertEquals(JobPostingStatus.PAUSED, paused.status());
        assertFalse(paused.applyEnabled());
        assertEquals(1, paused.version(), "legacy mutation V7 CAS version'ını ilerletir");
        assertEquals(2, eventCount(TENANT, legacy.jobId()),
                "rolling writer transition'ı audit zincirinde görünür");

        try (var c = ds.getConnection(); var ps = c.prepareStatement("""
                INSERT INTO ats_job_posting
                    (tenant_id, job_id, slug, title, team, location, mode,
                     employment_type, summary, highlights, published)
                VALUES (?, ?, 'legacy-draft-no-site', 'Legacy Draft No Site', 'Legacy',
                        'Türkiye', 'Uzaktan', 'Tam zamanlı',
                        'Kariyer sitesi olmadan eski pod tarafından hazırlanan taslak.',
                        '[]'::jsonb, false)
                """)) {
            ps.setString(1, OTHER.value());
            ps.setString(2, "job_" + "D".repeat(24));
            assertEquals(1, ps.executeUpdate(),
                    "legacy pod kariyer sitesi hazır değilken DRAFT oluşturabilir");
        }
        assertEquals(JobPostingStatus.DRAFT,
                jobs.find(OTHER, "job_" + "D".repeat(24)).asOptional().orElseThrow().status());
    }

    @Test
    void inactive_career_site_hides_legacy_alias_catalog_and_job_detail() throws Exception {
        String jobId = "job_" + "I".repeat(24);
        String slug = "inactive-career-site-job";
        jobs.create(new CreateCommand(
                TENANT, ACTOR, jobId, "inactive-create-key01", "b".repeat(64),
                content(slug, "Inactive Career Site Job"), NOW)).asOptional().orElseThrow();
        jobs.transition(new TransitionCommand(
                TENANT, ACTOR, jobId, 0, JobPostingStatus.PUBLISHED,
                "inactive-publish-key1", "c".repeat(64), NOW)).asOptional().orElseThrow();

        try (var c = ds.getConnection(); var ps = c.prepareStatement(
                "UPDATE ats_career_site SET active=false WHERE tenant_id=?")) {
            ps.setString(1, TENANT.value());
            assertEquals(1, ps.executeUpdate());
        }
        try {
            assertTrue(applications.listPublishedJobs(TENANT).asOptional().orElseThrow().isEmpty(),
                    "inactive kariyer sitesi legacy alias katalogunu fail-closed gizler");
            assertFalse(applications.findPublishedJob(TENANT, slug).isOk(),
                    "inactive kariyer sitesi legacy alias detayını fail-closed gizler");
        } finally {
            try (var c = ds.getConnection(); var ps = c.prepareStatement(
                    "UPDATE ats_career_site SET active=true WHERE tenant_id=?")) {
                ps.setString(1, TENANT.value());
                ps.executeUpdate();
            }
        }
    }

    @Test
    void rolling_writer_cannot_publish_without_career_site_or_resurrect_terminal_job()
            throws Exception {
        try (var c = ds.getConnection(); var ps = c.prepareStatement("""
                INSERT INTO ats_job_posting
                    (tenant_id, job_id, slug, title, team, location, mode,
                     employment_type, summary, highlights, published)
                VALUES (?, ?, 'no-site-publish', 'No Site Publish', 'Legacy', 'Türkiye',
                        'Uzaktan', 'Tam zamanlı',
                        'Aktif kariyer sitesi olmayan tenant için yayın denemesi.',
                        '[]'::jsonb, true)
                """)) {
            ps.setString(1, OTHER.value());
            ps.setString(2, "job_" + "N".repeat(24));
            assertThrows(SQLException.class, ps::executeUpdate);
        }

        String jobId = "job_" + "T".repeat(24);
        jobs.create(new CreateCommand(
                TENANT, ACTOR, jobId, "terminal-create-key-01", "7".repeat(64),
                content("terminal-ilan", "Terminal İlan"), NOW)).asOptional().orElseThrow();
        jobs.transition(new TransitionCommand(
                TENANT, ACTOR, jobId, 0, JobPostingStatus.PUBLISHED,
                "terminal-publish-key1", "8".repeat(64), NOW)).asOptional().orElseThrow();
        jobs.transition(new TransitionCommand(
                TENANT, ACTOR, jobId, 1, JobPostingStatus.CLOSED,
                "terminal-close-key-01", "9".repeat(64), NOW)).asOptional().orElseThrow();
        jobs.transition(new TransitionCommand(
                TENANT, ACTOR, jobId, 2, JobPostingStatus.ARCHIVED,
                "terminal-archive-key1", "a".repeat(64), NOW)).asOptional().orElseThrow();

        try (var c = ds.getConnection(); var ps = c.prepareStatement("""
                UPDATE ats_job_posting SET published=true
                 WHERE tenant_id=? AND job_id=?
                """)) {
            ps.setString(1, TENANT.value());
            ps.setString(2, jobId);
            assertThrows(SQLException.class, ps::executeUpdate);
        }
        var archived = jobs.find(TENANT, jobId).asOptional().orElseThrow();
        assertEquals(JobPostingStatus.ARCHIVED, archived.status());
        assertFalse(archived.applyEnabled());
        assertEquals(3, archived.version());
    }

    @Test
    void v7_migration_quarantines_preexisting_published_tenant_without_career_site()
            throws Exception {
        String schema = "job_migration_" + Long.toUnsignedString(System.nanoTime());
        PGSimpleDataSource bootstrap = new PGSimpleDataSource();
        bootstrap.setUrl(PG.getJdbcUrl());
        bootstrap.setUser(PG.getUsername());
        bootstrap.setPassword(PG.getPassword());
        try (var c = bootstrap.getConnection(); var st = c.createStatement()) {
            st.execute("CREATE SCHEMA " + schema);
        }

        PGSimpleDataSource migrationDs = new PGSimpleDataSource();
        migrationDs.setUrl(PG.getJdbcUrl());
        migrationDs.setUser(PG.getUsername());
        migrationDs.setPassword(PG.getPassword());
        migrationDs.setCurrentSchema(schema);
        Flyway.configure().dataSource(migrationDs)
                .schemas(schema).defaultSchema(schema).target("6").load().migrate();

        try (var c = migrationDs.getConnection(); var ps = c.prepareStatement("""
                INSERT INTO ats_job_posting
                    (tenant_id, job_id, slug, title, team, location, mode,
                     employment_type, summary, highlights, published)
                VALUES ('pre-v7-other-tenant', 'pre-v7-public-job', 'pre-v7-public',
                        'Pre V7 Public', 'Legacy', 'Türkiye', 'Uzaktan', 'Tam zamanlı',
                        'Kariyer sitesi projectionı olmayan eski yayın.', '[]'::jsonb, true)
                """)) {
            assertEquals(1, ps.executeUpdate());
        }

        var migration = Flyway.configure().dataSource(migrationDs)
                .schemas(schema).defaultSchema(schema).load();
        migration.migrate();
        try (var c = migrationDs.getConnection(); var ps = c.prepareStatement("""
                SELECT status, published, apply_enabled, version, updated_by
                  FROM ats_job_posting
                 WHERE tenant_id='pre-v7-other-tenant' AND job_id='pre-v7-public-job'
                """); var rs = ps.executeQuery()) {
            assertTrue(rs.next());
            assertEquals("PAUSED", rs.getString("status"));
            assertFalse(rs.getBoolean("published"));
            assertFalse(rs.getBoolean("apply_enabled"));
            assertEquals(1, rs.getInt("version"));
            assertEquals("migration:v7:unroutable-published", rs.getString("updated_by"));
        }
    }

    private static Content content(String slug, String title) {
        return new Content(
                slug, title, "Platform", "İstanbul", "Hibrit", "Tam zamanlı",
                "Güvenilir ve ölçeklenebilir platform ürünlerini ekiplerle birlikte geliştirin.",
                List.of("Java", "Kubernetes"),
                com.ats.application.JobPostingService.DEFAULT_APPLICATION_FIELDS,
                com.ats.application.JobPostingService.CURRENT_NOTICE_VERSION);
    }

    private static long eventCount(TenantId tenant, String jobId) throws Exception {
        try (var c = ds.getConnection(); var ps = c.prepareStatement(
                "SELECT count(*) FROM ats_job_posting_event WHERE tenant_id=? AND job_id=?")) {
            ps.setString(1, tenant.value());
            ps.setString(2, jobId);
            try (var rs = ps.executeQuery()) {
                rs.next();
                return rs.getLong(1);
            }
        }
    }
}
