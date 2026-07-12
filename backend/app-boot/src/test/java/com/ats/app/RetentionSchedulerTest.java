package com.ats.app;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Retention-scheduler'ın GERÇEK-PG doğrulaması: enabled=true + uzak-cron ile
 * bean kurulur; job ELLE tetiklenir (cron beklenmez) — 400-gün backdated
 * transcript SİLİNİR, taze olan ve LİSTEDE OLMAYAN tenant DOKUNULMAZ.
 */
@Testcontainers
@SpringBootTest(properties = {
        "ats.retention.enabled=true",
        "ats.retention.cron=0 0 5 31 12 ?", // uzak tarih: kendiliğinden tetiklenmez
        "ats.retention.days=30",
        "ats.retention.tenants=sched-tenant",
})
class RetentionSchedulerTest {

    @Container
    private static final PostgreSQLContainer<?> PG = new PostgreSQLContainer<>("postgres:16-alpine");

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) {
        registry.add("ats.db.url", PG::getJdbcUrl);
        registry.add("ats.db.username", PG::getUsername);
        registry.add("ats.db.password", PG::getPassword);
        registry.add("ats.ai.base-url", () -> "http://127.0.0.1:9");
        registry.add("ats.security.jwks-uri", () -> "http://127.0.0.1:9/jwks.json");
        registry.add("ats.security.issuer", () -> "https://issuer.test");
        registry.add("ats.security.audience", () -> "ats-api");
        // P3-gov0 (Codex REVISE): yaml default'u kaldırılan 3 güven girdisi — shipped kayıttan türet (drift-safe).
        AiGovernanceTestSupport.registerHttpJson(registry);
    }

    @Autowired private DataSource dataSource;
    @Autowired private RetentionScheduler.RetentionJob job;

    private void seed(String tenant, String key, String createdAt) throws Exception {
        try (Connection c = dataSource.getConnection(); PreparedStatement ps = c.prepareStatement(
                "INSERT INTO transcript (tenant_id, transcript_key, interview_id, source_object_key,"
                        + " language, segments, created_at) VALUES (?,?,?,?,?,?::jsonb,?::timestamptz)")) {
            ps.setString(1, tenant);
            ps.setString(2, key);
            ps.setString(3, "iv-s");
            ps.setString(4, "iv-s/rec-x");
            ps.setString(5, "tr-TR");
            ps.setString(6, "[]");
            ps.setString(7, createdAt);
            ps.executeUpdate();
        }
    }

    private int count(String tenant) throws Exception {
        try (Connection c = dataSource.getConnection(); PreparedStatement ps = c.prepareStatement(
                "SELECT count(*) FROM transcript WHERE tenant_id = ?")) {
            ps.setString(1, tenant);
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                return rs.getInt(1);
            }
        }
    }

    @Test
    void manual_run_purges_backdated_only_and_only_listed_tenants() throws Exception {
        seed("sched-tenant", "iv-s/tr-eski", "2020-01-01T00:00:00Z");
        seed("sched-tenant", "iv-s/tr-taze", java.time.Instant.now().toString());
        seed("baska-tenant", "iv-s/tr-eski2", "2020-01-01T00:00:00Z"); // listede YOK

        job.runPurge();

        assertEquals(1, count("sched-tenant"), "yalnız backdated silinmeli, taze kalmalı");
        assertEquals(1, count("baska-tenant"), "listede olmayan tenant'a DOKUNULMAZ");
        assertTrue(RetentionScheduler.SYSTEM_ACTOR.value().startsWith("system:"));
    }
}
