package com.ats.persistence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.application.ApplicationIntakeService;
import com.ats.application.ApplicationIntakeService.Submission;
import com.ats.application.ApplicationStatus;
import com.ats.application.ApplicationStore;
import com.ats.application.ApplicationStore.ApplicationPage;
import com.ats.application.ApplicationStore.CandidateStatusView;
import com.ats.application.ApplicationStore.RecruiterApplicationSummary;
import com.ats.application.ApplicationStore.SubmitCommand;
import com.ats.application.ApplicationStore.SubmitResult;
import com.ats.application.ApplicationStore.SubmitState;
import com.ats.application.ApplicationStore.TransitionCommand;
import com.ats.application.ApplicationStore.TransitionResult;
import com.ats.application.ApplicationStore.TransitionState;
import com.ats.application.JobPostingService;
import com.ats.application.JobPostingStatus;
import com.ats.application.JobPostingStore.Content;
import com.ats.application.JobPostingStore.CreateCommand;
import com.ats.application.JobPostingStore.MutationState;
import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.TenantId;
import java.sql.SQLException;
import java.util.List;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.postgresql.ds.PGSimpleDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Application store'un izole (store-seviyesi, full Spring boot'suz) Testcontainers
 * kapsamı. Diğer sekiz persistence adapter'ının aksine application store'un kendi
 * store testi yoktu; bu dosya #174 (P6-FULLATS-APP-01) kriter 9'un "standalone
 * PostgresApplicationStoreTest" boşluğunu kapatır ve PostgresJobPostingStoreTest
 * ile simetrik atomic submit / idempotency-under-race / CAS transition / PII-minimize
 * inbox / opaque candidate credential / append-only invariant kanıtı verir.
 */
@Testcontainers
class PostgresApplicationStoreTest {

    @Container
    private static final PostgreSQLContainer<?> PG = new PostgreSQLContainer<>("postgres:16-alpine");

    private static PGSimpleDataSource ds;
    private static PostgresJobPostingStore jobs;
    private static PostgresApplicationStore applications;

    private static final TenantId TENANT = new TenantId("tenant-app-test");
    private static final TenantId OTHER = new TenantId("tenant-app-other");
    private static final ActorId RECRUITER = new ActorId("recruiter-app-1");
    private static final String HANDLE = "app-test";
    private static final String SLUG = "urun-yoneticisi";
    private static final String NOW = "2026-07-17T12:00:00Z";

    @BeforeAll
    static void migrate() throws SQLException {
        ds = new PGSimpleDataSource();
        ds.setUrl(PG.getJdbcUrl());
        ds.setUser(PG.getUsername());
        ds.setPassword(PG.getPassword());
        Flyway.configure().dataSource(ds).load().migrate();
        jobs = new PostgresJobPostingStore(ds);
        applications = new PostgresApplicationStore(ds);
        seedActiveCareerSite(TENANT, HANDLE);
        publishJob(TENANT, "job_" + "P".repeat(24), SLUG, "Ürün Yöneticisi");
    }

