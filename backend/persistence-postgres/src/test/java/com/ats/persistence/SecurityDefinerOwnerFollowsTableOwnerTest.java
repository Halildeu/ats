package com.ats.persistence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.postgresql.ds.PGSimpleDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * V22: SECURITY DEFINER fonksiyonlarının sahibi tablo sahibini takip eder.
 *
 * <p>Canlı arıza (2026-07-30, k3d-test): içerik yazma yolu {@code 42501
 * insufficient_privilege} ile düşüyordu. Zincir: V14 tetikleyicileri SECURITY
 * DEFINER'dır ve {@code interview_content_gate}'e dokunur; canlıda tanımlayıcı
 * {@code ats_app}'ti ve tabloya erişimini SAHİPLİK üzerinden alıyordu; V20
 * (#230) tabloların sahipliğini devrederken FONKSİYONLARA dokunmadı →
 * tanımlayıcı erişimini kaybetti.
 *
 * <p>Yanlış çözüm ({@code ats_app}'e gate yetkisi vermek) mevcut bir değişmezi
 * bozuyordu: uygulama rolü gate tablosunu doğrudan değiştirememeli
 * ({@code PostgresErasureScopeResolverTest}). Doğru çözüm tanımlayıcıyı tablo
 * sahibine hizalamaktır.
 */
@Testcontainers
class SecurityDefinerOwnerFollowsTableOwnerTest {

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
    void every_security_definer_function_is_owned_by_the_table_owner() throws SQLException {
        assertEquals("", scalar(
                "SELECT coalesce(string_agg(p.proname || ':' || pg_get_userbyid(p.proowner),"
                + " ', ' ORDER BY p.proname), '')"
                + " FROM pg_catalog.pg_proc p"
                + " JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace"
                + " WHERE n.nspname='public' AND p.prosecdef"
                + " AND pg_get_userbyid(p.proowner) <> 'ats_migrator'"),
                "tanımlayıcı ile tablo sahibi ayrışırsa çağrı 42501 ile düşer");
    }

    @Test
    void the_definer_can_actually_reach_the_gate_table() throws SQLException {
        // Asıl arızanın ölçümü: tanımlayıcının gate tablosuna erişimi.
        assertEquals("true|true|true", scalar(
                "SELECT has_table_privilege('ats_migrator','interview_content_gate','SELECT')::text"
                + " || '|' || has_table_privilege('ats_migrator','interview_content_gate','INSERT')::text"
                + " || '|' || has_table_privilege('ats_migrator','interview_content_gate','UPDATE')::text"),
                "SECURITY DEFINER tanımlayıcısı gate satırını okuyup yazabilmeli");
    }

    @Test
    void the_application_role_still_cannot_touch_the_gate_directly() throws SQLException {
        // V22 güvenlik sınırını GEVŞETMEMELİ: mühürleme yalnız dar fonksiyondan.
        assertEquals("false|false|false", scalar(
                "SELECT has_table_privilege('ats_app','interview_content_gate','SELECT')::text"
                + " || '|' || has_table_privilege('ats_app','interview_content_gate','INSERT')::text"
                + " || '|' || has_table_privilege('ats_app','interview_content_gate','UPDATE')::text"),
                "uygulama rolü gate tablosuna doğrudan erişememeli");
        assertTrue(Boolean.parseBoolean(scalar(
                "SELECT has_function_privilege('ats_app',"
                + " 'ats_seal_interview_for_erasure(text,text,text)','EXECUTE')::text")),
                "dar seal yüzeyinin EXECUTE grant'ı sahiplik değişiminden etkilenmemeli");
    }

    private static String scalar(String sql) throws SQLException {
        try (Connection c = ds.getConnection(); Statement s = c.createStatement();
                ResultSet rs = s.executeQuery(sql)) {
            return rs.next() ? rs.getString(1) : null;
        }
    }
}
