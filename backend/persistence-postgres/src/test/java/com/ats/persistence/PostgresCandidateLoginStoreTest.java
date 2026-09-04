package com.ats.persistence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.application.ApplicationIntakeService;
import com.ats.application.ApplicationIntakeService.Submission;
import com.ats.application.ApplicationStore.SubmitCommand;
import com.ats.application.CandidateLoginStore.CandidateApplicationRow;
import com.ats.application.CandidateLoginStore.VerifyState;
import com.ats.application.JobPostingService;
import com.ats.application.JobPostingStatus;
import com.ats.application.JobPostingStore.Content;
import com.ats.application.JobPostingStore.CreateCommand;
import com.ats.application.JobPostingStore.MutationState;
import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import java.sql.SQLException;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.postgresql.ds.PGSimpleDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * #235 aday girişi store'unun Testcontainers kapsamı: challenge yaşam döngüsü
 * (tek kullanım, süre, deneme kilidi), oturum çözümü ve e-posta ile TÜM
 * başvuruların listelenmesi.
 *
 * <p>Kendi container'ını kullanır (PostgresApplicationStoreTest ile paylaşmaz)
 * ki sayımlar başka testlerin kayıtlarından etkilenmesin.
 */
@Testcontainers
class PostgresCandidateLoginStoreTest {

    @Container
    private static final PostgreSQLContainer<?> PG =
            new PostgreSQLContainer<>("postgres:16-alpine");

    private static PGSimpleDataSource ds;
    private static PostgresJobPostingStore jobs;
    private static PostgresApplicationStore applications;
    private static PostgresCandidateLoginStore logins;

    private static final TenantId TENANT = new TenantId("tenant-login-test");
    private static final ActorId RECRUITER = new ActorId("recruiter-login-1");
    private static final String HANDLE = "login-test";
    private static final String SLUG_A = "urun-yoneticisi";
    private static final String SLUG_B = "kidemli-frontend";
    private static final String NOW = "2026-07-28T09:00:00Z";
    private static final String EMAIL = "giris.adayi@example.test";

    @BeforeAll
    static void migrate() throws SQLException {
        ds = new PGSimpleDataSource();
        ds.setUrl(PG.getJdbcUrl());
        ds.setUser(PG.getUsername());
        ds.setPassword(PG.getPassword());
        Flyway.configure().dataSource(ds).load().migrate();
        jobs = new PostgresJobPostingStore(ds);
        applications = new PostgresApplicationStore(ds);
        logins = new PostgresCandidateLoginStore(ds);
        seedActiveCareerSite();
        publishJob("job_" + "L".repeat(24), SLUG_A, "Ürün Yöneticisi");
        publishJob("job_" + "M".repeat(24), SLUG_B, "Kıdemli Frontend");
    }

    @Test
    void listsEveryApplicationOfOneEmailAcrossJobs() {
        // İKİ ilana, aynı adresle, farklı büyük/küçük harf ve boşlukla başvuru:
        // #226'nın çözmek istediği asıl senaryo — aday tek yerde hepsini görmeli.
        submit("app_" + "M".repeat(24), "1a".repeat(32), "app-login-key-01", " Giris.Adayi@Example.TEST ", SLUG_A);
        submit("app_" + "O".repeat(24), "1b".repeat(32), "app-login-key-02", EMAIL, SLUG_B);

        List<CandidateApplicationRow> rows = ok(logins.listApplicationsByEmail(EMAIL));

        assertEquals(2, rows.size(), "aynı adayın iki başvurusu da görünmeli");
        assertEquals(List.of(SLUG_B, SLUG_A),
                rows.stream().map(CandidateApplicationRow::jobSlug).sorted().toList(),
                "alfabetik: kidemli-frontend, urun-yoneticisi");
        // İlan başlığı JOIN'den gelir — ats_application'da job_slug/title kolonu YOK.
        assertTrue(rows.stream().allMatch(r -> r.jobTitle() != null && !r.jobTitle().isBlank()),
                "ilan başlığı JOIN'den dolmalı");
    }

    @Test
    void verifiesCodeOnceThenRejectsReplay() {
        String email = "tekkullanim@example.test";
        String digest = "2a".repeat(32);
        ok(logins.insertChallenge(email, digest, NOW, plus(NOW, Duration.ofMinutes(10))));

        assertEquals(VerifyState.VERIFIED,
                ok(logins.verifyChallenge(email, digest, NOW, 5)));
        // Tüketilen challenge yeniden doğrulanamaz: aynı kodun ikinci kez
        // oturum üretmesi, kodu ele geçiren için sınırsız pencere olurdu.
        assertEquals(VerifyState.INVALID,
                ok(logins.verifyChallenge(email, digest, NOW, 5)));
    }

