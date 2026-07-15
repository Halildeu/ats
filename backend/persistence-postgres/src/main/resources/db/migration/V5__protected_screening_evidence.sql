-- ATS #156-b: protected-attribute screening kanıtının iki-düzlem kalıcılığı.
--
-- WORM receipt, mevcut worm_ledger'da pointer-only kalır. Kategori/sinyal/span gibi
-- mülakat-türevli korumalı veri yalnız bu restricted/silinebilir tablolardadır. Ham kaynak,
-- normalize/eşleşmiş token veya kaynak/bulgu hash'i için kolon YOKTUR.

-- Event-type özel defense-in-depth: generic ledger adapter'ın pointer/meta key deny-list'ine ek
-- olarak screening receipt'i TAM sekiz string anahtarlı allowlist'tir. Böylece başka bir caller
-- category/span/raw alanını screening WORM event'ine kaçak ekleyemez.
ALTER TABLE worm_ledger ADD CONSTRAINT worm_screening_receipt_pointer_only_ck CHECK (
    event_type <> 'evidence.screening.protected_attribute.recorded'
    OR (
        jsonb_typeof(payload) = 'object'
        AND jsonb_object_length(payload) = 8
        AND payload ?& ARRAY[
            'schema_version', 'finding_set_ref', 'screening_run_id', 'policy_ref',
            'coverage', 'disposition', 'source_kind', 'restricted_store_version']
        AND jsonb_typeof(payload->'schema_version') = 'string'
        AND jsonb_typeof(payload->'finding_set_ref') = 'string'
        AND jsonb_typeof(payload->'screening_run_id') = 'string'
        AND jsonb_typeof(payload->'policy_ref') = 'string'
        AND jsonb_typeof(payload->'coverage') = 'string'
        AND jsonb_typeof(payload->'disposition') = 'string'
        AND jsonb_typeof(payload->'source_kind') = 'string'
        AND jsonb_typeof(payload->'restricted_store_version') = 'string'
        AND payload->>'schema_version' = 'screening_evidence_v1'
        AND payload->>'finding_set_ref' ~ '^fsr_[0-9a-f]{64}$'
        AND payload->>'screening_run_id' ~ '^psr_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        AND payload->>'policy_ref' ~ '^paspolicy_v(0|[1-9][0-9]*)$'
        AND payload->>'coverage' IN (
            'SUPPORTED', 'UNSUPPORTED_LANGUAGE', 'MALFORMED_INPUT', 'POLICY_UNAVAILABLE')
        AND payload->>'disposition' IN ('CLEAR', 'REVIEW_REQUIRED', 'SCREENING_UNAVAILABLE')
        AND payload->>'source_kind' IN (
            'TRANSCRIPT_SEGMENT', 'INTERVIEW_NOTE', 'RUBRIC_TEXT', 'CITATION_CLAIM', 'FREE_TEXT')
        AND payload->>'restricted_store_version' = 'protected_screening_pg_v1'
        AND content_hash ~ '^[0-9a-f]{64}$'
    )
);

CREATE TABLE protected_screening_evidence (
    tenant_id         TEXT        NOT NULL,
    finding_set_ref   TEXT        NOT NULL,
    screening_run_id  TEXT        NOT NULL,
    interview_id      TEXT        NOT NULL,
    policy_ref        TEXT        NOT NULL,
    coverage          TEXT        NOT NULL,
    disposition       TEXT        NOT NULL,
    source_kind       TEXT        NOT NULL,
    worm_evidence_id  TEXT        NOT NULL,
    schema_version    TEXT        NOT NULL,
    occurred_at       TEXT        NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, finding_set_ref),
    CONSTRAINT protected_screening_tenant_run_uq UNIQUE (tenant_id, screening_run_id),
    CONSTRAINT protected_screening_tenant_worm_uq UNIQUE (tenant_id, worm_evidence_id),
    CONSTRAINT protected_screening_finding_ref_ck
        CHECK (finding_set_ref ~ '^fsr_[0-9a-f]{64}$'),
    CONSTRAINT protected_screening_run_id_ck
        CHECK (screening_run_id ~ '^psr_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
    CONSTRAINT protected_screening_policy_ref_ck
        CHECK (policy_ref ~ '^paspolicy_v(0|[1-9][0-9]*)$'),
    CONSTRAINT protected_screening_coverage_ck CHECK (coverage IN (
        'SUPPORTED', 'UNSUPPORTED_LANGUAGE', 'MALFORMED_INPUT', 'POLICY_UNAVAILABLE')),
    CONSTRAINT protected_screening_disposition_ck CHECK (disposition IN (
        'CLEAR', 'REVIEW_REQUIRED', 'SCREENING_UNAVAILABLE')),
    CONSTRAINT protected_screening_source_kind_ck CHECK (source_kind IN (
        'TRANSCRIPT_SEGMENT', 'INTERVIEW_NOTE', 'RUBRIC_TEXT', 'CITATION_CLAIM', 'FREE_TEXT')),
    CONSTRAINT protected_screening_coverage_disposition_ck CHECK (
        (coverage = 'SUPPORTED' AND disposition IN ('CLEAR', 'REVIEW_REQUIRED'))
        OR
        (coverage <> 'SUPPORTED' AND disposition = 'SCREENING_UNAVAILABLE')),
    CONSTRAINT protected_screening_schema_ck CHECK (schema_version = 'screening_evidence_v1')
);

