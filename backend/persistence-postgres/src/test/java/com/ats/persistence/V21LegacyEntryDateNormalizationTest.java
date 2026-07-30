package com.ats.persistence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.application.ApplicationIntakeService.EducationEntry;
import com.ats.application.ApplicationIntakeService.ExperienceEntry;
import com.ats.application.ResumeDateNormalizer;
import java.sql.Connection;
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
 * #242 dilim C: miras tarih normalizasyonu (V21) — GERÇEK veriyle koşan kanıt.
 *
 * <p>Göç, veri OLMADAN başarılı olamaz: boş şemada 145 test yeşil geçip canlıda
 * 29 gerçek satırla reddedilen bir göç daha önce yaşandı. Bu yüzden test
 * Flyway'i {@code V20}'da durdurur, canlıda ÖLÇÜLEN değer biçimlerini tohumlar
 * ({@code Eyl 2022}, {@code Devam ediyor}, {@code Devam}, {@code 09/2022},
 * {@code 2016 güz}) ve ancak sonra V21'i koşar.
 *
 * <p>Ayrıca SQL ile Java'nın AYNI sonucu verdiğini pinler: V21 tarihsel bir
 * snapshot olduğu için sözlüğü Java'dan ayrıdır ve iki tarafın bu tohumlanmış
 * sözcük kümesinde ayrışması sessiz veri bozulması demek olurdu.
 */
@Testcontainers
class V21LegacyEntryDateNormalizationTest {

    @Container
    private static final PostgreSQLContainer<?> PG = new PostgreSQLContainer<>("postgres:16-alpine");

    private static PGSimpleDataSource ds;
    private static final String[] HEX_DIGESTS = {"a".repeat(64), "b".repeat(64), "c".repeat(64)};
    private static int seeded;

    private static final String TENANT = "tenant-v21";
    private static final String JOB = "job_" + "V".repeat(24);
    private static final String WITH_ENTRIES = "app_" + "V".repeat(24);
    private static final String EMPTY_ENTRIES = "app_" + "W".repeat(24);
    /** Geri alma testi kendi satırında çalışır: test SIRASI belirsizdir ve
     * paylaşılan satırı geri almak diğer testlerin ölçtüğü değeri bozardı. */
    private static final String ROLLBACK_ROW = "app_" + "R".repeat(24);

    /** Canlıda ölçülen ham değerler (2026-07-30, k3d-test). */
    private static final String LEGACY_MONTH_NAME = "Eyl 2022";
    private static final String LEGACY_ONGOING_LONG = "Devam ediyor";
    private static final String LEGACY_ONGOING_SHORT = "Devam";
    private static final String LEGACY_NUMERIC = "09/2022";
    private static final String LEGACY_UNPARSED = "2016 güz";

    @BeforeAll
    static void migrateSeedThenUpgrade() throws SQLException {
        ds = new PGSimpleDataSource();
        ds.setUrl(PG.getJdbcUrl());
        ds.setUser(PG.getUsername());
        ds.setPassword(PG.getPassword());

        // 1) Göçü V21'in BİR ÖNCESİNDE durdur.
        Flyway.configure().dataSource(ds)
                .target(MigrationVersion.fromVersion("20"))
                .load().migrate();

        // 2) Canlıda ölçülen biçimleri tohumla.
        exec("INSERT INTO ats_job_posting (tenant_id, job_id, slug, title, team, location,"
                + " mode, employment_type, summary, published) VALUES ('" + TENANT + "', '" + JOB
                + "', 'v21-ilan', 'V21 Ilan', 'Takim', 'Istanbul', 'HYBRID', 'FULL_TIME',"
                + " 'ozet', false)");   // yayınlamak aktif kariyer sitesi ister; FK için gerekmez
        insertApplication(WITH_ENTRIES, """
                [{"title": "A", "startDate": "Eyl 2022", "endDate": "Devam ediyor"},
                 {"title": "B", "startDate": "09/2022", "endDate": "2024-03"},
                 {"title": "C", "startDate": "2016 güz", "endDate": "2019"},
                 {"title": "D", "startDate": "2019", "endDate": "Devam"}]""",
                """
                [{"school": "X", "startYear": "2012", "endYear": "Devam ediyor"},
                 {"school": "Y", "startYear": "2008", "endYear": "2012"}]""");
        insertApplication(EMPTY_ENTRIES, "[]", "[]");
        insertApplication(ROLLBACK_ROW, """
                [{"title": "A", "startDate": "Eyl 2022", "endDate": "Devam ediyor"}]""", "[]");

        // 3) V21'i koş.
        Flyway.configure().dataSource(ds).load().migrate();
    }

