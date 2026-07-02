package com.ats.persistence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.contracts.EvidenceLedger.EvidenceEvent;
import com.ats.contracts.EvidenceLedger.LedgerEntry;
import com.ats.contracts.EvidenceLedger.LedgerListFilter;
import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.JsonValue;
import com.ats.kernel.Outcome;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;
import java.util.Map;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.postgresql.ds.PGSimpleDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * GERÇEK PostgreSQL 16 (Testcontainers) davranış testleri — ADR-0018 "8a-invariant seti".
 * Mock/H2 DEĞİL: jsonb + trigger + advisory-lock PG-özgü. "Prod'da çalışıyor" iddiası değildir.
 */
@Testcontainers
class PostgresEvidenceLedgerTest {

    @Container
    private static final PostgreSQLContainer<?> PG = new PostgreSQLContainer<>("postgres:16-alpine");

    private static PGSimpleDataSource dataSource;

    private static final TenantId T1 = new TenantId("t1");
    private static final TenantId T2 = new TenantId("t2");
    private static final ActorId A1 = new ActorId("actor-opaque-1");
    private static final InterviewId I1 = new InterviewId("i1");

    private PostgresEvidenceLedger ledger;
    private static int idem = 0;

    @BeforeAll
    static void migrate() {
        dataSource = new PGSimpleDataSource();
        dataSource.setUrl(PG.getJdbcUrl());
        dataSource.setUser(PG.getUsername());
        dataSource.setPassword(PG.getPassword());
        Flyway.configure().dataSource(dataSource).load().migrate();
    }

    @BeforeEach
    void setUp() {
        ledger = new PostgresEvidenceLedger(dataSource);
    }

    private EvidenceEvent event(TenantId tenant, String idempotencyKey) {
        return new EvidenceEvent(tenant, A1, I1, "transcript.created", "2026-07-02T15:00:00Z",
                idempotencyKey, "c".repeat(64),
                JsonValue.object(Map.of(
                        "transcript_key", JsonValue.of("i1.tr-1"),
                        "segment_count", JsonValue.of(3.0))));
    }

    private String nextIdem() {
        return "idem-" + (++idem);
    }

    @Test
    void append_builds_per_tenant_hash_chain_and_verify_passes() {
        // izole tenant: container test-metotları arasında paylaşılır, zincir varsayımı taze tenant ister
        TenantId chainTenant = new TenantId("chain-tenant");
        LedgerEntry e1 = ledger.append(event(chainTenant, nextIdem())).asOptional().orElseThrow();
        LedgerEntry e2 = ledger.append(event(chainTenant, nextIdem())).asOptional().orElseThrow();
        assertEquals(PostgresEvidenceLedger.GENESIS, e1.previousHash(), "ilk tenant girdisi genesis'ten zincirlenir");
        assertEquals(e1.entryHash(), e2.previousHash(), "zincir: e2.prev = e1.entry");
        assertTrue(e2.sequence() > e1.sequence());
        assertTrue(ledger.verifyChain(chainTenant).isOk(), "zincir yeniden-hesapla doğrulanmalı");
        assertTrue(ledger.verifyChain(T1).isOk(), "diğer testlerin kirlettiği tenant'ta da zincir tutarlı");
    }

    @Test
    void idempotent_replay_returns_same_entry_without_new_row() {
        String key = nextIdem();
        LedgerEntry first = ledger.append(event(T1, key)).asOptional().orElseThrow();
        LedgerEntry replay = ledger.append(event(T1, key)).asOptional().orElseThrow();
        assertEquals(first.evidenceId().value(), replay.evidenceId().value(), "idempotent replay AYNI entry");
        assertEquals(first.sequence(), replay.sequence());
    }

