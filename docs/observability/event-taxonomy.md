# Operational Event Taxonomy (canonical registry)

> ATS-0010 kanonik event kaydı. **Machine-checked** (`scripts/check-event-taxonomy.mjs`, CI job `event-taxonomy-guard`).
> Bu **operasyonel telemetri** düzlemidir (log/metric/trace) — iş-kanıtı WORM ledger DEĞİL ([[ATS-0003]] / `contracts/src/evidence-ledger.ts`).
> Statü sözlüğü: `enforced (CI)` · `enforced (repo-test)` · `gate-locked` · `design`. Emisyon kodu P1 (G0=GO sonrası) → çoğu satır bugün `design`/`gate-locked`.

## Düzlem sınırı (two-plane)

Operasyonel event yalnız **id-only / pointer / sağlık-sonucu** taşır. Ledger payload'ı, citation gövdesi, transkript/medya içeriği veya **karar-kanıtı** operasyonel log'a **GİRMEZ** — bunların hukuki/iş gerçeği kaynağı WORM `EvidenceLedger`'dır ([[ATS-0003]]). `evidence.*` operasyonel event'leri yalnız "şu ledger girdisi eklendi/eklenemedi" sağlık sinyalidir; içeriğe `ledger_entry_ref` (opak işaretçi) ile bakılır, içerik kopyalanmaz.

## 0. Zarf (envelope) — her event ZORUNLU alanlar

`schema_version` · `event_type` · `event_id` · `category` · `severity` · `occurred_at` · `tenant_id` · `correlation_id` · `trace_id` · `source` · `outcome`

Opsiyonel: `span_id` · `actor_ref` · `reason_code` · `environment` · `deployment_version` · `ledger_entry_ref` · `target_ref`

