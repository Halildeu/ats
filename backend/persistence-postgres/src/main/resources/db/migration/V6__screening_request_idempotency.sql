-- ATS #156-c: runtime screening request first-writer belleği + restricted source lineage.
--
-- Üç yaşam döngüsü bilinçli ayrıdır:
--   1) request sentinel: opaque idempotency key + random finding ref; silinmez/güncellenmez,
--   2) source binding: canonical source pointer; restricted parent ile hard-purge edilir,
--   3) purge sentinel: aynı request key'in silme sonrası yeniden evidence üretmesini engeller.
-- Hiçbir tabloda raw/normalized/matched text veya içerik/bulgu hash'i YOKTUR.

ALTER TABLE protected_screening_evidence
    ADD CONSTRAINT protected_screening_tenant_interview_ref_uq
    UNIQUE (tenant_id, interview_id, finding_set_ref);

-- Kalıcı first-writer sentinel. Parent'a FK BİLEREK yok: evidence hard-purge sonrası
-- opaque operation belleği kalmalı ki aynı key silinmiş evidence'i diriltemesin.
CREATE TABLE protected_screening_request (
    tenant_id       TEXT NOT NULL,
    interview_id    TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    finding_set_ref TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, interview_id, idempotency_key),
    CONSTRAINT protected_screening_request_full_uq
        UNIQUE (tenant_id, interview_id, idempotency_key, finding_set_ref),
    CONSTRAINT protected_screening_request_key_ck
        CHECK (idempotency_key ~ '^scrq_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
    CONSTRAINT protected_screening_request_finding_ref_ck
        CHECK (finding_set_ref ~ '^fsr_[0-9a-f]{64}$')
);

-- Restricted/deletable canonical lineage. Composite FK interview-A request'inin
-- interview-B evidence'ına bağlanmasını DB seviyesinde reddeder.
CREATE TABLE protected_screening_source_binding (
    tenant_id            TEXT NOT NULL,
    interview_id         TEXT NOT NULL,
    idempotency_key      TEXT NOT NULL,
    finding_set_ref      TEXT NOT NULL,
    source_kind          TEXT NOT NULL,
    canonical_source_ref TEXT NOT NULL,
    segment_index        INT,
    PRIMARY KEY (tenant_id, interview_id, idempotency_key),
    CONSTRAINT protected_screening_binding_finding_uq
        UNIQUE (tenant_id, interview_id, finding_set_ref),
    CONSTRAINT protected_screening_binding_request_fk
        FOREIGN KEY (tenant_id, interview_id, idempotency_key, finding_set_ref)
        REFERENCES protected_screening_request
            (tenant_id, interview_id, idempotency_key, finding_set_ref),
    CONSTRAINT protected_screening_binding_parent_fk
        FOREIGN KEY (tenant_id, interview_id, finding_set_ref)
        REFERENCES protected_screening_evidence (tenant_id, interview_id, finding_set_ref)
        ON DELETE CASCADE,
    CONSTRAINT protected_screening_binding_same_ref_ck
        CHECK (finding_set_ref ~ '^fsr_[0-9a-f]{64}$'),
    CONSTRAINT protected_screening_binding_source_ref_ck
        -- PostgreSQL POSIX regex tekrar üst sınırı 255'tir; {1,256} SQLSTATE
        -- 2201B üretir. Karakter allowlist'i ve gerçek 256 sınırını ayrı doğrula.
        CHECK (canonical_source_ref ~ '^[A-Za-z0-9._:/-]+$'
            AND char_length(canonical_source_ref) BETWEEN 1 AND 256),
    CONSTRAINT protected_screening_binding_source_kind_ck
        CHECK (source_kind IN ('TRANSCRIPT_SEGMENT', 'CITATION_CLAIM')),
    CONSTRAINT protected_screening_binding_segment_ck CHECK (
        (source_kind = 'TRANSCRIPT_SEGMENT' AND segment_index IS NOT NULL AND segment_index >= 0)
        OR
        (source_kind = 'CITATION_CLAIM' AND segment_index IS NULL)
    )
);

CREATE INDEX protected_screening_binding_finding_idx
    ON protected_screening_source_binding (tenant_id, interview_id, finding_set_ref);

-- Append-only purge sentinel: source binding silinse de aynı operation key terminal kalır.
CREATE TABLE protected_screening_request_purge (
    tenant_id              TEXT NOT NULL,
    interview_id           TEXT NOT NULL,
    idempotency_key        TEXT NOT NULL,
    tombstone_evidence_id  TEXT NOT NULL,
    purged_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, interview_id, idempotency_key),
    CONSTRAINT protected_screening_request_purge_request_fk
        FOREIGN KEY (tenant_id, interview_id, idempotency_key)
        REFERENCES protected_screening_request (tenant_id, interview_id, idempotency_key),
    CONSTRAINT protected_screening_request_purge_evidence_ck
        CHECK (tombstone_evidence_id <> '')
);

-- Request sentinel/purge append-only; app UPDATE/DELETE alamaz. Source binding de app tarafından
-- doğrudan silinemez, yalnız restricted parent purge'ının FK CASCADE'i ile gider.
GRANT INSERT, SELECT ON protected_screening_request TO ats_app;
GRANT INSERT, SELECT ON protected_screening_source_binding TO ats_app;
GRANT INSERT, SELECT ON protected_screening_request_purge TO ats_app;
