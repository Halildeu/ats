-- ATS-0018 slice-8a: worm_ledger — append-only WORM defteri (ATS-0003).
-- İnvariantlar ADR-0018 "8a-invariant seti"nin birebiridir:
--   * UNIQUE(tenant_id, evidence_id)  — getById contract bağlaması
--   * UNIQUE(tenant_id, idempotency_key) — TENANT-SCOPED idempotency (global unique
--     cross-tenant çakışma/denial yaratır; YASAK)
--   * UPDATE/DELETE/TRUNCATE reject-trigger — append-only KOD DİSİPLİNİ DEĞİL makine-zorlanır
--     (BEFORE trigger superuser dahil herkese RAISE eder)
--   * app-rolü NOLOGIN + yalnız INSERT/SELECT grant (parola YOK; bağlantı kimliği deploy
--     düzleminin işi — Vault/ats-gitops); migration-owner ayrı roldür (tablo sahibi)

CREATE TABLE worm_ledger (
    seq             BIGSERIAL PRIMARY KEY,
    tenant_id       TEXT        NOT NULL,
    evidence_id     TEXT        NOT NULL,
    actor_ref       TEXT        NOT NULL,
    interview_id    TEXT        NOT NULL,
    event_type      TEXT        NOT NULL,
    occurred_at     TEXT        NOT NULL,
    idempotency_key TEXT        NOT NULL,
    content_hash    TEXT        NOT NULL,
    payload         JSONB       NOT NULL,
    prev_hash       TEXT        NOT NULL,
    entry_hash      TEXT        NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT worm_ledger_tenant_evidence_uq   UNIQUE (tenant_id, evidence_id),
    CONSTRAINT worm_ledger_tenant_idempotency_uq UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX worm_ledger_tenant_interview_idx ON worm_ledger (tenant_id, interview_id);
CREATE INDEX worm_ledger_tenant_seq_idx       ON worm_ledger (tenant_id, seq DESC);

CREATE OR REPLACE FUNCTION worm_ledger_reject_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'worm_ledger append-only (ATS-0003/ATS-0018): % yasak', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER worm_ledger_no_update_delete
    BEFORE UPDATE OR DELETE ON worm_ledger
    FOR EACH ROW EXECUTE FUNCTION worm_ledger_reject_mutation();

CREATE TRIGGER worm_ledger_no_truncate
    BEFORE TRUNCATE ON worm_ledger
    FOR EACH STATEMENT EXECUTE FUNCTION worm_ledger_reject_mutation();

-- Uygulama rolü: NOLOGIN (kimlik/bağlantı deploy düzlemi); tablo sahibi DEĞİL; yalnız INSERT/SELECT.
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ats_app') THEN
        CREATE ROLE ats_app NOLOGIN;
    END IF;
END $$;

GRANT INSERT, SELECT ON worm_ledger TO ats_app;
GRANT USAGE, SELECT ON SEQUENCE worm_ledger_seq_seq TO ats_app;
