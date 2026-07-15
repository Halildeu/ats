package com.ats.persistence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.contracts.EvidenceLedger.LedgerEntry;
import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.JsonCodec;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import com.ats.screening.Coverage;
import com.ats.screening.FindingSetRef;
import com.ats.screening.ProtectedAttributeScreener;
import com.ats.screening.ProtectedCategory;
import com.ats.screening.ScreeningDisposition;
import com.ats.screening.ScreeningEvidenceStore;
import com.ats.screening.ScreeningEvidenceStore.PurgeCommand;
import com.ats.screening.ScreeningEvidenceStore.PurgeReason;
import com.ats.screening.ScreeningEvidenceStore.IdempotentSaveResult;
import com.ats.screening.ScreeningEvidenceStore.RequestBinding;
import com.ats.screening.ScreeningEvidenceStore.RequestReplay;
import com.ats.screening.ScreeningEvidenceStore.SaveCommand;
import com.ats.screening.ScreeningEvidenceStore.SaveReceipt;
import com.ats.screening.ScreeningEvidenceStore.StoredEvidence;
import com.ats.screening.ScreeningFinding;
import com.ats.screening.ScreeningPolicyRef;
import com.ats.screening.ScreeningResult;
import com.ats.screening.ScreeningRunId;
import com.ats.screening.ScreeningSignal;
import com.ats.screening.ScreeningSourceKind;
import com.ats.screening.TextSpan;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.HexFormat;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.postgresql.ds.PGSimpleDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/** Gerçek PostgreSQL 16 kabul testleri: atomiklik, idempotency, tenant ve veri-sınırı. */
@Testcontainers
class PostgresScreeningEvidenceStoreTest {

    @Container
    private static final PostgreSQLContainer<?> PG = new PostgreSQLContainer<>("postgres:16-alpine");

