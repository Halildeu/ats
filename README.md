# ats

**Faz 25 — Audit-ready Interview Evidence Packet** (citation-backed interview-evidence + hiring-audit add-on).

Regüle/mahremiyet-duyarlı kurumlar için, **mevcut ATS'in üstünde** çalışan, Türkçe/on-prem opsiyonlu, kaynak-alıntılı, insan-onaylı, denetlenebilir mülakat **kanıt dosyası** add-on'u. Full ATS DEĞİL (land-and-expand, gated). Bağımsız multi-tenant SaaS.

> Mimari/güven ADR'leri: [docs/adr/](./docs/adr/) (ATS-0001..0005, 0007 public). **Strateji/GTM/G0/rekabet/procurement + iç-mühendislik ADR'leri (0006/0008/0009): private `Halildeu/ats-strategy`** (CONFIDENTIAL).

## ⛔ Gate disiplini ([ATS-0016](./docs/adr/ATS-0016-p1-build-unlock-g0-release-gate.md) — 2026-07-02 owner kararıyla güncellendi)

**P1 fonksiyonel BUILD SERBEST** (owner kararı 2026-07-02; PRD-P1 frozen scope F1-F10, haftalık ince slice, her slice cross-AI review + CI). **G0 artık RELEASE gate'idir** (fail-closed):

- ✅ Build (şimdi): P1 sıralı teslim hattı (ingest → STT → segment-view → rubric/citation → human-approve+audit → consent floor → export; diarization AYRI bileşen — canlı motor v0.1.0 sunmaz, bkz. ATS-0017 amendment) + mevcut gate-safe registry/guard seti (24 CI guard) korunarak.
- 🔒 Release-locked (G0=GO + pilot-open Gate A-F olmadan YASAK): gerçek-tenant/pilot açılışı · satış/GTM · **gerçek aday verisiyle işleme** (build'de yalnız sentetik/açık-rızalı test fixture) · "eval eşikleri kalibre edildi" ilanı (golden fixture + partner gerekir; placeholder eşikler `uncalibrated`) · partner-spesifik acceptance.
- 🔒 Compliance-locked (tenant-onboarding önkoşulu): fiili açık-rıza toplama + imzalı DPIA + VERBIS ([ATS-0014](./docs/adr/ATS-0014-voice-enrollment-optin-internal-only.md)).
- Scope-freeze aynen: full-ATS/scoring/affect/auto-reject vb. PRD YASAK listesi (genişletme = ayrı ADR).

## Monorepo haritası

| Dizin | Amaç | Durum |
|---|---|---|
| `contracts/` | ATS-0001 stable-interface sözleşmeleri + gate-safe P4 Integration Platform wire contract + contract-test | 🟢 versioned contracts |
| `backend/` | Spring/Java domain servisleri (P1 build aktif — ATS-0016; slice-1: consent-gated ingest) | 🟢 build |
| `web/` | React MFE — gate-safe foundation (token/i18n/typed-contract; runtime gate-locked) | 🟡 foundation |
| `ai/` | Python — Faz 24 motor entegrasyonu (provider, kopya değil) | 🔒 placeholder |
| `desktop/` | Electron | 🔒 placeholder |
| `mobile/` | React Native | 🔒 placeholder |
| `packages/shared/` | paylaşılan yardımcılar | 🔒 placeholder |

## ATS-0001 boundary

Platform iç paketlerine **kod bağımlılığı YASAK**; reuse yalnız yayınlanmış interface/imaj üzerinden (`scripts/check-boundary.sh` CI'da zorlar). 4 MVP sözleşmesi: `IdentityTenant`, `EvidenceLedger` (WORM append-only), `AIProvider` (Faz 24), `ATSConnector` (export + narrow write-back).

P4 land-and-expand kontratı bu dört interface'i büyütmez: [`integration-platform/v1`](./docs/integrations/integration-platform-v1.md) ayrı versioned wire registry/envelope katmanıdır; gerçek connector aktivasyonu G0/P3/partner sandbox acceptance olmadan kapalıdır.

P5 sovereign packaging kontratı [`deployment-profile/v1`](./docs/integrations/deployment-profile-v1.md) ile managed/dedicated/BYO-region/on-prem kabul zincirlerini ayırır; gerçek cluster, partner veya release kanıtı olmadan tüm profiller fail-closed kalır.

P6 governed-intelligence kontratı [`intelligence-evaluation/v1`](./docs/ai-governance/intelligence-evaluation-v1.md) ile QoH/fairness/coaching/skills/deepfake/internal-mobility/agentic proposal metric ve action gate'lerini ayırır; scoring/ranking/affect/otonom karar kalıcı olarak yasaktır.

## Geliştirme (contracts)

```bash
cd contracts
npm install
npm run typecheck     # tsc --noEmit
npm test              # vitest contract tests (+ surface drift guard)
npm run surface:gen   # TS yüzeyi değişince contract-surface.json + .tokens.txt yeniden üret
bash ../scripts/check-boundary.sh
```

**Contract shape parity (machine-enforced):** TS↔Java tip/DTO/enum drift'i artık testle yakalanır (`contracts/PARITY.md`): `tools/extract-surface.ts` TS kaynağından token-projeksiyonu üretir; `surface-parity.contract.test.ts` (TS) + `SurfaceParityTest.java` (Java reflection) aynı `contract-surface.tokens.txt`'e karşı doğrular.
