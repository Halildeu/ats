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
        assertEquals(JobPostingStatus.DRAFT, lateUpdateReplay.job().status());
        assertEquals(1, lateUpdateReplay.job().version(),
                "update retry sonraki transition'ları response'a sızdırmaz");

        var latePublishReplay = jobs.transition(new TransitionCommand(
                TENANT, ACTOR, jobId, 1, JobPostingStatus.PUBLISHED,
                "job-publish-pg-key1", "e".repeat(64), NOW)).asOptional().orElseThrow();
        assertEquals(MutationState.REPLAYED, latePublishReplay.state());
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
