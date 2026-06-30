# ats

**Faz 25 — Audit-ready Interview Evidence Packet** (citation-backed interview-evidence + hiring-audit add-on).

Regüle/mahremiyet-duyarlı kurumlar için, **mevcut ATS'in üstünde** çalışan, Türkçe/on-prem opsiyonlu, kaynak-alıntılı, insan-onaylı, denetlenebilir mülakat **kanıt dosyası** add-on'u. Full ATS DEĞİL (land-and-expand, gated). Bağımsız multi-tenant SaaS.

> Mimari/güven ADR'leri: [docs/adr/](./docs/adr/) (ATS-0001..0005, 0007 public). **Strateji/GTM/G0/rekabet/procurement + iç-mühendislik ADR'leri (0006/0008/0009): private `Halildeu/ats-strategy`** (CONFIDENTIAL).

## ⛔ Gate disiplini (kritik)

**P1 ürün fonksiyonel build'i (STT/citation/UI/export) G0=GO'dan ÖNCE YAPILMAZ** (ticari validasyon: ≥3 LOI + ≥2 DPO + ATS-teyit). Şu an yalnız **gate-safe** iş yapılır:

- ✅ Gate-safe (şimdi): monorepo iskeleti + ATS-0001 4 contract + contract-test + CI boundary-guard + gate-safe registry/guard seti + **`web/` ürün-yüzeyi temeli** (design-token kontrast-hesaplı + tr-TR i18n catalog + typed component contracts; machine-enforced `web-foundation-guard`; runtime/JSX YOK).
- 🔒 Gate-locked (G0=GO sonrası): P1 fonksiyonel (ingest → STT → diarization → citation → human-approve → audit → export).

## Monorepo haritası

| Dizin | Amaç | Durum |
|---|---|---|
| `contracts/` | ATS-0001 stable-interface sözleşmeleri (TS kanonik) + reference stub + contract-test | ✅ scaffold |
| `backend/` | Spring/Java domain servisleri | 🔒 placeholder (gate-locked) |
| `web/` | React MFE — gate-safe foundation (token/i18n/typed-contract; runtime gate-locked) | 🟡 foundation |
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
npm run typecheck     # tsc --noEmit
npm test              # vitest contract tests (+ surface drift guard)
npm run surface:gen   # TS yüzeyi değişince contract-surface.json + .tokens.txt yeniden üret
bash ../scripts/check-boundary.sh
```

**Contract shape parity (machine-enforced):** TS↔Java tip/DTO/enum drift'i artık testle yakalanır (`contracts/PARITY.md`): `tools/extract-surface.ts` TS kaynağından token-projeksiyonu üretir; `surface-parity.contract.test.ts` (TS) + `SurfaceParityTest.java` (Java reflection) aynı `contract-surface.tokens.txt`'e karşı doğrular.

