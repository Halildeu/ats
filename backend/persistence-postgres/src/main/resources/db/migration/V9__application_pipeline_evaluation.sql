-- Faz 25 recruiter detail + immutable human evaluation + candidate history.
-- V8 is reserved by the candidate resume-import slice (#163/#184); this
-- additive migration can be validated after V7 but test/prod promotion order
-- remains V8 -> V9.

ALTER TABLE ats_application
    DROP CONSTRAINT ats_application_status_check;
ALTER TABLE ats_application
    ADD CONSTRAINT ats_application_status_check CHECK (
        status IN ('SUBMITTED', 'UNDER_REVIEW', 'INTERVIEW_PENDING',
                   'REJECTED', 'WITHDRAWN'));

ALTER TABLE ats_application_event
    DROP CONSTRAINT ats_application_event_from_check;
ALTER TABLE ats_application_event
    DROP CONSTRAINT ats_application_event_to_check;
ALTER TABLE ats_application_event
    ADD CONSTRAINT ats_application_event_from_check CHECK (
        from_status IS NULL OR from_status IN (
            'SUBMITTED', 'UNDER_REVIEW', 'INTERVIEW_PENDING',
            'REJECTED', 'WITHDRAWN'));
ALTER TABLE ats_application_event
    ADD CONSTRAINT ats_application_event_to_check CHECK (
        to_status IN ('SUBMITTED', 'UNDER_REVIEW', 'INTERVIEW_PENDING',
                      'REJECTED', 'WITHDRAWN'));

CREATE TABLE ats_application_evaluation (
    tenant_id                 TEXT        NOT NULL,
    evaluation_id             TEXT        NOT NULL,
    application_id            UUID        NOT NULL,
    actor_ref                  TEXT        NOT NULL,
    policy_version             TEXT        NOT NULL,
    job_relatedness_confirmed  BOOLEAN     NOT NULL,
    recommendation            TEXT        NOT NULL,
    criteria                  JSONB       NOT NULL,
    summary                   TEXT        NOT NULL,
    predecessor_evaluation_id TEXT,
    revision                   INTEGER     NOT NULL,
    created_at                 TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (tenant_id, evaluation_id),
    CONSTRAINT ats_application_evaluation_global_ref_unique UNIQUE (evaluation_id),
    CONSTRAINT ats_application_evaluation_app_fk
        FOREIGN KEY (tenant_id, application_id)
        REFERENCES ats_application (tenant_id, application_id),
    CONSTRAINT ats_application_evaluation_predecessor_fk
        FOREIGN KEY (tenant_id, predecessor_evaluation_id)
        REFERENCES ats_application_evaluation (tenant_id, evaluation_id),
    CONSTRAINT ats_application_evaluation_id_format CHECK (
        evaluation_id ~ '^eval_[A-Za-z0-9_-]{24}$'),
    CONSTRAINT ats_application_evaluation_actor_check CHECK (
        length(actor_ref) BETWEEN 1 AND 200),
    CONSTRAINT ats_application_evaluation_policy_check CHECK (
        policy_version = 'structured-evaluation-v1'),
    CONSTRAINT ats_application_evaluation_job_related_check CHECK (
        job_relatedness_confirmed = true),
    CONSTRAINT ats_application_evaluation_recommendation_check CHECK (
        recommendation IN ('ADVANCE', 'HOLD', 'NO_HIRE')),
    CONSTRAINT ats_application_evaluation_criteria_check CHECK (
        jsonb_typeof(criteria) = 'array' AND jsonb_array_length(criteria) BETWEEN 1 AND 12),
    CONSTRAINT ats_application_evaluation_summary_check CHECK (
        length(summary) BETWEEN 10 AND 4000),
    CONSTRAINT ats_application_evaluation_revision_check CHECK (revision >= 1),
    CONSTRAINT ats_application_evaluation_actor_revision_unique UNIQUE (
        tenant_id, application_id, actor_ref, revision)
);
CREATE INDEX ats_application_evaluation_history_idx
    ON ats_application_evaluation (tenant_id, application_id, created_at, revision);

CREATE TABLE ats_application_evaluation_idempotency (
    tenant_id       TEXT        NOT NULL,
    actor_ref       TEXT        NOT NULL,
    idempotency_key TEXT        NOT NULL,
    request_digest  CHAR(64)    NOT NULL,
    evaluation_id   TEXT,
    created_at      TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (tenant_id, actor_ref, idempotency_key),
    CONSTRAINT ats_application_evaluation_idemp_eval_fk
        FOREIGN KEY (tenant_id, evaluation_id)
        REFERENCES ats_application_evaluation (tenant_id, evaluation_id),
    CONSTRAINT ats_application_evaluation_idemp_actor_check CHECK (
        length(actor_ref) BETWEEN 1 AND 200),
    CONSTRAINT ats_application_evaluation_idemp_key_format CHECK (
        idempotency_key ~ '^[A-Za-z0-9._:-]{16,128}$'),
    CONSTRAINT ats_application_evaluation_idemp_digest_format CHECK (
        request_digest ~ '^[0-9a-f]{64}$')
);
CREATE INDEX ats_application_evaluation_idemp_created_idx
    ON ats_application_evaluation_idempotency (tenant_id, created_at);

GRANT INSERT, SELECT ON ats_application_evaluation TO ats_app;
GRANT INSERT, SELECT, UPDATE, DELETE ON ats_application_evaluation_idempotency TO ats_app;
