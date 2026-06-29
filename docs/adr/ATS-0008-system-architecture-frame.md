# ATS-0008 — System Architecture Frame (servis/MFE decomposition + standart stack)

- **Durum:** Proposed → Acceptance Ready (owner 3 fork kararı + cross-AI Codex review sonrası Accepted)
- **Tarih:** 2026-06-29
- **Karar tipi:** Mimari çerçeve / drift-guard (gate-safe — P1 fonksiyonel YOK)
- **Bağlam kaynağı:** [00-ATS-MASTER-PLAN](../00-ATS-MASTER-PLAN.md) §9 + [[ATS-0001]]..[[ATS-0007]] + [PRD-P1](../PRD-P1-interview-evidence-mvp.md) F1-F10
- **Amaç:** Tüm operatörler (Halil/Claude/Salih/Zeynep + Codex review) **aynı mimari çerçevede** ilerlesin; "kim hangi servisi/MFE'yi/eklentiyi seçecek" belirsizliğinden doğan **drift** önlensin. ADR-0001..0007 *prensip + sınır* koyar; bu ADR somut *decomposition + stack-lock*'u koyar.

## Bağlam

ADR-0001..0007 mimari prensipleri (boundary, tenant izolasyon, KVKK/WORM, AI pipeline, governance, sovereign, security) Accepted. Ancak **somut yapı** tanımsızdı: kaç servis, kaç MFE, hangi ilişki, hangi standart araç/eklenti. Bu boşluk junior tek-ekip + çok-operatör modelinde drift üretir (herkes farklı kütüphane/topoloji seçer). Bu ADR o boşluğu kapatır.

> Not: planlama canon'u (master plan + ADR-0001..0007 + G0 + PRD) bu PR ile `ats/docs/` altına taşındı — daha önce `~/Documents/ats-planlama/` (lokal, git-dışı, paylaşılmıyordu) = canon-görünürlük drift'i. Tek kanonik ev artık `ats` repo'su.

## Karar

### D-A — Servis decomposition: **2 deployable** (modular monolith core + ayrı AI servisi)

