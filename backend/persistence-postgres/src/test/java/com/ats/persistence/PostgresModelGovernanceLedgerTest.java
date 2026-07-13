package com.ats.persistence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.contracts.governance.ApprovalStatus;
import com.ats.contracts.governance.Capability;
import com.ats.contracts.governance.GovernanceActorRef;
import com.ats.contracts.governance.ModelApprovalRef;
import com.ats.contracts.governance.ModelGovernanceLedger.AppendCommand;
import com.ats.contracts.governance.ModelGovernanceTransition;
import com.ats.contracts.governance.ModelGovernanceTransitionHashChain;
import com.ats.contracts.governance.TransitionId;
import com.ats.contracts.governance.TransitionReason;
import com.ats.governance.ModelGovernanceStatusProjection;
import com.ats.governance.ModelGovernanceStatusProjection.IntegrityIssue;
import com.ats.governance.ModelGovernanceStatusProjection.ProjectionOutcome;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.postgresql.ds.PGSimpleDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * gov1-1e-b — GERÇEK PostgreSQL 16 (Testcontainers) davranış kabul-matrisi: GLOBAL model-governance WORM
 * ({@link PostgresModelGovernanceLedger}). Mock/H2 DEĞİL: advisory-lock + trigger + timestamptz + CHECK
 * PG-özgü. "Prod'da çalışıyor" iddiası değildir (davranış-kanıt).
 *
 * <p><b>İzolasyon:</b> zincir GLOBAL (tenant-scope YOK) → paylaşılan container'da her test-metodu KENDİ
 * şemasında koşar (V1..V4 taze migrate). Böylece yıkıcı testler (tamper, DROP, ham role INSERT) diğer
 * testlerin GLOBAL zincirini kirletmez ve kesin zincir-uzunluğu assert'lenebilir.
 */
@Testcontainers
class PostgresModelGovernanceLedgerTest {

    @Container
    private static final PostgreSQLContainer<?> PG = new PostgreSQLContainer<>("postgres:16-alpine");

    private static int schemaCounter = 0;

    private String schema;
    private PGSimpleDataSource dataSource;
    private MutableClock clock;
    private PostgresModelGovernanceLedger ledger;

    private static final GovernanceActorRef ADMIN = new GovernanceActorRef("admin.owner-1");
    private static final String GENESIS = ModelGovernanceTransitionHashChain.GENESIS_PREVIOUS_HASH;

    @BeforeEach
    void setUp() throws SQLException {
        schema = "gov_" + (schemaCounter++);
        PGSimpleDataSource bootstrap = newDataSource(null);
        try (Connection c = bootstrap.getConnection(); Statement st = c.createStatement()) {
            st.execute("CREATE SCHEMA IF NOT EXISTS " + schema);
        }
        dataSource = newDataSource(schema);
        Flyway.configure().dataSource(dataSource)
                .schemas(schema).defaultSchema(schema)
                .locations("classpath:db/migration")
                .load().migrate();
        // occurred_at MICROS round-trip'i sınamak için başlangıç mikrosaniyeli (.123456Z).
        clock = new MutableClock(Instant.parse("2026-07-13T09:00:00.123456Z"));
        ledger = new PostgresModelGovernanceLedger(dataSource, clock);
    }

    private PGSimpleDataSource newDataSource(String currentSchema) {
        PGSimpleDataSource ds = new PGSimpleDataSource();
        ds.setUrl(PG.getJdbcUrl());
        ds.setUser(PG.getUsername());
        ds.setPassword(PG.getPassword());
        if (currentSchema != null) {
            ds.setCurrentSchema(currentSchema);
        }
        return ds;
    }

    // ---------- happy-path zincir + projeksiyon ----------

