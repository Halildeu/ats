-- #213 (213-G): öneri kaynağı. İsteğe bağlı ve kapalı küme; serbest metin yok.
-- NULL = etiket ya da bölüm okuması (bugüne kadarki tek yol); mevcut satırlar değişmez.
ALTER TABLE ats_resume_proposal
    ADD COLUMN provenance_source TEXT,
    ADD CONSTRAINT ats_resume_proposal_source_check CHECK (
        provenance_source IS NULL OR provenance_source IN ('ADDRESS_LAST_LINE'));