`ats-core` (modular monolith) + `ats-ai` (Python). Mikroservis erken-bölme YASAK (platform **ADR-0002 single-host** kaynak kısıtı + ATS-0002 *single-codebase/topology-as-config* + over-engineering guard + junior-execution de-risk). Mevcut platform mikroservis ama gözlemlenen maliyeti (per-servis ESO/Vault/NetPol/digest/drift "10-gotcha onboard" + RAM baskısı → Faz 24'te 2. host) erken-bölmenin tam bedeli.

| # | Servis | Stack | Sorumluluk |
|---|---|---|---|
| 1 | **ats-core** | Java 21 + Spring Boot 3 (tek deployable) | tüm domain; OpenAPI sahibi |
| 2 | **ats-ai** | Python 3.13 + FastAPI | Faz 24 motoru (STT/diar/citation) `AIProvider` ardında |

**`ats-core` iç modülleri** (4 contract + domain; modül sınırı = stable boundary, ArchUnit + contract-test zorlar):

| Modül | Contract / ADR | Kapsam (P1 sınırı net) |
|---|---|---|
| `identity-tenant` | ATS-0001 `IdentityTenant` · ATS-0002 | Keycloak entegrasyon + tenant boundary default-deny |
| `consent` | ATS-0003 | disclosure/açık rıza/withdrawal/recording-permission-state |
| `ingest-media` | PRD F1 · ATS-0007 | Teams/Graph + upload ingest; **raw transcript/media store sahibi** + S3-uyumlu object-store interface (impl@G0); malicious-attachment tarama |
| `interview-workspace` | PRD F3-F5 | **P1 minimum**: evidence packet için role/candidate/interview/rubric modeli + evidence + human edit/approve. **candidate-PII store sahibi** (tenant-scoped). ⚠️ P2 "full minimal workspace" DEĞİL (scope-freeze) |
| `evidence-ledger` | ATS-0001 `EvidenceLedger` · ATS-0003 | WORM append-only + hash-chain + tombstone |
| `ai-orchestration` | ATS-0001 `AIProvider` · ATS-0004 | ats-ai pipeline çağrısı (STT→diar→citation) |
| `export-connector` | ATS-0001 `ATSConnector` | PDF/secure-link/email/webhook + narrow write-back (3-koşul) |
| `retention-dsr` | ATS-0003 | **P1 minimum**: retention timer + delete/export **request** workflow + unlinkable tombstone. ⚠️ "Full DSR automation" P3 (scope-freeze) |

> Mikroservis seam: her modül contract sınırlı → land-expand'de gerçek ölçek gelince split ucuz.
> **Veri sahipliği netliği (ATS-0001 ayrı-store):** raw media/transcript = `ingest-media`; candidate-PII = `interview-workspace`; WORM evidence = `evidence-ledger`. Üçü de tenant-scoped (ATS-0002) + per-tenant KMS (ATS-0007).

### D-B — MFE decomposition

| # | MFE | Faz | Kapsam |
|---|---|---|---|
| 1 | **mfe-interview-evidence** | P1 | ingest → transcript segment view → rubric/evidence+citation → human-approve → export |
| 2 | **mfe-compliance-console** | P3 | consent/retention/DSR/audit-export admin |

P1 = **tek MFE** (scope-freeze disiplini). İkincisi P3'e kadar açılmaz.

### D-C — UI bileşen kütüphanesi: **Vendor-snapshot** (owner kararı 2026-06-29)

platform-web `@mfe/design-system` (186 component A-grade) + `x-*` (charts/data-grid/form-builder/scheduler) + `blocks`/`x-editor` curated alt-seti **bir kez `ats/packages/` altına kopyalanır, sonra ATS bağımsız sürdürür**. Gerekçe: yatırım korunur + ADR-0001 boundary temiz (platform iç-paketine runtime coupling YOK) + bakım ATS'e ait. (Alternatifler: yayınla-tüket = publish pipeline + soft coupling; sıfırdan = yavaş — ikisi de reddedildi.)
**P1 MFE START GATE (canonical — vendor-snapshot drift'i kapatır):** P1 MFE dilimi başlamadan önce şunlar yazılı sabitlenir: (1) kaynak repo + **commit SHA** (snapshot noktası dondurulur); (2) kopyalanacak **curated paket/component listesi**; (3) ATS `packages/` altında **namespace + ownership** (`@ats/ui`); (4) **lisans** (AG Grid Enterprise key = build-time GitHub secret deseni, Vault değil); (5) upstream güncelleme = manuel re-snapshot kararı (otomatik akış yok). Bu gate karşılanmadan MFE UI dilimi başlamaz.

### D-D — Object/media store: **G0'a ertelendi** (owner kararı 2026-06-29)

Medya/transcript object store seçimi (MinIO self-host vs cloud S3) **design-partner residency şartı** netleşene kadar (G0) ertelenir. **Interface gün-1 hazır** (S3-uyumlu soyutlama); ATS-0002 tenant-scoped bucket + ATS-0007 per-tenant KMS invariant'ları seçimden bağımsız geçerli. Default eğilim sovereign-dostu (MinIO) ama bağlanmadı.

### D-E — Standart stack-lock (tüm operatörler aynı; drift-guard)

| Alan | Kilit | Kaynak |
|---|---|---|
| Backend | Java 21 + Spring Boot 3 (modular monolith) | platform deseni |
| Migration | Flyway | platform deseni |
| **Contract iki katman (drift-guard)** | (a) **domain/primitive 4 sözleşme = TS canonical** (`contracts/`); (b) **HTTP API contract = Springdoc OpenAPI backend-generated + golden snapshot**. İkisi farklı katman, tek "canonical çatışması" yok. TS↔backend binding: OpenAPI'den generated TS client + MSW; domain primitive'leri için binding-on-demand | ATS-0001 + ADR-0025 D61 deseni |
| AI servis | Python 3.13 + FastAPI | Faz 24 |
| STT/diar/LLM | **default-candidate**: faster-whisper / pyannote / ollama (self-host). **Seçilen provider eval-gate'i geçer** (golden fixture eşikleri); geçmezse pilot-cloud provider interface ardında (ATS-0004 eval-gate-first) | ATS-0004 |
| Citation | extract-then-abstract + entailment (ADR-0043) | ATS-0004 |
| DB | PostgreSQL 16 + pgvector | tek canonical store |
| Object store | S3-uyumlu interface (impl G0'da) | D-D |
| Auth | Keycloak (logical: shared-realm + tenant claim; dedicated SKU: realm-per-tenant) | ATS-0002 |
| Authz | OpenFGA | permission-service deseni |
| Secret/KMS | Vault + per-tenant KMS | ATS-0007 |
| Web | React + TS + Module Federation | — |
| UI lib | vendor-snapshot `@mfe/*` → `ats/packages/` | D-C |
| Contracts (impl durumu) | `contracts/` TS scaffold + 4 sözleşme + contract-test | ATS-0001 ([PR #5](https://github.com/Halildeu/ats/pull/5) — merge-ready, CI-billing-bloklu) |
| Monorepo tooling | pnpm workspaces + turbo (web/contracts) · Gradle (backend) · uv (ai) | öneri |
| Deploy | kustomize + ArgoCD + D30 immutable digest (`ats-gitops`) | platform deseni |
| CI | GitHub Actions (boundary-guard + typecheck + test) | PR #5 (⚠️ Actions billing blocker — owner) |

### D-F — Boundary/drift enforcement (import + data/security invariant)

- **Modül/import sınırı**: `ats-core` modülleri arası = ArchUnit testi + `contracts/` contract-test ([PR #5](https://github.com/Halildeu/ats/pull/5) — merge-ready, CI-billing-bloklu, henüz LANDED değil).
- **Repo-dışı boundary**: `scripts/check-boundary.sh` (PR #5) platform iç-paket import/dependency referansını reddeder (ADR-0001).
- **Data/security invariant (import-seviyesi YETMEZ — pilot-open gate'e bağlı):** tenant-boundary testleri DB/RLS + API + object-key + background-job + log + export + backup (ATS-0002, [pilot-open Gate](../G0/g0-pilot-open-release-checklist.md) P0) + erasure/WORM testi (ATS-0003) + AI threat controls prompt-injection/tenant-leak/model-output-leak (ATS-0007). Bunlar P1 fonksiyonel dilimlerinde (G0 sonrası) zorunlu acceptance.
- **Canon tek ev**: tüm ADR/plan/PRD `ats/docs/` (bu PR) — local-only drift kapandı.

## İlişki haritası (kabaca)

```
Recruiter/Operatör ─▶ mfe-interview-evidence (React MFE, P1)
                         │ OpenAPI (Springdoc golden snapshot)
                         ▼
                     ats-core (Spring Boot modular monolith)
                     [identity-tenant·consent·ingest-media·
                      interview-workspace·evidence-ledger(WORM)·
                      ai-orchestration·export-connector·retention-dsr]
                    ┌────────┬──────────────┬───────────────┐
          AIProvider│        │PG+pgvector   │object store     │ reuse:
                    ▼        ▼              ▼ (impl@G0)        Keycloak·OpenFGA·
                 ats-ai   Postgres      S3-uyumlu             Vault/KMS·Notify-Graph
              (Faz24 motor)              (MinIO eğilim)
```

## Sonuçlar

**Olumlu:** tek mimari çerçeve → operatör hizası + drift-guard; junior-uygun (2 deployable, tek MFE); ADR-0002/0001/over-engineering guard ile hizalı; land-expand'de split ucuz; canon tek kanonik evde.
**Olumsuz:** modular monolith fault-isolation tek-process (modül-içi izolasyon ile hafifletilir); vendor-snapshot bakımı ATS'e geçer (platform UX güncellemeleri otomatik gelmez).

## Açık follow-up'lar (gate-safe olmayan / sonraki kararlar)
- Object store impl seçimi → **G0**.
- UI vendor-snapshot curated liste + lisans kaynağı → **P1 MFE başlangıcı (G0=GO sonrası)**.
- Keycloak tenancy detay (shared-realm claim mapping) → ats-core identity-tenant dilimi.
- Monorepo tooling (pnpm+turbo) somut kurulum → ilk web/backend dilimi.

## Bağlantı
- [[ATS-0001]] boundary/4-contract · [[ATS-0002]] tenant/topology · [[ATS-0003]] KVKK/WORM · [[ATS-0004]] AI pipeline · [[ATS-0005]] governance · [[ATS-0006]] sovereign · [[ATS-0007]] security · [PRD-P1](../PRD-P1-interview-evidence-mvp.md) · `contracts/` ([PR #5](https://github.com/Halildeu/ats/pull/5) — merge-ready, CI-billing-bloklu).
