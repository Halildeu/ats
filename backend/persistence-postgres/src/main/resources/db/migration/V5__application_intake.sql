-- Faz 25 Full ATS müşteri-dikey dilimi: yayınlanmış ilan -> kalıcı başvuru ->
-- aday durum takibi -> tenant-scoped recruiter inbox.
-- PII application tablosunda silinebilir düzlemdedir; event tablosu pointer/state-only.

CREATE TABLE ats_job_posting (
    tenant_id       TEXT        NOT NULL,
    job_id          TEXT        NOT NULL,
    slug            TEXT        NOT NULL,
    title           TEXT        NOT NULL,
    team            TEXT        NOT NULL,
    location        TEXT        NOT NULL,
    mode             TEXT        NOT NULL,
    employment_type TEXT        NOT NULL,
    summary          TEXT        NOT NULL,
    highlights       JSONB       NOT NULL DEFAULT '[]'::jsonb,
    published        BOOLEAN     NOT NULL DEFAULT false,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, job_id),
    CONSTRAINT ats_job_posting_tenant_slug_unique UNIQUE (tenant_id, slug),
    CONSTRAINT ats_job_posting_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+){0,15}$'),
    CONSTRAINT ats_job_posting_highlights_array CHECK (jsonb_typeof(highlights) = 'array')
);
CREATE INDEX ats_job_posting_public_idx ON ats_job_posting (published, updated_at DESC);

