-- Faz 25 #176 P0-FULLATS-DB-01: split Flyway migrator role from ATS runtime role.
--
-- Baseline (2026-07-16): ats_app is LOGIN + DB/schema/table owner; owner-implied DDL/DML
-- overrides narrow V2..V15 grants. Pre-prod hardening: strip schema CREATE from ats_app
-- and pre-provision ats_migrator (NOLOGIN, DDL-authoritative) so future Flyway runs can
-- execute under it via an operator-issued short-lived login. Ownership transfer of
-- existing objects is a DBA action (superuser scope); see RB-ats-migrator-role-split.
-- Idempotent: safe on fresh, drilled, and post-transfer installs.

DO $migrator_role$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'ats_migrator') THEN
        CREATE ROLE ats_migrator NOLOGIN;
    END IF;
END
$migrator_role$;

GRANT ALL ON SCHEMA public TO ats_migrator;

REVOKE CREATE ON SCHEMA public FROM ats_app;
GRANT USAGE ON SCHEMA public TO ats_app;

ALTER DEFAULT PRIVILEGES FOR ROLE ats_migrator IN SCHEMA public
    GRANT SELECT, INSERT ON TABLES TO ats_app;
ALTER DEFAULT PRIVILEGES FOR ROLE ats_migrator IN SCHEMA public
    GRANT USAGE ON SEQUENCES TO ats_app;