    @Test
    void rejectsExpiredCodeEvenWhenDigestMatches() {
        String email = "suresigecmis@example.test";
        String digest = "2b".repeat(32);
        ok(logins.insertChallenge(email, digest, NOW, plus(NOW, Duration.ofMinutes(10))));

        String later = plus(NOW, Duration.ofMinutes(11));
        assertEquals(VerifyState.INVALID, ok(logins.verifyChallenge(email, digest, later, 5)));
    }

    @Test
    void locksAfterBudgetIsSpentAndKeepsRejectingTheRightCode() {
        String email = "kilit@example.test";
        String correct = "2c".repeat(32);
        String wrong = "2d".repeat(32);
        ok(logins.insertChallenge(email, correct, NOW, plus(NOW, Duration.ofMinutes(10))));

        assertEquals(VerifyState.INVALID, ok(logins.verifyChallenge(email, wrong, NOW, 3)));
        assertEquals(VerifyState.INVALID, ok(logins.verifyChallenge(email, wrong, NOW, 3)));
        // Üçüncü yanlış deneme bütçeyi bitirir → LOCKED.
        assertEquals(VerifyState.LOCKED, ok(logins.verifyChallenge(email, wrong, NOW, 3)));
        // Kilitten SONRA doğru kod da geçmez; aksi halde sayaç yalnız yanlış
        // denemeleri yavaşlatır, doğru kodu tahmin edeni durdurmazdı.
        assertEquals(VerifyState.LOCKED, ok(logins.verifyChallenge(email, correct, NOW, 3)));
    }

    @Test
    void newestChallengeWinsSoRequestingAgainRecoversFromALock() {
        String email = "yenikod@example.test";
        String stale = "3a".repeat(32);
        String fresh = "3b".repeat(32);
        ok(logins.insertChallenge(email, stale, NOW, plus(NOW, Duration.ofMinutes(10))));
        assertEquals(VerifyState.LOCKED, ok(logins.verifyChallenge(email, "3c".repeat(32), NOW, 1)));

        String later = plus(NOW, Duration.ofMinutes(1));
        ok(logins.insertChallenge(email, fresh, later, plus(later, Duration.ofMinutes(10))));

        // Yeni kod istemek kurtarma yolu: en yeni aktif challenge okunur.
        assertEquals(VerifyState.VERIFIED, ok(logins.verifyChallenge(email, fresh, later, 5)));
    }

    @Test
    void countsOnlyChallengesInsideTheWindow() {
        String email = "kota@example.test";
        ok(logins.insertChallenge(email, "4a".repeat(32), NOW, plus(NOW, Duration.ofMinutes(10))));
        String later = plus(NOW, Duration.ofMinutes(40));
        ok(logins.insertChallenge(email, "4b".repeat(32), later, plus(later, Duration.ofMinutes(10))));

        // 30 dk pencere `later`'dan geriye: yalnız ikinci challenge sayılır.
        assertEquals(1, ok(logins.countChallengesSince(email, minus(later, Duration.ofMinutes(30)))));
        assertEquals(2, ok(logins.countChallengesSince(email, minus(later, Duration.ofHours(2)))));
    }

    @Test
    void sessionResolvesUntilItExpires() {
        String digest = "5a".repeat(32);
        ok(logins.insertSession(digest, EMAIL, NOW, plus(NOW, Duration.ofMinutes(30))));

        assertEquals(EMAIL, ok(logins.findSessionEmail(digest, plus(NOW, Duration.ofMinutes(29)))));
        assertFalse(logins.findSessionEmail(digest, plus(NOW, Duration.ofMinutes(31))).isOk(),
                "süresi geçmiş oturum çözülmemeli");
        assertFalse(logins.findSessionEmail("5b".repeat(32), NOW).isOk(),
                "bilinmeyen oturum anahtarı çözülmemeli");
    }

    @Test
    void hasApplicationsIgnoresErasedAndUnknownAddresses() throws SQLException {
        String email = "silinmis@example.test";
        String ref = "app_" + "P".repeat(24);
        submit(ref, "1c".repeat(32), "app-login-key-03", email, SLUG_A);
        assertTrue(ok(logins.hasApplications(email)));

        erase(ref);
        // Silinmiş kayıt kod göndermeye gerekçe olamaz; adres artık yok sayılır.
        assertFalse(ok(logins.hasApplications(email)));
        assertFalse(ok(logins.hasApplications("hicyok@example.test")));
        assertTrue(ok(logins.listApplicationsByEmail(email)).isEmpty(),
                "silinmiş kayıt listede de görünmemeli");
    }

