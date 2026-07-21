-- Faz 25 application -> interview vertical slice. Current schedule is mutable
-- under CAS, while every schedule and scorecard revision is append-only.

CREATE TABLE ats_interview (
    tenant_id       TEXT        NOT NULL,
    interview_id    TEXT        NOT NULL,
    application_id  UUID        NOT NULL,
    interview_type  TEXT        NOT NULL,
    starts_at       TIMESTAMPTZ NOT NULL,
    ends_at         TIMESTAMPTZ NOT NULL,
    time_zone       TEXT        NOT NULL,
    mode            TEXT        NOT NULL,
    location        TEXT        NOT NULL,
    status          TEXT        NOT NULL,
    version         INTEGER     NOT NULL DEFAULT 0,
    created_by      TEXT        NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (tenant_id, interview_id),
    CONSTRAINT ats_interview_global_ref_unique UNIQUE (interview_id),
    CONSTRAINT ats_interview_application_fk FOREIGN KEY (tenant_id, application_id)
        REFERENCES ats_application (tenant_id, application_id),
    CONSTRAINT ats_interview_id_format CHECK (interview_id ~ '^int_[A-Za-z0-9_-]{24}$'),
    CONSTRAINT ats_interview_type_check CHECK (
        interview_type IN ('SCREENING','TECHNICAL','BEHAVIORAL','PANEL','FINAL')),
    CONSTRAINT ats_interview_time_check CHECK (
        ends_at >= starts_at + interval '15 minutes'
        AND ends_at <= starts_at + interval '8 hours'),
    CONSTRAINT ats_interview_mode_check CHECK (mode IN ('VIDEO','PHONE','ONSITE')),
    CONSTRAINT ats_interview_location_check CHECK (length(location) BETWEEN 2 AND 500),
    CONSTRAINT ats_interview_status_check CHECK (status IN ('SCHEDULED','COMPLETED','CANCELLED')),
    CONSTRAINT ats_interview_version_check CHECK (version >= 0),
    CONSTRAINT ats_interview_actor_check CHECK (length(created_by) BETWEEN 1 AND 200)
);
CREATE INDEX ats_interview_application_idx
    ON ats_interview (tenant_id, application_id, starts_at, interview_id);
CREATE INDEX ats_interview_schedule_idx
    ON ats_interview (tenant_id, status, starts_at, interview_id);

CREATE TABLE ats_interview_participant (
    tenant_id       TEXT        NOT NULL,
    interview_id    TEXT        NOT NULL,
    actor_ref       TEXT        NOT NULL,
    display_label   TEXT        NOT NULL,
    participant_role TEXT       NOT NULL,
    ordinal         INTEGER     NOT NULL,
    PRIMARY KEY (tenant_id, interview_id, actor_ref),
    CONSTRAINT ats_interview_participant_interview_fk FOREIGN KEY (tenant_id, interview_id)
        REFERENCES ats_interview (tenant_id, interview_id),
    CONSTRAINT ats_interview_participant_actor_check CHECK (length(actor_ref) BETWEEN 1 AND 200),
    CONSTRAINT ats_interview_participant_label_check CHECK (length(display_label) BETWEEN 1 AND 120),
    CONSTRAINT ats_interview_participant_role_check CHECK (participant_role IN ('LEAD','INTERVIEWER')),
    CONSTRAINT ats_interview_participant_ordinal_check CHECK (ordinal BETWEEN 0 AND 11)
);
CREATE UNIQUE INDEX ats_interview_single_lead_idx
    ON ats_interview_participant (tenant_id, interview_id)
    WHERE participant_role = 'LEAD';
CREATE INDEX ats_interview_participant_actor_idx
    ON ats_interview_participant (tenant_id, actor_ref, interview_id);

