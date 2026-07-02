-- ATS-0018 slice-8b: 6 mutable store tablosu (ADR şema haritası birebir).
-- Hepsi tenant-scoped PK + created_at (retention-timer'ı 8c'de AÇAR).
-- Grant ayrımı (ATS-0003 düzlemleri): content-plane (transcript/citation/export_artifact)
-- SİLİNEBİLİR → ats_app'e DELETE; state tabloları (review_case/dsar_request/
-- recording_permission) güncellenir ama SİLİNMEZ → yalnız UPDATE.

CREATE TABLE transcript (
    tenant_id         TEXT        NOT NULL,
    transcript_key    TEXT        NOT NULL,
    interview_id      TEXT        NOT NULL,
    source_object_key TEXT        NOT NULL,
    language          TEXT        NOT NULL,
    segments          JSONB       NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, transcript_key)
);
CREATE INDEX transcript_tenant_interview_idx ON transcript (tenant_id, interview_id);

CREATE TABLE citation (
    tenant_id       TEXT        NOT NULL,
    citation_key    TEXT        NOT NULL,
    interview_id    TEXT        NOT NULL,
    transcript_key  TEXT        NOT NULL,
    claim           TEXT        NOT NULL, -- claim METNİ silinebilir-düzlem OLARAK BURADA (WORM'da değil)
    segment_indexes JSONB       NOT NULL,
    entailment      TEXT        NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, citation_key)
);
CREATE INDEX citation_tenant_interview_idx ON citation (tenant_id, interview_id);

CREATE TABLE review_case (
    tenant_id                    TEXT        NOT NULL,
    case_key                     TEXT        NOT NULL,
    interview_id                 TEXT        NOT NULL,
    state                        TEXT        NOT NULL,
    source_evidence_refs         JSONB       NOT NULL,
    ai_output_version_ref        TEXT        NOT NULL,
    human_actor_ref              TEXT,
    oversight_role_ref           TEXT,
    human_change_summary_ref     TEXT,
    human_authored_rationale_ref TEXT,
    decision_outcome_ref         TEXT,
    export_artifact_ref          TEXT,
    reason_code                  TEXT,
    created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, case_key)
);
CREATE INDEX review_case_tenant_interview_idx ON review_case (tenant_id, interview_id);

CREATE TABLE dsar_request (
    tenant_id    TEXT        NOT NULL,
    dsar_key     TEXT        NOT NULL,
    interview_id TEXT        NOT NULL,
    subject_ref  TEXT        NOT NULL,
    reason_code  TEXT        NOT NULL,
    state        TEXT        NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, dsar_key)
);

CREATE TABLE export_artifact (
    tenant_id    TEXT        NOT NULL,
    artifact_key TEXT        NOT NULL,
    interview_id TEXT        NOT NULL,
    packet_json  TEXT        NOT NULL, -- kanonik pointer-only packet (leak-scan'den geçmiş)
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, artifact_key)
);

CREATE TABLE recording_permission (
    tenant_id       TEXT        NOT NULL,
    interview_id    TEXT        NOT NULL,
    subject_ref     TEXT        NOT NULL,
    state           TEXT        NOT NULL,
    recorded_at_iso TEXT        NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, interview_id)
);

-- content-plane: silinebilir (DSR/erasure)
GRANT INSERT, SELECT, DELETE ON transcript, citation, export_artifact TO ats_app;
-- state tabloları: güncellenir, silinmez
GRANT INSERT, SELECT, UPDATE ON review_case, dsar_request, recording_permission TO ats_app;
