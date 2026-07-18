package com.ats.persistence;

import com.ats.application.ResumeImportService.ImportState;
import com.ats.application.ResumeImportService.ProposalDraft;
import com.ats.application.ResumeImportService.ProposalState;
import com.ats.application.ResumeImportService.Provenance;
import com.ats.application.ResumeImportService.ResumeDraft;
import com.ats.application.ResumeImportService.ResumeField;
import com.ats.application.ResumeImportService.ResumeImport;
import com.ats.application.ResumeImportService.ResumeProposal;
import com.ats.application.ResumeImportStore;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import javax.sql.DataSource;

/** Plain-JDBC candidate resume import adapter; raw document bytes are structurally absent. */
public final class PostgresResumeImportStore implements ResumeImportStore {

    private final DataSource ds;

    public PostgresResumeImportStore(DataSource ds) {
        this.ds = ds;
    }

    @Override
    public Outcome<CreateResult> create(CreateCommand command) {
        try (Connection c = ds.getConnection()) {
            c.setAutoCommit(false);
            try {
                advisoryLock(c, command.tenantId(), command.jobId(), command.candidateAccessDigest());
                ExistingCreate existing = existingCreate(c, command);
                if (existing != null) {
                    ResumeImport found = readImport(c, existing.tenantId(), existing.importId(), false);
                    c.rollback();
                    return Outcome.ok(new CreateResult(
                            existing.requestDigest().equals(command.requestDigest())
                                    ? CreateState.REPLAYED : CreateState.IDEMPOTENCY_CONFLICT,
                            found));
                }
                supersedeActive(c, command);
                String sql = """
                        INSERT INTO ats_resume_import
                            (tenant_id, import_id, job_id, job_slug, candidate_access_digest,
                             idempotency_key, request_digest, notice_version, notice_accepted_at,
                             state, version, document_version, upload_expires_at, expires_at,
                             created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 0, 0, ?, ?, ?, ?)
                        """;
                try (PreparedStatement ps = c.prepareStatement(sql)) {
                    int i = 1;
                    ps.setString(i++, command.tenantId().value());
                    ps.setString(i++, command.importId());
                    ps.setString(i++, command.jobId());
                    ps.setString(i++, command.jobSlug());
                    ps.setString(i++, command.candidateAccessDigest());
                    ps.setString(i++, command.idempotencyKey());
                    ps.setString(i++, command.requestDigest());
                    ps.setString(i++, command.noticeVersion());
                    ps.setTimestamp(i++, timestamp(command.noticeAcceptedAt()));
                    ps.setTimestamp(i++, timestamp(command.uploadExpiresAt()));
                    ps.setTimestamp(i++, timestamp(command.importExpiresAt()));
                    ps.setTimestamp(i++, timestamp(command.occurredAt()));
                    ps.setTimestamp(i, timestamp(command.occurredAt()));
                    ps.executeUpdate();
                }
                ResumeImport created = readImport(c, command.tenantId(), command.importId(), false);
                c.commit();
                return Outcome.ok(new CreateResult(CreateState.CREATED, created));
            } catch (SQLException ex) {
                c.rollback();
                return Pg.sqlFail(ex);
            } finally {
                c.setAutoCommit(true);
            }
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    @Override
    public Outcome<ResumeImport> find(
            String importId, String candidateAccessDigest, String occurredAt) {
        try (Connection c = ds.getConnection()) {
            c.setAutoCommit(false);
            try {
                ResumeImport current = lockImport(c, importId, candidateAccessDigest);
                if (current == null) {
                    c.rollback();
                    return Outcome.fail(OutcomeCode.NOT_FOUND, "CV import bulunamadı");
                }
                current = expireIfNeeded(c, current, occurredAt);
                ResumeImport result = readImport(c, current.tenantId(), current.importId(), true);
                c.commit();
                return Outcome.ok(result);
            } catch (SQLException ex) {
                c.rollback();
                return Pg.sqlFail(ex);
            } finally {
                c.setAutoCommit(true);
            }
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    @Override
    public Outcome<ReserveUploadResult> reserveUpload(ReserveUploadCommand command) {
        try (Connection c = ds.getConnection()) {
            c.setAutoCommit(false);
            try {
                ResumeImport current = lockImport(
                        c, command.importId(), command.candidateAccessDigest());
                if (current == null) {
                    c.rollback();
                    return Outcome.ok(new ReserveUploadResult(ReserveUploadState.NOT_FOUND, null));
                }
                current = expireIfNeeded(c, current, command.occurredAt());
                DocumentBinding completed = documentBinding(c, current);
                if (completed != null
                        && command.documentDigest().equals(completed.documentDigest())
                        && command.uploadIdempotencyKey().equals(completed.uploadIdempotencyKey())) {
                    ResumeImport replay = readImport(c, current.tenantId(), current.importId(), true);
                    c.rollback();
                    return Outcome.ok(new ReserveUploadResult(ReserveUploadState.REPLAYED, replay));
                }
                if (current.state().terminal()) {
                    c.rollback();
                    return Outcome.ok(new ReserveUploadResult(ReserveUploadState.TERMINAL, current));
                }
                if (Instant.parse(command.occurredAt())
                        .isAfter(Instant.parse(current.uploadExpiresAt()))) {
                    c.rollback();
                    return Outcome.ok(new ReserveUploadResult(
                            ReserveUploadState.UPLOAD_WINDOW_CLOSED, current));
                }
                if (current.version() != command.expectedVersion()) {
                    c.rollback();
                    return Outcome.ok(new ReserveUploadResult(
                            ReserveUploadState.VERSION_CONFLICT, current));
                }
                if (completed != null) {
                    c.rollback();
                    return Outcome.ok(new ReserveUploadResult(
                            ReserveUploadState.DOCUMENT_CONFLICT, current));
                }
                PendingBinding pending = pendingBinding(c, current);
                if (pending != null && Instant.parse(command.occurredAt())
                        .isBefore(Instant.parse(pending.pendingUntil()))) {
                    ReserveUploadState state = command.documentDigest().equals(pending.documentDigest())
                                    && command.uploadIdempotencyKey().equals(pending.uploadIdempotencyKey())
                            ? ReserveUploadState.IN_FLIGHT : ReserveUploadState.DOCUMENT_CONFLICT;
                    c.rollback();
                    return Outcome.ok(new ReserveUploadResult(state, current));
                }
                String sql = """
                        UPDATE ats_resume_import
                           SET pending_document_digest=?, pending_upload_key=?, pending_until=?,
                               first_upload_at=COALESCE(first_upload_at, ?),
                               expires_at=CASE WHEN first_upload_at IS NULL THEN ? ELSE expires_at END,
                               updated_at=?
                         WHERE tenant_id=? AND import_id=? AND version=? AND state='ACTIVE'
                        """;
                try (PreparedStatement ps = c.prepareStatement(sql)) {
                    ps.setString(1, command.documentDigest());
                    ps.setString(2, command.uploadIdempotencyKey());
                    ps.setTimestamp(3, timestamp(command.reservationExpiresAt()));
                    ps.setTimestamp(4, timestamp(command.occurredAt()));
                    ps.setTimestamp(5, timestamp(command.firstUploadImportExpiresAt()));
                    ps.setTimestamp(6, timestamp(command.occurredAt()));
                    ps.setString(7, current.tenantId().value());
                    ps.setString(8, current.importId());
                    ps.setInt(9, current.version());
                    if (ps.executeUpdate() != 1) throw invariant("resume upload reserve CAS");
                }
                ResumeImport reserved = readImport(c, current.tenantId(), current.importId(), true);
                c.commit();
                return Outcome.ok(new ReserveUploadResult(ReserveUploadState.RESERVED, reserved));
            } catch (SQLException ex) {
                c.rollback();
                return Pg.sqlFail(ex);
            } finally {
                c.setAutoCommit(true);
            }
        } catch (IllegalArgumentException ex) {
            return Outcome.fail(OutcomeCode.INVALID, "CV upload rezervasyon zamanı geçersiz");
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    @Override
    public Outcome<Void> releaseUpload(
            String importId, String candidateAccessDigest, String uploadIdempotencyKey,
            String documentDigest, String occurredAt) {
        String sql = """
                UPDATE ats_resume_import
                   SET pending_document_digest=NULL, pending_upload_key=NULL, pending_until=NULL,
                       updated_at=?
                 WHERE import_id=? AND candidate_access_digest=? AND state='ACTIVE'
                   AND pending_document_digest=? AND pending_upload_key=?
                """;
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setTimestamp(1, timestamp(occurredAt));
            ps.setString(2, importId);
            ps.setString(3, candidateAccessDigest);
            ps.setString(4, documentDigest);
            ps.setString(5, uploadIdempotencyKey);
            ps.executeUpdate();
            return Outcome.ok(null);
        } catch (IllegalArgumentException ex) {
            return Outcome.fail(OutcomeCode.INVALID, "CV upload release zamanı geçersiz");
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    @Override
    public Outcome<AttachResult> attach(
            AttachCommand command, List<ProposalDraft> proposals) {
        try (Connection c = ds.getConnection()) {
            c.setAutoCommit(false);
            try {
                ResumeImport current = lockImport(c, command.importId(), command.candidateAccessDigest());
                if (current == null) {
                    c.rollback();
                    return Outcome.ok(new AttachResult(AttachState.NOT_FOUND, null));
                }
                current = expireIfNeeded(c, current, command.occurredAt());
                DocumentBinding binding = documentBinding(c, current);
                if (binding != null && command.documentDigest().equals(binding.documentDigest())
                        && command.uploadIdempotencyKey().equals(binding.uploadIdempotencyKey())) {
                    ResumeImport replay = readImport(c, current.tenantId(), current.importId(), true);
                    c.rollback();
                    return Outcome.ok(new AttachResult(AttachState.REPLAYED, replay));
                }
                if (current.state().terminal()) {
                    c.rollback();
                    return Outcome.ok(new AttachResult(AttachState.TERMINAL, current));
                }
                if (Instant.parse(command.occurredAt()).isAfter(Instant.parse(current.uploadExpiresAt()))) {
                    c.rollback();
                    return Outcome.ok(new AttachResult(AttachState.UPLOAD_WINDOW_CLOSED, current));
                }
                if (current.version() != command.expectedVersion()) {
                    c.rollback();
                    return Outcome.ok(new AttachResult(AttachState.VERSION_CONFLICT, current));
                }
                if (binding != null) {
                    c.rollback();
                    return Outcome.ok(new AttachResult(AttachState.DOCUMENT_CONFLICT, current));
                }
                PendingBinding pending = pendingBinding(c, current);
                if (pending == null
                        || !command.documentDigest().equals(pending.documentDigest())
                        || !command.uploadIdempotencyKey().equals(pending.uploadIdempotencyKey())) {
                    c.rollback();
                    return Outcome.ok(new AttachResult(AttachState.DOCUMENT_CONFLICT, current));
                }
                insertProposals(c, current, command, proposals);
                int documentVersion = current.documentVersion() == 0
                        ? 1 : current.documentVersion();
                String update = """
                        UPDATE ats_resume_import
                           SET document_version = ?, document_digest = ?, upload_idempotency_key = ?,
                               parser_version = ?, protected_suppressed = ?, unsupported_output = ?,
                               pending_document_digest=NULL, pending_upload_key=NULL, pending_until=NULL,
                               version = version + 1, updated_at = ?
                         WHERE tenant_id = ? AND import_id = ? AND version = ? AND state = 'ACTIVE'
                        """;
                try (PreparedStatement ps = c.prepareStatement(update)) {
                    int i = 1;
                    ps.setInt(i++, documentVersion);
                    ps.setString(i++, command.documentDigest());
                    ps.setString(i++, command.uploadIdempotencyKey());
                    ps.setString(i++, command.parserVersion());
                    ps.setInt(i++, command.protectedSuppressed());
                    ps.setInt(i++, command.unsupportedOutput());
                    ps.setTimestamp(i++, timestamp(command.occurredAt()));
                    ps.setString(i++, current.tenantId().value());
                    ps.setString(i++, current.importId());
                    ps.setInt(i, command.expectedVersion());
                    if (ps.executeUpdate() != 1) throw invariant("resume attach CAS");
                }
                insertDocumentVersion(c, current, documentVersion, command.occurredAt());
                ResumeImport attached = readImport(c, current.tenantId(), current.importId(), true);
                c.commit();
                return Outcome.ok(new AttachResult(AttachState.ATTACHED, attached));
            } catch (SQLException ex) {
                c.rollback();
                return Pg.sqlFail(ex);
            } finally {
                c.setAutoCommit(true);
            }
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    @Override
    public Outcome<FieldResult> updateField(FieldCommand command) {
        try (Connection c = ds.getConnection()) {
            c.setAutoCommit(false);
            try {
                ResumeImport current = lockImport(c, command.importId(), command.candidateAccessDigest());
                if (current == null) {
                    c.rollback();
                    return Outcome.ok(new FieldResult(FieldState.NOT_FOUND, null));
                }
                current = expireIfNeeded(c, current, command.occurredAt());
                if (current.state().terminal()) {
                    c.rollback();
                    return Outcome.ok(new FieldResult(FieldState.TERMINAL, current));
                }
                if (current.version() != command.expectedVersion()) {
                    c.rollback();
                    return Outcome.ok(new FieldResult(FieldState.VERSION_CONFLICT, current));
                }
                String updateProposal = """
                        UPDATE ats_resume_proposal
                           SET state = ?, candidate_value = ?, version = version + 1, updated_at = ?
                         WHERE tenant_id = ? AND import_id = ? AND field_key = ?
                        """;
                try (PreparedStatement ps = c.prepareStatement(updateProposal)) {
                    ps.setString(1, command.state().name());
                    ps.setString(2, command.state() == ProposalState.EDITED
                            ? command.editedValue() : null);
                    ps.setTimestamp(3, timestamp(command.occurredAt()));
                    ps.setString(4, current.tenantId().value());
                    ps.setString(5, current.importId());
                    ps.setString(6, command.field().name());
                    if (ps.executeUpdate() != 1) {
                        c.rollback();
                        return Outcome.ok(new FieldResult(FieldState.NOT_FOUND, current));
                    }
                }
                bumpVersion(c, current, command.occurredAt());
                ResumeImport updated = readImport(c, current.tenantId(), current.importId(), true);
                c.commit();
                return Outcome.ok(new FieldResult(FieldState.UPDATED, updated));
            } catch (SQLException ex) {
                c.rollback();
                return Pg.sqlFail(ex);
            } finally {
                c.setAutoCommit(true);
            }
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    @Override
    public Outcome<ConfirmResult> confirm(ConfirmCommand command) {
        try (Connection c = ds.getConnection()) {
            c.setAutoCommit(false);
            try {
                ResumeImport current = lockImport(c, command.importId(), command.candidateAccessDigest());
                if (current == null) {
                    c.rollback();
                    return Outcome.ok(new ConfirmResult(ConfirmState.NOT_FOUND, null, null));
                }
                current = expireIfNeeded(c, current, command.occurredAt());
                if (current.state().terminal()) {
                    c.rollback();
                    return Outcome.ok(new ConfirmResult(ConfirmState.TERMINAL, current, null));
                }
                if (current.version() != command.expectedVersion()) {
                    c.rollback();
                    return Outcome.ok(new ConfirmResult(ConfirmState.VERSION_CONFLICT, current, null));
                }
                Map<ResumeField, String> selected = selectedFields(c, current);
                if (selected.isEmpty()) {
                    c.rollback();
                    return Outcome.ok(new ConfirmResult(ConfirmState.NO_SELECTED_FIELDS, current, null));
                }
                UUID draftId = UUID.randomUUID();
                insertDraft(c, current, draftId, command.occurredAt(), selected);
                terminalUpdate(c, current, ImportState.CONFIRMED, command.occurredAt());
                purgeProposals(c, current.tenantId(), current.importId());
                ResumeImport confirmed = readImport(c, current.tenantId(), current.importId(), false);
                ResumeDraft draft = new ResumeDraft(
                        draftId.toString(), current.importId(), 0, selected, command.occurredAt());
                c.commit();
                return Outcome.ok(new ConfirmResult(ConfirmState.CONFIRMED, confirmed, draft));
            } catch (SQLException ex) {
                c.rollback();
                return Pg.sqlFail(ex);
            } finally {
                c.setAutoCommit(true);
            }
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    @Override
    public Outcome<TerminateResult> terminate(TerminateCommand command) {
        try (Connection c = ds.getConnection()) {
            c.setAutoCommit(false);
            try {
                ResumeImport current = lockImport(c, command.importId(), command.candidateAccessDigest());
                if (current == null) {
                    c.rollback();
                    return Outcome.ok(new TerminateResult(TerminateState.NOT_FOUND, null));
                }
                current = expireIfNeeded(c, current, command.occurredAt());
                if (current.state() == command.terminalState()) {
                    c.rollback();
                    return Outcome.ok(new TerminateResult(TerminateState.REPLAYED, current));
                }
                if (current.state().terminal()) {
                    c.rollback();
                    return Outcome.ok(new TerminateResult(TerminateState.TERMINAL, current));
                }
                if (current.version() != command.expectedVersion()) {
                    c.rollback();
                    return Outcome.ok(new TerminateResult(TerminateState.VERSION_CONFLICT, current));
                }
                terminalUpdate(c, current, command.terminalState(), command.occurredAt());
                purgeProposals(c, current.tenantId(), current.importId());
                ResumeImport terminated = readImport(c, current.tenantId(), current.importId(), false);
                c.commit();
                return Outcome.ok(new TerminateResult(TerminateState.TERMINATED, terminated));
            } catch (SQLException ex) {
                c.rollback();
                return Pg.sqlFail(ex);
            } finally {
                c.setAutoCommit(true);
            }
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    @Override
    public Outcome<ReplaceResult> replace(ReplaceCommand command) {
        try (Connection c = ds.getConnection()) {
            c.setAutoCommit(false);
            try {
                ResumeImport current = lockImport(
                        c, command.importId(), command.candidateAccessDigest());
                if (current == null) {
                    c.rollback();
                    return Outcome.ok(new ReplaceResult(ReplaceState.NOT_FOUND, null));
                }
                current = expireIfNeeded(c, current, command.occurredAt());
                if (current.state().terminal()) {
                    c.rollback();
                    return Outcome.ok(new ReplaceResult(ReplaceState.TERMINAL, current));
                }
                if (current.version() != command.expectedVersion()) {
                    c.rollback();
                    return Outcome.ok(new ReplaceResult(ReplaceState.VERSION_CONFLICT, current));
                }
                if (documentBinding(c, current) == null || current.documentVersion() < 1) {
                    c.rollback();
                    return Outcome.ok(new ReplaceResult(ReplaceState.NO_DOCUMENT, current));
                }
                String versionSql = """
                        UPDATE ats_resume_document_version
                           SET state='VERSION_SUPERSEDED', superseded_at=?
                         WHERE tenant_id=? AND import_id=? AND document_version=? AND state='ACTIVE'
                        """;
                try (PreparedStatement ps = c.prepareStatement(versionSql)) {
                    ps.setTimestamp(1, timestamp(command.occurredAt()));
                    ps.setString(2, current.tenantId().value());
                    ps.setString(3, current.importId());
                    ps.setInt(4, current.documentVersion());
                    if (ps.executeUpdate() != 1) throw invariant("resume document supersede");
                }
                purgeProposals(c, current.tenantId(), current.importId());
                String update = """
                        UPDATE ats_resume_import
                           SET document_version=document_version+1, document_digest=NULL,
                               upload_idempotency_key=NULL, parser_version=NULL,
                               protected_suppressed=0, unsupported_output=0,
                               pending_document_digest=NULL, pending_upload_key=NULL,
                               pending_until=NULL, upload_expires_at=?,
                               version=version+1, updated_at=?
                         WHERE tenant_id=? AND import_id=? AND version=? AND state='ACTIVE'
                        """;
                try (PreparedStatement ps = c.prepareStatement(update)) {
                    ps.setTimestamp(1, timestamp(command.newUploadExpiresAt()));
                    ps.setTimestamp(2, timestamp(command.occurredAt()));
                    ps.setString(3, current.tenantId().value());
                    ps.setString(4, current.importId());
                    ps.setInt(5, current.version());
                    if (ps.executeUpdate() != 1) throw invariant("resume document replace CAS");
                }
                ResumeImport replaced = readImport(c, current.tenantId(), current.importId(), true);
                c.commit();
                return Outcome.ok(new ReplaceResult(ReplaceState.REPLACED, replaced));
            } catch (SQLException ex) {
                c.rollback();
                return Pg.sqlFail(ex);
            } finally {
                c.setAutoCommit(true);
            }
        } catch (IllegalArgumentException ex) {
            return Outcome.fail(OutcomeCode.INVALID, "PDF değiştirme zamanı geçersiz");
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    @Override
    public Outcome<Integer> purgeDue(String occurredAt, int limit) {
        if (limit < 1 || limit > 1_000) {
            return Outcome.fail(OutcomeCode.INVALID, "CV import purge limiti 1..1000 olmalı");
        }
        try (Connection c = ds.getConnection()) {
            c.setAutoCommit(false);
            try {
                Timestamp now = timestamp(occurredAt);
                List<ImportRef> due = new ArrayList<>();
                String dueSql = """
                        SELECT tenant_id, import_id
                          FROM ats_resume_import
                         WHERE state='ACTIVE' AND expires_at <= ?
                         ORDER BY expires_at, import_id
                         LIMIT ? FOR UPDATE SKIP LOCKED
                        """;
                try (PreparedStatement ps = c.prepareStatement(dueSql)) {
                    ps.setTimestamp(1, now);
                    ps.setInt(2, limit);
                    try (ResultSet rs = ps.executeQuery()) {
                        while (rs.next()) {
                            due.add(new ImportRef(
                                    new TenantId(rs.getString("tenant_id")),
                                    rs.getString("import_id")));
                        }
                    }
                }
                for (ImportRef ref : due) {
                    ResumeImport current = readImport(c, ref.tenantId(), ref.importId(), false);
                    terminalUpdate(c, current, ImportState.EXPIRED, occurredAt);
                    purgeProposals(c, current.tenantId(), current.importId());
                }

                int remaining = Math.max(1, limit - due.size());
                String draftSql = """
                        WITH due AS (
                            SELECT tenant_id, draft_id
                              FROM ats_candidate_draft
                             WHERE consumed_application_id IS NULL AND expires_at <= ?
                             ORDER BY expires_at, draft_id
                             LIMIT ? FOR UPDATE SKIP LOCKED
                        )
                        DELETE FROM ats_candidate_draft d
                         USING due
                         WHERE d.tenant_id=due.tenant_id AND d.draft_id=due.draft_id
                        """;
                int deletedDrafts;
                try (PreparedStatement ps = c.prepareStatement(draftSql)) {
                    ps.setTimestamp(1, now);
                    ps.setInt(2, remaining);
                    deletedDrafts = ps.executeUpdate();
                }
                c.commit();
                return Outcome.ok(due.size() + deletedDrafts);
            } catch (IllegalArgumentException ex) {
                c.rollback();
                return Outcome.fail(OutcomeCode.INVALID, "CV import purge zamanı geçersiz");
            } catch (SQLException ex) {
                c.rollback();
                return Pg.sqlFail(ex);
            } finally {
                c.setAutoCommit(true);
            }
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    @Override
    public Outcome<ResumeDraft> findConfirmedDraft(
            TenantId tenantId, String jobId, String candidateAccessDigest,
            String importId, int expectedDraftVersion) {
        String sql = """
                SELECT d.draft_id, d.import_id, d.version, d.created_at,
                       f.field_key, f.field_value
                  FROM ats_candidate_draft d
                  JOIN ats_resume_import i
                    ON i.tenant_id=d.tenant_id AND i.import_id=d.import_id
                  LEFT JOIN ats_candidate_draft_field f
                    ON f.tenant_id=d.tenant_id AND f.draft_id=d.draft_id
                 WHERE d.tenant_id=? AND d.job_id=? AND d.candidate_access_digest=?
                   AND d.import_id=? AND d.version=? AND d.consumed_at IS NULL
                   AND i.state='CONFIRMED' AND d.expires_at > CURRENT_TIMESTAMP
                 ORDER BY f.field_key
                """;
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, tenantId.value());
            ps.setString(2, jobId);
            ps.setString(3, candidateAccessDigest);
            ps.setString(4, importId);
            ps.setInt(5, expectedDraftVersion);
            Map<ResumeField, String> fields = new LinkedHashMap<>();
            String draftId = null;
            String createdAt = null;
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    if (draftId == null) {
                        draftId = rs.getString("draft_id");
                        createdAt = iso(rs, "created_at");
                    }
                    String field = rs.getString("field_key");
                    if (field != null) fields.put(ResumeField.valueOf(field), rs.getString("field_value"));
                }
            }
            return draftId == null
                    ? Outcome.fail(OutcomeCode.NOT_FOUND, "onaylı CV taslağı bulunamadı")
                    : Outcome.ok(new ResumeDraft(draftId, importId, expectedDraftVersion, fields, createdAt));
        } catch (IllegalArgumentException ex) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "CV taslak alanı bozuk (fail-closed)");
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    @Override
    public Outcome<Map<ImportState, Long>> countStates(TenantId tenantId) {
        String sql = "SELECT state, count(*) FROM ats_resume_import WHERE tenant_id=? GROUP BY state";
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, tenantId.value());
            Map<ImportState, Long> result = new EnumMap<>(ImportState.class);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) result.put(ImportState.valueOf(rs.getString(1)), rs.getLong(2));
            }
            return Outcome.ok(Map.copyOf(result));
        } catch (IllegalArgumentException ex) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "CV import state bozuk (fail-closed)");
        } catch (SQLException ex) {
            return Pg.sqlFail(ex);
        }
    }

    private static void advisoryLock(
            Connection c, TenantId tenantId, String jobId, String digest) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
                "SELECT pg_advisory_xact_lock(hashtextextended(?, 0))")) {
            ps.setString(1, tenantId.value() + ":" + jobId + ":" + digest);
            ps.executeQuery().close();
        }
    }

    private record ExistingCreate(
            TenantId tenantId, String importId, String requestDigest) {}

    private record ImportRef(TenantId tenantId, String importId) {}

    private static ExistingCreate existingCreate(Connection c, CreateCommand command)
            throws SQLException {
        String sql = """
                SELECT tenant_id, import_id, request_digest
                  FROM ats_resume_import
                 WHERE tenant_id=? AND job_id=? AND candidate_access_digest=? AND idempotency_key=?
                 FOR UPDATE
                """;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, command.tenantId().value());
            ps.setString(2, command.jobId());
            ps.setString(3, command.candidateAccessDigest());
            ps.setString(4, command.idempotencyKey());
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? new ExistingCreate(
                        new TenantId(rs.getString("tenant_id")), rs.getString("import_id"),
                        rs.getString("request_digest")) : null;
            }
        }
    }

    private static void supersedeActive(Connection c, CreateCommand command) throws SQLException {
        String update = """
                UPDATE ats_resume_import
                   SET state='SUPERSEDED', version=version+1, document_digest=NULL,
                       pending_document_digest=NULL, pending_upload_key=NULL, pending_until=NULL,
                       terminal_at=?, purged_at=?, updated_at=?
                 WHERE tenant_id=? AND job_id=? AND candidate_access_digest=? AND state='ACTIVE'
                """;
        try (PreparedStatement ps = c.prepareStatement(update)) {
            Timestamp now = timestamp(command.occurredAt());
            ps.setTimestamp(1, now); ps.setTimestamp(2, now); ps.setTimestamp(3, now);
            ps.setString(4, command.tenantId().value());
            ps.setString(5, command.jobId());
            ps.setString(6, command.candidateAccessDigest());
            ps.executeUpdate();
        }
        String delete = """
                DELETE FROM ats_resume_proposal p
                 USING ats_resume_import i
                 WHERE p.tenant_id=i.tenant_id AND p.import_id=i.import_id
                   AND i.tenant_id=? AND i.job_id=? AND i.candidate_access_digest=?
                   AND i.state='SUPERSEDED'
                """;
        try (PreparedStatement ps = c.prepareStatement(delete)) {
            ps.setString(1, command.tenantId().value());
            ps.setString(2, command.jobId());
            ps.setString(3, command.candidateAccessDigest());
            ps.executeUpdate();
        }
    }

    private static ResumeImport lockImport(
            Connection c, String importId, String accessDigest) throws SQLException {
        String sql = importSelect() + " WHERE i.import_id=? AND i.candidate_access_digest=? FOR UPDATE";
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, importId);
            ps.setString(2, accessDigest);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? readImportRow(rs, List.of()) : null;
            }
        }
    }

