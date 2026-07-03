# ATS-0019 — Ürün yüzeyi platform-web'e MFE olarak entegre + platform design-system/auth reuse

- **Durum:** **Accepted** — owner kararı 2026-07-03 (AskUserQuestion ile netleşti: "design lab'dan türeterek UI + platform-web'e MFE entegre + ai.acik.com canlı / testai.acik.com test"). Cross-AI: Codex thread `019f2625` plan-time REVISE→AGREE (strateji AGREE; ilk-dilim tanımı sertleştirildi).
- **Tarih:** 2026-07-03
- **Bağlam kaynağı:** [[ATS-0008]] (bağımsız-ürün 3-repo mimarisi — bu ADR onu **kısmen supersede eder**: frontend artık platform-web) · [[ATS-0001]] (ürün boundary primitives) · [[ATS-0016]] (P1 build unlock / G0 release-gate — **korunur**) · platform-web Module Federation mimarisi (9 mevcut MFE).

## Karar

ATS Interview-Evidence **ürün yüzeyi (frontend)**, platform-web monorepo'suna **yeni bir Module Federation MFE** (`apps/mfe-interview-evidence`) olarak taşınır ve platform'un paylaşımlı altyapısını reuse eder. **Backend (ATS `app-boot`, hexagonal, WORM+PG) AYRI kalır** — bu fazda platform-backend'e taşınmaz ("web/backend/mobil ayrı yerler", owner).

### Frontend (platform-web MFE)