- **schema_version:** zarf şema sürümü (forward-compat; kırıcı değişiklik bump'lar).
- **event_type:** kanonik **tip** ID, namespace.dotted, regex `^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$` (aşağıdaki tablo). Olay-örneği değil, sınıf.
- **event_id:** olay-**örneği** benzersiz ID (occurrence; ör. UUID) — tekil olay izi. `event_type` ile karıştırılmaz.
- **category:** `auth` · `authz` · `evidence` · `ai_pipeline` · `connector` · `admin` · `security` · `consent` · `privacy` · `system`.
- **severity:** `debug` · `info` · `notice` · `warning` · `error` · `critical`.
- **occurred_at:** ISO-8601 UTC.
- **tenant_id:** opak tenant referansı (PII encode etmez).
- **correlation_id:** uygulama-seviyesi iş-akışı korelasyonu; **opak** (tenant/aday/email/domain encode etmez). W3C standardının birebir karşılığı değildir.
- **trace_id / span_id:** dağıtık iz; **W3C Trace Context** (`traceparent`) `trace-id`/`parent-id` alanlarını taşır. `trace_id` zorunlu, `span_id` opsiyonel.
- **source:** üreten servis/bileşen (zorunlu — adli-iz için).
- **outcome:** `success` · `failure` · `denied` · `n/a`.

## 1. PII sınıfı (redaction invariant)

| pii_class | anlam | izin |
|---|---|---|
| `none` | PII içermez | ✅ |
| `id-only` | yalnız opak ID/hash (ham PII değil) | ✅ |
| `pseudonymized` | takma-ad/opak referans (log düzleminde geri-bağlanamaz) | ✅ |
| `raw-pii` | aday adı/email/telefon/CV içeriği | ❌ |
| `content` | transkript/medya gövdesi | ❌ |
| `secret` | token/anahtar/parola | ❌ |

Yasak sınıflar (`raw-pii`/`content`/`secret`) bu bölümde **tanımlıdır**, ancak aşağıdaki **§2 Event kaydı tablosunun `pii_class` hücresinde kullanılamaz** — drift-guard event satırlarını reddeder (fail-closed registry invariantı). Kod-seviye runtime redaksiyonu (serializer allow-list) **ayrı** ve **P1 gate-locked**'tır; bu registry runtime redaksiyonu garanti etmez, yalnız tasarımı fail-closed sabitler.

## 2. Event kaydı

| Event Type ID | Category | Severity | pii_class | Required-extra | Status |
|---|---|---|---|---|---|
| **auth.login.succeeded** | auth | info | pseudonymized | actor_ref | gate-locked |
| **auth.login.failed** | auth | warning | pseudonymized | reason_code | gate-locked |
| **auth.token.refreshed** | auth | info | id-only | actor_ref | gate-locked |
| **authz.access.denied** | authz | warning | id-only | actor_ref, reason_code | gate-locked |
| **authz.tenant_boundary.violation** | authz | critical | id-only | actor_ref, reason_code | gate-locked |
| **evidence.append.succeeded** | evidence | info | id-only | ledger_entry_ref | gate-locked |
| **evidence.append.failed** | evidence | error | id-only | reason_code | gate-locked |
| **evidence.tombstone.appended** | evidence | notice | id-only | actor_ref, reason_code | gate-locked |
| **evidence.human_decision.finalized** | evidence | notice | id-only | actor_ref, ledger_entry_ref | gate-locked |
| **evidence.packet.accessed** | evidence | notice | id-only | actor_ref | gate-locked |
| **evidence.packet.shared** | evidence | notice | id-only | actor_ref, target_ref | gate-locked |
| **evidence.recording.started** | evidence | info | id-only | actor_ref | gate-locked |
| **evidence.recording.stopped** | evidence | notice | id-only | actor_ref | gate-locked |
| **evidence.recording.blocked_no_consent** | evidence | warning | id-only | reason_code | gate-locked |
| **evidence.speaker.attributed** | evidence | notice | id-only | actor_ref, ledger_entry_ref, target_ref | gate-locked |
| **evidence.attachment.scan_rejected** | evidence | error | none | reason_code | gate-locked |
| **ai_pipeline.citation.rejected** | ai_pipeline | warning | id-only | reason_code | gate-locked |
| **ai_pipeline.output.pii_blocked** | ai_pipeline | error | none | reason_code | gate-locked |
| **ai_pipeline.prompt_injection.blocked** | ai_pipeline | critical | none | reason_code | gate-locked |
| **ai_pipeline.provider.request_rejected** | ai_pipeline | warning | none | reason_code | gate-locked |
| **connector.sync.succeeded** | connector | info | id-only | target_ref | gate-locked |
| **connector.sync.failed** | connector | error | id-only | reason_code | gate-locked |
| **connector.egress.blocked** | connector | critical | id-only | target_ref, reason_code | gate-locked |
| **admin.impersonation.started** | admin | critical | pseudonymized | actor_ref, target_ref, reason_code | gate-locked |
| **admin.impersonation.ended** | admin | notice | pseudonymized | actor_ref, target_ref | gate-locked |
| **admin.breakglass.requested** | admin | critical | pseudonymized | actor_ref, reason_code | gate-locked |
| **admin.breakglass.approved** | admin | critical | pseudonymized | actor_ref, reason_code | gate-locked |
| **admin.breakglass.denied** | admin | warning | pseudonymized | actor_ref, reason_code | gate-locked |
| **admin.breakglass.invoked** | admin | critical | pseudonymized | actor_ref, reason_code | gate-locked |
| **admin.breakglass.ended** | admin | notice | pseudonymized | actor_ref | gate-locked |
| **admin.config.changed** | admin | notice | id-only | actor_ref, reason_code | gate-locked |
| **security.audit_log.read** | security | notice | id-only | actor_ref | gate-locked |
| **security.audit_export.generated** | security | notice | id-only | actor_ref | gate-locked |
| **security.key.rotation.succeeded** | security | notice | none | reason_code | gate-locked |
| **security.key.rotation.failed** | security | critical | none | reason_code | gate-locked |
| **security.ratelimit.tripped** | security | warning | id-only | reason_code | gate-locked |
| **consent.recorded** | consent | notice | id-only | actor_ref | gate-locked |
| **consent.disclosure_viewed** | consent | info | id-only | actor_ref | gate-locked |
| **consent.withdrawn** | consent | notice | id-only | actor_ref, reason_code | gate-locked |
| **privacy.dsar.received** | privacy | notice | id-only | reason_code | gate-locked |
| **privacy.dsar.fulfilled** | privacy | notice | id-only | actor_ref | gate-locked |
| **privacy.erasure.executed** | privacy | notice | id-only | actor_ref, reason_code | gate-locked |
| **privacy.retention.purged** | privacy | notice | id-only | reason_code | gate-locked |
| **privacy.consent.recorded** | privacy | info | id-only | state | enforced (repo-test) |
| **privacy.consent.ledger_append_failed** | privacy | error | id-only | reason_code | enforced (repo-test) |
| **privacy.correction.requested** | privacy | notice | id-only | reason_code | gate-locked |
| **privacy.correction.fulfilled** | privacy | notice | id-only | actor_ref | gate-locked |
| **security.config.loaded** | security | info | none | — | design |
| **system.startup** | system | info | none | — | design |

## 3. Doğrulama (drift-guard `scripts/check-event-taxonomy.mjs`)

- **§0 zarf** bölümünde (yalnız o section'da) kanonik ZORUNLU alanlar eksiksiz listeli.
- **§2 Event kaydı** section'ındaki **her data satırı** (bold-bağımsız) parse edilir: `event_type` regex + tekillik + geçerli category/severity/pii_class/status; `Required-extra` hücresi **zarf-üstü** olay-spesifik alanları işaret eder; yalnız izinli opsiyonel alan (`actor_ref`/`reason_code`/`ledger_entry_ref`/`target_ref`) veya `—` içerir (zorunlu zarf alanı — örn. `source` — burada tekrarlanmaz).
- **Yasak pii_class** (`raw-pii`/`content`/`secret`) §2 event satırının `pii_class` hücresinde görünemez → exit 1 (§1 tanım tablosu serbest; yalnız event satırı kısıtlı).
- **Sentinel event ID silme guard'ı:** kritik denetim event'leri (`authz.tenant_boundary.violation`, `admin.breakglass.invoked`, `evidence.tombstone.appended`, `evidence.human_decision.finalized`, `privacy.erasure.executed`, `ai_pipeline.prompt_injection.blocked`) silinemez.
- Minimum satır eşiği (regression guard).

## 4. Bağlantı
- [[ATS-0010]] kararı · [[ATS-0003]] WORM evidence-ledger · [[ATS-0007]] §3/§6 · [security/threat-register.md](../security/threat-register.md) **T-I6** (operasyonel log PII sızıntısı) · T-R1/T-R2.
