-- Faz 25 completed interview -> offer -> candidate response -> hire vertical slice.
-- Offer terms are versioned; candidate response is ATS process intent, not legal e-signature.

ALTER TABLE ats_application
    DROP CONSTRAINT ats_application_status_check;
ALTER TABLE ats_application
    ADD CONSTRAINT ats_application_status_check CHECK (
        status IN ('SUBMITTED','UNDER_REVIEW','INTERVIEW_PENDING','REJECTED','WITHDRAWN',
                   'OFFER_PENDING','OFFER_ACCEPTED','OFFER_DECLINED','OFFER_WITHDRAWN','HIRED'));

ALTER TABLE ats_application_event
    DROP CONSTRAINT ats_application_event_from_check;
ALTER TABLE ats_application_event
    DROP CONSTRAINT ats_application_event_to_check;
ALTER TABLE ats_application_event
    ADD CONSTRAINT ats_application_event_from_check CHECK (
        from_status IS NULL OR from_status IN (
            'SUBMITTED','UNDER_REVIEW','INTERVIEW_PENDING','REJECTED','WITHDRAWN',
            'OFFER_PENDING','OFFER_ACCEPTED','OFFER_DECLINED','OFFER_WITHDRAWN','HIRED'));
ALTER TABLE ats_application_event
    ADD CONSTRAINT ats_application_event_to_check CHECK (
        to_status IN ('SUBMITTED','UNDER_REVIEW','INTERVIEW_PENDING','REJECTED','WITHDRAWN',
                      'OFFER_PENDING','OFFER_ACCEPTED','OFFER_DECLINED','OFFER_WITHDRAWN','HIRED'));

CREATE TABLE ats_offer (
    tenant_id            TEXT           NOT NULL,
    offer_id             TEXT           NOT NULL,
    application_id       UUID           NOT NULL,
    role_title           TEXT           NOT NULL,
    start_date           DATE           NOT NULL,
    employment_type      TEXT           NOT NULL,
    work_mode            TEXT           NOT NULL,
    location             TEXT           NOT NULL,
    compensation_amount  NUMERIC(14,2)  NOT NULL,
    currency             CHAR(3)        NOT NULL,
    pay_period           TEXT           NOT NULL,
    expires_at           TIMESTAMPTZ    NOT NULL,
    terms_summary        TEXT           NOT NULL,
    status               TEXT           NOT NULL,
    version              INTEGER        NOT NULL DEFAULT 0,
    created_by           TEXT           NOT NULL,
    created_at           TIMESTAMPTZ    NOT NULL,
    updated_at           TIMESTAMPTZ    NOT NULL,
    PRIMARY KEY (tenant_id, offer_id),
    CONSTRAINT ats_offer_global_ref_unique UNIQUE (offer_id),
    CONSTRAINT ats_offer_application_fk FOREIGN KEY (tenant_id, application_id)
        REFERENCES ats_application (tenant_id, application_id),
    CONSTRAINT ats_offer_id_format CHECK (offer_id ~ '^off_[A-Za-z0-9_-]{24}$'),
    CONSTRAINT ats_offer_role_check CHECK (length(role_title) BETWEEN 2 AND 160),
    CONSTRAINT ats_offer_employment_check CHECK (length(employment_type) BETWEEN 2 AND 120),
    CONSTRAINT ats_offer_mode_check CHECK (work_mode IN ('REMOTE','HYBRID','ONSITE')),
    CONSTRAINT ats_offer_location_check CHECK (length(location) BETWEEN 2 AND 240),
    CONSTRAINT ats_offer_amount_check CHECK (compensation_amount > 0),
    CONSTRAINT ats_offer_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT ats_offer_period_check CHECK (pay_period IN ('HOURLY','MONTHLY','ANNUAL')),
    CONSTRAINT ats_offer_summary_check CHECK (length(terms_summary) BETWEEN 10 AND 4000),
    CONSTRAINT ats_offer_status_check CHECK (
        status IN ('DRAFT','EXTENDED','ACCEPTED','DECLINED','WITHDRAWN','HIRED')),
    CONSTRAINT ats_offer_version_check CHECK (version >= 0),
    CONSTRAINT ats_offer_actor_check CHECK (length(created_by) BETWEEN 1 AND 200)
);
CREATE INDEX ats_offer_application_idx
    ON ats_offer (tenant_id, application_id, created_at DESC, offer_id);