- **Konum:** `platform-web/apps/mfe-interview-evidence` (mevcut 9 MFE'nin yanına; `@module-federation/vite`, port 3010, `./App` + `./shell-services` expose).
- **Design-system:** `@mfe/design-system` reuse (MF singleton; primitives/components/theme/tokens). ATS'in eski dar `@ats/ui` snapshot'ı ([[mfe-start-gate]]) **deprecated** — bileşenler design-system primitives ile yeniden örülür.
- **i18n:** `@mfe/i18n-dicts` merkezi (MFE kendi dict tutmaz); tr-TR default.
- **Auth:** `@mfe/auth` (shell-managed Keycloak). ATS'in kendi OIDC akışı (`web/mfe-interview-evidence/src/oidc.ts` IdP-nötr PKCE) **platform MFE'ye TAŞINMAZ** — MFE token üretmez, shell-services üzerinden platform token'ını tüketir.
- **Route/registration:** shell `vite.config.ts` remote + `lazy-routes.ts` conditional export + `AppRouter` route + `ProtectedRoute` + module key `INTERVIEW_EVIDENCE`.

### Auth contract (platform-KC ↔ ATS backend)

Backend authorization'ın **kaynağı ATS backend JWT validator + ATS scope'ları kalır** (Zanzibar/`@mfe/auth` yalnız UI route-visibility; **yetki değildir**). Platform Keycloak, ATS backend'in beklediği claim/scope kontratını sağlar:

- **Issuer:** prod `https://ai.acik.com/realms/serban` · test `https://testai.acik.com/realms/platform-test`.
- **Audience:** ATS backend için ayrı **`ats-api`** audience (Keycloak audience mapper). `frontend` audience'ını backend için kabul etmek YASAK (audience gevşetme yok).
- **Tenant:** `tenant` claim (backend `tenant-claim-name` config'lenebilir); tenant asla body/path/header'dan alınmaz — yalnız token.
- **Scope (10):** `ats.consent.write`, `ats.recording.write`, `ats.transcription.write`, `ats.transcript.read`, `ats.citation.write`, `ats.review.write`, `ats.review.read`, `ats.export.write`, `ats.dsar.write`, `ats.erasure.execute`.

### API namespace

MFE → ATS backend çağrıları **`/api/ats/v1/*` → ATS backend `/api/v1/*`** (edge/dev proxy). Raw `/api/v1` KULLANILMAZ — platform gateway (`/api/v1/authz/me` vb.) ile çakışır. `VITE_ATS_API_BASE=/api/ats`. Tarayıcı doğrudan ATS backend hostuna gitmez (same-origin proxy → CORS/CSRF yüzeyi daralır; Bearer API stateless).

### Deploy

`ci-web-image-push.yml` dual-build matrix'ine eklenir (prod: ai.acik.com/serban; testai: testai.acik.com/platform-test) → GHCR digest → platform-k8s-gitops dispatch → kustomize overlay digest-pin → ArgoCD. **ATS-0016 sınırı korunur:** UI'ın **sentetik/demo** veriyle canlı olması serbest (release-yüzeyi); **gerçek aday verisiyle işleme G0=GO** gerektirir. testai'de route açık; prod'da feature-flag/route-visibility ile kontrol; auth-stub canlı route'a GİRMEZ (yalnız unit/dev-story).

## Değerlendirilen alternatifler

- **Standalone kal (ats/web/mfe-interview-evidence, ayrı deploy)** — RED (owner): tekil marka/tutarlılık kaybı, platform auth/design tekrarı, ai.acik.com entegrasyonu zor.
- **Backend'i de platform-backend'e taşı (tam entegrasyon)** — DEFER: bu faz frontend-first; backend migrasyonu ayrı ADR (hexagonal domain + WORM taşıma riski). Owner "ayrı yerler" ilkesiyle uyumlu.
- **Auth: shell-token→ATS-scope köprü servisi** — RED (Codex): token-exchange/impersonation/audit/replay/cache fazla hareketli parça; ilk faz için pahalı.
- **Auth: MFE ATS'in kendi dev-IdP token'ıyla backend'e** — RED: çift login, iki auth session, canlı Keycloak gerçekliğinden kopar; yalnız deprecated dev-fallback.

## Migrasyon + supersede

- `ats/web/mfe-interview-evidence` → platform-web MFE'ye taşınır; ATS repo'daki standalone frontend **deprecated (audit-only)** olur.
- **Backend + domain + ADR ATS repo'da kalır.**
- [[ATS-0001]] "platform repo'larına kod bağımlılığı YOK" kuralı **backend/domain/contracts düzlemi için KORUNUR**; frontend ürün yüzeyi bu ADR ile bilinçli **platform-web MFE istisnası** olarak amend edilir (ATS-0001'e amendment banner eklendi).
- [[ATS-0008]] "frontend bağımsız Vite" yönü bu ADR ile **superseded**; "backend/domain bağımsız" kısmı **korunur**.
- [[mfe-start-gate]] (eski `@ats/ui` snapshot + START GATE) **deprecated** — MFE design-system reuse'a devreder.
- platform-web tarafında kısa entegrasyon README/RFC + shell registration + route/permission-key contract (bu ADR'ye link).

## Riskler (Codex plan-review)

- **API contract drift** (iki repo): ilk MFE dilimine ATS OpenAPI snapshot pin / generated-client drift-guard eklenir.
- **Tenant claim:** platform token'ında tenant yoksa Keycloak protocol-mapper veya backend configurable claim-name ŞART.
- **Audience gevşetme YASAK** (aud-yok/frontend-aud kabul etme).
- **Legacy OIDC** (`oidc.ts`) platform MFE'ye taşınmaz.
- **Permission naming:** route module `INTERVIEW_EVIDENCE` (UI visibility) ≠ backend `ats.*` scope (authority) — ayrı dokümante.
- **Public repo secret boundary:** canlı realm URL'leri public-safe; client-secret / service-account / token örneği / gerçek aday payload'ı YOK.

## Gate disiplini

Bu ADR bir **mimari yön + auth/deploy contract** kaydıdır. İlk anlamlı dilim (Codex): MFE shell mount + design-system Segment View + shell-auth token consumption + `/api/ats` proxy + **ATS backend platform-KC JWT acceptance testleri** (iss/aud/tenant/scope fixture). Kalite/pilot iddiası yok (ATS-0016 G0 sürer).

## Bağlantı

[[ATS-0008]] (supersede: frontend) · [[ATS-0001]] · [[ATS-0016]] (G0/synthetic korunur) · [[mfe-start-gate]] (deprecated) · platform-web Module Federation + `@mfe/design-system` + `@mfe/auth` + `ci-web-image-push.yml`.
