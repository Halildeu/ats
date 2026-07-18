package com.ats.persistence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.application.ResumeImportService.ImportState;
import com.ats.application.ResumeImportService.ProposalDraft;
import com.ats.application.ResumeImportService.ProposalState;
import com.ats.application.ResumeImportService.Provenance;
import com.ats.application.ResumeImportService.ResumeField;
import com.ats.application.ResumeImportStore.AttachCommand;
import com.ats.application.ResumeImportStore.AttachState;
import com.ats.application.ResumeImportStore.ConfirmCommand;
import com.ats.application.ResumeImportStore.ConfirmState;
import com.ats.application.ResumeImportStore.CreateCommand;
import com.ats.application.ResumeImportStore.CreateState;
import com.ats.application.ResumeImportStore.FieldCommand;
import com.ats.application.ResumeImportStore.FieldState;
import com.ats.application.ResumeImportStore.ReplaceCommand;
import com.ats.application.ResumeImportStore.ReplaceState;
import com.ats.application.ResumeImportStore.ReserveUploadCommand;
import com.ats.application.ResumeImportStore.ReserveUploadState;
import com.ats.application.ResumeImportStore.TerminateCommand;
import com.ats.application.ResumeImportStore.TerminateState;
import com.ats.kernel.Ids.TenantId;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.List;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.postgresql.ds.PGSimpleDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers
class PostgresResumeImportStoreTest {

    @Container
    private static final PostgreSQLContainer<?> PG = new PostgreSQLContainer<>("postgres:16-alpine");

    private static final TenantId TENANT =
            new TenantId("00000000-0000-0000-0000-000000000001");
    private static final String JOB = "job-product-manager";
    private static final String ACCESS = "a".repeat(64);
    private static final String NOW = "2026-07-18T12:00:00Z";
    private static PGSimpleDataSource ds;
    private static PostgresResumeImportStore store;

    @BeforeAll
    static void migrate() {
        ds = new PGSimpleDataSource();
        ds.setUrl(PG.getJdbcUrl());
        ds.setUser(PG.getUsername());
        ds.setPassword(PG.getPassword());
        Flyway.configure().dataSource(ds).load().migrate();
        store = new PostgresResumeImportStore(ds);
    }