CREATE UNIQUE INDEX ats_offer_one_active_per_application_idx
    ON ats_offer (tenant_id, application_id)
    WHERE status IN ('DRAFT','EXTENDED','ACCEPTED');

CREATE TABLE ats_offer_revision (
    tenant_id            TEXT           NOT NULL,
    offer_id             TEXT           NOT NULL,
    version              INTEGER        NOT NULL,
    role_title           TEXT           NOT NULL,
    start_date           DATE           NOT NULL,
    employment_type      TEXT           NOT NULL,
    work_mode            TEXT           NOT NULL,
    location             TEXT           NOT NULL,
    compensation_amount  NUMERIC(14,2)  NOT NULL,
    currency             CHAR(3)        NOT NULL,
    pay_period           TEXT           NOT NULL,
    expires_at           TIMESTAMPTZ    NOT NULL,
    terms_summary        TEXT           NOT NULL,
    status               TEXT           NOT NULL,
    reason               TEXT           NOT NULL,
    actor_ref            TEXT           NOT NULL,
    occurred_at          TIMESTAMPTZ    NOT NULL,
    PRIMARY KEY (tenant_id, offer_id, version),
    CONSTRAINT ats_offer_revision_offer_fk FOREIGN KEY (tenant_id, offer_id)
        REFERENCES ats_offer (tenant_id, offer_id),
    CONSTRAINT ats_offer_revision_version_check CHECK (version >= 0),
    CONSTRAINT ats_offer_revision_role_check CHECK (length(role_title) BETWEEN 2 AND 160),
    CONSTRAINT ats_offer_revision_mode_check CHECK (work_mode IN ('REMOTE','HYBRID','ONSITE')),
    CONSTRAINT ats_offer_revision_amount_check CHECK (compensation_amount > 0),
    CONSTRAINT ats_offer_revision_period_check CHECK (pay_period IN ('HOURLY','MONTHLY','ANNUAL')),
    CONSTRAINT ats_offer_revision_status_check CHECK (
        status IN ('DRAFT','EXTENDED','ACCEPTED','DECLINED','WITHDRAWN','HIRED')),
    CONSTRAINT ats_offer_revision_reason_check CHECK (length(reason) BETWEEN 5 AND 500),
    CONSTRAINT ats_offer_revision_actor_check CHECK (length(actor_ref) BETWEEN 1 AND 200)
);

CREATE TABLE ats_offer_command_idempotency (
    tenant_id       TEXT        NOT NULL,
    actor_ref       TEXT        NOT NULL,
    idempotency_key TEXT        NOT NULL,
    command_type    TEXT        NOT NULL,
    request_digest  CHAR(64)    NOT NULL,
    offer_id        TEXT,
    result_version  INTEGER,
    created_at      TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (tenant_id, actor_ref, idempotency_key),
    CONSTRAINT ats_offer_command_actor_check CHECK (length(actor_ref) BETWEEN 1 AND 200),
    CONSTRAINT ats_offer_command_key_check CHECK (
        idempotency_key ~ '^[A-Za-z0-9._:-]{16,128}$'),
    CONSTRAINT ats_offer_command_type_check CHECK (
        command_type IN ('CREATE','UPDATE','EXTEND','WITHDRAW','HIRE','ACCEPT','DECLINE')),
    CONSTRAINT ats_offer_command_digest_check CHECK (request_digest ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ats_offer_command_version_check CHECK (result_version IS NULL OR result_version >= 0)
);
CREATE INDEX ats_offer_command_created_idx
    ON ats_offer_command_idempotency (tenant_id, created_at);

GRANT INSERT, SELECT, UPDATE ON ats_offer TO ats_app;
GRANT INSERT, SELECT ON ats_offer_revision TO ats_app;
GRANT INSERT, SELECT, UPDATE, DELETE ON ats_offer_command_idempotency TO ats_app;