    @Test
    void approve_revoke_reapprove_chain_projects_to_approved() {
        ModelApprovalRef ref = ref(1);
        ModelGovernanceTransition t0 = appendOk(cmd(ref, Capability.TRANSCRIBE,
                ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED, TransitionReason.INITIAL_APPROVAL));
        clock.advance(Duration.ofSeconds(1));
        ModelGovernanceTransition t1 = appendOk(cmd(ref, Capability.TRANSCRIBE,
                ApprovalStatus.APPROVED, ApprovalStatus.REVOKED, TransitionReason.REVOKED_BY_OWNER));
        clock.advance(Duration.ofNanos(1_234_567_000)); // mikrosaniyeli ilerlet (round-trip sınaması)
        ModelGovernanceTransition t2 = appendOk(cmd(ref, Capability.TRANSCRIBE,
                ApprovalStatus.REVOKED, ApprovalStatus.APPROVED, TransitionReason.REAPPROVED));

        // GLOBAL sequence 0-tabanlı boşluksuz + genesis-zincir bağı.
        assertEquals(0L, t0.sequence());
        assertEquals(1L, t1.sequence());
        assertEquals(2L, t2.sequence());
        assertEquals(GENESIS, t0.previousHash(), "ilk satır genesis'ten zincirlenir");
        assertEquals(t0.entryHash(), t1.previousHash(), "zincir: t1.prev == t0.entry");
        assertEquals(t1.entryHash(), t2.previousHash(), "zincir: t2.prev == t1.entry");

        // READ → projeksiyon: DB'den okunan satırlarla tam yeniden-hesap (occurred_at round-trip DAHİL).
        ProjectionOutcome po = project();
        assertTrue(po.chainIntact(), "DB'den okunan zincir bütünlüğü (occurred_at timestamptz round-trip hash'i bozmamalı)");
        assertTrue(po.issues().isEmpty(), "temiz WORM: bütünlük-bulgusu yok");
        assertTrue(po.isAuthoritativelyApproved(ref, Capability.TRANSCRIBE),
                "son GEÇERLİ durum APPROVED + authoritative");
        assertEquals(ApprovalStatus.APPROVED, po.currentStatusOf(ref, Capability.TRANSCRIBE));
    }

    @Test
    void empty_ledger_reads_ok_empty_list_legit_uninitialized() {
        Outcome<List<ModelGovernanceTransition>> out = ledger.readAll();
        assertTrue(out.isOk(), "boş tablo okuma erişilebilir (Fail DEĞİL)");
        assertTrue(out.asOptional().orElseThrow().isEmpty(), "boş → Ok(emptyList) = legit UNINITIALIZED");
        assertFalse(project().isAuthoritativelyApproved(ref(9), Capability.CITE),
                "hiç transition yok → APPROVED türetilmez (fail-closed)");
    }

    // ---------- CAS / idempotency / matris redleri ----------

    @Test
    void stale_expected_from_is_rejected() {
        ModelApprovalRef ref = ref(2);
        appendOk(cmd(ref, Capability.CITE, ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED,
                TransitionReason.INITIAL_APPROVAL)); // özne artık APPROVED
        // caller hâlâ UNINITIALIZED beklerse (stale) → optimistic-concurrency conflict, INSERT YOK.
        Outcome<ModelGovernanceTransition> stale = ledger.append(cmd(ref, Capability.CITE,
                ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED, TransitionReason.INITIAL_APPROVAL));
        assertReject(stale, "STALE_EXPECTED_FROM");
        assertEquals(1, project().currentStatus().size(), "reddedilen append satır eklememeli (tek özne)");
    }

