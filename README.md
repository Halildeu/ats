# ats

**Faz 25 — Audit-ready Interview Evidence Packet** (citation-backed interview-evidence + hiring-audit add-on).

Regüle/mahremiyet-duyarlı kurumlar için, **mevcut ATS'in üstünde** çalışan, Türkçe/on-prem opsiyonlu, kaynak-alıntılı, insan-onaylı, denetlenebilir mülakat **kanıt dosyası** add-on'u. Full ATS DEĞİL (land-and-expand, gated). Bağımsız multi-tenant SaaS.

> Mimari/güven ADR'leri: [docs/adr/](./docs/adr/) (ATS-0001..0005, 0007 public). **Strateji/GTM/G0/rekabet/procurement + iç-mühendislik ADR'leri (0006/0008/0009): private `Halildeu/ats-strategy`** (CONFIDENTIAL).

## ⛔ Gate disiplini (kritik)

**Fonksiyonel mülakat davranışı (ingest → STT → diarization → LLM → citation/entailment runtime → export/render → gerçek backend/PII/WORM/connector write-back) G0=GO'dan ÖNCE YAPILMAZ** (ticari validasyon: ≥3 LOI + ≥2 DPO + ATS-teyit; gerçek-veri/rıza/owner-threshold gerektirir). Owner direktifi (2026-06-29) ile **gate-safe ürün-yüzeyi temeli** açıldı: `web/` foundation (design-system + tr-TR i18n + typed component contracts + a11y harness) — **synthetic-only**, runtime pipeline yok.

- ✅ Gate-safe (şimdi): monorepo + ATS-0001 contracts + gate-safe registry/guard seti (17 CI guard) + **ürün-yüzeyi temeli** (`web/` foundation; standartların kod karşılığı, synthetic fixture, CI-enforced a11y/i18n/boundary).
- 🔒 Gate-locked (G0=GO sonrası): **fonksiyonel** pipeline (gerçek ingest/STT/diarization/citation-runtime/human-approve-persistence/audit-WORM/export/connector write-back) + scoring/ranking (ATS-0005; affect/auto-reject kalıcı RED) + gerçek-veri/G0 market kanıtı.

> **No-Fake-Work çizgisi:** `web/` foundation = doğrulanabilir scaffold + standard enforcement; "ürün UI tamamlandı / pilot-ready / citation çalışıyor / a11y compliant" İDDİA EDİLMEZ. Stories/fixtures `synthetic`.

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
npm run typecheck     # tsc --noEmit
npm test              # vitest contract tests (+ surface drift guard)
npm run surface:gen   # TS yüzeyi değişince contract-surface.json + .tokens.txt yeniden üret
bash ../scripts/check-boundary.sh
```

**Contract shape parity (machine-enforced):** TS↔Java tip/DTO/enum drift'i artık testle yakalanır (`contracts/PARITY.md`): `tools/extract-surface.ts` TS kaynağından token-projeksiyonu üretir; `surface-parity.contract.test.ts` (TS) + `SurfaceParityTest.java` (Java reflection) aynı `contract-surface.tokens.txt`'e karşı doğrular.