    @Test
    void submit_is_atomic_idempotent_and_candidate_view_is_opaque_and_minimized() {
        String publicRef = "app_" + "A".repeat(24);
        String digest = "a".repeat(64);
        String key = "app-submit-key-01";

        SubmitResult created = applications.submit(
                command(publicRef, digest, key, "d1".repeat(32), "Ayşe Sentetik"))
                .asOptional().orElseThrow();
        assertEquals(SubmitState.CREATED, created.state());
        assertEquals(ApplicationStatus.SUBMITTED, created.application().status());
        assertEquals(0, created.application().version());
        assertEquals(publicRef, created.application().publicRef());
        assertEquals(1, eventCount(TENANT, publicRef), "atomik submit tek SUBMITTED audit event üretir");

        SubmitResult replay = applications.submit(
                command(publicRef, digest, key, "d1".repeat(32), "Ayşe Sentetik"))
                .asOptional().orElseThrow();
        assertEquals(SubmitState.REPLAYED, replay.state());
        assertEquals(created.application(), replay.application(),
                "aynı key + aynı request digest exact original receipt döndürür");
        assertEquals(1, eventCount(TENANT, publicRef), "replay yeni event üretmez");

        SubmitResult conflict = applications.submit(
                command("app_" + "Z".repeat(24), "f".repeat(64), key, "d2".repeat(32), "Farklı Payload"))
                .asOptional().orElseThrow();
        assertEquals(SubmitState.IDEMPOTENCY_CONFLICT, conflict.state(),
                "aynı key + farklı request digest fail-closed IDEMPOTENCY_CONFLICT döndürür");
        assertNull(conflict.application());

        CandidateStatusView view = applications.findCandidateStatus(publicRef, digest)
                .asOptional().orElseThrow();
        assertEquals(ApplicationStatus.SUBMITTED, view.status());
        assertEquals(SLUG, view.jobSlug());
        assertEquals(1, view.history().size());
        assertEquals(ApplicationStatus.SUBMITTED, view.history().get(0).status());

        assertFalse(applications.findCandidateStatus(publicRef, "0".repeat(64)).isOk(),
                "yanlış opaque credential her zaman NOT_FOUND (enumeration direnci)");
        assertFalse(applications.findCandidateStatus("app_" + "Q".repeat(24), digest).isOk(),
                "bilinmeyen public ref NOT_FOUND");
    }

    @Test
    void recruiter_inbox_is_tenant_scoped_and_pii_minimized() {
        String publicRef = "app_" + "B".repeat(24);
        applications.submit(command(publicRef, "b".repeat(64), "app-submit-key-02",
                "d3".repeat(32), "Bora İnbox")).asOptional().orElseThrow();

        ApplicationPage page = applications.listRecruiterApplications(TENANT, SLUG, null, 0, 20)
                .asOptional().orElseThrow();
        RecruiterApplicationSummary item = page.items().stream()
                .filter(s -> s.publicRef().equals(publicRef)).findFirst().orElseThrow();
        assertEquals("Bora İnbox", item.fullName());
        assertEquals(ApplicationStatus.SUBMITTED, item.status());
        // Inbox projection deterministik olarak minimizedir: yalnız RecruiterApplicationSummary
        // alanları vardır; phone/linkedIn/portfolio/summary/experience/education/note ve raw
        // candidate credential DTO şeklinde zaten yoktur (compile-time surface guard).

        ApplicationPage crossTenant = applications.listRecruiterApplications(OTHER, null, null, 0, 20)
                .asOptional().orElseThrow();
        assertTrue(crossTenant.items().stream().noneMatch(s -> s.publicRef().equals(publicRef)),
                "recruiter inbox cross-tenant başvuru sızdırmaz");

        assertTrue(applications.findRecruiterApplication(TENANT, publicRef).isOk());
        assertFalse(applications.findRecruiterApplication(OTHER, publicRef).isOk(),
                "cross-tenant recruiter detail fail-closed NOT_FOUND");
    }