    @Test
    void identical_replay_is_idempotent_no_second_row() {
        ModelApprovalRef ref = ref(3);
        AppendCommand command = cmd(ref, Capability.TRANSCRIBE, ApprovalStatus.UNINITIALIZED,
                ApprovalStatus.APPROVED, TransitionReason.INITIAL_APPROVAL);
        ModelGovernanceTransition first = appendOk(command);
        clock.advance(Duration.ofSeconds(5)); // saat ilerlese de idempotent replay ORİJİNAL satırı döner
        ModelGovernanceTransition replay = appendOk(command); // AYNI transitionId + AYNI içerik
        assertEquals(first.sequence(), replay.sequence(), "idempotent replay AYNI sequence");
        assertEquals(first.entryHash(), replay.entryHash(), "idempotent replay AYNI entryHash (çift-yazım YOK)");
        assertEquals(first.occurredAt(), replay.occurredAt(), "replay orijinal occurred_at'ı korur");
        assertEquals(1, readAll().size(), "ikinci satır YAZILMAMALI");
    }

    @Test
    void conflicting_replay_same_id_different_content_is_conflict() {
        ModelApprovalRef ref = ref(4);
        TransitionId sharedId = TransitionId.random();
        appendOk(new AppendCommand(ref, Capability.TRANSCRIBE, ApprovalStatus.UNINITIALIZED,
                ApprovalStatus.APPROVED, ADMIN, TransitionReason.INITIAL_APPROVAL, sharedId));
        // AYNI transitionId, FARKLI içerik (toStatus/reason) → conflict, mevcut satır "OK" diye DÖNMEZ.
        Outcome<ModelGovernanceTransition> conflict = ledger.append(new AppendCommand(ref, Capability.TRANSCRIBE,
                ApprovalStatus.UNINITIALIZED, ApprovalStatus.DRAFT, ADMIN, TransitionReason.DRAFTED, sharedId));
        assertReject(conflict, "TRANSITION_ID_CONFLICT");
        assertEquals(1, readAll().size(), "çakışan replay satır eklememeli");
    }

    @Test
    void illegal_transition_reason_inconsistent_is_rejected() {
        ModelApprovalRef ref = ref(5);
        appendOk(cmd(ref, Capability.CITE, ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED,
                TransitionReason.INITIAL_APPROVAL)); // APPROVED
        // matris-izinli (APPROVED→REVOKED) ama YANLIŞ gerekçe (DRAFTED = UNINIT→DRAFT) → gerekçe-tutarsız red.
        Outcome<ModelGovernanceTransition> illegal = ledger.append(cmd(ref, Capability.CITE,
                ApprovalStatus.APPROVED, ApprovalStatus.REVOKED, TransitionReason.DRAFTED));
        assertReject(illegal, "ILLEGAL_TRANSITION");
        assertEquals(ApprovalStatus.APPROVED, project().currentStatusOf(ref, Capability.CITE),
                "illegal append durumu ilerletmemeli");
    }

    @Test
    void null_command_is_invalid() {
        assertReject(ledger.append(null), "INVALID_COMMAND");
    }

    // ---------- concurrency (advisory-lock GLOBAL serialize) ----------

    @Test
    void concurrent_appends_distinct_subjects_form_gapless_global_chain() throws Exception {
        int n = 8;
        List<Callable<Outcome<ModelGovernanceTransition>>> tasks = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            AppendCommand command = cmd(ref(100 + i), Capability.TRANSCRIBE,
                    ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED, TransitionReason.INITIAL_APPROVAL);
            tasks.add(() -> ledger.append(command));
        }
        List<Outcome<ModelGovernanceTransition>> results = runConcurrent(tasks);
        assertTrue(results.stream().allMatch(Outcome::isOk), "farklı özneler eşzamanlı append hepsi OK");