    @Test
    void storeExpectsAPreNormalizedAddressSoTheServiceMustNormalize() {
        // #229 İK görünürlüğü lower(btrim()) kullanıyor; giriş de aynı kimliği
        // görmeli. Sözleşme: PARAMETRE normalize gelir (SQL yalnız kolonu
        // normalize eder). Bu test o sınırı sabitler — servis normalize etmeyi
        // bırakırsa mixed-case giriş sessizce "başvurusu yok" görürdü.
        String raw = " Sinir.Adayi@Example.TEST ";
        String normalized = "sinir.adayi@example.test";
        submit("app_" + "S".repeat(24), "1d".repeat(32), "app-login-key-04", raw, SLUG_A);

        assertEquals(1, ok(logins.listApplicationsByEmail(normalized)).size(),
                "normalize adresle bulunmalı");
        assertTrue(ok(logins.listApplicationsByEmail(raw)).isEmpty(),
                "ham adres eşleşmez — normalizasyon çağıranın işi");
        assertTrue(ok(logins.hasApplications(normalized)));
        assertFalse(ok(logins.hasApplications(raw)));
    }

    /**
     * asOptional() KULLANILMAZ: {@code Outcome<Void>} başarıda {@code Ok(null)}
     * döner ve Optional.empty()'ye çöker — "başarılı ekleme" hata sanılır.
     * Ok tipini doğrudan eşleştirmek tek dürüst yol.
     */
    private static <T> T ok(Outcome<T> outcome) {
        if (outcome instanceof Outcome.Ok<T> value) {
            return value.value();
        }
        throw new IllegalStateException("beklenen Ok, gelen: " + outcome);
    }

    private static String plus(String iso, Duration d) {
        return Instant.parse(iso).plus(d).toString();
    }

    private static String minus(String iso, Duration d) {
        return Instant.parse(iso).minus(d).toString();
    }

    private static void submit(
            String publicRef, String accessDigest, String key, String email, String slug) {
        applications.submit(new SubmitCommand(
                TENANT, HANDLE, slug, publicRef, accessDigest, key,
                "9" + "a".repeat(63), submission(email), NOW)).asOptional().orElseThrow();
    }

    private static Submission submission(String email) {
        return new Submission(
                "Giriş Adayı", email, "+905550000000", "İstanbul",
                "https://www.linkedin.com/in/sentetik", "https://portfolio.example.test",
                "Sentetik profesyonel özet", "Sentetik deneyim", "Sentetik eğitim",
                List.of("Ürün"), "Sentetik başvuru",
                ApplicationIntakeService.NOTICE_VERSION, NOW, NOW, null, null);
    }

    private static void erase(String publicRef) throws SQLException {
        try (var c = ds.getConnection(); var ps = c.prepareStatement(
                "UPDATE ats_application SET personal_data_erased_at = now() WHERE public_ref = ?")) {
            ps.setString(1, publicRef);
            assertEquals(1, ps.executeUpdate());
        }
    }

    private static void publishJob(String jobId, String slug, String title) {
        Content content = new Content(
                slug, title, "Ürün", "İstanbul", "Hibrit", "Tam zamanlı",
                "Giriş dikey dilimi için yayınlanmış ilan.",
                List.of("Ürün"),
                JobPostingService.DEFAULT_APPLICATION_FIELDS,
                List.of(),
                JobPostingService.CURRENT_NOTICE_VERSION);
        var created = jobs.create(new CreateCommand(
                TENANT, RECRUITER, jobId, "job-login-" + jobId, "6" + "a".repeat(63),
                content, NOW)).asOptional().orElseThrow();
        assertEquals(MutationState.CREATED, created.state());
        var published = jobs.transition(new com.ats.application.JobPostingStore.TransitionCommand(
                TENANT, RECRUITER, jobId, 0, JobPostingStatus.PUBLISHED,
                "job-login-pub-" + jobId, "7" + "a".repeat(63), NOW))
                .asOptional().orElseThrow();
        assertEquals(JobPostingStatus.PUBLISHED, published.job().status());
    }

    private static void seedActiveCareerSite() throws SQLException {
        try (var c = ds.getConnection(); var ps = c.prepareStatement("""
                INSERT INTO ats_career_site
                    (tenant_id, public_handle, display_name, active, created_by, updated_by,
                     created_at, updated_at)
                VALUES (?, ?, 'Giriş Test Kariyer', true, 'test', 'test', now(), now())
                ON CONFLICT (tenant_id) DO NOTHING
                """)) {
            ps.setString(1, TENANT.value());
            ps.setString(2, HANDLE);
            ps.executeUpdate();
        }
    }
}