    private static PGSimpleDataSource dataSource;
    private PostgresScreeningEvidenceStore store;
    private PostgresEvidenceLedger ledger;
    private static int seq;

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
        store = new PostgresScreeningEvidenceStore(dataSource);
        ledger = new PostgresEvidenceLedger(dataSource);
    }

    @Test
    void save_round_trips_utf16_findings_and_pointer_only_worm_receipt() {
        TenantId tenant = tenant();
        ScreeningFinding finding = new ScreeningFinding(
                ProtectedCategory.AGE,
                ScreeningSignal.QUESTION_LIKE_PROTECTED_MENTION,
                ScreeningSourceKind.TRANSCRIPT_SEGMENT,
                new TextSpan(2, 8, 7)); // "😀 kaç": Java UTF-16 code-unit ofsetleri
        SaveCommand command = command(tenant, result(1, Coverage.SUPPORTED, List.of(finding)),
                ScreeningSourceKind.TRANSCRIPT_SEGMENT);

        SaveReceipt receipt = store.save(command).asOptional().orElseThrow();
        StoredEvidence stored = store.get(tenant, command.result().findingSetRef())
                .asOptional().orElseThrow();
        assertEquals(ScreeningDisposition.REVIEW_REQUIRED, receipt.disposition());
        assertEquals(List.of(finding), stored.findings());
        assertEquals(2, stored.findings().getFirst().span().startInclusive());
        assertEquals(8, stored.findings().getFirst().span().endExclusive());
        assertEquals(7, stored.findings().getFirst().span().segmentIndex());

        LedgerEntry worm = ledger.getById(tenant, receipt.evidenceId()).asOptional().orElseThrow();
        assertEquals(PostgresScreeningEvidenceStore.RECORDED_EVENT_TYPE, worm.eventType());
        assertEquals(Set.of(
                "schema_version", "finding_set_ref", "screening_run_id", "policy_ref",
                "coverage", "disposition", "source_kind", "restricted_store_version"),
                worm.payload().values().keySet());
        String flat = JsonCodec.canonical(worm.payload());
        assertFalse(flat.contains("AGE"));
        assertFalse(flat.contains("span"));
        assertFalse(flat.contains("finding_count"));
        assertEquals(sha256Hex(flat), worm.contentHash(),
                "contentHash yalnız pointer-only kanonik envelope hash'i olmalı");
    }

    @Test
    void exact_replay_returns_same_receipt_but_changed_findings_conflict() throws SQLException {
        TenantId tenant = tenant();
        ScreeningFinding age = finding(ProtectedCategory.AGE, 1, 4);
        ScreeningResult original = result(2, Coverage.SUPPORTED, List.of(age));
        SaveCommand firstCommand = command(tenant, original, ScreeningSourceKind.FREE_TEXT);
        SaveReceipt first = store.save(firstCommand).asOptional().orElseThrow();
        SaveReceipt replay = store.save(firstCommand).asOptional().orElseThrow();
        assertEquals(first, replay);
        assertEquals(1, count("worm_ledger", tenant));
        assertEquals(1, count("protected_screening_evidence", tenant));

        ScreeningResult changed = new ScreeningResult(
                original.runId(), original.policyRef(), original.coverage(),
                List.of(finding(ProtectedCategory.RELIGION_BELIEF, 1, 4)), original.findingSetRef());
        Outcome<SaveReceipt> conflict = store.save(command(
                tenant, changed, ScreeningSourceKind.FREE_TEXT));
        assertFalse(conflict.isOk());
        assertEquals(OutcomeCode.INVALID, ((Outcome.Fail<SaveReceipt>) conflict).code());
        assertEquals(List.of(age), store.get(tenant, original.findingSetRef())
                .asOptional().orElseThrow().findings());
    }

    @Test
    void concurrent_exact_replays_serialize_under_tenant_lock_and_return_same_receipt() throws Exception {
        TenantId tenant = tenant();
        SaveCommand command = command(
                tenant,
                result(22, Coverage.SUPPORTED, List.of(finding(ProtectedCategory.AGE, 1, 5))),
                ScreeningSourceKind.FREE_TEXT);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            java.util.concurrent.Callable<SaveReceipt> call = () -> {
                ready.countDown();
                start.await();
                return store.save(command).asOptional().orElseThrow();
            };
            Future<SaveReceipt> a = pool.submit(call);
            Future<SaveReceipt> b = pool.submit(call);
            ready.await();
            start.countDown();
            assertEquals(a.get(), b.get());
        }
        assertEquals(1, count("worm_ledger", tenant));
        assertEquals(1, count("protected_screening_evidence", tenant));
    }

    @Test
    void runtime_idempotency_replays_original_and_conflicts_on_different_canonical_source() {
        TenantId tenant = tenant();
        ScreeningFinding finding = new ScreeningFinding(
                ProtectedCategory.AGE,
                ScreeningSignal.QUESTION_LIKE_PROTECTED_MENTION,
                ScreeningSourceKind.TRANSCRIPT_SEGMENT,
                new TextSpan(1, 5, 3));
        SaveCommand firstCommand = command(
                tenant, result(40, Coverage.SUPPORTED, List.of(finding)),
                ScreeningSourceKind.TRANSCRIPT_SEGMENT);
        RequestBinding binding = new RequestBinding(
                requestKey(40), ScreeningSourceKind.TRANSCRIPT_SEGMENT,
                "interview-shared/tr-canonical-40", 3);

        IdempotentSaveResult first = requireOk(store.saveIdempotent(firstCommand, binding));
        assertFalse(first.replayed());

        // Replay komutunun random run/ref'i farklı olsa dahi request sentinel original fact'i döndürür.
        ScreeningFinding laterFinding = new ScreeningFinding(
                ProtectedCategory.RELIGION_BELIEF,
                ScreeningSignal.PROTECTED_ATTRIBUTE_MENTION,
                ScreeningSourceKind.TRANSCRIPT_SEGMENT,
                new TextSpan(2, 8, 3));
        SaveCommand retryCommand = command(
                tenant, result(41, Coverage.SUPPORTED, List.of(laterFinding)),
                ScreeningSourceKind.TRANSCRIPT_SEGMENT);
        IdempotentSaveResult replay = requireOk(store.saveIdempotent(retryCommand, binding));
        assertTrue(replay.replayed());
        assertEquals(first.receipt(), replay.receipt());
        assertEquals(List.of(finding), replay.evidence().findings());

        RequestReplay lookedUp = store.findRequest(
                tenant, firstCommand.interviewId(), binding).asOptional().orElseThrow();
        assertEquals(first.receipt().findingSetRef(), lookedUp.evidence().findingSetRef());
        assertEquals(binding, lookedUp.binding());
        RequestReplay bound = store.getBoundEvidence(
                tenant, firstCommand.interviewId(), first.receipt().findingSetRef())
                .asOptional().orElseThrow();
        assertEquals(binding, bound.binding());

        Outcome<IdempotentSaveResult> conflict = store.saveIdempotent(
                retryCommand, new RequestBinding(
                        requestKey(40), ScreeningSourceKind.TRANSCRIPT_SEGMENT,
                        "interview-shared/tr-other", 3));
        assertFalse(conflict.isOk());
        assertEquals(OutcomeCode.CONFLICT,
                ((Outcome.Fail<IdempotentSaveResult>) conflict).code());
        assertEquals(1, countUnchecked("worm_ledger", tenant));
        assertEquals(1, countUnchecked("protected_screening_evidence", tenant));
    }

    @Test
    void concurrent_runtime_first_writer_produces_exactly_one_worm_fact_and_one_aggregate()
            throws Exception {
        TenantId tenant = tenant();
        RequestBinding binding = new RequestBinding(
                requestKey(60), ScreeningSourceKind.TRANSCRIPT_SEGMENT,
                "interview-shared/tr-concurrent-60", 0);
        int callers = 8;
        CountDownLatch ready = new CountDownLatch(callers);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<IdempotentSaveResult>> futures = new ArrayList<>();
        try (var pool = Executors.newFixedThreadPool(callers)) {
            for (int i = 0; i < callers; i++) {
                final int seed = 60 + i;
                futures.add(pool.submit(() -> {
                    ready.countDown();
                    start.await();
                    ScreeningFinding finding = new ScreeningFinding(
                            ProtectedCategory.AGE,
                            ScreeningSignal.QUESTION_LIKE_PROTECTED_MENTION,
                            ScreeningSourceKind.TRANSCRIPT_SEGMENT,
                            new TextSpan(0, 4, 0));
                    return requireOk(store.saveIdempotent(
                            command(tenant, result(seed, Coverage.SUPPORTED, List.of(finding)),
                                    ScreeningSourceKind.TRANSCRIPT_SEGMENT),
                            binding));
                }));
            }
            ready.await();
            start.countDown();

            int fresh = 0;
            Set<FindingSetRef> refs = new HashSet<>();
            Set<String> evidenceIds = new HashSet<>();
            for (Future<IdempotentSaveResult> future : futures) {
                IdempotentSaveResult value = future.get();
                if (!value.replayed()) {
                    fresh++;
                }
                refs.add(value.receipt().findingSetRef());
                evidenceIds.add(value.receipt().evidenceId().value());
            }
            assertEquals(1, fresh, "yalnız request advisory-lock ilk yazarı fresh olabilir");
            assertEquals(1, refs.size());
            assertEquals(1, evidenceIds.size());
        }
        assertEquals(1, count("worm_ledger", tenant));
        assertEquals(1, count("protected_screening_evidence", tenant));
        assertEquals(1, count("protected_screening_request", tenant));
        assertEquals(1, count("protected_screening_source_binding", tenant));
    }

    @Test
    void purge_removes_source_binding_but_keeps_terminal_request_sentinel_no_resurrection()
            throws SQLException {
        TenantId tenant = tenant();
        Outcome<ScreeningEvidenceStore.PurgeTargetState> neverExisted = store.inspectPurgeTarget(
                tenant, new InterviewId("interview-shared"), ref(999));
        assertFalse(neverExisted.isOk());
        assertEquals(OutcomeCode.NOT_FOUND,
                ((Outcome.Fail<ScreeningEvidenceStore.PurgeTargetState>) neverExisted).code());

        ScreeningFinding finding = new ScreeningFinding(
                ProtectedCategory.HEALTH_DISABILITY,
                ScreeningSignal.PROTECTED_ATTRIBUTE_MENTION,
                ScreeningSourceKind.TRANSCRIPT_SEGMENT,
                new TextSpan(0, 7, 0));
        SaveCommand command = command(
                tenant, result(42, Coverage.SUPPORTED, List.of(finding)),
                ScreeningSourceKind.TRANSCRIPT_SEGMENT);
        RequestBinding binding = new RequestBinding(
                requestKey(42), ScreeningSourceKind.TRANSCRIPT_SEGMENT,
                "interview-shared/tr-canonical-42", 0);
        IdempotentSaveResult saved = requireOk(store.saveIdempotent(command, binding));
        assertEquals(ScreeningEvidenceStore.PurgeTargetState.ACTIVE,
                store.inspectPurgeTarget(tenant, command.interviewId(),
                        saved.receipt().findingSetRef()).asOptional().orElseThrow());

        store.purge(purgeCommand(
                tenant, saved.receipt().findingSetRef(), PurgeReason.DATA_SUBJECT_ERASURE))
                .asOptional().orElseThrow();
        assertEquals(1, count("protected_screening_request", tenant));
        assertEquals(0, count("protected_screening_source_binding", tenant));
        assertEquals(1, count("protected_screening_request_purge", tenant));
        assertEquals(ScreeningEvidenceStore.PurgeTargetState.PURGED,
                store.inspectPurgeTarget(tenant, command.interviewId(),
                        saved.receipt().findingSetRef()).asOptional().orElseThrow());
        assertFalse(store.getBoundEvidence(
                tenant, command.interviewId(), saved.receipt().findingSetRef()).isOk());

        Outcome<RequestReplay> lookup = store.findRequest(tenant, command.interviewId(), binding);
        assertFalse(lookup.isOk());
        assertEquals(OutcomeCode.CONFLICT, ((Outcome.Fail<RequestReplay>) lookup).code());

        SaveCommand retry = command(
                tenant, result(43, Coverage.SUPPORTED, List.of(finding)),
                ScreeningSourceKind.TRANSCRIPT_SEGMENT);
        Outcome<IdempotentSaveResult> resurrect = store.saveIdempotent(retry, binding);
        assertFalse(resurrect.isOk());
        assertEquals(OutcomeCode.CONFLICT,
                ((Outcome.Fail<IdempotentSaveResult>) resurrect).code());
        assertEquals(0, count("protected_screening_evidence", tenant));
    }

    @Test
    void composite_fk_rejects_cross_interview_source_binding() throws SQLException {
        TenantId tenant = tenant();
        ScreeningFinding finding = new ScreeningFinding(
                ProtectedCategory.AGE,
                ScreeningSignal.PROTECTED_ATTRIBUTE_MENTION,
                ScreeningSourceKind.TRANSCRIPT_SEGMENT,
                new TextSpan(0, 2, 0));
        SaveCommand command = command(
                tenant, result(44, Coverage.SUPPORTED, List.of(finding)),
                ScreeningSourceKind.TRANSCRIPT_SEGMENT);
        SaveReceipt saved = store.save(command).asOptional().orElseThrow();

        try (Connection c = dataSource.getConnection()) {
            try (PreparedStatement sentinel = c.prepareStatement(
                    "INSERT INTO protected_screening_request"
                            + " (tenant_id, interview_id, idempotency_key, finding_set_ref)"
                            + " VALUES (?,?,?,?)")) {
                sentinel.setString(1, tenant.value());
                sentinel.setString(2, "interview-other");
                sentinel.setString(3, requestKey(44));
                sentinel.setString(4, saved.findingSetRef().value());
                sentinel.executeUpdate();
            }
            try (PreparedStatement binding = c.prepareStatement(
                    "INSERT INTO protected_screening_source_binding"
                            + " (tenant_id, interview_id, idempotency_key, finding_set_ref,"
                            + " source_kind, canonical_source_ref, segment_index)"
                            + " VALUES (?,?,?,?,?,?,?)")) {
                binding.setString(1, tenant.value());
                binding.setString(2, "interview-other");
                binding.setString(3, requestKey(44));
                binding.setString(4, saved.findingSetRef().value());
                binding.setString(5, "TRANSCRIPT_SEGMENT");
                binding.setString(6, "interview-other/tr-cross");
                binding.setInt(7, 0);
                boolean rejected = false;
                try {
                    binding.executeUpdate();
                } catch (SQLException expected) {
                    rejected = true;
                }
                assertTrue(rejected, "composite FK cross-interview evidence bağını reddetmeli");
            }
        }
    }

    @Test
    void same_run_with_different_policy_or_finding_ref_is_conflict_and_rolls_back() throws SQLException {
        TenantId tenant = tenant();
        ScreeningResult original = result(3, Coverage.SUPPORTED, List.of());
        store.save(command(tenant, original, ScreeningSourceKind.FREE_TEXT))
                .asOptional().orElseThrow();

        ScreeningResult policyChanged = new ScreeningResult(
                original.runId(), new ScreeningPolicyRef("paspolicy_v2"), Coverage.SUPPORTED,
                List.of(), original.findingSetRef());
        assertFalse(store.save(command(tenant, policyChanged, ScreeningSourceKind.FREE_TEXT)).isOk());

        ScreeningResult refChanged = new ScreeningResult(
                original.runId(), original.policyRef(), Coverage.SUPPORTED, List.of(), ref(33));
        assertFalse(store.save(command(tenant, refChanged, ScreeningSourceKind.FREE_TEXT)).isOk());
        assertEquals(1, count("worm_ledger", tenant));
        assertEquals(1, count("protected_screening_evidence", tenant));
    }

    @Test
    void restricted_insert_failure_rolls_back_new_worm_row_atomically() throws SQLException {
        TenantId tenant = tenant();
        try (Connection c = dataSource.getConnection(); Statement st = c.createStatement()) {
            st.execute("CREATE OR REPLACE FUNCTION reject_screening_insert() RETURNS trigger AS $$"
                    + " BEGIN RAISE EXCEPTION 'forced restricted failure'; END; $$ LANGUAGE plpgsql");
            st.execute("CREATE TRIGGER reject_screening_insert BEFORE INSERT ON protected_screening_evidence"
                    + " FOR EACH ROW EXECUTE FUNCTION reject_screening_insert()");
        }
        Outcome<SaveReceipt> out;
        try {
            out = store.save(command(tenant, result(4, Coverage.SUPPORTED, List.of()),
                    ScreeningSourceKind.FREE_TEXT));
        } finally {
            try (Connection c = dataSource.getConnection(); Statement st = c.createStatement()) {
                st.execute("DROP TRIGGER reject_screening_insert ON protected_screening_evidence");
                st.execute("DROP FUNCTION reject_screening_insert()");
            }
        }
        assertFalse(out.isOk());
        assertEquals(0, count("worm_ledger", tenant));
        assertEquals(0, count("protected_screening_evidence", tenant));
    }

    @Test
    void coverage_states_never_silently_green() {
        for (Coverage coverage : Coverage.values()) {
            TenantId tenant = tenant();
            ScreeningResult result = result(10 + coverage.ordinal(), coverage, List.of());
            SaveReceipt receipt = store.save(command(
                    tenant, result, ScreeningSourceKind.FREE_TEXT)).asOptional().orElseThrow();
            ScreeningDisposition expected = coverage == Coverage.SUPPORTED
                    ? ScreeningDisposition.CLEAR : ScreeningDisposition.SCREENING_UNAVAILABLE;
            assertEquals(expected, receipt.disposition());
            assertEquals(coverage == Coverage.SUPPORTED,
                    receipt.disposition().permitsCleanScreeningAssertion());
        }
    }

    @Test
    void tenant_scope_blocks_cross_tenant_reads_and_same_input_gets_independent_refs() {
        TenantId a = tenant();
        TenantId b = tenant();
        ProtectedAttributeScreener screener = ProtectedAttributeScreener.fromClasspath(
                "screening/protected-attribute-screening-policy.v1.json");
        ScreeningResult ra = screener.screen("Kaç yaşındasınız?", ScreeningSourceKind.FREE_TEXT, "tr");
        ScreeningResult rb = screener.screen("Kaç yaşındasınız?", ScreeningSourceKind.FREE_TEXT, "tr");
        assertNotEquals(ra.runId(), rb.runId());
        assertNotEquals(ra.findingSetRef(), rb.findingSetRef());
        store.save(command(a, ra, ScreeningSourceKind.FREE_TEXT)).asOptional().orElseThrow();
        store.save(command(b, rb, ScreeningSourceKind.FREE_TEXT)).asOptional().orElseThrow();
        assertFalse(store.get(b, ra.findingSetRef()).isOk());
        assertFalse(store.get(a, rb.findingSetRef()).isOk());
    }

    @Test
    void purge_and_tombstone_are_atomic_immutable_and_idempotent() {
        TenantId tenant = tenant();
        ScreeningResult result = result(20, Coverage.SUPPORTED,
                List.of(finding(ProtectedCategory.PREGNANCY_MATERNITY, 5, 12)));
        SaveReceipt saved = store.save(command(tenant, result, ScreeningSourceKind.FREE_TEXT))
                .asOptional().orElseThrow();
        PurgeCommand purge = purgeCommand(tenant, result.findingSetRef(), PurgeReason.DATA_SUBJECT_ERASURE);
        var first = store.purge(purge).asOptional().orElseThrow();
        var replay = store.purge(purge).asOptional().orElseThrow();
        assertFalse(first.replayed());
        assertTrue(replay.replayed());
        assertEquals(first.findingSetRef(), replay.findingSetRef());
        assertEquals(first.tombstoneEvidenceId(), replay.tombstoneEvidenceId());
        assertFalse(store.get(tenant, result.findingSetRef()).isOk());
        assertTrue(ledger.getById(tenant, saved.evidenceId()).isOk(), "orijinal WORM receipt değişmez");
        assertTrue(ledger.findTombstoneForEvidence(tenant, saved.evidenceId()).isOk());
        assertTrue(ledger.verifyChain(tenant).isOk());
    }

    @Test
    void forced_restricted_delete_failure_rolls_back_tombstone() throws SQLException {
        TenantId tenant = tenant();
        ScreeningResult result = result(21, Coverage.SUPPORTED,
                List.of(finding(ProtectedCategory.HEALTH_DISABILITY, 2, 9)));
        SaveReceipt saved = store.save(command(tenant, result, ScreeningSourceKind.FREE_TEXT))
                .asOptional().orElseThrow();
        try (Connection c = dataSource.getConnection(); Statement st = c.createStatement()) {
            st.execute("CREATE OR REPLACE FUNCTION reject_screening_delete() RETURNS trigger AS $$"
                    + " BEGIN RAISE EXCEPTION 'forced restricted delete failure'; END; $$ LANGUAGE plpgsql");
            st.execute("CREATE TRIGGER reject_screening_delete BEFORE DELETE ON protected_screening_evidence"
                    + " FOR EACH ROW EXECUTE FUNCTION reject_screening_delete()");
        }
        Outcome<?> out;
        try {
            out = store.purge(purgeCommand(
                    tenant, result.findingSetRef(), PurgeReason.ADMIN_CORRECTION));
        } finally {
            try (Connection c = dataSource.getConnection(); Statement st = c.createStatement()) {
                st.execute("DROP TRIGGER reject_screening_delete ON protected_screening_evidence");
                st.execute("DROP FUNCTION reject_screening_delete()");
            }
        }
        assertFalse(out.isOk());
        assertTrue(store.get(tenant, result.findingSetRef()).isOk());
        assertFalse(ledger.findTombstoneForEvidence(tenant, saved.evidenceId()).isOk());
        assertTrue(ledger.verifyChain(tenant).isOk());
    }

    @Test
    void schema_has_no_raw_text_or_derived_hash_columns_and_app_role_cannot_update() throws SQLException {
        try (Connection c = dataSource.getConnection(); PreparedStatement ps = c.prepareStatement(
                "SELECT column_name FROM information_schema.columns"
                        + " WHERE table_name IN ('protected_screening_evidence','protected_screening_finding')")) {
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    String column = rs.getString(1);
                    assertFalse(column.contains("text") || column.contains("content")
                                    || column.contains("matched") || column.contains("normalized")
                                    || column.contains("hash"),
                            "restricted schema yasak içerik/hash kolonu taşıyamaz: " + column);
                }
            }
        }
        try (Connection c = dataSource.getConnection(); Statement st = c.createStatement()) {
            st.execute("SET ROLE ats_app");
            assertFalse(hasTablePrivilege(st, "protected_screening_evidence", "UPDATE"));
            assertTrue(hasTablePrivilege(st, "protected_screening_evidence", "DELETE"));
            assertFalse(hasTablePrivilege(st, "protected_screening_finding", "DELETE"));
            assertFalse(hasTablePrivilege(st, "worm_ledger", "DELETE"));
            assertFalse(hasTablePrivilege(st, "protected_screening_request", "UPDATE"));
            assertFalse(hasTablePrivilege(st, "protected_screening_request", "DELETE"));
            assertFalse(hasTablePrivilege(st, "protected_screening_source_binding", "DELETE"));
            assertFalse(hasTablePrivilege(st, "protected_screening_request_purge", "UPDATE"));
            assertFalse(hasTablePrivilege(st, "protected_screening_request_purge", "DELETE"));
            st.execute("RESET ROLE");
        }
    }

    @Test
    void db_constraint_rejects_non_allowlisted_screening_worm_payload() {
        TenantId tenant = tenant();
        var bad = new com.ats.contracts.EvidenceLedger.EvidenceEvent(
                tenant, new ActorId("actor-bad"), new InterviewId("interview-shared"),
                PostgresScreeningEvidenceStore.RECORDED_EVENT_TYPE, "2026-07-15T08:00:00Z",
                "bad-screening-envelope", "a".repeat(64),
                com.ats.kernel.JsonValue.object(Map.of(
                        "category_code", com.ats.kernel.JsonValue.of("RELIGION_BELIEF"))));
        assertFalse(ledger.append(bad).isOk(),
                "event-type özel DB CHECK kategori/span/raw alan kaçışını reddetmeli");
    }

    private static boolean hasTablePrivilege(Statement st, String table, String privilege) throws SQLException {
        try (ResultSet rs = st.executeQuery("SELECT has_table_privilege(current_user, '" + table + "', '"
                + privilege + "')")) {
            rs.next();
            return rs.getBoolean(1);
        }
    }

    private static SaveCommand command(
            TenantId tenant, ScreeningResult result, ScreeningSourceKind sourceKind) {
        return new SaveCommand(
                tenant, new ActorId("actor-" + tenant.value()), new InterviewId("interview-shared"),
                result, sourceKind, "2026-07-15T08:00:00Z");
    }

    private static PurgeCommand purgeCommand(
            TenantId tenant, FindingSetRef ref, PurgeReason reason) {
        return new PurgeCommand(
                tenant, new ActorId("actor-" + tenant.value()), new InterviewId("interview-shared"),
                ref, reason, "2026-07-15T08:05:00Z");
    }

    private static ScreeningResult result(int seed, Coverage coverage, List<ScreeningFinding> findings) {
        return new ScreeningResult(
                run(seed),
                new ScreeningPolicyRef(coverage == Coverage.POLICY_UNAVAILABLE ? "paspolicy_v0" : "paspolicy_v1"),
                coverage, findings, ref(seed));
    }

    private static ScreeningRunId run(int seed) {
        return new ScreeningRunId("psr_00000000-0000-4000-8000-" + String.format("%012d", seed));
    }

    private static FindingSetRef ref(int seed) {
        return new FindingSetRef("fsr_" + String.format("%064x", seed));
    }

    private static String requestKey(int seed) {
        return "scrq_00000000-0000-4000-8000-" + String.format("%012x", seed);
    }

    private static ScreeningFinding finding(ProtectedCategory category, int start, int end) {
        return new ScreeningFinding(
                category, ScreeningSignal.PROTECTED_ATTRIBUTE_MENTION,
                ScreeningSourceKind.FREE_TEXT, TextSpan.of(start, end));
    }

    private static TenantId tenant() {
        return new TenantId("screening-test-" + (++seq));
    }

    private static <T> T requireOk(Outcome<T> outcome) {
        if (outcome instanceof Outcome.Ok<T> ok) {
            return ok.value();
        }
        Outcome.Fail<T> fail = (Outcome.Fail<T>) outcome;
        throw new AssertionError("Outcome başarısız: " + fail.code() + " / " + fail.reason());
    }

    private static int count(String table, TenantId tenant) throws SQLException {
        try (Connection c = dataSource.getConnection(); PreparedStatement ps = c.prepareStatement(
                "SELECT count(*) FROM " + table + " WHERE tenant_id = ?")) {
            ps.setString(1, tenant.value());
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                return rs.getInt(1);
            }
        }
    }

    private static int countUnchecked(String table, TenantId tenant) {
        try {
            return count(table, tenant);
        } catch (SQLException ex) {
            throw new IllegalStateException(ex);
        }
    }

    private static String sha256Hex(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException ex) {
            throw new IllegalStateException(ex);
        }
    }
}
