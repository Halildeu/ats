-- Faz 25 #218 P1-RESUME-04: the parser publishes multi-record sections as structured entries.
--
-- Owner report (2026-07-26): importing a CV with several jobs produces ONE experience card,
-- and the same for education. Measured cause: the parser joins a section's lines into one
-- string, and the record boundary signal (bold + larger font at the section's left edge)
-- only exists in the line geometry, which the join destroys. Splitting downstream is not
-- possible — measurement showed the joined text has zero boundary signal (0 blank lines,
-- 0 double newlines, 0 line-leading years), so line-wise splitting would turn 1-2 real
-- records into ~5 junk cards, which is worse than one card.
--
-- Expand step. The legacy TEXT column stays authoritative and is still written; the entry
-- column is NULLABLE with no default so an existing row means "this proposal predates
-- grouping" rather than "grouping found nothing" — those are different facts and a
-- '[]' default would erase the difference.
--
-- Two tables because the entries have to survive the whole chain:
--   ats_resume_proposal   → what the parser proposed, shown for candidate review
--   ats_candidate_draft_field → what the candidate CONFIRMED, applied to the form
-- Stopping at the proposal table would leave the form reading the blob again.

ALTER TABLE ats_resume_proposal
    ADD COLUMN IF NOT EXISTS proposed_entries JSONB;

ALTER TABLE ats_candidate_draft_field
    ADD COLUMN IF NOT EXISTS field_entries JSONB;

-- When present the column must be a JSON array; a bare object or scalar would break every
-- reader. Enforced in the database so a faulty writer fails closed instead of persisting a
-- shape the application cannot parse. NULL stays legal — it is the "no grouping" fact.
ALTER TABLE ats_resume_proposal
    DROP CONSTRAINT IF EXISTS ats_resume_proposal_entries_is_array;
ALTER TABLE ats_resume_proposal
    ADD CONSTRAINT ats_resume_proposal_entries_is_array
        CHECK (proposed_entries IS NULL OR jsonb_typeof(proposed_entries) = 'array');

ALTER TABLE ats_candidate_draft_field
    DROP CONSTRAINT IF EXISTS ats_candidate_draft_field_entries_is_array;
ALTER TABLE ats_candidate_draft_field
    ADD CONSTRAINT ats_candidate_draft_field_entries_is_array
        CHECK (field_entries IS NULL OR jsonb_typeof(field_entries) = 'array');

-- Only experience and education are multi-record sections. A grouped entry list on any
-- other field would mean a writer bug, and finding that out at read time (as a parse
-- failure on some later request) is worse than refusing the write.
ALTER TABLE ats_resume_proposal
    DROP CONSTRAINT IF EXISTS ats_resume_proposal_entries_only_multirecord;
ALTER TABLE ats_resume_proposal
    ADD CONSTRAINT ats_resume_proposal_entries_only_multirecord
        CHECK (proposed_entries IS NULL OR field_key IN ('EXPERIENCE', 'EDUCATION'));

ALTER TABLE ats_candidate_draft_field
    DROP CONSTRAINT IF EXISTS ats_candidate_draft_field_entries_only_multirecord;
ALTER TABLE ats_candidate_draft_field
    ADD CONSTRAINT ats_candidate_draft_field_entries_only_multirecord
        CHECK (field_entries IS NULL OR field_key IN ('EXPERIENCE', 'EDUCATION'));

-- No backfill. An existing proposal was produced by parser v8 or earlier, which had no
-- grouping; writing a single-entry array would claim the old parser found one record when
-- it never looked. NULL is the honest value and the reader falls back to the TEXT column.

COMMENT ON COLUMN ats_resume_proposal.proposed_entries IS
    'Faz 25 #218: structured records the parser grouped out of one section '
    '[{title,subtitle,dateText,description}]. NULL = this proposal predates grouping, or '
    'grouping was not reliable for this section; readers fall back to proposed_value. '
    'Expand step — proposed_value stays authoritative.';
COMMENT ON COLUMN ats_candidate_draft_field.field_entries IS
    'Faz 25 #218: structured records carried from the accepted proposal into the confirmed '
    'draft, so the form can create one card per record. NULL when the candidate EDITED the '
    'text (their edit is authoritative and the old records no longer describe it) or when '
    'grouping produced nothing.';
