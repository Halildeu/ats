-- ATS #169: cross-plane DSR/retention saga + no-resurrection gate.
--
-- Bu migration content saklamaz. Yalnız tenant/interview anahtarı, opak hedef ref'leri,
-- worker lease'i ve 0/1 sayısal adım etkileri tutulur. Erasure kaydı DELETE edilmez.

CREATE TABLE interview_content_gate (
    tenant_id       TEXT        NOT NULL,
    interview_id    TEXT        NOT NULL,
    sealed_dsar_key TEXT,
    sealed_at       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, interview_id),
    CONSTRAINT interview_content_gate_seal_pair_ck CHECK (
        (sealed_dsar_key IS NULL AND sealed_at IS NULL)
        OR (sealed_dsar_key IS NOT NULL AND sealed_at IS NOT NULL)
    )
);

-- Bütün content INSERT/UPDATE'leri bu satırda SHARE lock alır. DSR aynı satırı UPDATE-lock ile
-- mühürler; böylece "scope query ile eşzamanlı yeni içerik" yarışı iki yönde de kapanır:
-- önce yazan commit olur ve scope'a girer, önce seal alanın ardından yazan reddedilir.
CREATE OR REPLACE FUNCTION ats_require_interview_content_writable() RETURNS trigger AS $$
DECLARE
    sealed_key TEXT;
BEGIN
    IF TG_OP = 'UPDATE'
       AND (OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
            OR OLD.interview_id IS DISTINCT FROM NEW.interview_id) THEN
        RAISE EXCEPTION 'content tenant/interview kimliği değiştirilemez'
            USING ERRCODE = '55000';
    END IF;

    INSERT INTO public.interview_content_gate (tenant_id, interview_id)
    VALUES (NEW.tenant_id, NEW.interview_id)
    ON CONFLICT (tenant_id, interview_id) DO NOTHING;

    SELECT sealed_dsar_key INTO sealed_key
      FROM public.interview_content_gate
     WHERE tenant_id = NEW.tenant_id AND interview_id = NEW.interview_id
     FOR SHARE;

    IF sealed_key IS NOT NULL THEN
        RAISE EXCEPTION 'interview content terminal erasure ile mühürlü; yeni içerik yasak'
            USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;

CREATE TRIGGER transcript_erasure_gate
    BEFORE INSERT OR UPDATE ON transcript
    FOR EACH ROW EXECUTE FUNCTION ats_require_interview_content_writable();
CREATE TRIGGER citation_erasure_gate
    BEFORE INSERT OR UPDATE ON citation
    FOR EACH ROW EXECUTE FUNCTION ats_require_interview_content_writable();
CREATE TRIGGER export_artifact_erasure_gate
    BEFORE INSERT OR UPDATE ON export_artifact
    FOR EACH ROW EXECUTE FUNCTION ats_require_interview_content_writable();
CREATE TRIGGER review_case_erasure_gate
    BEFORE INSERT ON review_case
    FOR EACH ROW EXECUTE FUNCTION ats_require_interview_content_writable();
CREATE TRIGGER protected_screening_erasure_gate
    BEFORE INSERT OR UPDATE ON protected_screening_evidence
    FOR EACH ROW EXECUTE FUNCTION ats_require_interview_content_writable();

-- Restricted child satırı parent'ın interview kimliğini taşımadığı için gate'i parent üzerinden
-- alır. Böylece seal ile purge arasındaki pencerede yeni kategori/span eklenemez.
CREATE OR REPLACE FUNCTION ats_require_screening_finding_writable() RETURNS trigger AS $$
DECLARE
    parent_interview TEXT;
    sealed_key       TEXT;
