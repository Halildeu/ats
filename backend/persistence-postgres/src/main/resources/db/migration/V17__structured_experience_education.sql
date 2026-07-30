-- Faz 25 #215 P1-FORM-01: structured experience/education entries + languages/certifications.
--
-- Owner request (2026-07-26): the application form should repeat multi-value fields the way
-- LinkedIn and kariyer.net do, instead of one free-text box per section.
--
-- Expand step of an expand/contract migration. Changing experience/education from TEXT to a
-- structured array in one move would break either side of the deploy: a backend that only
-- accepts arrays rejects the current frontend's strings, and a frontend that only sends
-- arrays is rejected by the current backend. So the new columns are ADDED next to the
-- legacy TEXT ones, existing rows are backfilled, and both representations are written for
-- now. Making the entries authoritative and dropping the TEXT columns is a later,
-- separate migration (contract step) once no writer sends the legacy shape.
--
-- languages/certifications land as TEXT, not arrays: the parser already extracts them
-- (ats#212, parserVersion v7) but the form had nowhere to put them, so proposals were
-- accepted and then silently dropped. Owner chose plain text for these two.

ALTER TABLE ats_application
    ADD COLUMN IF NOT EXISTS experience_entries JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS education_entries  JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS languages          TEXT,
    ADD COLUMN IF NOT EXISTS certifications     TEXT;

-- Both entry columns must stay JSON arrays; a bare object or scalar would break every
-- reader. Enforced in the database so a faulty writer fails closed instead of persisting
-- a shape the application cannot parse.
ALTER TABLE ats_application
    DROP CONSTRAINT IF EXISTS ats_application_experience_entries_is_array;
ALTER TABLE ats_application
    ADD CONSTRAINT ats_application_experience_entries_is_array
        CHECK (jsonb_typeof(experience_entries) = 'array');

ALTER TABLE ats_application
    DROP CONSTRAINT IF EXISTS ats_application_education_entries_is_array;
ALTER TABLE ats_application
    ADD CONSTRAINT ats_application_education_entries_is_array
        CHECK (jsonb_typeof(education_entries) = 'array');

-- Backfill: an existing row carries one unstructured block per section. It becomes a
-- single entry whose description holds the original text, so nothing is lost and the
-- recruiter view keeps showing the same content. Rows already backfilled are skipped,
-- which keeps this migration safe to re-run on drilled installs.
UPDATE ats_application
   SET experience_entries = jsonb_build_array(
           jsonb_build_object('description', experience))
 WHERE experience_entries = '[]'::jsonb
   AND experience IS NOT NULL
   AND length(btrim(experience)) > 0;

UPDATE ats_application
   SET education_entries = jsonb_build_array(
           jsonb_build_object('description', education))
 WHERE education_entries = '[]'::jsonb
   AND education IS NOT NULL
   AND length(btrim(education)) > 0;

COMMENT ON COLUMN ats_application.experience_entries IS
    'Faz 25 #215: structured work-experience entries [{title,company,startDate,endDate,description}]. '
    'Expand step — legacy ats_application.experience TEXT still written; entries become authoritative '
    'in the later contract migration.';
COMMENT ON COLUMN ats_application.education_entries IS
    'Faz 25 #215: structured education entries [{school,degree,field,startYear,endYear,description}]. '
    'Expand step — legacy ats_application.education TEXT still written.';
COMMENT ON COLUMN ats_application.languages IS
    'Faz 25 #215: candidate-declared languages, free text. Parser extracted these before the form '
    'could hold them (ats#212 v7), so accepted proposals were silently dropped.';
COMMENT ON COLUMN ats_application.certifications IS
    'Faz 25 #215: candidate-declared certifications, free text. Same reason as languages.';