    @Test
    void idempotency_conflict_with_different_content_fail_closed() {
        String key = nextIdem();
        ledger.append(event(T1, key)).asOptional().orElseThrow();
        // aynı (tenant,key) + FARKLI payload/contentHash → eski satır "OK" diye DÖNEMEZ (Codex blocker-1)
        EvidenceEvent different = new EvidenceEvent(T1, A1, I1, "transcript.created", "2026-07-02T15:00:00Z",
                key, "d".repeat(64), JsonValue.object(Map.of("baska", JsonValue.of("icerik"))));
        Outcome<LedgerEntry> out = ledger.append(different);
        assertFalse(out.isOk(), "idempotency conflict fail-closed olmalı");
        EvidenceEvent differentType = new EvidenceEvent(T1, A1, I1, "claim.citation.recorded", "2026-07-02T15:00:00Z",
                key, "c".repeat(64), JsonValue.object(Map.of(
                        "transcript_key", JsonValue.of("i1.tr-1"),
                        "segment_count", JsonValue.of(3.0))));
        assertFalse(ledger.append(differentType).isOk(), "farklı event_type da conflict");
    }

    @Test
    void tombstone_same_reason_replay_ok_different_reason_conflict() {
        LedgerEntry target = ledger.append(event(T1, nextIdem())).asOptional().orElseThrow();
        LedgerEntry first = ledger.appendTombstoneEvent(T1, A1, I1, target.evidenceId(), "erasure_request")
                .asOptional().orElseThrow();
        LedgerEntry replay = ledger.appendTombstoneEvent(T1, A1, I1, target.evidenceId(), "erasure_request")
                .asOptional().orElseThrow();
        assertEquals(first.evidenceId().value(), replay.evidenceId().value(),
                "aynı reason replay idempotent (occurred_at kimlik dışı — belgelendi)");
        Outcome<LedgerEntry> conflicting = ledger.appendTombstoneEvent(T1, A1, I1, target.evidenceId(), "baska_sebep");
        assertFalse(conflicting.isOk(),
                "hedef başına TEK tombstone: farklı reason sessiz-OK DEĞİL, conflict fail (Codex blocker-2)");
    }

    @Test
    void idempotency_is_tenant_scoped_not_global() {
        String shared = "shared-" + nextIdem();
        LedgerEntry t1 = ledger.append(event(T1, shared)).asOptional().orElseThrow();
        LedgerEntry t2 = ledger.append(event(T2, shared)).asOptional().orElseThrow();
        assertNotEquals(t1.evidenceId().value(), t2.evidenceId().value(),
                "aynı idempotency-key farklı tenant'ta AYRI entry (cross-tenant denial YASAK)");
    }

    @Test
    void get_by_id_is_tenant_isolated() {
        LedgerEntry e1 = ledger.append(event(T1, nextIdem())).asOptional().orElseThrow();
        assertTrue(ledger.getById(T1, e1.evidenceId()).isOk());
        assertFalse(ledger.getById(T2, e1.evidenceId()).isOk(), "cross-tenant getById NOT_FOUND olmalı");
    }

    @Test
    void list_filters_by_interview_and_event_type() {
        ledger.append(event(T1, nextIdem())).asOptional().orElseThrow();
        List<LedgerEntry> byType = ledger.list(T1, new LedgerListFilter(I1, "transcript.created"))
                .asOptional().orElseThrow();
        assertTrue(byType.stream().allMatch(x -> x.eventType().equals("transcript.created")));
        assertTrue(ledger.list(T1, new LedgerListFilter(new InterviewId("baska"), null))
                .asOptional().orElseThrow().isEmpty());
    }

    @Test
    void tombstone_appends_pointer_only_row_and_requires_existing_target() {
        LedgerEntry target = ledger.append(event(T1, nextIdem())).asOptional().orElseThrow();
        LedgerEntry tomb = ledger.appendTombstoneEvent(T1, A1, I1, target.evidenceId(), "erasure_request")
                .asOptional().orElseThrow();
        assertEquals(PostgresEvidenceLedger.TOMBSTONE_EVENT_TYPE, tomb.eventType());
        String flat = tomb.payload().values().toString();
        assertTrue(flat.contains(target.evidenceId().value()) && flat.contains("erasure_request"));
        // hedef satır DEĞİŞMEDİ
        assertTrue(ledger.getById(T1, target.evidenceId()).isOk());
        // olmayan hedef → NOT_FOUND
        assertFalse(ledger.appendTombstoneEvent(T1, A1, I1, new com.ats.kernel.Ids.EvidenceId("ev-yok"), "x").isOk());
        // cross-tenant hedef → NOT_FOUND
        assertFalse(ledger.appendTombstoneEvent(T2, A1, I1, target.evidenceId(), "x").isOk());
    }