        List<ModelGovernanceTransition> all = readAll(); // sequence ASC
        assertEquals(n, all.size());
        for (int i = 0; i < n; i++) {
            assertEquals(i, all.get(i).sequence(), "GLOBAL sequence boşluksuz 0..n-1 (advisory-lock serialize)");
        }
        ProjectionOutcome po = project();
        assertTrue(po.chainIntact(), "eşzamanlı append sonrası GLOBAL zincir bütünlüğü");
        assertEquals(n, po.currentStatus().size(), "her özne bir kez APPROVED");
    }

    @Test
    void concurrent_same_subject_race_exactly_one_wins_other_stale() throws Exception {
        ModelApprovalRef ref = ref(6);
        // İki farklı transitionId, AYNI özne, ikisi de UNINITIALIZED→APPROVED bekliyor.
        AppendCommand a = cmd(ref, Capability.CITE, ApprovalStatus.UNINITIALIZED,
                ApprovalStatus.APPROVED, TransitionReason.INITIAL_APPROVAL);
        AppendCommand b = cmd(ref, Capability.CITE, ApprovalStatus.UNINITIALIZED,
                ApprovalStatus.APPROVED, TransitionReason.INITIAL_APPROVAL);
        List<Outcome<ModelGovernanceTransition>> results = runConcurrent(List.of(
                () -> ledger.append(a), () -> ledger.append(b)));

        long ok = results.stream().filter(Outcome::isOk).count();
        long stale = results.stream()
                .filter(r -> r instanceof Outcome.Fail<ModelGovernanceTransition> f
                        && "STALE_EXPECTED_FROM".equals(f.reason()))
                .count();
        assertEquals(1, ok, "aynı özne yarışında tam olarak biri kazanır");
        assertEquals(1, stale, "kaybeden STALE_EXPECTED_FROM (advisory-lock CAS serialize)");
        assertEquals(1, readAll().size(), "yalnız bir satır yazılır");
    }

    // ---------- WORM makine-zorlaması (trigger + tamper) ----------

    @Test
    void update_delete_truncate_rejected_by_db_trigger() throws SQLException {
        appendOk(cmd(ref(7), Capability.TRANSCRIBE, ApprovalStatus.UNINITIALIZED,
                ApprovalStatus.APPROVED, TransitionReason.INITIAL_APPROVAL));
        try (Connection c = dataSource.getConnection(); Statement st = c.createStatement()) {
            assertThrows(SQLException.class,
                    () -> st.execute("UPDATE model_governance_ledger SET to_status='DRAFT'"),
                    "UPDATE trigger'la reddedilmeli (superuser dahil)");
            assertThrows(SQLException.class,
                    () -> st.execute("DELETE FROM model_governance_ledger"),
                    "DELETE trigger'la reddedilmeli");
            assertThrows(SQLException.class,
                    () -> st.execute("TRUNCATE model_governance_ledger"),
                    "TRUNCATE trigger'la reddedilmeli");
        }
    }

    @Test
    void tampered_entry_hash_makes_projection_chain_not_intact() throws SQLException {
        ModelApprovalRef ref = ref(8);
        appendOk(cmd(ref, Capability.TRANSCRIBE, ApprovalStatus.UNINITIALIZED,
                ApprovalStatus.APPROVED, TransitionReason.INITIAL_APPROVAL));
        // Trigger'ı geçici disable ederek (superuser test-only) son satırın entry_hash'ini boz.
        try (Connection c = dataSource.getConnection(); Statement st = c.createStatement()) {
            st.execute("ALTER TABLE model_governance_ledger DISABLE TRIGGER model_governance_ledger_no_update_delete");
            st.execute("UPDATE model_governance_ledger SET entry_hash = repeat('a', 64) WHERE sequence = 0");
            st.execute("ALTER TABLE model_governance_ledger ENABLE TRIGGER model_governance_ledger_no_update_delete");
        }
        // readAll hâlâ Ok (geçerli 64-hex format), ama projeksiyon recompute ≠ saklanan → tamper görünür.
        ProjectionOutcome po = project();
        assertFalse(po.chainIntact(), "kurcalanmış entry_hash zincir-bütünlüğünü bozmalı");
        assertTrue(po.issues().stream().anyMatch(i -> i.kind() == IntegrityIssue.Kind.ENTRY_HASH_MISMATCH),
                "tamper ENTRY_HASH_MISMATCH bulgusu üretmeli");
        assertFalse(po.isAuthoritativelyApproved(ref, Capability.TRANSCRIBE),
                "kurcalanmış WORM asla authoritative-APPROVED üretmez (fail-closed)");
    }

    @Test
    void read_all_fails_closed_when_table_unavailable() throws SQLException {
        // DROP DDL trigger'a takılmaz (trigger UPDATE/DELETE/TRUNCATE); okuma erişilemez → NOT_CONFIGURED.
        try (Connection c = dataSource.getConnection(); Statement st = c.createStatement()) {
            st.execute("DROP TABLE model_governance_ledger");
        }
        Outcome<List<ModelGovernanceTransition>> out = ledger.readAll();
        assertInstanceOf(Outcome.Fail.class, out, "tablo yoksa readAll fail-closed (Ok(null)/null DEĞİL)");
        assertEquals(OutcomeCode.NOT_CONFIGURED, ((Outcome.Fail<List<ModelGovernanceTransition>>) out).code());
    }

    // ---------- rol ayrımı (runtime SELECT-only / writer INSERT+SELECT, no UPDATE/DELETE) ----------

    @Test
    void runtime_role_ats_app_is_select_only() throws SQLException {
        appendOk(cmd(ref(10), Capability.TRANSCRIBE, ApprovalStatus.UNINITIALIZED,
                ApprovalStatus.APPROVED, TransitionReason.INITIAL_APPROVAL));
        try (Connection c = dataSource.getConnection(); Statement st = c.createStatement()) {
            // Şema USAGE ortogonal deploy-düzlemi işi; burada yalnız TABLO-düzeyi privilege sınanır.
            st.execute("GRANT USAGE ON SCHEMA " + schema + " TO ats_app");
            st.execute("SET ROLE ats_app");
            assertThrows(SQLException.class, () -> st.execute(rawInsertSql(1)),
                    "runtime-rol INSERT reddedilmeli (SELECT-only)");
            st.execute("RESET ROLE");
            st.execute("SET ROLE ats_app");
            // SELECT grant'ı VAR — okuma başarılı olmalı (pozitif kanıt).
            st.executeQuery("SELECT count(*) FROM model_governance_ledger").close();
            st.execute("RESET ROLE");
        }
    }

    @Test
    void writer_role_can_insert_but_not_update_or_delete() throws SQLException {
        try (Connection c = dataSource.getConnection(); Statement st = c.createStatement()) {
            st.execute("GRANT USAGE ON SCHEMA " + schema + " TO ats_governance_writer");
            st.execute("SET ROLE ats_governance_writer");
            // writer INSERT+SELECT yetkili → ham genesis-şekilli satır INSERT başarılı (pozitif kanıt).
            st.execute(rawInsertSql(0));
            // ama UPDATE/DELETE yetkisi YOK (append-only) → reddedilmeli.
            assertThrows(SQLException.class, () -> st.execute("UPDATE model_governance_ledger SET to_status='DRAFT'"),
                    "writer-rol UPDATE reddedilmeli");
            assertThrows(SQLException.class, () -> st.execute("DELETE FROM model_governance_ledger"),
                    "writer-rol DELETE reddedilmeli");
            st.execute("RESET ROLE");
        }
    }

    // ---------- admin-writer append-path (explicit authority) ----------

    @Test
    void admin_appender_writes_through_explicit_authority() {
        ModelGovernanceAdminAppender admin = ModelGovernanceAdminAppender.overPostgres(dataSource, clock);
        Outcome<ModelGovernanceTransition> out = admin.appendTransition(cmd(ref(11), Capability.CITE,
                ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED, TransitionReason.INITIAL_APPROVAL));
        assertTrue(out.isOk(), "admin-appender writer-cephesi üzerinden append edebilmeli");
        // Reader tarafı (aynı adapter, ayrı yüzey) yazılan satırı görmeli.
        assertTrue(project().isAuthoritativelyApproved(ref(11), Capability.CITE),
                "admin-yazılan transition Reader/projeksiyonda APPROVED görünür");
        // fail-closed kurallar admin cephesinde de geçerli (stale reddi delege edilir).
        assertReject(admin.appendTransition(cmd(ref(11), Capability.CITE,
                ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED, TransitionReason.INITIAL_APPROVAL)),
                "STALE_EXPECTED_FROM");
    }

    // ---------- helpers ----------

    private ModelApprovalRef ref(int i) {
        return new ModelApprovalRef("mapr_" + String.format("%064x", (long) i));
    }

    private AppendCommand cmd(ModelApprovalRef ref, Capability cap, ApprovalStatus from,
            ApprovalStatus to, TransitionReason reason) {
        return new AppendCommand(ref, cap, from, to, ADMIN, reason, TransitionId.random());
    }

    private ModelGovernanceTransition appendOk(AppendCommand command) {
        return ledger.append(command).asOptional().orElseThrow(
                () -> new AssertionError("append OK bekleniyordu"));
    }

    private List<ModelGovernanceTransition> readAll() {
        return ledger.readAll().asOptional().orElseThrow();
    }

    private ProjectionOutcome project() {
        return ModelGovernanceStatusProjection.project(readAll());
    }

    private void assertReject(Outcome<ModelGovernanceTransition> out, String expectedReason) {
        Outcome.Fail<ModelGovernanceTransition> fail = assertInstanceOf(Outcome.Fail.class, out,
                "red bekleniyordu: " + expectedReason);
        assertEquals(expectedReason, fail.reason(), "tipli AppendRejection reason");
        assertEquals(OutcomeCode.INVALID, fail.code(), "AppendRejection kernel-code INVALID");
    }

    /** Ham (adapter bypass) INSERT — yalnız DB privilege/CHECK sınaması için (semantik hash doğruluğu değil). */
    private String rawInsertSql(long sequence) {
        return "INSERT INTO model_governance_ledger (sequence, transition_id, approval_ref, capability,"
                + " from_status, to_status, actor_ref, occurred_at, reason_code, previous_hash, entry_hash)"
                + " VALUES (" + sequence + ", 'mgt_raw-" + sequence + "', 'mapr_" + "0".repeat(64) + "',"
                + " 'TRANSCRIBE', 'UNINITIALIZED', 'APPROVED', 'raw-admin', now(), 'INITIAL_APPROVAL',"
                + " repeat('0', 64), repeat('a', 64))";
    }

    private <T> List<Outcome<T>> runConcurrent(List<Callable<Outcome<T>>> tasks) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(tasks.size());
        try {
            CountDownLatch ready = new CountDownLatch(tasks.size());
            CountDownLatch go = new CountDownLatch(1);
            List<Future<Outcome<T>>> futures = new ArrayList<>();
            for (Callable<Outcome<T>> task : tasks) {
                futures.add(pool.submit(() -> {
                    ready.countDown();
                    go.await();
                    return task.call();
                }));
            }
            assertTrue(ready.await(20, TimeUnit.SECONDS), "işçiler hazır olmalı");
            go.countDown(); // maksimum çekişme için hepsini aynı anda serbest bırak
            List<Outcome<T>> results = new ArrayList<>();
            for (Future<Outcome<T>> f : futures) {
                results.add(f.get(30, TimeUnit.SECONDS));
            }
            return results;
        } finally {
            pool.shutdownNow();
        }
    }

    /** occurred_at akışını sınamak için mutable injected Clock (Date.now/random değil). */
    private static final class MutableClock extends Clock {
        private Instant instant;

        private MutableClock(Instant start) {
            this.instant = start;
        }

        void advance(Duration duration) {
            this.instant = this.instant.plus(duration);
        }

        @Override
        public Instant instant() {
            return instant;
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }
    }
}
