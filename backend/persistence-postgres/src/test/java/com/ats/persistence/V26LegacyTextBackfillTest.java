package com.ats.persistence;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.ats.application.ApplicationIntakeService.EducationEntry;
import com.ats.application.ApplicationIntakeService.ExperienceEntry;
import com.ats.application.CandidateApplication;
import com.ats.kernel.Ids.TenantId;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationVersion;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.postgresql.ds.PGSimpleDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * ats#250 (yol (a), sahip kararı 2026-09-25): girdisi olmayan eski başvuruların TEXT'i
 * tek bir yapısal girdinin {@code description}'ına taşınır (V26).
 *
 * <p>Göç veri olmadan kanıtlanamaz (V21 dersi): Flyway {@code V25}'te durdurulur, eski
 * başvuru biçimleri tohumlanır, V26 koşar. Test sayım eşitliğini (N taşı, N doğrula),
 * yapısal girdisi olan satırın korunmasını ve İK detay okumasının (store) taşınan bilgiyi
 * göstermesini sabitler.
 */
@Testcontainers
class V26LegacyTextBackfillTest {

    @Container
    private static final PostgreSQLContainer<?> PG = new PostgreSQLContainer<>("postgres:16-alpine");

    private static final String TENANT = "tenant-v26";
    private static final String JOB = "job_" + "B".repeat(24);
    /** Eski başvuru: TEXT dolu, iki girdi de boş — ikisi de taşınır. */
    private static final String LEGACY = "app_" + "L".repeat(24);
    /** Yapısal girdisi olan başvuru: TEXT farklı olsa da dokunulmaz (yapısal kazanır). */
    private static final String STRUCTURED = "app_" + "S".repeat(24);
    /** TEXT boş/boşluk: taşınacak bilgi yok, girdi boş kalır. */
    private static final String BLANK_TEXT = "app_" + "E".repeat(24);
    /** Yalnız deneyim girdisi boş: yalnız deneyim taşınır, eğitim korunur. */
    private static final String MIXED = "app_" + "M".repeat(24);
    /** Uzun eski metin: kısaltılmadan taşınır (8000'e kadar olabilir). */
    private static final String LONG_TEXT = "app_" + "T".repeat(24);

    private static final String LEGACY_EXPERIENCE = "Kidemli Urun Uzmani - Ornek A.S.\n2019 - 2023";
    private static final String LEGACY_EDUCATION = "Ornek Universitesi, Isletme";
    private static final String LONG_EXPERIENCE = "x".repeat(6000);
    private static final String[] DIGESTS = {"a".repeat(64), "b".repeat(64), "c".repeat(64),
        "d".repeat(64), "e".repeat(64)};

    private static PGSimpleDataSource ds;
    private static int seeded;
    private static long experienceDueBefore;
    private static long educationDueBefore;

    @BeforeAll
    static void migrateSeedThenBackfill() throws SQLException {
        ds = new PGSimpleDataSource();
        ds.setUrl(PG.getJdbcUrl());
        ds.setUser(PG.getUsername());
        ds.setPassword(PG.getPassword());

        Flyway.configure().dataSource(ds).target(MigrationVersion.fromVersion("25")).load().migrate();

        exec("INSERT INTO ats_job_posting (tenant_id, job_id, slug, title, team, location,"
                + " mode, employment_type, summary, published) VALUES ('" + TENANT + "', '" + JOB
                + "', 'v26-ilan', 'V26 Ilan', 'Takim', 'Istanbul', 'HYBRID', 'FULL_TIME',"
                + " 'ozet', false)");
        insert(LEGACY, LEGACY_EXPERIENCE, LEGACY_EDUCATION, "[]", "[]");
        insert(STRUCTURED, "celiskili eski metin", "celiskili egitim",
                "[{\"title\": \"Yapisal Unvan\"}]", "[{\"school\": \"Yapisal Okul\"}]");
        insert(BLANK_TEXT, "", "   ", "[]", "[]");
        insert(MIXED, LEGACY_EXPERIENCE, "egitim metni", "[]", "[{\"school\": \"Kalan Okul\"}]");
        insert(LONG_TEXT, LONG_EXPERIENCE, LEGACY_EDUCATION, "[]", "[]");

        experienceDueBefore = count("experience_entries = '[]'::jsonb"
                + " AND btrim(coalesce(experience, '')) <> ''");
        educationDueBefore = count("education_entries = '[]'::jsonb"
                + " AND btrim(coalesce(education, '')) <> ''");

        Flyway.configure().dataSource(ds).load().migrate();
    }

    @Test
    void every_due_row_is_moved_and_none_is_left_behind() throws SQLException {
        // N taşı, N doğrula: tohumda deneyimi taşınacak 3, eğitimi taşınacak 2 satır var.
        assertEquals(3, experienceDueBefore, "tohum: LEGACY, MIXED, LONG_TEXT");
        assertEquals(2, educationDueBefore, "tohum: LEGACY, LONG_TEXT");
        assertEquals(experienceDueBefore, count("experience_entries = jsonb_build_array("
                + "jsonb_build_object('description', experience))"
                + " AND public_ref IN ('" + LEGACY + "', '" + MIXED + "', '" + LONG_TEXT + "')"));
        assertEquals(educationDueBefore, count("education_entries = jsonb_build_array("
                + "jsonb_build_object('description', education))"
                + " AND public_ref IN ('" + LEGACY + "', '" + LONG_TEXT + "')"));
        assertEquals(0, count("experience_entries = '[]'::jsonb"
                + " AND btrim(coalesce(experience, '')) <> ''"), "taşınmayan deneyim kalmamalı");
        assertEquals(0, count("education_entries = '[]'::jsonb"
                + " AND btrim(coalesce(education, '')) <> ''"), "taşınmayan eğitim kalmamalı");
    }