    @Test
    void parseable_dates_are_normalized_and_order_is_preserved() throws SQLException {
        assertEquals("4", scalar("SELECT jsonb_array_length(experience_entries)::text"
                + " FROM ats_application WHERE public_ref = '" + WITH_ENTRIES + "'"),
                "girdi sayısı değişmemeli");
        assertEquals(List.of("A", "B", "C", "D"),
                List.of(dbValue(WITH_ENTRIES, "experience_entries", 0, "title"),
                        dbValue(WITH_ENTRIES, "experience_entries", 1, "title"),
                        dbValue(WITH_ENTRIES, "experience_entries", 2, "title"),
                        dbValue(WITH_ENTRIES, "experience_entries", 3, "title")),
                "girdi SIRASI adayın beyanıdır, korunmalı");

        assertEquals("2022-09", dbValue(WITH_ENTRIES, "experience_entries", 0, "startDate"),
                "Eyl 2022 -> 2022-09");
        assertEquals("2022-09", dbValue(WITH_ENTRIES, "experience_entries", 1, "startDate"),
                "09/2022 -> 2022-09");
        assertEquals("2024-03", dbValue(WITH_ENTRIES, "experience_entries", 1, "endDate"),
                "kanonik değer olduğu gibi kalır");
        assertEquals("2019", dbValue(WITH_ENTRIES, "experience_entries", 3, "startDate"),
                "yıl hassasiyeti korunur");
    }

    @Test
    void ongoing_marker_becomes_a_first_class_flag_not_an_unparsed_value() throws SQLException {
        // Ham JSONB: bayrak boolean (dize değil), bitiş alanı YOK.
        assertEquals("true", dbFlag(WITH_ENTRIES, "experience_entries", 0),
                "'Devam ediyor' süregelenlik bayrağına taşınmalı");
        assertNull(dbValue(WITH_ENTRIES, "experience_entries", 0, "endDate"),
                "süregelenlik tarih alanında kalmamalı");
        assertEquals("true", dbFlag(WITH_ENTRIES, "experience_entries", 3),
                "'Devam' de aynı anlamı taşır");
        assertNull(dbFlag(WITH_ENTRIES, "experience_entries", 1),
                "gerçek bitiş tarihi olan girdi süregelen DEĞİL");
        assertNull(dbFlag(WITH_ENTRIES, "experience_entries", 2),
                "çevrilemeyen değer süregelenlik sayılmaz");

        assertEquals("true", dbFlag(WITH_ENTRIES, "education_entries", 0), "öğrenim de sürebilir");
        assertNull(dbValue(WITH_ENTRIES, "education_entries", 0, "endYear"));
        assertNull(dbFlag(WITH_ENTRIES, "education_entries", 1));
        assertEquals("2012", dbValue(WITH_ENTRIES, "education_entries", 1, "endYear"),
                "biten öğrenim yılı korunur");

        // Bayrak okuma yolundan da geçmeli: entryFields yalnız dizeleri toplar,
        // boolean ayrı okunmazsa süregelenlik SESSİZCE düşer.
        List<ExperienceEntry> viaStore = experienceViaStore(WITH_ENTRIES);
        assertTrue(viaStore.get(0).ongoing(), "okuma yolu bayrağı taşımalı");
        assertFalse(viaStore.get(1).ongoing());
        List<EducationEntry> educationViaStore = educationViaStore(WITH_ENTRIES);
        assertTrue(educationViaStore.get(0).ongoing(), "eğitim tarafında da taşınmalı");
    }

    @Test
    void unparseable_value_is_preserved_raw_never_blanked() throws SQLException {
        // #218 dersi: bilinmeyen, boş değildir. Şekli zaten "hesaplanamaz" der.
        assertEquals(LEGACY_UNPARSED, dbValue(WITH_ENTRIES, "experience_entries", 2, "startDate"),
                "çevrilemeyen değer sessizce boşaltılmamalı");
    }

    @Test
    void sql_migration_and_java_normalizer_agree_on_the_seeded_vocabulary() throws SQLException {
        // V21 sözlüğü tarihsel bir snapshot; Java sözlüğüyle bu küme üzerinde
        // ayrışırsa aynı CV içe aktarımda ve göçte FARKLI yorumlanır.
        assertEquals(ResumeDateNormalizer.normalize(LEGACY_MONTH_NAME).value(),
                dbValue(WITH_ENTRIES, "experience_entries", 0, "startDate"),
                "SQL ve Java: " + LEGACY_MONTH_NAME);
        assertEquals(ResumeDateNormalizer.normalize(LEGACY_NUMERIC).value(),
                dbValue(WITH_ENTRIES, "experience_entries", 1, "startDate"),
                "SQL ve Java: " + LEGACY_NUMERIC);
        assertEquals(ResumeDateNormalizer.normalize(LEGACY_UNPARSED).value(),
                dbValue(WITH_ENTRIES, "experience_entries", 2, "startDate"),
                "SQL ve Java: " + LEGACY_UNPARSED);
        assertTrue(ResumeDateNormalizer.ongoingMarker(LEGACY_ONGOING_LONG)
                        && ResumeDateNormalizer.ongoingMarker(LEGACY_ONGOING_SHORT),
                "Java tarafı da bu iki değeri süregelenlik saymalı");
    }

