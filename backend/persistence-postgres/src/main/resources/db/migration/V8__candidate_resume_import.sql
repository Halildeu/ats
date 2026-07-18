-- Faz 25 #163: candidate-controlled CV import. Raw PDF/OCR bytes are never stored.
-- Only transient allow-listed proposals exist until a terminal state purges them.

CREATE TABLE ats_resume_import (
    tenant_id                 TEXT        NOT NULL,
    import_id                 TEXT        NOT NULL,
    job_id                    TEXT        NOT NULL,
    job_slug                  TEXT        NOT NULL,
    candidate_access_digest   CHAR(64)    NOT NULL,
    idempotency_key           TEXT        NOT NULL,
    request_digest            CHAR(64)    NOT NULL,
    notice_version            TEXT        NOT NULL,
    notice_accepted_at        TIMESTAMPTZ NOT NULL,
    state                     TEXT        NOT NULL,
    version                   INTEGER     NOT NULL DEFAULT 0,
    document_version          INTEGER     NOT NULL DEFAULT 0,
    document_digest           CHAR(64),
    upload_idempotency_key    TEXT,
    pending_document_digest   CHAR(64),
    pending_upload_key        TEXT,
    pending_until             TIMESTAMPTZ,
    parser_version            TEXT,
    protected_suppressed      INTEGER     NOT NULL DEFAULT 0,
    unsupported_output        INTEGER     NOT NULL DEFAULT 0,
    upload_expires_at         TIMESTAMPTZ NOT NULL,
    first_upload_at           TIMESTAMPTZ,
    expires_at                TIMESTAMPTZ NOT NULL,
    created_at                TIMESTAMPTZ NOT NULL,
    updated_at                TIMESTAMPTZ NOT NULL,
    terminal_at               TIMESTAMPTZ,
    purged_at                 TIMESTAMPTZ,
    PRIMARY KEY (tenant_id, import_id),
    CONSTRAINT ats_resume_import_global_ref_unique UNIQUE (import_id),
    CONSTRAINT ats_resume_import_job_fk FOREIGN KEY (tenant_id, job_id)
        REFERENCES ats_job_posting (tenant_id, job_id),
    CONSTRAINT ats_resume_import_id_format CHECK (import_id ~ '^ri_[A-Za-z0-9_-]{24}$'),
    CONSTRAINT ats_resume_import_access_digest_format CHECK (
        candidate_access_digest ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ats_resume_import_request_digest_format CHECK (request_digest ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ats_resume_import_document_digest_format CHECK (
        document_digest IS NULL OR document_digest ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ats_resume_import_pending_digest_format CHECK (
        pending_document_digest IS NULL OR pending_document_digest ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ats_resume_import_pending_all_or_none CHECK (
        (pending_document_digest IS NULL AND pending_upload_key IS NULL AND pending_until IS NULL)
        OR (pending_document_digest IS NOT NULL AND pending_upload_key IS NOT NULL
            AND pending_until IS NOT NULL)),
    CONSTRAINT ats_resume_import_state_check CHECK (state IN (
        'ACTIVE','CONFIRMED','CANCELLED','REJECT_ALL','EXPIRED','FAILED','SUPERSEDED')),
    CONSTRAINT ats_resume_import_version_check CHECK (version >= 0 AND document_version >= 0),
    CONSTRAINT ats_resume_import_output_check CHECK (
        protected_suppressed >= 0 AND unsupported_output = 0),
    CONSTRAINT ats_resume_import_time_check CHECK (
        upload_expires_at <= expires_at AND created_at <= expires_at),
    CONSTRAINT ats_resume_import_terminal_check CHECK (
        (state = 'ACTIVE' AND terminal_at IS NULL)
        OR (state <> 'ACTIVE' AND terminal_at IS NOT NULL)),
    CONSTRAINT ats_resume_import_idempotency_unique UNIQUE (
        tenant_id, job_id, candidate_access_digest, idempotency_key)
);
CREATE UNIQUE INDEX ats_resume_import_one_active_idx
    ON ats_resume_import (tenant_id, job_id, candidate_access_digest)
    WHERE state = 'ACTIVE';
CREATE INDEX ats_resume_import_expiry_idx
    ON ats_resume_import (state, expires_at) WHERE state = 'ACTIVE';

-- Candidate-visible document lifecycle. It contains no raw digest, filename, OCR text or values.
CREATE TABLE ats_resume_document_version (
    tenant_id          TEXT        NOT NULL,
    import_id          TEXT        NOT NULL,
    document_version   INTEGER     NOT NULL,
    state              TEXT        NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL,
    superseded_at      TIMESTAMPTZ,
    PRIMARY KEY (tenant_id, import_id, document_version),
    CONSTRAINT ats_resume_document_version_import_fk FOREIGN KEY (tenant_id, import_id)
        REFERENCES ats_resume_import (tenant_id, import_id) ON DELETE CASCADE,
    CONSTRAINT ats_resume_document_version_positive CHECK (document_version > 0),
    CONSTRAINT ats_resume_document_version_state CHECK (
        state IN ('ACTIVE','VERSION_SUPERSEDED')),
    CONSTRAINT ats_resume_document_version_terminal CHECK (
        (state='ACTIVE' AND superseded_at IS NULL)
        OR (state='VERSION_SUPERSEDED' AND superseded_at IS NOT NULL))
);
CREATE UNIQUE INDEX ats_resume_document_one_active_idx
    ON ats_resume_document_version (tenant_id, import_id) WHERE state='ACTIVE';

CREATE TABLE ats_resume_proposal (
    tenant_id          TEXT             NOT NULL,
    import_id          TEXT             NOT NULL,
    field_key          TEXT             NOT NULL,
    proposed_value     TEXT             NOT NULL,
    candidate_value    TEXT,
    state              TEXT             NOT NULL,
    version            INTEGER          NOT NULL DEFAULT 0,
    source_page        INTEGER          NOT NULL,
    bbox_x             DOUBLE PRECISION NOT NULL,
    bbox_y             DOUBLE PRECISION NOT NULL,
    bbox_width         DOUBLE PRECISION NOT NULL,
    bbox_height        DOUBLE PRECISION NOT NULL,
    confidence         DOUBLE PRECISION NOT NULL,
    parser_version     TEXT             NOT NULL,
    created_at         TIMESTAMPTZ      NOT NULL,
    updated_at         TIMESTAMPTZ      NOT NULL,
    PRIMARY KEY (tenant_id, import_id, field_key),
    CONSTRAINT ats_resume_proposal_import_fk FOREIGN KEY (tenant_id, import_id)
        REFERENCES ats_resume_import (tenant_id, import_id) ON DELETE CASCADE,
    CONSTRAINT ats_resume_proposal_field_check CHECK (field_key IN (
        'FULL_NAME','EMAIL','PHONE','CITY','SUMMARY','EXPERIENCE','EDUCATION',
        'SKILLS','LANGUAGES','CERTIFICATIONS')),
    CONSTRAINT ats_resume_proposal_state_check CHECK (state IN (
        'UNREVIEWED','ACCEPTED','EDITED','REJECTED','CONTROL_REQUIRED')),
    CONSTRAINT ats_resume_proposal_bbox_check CHECK (
        source_page > 0 AND bbox_x >= 0 AND bbox_y >= 0
        AND bbox_width > 0 AND bbox_height > 0
        AND confidence >= 0 AND confidence <= 1),
    CONSTRAINT ats_resume_proposal_edit_check CHECK (
        (state = 'EDITED' AND candidate_value IS NOT NULL)
        OR (state <> 'EDITED' AND candidate_value IS NULL))
);

CREATE TABLE ats_candidate_draft (
    tenant_id                 TEXT        NOT NULL,
    draft_id                  UUID        NOT NULL,
    import_id                 TEXT        NOT NULL,
    job_id                    TEXT        NOT NULL,
    candidate_access_digest   CHAR(64)    NOT NULL,
    version                   INTEGER     NOT NULL DEFAULT 0,
    consumed_application_id   UUID,
    created_at                TIMESTAMPTZ NOT NULL,
    expires_at                TIMESTAMPTZ NOT NULL,
    consumed_at               TIMESTAMPTZ,
    PRIMARY KEY (tenant_id, draft_id),
    CONSTRAINT ats_candidate_draft_import_unique UNIQUE (tenant_id, import_id),
    CONSTRAINT ats_candidate_draft_import_fk FOREIGN KEY (tenant_id, import_id)
        REFERENCES ats_resume_import (tenant_id, import_id),
    CONSTRAINT ats_candidate_draft_job_fk FOREIGN KEY (tenant_id, job_id)
        REFERENCES ats_job_posting (tenant_id, job_id),
    CONSTRAINT ats_candidate_draft_access_digest_format CHECK (
        candidate_access_digest ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ats_candidate_draft_version_check CHECK (version >= 0)
);
CREATE INDEX ats_candidate_draft_expiry_idx
    ON ats_candidate_draft (expires_at) WHERE consumed_application_id IS NULL;

CREATE TABLE ats_candidate_draft_field (
    tenant_id     TEXT        NOT NULL,
    draft_id      UUID        NOT NULL,
    field_key     TEXT        NOT NULL,
    field_value   TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (tenant_id, draft_id, field_key),
    CONSTRAINT ats_candidate_draft_field_draft_fk FOREIGN KEY (tenant_id, draft_id)
        REFERENCES ats_candidate_draft (tenant_id, draft_id) ON DELETE CASCADE,
    CONSTRAINT ats_candidate_draft_field_key_check CHECK (field_key IN (
        'FULL_NAME','EMAIL','PHONE','CITY','SUMMARY','EXPERIENCE','EDUCATION',
        'SKILLS','LANGUAGES','CERTIFICATIONS'))
);

-- Import origin is retained for aggregate governance, but is deliberately absent from recruiter
-- DTOs. The binding and draft consumption happen in the same transaction as application submit.
ALTER TABLE ats_application
    ADD COLUMN application_source TEXT NOT NULL DEFAULT 'MANUAL_ONLY',
    ADD COLUMN resume_import_id TEXT,
    ADD CONSTRAINT ats_application_source_check CHECK (
        application_source IN ('PDF_CONFIRMED','MANUAL_ONLY','MANUAL_AFTER_IMPORT')),
    ADD CONSTRAINT ats_application_source_binding_check CHECK (
        (application_source = 'MANUAL_ONLY' AND resume_import_id IS NULL)
        OR (application_source <> 'MANUAL_ONLY' AND resume_import_id IS NOT NULL)),
    ADD CONSTRAINT ats_application_resume_import_fk
        FOREIGN KEY (tenant_id, resume_import_id)
        REFERENCES ats_resume_import (tenant_id, import_id);

ALTER TABLE ats_candidate_draft
    ADD CONSTRAINT ats_candidate_draft_consumed_application_fk
        FOREIGN KEY (tenant_id, consumed_application_id)
        REFERENCES ats_application (tenant_id, application_id);

GRANT INSERT, SELECT, UPDATE, DELETE ON ats_resume_import TO ats_app;
GRANT INSERT, SELECT, UPDATE, DELETE ON ats_resume_proposal TO ats_app;
GRANT INSERT, SELECT, UPDATE, DELETE ON ats_candidate_draft TO ats_app;
GRANT INSERT, SELECT, UPDATE, DELETE ON ats_candidate_draft_field TO ats_app;
GRANT INSERT, SELECT, UPDATE, DELETE ON ats_resume_document_version TO ats_app;