    @Test
    void candidate_review_confirm_is_atomic_and_purges_transient_proposals() throws Exception {
        String importId = "ri_" + "A".repeat(24);
        var created = store.create(create(importId, ACCESS, "create-key-00000001", "1".repeat(64)))
                .asOptional().orElseThrow();
        assertEquals(CreateState.CREATED, created.state());
        assertEquals(0, created.resumeImport().version());

        var attached = reserveAndAttach(new AttachCommand(
                importId, ACCESS, 0, "upload-key-00000001", "2".repeat(64), 1,
                "parser-v1", 2, 0, "2026-07-18T12:01:00Z"), proposals());
        assertEquals(AttachState.ATTACHED, attached.state());
        assertEquals(1, attached.resumeImport().version());
        assertEquals(3, attached.resumeImport().proposals().size());

        var emailAccepted = store.updateField(new FieldCommand(
                importId, ACCESS, ResumeField.EMAIL, ProposalState.ACCEPTED,
                null, 1, "2026-07-18T12:02:00Z")).asOptional().orElseThrow();
        assertEquals(FieldState.UPDATED, emailAccepted.state());
        var experienceEdited = store.updateField(new FieldCommand(
                importId, ACCESS, ResumeField.EXPERIENCE, ProposalState.EDITED,
                "Düzenlenmiş deneyim", 2, "2026-07-18T12:03:00Z"))
                .asOptional().orElseThrow();
        assertEquals(FieldState.UPDATED, experienceEdited.state());

        var confirmed = store.confirm(new ConfirmCommand(
                importId, ACCESS, 3, "2026-07-18T12:04:00Z"))
                .asOptional().orElseThrow();
        assertEquals(ConfirmState.CONFIRMED, confirmed.state());
        assertEquals(ImportState.CONFIRMED, confirmed.resumeImport().state());
        assertTrue(confirmed.resumeImport().proposals().isEmpty());
        assertNotNull(confirmed.resumeImport().purgedAt());
        assertEquals("deniz@example.test", confirmed.draft().fields().get(ResumeField.EMAIL));
        assertEquals("Düzenlenmiş deneyim",
                confirmed.draft().fields().get(ResumeField.EXPERIENCE));
        assertEquals(2, confirmed.draft().fields().size(), "UNREVIEWED alan taslağa geçmez");

        var loadedDraft = store.findConfirmedDraft(
                TENANT, JOB, ACCESS, importId, 0).asOptional().orElseThrow();
        assertEquals(confirmed.draft().draftId(), loadedDraft.draftId());

        try (Connection c = ds.getConnection()) {
            assertEquals(0, scalar(c,
                    "SELECT count(*) FROM ats_resume_proposal WHERE import_id=?", importId));
            try (PreparedStatement ps = c.prepareStatement(
                    "SELECT document_digest FROM ats_resume_import WHERE import_id=?")) {
                ps.setString(1, importId);
                try (ResultSet rs = ps.executeQuery()) {
                    assertTrue(rs.next());
                    assertNull(rs.getString(1), "terminal purge document digest linkini de siler");
                }
            }
        }

        var terminalMutation = store.updateField(new FieldCommand(
                importId, ACCESS, ResumeField.EMAIL, ProposalState.REJECTED,
                null, 4, "2026-07-18T12:05:00Z")).asOptional().orElseThrow();
        assertEquals(FieldState.TERMINAL, terminalMutation.state());
    }

    @Test
    void idempotent_upload_conflict_supersede_and_reject_all_are_fail_closed() throws Exception {
        String first = "ri_" + "B".repeat(24);
        assertEquals(CreateState.CREATED,
                store.create(create(first, "b".repeat(64), "create-key-00000002", "3".repeat(64)))
                        .asOptional().orElseThrow().state());
        AttachCommand upload = new AttachCommand(
                first, "b".repeat(64), 0, "upload-key-00000002", "4".repeat(64), 1,
                "parser-v1", 0, 0, "2026-07-18T12:01:00Z");
        assertEquals(AttachState.ATTACHED,
                reserveAndAttach(upload, proposals()).state());
        assertEquals(AttachState.REPLAYED,
                store.attach(upload, proposals()).asOptional().orElseThrow().state());
        assertEquals(AttachState.DOCUMENT_CONFLICT,
                store.attach(new AttachCommand(
                        first, "b".repeat(64), 1, "upload-key-00000003", "5".repeat(64), 1,
                        "parser-v1", 0, 0, "2026-07-18T12:02:00Z"), proposals())
                        .asOptional().orElseThrow().state());

        String second = "ri_" + "C".repeat(24);
        assertEquals(CreateState.CREATED,
                store.create(create(second, "b".repeat(64), "create-key-00000003", "6".repeat(64)))
                        .asOptional().orElseThrow().state());
        assertEquals(ImportState.SUPERSEDED,
                store.find(first, "b".repeat(64), "2026-07-18T12:03:00Z")
                        .asOptional().orElseThrow().state());

        var rejected = store.terminate(new TerminateCommand(
                second, "b".repeat(64), 0, ImportState.REJECT_ALL,
                "2026-07-18T12:04:00Z")).asOptional().orElseThrow();
        assertEquals(TerminateState.TERMINATED, rejected.state());
        assertEquals(ImportState.REJECT_ALL, rejected.resumeImport().state());
        assertEquals(TerminateState.REPLAYED,
                store.terminate(new TerminateCommand(
                        second, "b".repeat(64), 0, ImportState.REJECT_ALL,
                        "2026-07-18T12:04:01Z")).asOptional().orElseThrow().state());
    }