    @Test
    void pre_image_lives_in_the_row_itself_and_only_for_changed_values() throws SQLException {
        // Ayrı bir yedek TABLOSU bilinçli olarak yok: ikinci bir aday-verisi kopyası
        // silme yüzeyini büyütür ve #230'un "göç koşucusu tablo sahibi olmamalı"
        // değişmezini bozar. Ham değer, erasure'ın zaten kapsadığı satırın içinde.
        assertEquals(LEGACY_MONTH_NAME,
                dbValue(WITH_ENTRIES, "experience_entries", 0, "startDateLegacy"),
                "değişen değerin ham hâli aynı girdide durmalı");
        assertEquals(LEGACY_ONGOING_LONG,
                dbValue(WITH_ENTRIES, "experience_entries", 0, "endDateLegacy"),
                "süregelenlik işaretinin ham metni de korunmalı");
        assertEquals(LEGACY_NUMERIC,
                dbValue(WITH_ENTRIES, "experience_entries", 1, "startDateLegacy"));

        assertNull(dbValue(WITH_ENTRIES, "experience_entries", 1, "endDateLegacy"),
                "DEĞİŞMEYEN kanonik değer için kopya yazılmamalı");
        assertNull(dbValue(WITH_ENTRIES, "experience_entries", 2, "startDateLegacy"),
                "çevrilemeyen değer değişmedi; kopyası da olmamalı");
        assertNull(dbValue(WITH_ENTRIES, "experience_entries", 3, "startDateLegacy"),
                "zaten kanonik yıl için kopya yok");

        // Geri alma gerçekten çalışıyor mu — tek UPDATE ile ham hâle dönüş.
        assertEquals("2022-09", dbValue(ROLLBACK_ROW, "experience_entries", 0, "startDate"),
                "geri alma satırı da normalize edilmiş olmalı");
        exec("UPDATE ats_application a SET experience_entries = r.entries FROM ("
                + " SELECT x.public_ref, jsonb_agg("
                + "   CASE WHEN e.val ? 'startDateLegacy'"
                + "        THEN jsonb_set(e.val - 'startDateLegacy', '{startDate}',"
                + "                       e.val -> 'startDateLegacy')"
                + "        ELSE e.val END ORDER BY e.ord) AS entries"
                + " FROM ats_application x,"
                + "      jsonb_array_elements(x.experience_entries) WITH ORDINALITY e(val, ord)"
                + " WHERE x.public_ref = '" + ROLLBACK_ROW + "' GROUP BY x.public_ref) r"
                + " WHERE a.public_ref = r.public_ref");
        assertEquals(LEGACY_MONTH_NAME,
                dbValue(ROLLBACK_ROW, "experience_entries", 0, "startDate"),
                "geri alma ham değeri gerçekten geri koymalı");
    }

    /**
     * DB'deki HAM değeri okur. Kasıtlı olarak {@code Pg.experienceEntriesFromJson}
     * KULLANILMAZ: o yol record kurucusundan geçer ve tarihi kendisi normalize
     * eder — testi oradan okumak, göç hiç çalışmasa bile yeşil verirdi (ölçüm
     * aracının ölçtüğü şeyi düzeltmesi). Göç kanıtı ham JSONB olmalıdır.
     */
    private static String dbValue(String publicRef, String column, int index, String key)
            throws SQLException {
        return scalar("SELECT " + column + " -> " + index + " ->> '" + key + "'"
                + " FROM ats_application WHERE public_ref = '" + publicRef + "'");
    }

    private static String dbFlag(String publicRef, String column, int index) throws SQLException {
        return scalar("SELECT (" + column + " -> " + index + " -> 'ongoing')::text"
                + " FROM ats_application WHERE public_ref = '" + publicRef + "'");
    }

    private static List<ExperienceEntry> experienceViaStore(String publicRef) throws SQLException {
        return Pg.experienceEntriesFromJson(rawJson(publicRef, "experience_entries"));
    }

    private static List<EducationEntry> educationViaStore(String publicRef) throws SQLException {
        return Pg.educationEntriesFromJson(rawJson(publicRef, "education_entries"));
    }

    private static String rawJson(String publicRef, String column) throws SQLException {
        return scalar("SELECT " + column + "::text FROM ats_application WHERE public_ref = '"
                + publicRef + "'");
    }

    private static void insertApplication(String publicRef, String experience, String education)
            throws SQLException {
        // Erişim digest'i başvuruya özgü (unique) VE hex olmalı (CHECK): sabit bir
        // digest'i iki satırda kullanmak da, hex olmayan bir harf de fixture'ı kırar.
        String digest = HEX_DIGESTS[seeded++];
        exec("INSERT INTO ats_application (tenant_id, application_id, public_ref, job_id,"
                + " full_name, status, candidate_access_digest, notice_version,"
                + " notice_accepted_at, accuracy_confirmed_at, created_at, updated_at,"
                + " experience_entries, education_entries) VALUES ('" + TENANT + "',"
                + " gen_random_uuid(), '" + publicRef + "', '" + JOB + "', 'Sentetik Aday',"
                + " 'SUBMITTED', '" + digest + "', 'v1', now(), now(), now(), now(),"
                + " '" + experience + "'::jsonb, '" + education + "'::jsonb)");
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