    @Test
    void update_delete_truncate_rejected_by_db_trigger() throws SQLException {
        ledger.append(event(T1, nextIdem())).asOptional().orElseThrow();
        try (Connection c = dataSource.getConnection(); Statement st = c.createStatement()) {
            assertThrows(SQLException.class,
                    () -> st.execute("UPDATE worm_ledger SET event_type='hacked' WHERE tenant_id='t1'"),
                    "UPDATE trigger'la reddedilmeli (superuser dahil)");
            assertThrows(SQLException.class,
                    () -> st.execute("DELETE FROM worm_ledger WHERE tenant_id='t1'"),
                    "DELETE trigger'la reddedilmeli");
            assertThrows(SQLException.class,
                    () -> st.execute("TRUNCATE worm_ledger"),
                    "TRUNCATE trigger'la reddedilmeli");
        }
    }

    @Test
    void app_role_has_no_update_delete_privilege() throws SQLException {
        try (Connection c = dataSource.getConnection(); Statement st = c.createStatement()) {
            st.execute("SET ROLE ats_app");
            // INSERT/SELECT grant'li; UPDATE hem privilege hem trigger düzleminde kapalı
            assertThrows(SQLException.class,
                    () -> st.execute("UPDATE worm_ledger SET event_type='x'"));
            st.execute("RESET ROLE");
        }
    }

    @Test
    void non_finite_json_number_returns_outcome_fail_not_runtime_exception() {
        EvidenceEvent nan = new EvidenceEvent(T1, A1, I1, "transcript.created", "2026-07-02T15:00:00Z",
                nextIdem(), "c".repeat(64),
                JsonValue.object(Map.of("n", JsonValue.of(Double.NaN))));
        org.junit.jupiter.api.Assertions.assertDoesNotThrow(() -> {
            Outcome<LedgerEntry> out = ledger.append(nan);
            assertFalse(out.isOk(), "NaN payload Outcome.fail olmalı — exception Outcome çizgisini delemez");
        });
    }

    @Test
    void forbidden_payload_keys_rejected_before_insert() {
        EvidenceEvent bad = new EvidenceEvent(T1, A1, I1, "transcript.created", "2026-07-02T15:00:00Z",
                nextIdem(), "c".repeat(64),
                JsonValue.object(Map.of("claim_text", JsonValue.of("aday hakkında içerik"))));
        Outcome<LedgerEntry> out = ledger.append(bad);
        assertFalse(out.isOk(), "WORM-içerik-yasağı: content/raw-pii/secret sınıfı anahtar payload'a giremez");
    }

    @Test
    void tampering_detected_by_verify_chain() throws SQLException {
        // ayrı tenant'ta izole zincir kur, trigger'ı geçici disable ederek (superuser test-only) boz
        TenantId tv = new TenantId("tamper-tenant");
        ledger.append(new EvidenceEvent(tv, A1, I1, "transcript.created", "2026-07-02T15:00:00Z",
                nextIdem(), "c".repeat(64),
                JsonValue.object(Map.of("k", JsonValue.of("v"))))).asOptional().orElseThrow();
        try (Connection c = dataSource.getConnection(); Statement st = c.createStatement()) {
            st.execute("ALTER TABLE worm_ledger DISABLE TRIGGER worm_ledger_no_update_delete");
            st.execute("UPDATE worm_ledger SET content_hash = repeat('d', 64) WHERE tenant_id = 'tamper-tenant'");
            st.execute("ALTER TABLE worm_ledger ENABLE TRIGGER worm_ledger_no_update_delete");
        }
        assertFalse(ledger.verifyChain(tv).isOk(), "kurcalama zincir doğrulamasında yakalanmalı");
    }

    @Test
    void blank_fields_rejected() {
        assertFalse(ledger.append(new EvidenceEvent(T1, A1, I1, " ", "t", "k", "h",
                JsonValue.object(Map.of()))).isOk());
        assertFalse(ledger.appendTombstoneEvent(T1, A1, I1,
                new com.ats.kernel.Ids.EvidenceId("ev-x"), " ").isOk());
    }
}