CREATE INDEX protected_screening_tenant_interview_idx
    ON protected_screening_evidence (tenant_id, interview_id);

CREATE TABLE protected_screening_finding (
    tenant_id        TEXT NOT NULL,
    finding_set_ref  TEXT NOT NULL,
    finding_index    INT  NOT NULL,
    category_code    TEXT NOT NULL,
    signal_code      TEXT NOT NULL,
    source_kind      TEXT NOT NULL,
    span_start       INT  NOT NULL,
    span_end         INT  NOT NULL,
    segment_index    INT,
    PRIMARY KEY (tenant_id, finding_set_ref, finding_index),
    CONSTRAINT protected_screening_finding_parent_fk
        FOREIGN KEY (tenant_id, finding_set_ref)
        REFERENCES protected_screening_evidence (tenant_id, finding_set_ref)
        ON DELETE CASCADE,
    CONSTRAINT protected_screening_finding_index_ck CHECK (finding_index >= 0),
    CONSTRAINT protected_screening_category_ck CHECK (category_code IN (
        'AGE', 'RELIGION_BELIEF', 'ETHNICITY_RACE', 'TRADE_UNION', 'HEALTH_DISABILITY',
        'SEX_GENDER_ORIENTATION', 'MARITAL_PARENTAL_STATUS', 'POLITICAL_OPINION',
        'PHILOSOPHICAL_BELIEF', 'CRIMINAL_RECORD', 'NATIVE_LANGUAGE_ACCENT',
        'ASSOCIATION_MEMBERSHIP', 'PREGNANCY_MATERNITY')),
    CONSTRAINT protected_screening_signal_ck CHECK (signal_code IN (
        'PROTECTED_ATTRIBUTE_MENTION', 'QUESTION_LIKE_PROTECTED_MENTION')),
    CONSTRAINT protected_screening_finding_source_ck CHECK (source_kind IN (
        'TRANSCRIPT_SEGMENT', 'INTERVIEW_NOTE', 'RUBRIC_TEXT', 'CITATION_CLAIM', 'FREE_TEXT')),
    CONSTRAINT protected_screening_span_ck CHECK (span_start >= 0 AND span_end > span_start),
    CONSTRAINT protected_screening_segment_ck CHECK (segment_index IS NULL OR segment_index >= 0)
);

-- Child satırı yalnız REVIEW_REQUIRED+SUPPORTED parent altında var olabilir. Kategori/span'ı
-- unsupported/CLEAR receipt'e sonradan eklemek DB-owner dışındaki yollarda fail-closed olur.
CREATE OR REPLACE FUNCTION protected_screening_finding_parent_guard() RETURNS trigger AS $$
DECLARE
    parent_coverage    TEXT;
    parent_disposition TEXT;
BEGIN
    SELECT coverage, disposition INTO parent_coverage, parent_disposition
      FROM protected_screening_evidence
     WHERE tenant_id = NEW.tenant_id AND finding_set_ref = NEW.finding_set_ref;
    IF parent_coverage IS DISTINCT FROM 'SUPPORTED'
       OR parent_disposition IS DISTINCT FROM 'REVIEW_REQUIRED' THEN
        RAISE EXCEPTION 'screening finding yalnız SUPPORTED+REVIEW_REQUIRED parent altında yazılabilir';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER protected_screening_finding_parent_guard_trigger
    BEFORE INSERT OR UPDATE ON protected_screening_finding
    FOR EACH ROW EXECUTE FUNCTION protected_screening_finding_parent_guard();

-- Header önce, child sonra aynı transaction'da yazılır. Commit anında REVIEW_REQUIRED aggregate
-- en az bir child bulgu taşımalıdır; sessiz "flag var ama kanıt yok" kaydı mümkün değildir.
CREATE OR REPLACE FUNCTION protected_screening_review_required_guard() RETURNS trigger AS $$
BEGIN
    IF NEW.disposition = 'REVIEW_REQUIRED'
       AND NOT EXISTS (
           SELECT 1 FROM protected_screening_finding
            WHERE tenant_id = NEW.tenant_id AND finding_set_ref = NEW.finding_set_ref) THEN
        RAISE EXCEPTION 'REVIEW_REQUIRED screening evidence en az bir restricted finding taşımalı';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER protected_screening_review_required_guard_trigger
    AFTER INSERT ON protected_screening_evidence
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION protected_screening_review_required_guard();

-- Restricted plane yalnız parent üzerinden silinir (FK CASCADE); child tek başına silinemez.
-- UPDATE verilmez. WORM grant/trigger'ları V1'de değişmeden kalır.
GRANT INSERT, SELECT, DELETE ON protected_screening_evidence TO ats_app;
GRANT INSERT, SELECT ON protected_screening_finding TO ats_app;
