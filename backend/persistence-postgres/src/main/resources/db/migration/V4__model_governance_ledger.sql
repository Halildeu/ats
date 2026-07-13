-- gov1-1e-b: model_governance_ledger — GLOBAL append-only model-governance WORM (transition hash-chain).
-- Port: contracts.governance.ModelGovernanceLedger (Reader/Appender). Adapter: persistence-postgres
-- PostgresModelGovernanceLedger (plain-JDBC; JPA/Hibernate/Spring-Data YOK — ADR karar-2).
--
-- İnvariantlar (Codex 019f57cb 1e-b kilit-noktaları + ModelGovernanceStatusProjection sözleşmesi):
--   * TEK GLOBAL zincir (tenant-scope YOK): sequence GLOBAL monoton + BOŞLUKSUZ + 0-tabanlı
--     (projeksiyon sequence == fiziksel index; genesis=0 zorlar). Bu yüzden `sequence` BIGSERIAL DEĞİL —
--     serial 1'den başlar ve rollback'te boşluk sızdırır; adapter değeri advisory-lock altında
--     `global-max+1` üretir (Codex: "append: sequence=global-last+1"). PK boşluk/çift-değeri kesin reddeder.
--   * KAPALI vokabüler CHECK'leri: from/to_status ∈ ApprovalStatus; capability ∈ Capability;
--     reason_code ∈ TransitionReason. TransitionReason kümesi 1e-b'de BİLİNÇLE DONDURULUR (Codex — final):
--     yeni gerekçe/geçiş = onay-politikası genişletmesi (ADR + yeni migration gerekir).
--   * Append-only: UPDATE/DELETE/TRUNCATE DB-trigger'la reddedilir (kod disiplini DEĞİL makine-zorlanır;
--     superuser dahil RAISE). Geçiş-matris legalliği (from,to,reason) adapter'da INSERT-öncesi zorlanır
--     (isValidTransition) + READ tarafı projeksiyonda yeniden doğrulanır (silent-skip YOK).
--   * Rol ayrımı (least-privilege; ATS-0003 düzlemleri): runtime-rol `ats_app` YALNIZ SELECT (app-boot
--     yalnız Reader'a bağlanır); ayrı writer-rol `ats_governance_writer` INSERT + SELECT (admin CLI/workflow);
--     tablo sahibi = migration-owner. Roller NOLOGIN (bağlantı kimliği deploy düzlemi — Vault/ats-gitops).
--     NOT: adapter sequence'i kendi üretir (PG SEQUENCE nesnesi YOK) → writer için "sequence USAGE" grant'ı
--     KONUSUZ (boşluksuz-0 invariant'ı serial'ı dışladığı için bilinçli sapma; Codex append-kuralıyla uyumlu).
--   * Veri-minimizasyonu: claim/transcript/URL/bearer/secret/PII TAŞINMAZ; actor_ref opak/bounded
--     (GovernanceActorRef), reason_code kapalı-enum. occurred_at adapter'ın injected Clock'undan (backdating YOK).

CREATE TABLE model_governance_ledger (
    sequence      BIGINT      PRIMARY KEY,            -- GLOBAL monoton + boşluksuz + 0-tabanlı (adapter üretir)
    transition_id TEXT        NOT NULL,
    approval_ref  TEXT        NOT NULL,
    capability    TEXT        NOT NULL,
    from_status   TEXT        NOT NULL,
    to_status     TEXT        NOT NULL,
    actor_ref     TEXT        NOT NULL,
    occurred_at   TIMESTAMPTZ NOT NULL,               -- injected Clock (mikrosaniye; ISO round-trip hash girdisi)
    reason_code   TEXT        NOT NULL,
    previous_hash CHAR(64)    NOT NULL,               -- genesis = 64×'0' sentinel
    entry_hash    CHAR(64)    NOT NULL,               -- SHA-256 (ModelGovernanceTransitionHashChain single-source)
    CONSTRAINT model_governance_ledger_transition_id_uq UNIQUE (transition_id),
    -- KAPALI vokabüler (serbest string YASAK) — enum kümeleriyle birebir:
    CONSTRAINT model_governance_ledger_from_status_ck
        CHECK (from_status IN ('UNINITIALIZED', 'APPROVED', 'REVOKED', 'DRAFT')),
    CONSTRAINT model_governance_ledger_to_status_ck
        CHECK (to_status IN ('UNINITIALIZED', 'APPROVED', 'REVOKED', 'DRAFT')),
    CONSTRAINT model_governance_ledger_capability_ck
        CHECK (capability IN ('TRANSCRIBE', 'CITE')),
    -- reason_code kümesi 1e-b'de DONDURULMUŞ (TransitionReason final; genişletme = ADR + migration):
    CONSTRAINT model_governance_ledger_reason_code_ck
        CHECK (reason_code IN ('DRAFTED', 'INITIAL_APPROVAL', 'APPROVED_FROM_DRAFT', 'REVOKED_BY_OWNER', 'REAPPROVED'))
);

-- Öznenin (approval_ref, capability) cari-durum sorgusu (CAS): son transition'ı hızlı bul.
CREATE INDEX model_governance_ledger_subject_seq_idx
    ON model_governance_ledger (approval_ref, capability, sequence DESC);

-- Append-only: UPDATE/DELETE (satır) + TRUNCATE (statement) makine-reddi (worm_ledger deseni).
CREATE OR REPLACE FUNCTION model_governance_ledger_reject_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'model_governance_ledger append-only (gov1-1e): % yasak', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER model_governance_ledger_no_update_delete
    BEFORE UPDATE OR DELETE ON model_governance_ledger
    FOR EACH ROW EXECUTE FUNCTION model_governance_ledger_reject_mutation();

CREATE TRIGGER model_governance_ledger_no_truncate
    BEFORE TRUNCATE ON model_governance_ledger
    FOR EACH STATEMENT EXECUTE FUNCTION model_governance_ledger_reject_mutation();

-- Runtime rol (V1'de oluşturuldu): app-boot YALNIZ Reader → SELECT-only (INSERT/UPDATE/DELETE YOK).
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ats_app') THEN
        CREATE ROLE ats_app NOLOGIN;
    END IF;
END $$;
GRANT SELECT ON model_governance_ledger TO ats_app;

-- Writer rol (admin CLI/workflow): explicit authority — INSERT + SELECT (UPDATE/DELETE YOK; append-only).
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ats_governance_writer') THEN
        CREATE ROLE ats_governance_writer NOLOGIN;
    END IF;
END $$;
GRANT INSERT, SELECT ON model_governance_ledger TO ats_governance_writer;