    private static ResumeImport expireIfNeeded(
            Connection c, ResumeImport current, String occurredAt) throws SQLException {
        if (current.state() == ImportState.ACTIVE
                && !Instant.parse(occurredAt).isBefore(Instant.parse(current.expiresAt()))) {
            terminalUpdate(c, current, ImportState.EXPIRED, occurredAt);
            purgeProposals(c, current.tenantId(), current.importId());
            return readImport(c, current.tenantId(), current.importId(), false);
        }
        return current;
    }

    private static void insertProposals(
            Connection c, ResumeImport current, AttachCommand command,
            List<ProposalDraft> proposals) throws SQLException {
        String sql = """
                INSERT INTO ats_resume_proposal
                    (tenant_id, import_id, field_key, proposed_value, candidate_value,
                     state, version, source_page, bbox_x, bbox_y, bbox_width, bbox_height,
                     confidence, parser_version, created_at, updated_at)
                VALUES (?, ?, ?, ?, NULL, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            for (ProposalDraft proposal : proposals) {
                Provenance p = proposal.provenance();
                int i = 1;
                ps.setString(i++, current.tenantId().value());
                ps.setString(i++, current.importId());
                ps.setString(i++, proposal.field().name());
                ps.setString(i++, proposal.value());
                ps.setString(i++, p.confidence() < 0.80
                        ? ProposalState.CONTROL_REQUIRED.name() : ProposalState.UNREVIEWED.name());
                ps.setInt(i++, p.page());
                ps.setDouble(i++, p.x()); ps.setDouble(i++, p.y());
                ps.setDouble(i++, p.width()); ps.setDouble(i++, p.height());
                ps.setDouble(i++, p.confidence()); ps.setString(i++, p.parserVersion());
                ps.setTimestamp(i++, timestamp(command.occurredAt()));
                ps.setTimestamp(i, timestamp(command.occurredAt()));
                ps.addBatch();
            }
            int[] inserted = ps.executeBatch();
            if (inserted.length != proposals.size()) throw invariant("resume proposal insert");
        }
    }

    private static void bumpVersion(
            Connection c, ResumeImport current, String occurredAt) throws SQLException {
        String sql = """
                UPDATE ats_resume_import SET version=version+1, updated_at=?
                 WHERE tenant_id=? AND import_id=? AND version=? AND state='ACTIVE'
                """;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setTimestamp(1, timestamp(occurredAt));
            ps.setString(2, current.tenantId().value());
            ps.setString(3, current.importId());
            ps.setInt(4, current.version());
            if (ps.executeUpdate() != 1) throw invariant("resume import version bump");
        }
    }

    private static Map<ResumeField, String> selectedFields(
            Connection c, ResumeImport current) throws SQLException {
        String sql = """
                SELECT field_key,
                       CASE WHEN state='EDITED' THEN candidate_value ELSE proposed_value END AS value
                  FROM ats_resume_proposal
                 WHERE tenant_id=? AND import_id=? AND state IN ('ACCEPTED','EDITED')
                 ORDER BY field_key
                """;
        Map<ResumeField, String> selected = new LinkedHashMap<>();
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, current.tenantId().value());
            ps.setString(2, current.importId());
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) selected.put(
                        ResumeField.valueOf(rs.getString("field_key")), rs.getString("value"));
            }
        }
        return selected;
    }

    private static void insertDraft(
            Connection c, ResumeImport current, UUID draftId,
            String occurredAt, Map<ResumeField, String> selected) throws SQLException {
        String draftSql = """
                INSERT INTO ats_candidate_draft
                    (tenant_id, draft_id, import_id, job_id, candidate_access_digest,
                     version, created_at, expires_at)
                SELECT tenant_id, ?, import_id, job_id, candidate_access_digest, 0, ?, expires_at
                  FROM ats_resume_import WHERE tenant_id=? AND import_id=? AND state='ACTIVE'
                """;
        try (PreparedStatement ps = c.prepareStatement(draftSql)) {
            ps.setObject(1, draftId);
            ps.setTimestamp(2, timestamp(occurredAt));
            ps.setString(3, current.tenantId().value());
            ps.setString(4, current.importId());
            if (ps.executeUpdate() != 1) throw invariant("candidate draft insert");
        }
        String fieldSql = """
                INSERT INTO ats_candidate_draft_field
                    (tenant_id, draft_id, field_key, field_value, created_at)
                VALUES (?, ?, ?, ?, ?)
                """;
        try (PreparedStatement ps = c.prepareStatement(fieldSql)) {
            for (Map.Entry<ResumeField, String> entry : selected.entrySet()) {
                ps.setString(1, current.tenantId().value());
                ps.setObject(2, draftId);
                ps.setString(3, entry.getKey().name());
                ps.setString(4, entry.getValue());
                ps.setTimestamp(5, timestamp(occurredAt));
                ps.addBatch();
            }
            ps.executeBatch();
        }
    }

    private static void terminalUpdate(
            Connection c, ResumeImport current, ImportState state, String occurredAt)
            throws SQLException {
        String sql = """
                UPDATE ats_resume_import
                   SET state=?, version=version+1, document_digest=NULL,
                       pending_document_digest=NULL, pending_upload_key=NULL, pending_until=NULL,
                       terminal_at=?, purged_at=?, updated_at=?
                 WHERE tenant_id=? AND import_id=? AND version=? AND state='ACTIVE'
                """;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            Timestamp now = timestamp(occurredAt);
            ps.setString(1, state.name());
            ps.setTimestamp(2, now); ps.setTimestamp(3, now); ps.setTimestamp(4, now);
            ps.setString(5, current.tenantId().value());
            ps.setString(6, current.importId());
            ps.setInt(7, current.version());
            if (ps.executeUpdate() != 1) throw invariant("resume terminal CAS");
        }
    }

    private static void purgeProposals(
            Connection c, TenantId tenantId, String importId) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
                "DELETE FROM ats_resume_proposal WHERE tenant_id=? AND import_id=?")) {
            ps.setString(1, tenantId.value());
            ps.setString(2, importId);
            ps.executeUpdate();
        }
    }

    private record DocumentBinding(String documentDigest, String uploadIdempotencyKey) {}

    private record PendingBinding(
            String documentDigest, String uploadIdempotencyKey, String pendingUntil) {}

    private static DocumentBinding documentBinding(Connection c, ResumeImport current)
            throws SQLException {
        String sql = """
                SELECT document_digest, upload_idempotency_key FROM ats_resume_import
                 WHERE tenant_id=? AND import_id=? AND document_digest IS NOT NULL
                """;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, current.tenantId().value());
            ps.setString(2, current.importId());
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? new DocumentBinding(
                        rs.getString("document_digest"), rs.getString("upload_idempotency_key")) : null;
            }
        }
    }

    private static PendingBinding pendingBinding(Connection c, ResumeImport current)
            throws SQLException {
        String sql = """
                SELECT pending_document_digest, pending_upload_key, pending_until
                  FROM ats_resume_import
                 WHERE tenant_id=? AND import_id=? AND pending_document_digest IS NOT NULL
                """;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, current.tenantId().value());
            ps.setString(2, current.importId());
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? new PendingBinding(
                        rs.getString("pending_document_digest"),
                        rs.getString("pending_upload_key"),
                        iso(rs, "pending_until")) : null;
            }
        }
    }

    private static void insertDocumentVersion(
            Connection c, ResumeImport current, int documentVersion, String occurredAt)
            throws SQLException {
        String sql = """
                INSERT INTO ats_resume_document_version
                    (tenant_id, import_id, document_version, state, created_at)
                VALUES (?, ?, ?, 'ACTIVE', ?)
                """;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, current.tenantId().value());
            ps.setString(2, current.importId());
            ps.setInt(3, documentVersion);
            ps.setTimestamp(4, timestamp(occurredAt));
            ps.executeUpdate();
        }
    }

    private static ResumeImport readImport(
            Connection c, TenantId tenantId, String importId, boolean withProposals)
            throws SQLException {
        String sql = importSelect() + " WHERE i.tenant_id=? AND i.import_id=?";
        ResumeImport base;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, tenantId.value());
            ps.setString(2, importId);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) throw invariant("resume import disappeared");
                base = readImportRow(rs, List.of());
            }
        }
        if (!withProposals || base.state().terminal()) return base;
        List<ResumeProposal> proposals = readProposals(c, tenantId, importId);
        return new ResumeImport(
                base.tenantId(), base.importId(), base.jobId(), base.jobSlug(), base.state(),
                base.version(), base.documentVersion(), base.noticeVersion(),
                base.noticeAcceptedAt(), base.uploadExpiresAt(), base.firstUploadAt(), base.expiresAt(),
                base.parserVersion(), base.protectedSuppressed(), base.unsupportedOutput(),
                base.createdAt(), base.updatedAt(), base.purgedAt(), proposals);
    }

    private static List<ResumeProposal> readProposals(
            Connection c, TenantId tenantId, String importId) throws SQLException {
        String sql = """
                SELECT field_key, proposed_value, candidate_value, state, version,
                       source_page, bbox_x, bbox_y, bbox_width, bbox_height,
                       confidence, parser_version
                  FROM ats_resume_proposal
                 WHERE tenant_id=? AND import_id=? ORDER BY field_key
                """;
        List<ResumeProposal> result = new ArrayList<>();
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, tenantId.value()); ps.setString(2, importId);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    result.add(new ResumeProposal(
                            ResumeField.valueOf(rs.getString("field_key")),
                            rs.getString("proposed_value"), rs.getString("candidate_value"),
                            ProposalState.valueOf(rs.getString("state")), rs.getInt("version"),
                            new Provenance(rs.getInt("source_page"), rs.getDouble("bbox_x"),
                                    rs.getDouble("bbox_y"), rs.getDouble("bbox_width"),
                                    rs.getDouble("bbox_height"), rs.getDouble("confidence"),
                                    rs.getString("parser_version"))));
                }
            }
        }
        return List.copyOf(result);
    }

    private static String importSelect() {
        return """
                SELECT i.tenant_id, i.import_id, i.job_id, i.job_slug, i.state, i.version,
                       i.document_version, i.notice_version, i.notice_accepted_at,
                       i.upload_expires_at, i.first_upload_at, i.expires_at, i.parser_version,
                       i.protected_suppressed, i.unsupported_output,
                       i.created_at, i.updated_at, i.purged_at
                  FROM ats_resume_import i
                """;
    }

    private static ResumeImport readImportRow(ResultSet rs, List<ResumeProposal> proposals)
            throws SQLException {
        return new ResumeImport(
                new TenantId(rs.getString("tenant_id")), rs.getString("import_id"),
                rs.getString("job_id"), rs.getString("job_slug"),
                ImportState.valueOf(rs.getString("state")), rs.getInt("version"),
                rs.getInt("document_version"), rs.getString("notice_version"),
                iso(rs, "notice_accepted_at"), iso(rs, "upload_expires_at"),
                isoNullable(rs, "first_upload_at"), iso(rs, "expires_at"),
                rs.getString("parser_version"),
                rs.getInt("protected_suppressed"), rs.getInt("unsupported_output"),
                iso(rs, "created_at"), iso(rs, "updated_at"), isoNullable(rs, "purged_at"),
                proposals);
    }

    private static SQLException invariant(String name) {
        return new SQLException(name + " invariant", "23514");
    }

    private static Timestamp timestamp(String iso) {
        return Timestamp.from(Instant.parse(iso));
    }

    private static String iso(ResultSet rs, String column) throws SQLException {
        return rs.getTimestamp(column).toInstant().toString();
    }

    private static String isoNullable(ResultSet rs, String column) throws SQLException {
        Timestamp value = rs.getTimestamp(column);
        return value == null ? null : value.toInstant().toString();
    }
}