CREATE TABLE ats_application (
    tenant_id              TEXT        NOT NULL,
    application_id         UUID        NOT NULL,
    public_ref             TEXT        NOT NULL,
    job_id                 TEXT        NOT NULL,
    full_name              TEXT,
    email                  TEXT,
    phone                  TEXT,
    city                   TEXT,
    linkedin_url           TEXT,
    portfolio_url          TEXT,
    professional_summary   TEXT,
    experience             TEXT,
    education              TEXT,
    skills                 JSONB       NOT NULL DEFAULT '[]'::jsonb,
    note                   TEXT,
    status                 TEXT        NOT NULL,
    version                INTEGER     NOT NULL DEFAULT 0,
    candidate_access_digest CHAR(64)   NOT NULL,
    notice_version         TEXT        NOT NULL,
    notice_accepted_at     TIMESTAMPTZ NOT NULL,
    accuracy_confirmed_at  TIMESTAMPTZ NOT NULL,
    created_at             TIMESTAMPTZ NOT NULL,
    updated_at             TIMESTAMPTZ NOT NULL,
    personal_data_erased_at TIMESTAMPTZ,
    PRIMARY KEY (tenant_id, application_id),
    CONSTRAINT ats_application_public_ref_unique UNIQUE (public_ref),
    CONSTRAINT ats_application_access_digest_unique UNIQUE (candidate_access_digest),
    CONSTRAINT ats_application_job_fk FOREIGN KEY (tenant_id, job_id)
        REFERENCES ats_job_posting (tenant_id, job_id),
    CONSTRAINT ats_application_public_ref_format CHECK (public_ref ~ '^app_[A-Za-z0-9_-]{24}$'),
    CONSTRAINT ats_application_status_check CHECK (status IN ('SUBMITTED', 'UNDER_REVIEW', 'INTERVIEW_PENDING')),
    CONSTRAINT ats_application_version_check CHECK (version >= 0),
    CONSTRAINT ats_application_access_digest_format CHECK (candidate_access_digest ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ats_application_skills_array CHECK (jsonb_typeof(skills) = 'array')
);
CREATE INDEX ats_application_inbox_idx
    ON ats_application (tenant_id, job_id, status, created_at DESC);
CREATE INDEX ats_application_tenant_created_idx
    ON ats_application (tenant_id, created_at DESC);

CREATE TABLE ats_application_event (
    event_id        BIGSERIAL   PRIMARY KEY,
    tenant_id       TEXT        NOT NULL,
    application_id  UUID        NOT NULL,
    from_status     TEXT,
    to_status       TEXT        NOT NULL,
    actor_ref       TEXT        NOT NULL,
    occurred_at     TIMESTAMPTZ NOT NULL,
    CONSTRAINT ats_application_event_app_fk FOREIGN KEY (tenant_id, application_id)
        REFERENCES ats_application (tenant_id, application_id),
    CONSTRAINT ats_application_event_from_check CHECK (
        from_status IS NULL OR from_status IN ('SUBMITTED', 'UNDER_REVIEW', 'INTERVIEW_PENDING')),
    CONSTRAINT ats_application_event_to_check CHECK (
        to_status IN ('SUBMITTED', 'UNDER_REVIEW', 'INTERVIEW_PENDING'))
);
CREATE INDEX ats_application_event_history_idx
    ON ats_application_event (tenant_id, application_id, event_id);

CREATE TABLE ats_application_idempotency (
    tenant_id       TEXT        NOT NULL,
    job_id          TEXT        NOT NULL,
    idempotency_key TEXT        NOT NULL,
    request_digest  CHAR(64)    NOT NULL,
    application_id  UUID,
    created_at      TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (tenant_id, job_id, idempotency_key),
    CONSTRAINT ats_application_idempotency_job_fk FOREIGN KEY (tenant_id, job_id)
        REFERENCES ats_job_posting (tenant_id, job_id),
    CONSTRAINT ats_application_idempotency_app_fk FOREIGN KEY (tenant_id, application_id)
        REFERENCES ats_application (tenant_id, application_id),
    CONSTRAINT ats_application_idempotency_key_format CHECK (
        idempotency_key ~ '^[A-Za-z0-9._:-]{16,128}$'),
    CONSTRAINT ats_application_idempotency_digest_format CHECK (request_digest ~ '^[0-9a-f]{64}$')
);
CREATE INDEX ats_application_idempotency_created_idx
    ON ats_application_idempotency (tenant_id, created_at);

-- Test ortamındaki sentetik ürün kataloğu. Tenant, platform test personasının
-- canonical org/tenant anchor'ıdır; body/header ile override edilemez.
INSERT INTO ats_job_posting
    (tenant_id, job_id, slug, title, team, location, mode, employment_type,
     summary, highlights, published)
VALUES
    ('00000000-0000-0000-0000-000000000001', 'job-product-manager', 'urun-yoneticisi',
     'Ürün Yöneticisi', 'Ürün ve Deneyim', 'İstanbul', 'Hibrit', 'Tam zamanlı',
     'Kullanıcı ihtiyaçlarını ölçülebilir ürün sonuçlarına dönüştürün; keşiften teslimata kadar ekiplerle birlikte ilerleyin.',
     '["Ürün keşfi","Yol haritası","Kullanıcı araştırması"]'::jsonb, true),
    ('00000000-0000-0000-0000-000000000001', 'job-senior-frontend', 'senior-frontend-developer',
     'Senior Frontend Developer', 'Platform Engineering', 'İstanbul', 'Hibrit', 'Tam zamanlı',
     'Erişilebilir, hızlı ve güvenilir ürün yüzeyleri geliştirin; tasarım sistemi ve platform ekipleriyle ölçeklenebilir deneyimler kurun.',
     '["React","TypeScript","Erişilebilirlik"]'::jsonb, true),
    ('00000000-0000-0000-0000-000000000001', 'job-product-designer', 'product-designer',
     'Product Designer', 'Ürün ve Deneyim', 'Türkiye', 'Uzaktan', 'Tam zamanlı',
     'Araştırma içgörülerini anlaşılır akışlara dönüştürün; ürün ekipleriyle uçtan uca ve kapsayıcı deneyimler tasarlayın.',
     '["Ürün tasarımı","Prototipleme","Tasarım sistemi"]'::jsonb, true);

GRANT SELECT ON ats_job_posting TO ats_app;
GRANT INSERT, SELECT, UPDATE, DELETE ON ats_application TO ats_app;
GRANT INSERT, SELECT ON ats_application_event TO ats_app;
GRANT INSERT, SELECT, UPDATE, DELETE ON ats_application_idempotency TO ats_app;
GRANT USAGE, SELECT ON SEQUENCE ats_application_event_event_id_seq TO ats_app;
