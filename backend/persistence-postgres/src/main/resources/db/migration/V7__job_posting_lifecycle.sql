-- ATS-0022 / Full ATS first customer slice.
-- Additive rolling migration: `published` remains a temporary compatibility
-- column, but the invariant below prevents it becoming a second truth.

ALTER TABLE ats_job_posting
    ADD COLUMN status TEXT,
    ADD COLUMN apply_enabled BOOLEAN,
    ADD COLUMN version INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN created_by TEXT,
    ADD COLUMN updated_by TEXT,
    ADD COLUMN application_fields JSONB,
    ADD COLUMN notice_version TEXT;

UPDATE ats_job_posting
   SET status = CASE WHEN published THEN 'PUBLISHED' ELSE 'DRAFT' END,
       apply_enabled = published,
       created_by = 'migration:v7',
       updated_by = 'migration:v7',
       application_fields = '["fullName","email","phone","city","linkedIn","portfolio","summary","experience","education","skills","note"]'::jsonb,
       notice_version = 'kvkk-application-v1';

ALTER TABLE ats_job_posting
    ALTER COLUMN status SET NOT NULL,
    ALTER COLUMN apply_enabled SET NOT NULL,
    ALTER COLUMN created_by SET NOT NULL,
    ALTER COLUMN created_by SET DEFAULT 'legacy:v5-writer',
    ALTER COLUMN updated_by SET NOT NULL,
    ALTER COLUMN updated_by SET DEFAULT 'legacy:v5-writer',
    ALTER COLUMN application_fields SET NOT NULL,
    ALTER COLUMN application_fields SET DEFAULT '["fullName","email","phone","city","linkedIn","portfolio","summary","experience","education","skills","note"]'::jsonb,
    ALTER COLUMN notice_version SET NOT NULL,
    ALTER COLUMN notice_version SET DEFAULT 'kvkk-application-v1',
    ADD CONSTRAINT ats_job_posting_status_check
        CHECK (status IN ('DRAFT', 'PUBLISHED', 'PAUSED', 'CLOSED', 'ARCHIVED')),
    ADD CONSTRAINT ats_job_posting_version_check CHECK (version >= 0),
    ADD CONSTRAINT ats_job_posting_application_fields_array
        CHECK (jsonb_typeof(application_fields) = 'array'
               AND jsonb_array_length(application_fields) BETWEEN 8 AND 11
               AND application_fields @>
                   '["fullName","email","phone","city","summary","experience","education","skills"]'::jsonb),
    ADD CONSTRAINT ats_job_posting_notice_version_format
        CHECK (notice_version ~ '^kvkk-application-v[1-9][0-9]*$'),
    ADD CONSTRAINT ats_job_posting_publish_invariant
        CHECK (published = (status = 'PUBLISHED')
               AND apply_enabled = (status = 'PUBLISHED'));