BEGIN
    IF TG_OP = 'UPDATE'
       AND (OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
            OR OLD.finding_set_ref IS DISTINCT FROM NEW.finding_set_ref) THEN
        RAISE EXCEPTION 'screening finding parent kimliği değiştirilemez'
            USING ERRCODE = '55000';
    END IF;

    SELECT interview_id INTO parent_interview
      FROM public.protected_screening_evidence
     WHERE tenant_id = NEW.tenant_id AND finding_set_ref = NEW.finding_set_ref
     FOR KEY SHARE;
    IF parent_interview IS NULL THEN
        RAISE EXCEPTION 'screening finding parent evidence yok'
            USING ERRCODE = '23503';
    END IF;

    INSERT INTO public.interview_content_gate (tenant_id, interview_id)
    VALUES (NEW.tenant_id, parent_interview)
    ON CONFLICT (tenant_id, interview_id) DO NOTHING;
    SELECT sealed_dsar_key INTO sealed_key
      FROM public.interview_content_gate
     WHERE tenant_id = NEW.tenant_id AND interview_id = parent_interview
     FOR SHARE;
    IF sealed_key IS NOT NULL THEN
        RAISE EXCEPTION 'interview terminal erasure ile mühürlü; screening finding yazılamaz'
            USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;

CREATE TRIGGER protected_screening_finding_erasure_gate
    BEFORE INSERT OR UPDATE ON protected_screening_finding
    FOR EACH ROW EXECUTE FUNCTION ats_require_screening_finding_writable();

-- Content yazımı ile business-WORM append ayrı transaction'lar olabilir. Bütün yeni WORM
-- kaynak event'leri aynı gate lock'una bağlanır; aksi halde content önce commit edip seal scope'a
-- girdikten sonra geç kalan ledger append'i tombstone planının dışında kalabilirdi. Yalnız
-- erasure worker'ın idempotent evidence.tombstoned append'i seal sonrasında izinlidir.
CREATE OR REPLACE FUNCTION ats_require_interview_worm_writable() RETURNS trigger AS $$
DECLARE
    sealed_key TEXT;
BEGIN
    IF NEW.event_type = 'evidence.tombstoned' THEN
        IF jsonb_typeof(NEW.payload) IS DISTINCT FROM 'object'
           OR NOT (NEW.payload ?& ARRAY['target_evidence_id', 'reason_code'])
           OR NEW.payload - ARRAY['target_evidence_id', 'reason_code'] <> '{}'::jsonb
           OR jsonb_typeof(NEW.payload->'target_evidence_id') IS DISTINCT FROM 'string'
           OR jsonb_typeof(NEW.payload->'reason_code') IS DISTINCT FROM 'string'
           OR btrim(NEW.payload->>'target_evidence_id') = ''
           OR btrim(NEW.payload->>'reason_code') = ''
           OR NEW.idempotency_key IS DISTINCT FROM
                NEW.tenant_id || ':tombstone:' || (NEW.payload->>'target_evidence_id')
           OR NEW.content_hash !~ '^[0-9a-f]{64}$' THEN
            RAISE EXCEPTION 'evidence.tombstoned envelope/idempotency bağı geçersiz'
                USING ERRCODE = '23514';
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM public.worm_ledger source
             WHERE source.tenant_id = NEW.tenant_id
               AND source.interview_id = NEW.interview_id
               AND source.evidence_id = NEW.payload->>'target_evidence_id'
        ) THEN
            RAISE EXCEPTION 'tombstone hedefi aynı tenant/interview WORM scope''unda yok'
                USING ERRCODE = '23503';
        END IF;
        RETURN NEW;
    END IF;

    INSERT INTO public.interview_content_gate (tenant_id, interview_id)
    VALUES (NEW.tenant_id, NEW.interview_id)
    ON CONFLICT (tenant_id, interview_id) DO NOTHING;
    SELECT sealed_dsar_key INTO sealed_key
      FROM public.interview_content_gate
     WHERE tenant_id = NEW.tenant_id AND interview_id = NEW.interview_id
     FOR SHARE;
    IF sealed_key IS NOT NULL THEN
        RAISE EXCEPTION 'interview terminal erasure ile mühürlü; yeni WORM kaynak eventi yasak'
            USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;

