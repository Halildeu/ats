# ats

**Faz 25 — Audit-ready Interview Evidence Packet** (citation-backed interview-evidence + hiring-audit add-on).

Regüle/mahremiyet-duyarlı kurumlar için, **mevcut ATS'in üstünde** çalışan, Türkçe/on-prem opsiyonlu, kaynak-alıntılı, insan-onaylı, denetlenebilir mülakat **kanıt dosyası** add-on'u. Full ATS DEĞİL (land-and-expand, gated). Bağımsız multi-tenant SaaS.

> Kanonik plan: `ats-planlama/00-ATS-MASTER-PLAN.md` (v3.x, 3-AI mutabakat). ADR seti: `ats-planlama/adr/ATS-0001..0007`.

## ⛔ Gate disiplini (kritik)

**P1 ürün fonksiyonel build'i (STT/citation/UI/export) G0=GO'dan ÖNCE YAPILMAZ** (ticari validasyon: ≥3 LOI + ≥2 DPO + ATS-teyit). Şu an yalnız **gate-safe** iş yapılır:

- ✅ Gate-safe (şimdi): monorepo iskeleti + ATS-0001 4 contract + contract-test + CI boundary-guard.
- 🔒 Gate-locked (G0=GO sonrası): P1 fonksiyonel (ingest → STT → diarization → citation → human-approve → audit → export).

## Monorepo haritası

| Dizin | Amaç | Durum |
|---|---|---|
| `contracts/` | ATS-0001 stable-interface sözleşmeleri (TS kanonik) + reference stub + contract-test | ✅ scaffold |
| `backend/` | Spring/Java domain servisleri | 🔒 placeholder (gate-locked) |
| `web/` | React MFE | 🔒 placeholder |
| `ai/` | Python — Faz 24 motor entegrasyonu (provider, kopya değil) | 🔒 placeholder |
| `desktop/` | Electron | 🔒 placeholder |
| `mobile/` | React Native | 🔒 placeholder |
| `packages/shared/` | paylaşılan yardımcılar | 🔒 placeholder |

## ATS-0001 boundary

Platform iç paketlerine **kod bağımlılığı YASAK**; reuse yalnız yayınlanmış interface/imaj üzerinden (`scripts/check-boundary.sh` CI'da zorlar). 4 MVP sözleşmesi: `IdentityTenant`, `EvidenceLedger` (WORM append-only), `AIProvider` (Faz 24), `ATSConnector` (export + narrow write-back).

## Geliştirme (contracts)

```bash
cd contracts
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest contract tests
bash ../scripts/check-boundary.sh
```