    @Test
    void the_entry_carries_only_the_legacy_text_and_the_text_column_stays() throws SQLException {
        assertEquals("[{\"description\": \"Kidemli Urun Uzmani - Ornek A.S.\\n2019 - 2023\"}]",
                scalar("SELECT experience_entries::text FROM ats_application WHERE public_ref = '"
                        + LEGACY + "'"),
                "başlık/kurum/tarih boş kalır: yalnız description yazılır");
        assertEquals(LEGACY_EXPERIENCE, scalar("SELECT experience FROM ats_application"
                + " WHERE public_ref = '" + LEGACY + "'"), "TEXT kolonu bu dilimde değişmez");
        assertEquals(String.valueOf(LONG_EXPERIENCE.length()), scalar(
                "SELECT length(experience_entries -> 0 ->> 'description')::text"
                        + " FROM ats_application WHERE public_ref = '" + LONG_TEXT + "'"),
                "uzun eski metin kısaltılmadan taşınır");
    }

    @Test
    void structured_entries_win_and_blank_text_creates_nothing() throws SQLException {
        assertEquals("[{\"title\": \"Yapisal Unvan\"}]", scalar("SELECT experience_entries::text"
                + " FROM ats_application WHERE public_ref = '" + STRUCTURED + "'"),
                "yapısal girdisi olan satıra dokunulmaz");
        assertEquals("[{\"school\": \"Yapisal Okul\"}]", scalar("SELECT education_entries::text"
                + " FROM ats_application WHERE public_ref = '" + STRUCTURED + "'"));
        assertEquals("[]", scalar("SELECT experience_entries::text FROM ats_application"
                + " WHERE public_ref = '" + BLANK_TEXT + "'"), "boş TEXT girdi üretmez");
        assertEquals("[]", scalar("SELECT education_entries::text FROM ats_application"
                + " WHERE public_ref = '" + BLANK_TEXT + "'"), "boşluktan oluşan TEXT girdi üretmez");
        assertEquals("[{\"school\": \"Kalan Okul\"}]", scalar("SELECT education_entries::text"
                + " FROM ats_application WHERE public_ref = '" + MIXED + "'"),
                "yalnız boş olan tarafa taşınır");
    }

    @Test
    void the_recruiter_detail_reads_the_moved_text_as_an_entry() {
        CandidateApplication application = new PostgresApplicationStore(ds)
                .findRecruiterApplication(new TenantId(TENANT), LEGACY)
                .asOptional().orElseThrow().application();

        List<ExperienceEntry> experience = application.experienceEntries();
        assertEquals(1, experience.size(), "İK detayı taşınan deneyimi tek girdi olarak okur");
        assertEquals(LEGACY_EXPERIENCE, experience.get(0).description());
        assertEquals("", experience.get(0).title());
        List<EducationEntry> education = application.educationEntries();
        assertEquals(1, education.size());
        assertEquals(LEGACY_EDUCATION, education.get(0).description());
    }

    private static void insert(String publicRef, String experience, String education,
            String experienceEntries, String educationEntries) throws SQLException {
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(
                "INSERT INTO ats_application (tenant_id, application_id, public_ref, job_id,"
                        + " full_name, status, candidate_access_digest, notice_version,"
                        + " notice_accepted_at, accuracy_confirmed_at, created_at, updated_at,"
                        + " experience, education, experience_entries, education_entries)"
                        + " VALUES (?, gen_random_uuid(), ?, ?, 'Sentetik Aday', 'SUBMITTED', ?,"
                        + " 'v1', now(), now(), now(), now(), ?, ?, ?::jsonb, ?::jsonb)")) {
            int i = 1;
            ps.setString(i++, TENANT);
            ps.setString(i++, publicRef);
            ps.setString(i++, JOB);
            ps.setString(i++, DIGESTS[seeded++]);
            ps.setString(i++, experience);
            ps.setString(i++, education);
            ps.setString(i++, experienceEntries);
            ps.setString(i, educationEntries);
            ps.executeUpdate();
        }
    }

    private static long count(String where) throws SQLException {
        return Long.parseLong(scalar("SELECT count(*)::text FROM ats_application WHERE " + where));
    }

    private static void exec(String sql) throws SQLException {
        try (Connection c = ds.getConnection(); Statement s = c.createStatement()) {
            s.execute(sql);
        }
    }

    private static String scalar(String sql) throws SQLException {
        try (Connection c = ds.getConnection(); Statement s = c.createStatement();
                ResultSet rs = s.executeQuery(sql)) {
            return rs.next() ? rs.getString(1) : null;
        }
    }
}