CREATE TRIGGER worm_ledger_erasure_gate
    BEFORE INSERT ON worm_ledger
    FOR EACH ROW
    EXECUTE FUNCTION ats_require_interview_worm_writable();

-- Seal'den sonra insan/AI akışı vakayı terminal EXPORTED'a taşıyamaz. Erasure worker'ın
-- WITHDRAWN geçişi izinli kalır; böylece scope çözümü sonrası state yarışı saga'yı kilitlemez.
CREATE OR REPLACE FUNCTION ats_require_review_update_erasure_safe() RETURNS trigger AS $$
DECLARE
    sealed_key TEXT;
BEGIN
    IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
       OR OLD.case_key IS DISTINCT FROM NEW.case_key
       OR OLD.interview_id IS DISTINCT FROM NEW.interview_id THEN
        RAISE EXCEPTION 'review tenant/case/interview kimliği değiştirilemez'
            USING ERRCODE = '55000';
    END IF;

    INSERT INTO public.interview_content_gate (tenant_id, interview_id)
    VALUES (NEW.tenant_id, NEW.interview_id)
    ON CONFLICT (tenant_id, interview_id) DO NOTHING;
    SELECT sealed_dsar_key INTO sealed_key
      FROM public.interview_content_gate
     WHERE tenant_id = NEW.tenant_id AND interview_id = NEW.interview_id
     FOR SHARE;
    IF sealed_key IS NOT NULL THEN
        IF NEW.state <> 'WITHDRAWN'
           OR OLD.source_evidence_refs IS DISTINCT FROM NEW.source_evidence_refs
           OR OLD.ai_output_version_ref IS DISTINCT FROM NEW.ai_output_version_ref
           OR OLD.human_actor_ref IS DISTINCT FROM NEW.human_actor_ref
           OR OLD.oversight_role_ref IS DISTINCT FROM NEW.oversight_role_ref
           OR OLD.human_change_summary_ref IS DISTINCT FROM NEW.human_change_summary_ref
           OR OLD.human_authored_rationale_ref IS DISTINCT FROM NEW.human_authored_rationale_ref
           OR OLD.decision_outcome_ref IS DISTINCT FROM NEW.decision_outcome_ref
           OR OLD.export_artifact_ref IS DISTINCT FROM NEW.export_artifact_ref
           OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
            RAISE EXCEPTION 'interview terminal erasure ile mühürlü; yalnız WITHDRAWN + reason geçişi izinli'
                USING ERRCODE = '55000';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;

CREATE TRIGGER review_case_update_erasure_gate
    BEFORE UPDATE ON review_case
    FOR EACH ROW EXECUTE FUNCTION ats_require_review_update_erasure_safe();

-- Uygulama tabloyu doğrudan UPDATE edemez. Yalnız bu dar SECURITY DEFINER yüzeyi aynı
-- DSAR replay'ine izin verir; farklı DSAR ile ikinci seal conflict'tir.
CREATE OR REPLACE FUNCTION ats_seal_interview_for_erasure(
    p_tenant_id TEXT,
    p_interview_id TEXT,
    p_dsar_key TEXT
) RETURNS VOID AS $$
DECLARE
    prior_key TEXT;
BEGIN
    IF p_tenant_id IS NULL OR btrim(p_tenant_id) = ''
       OR p_interview_id IS NULL OR btrim(p_interview_id) = ''
       OR p_dsar_key IS NULL OR btrim(p_dsar_key) = '' THEN
        RAISE EXCEPTION 'tenant/interview/dsar zorunlu' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.interview_content_gate (tenant_id, interview_id)
    VALUES (p_tenant_id, p_interview_id)
    ON CONFLICT (tenant_id, interview_id) DO NOTHING;

    SELECT sealed_dsar_key INTO prior_key
      FROM public.interview_content_gate
     WHERE tenant_id = p_tenant_id AND interview_id = p_interview_id
     FOR UPDATE;

    IF prior_key IS NOT NULL AND prior_key <> p_dsar_key THEN
        RAISE EXCEPTION 'interview farklı DSAR ile zaten mühürlü'
            USING ERRCODE = '23505';
    END IF;

    IF prior_key IS NULL THEN
        UPDATE public.interview_content_gate
           SET sealed_dsar_key = p_dsar_key, sealed_at = now()
         WHERE tenant_id = p_tenant_id AND interview_id = p_interview_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;

