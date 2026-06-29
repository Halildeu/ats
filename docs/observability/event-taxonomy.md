# Operational Event Taxonomy (canonical registry)

> ATS-0010 kanonik event kaydı. **Machine-checked** (`scripts/check-event-taxonomy.mjs`, CI job `event-taxonomy-guard`).
> Bu **operasyonel telemetri** düzlemidir (log/metric/trace) — iş-kanıtı WORM ledger DEĞİL ([[ATS-0003]] / `contracts/src/evidence-ledger.ts`).
> Statü sözlüğü: `enforced (CI)` · `enforced (repo-test)` · `gate-locked` · `design`. Emisyon kodu P1 (G0=GO sonrası) → çoğu satır bugün `design`/`gate-locked`.

## 0. Zarf (envelope) — her event ZORUNLU alanlar

`event` · `category` · `severity` · `occurred_at` · `tenant_id` · `correlation_id` · `outcome`

Opsiyonel: `actor_ref` · `trace_id` · `source` · `reason_code`

- **event:** kanonik ID, namespace.dotted, regex `^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$`.
- **category:** `auth` · `authz` · `evidence` · `ai_pipeline` · `connector` · `admin` · `security` · `consent` · `system`.
- **severity:** `debug` · `info` · `notice` · `warning` · `error` · `critical`.
- **occurred_at:** ISO-8601 UTC.
- **outcome:** `success` · `failure` · `denied` · `n/a`.

## 1. PII sınıfı (redaction invariant)

| pii_class | anlam | izin |
|---|---|---|
| `none` | PII içermez | ✅ |
| `id-only` | yalnız opak ID/hash (ham PII değil) | ✅ |
| `pseudonymized` | takma-ad/opak referans (geri-bağlanamaz log düzleminde) | ✅ |
| `raw-pii` | aday adı/email/telefon/CV içeriği | ❌ YASAK (fail-closed) |
| `content` | transkript/medya gövdesi | ❌ YASAK |
| `secret` | token/anahtar/parola | ❌ YASAK |

Yasak sınıf bu registry'de **görünemez** — drift-guard reddeder. Kod-seviye: serializer allow-list + redaksiyon (P1).

## 2. Event kaydı

| Event ID | Category | Severity | pii_class | Required (zarf üstü) | Status |
|---|---|---|---|---|---|
| **auth.login.succeeded** | auth | info | pseudonymized | actor_ref | gate-locked |
| **auth.login.failed** | auth | warning | pseudonymized | reason_code | gate-locked |
| **auth.token.refreshed** | auth | info | id-only | actor_ref | gate-locked |
| **authz.access.denied** | authz | warning | id-only | actor_ref, reason_code | gate-locked |
| **authz.tenant_boundary.violation** | authz | critical | id-only | actor_ref, reason_code | gate-locked |
| **evidence.append.succeeded** | evidence | info | id-only | actor_ref | gate-locked |
| **evidence.append.failed** | evidence | error | id-only | reason_code | gate-locked |
| **evidence.tombstone.appended** | evidence | notice | id-only | actor_ref, reason_code | gate-locked |
| **ai_pipeline.citation.rejected** | ai_pipeline | warning | id-only | reason_code | gate-locked |
| **ai_pipeline.output.pii_blocked** | ai_pipeline | error | none | reason_code | gate-locked |
| **ai_pipeline.prompt_injection.blocked** | ai_pipeline | critical | none | reason_code | gate-locked |
| **connector.sync.succeeded** | connector | info | id-only | source | gate-locked |
| **connector.sync.failed** | connector | error | id-only | source, reason_code | gate-locked |
| **admin.impersonation.started** | admin | critical | pseudonymized | actor_ref, reason_code | gate-locked |
| **admin.breakglass.invoked** | admin | critical | pseudonymized | actor_ref, reason_code | gate-locked |
| **consent.recorded** | consent | notice | id-only | actor_ref | gate-locked |
| **consent.withdrawn** | consent | notice | id-only | actor_ref, reason_code | gate-locked |
| **security.ratelimit.tripped** | security | warning | id-only | source | gate-locked |
| **security.config.loaded** | security | info | none | source | design |
| **system.startup** | system | info | none | source | design |

## 3. Doğrulama (drift-guard `scripts/check-event-taxonomy.mjs`)

- Zarf bölümü ZORUNLU alanları listeler; kanonik 7 alan eksiksiz.
- Her satır: ID regex + tekillik + geçerli category/severity/pii_class/status.
- **Yasak pii_class** (`raw-pii`/`content`/`secret`) hiçbir satırda görünemez → exit 1.
- Minimum satır eşiği (regression guard).

## 4. Bağlantı
- [[ATS-0010]] kararı · [[ATS-0003]] WORM evidence-ledger · [[ATS-0007]] §3/§6 · [security/threat-register.md](../security/threat-register.md) T-R1/T-R2/P-L1.