CREATE TABLE ats_interview_criterion (
    tenant_id       TEXT        NOT NULL,
    interview_id    TEXT        NOT NULL,
    criterion_key   TEXT        NOT NULL,
    label           TEXT        NOT NULL,
    question        TEXT        NOT NULL,
    evidence_prompt TEXT        NOT NULL,
    ordinal         INTEGER     NOT NULL,
    PRIMARY KEY (tenant_id, interview_id, criterion_key),
    CONSTRAINT ats_interview_criterion_interview_fk FOREIGN KEY (tenant_id, interview_id)
        REFERENCES ats_interview (tenant_id, interview_id),
    CONSTRAINT ats_interview_criterion_key_check CHECK (
        criterion_key ~ '^[a-z][a-z0-9_-]{1,63}$'),
    CONSTRAINT ats_interview_criterion_label_check CHECK (length(label) BETWEEN 2 AND 120),
    CONSTRAINT ats_interview_criterion_question_check CHECK (length(question) BETWEEN 10 AND 500),
    CONSTRAINT ats_interview_criterion_prompt_check CHECK (length(evidence_prompt) BETWEEN 10 AND 500),
    CONSTRAINT ats_interview_criterion_ordinal_check CHECK (ordinal BETWEEN 0 AND 11)
);

CREATE TABLE ats_interview_schedule_revision (
    tenant_id       TEXT        NOT NULL,
    interview_id    TEXT        NOT NULL,
    version         INTEGER     NOT NULL,
    starts_at       TIMESTAMPTZ NOT NULL,
    ends_at         TIMESTAMPTZ NOT NULL,
    time_zone       TEXT        NOT NULL,
    mode            TEXT        NOT NULL,
    location        TEXT        NOT NULL,
    status          TEXT        NOT NULL,
    reason          TEXT        NOT NULL,
    actor_ref       TEXT        NOT NULL,
    occurred_at     TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (tenant_id, interview_id, version),
    CONSTRAINT ats_interview_schedule_revision_fk FOREIGN KEY (tenant_id, interview_id)
        REFERENCES ats_interview (tenant_id, interview_id),
    CONSTRAINT ats_interview_schedule_revision_version_check CHECK (version >= 0),
    CONSTRAINT ats_interview_schedule_revision_time_check CHECK (
        ends_at >= starts_at + interval '15 minutes'
        AND ends_at <= starts_at + interval '8 hours'),
    CONSTRAINT ats_interview_schedule_revision_mode_check CHECK (mode IN ('VIDEO','PHONE','ONSITE')),
    CONSTRAINT ats_interview_schedule_revision_status_check CHECK (
        status IN ('SCHEDULED','COMPLETED','CANCELLED')),
    CONSTRAINT ats_interview_schedule_revision_reason_check CHECK (length(reason) BETWEEN 5 AND 500),
    CONSTRAINT ats_interview_schedule_revision_actor_check CHECK (length(actor_ref) BETWEEN 1 AND 200)
);

CREATE TABLE ats_interview_scorecard (
    tenant_id                 TEXT        NOT NULL,
    scorecard_id              TEXT        NOT NULL,
    interview_id              TEXT        NOT NULL,
    actor_ref                  TEXT        NOT NULL,
    policy_version             TEXT        NOT NULL,
    job_relatedness_confirmed  BOOLEAN     NOT NULL,
    recommendation            TEXT        NOT NULL,
    summary                   TEXT        NOT NULL,
    predecessor_scorecard_id  TEXT,
    revision                  INTEGER     NOT NULL,
    created_at                TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (tenant_id, scorecard_id),
    CONSTRAINT ats_interview_scorecard_global_ref_unique UNIQUE (scorecard_id),
    CONSTRAINT ats_interview_scorecard_interview_fk FOREIGN KEY (tenant_id, interview_id)
        REFERENCES ats_interview (tenant_id, interview_id),
    CONSTRAINT ats_interview_scorecard_participant_fk FOREIGN KEY (tenant_id, interview_id, actor_ref)
        REFERENCES ats_interview_participant (tenant_id, interview_id, actor_ref),
    CONSTRAINT ats_interview_scorecard_predecessor_fk FOREIGN KEY (tenant_id, predecessor_scorecard_id)
        REFERENCES ats_interview_scorecard (tenant_id, scorecard_id),
    CONSTRAINT ats_interview_scorecard_id_format CHECK (scorecard_id ~ '^isc_[A-Za-z0-9_-]{24}$'),
    CONSTRAINT ats_interview_scorecard_policy_check CHECK (policy_version = 'structured-interview-v1'),
    CONSTRAINT ats_interview_scorecard_related_check CHECK (job_relatedness_confirmed = true),
    CONSTRAINT ats_interview_scorecard_recommendation_check CHECK (
        recommendation IN ('ADVANCE','HOLD','NO_HIRE')),
    CONSTRAINT ats_interview_scorecard_summary_check CHECK (length(summary) BETWEEN 10 AND 4000),
    CONSTRAINT ats_interview_scorecard_revision_check CHECK (revision >= 1),
    CONSTRAINT ats_interview_scorecard_actor_revision_unique UNIQUE (
        tenant_id, interview_id, actor_ref, revision)
);
CREATE INDEX ats_interview_scorecard_history_idx
    ON ats_interview_scorecard (tenant_id, interview_id, actor_ref, revision);