REVOKE ALL ON interview_content_gate FROM PUBLIC;
REVOKE ALL ON interview_content_gate FROM ats_app;
REVOKE ALL ON FUNCTION ats_seal_interview_for_erasure(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ats_seal_interview_for_erasure(TEXT, TEXT, TEXT) TO ats_app;

CREATE TABLE erasure_execution (
    tenant_id       TEXT        NOT NULL,
    execution_key   TEXT        NOT NULL,
    interview_id    TEXT        NOT NULL,
    execution_kind  TEXT        NOT NULL,
    scope_digest    TEXT        NOT NULL,
    actor_ref       TEXT        NOT NULL,
    state           TEXT        NOT NULL DEFAULT 'RUNNING',
    lease_owner     TEXT,
    lease_until     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, execution_key),
    CONSTRAINT erasure_execution_kind_ck CHECK (
        execution_kind IN ('DATA_SUBJECT_ERASURE', 'RETENTION_EXPIRED')
    ),
    CONSTRAINT erasure_execution_state_ck CHECK (state IN ('RUNNING', 'FULFILLED')),
    CONSTRAINT erasure_execution_digest_ck CHECK (scope_digest ~ '^[0-9a-f]{64}$'),
    CONSTRAINT erasure_execution_lease_pair_ck CHECK (
        (lease_owner IS NULL AND lease_until IS NULL)
        OR (lease_owner IS NOT NULL AND lease_until IS NOT NULL)
    ),
    CONSTRAINT erasure_execution_ref_ck CHECK (
        char_length(execution_key) BETWEEN 1 AND 512
        AND char_length(actor_ref) BETWEEN 1 AND 512
    )
);

CREATE INDEX erasure_execution_running_idx
    ON erasure_execution (tenant_id, execution_kind, state, created_at);
CREATE INDEX erasure_execution_interview_idx
    ON erasure_execution (tenant_id, interview_id, state);

CREATE TABLE erasure_execution_step (
    tenant_id              TEXT        NOT NULL,
    execution_key          TEXT        NOT NULL,
    step_sequence          INT         NOT NULL,
    step_type              TEXT        NOT NULL,
    target_ref             TEXT        NOT NULL,
    state                  TEXT        NOT NULL DEFAULT 'PENDING',
    tombstone_count        INT         NOT NULL DEFAULT 0,
    deleted_content_count  INT         NOT NULL DEFAULT 0,
    case_transitioned      BOOLEAN     NOT NULL DEFAULT FALSE,
    completed_at           TIMESTAMPTZ,
    PRIMARY KEY (tenant_id, execution_key, step_sequence),
    CONSTRAINT erasure_execution_step_parent_fk
        FOREIGN KEY (tenant_id, execution_key)
        REFERENCES erasure_execution (tenant_id, execution_key),
    CONSTRAINT erasure_execution_step_sequence_ck CHECK (step_sequence >= 0),
    CONSTRAINT erasure_execution_step_type_ck CHECK (step_type IN (
        'INTERVIEW_SEAL', 'WORM_TOMBSTONE', 'OBJECT_DELETE', 'SCREENING_PURGE', 'TRANSCRIPT_DELETE',
        'CITATION_DELETE', 'EXPORT_ARTIFACT_DELETE', 'REVIEW_WITHDRAW'
    )),
    CONSTRAINT erasure_execution_step_state_ck CHECK (state IN ('PENDING', 'COMPLETED')),
    CONSTRAINT erasure_execution_step_effect_ck CHECK (
        tombstone_count BETWEEN 0 AND 1 AND deleted_content_count BETWEEN 0 AND 1
    ),
    CONSTRAINT erasure_execution_step_completion_ck CHECK (
        (state = 'PENDING' AND tombstone_count = 0 AND deleted_content_count = 0
            AND case_transitioned = FALSE AND completed_at IS NULL)
        OR (state = 'COMPLETED' AND completed_at IS NOT NULL)
    ),
    CONSTRAINT erasure_execution_step_ref_ck CHECK (char_length(target_ref) BETWEEN 1 AND 512)
);

