# RB-ats-migrator-role-split — Split Flyway migrator role from ATS runtime

## Scope

One-time pre-production DBA action that issues the operational credentials that Flyway (init container) and the runtime pod use, after ownership of every schema-public object has moved from `ats_app` to `ats_migrator`. **Migrations `V16__migrator_role_least_privilege.sql` and `V20__migrator_owns_existing_objects.sql` must already be applied** before this runbook is executed — V16 pre-provisions `ats_migrator` (NOLOGIN) and revokes `CREATE` on schema public from `ats_app`; V20 performs the ownership transfer itself (automated, see below — this used to be a manual Step 1 here).

Fixes #176 (P0-FULLATS-DB-01); ownership-transfer automation completed by #230 (P0-FULLATS-DB-02).

## Before any of this: roles must exist first (#202)

On a **clean install** the chain cannot reach V16 on its own. Three migrations provision
roles — V1 (`ats_app`), V4 (`ats_governance_writer`), V16 (`ats_migrator`) — each guarded by
`IF NOT EXISTS`. The guard means an install works *iff the roles already exist*; otherwise
the runner needs `CREATEROLE`, which the deployment identity (`ats_app`) deliberately does
not have. Existing environments only work because their roles were created out of band.

So provision the roles once, with a privileged principal, **before the application's first
migration run**:

```sql
-- as postgres (superuser), on the target cluster
CREATE ROLE ats_app NOLOGIN;               -- skip any that already exist
CREATE ROLE ats_governance_writer NOLOGIN;
CREATE ROLE ats_migrator NOLOGIN;

-- Creating the role is NOT enough. V16 runs
--   ALTER DEFAULT PRIVILEGES FOR ROLE ats_migrator ...
-- and Postgres requires the caller to be a *member* of that role to alter its defaults.
-- Without this grant the chain stops one step later, at
--   ERROR: permission denied to change default privileges
GRANT ats_migrator TO <migration-runner>;  -- e.g. ats_app
```

Then let the application start; Flyway applies V1..V16 normally, and this runbook's
ownership transfer becomes possible.

### How this fails if you skip it

It does not look like a failure. Observed on k3d-test, 2026-07-24:

```
Migration of schema "public" to version "16 - migrator role least privilege" failed!
SQLSTATE 42501: permission denied to create role
  Where: CREATE ROLE ats_migrator NOLOGIN
```

The pod crash-looped for **14 hours** while the previous ReplicaSet kept serving —
Endpoints populated, health checks green, no alert from anything watching the service
itself. A `KubeReplicaSetSplit` alert on the *rollout* is what surfaced it. If a deploy
seems to have "not taken effect", check for a second ReplicaSet stuck at `ready=0` before
looking anywhere else.

The prerequisite is enforced in CI by
`MigrationRoleProvisioningPrerequisiteTest`: one case proves a least-privilege runner is
stopped when the roles are absent, the other proves this exact remedy discharges it. Note
that the migrations themselves cannot carry the fix — they are applied everywhere and
Flyway validates checksums on start, so editing an applied file breaks existing installs.

## When to run

Before the first production activation (real candidate PII, GA cutover) — never on a live customer database. Idempotent on drilled non-prod databases; safe to re-run.

## Step 1 is now automatic (#230)

`V20__migrator_owns_existing_objects.sql` runs `REASSIGN OWNED BY ats_app TO ats_migrator`
(plus the `flyway_schema_history` grant Flyway itself needs to keep running as `ats_app`
afterward) as a normal Flyway migration. It requires no new operational precondition: the
`ats_app`↔`ats_migrator` membership it relies on is the same one V16's own
`ALTER DEFAULT PRIVILEGES FOR ROLE ats_migrator` line already required to succeed (see
"Before any of this" above). Proven on both the fresh-install and upgrade path by
`MigratorOwnershipTransferTest` (`persistence-postgres`) — idempotent, safe to re-apply.

Once V20 has run (`SELECT * FROM flyway_schema_history WHERE version = '20';`), skip
straight to **Step 1** below. The manual superuser ownership-transfer step that used to be
here is gone; this runbook now starts at issuing the `ats_migrator_login` credential.

## Preconditions

- Vault path `secret/ats/db/` writable by operator.
- ATS backend pods scaled to 0 or in maintenance mode.
- V20 present in `flyway_schema_history` (`SELECT * FROM flyway_schema_history WHERE version = '20';`).

## Steps

### 1. Issue the migrator login (`postgres` superuser)

```sql
-- Rotate every 90 days per credential lifecycle policy
CREATE ROLE ats_migrator_login WITH LOGIN PASSWORD '<random-32-char>' IN ROLE ats_migrator VALID UNTIL '2026-10-19';

-- Cache the credential in Vault so ArgoCD / init container can pull it via ExternalSecret
vault kv put secret/ats/db/migrator \
    username=ats_migrator_login \
    password=<random-32-char> \
    valid_until=2026-10-19
```

### 2. Reduce the runtime login to app-role membership only

```sql
-- ats_app_login is the existing runtime pod credential
ALTER ROLE ats_app_login NOINHERIT;
GRANT ats_app TO ats_app_login;
```

### 3. Verify least-privilege invariants (live)

```sql
-- ats_app cannot CREATE (already true post-V16, re-check)
SELECT has_schema_privilege('ats_app', 'public', 'CREATE');   -- expect: f

-- ats_migrator can DDL
SELECT has_schema_privilege('ats_migrator', 'public', 'CREATE');  -- expect: t

-- Runtime pod (via SET ROLE) cannot create tables
SET ROLE ats_app;
CREATE TABLE runbook_boundary_probe (id int);
-- expect: ERROR: permission denied for schema public
RESET ROLE;
```

### 4. Reconfigure Flyway to use the migrator login

Split the ATS backend Spring config so Flyway migrations run under `ats_migrator_login` while the runtime `DataSource` (Hikari) keeps using `ats_app_login`. Follow-up PR wires the two-datasource pattern; until then Flyway must not auto-run on pod boot (`spring.flyway.enabled=false` + explicit CI/init step).

## Rollback

If the V20 ownership transfer breaks something unexpectedly (emergency manual reversal —
this does not retract the Flyway migration record itself):

```sql
-- Grant back ownership to ats_app
REASSIGN OWNED BY ats_migrator TO ats_app;

-- Restore CREATE for ats_app
GRANT CREATE ON SCHEMA public TO ats_app;
```

Rollback restores the previous baseline but leaves `ats_migrator` provisioned (harmless idle role). V16/V20 are not retracted; only the ownership/grant state is manually reverted.

## Evidence

Store the following in the operator packet for audit:

- `flyway_schema_history` row for V20 (timestamp, success)
- `pg_tables WHERE tableowner = 'ats_app'` count = 0 post-V20
- `has_schema_privilege('ats_app', 'public', 'CREATE')` = `f` post-step 3
- Vault path `secret/ats/db/migrator` last-updated timestamp

## Not covered by this runbook

- Ownership transfer across multiple databases in one cluster (loop the SQL per DB).
- Concurrent long-running transactions during REASSIGN OWNED (pause writes first).
- Rotating the Postgres superuser credential (separate operator runbook).