-- Rolling deploy bridge: a V5/V6 pod knows only `published`, while V7 writers
-- own the canonical `status`. No defaults are used for the new state columns,
-- so an omitted old-writer value is distinguishable from an explicit V7
-- value. The trigger mirrors in the correct direction before constraints run.
CREATE FUNCTION ats_sync_job_publication_state()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status IS NULL THEN
            NEW.status := CASE WHEN NEW.published THEN 'PUBLISHED' ELSE 'DRAFT' END;
        END IF;
        NEW.published := NEW.status = 'PUBLISHED';
        NEW.apply_enabled := NEW.status = 'PUBLISHED';
        IF NEW.status = 'PUBLISHED' AND NOT EXISTS (
            SELECT 1 FROM ats_career_site
             WHERE tenant_id = NEW.tenant_id AND active
        ) THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                MESSAGE = 'active career site required before publishing';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
        NEW.published := NEW.status = 'PUBLISHED';
        NEW.apply_enabled := NEW.status = 'PUBLISHED';
    ELSIF NEW.published IS DISTINCT FROM OLD.published THEN
        -- V5/V6 writer state mutation: preserve optimistic concurrency and
        -- identify the compatibility write for the append-only audit trigger.
        IF NEW.version = OLD.version THEN
            NEW.version := OLD.version + 1;
        END IF;
        NEW.updated_by := 'legacy:v5-writer';
        NEW.updated_at := clock_timestamp();
        NEW.status := CASE
            WHEN NEW.published THEN 'PUBLISHED'
            WHEN OLD.status = 'PUBLISHED' THEN 'PAUSED'
            ELSE OLD.status
        END;
        NEW.apply_enabled := NEW.status = 'PUBLISHED';
    ELSE
        -- A rolling V5/V6 writer can also edit content without knowing the
        -- V7 version/actor columns. Canonical writers always bump version and
        -- set updated_by explicitly, so unchanged metadata identifies the
        -- compatibility path without weakening V7 CAS.
        IF NEW.version = OLD.version
                AND NEW.updated_by IS NOT DISTINCT FROM OLD.updated_by
                AND ROW(NEW.slug, NEW.title, NEW.team, NEW.location, NEW.mode,
                        NEW.employment_type, NEW.summary, NEW.highlights,
                        NEW.application_fields, NEW.notice_version)
                    IS DISTINCT FROM
                    ROW(OLD.slug, OLD.title, OLD.team, OLD.location, OLD.mode,
                        OLD.employment_type, OLD.summary, OLD.highlights,
                        OLD.application_fields, OLD.notice_version) THEN
            NEW.version := OLD.version + 1;
            NEW.updated_by := 'legacy:v5-writer';
            NEW.updated_at := clock_timestamp();
        END IF;
        NEW.published := NEW.status = 'PUBLISHED';
        NEW.apply_enabled := NEW.status = 'PUBLISHED';
    END IF;

    -- Rolling writers may still mutate the compatibility `published` column,
    -- but they must not bypass the canonical terminal-state or public-result
    -- invariants. A failed compatibility write aborts atomically; it never
    -- resurrects candidate intake or creates a non-routable PUBLISHED row.
    IF OLD.status = 'ARCHIVED' AND NEW.status <> 'ARCHIVED' THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'archived job posting is terminal';
    END IF;
    IF OLD.status = 'CLOSED' AND NEW.status NOT IN ('CLOSED', 'ARCHIVED') THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'closed job posting may only be archived';
    END IF;
    IF NEW.status = 'PUBLISHED' AND NOT EXISTS (
        SELECT 1 FROM ats_career_site
         WHERE tenant_id = NEW.tenant_id AND active
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'active career site required before publishing';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER ats_job_posting_publication_state_sync
BEFORE INSERT OR UPDATE
ON ats_job_posting
FOR EACH ROW
EXECUTE FUNCTION ats_sync_job_publication_state();

DROP INDEX ats_job_posting_public_idx;
CREATE INDEX ats_job_posting_public_idx
    ON ats_job_posting (tenant_id, status, updated_at DESC)
    WHERE status = 'PUBLISHED';

CREATE TABLE ats_career_site (
    tenant_id       TEXT        PRIMARY KEY,
    public_handle   TEXT        NOT NULL UNIQUE,
    display_name    TEXT        NOT NULL,
    active          BOOLEAN     NOT NULL DEFAULT true,
    created_by      TEXT        NOT NULL,
    updated_by      TEXT        NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL,
    version         INTEGER     NOT NULL DEFAULT 0,
    CONSTRAINT ats_career_site_handle_format
        CHECK (public_handle ~ '^[a-z0-9]+(-[a-z0-9]+){0,7}$'),
    CONSTRAINT ats_career_site_version_check CHECK (version >= 0)
);

-- Existing public test tenant keeps the old /jobs alias and gains the
-- canonical /careers/acik/jobs handle. ats_app has no DELETE grant, so a
-- retired handle cannot be silently reassigned to another tenant.
INSERT INTO ats_career_site
    (tenant_id, public_handle, display_name, active, created_by, updated_by,
     created_at, updated_at)
VALUES
    ('00000000-0000-0000-0000-000000000001', 'acik', 'Açık Kariyer', true,
     'migration:v7', 'migration:v7', now(), now());

-- Do not silently carry a pre-V7 public job into a non-routable canonical
-- PUBLISHED state, and do not stop the whole deployment with no durable way
-- to provision the new table. Quarantine only the affected rows as PAUSED;
-- an operator verifies a public handle, inserts the career-site mapping, then
-- the recruiter resumes the job through the normal audited state machine.
UPDATE ats_job_posting AS j
   SET status = 'PAUSED',
       published = false,
       apply_enabled = false,
       version = version + 1,
       updated_by = 'migration:v7:unroutable-published',
       updated_at = now()
 WHERE j.status = 'PUBLISHED'
   AND NOT EXISTS (
       SELECT 1
         FROM ats_career_site AS s
        WHERE s.tenant_id = j.tenant_id AND s.active
   );

CREATE TABLE ats_job_posting_event (
    event_id         BIGSERIAL   PRIMARY KEY,
    tenant_id        TEXT        NOT NULL,
    job_id           TEXT        NOT NULL,
    event_type       TEXT        NOT NULL,
    from_status      TEXT,
    to_status        TEXT        NOT NULL,
    resulting_version INTEGER    NOT NULL,
    actor_ref        TEXT        NOT NULL,
    idempotency_key  TEXT        NOT NULL,
    request_digest   CHAR(64)    NOT NULL,
    occurred_at      TIMESTAMPTZ NOT NULL,
    CONSTRAINT ats_job_posting_event_job_fk
        FOREIGN KEY (tenant_id, job_id)
        REFERENCES ats_job_posting (tenant_id, job_id),
    CONSTRAINT ats_job_posting_event_type_check
        CHECK (event_type IN ('MIGRATED', 'CREATED', 'UPDATED', 'TRANSITIONED')),
    CONSTRAINT ats_job_posting_event_from_check
        CHECK (from_status IS NULL OR from_status IN
               ('DRAFT', 'PUBLISHED', 'PAUSED', 'CLOSED', 'ARCHIVED')),
    CONSTRAINT ats_job_posting_event_to_check
        CHECK (to_status IN ('DRAFT', 'PUBLISHED', 'PAUSED', 'CLOSED', 'ARCHIVED')),
    CONSTRAINT ats_job_posting_event_version_check CHECK (resulting_version >= 0),
    CONSTRAINT ats_job_posting_event_idempotency_format
        CHECK (idempotency_key ~ '^[A-Za-z0-9._:-]{16,128}$'),
    CONSTRAINT ats_job_posting_event_digest_format
        CHECK (request_digest ~ '^[0-9a-f]{64}$')
);
CREATE INDEX ats_job_posting_event_history_idx
    ON ats_job_posting_event (tenant_id, job_id, event_id);

INSERT INTO ats_job_posting_event
    (tenant_id, job_id, event_type, from_status, to_status, resulting_version,
     actor_ref, idempotency_key, request_digest, occurred_at)
SELECT tenant_id, job_id, 'MIGRATED', NULL, status, version,
       'migration:v7',
       'migration:v7:' || substr(md5(tenant_id || ':' || job_id), 1, 20),
       encode(sha256(convert_to(tenant_id || ':' || job_id || ':' || status, 'UTF8')), 'hex'),
       updated_at
  FROM ats_job_posting;

-- Rolling compatibility must not create an audit hole. V7 application writes
-- already insert their event transactionally; only rows explicitly marked by
-- the bridge above are mirrored here.
CREATE FUNCTION ats_audit_legacy_job_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    generated_key TEXT;
    generated_digest TEXT;
BEGIN
    IF TG_OP = 'INSERT' AND NEW.created_by <> 'legacy:v5-writer' THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE'
            AND (NEW.updated_by <> 'legacy:v5-writer' OR NEW.version <= OLD.version) THEN
        RETURN NEW;
    END IF;

    generated_key := 'legacy:v5:' || substr(md5(
        txid_current()::text || ':' || NEW.tenant_id || ':' || NEW.job_id || ':'
        || NEW.version::text), 1, 24);
    generated_digest := encode(sha256(convert_to(
        concat_ws('|', TG_OP, NEW.tenant_id, NEW.job_id, NEW.status,
                  NEW.version::text, NEW.slug, NEW.title, NEW.team, NEW.location,
                  NEW.mode, NEW.employment_type, NEW.summary, NEW.highlights::text,
                  NEW.application_fields::text, NEW.notice_version), 'UTF8')), 'hex');

    INSERT INTO ats_job_posting_event
        (tenant_id, job_id, event_type, from_status, to_status, resulting_version,
         actor_ref, idempotency_key, request_digest, occurred_at)
    VALUES
        (NEW.tenant_id, NEW.job_id,
         CASE
             WHEN TG_OP = 'INSERT' THEN 'CREATED'
             WHEN OLD.status IS DISTINCT FROM NEW.status THEN 'TRANSITIONED'
             ELSE 'UPDATED'
         END,
         CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END,
         NEW.status, NEW.version, 'legacy:v5-writer', generated_key,
         generated_digest, NEW.updated_at);
    RETURN NEW;
END;
$$;

CREATE TRIGGER ats_job_posting_legacy_audit
AFTER INSERT OR UPDATE
ON ats_job_posting
FOR EACH ROW
EXECUTE FUNCTION ats_audit_legacy_job_write();

CREATE TABLE ats_job_command_idempotency (
    tenant_id         TEXT        NOT NULL,
    idempotency_key   TEXT        NOT NULL,
    request_digest    CHAR(64)    NOT NULL,
    job_id            TEXT        NOT NULL,
    response_version  INTEGER,
    response_snapshot JSONB,
    created_at        TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (tenant_id, idempotency_key),
    CONSTRAINT ats_job_command_idempotency_job_fk
        FOREIGN KEY (tenant_id, job_id)
        REFERENCES ats_job_posting (tenant_id, job_id)
        DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT ats_job_command_idempotency_key_format
        CHECK (idempotency_key ~ '^[A-Za-z0-9._:-]{16,128}$'),
    CONSTRAINT ats_job_command_idempotency_digest_format
        CHECK (request_digest ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ats_job_command_idempotency_version_check
        CHECK (response_version IS NULL OR response_version >= 0),
    CONSTRAINT ats_job_command_idempotency_response_pair
        CHECK ((response_version IS NULL) = (response_snapshot IS NULL)),
    CONSTRAINT ats_job_command_idempotency_snapshot_object
        CHECK (response_snapshot IS NULL OR jsonb_typeof(response_snapshot) = 'object')
);
CREATE INDEX ats_job_command_idempotency_created_idx
    ON ats_job_command_idempotency (tenant_id, created_at);

GRANT SELECT, INSERT, UPDATE ON ats_job_posting TO ats_app;
REVOKE DELETE ON ats_job_posting FROM ats_app;
GRANT SELECT ON ats_career_site TO ats_app;
GRANT INSERT, SELECT ON ats_job_posting_event TO ats_app;
GRANT INSERT, SELECT, UPDATE ON ats_job_command_idempotency TO ats_app;
GRANT USAGE, SELECT ON SEQUENCE ats_job_posting_event_event_id_seq TO ats_app;