    @Test
    void lifecycle_sweep_expires_active_import_and_removes_abandoned_confirmed_draft()
            throws Exception {
        String active = "ri_" + "D".repeat(24);
        String activeAccess = "d".repeat(64);
        store.create(createDue(
                active, activeAccess, "create-key-00000004", "7".repeat(64)))
                .asOptional().orElseThrow();
        reserveAndAttach(new AttachCommand(
                active, activeAccess, 0, "upload-key-00000004", "8".repeat(64), 1,
                "parser-v1", 0, 0, "2026-07-18T12:01:00Z"), proposals(),
                "2026-07-18T12:10:00Z");

        String abandoned = "ri_" + "E".repeat(24);
        String abandonedAccess = "e".repeat(64);
        store.create(createDue(
                abandoned, abandonedAccess, "create-key-00000005", "9".repeat(64)))
                .asOptional().orElseThrow();
        reserveAndAttach(new AttachCommand(
                abandoned, abandonedAccess, 0, "upload-key-00000005", "a".repeat(64), 1,
                "parser-v1", 0, 0, "2026-07-18T12:01:00Z"), proposals(),
                "2026-07-18T12:10:00Z");
        store.updateField(new FieldCommand(
                abandoned, abandonedAccess, ResumeField.EMAIL, ProposalState.ACCEPTED,
                null, 1, "2026-07-18T12:02:00Z")).asOptional().orElseThrow();
        store.confirm(new ConfirmCommand(
                abandoned, abandonedAccess, 2, "2026-07-18T12:04:00Z"))
                .asOptional().orElseThrow();

        assertEquals(2, store.purgeDue("2026-07-18T13:00:00Z", 100)
                .asOptional().orElseThrow());
        assertEquals(ImportState.EXPIRED,
                store.find(active, activeAccess, "2026-07-18T13:00:01Z")
                        .asOptional().orElseThrow().state());
        try (Connection c = ds.getConnection()) {
            assertEquals(0, scalar(c,
                    "SELECT count(*) FROM ats_resume_proposal WHERE import_id=?", active));
            assertEquals(0, scalar(c,
                    "SELECT count(*) FROM ats_candidate_draft WHERE import_id=?", abandoned));
        }
    }