    @Test
    void status_transition_is_compare_and_set_with_allowed_matrix() {
        String publicRef = "app_" + "C".repeat(24);
        applications.submit(command(publicRef, "c".repeat(64), "app-submit-key-03",
                "d4".repeat(32), "Cem CAS")).asOptional().orElseThrow();

        TransitionResult review = applications.transition(new TransitionCommand(
                TENANT, RECRUITER, publicRef, 0, ApplicationStatus.UNDER_REVIEW, NOW))
                .asOptional().orElseThrow();
        assertEquals(TransitionState.UPDATED, review.state());
        assertEquals(1, review.application().version());
        assertEquals(ApplicationStatus.UNDER_REVIEW, review.application().status());

        TransitionResult stale = applications.transition(new TransitionCommand(
                TENANT, RECRUITER, publicRef, 0, ApplicationStatus.INTERVIEW_PENDING, NOW))
                .asOptional().orElseThrow();
        assertEquals(TransitionState.VERSION_CONFLICT, stale.state(),
                "stale expectedVersion CAS ile reddedilir");
        assertEquals(1, stale.application().version());

        TransitionResult interview = applications.transition(new TransitionCommand(
                TENANT, RECRUITER, publicRef, 1, ApplicationStatus.INTERVIEW_PENDING, NOW))
                .asOptional().orElseThrow();
        assertEquals(TransitionState.UPDATED, interview.state());
        assertEquals(2, interview.application().version());

        TransitionResult illegal = applications.transition(new TransitionCommand(
                TENANT, RECRUITER, publicRef, 2, ApplicationStatus.SUBMITTED, NOW))
                .asOptional().orElseThrow();
        assertEquals(TransitionState.ILLEGAL_TRANSITION, illegal.state(),
                "durum makinesi dışı geçiş (INTERVIEW_PENDING->SUBMITTED) reddedilir");
        assertEquals(2, illegal.application().version());

        TransitionResult missing = applications.transition(new TransitionCommand(
                TENANT, RECRUITER, "app_" + "N".repeat(24), 0, ApplicationStatus.UNDER_REVIEW, NOW))
                .asOptional().orElseThrow();
        assertEquals(TransitionState.NOT_FOUND, missing.state());

        TransitionResult crossTenant = applications.transition(new TransitionCommand(
                OTHER, RECRUITER, publicRef, 2, ApplicationStatus.REJECTED, NOW))
                .asOptional().orElseThrow();
        assertEquals(TransitionState.NOT_FOUND, crossTenant.state(),
                "cross-tenant durum geçişi başvuruyu göremez");

        CandidateStatusView view = applications.findCandidateStatus(publicRef, "c".repeat(64))
                .asOptional().orElseThrow();
        assertEquals(ApplicationStatus.INTERVIEW_PENDING, view.status(),
                "aday opaque credential ile güncel durumu görür");
        assertEquals(3, view.history().size(), "SUBMITTED + UNDER_REVIEW + INTERVIEW_PENDING");
    }