-- Kimlik/plan alanları first-writer binding'idir. Sadece lease/state ilerleyebilir.
CREATE OR REPLACE FUNCTION ats_erasure_execution_mutation_guard() RETURNS trigger AS $$
BEGIN
    IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
       OR OLD.execution_key IS DISTINCT FROM NEW.execution_key
       OR OLD.interview_id IS DISTINCT FROM NEW.interview_id
       OR OLD.execution_kind IS DISTINCT FROM NEW.execution_kind
       OR OLD.scope_digest IS DISTINCT FROM NEW.scope_digest
       OR OLD.actor_ref IS DISTINCT FROM NEW.actor_ref
       OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
        RAISE EXCEPTION 'erasure execution first-writer alanları değiştirilemez';
    END IF;
    IF OLD.state = 'FULFILLED' AND ROW(OLD.*) IS DISTINCT FROM ROW(NEW.*) THEN
        RAISE EXCEPTION 'FULFILLED erasure execution terminaldir';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER erasure_execution_mutation_guard
    BEFORE UPDATE ON erasure_execution
    FOR EACH ROW EXECUTE FUNCTION ats_erasure_execution_mutation_guard();

CREATE OR REPLACE FUNCTION ats_erasure_step_mutation_guard() RETURNS trigger AS $$
BEGIN
    IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
       OR OLD.execution_key IS DISTINCT FROM NEW.execution_key
       OR OLD.step_sequence IS DISTINCT FROM NEW.step_sequence
       OR OLD.step_type IS DISTINCT FROM NEW.step_type
       OR OLD.target_ref IS DISTINCT FROM NEW.target_ref THEN
        RAISE EXCEPTION 'erasure step plan alanları değiştirilemez';
    END IF;
    IF OLD.state = 'COMPLETED' AND ROW(OLD.*) IS DISTINCT FROM ROW(NEW.*) THEN
        RAISE EXCEPTION 'COMPLETED erasure step değiştirilemez';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER erasure_step_mutation_guard
    BEFORE UPDATE ON erasure_execution_step
    FOR EACH ROW EXECUTE FUNCTION ats_erasure_step_mutation_guard();

-- Saga planı ve makbuzu audit geçmişidir: uygulama rolü kadar migration-owner/admin
-- bağlantısının yanlışlıkla DELETE/TRUNCATE çalıştırması da DB düzeyinde fail-closed olur.
CREATE OR REPLACE FUNCTION ats_reject_erasure_history_removal() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'erasure saga geçmişi silinemez veya truncate edilemez'
        USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER erasure_execution_reject_delete
    BEFORE DELETE ON erasure_execution
    FOR EACH ROW EXECUTE FUNCTION ats_reject_erasure_history_removal();
CREATE TRIGGER erasure_execution_reject_truncate
    BEFORE TRUNCATE ON erasure_execution
    FOR EACH STATEMENT EXECUTE FUNCTION ats_reject_erasure_history_removal();
CREATE TRIGGER erasure_step_reject_delete
    BEFORE DELETE ON erasure_execution_step
    FOR EACH ROW EXECUTE FUNCTION ats_reject_erasure_history_removal();
CREATE TRIGGER erasure_step_reject_truncate
    BEFORE TRUNCATE ON erasure_execution_step
    FOR EACH STATEMENT EXECUTE FUNCTION ats_reject_erasure_history_removal();

REVOKE DELETE, TRUNCATE ON erasure_execution, erasure_execution_step FROM PUBLIC, ats_app;
GRANT INSERT, SELECT, UPDATE ON erasure_execution, erasure_execution_step TO ats_app;