CREATE TABLE ats_interview_scorecard_rating (
    tenant_id       TEXT        NOT NULL,
    scorecard_id    TEXT        NOT NULL,
    criterion_key   TEXT        NOT NULL,
    rating          INTEGER     NOT NULL,
    evidence        TEXT        NOT NULL,
    ordinal         INTEGER     NOT NULL,
    PRIMARY KEY (tenant_id, scorecard_id, criterion_key),
    CONSTRAINT ats_interview_scorecard_rating_scorecard_fk FOREIGN KEY (tenant_id, scorecard_id)
        REFERENCES ats_interview_scorecard (tenant_id, scorecard_id),
    CONSTRAINT ats_interview_scorecard_rating_value_check CHECK (rating BETWEEN 1 AND 4),
    CONSTRAINT ats_interview_scorecard_rating_evidence_check CHECK (length(evidence) BETWEEN 10 AND 2000),
    CONSTRAINT ats_interview_scorecard_rating_ordinal_check CHECK (ordinal BETWEEN 0 AND 11)
);

CREATE TABLE ats_interview_command_idempotency (
    tenant_id       TEXT        NOT NULL,
    actor_ref       TEXT        NOT NULL,
    idempotency_key TEXT        NOT NULL,
    command_type    TEXT        NOT NULL,
    request_digest  CHAR(64)    NOT NULL,
    interview_id    TEXT,
    result_ref      TEXT,
    result_version  INTEGER,
    created_at      TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (tenant_id, actor_ref, idempotency_key),
    CONSTRAINT ats_interview_command_actor_check CHECK (length(actor_ref) BETWEEN 1 AND 200),
    CONSTRAINT ats_interview_command_key_check CHECK (
        idempotency_key ~ '^[A-Za-z0-9._:-]{16,128}$'),
    CONSTRAINT ats_interview_command_type_check CHECK (
        command_type IN ('CREATE','RESCHEDULE','CANCEL','COMPLETE','SCORECARD')),
    CONSTRAINT ats_interview_command_digest_check CHECK (request_digest ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ats_interview_command_version_check CHECK (result_version IS NULL OR result_version >= 0)
);
CREATE INDEX ats_interview_command_created_idx
    ON ats_interview_command_idempotency (tenant_id, created_at);

GRANT INSERT, SELECT, UPDATE ON ats_interview TO ats_app;
GRANT INSERT, SELECT ON ats_interview_participant TO ats_app;
GRANT INSERT, SELECT ON ats_interview_criterion TO ats_app;
GRANT INSERT, SELECT ON ats_interview_schedule_revision TO ats_app;
GRANT INSERT, SELECT ON ats_interview_scorecard TO ats_app;
GRANT INSERT, SELECT ON ats_interview_scorecard_rating TO ats_app;
GRANT INSERT, SELECT, UPDATE, DELETE ON ats_interview_command_idempotency TO ats_app;