    @Test
    void upload_is_cross_replica_single_flight_and_explicit_replace_keeps_first_upload_ttl()
            throws Exception {
        String importId = "ri_" + "F".repeat(24);
        String access = "f".repeat(64);
        store.create(create(importId, access, "create-key-00000006", "b".repeat(64)))
                .asOptional().orElseThrow();
        AttachCommand first = new AttachCommand(
                importId, access, 0, "upload-key-00000006", "c".repeat(64), 1,
                "parser-v1", 0, 0, "2026-07-18T12:01:00Z");
        ReserveUploadCommand reservation = new ReserveUploadCommand(
                importId, access, 0, first.uploadIdempotencyKey(), first.documentDigest(),
                "2026-07-18T12:01:30Z", "2026-07-19T12:01:00Z", first.occurredAt());
        assertEquals(ReserveUploadState.RESERVED,
                store.reserveUpload(reservation).asOptional().orElseThrow().state());
        assertEquals(ReserveUploadState.IN_FLIGHT,
                store.reserveUpload(reservation).asOptional().orElseThrow().state());
        assertEquals(ReserveUploadState.DOCUMENT_CONFLICT,
                store.reserveUpload(new ReserveUploadCommand(
                        importId, access, 0, "upload-key-00000007", "d".repeat(64),
                        "2026-07-18T12:01:30Z", "2026-07-19T12:01:00Z",
                        "2026-07-18T12:01:01Z"))
                        .asOptional().orElseThrow().state());

        var attached = store.attach(first, proposals()).asOptional().orElseThrow();
        assertEquals(AttachState.ATTACHED, attached.state());
        assertEquals("2026-07-18T12:01:00Z", attached.resumeImport().firstUploadAt());
        assertEquals("2026-07-19T12:01:00Z", attached.resumeImport().expiresAt());

        var replaced = store.replace(new ReplaceCommand(
                importId, access, 1, "2026-07-18T12:32:00Z",
                "2026-07-18T12:02:00Z")).asOptional().orElseThrow();
        assertEquals(ReplaceState.REPLACED, replaced.state());
        assertEquals(2, replaced.resumeImport().documentVersion());
        assertEquals("2026-07-19T12:01:00Z", replaced.resumeImport().expiresAt(),
                "replace immutable import TTL'yi uzatamaz");
        assertTrue(replaced.resumeImport().proposals().isEmpty());

        AttachCommand second = new AttachCommand(
                importId, access, 2, "upload-key-00000008", "e".repeat(64), 1,
                "parser-v1", 0, 0, "2026-07-18T12:03:00Z");
        assertEquals(AttachState.ATTACHED, reserveAndAttach(
                second, proposals(), "2026-07-20T12:03:00Z").state());
        var current = store.find(importId, access, "2026-07-18T12:04:00Z")
                .asOptional().orElseThrow();
        assertEquals(2, current.documentVersion());
        assertEquals("2026-07-19T12:01:00Z", current.expiresAt());
        try (Connection c = ds.getConnection()) {
            assertEquals(1, scalar(c, """
                    SELECT count(*) FROM ats_resume_document_version
                     WHERE import_id=? AND document_version=1 AND state='VERSION_SUPERSEDED'
                    """, importId));
            assertEquals(1, scalar(c, """
                    SELECT count(*) FROM ats_resume_document_version
                     WHERE import_id=? AND document_version=2 AND state='ACTIVE'
                    """, importId));
        }
    }

    private static CreateCommand create(
            String importId, String access, String key, String requestDigest) {
        return new CreateCommand(
                TENANT, JOB, "urun-yoneticisi", importId, access, key, requestDigest,
                "candidate-resume-import-v1", NOW, "2026-07-18T12:30:00Z",
                "2026-07-19T12:00:00Z", NOW);
    }

    private static CreateCommand createDue(
            String importId, String access, String key, String requestDigest) {
        return new CreateCommand(
                TENANT, JOB, "urun-yoneticisi", importId, access, key, requestDigest,
                "candidate-resume-import-v1", NOW, "2026-07-18T12:05:00Z",
                "2026-07-18T12:10:00Z", NOW);
    }

    private static List<ProposalDraft> proposals() {
        Provenance p = new Provenance(1, 0, 0, 595, 842, 0.95, "parser-v1");
        return List.of(
                new ProposalDraft(ResumeField.EMAIL, "deniz@example.test", p),
                new ProposalDraft(ResumeField.EXPERIENCE, "Örnek deneyim", p),
                new ProposalDraft(ResumeField.EDUCATION, "Örnek eğitim", p));
    }

    private static com.ats.application.ResumeImportStore.AttachResult reserveAndAttach(
            AttachCommand command, List<ProposalDraft> proposals) {
        return reserveAndAttach(
                command, proposals, "2026-07-19T12:01:00Z");
    }

    private static com.ats.application.ResumeImportStore.AttachResult reserveAndAttach(
            AttachCommand command, List<ProposalDraft> proposals, String firstUploadExpiry) {
        var reserved = store.reserveUpload(new ReserveUploadCommand(
                command.importId(), command.candidateAccessDigest(), command.expectedVersion(),
                command.uploadIdempotencyKey(), command.documentDigest(),
                "2026-07-18T12:01:30Z", firstUploadExpiry, command.occurredAt()))
                .asOptional().orElseThrow();
        assertEquals(ReserveUploadState.RESERVED, reserved.state());
        return store.attach(command, proposals).asOptional().orElseThrow();
    }

    private static long scalar(Connection c, String sql, String value) throws Exception {
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, value);
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                return rs.getLong(1);
            }
        }
    }
}