    @Test
    void concurrent_same_idempotency_submit_yields_one_application() throws Exception {
        String publicRef = "app_" + "R".repeat(24);
        String digest = "9".repeat(64);
        String key = "app-concurrent-key-01";
        SubmitCommand command = command(publicRef, digest, key, "d5".repeat(32), "Race Aday");

        try (var c = ds.getConnection(); var st = c.createStatement()) {
            st.execute("DROP TRIGGER IF EXISTS ats_test_delay_app_insert ON ats_application");
            st.execute("DROP FUNCTION IF EXISTS ats_test_delay_app_insert()");
            st.execute("""
                    CREATE FUNCTION ats_test_delay_app_insert() RETURNS trigger
                    LANGUAGE plpgsql AS $$
                    BEGIN
                      IF NEW.public_ref = 'app_RRRRRRRRRRRRRRRRRRRRRRRR' THEN
                        PERFORM pg_sleep(0.75);
                      END IF;
                      RETURN NEW;
                    END $$
                    """);
            st.execute("""
                    CREATE TRIGGER ats_test_delay_app_insert
                    BEFORE INSERT ON ats_application
                    FOR EACH ROW EXECUTE FUNCTION ats_test_delay_app_insert()
                    """);
        }

        var ready = new CountDownLatch(2);
        var start = new CountDownLatch(1);
        var executor = Executors.newFixedThreadPool(2);
        try {
            Callable<SubmitResult> request = () -> {
                ready.countDown();
                if (!start.await(5, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("concurrent submit start timeout");
                }
                return applications.submit(command).asOptional().orElseThrow();
            };
            var first = executor.submit(request);
            var second = executor.submit(request);
            assertTrue(ready.await(5, TimeUnit.SECONDS));
            start.countDown();

            SubmitResult firstResult = first.get(15, TimeUnit.SECONDS);
            SubmitResult secondResult = second.get(15, TimeUnit.SECONDS);
            assertEquals(Set.of(SubmitState.CREATED, SubmitState.REPLAYED),
                    Set.of(firstResult.state(), secondResult.state()),
                    "aynı idempotency yarışı 5xx değil create + replay üretir");
            assertEquals(firstResult.application(), secondResult.application(),
                    "kaybeden request yalnız commit edilmiş exact receipt'i görür");
            assertEquals(1, eventCount(TENANT, publicRef), "yarış tek başvuru + tek audit event üretir");
        } finally {
            executor.shutdownNow();
            try (var c = ds.getConnection(); var st = c.createStatement()) {
                st.execute("DROP TRIGGER IF EXISTS ats_test_delay_app_insert ON ats_application");
                st.execute("DROP FUNCTION IF EXISTS ats_test_delay_app_insert()");
            }
        }
    }

    @Test
    void app_role_can_write_but_cannot_hard_delete_application() throws Exception {
        String publicRef = "app_" + "D".repeat(24);
        applications.submit(command(publicRef, "e".repeat(64), "app-submit-key-04",
                "d6".repeat(32), "Deniz Silinemez")).asOptional().orElseThrow();

        try (var c = ds.getConnection(); var st = c.createStatement()) {
            st.execute("SET ROLE ats_app");
            assertThrows(SQLException.class,
                    () -> st.execute("DELETE FROM ats_application WHERE tenant_id='tenant-app-test'"));
            st.execute("RESET ROLE");
        }
        assertTrue(applications.findCandidateStatus(publicRef, "e".repeat(64)).isOk(),
                "hard-delete reddedildikten sonra başvuru hâlâ okunur");
    }

    // --- helpers ---

    private static SubmitCommand command(
            String publicRef, String candidateAccessDigest, String idempotencyKey,
            String requestDigest, String fullName) {
        return new SubmitCommand(
                TENANT, HANDLE, SLUG, publicRef, candidateAccessDigest,
                idempotencyKey, requestDigest, submission(fullName), NOW);
    }

    private static Submission submission(String fullName) {
        return new Submission(
                fullName, "aday@example.test", "+905550000000", "İstanbul",
                "https://www.linkedin.com/in/sentetik", "https://portfolio.example.test",
                "Ürün alanında sentetik profesyonel özet", "Sentetik deneyim", "Sentetik eğitim",
                List.of("Ürün", "Araştırma"), "Sentetik başvuru",
                ApplicationIntakeService.NOTICE_VERSION, NOW, NOW, null, null);
    }

    private static void publishJob(TenantId tenant, String jobId, String slug, String title) {
        Content content = new Content(
                slug, title, "Ürün", "İstanbul", "Hibrit", "Tam zamanlı",
                "Sentetik başvuru dikey dilimi için yayınlanmış ilan.",
                List.of("Ürün", "Araştırma"),
                JobPostingService.DEFAULT_APPLICATION_FIELDS,
                JobPostingService.CURRENT_NOTICE_VERSION);
        var created = jobs.create(new CreateCommand(
                tenant, RECRUITER, jobId, "job-create-" + jobId, "a".repeat(64), content, NOW))
                .asOptional().orElseThrow();
        assertEquals(MutationState.CREATED, created.state());
        var published = jobs.transition(new com.ats.application.JobPostingStore.TransitionCommand(
                tenant, RECRUITER, jobId, 0, JobPostingStatus.PUBLISHED,
                "job-publish-" + jobId, "b".repeat(64), NOW)).asOptional().orElseThrow();
        assertEquals(JobPostingStatus.PUBLISHED, published.job().status());
    }

    private static void seedActiveCareerSite(TenantId tenant, String handle) throws SQLException {
        try (var c = ds.getConnection(); var ps = c.prepareStatement("""
                INSERT INTO ats_career_site
                    (tenant_id, public_handle, display_name, active, created_by, updated_by,
                     created_at, updated_at)
                VALUES (?, ?, 'Application Test Kariyer', true, 'test', 'test', now(), now())
                ON CONFLICT (tenant_id) DO NOTHING
                """)) {
            ps.setString(1, tenant.value());
            ps.setString(2, handle);
            ps.executeUpdate();
        }
    }

    private static long eventCount(TenantId tenant, String publicRef) {
        try (var c = ds.getConnection(); var ps = c.prepareStatement("""
                SELECT count(*)
                  FROM ats_application_event e
                  JOIN ats_application a
                    ON a.tenant_id = e.tenant_id AND a.application_id = e.application_id
                 WHERE a.tenant_id = ? AND a.public_ref = ?
                """)) {
            ps.setString(1, tenant.value());
            ps.setString(2, publicRef);
            try (var rs = ps.executeQuery()) {
                rs.next();
                return rs.getLong(1);
            }
        } catch (SQLException ex) {
            throw new IllegalStateException(ex);
        }
    }
}
