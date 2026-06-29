# ats/docs — Faz 25 ATS (PUBLIC: kod + mimari/güven)

> Bu repo **public**: kod + **mimari/güven ADR'leri** + sanitized README ile sınırlıdır.
> **Strateji · GTM · G0 · rekabet · procurement · prospect içeriği → PRIVATE `Halildeu/ats-strategy`** repo'sunda (CONFIDENTIAL; Codex 019f12e2 P0 + owner kararı 2026-06-29).

## Mimari & güven ADR'leri (buyer trust surface)
| ADR | Konu | Durum |
|---|---|---|
| [ATS-0001](./adr/ATS-0001-urun-boundary-primitives-via-interfaces.md) | ürün boundary + primitives-via-interfaces | Accepted |
| [ATS-0002](./adr/ATS-0002-multi-tenant-izolasyon-deployment-topolojisi.md) | multi-tenant izolasyon + topology | Accepted |
| [ATS-0003](./adr/ATS-0003-kvkk-recording-consent-worm-vs-deletion.md) | KVKK/recording-consent + WORM≠deletion | Accepted |
| [ATS-0004](./adr/ATS-0004-mulakat-ai-citation-eval-human-approval.md) | mülakat-AI (citation + eval + human-approval) | Accepted |
| [ATS-0005](./adr/ATS-0005-ai-governance-assist-vs-conduct-bias-audit.md) | AI-governance (assist-vs-conduct + EU AI Act) | Accepted |
| [ATS-0007](./adr/ATS-0007-security-key-management-threat-model.md) | security & key-management threat model | Accepted |
| [ATS-0010](./adr/ATS-0010-audit-observability-event-taxonomy.md) | audit & observability event taxonomy | Accepted |
| [ATS-0011](./adr/ATS-0011-accessibility-i18n-standard.md) | accessibility (WCAG 2.2 AA) + i18n (Türkçe-first) | Accepted |

> **Private ADR'ler** (iç-mühendislik/ticari → `ats-strategy`): ATS-0006 (sovereign SKU/pricing), ATS-0008 (servis/MFE decomposition + stack-lock), ATS-0009 (CI runner). On-prem **kabiliyet** trust sinyali ATS-0002'de (topology).

## Güvenlik (public, living)
- [security/threat-register.md](./security/threat-register.md) — STRIDE + LINDDUN → kontrol → test matrisi (ATS-0007 register'ı; bugün enforced guard'lar + gate-locked kontroller).

## Gözlemlenebilirlik (public, living)
- [observability/event-taxonomy.md](./observability/event-taxonomy.md) — ATS-0010 kanonik operasyonel event registry'si (zarf + PII-redaction invariantı; drift-guard `event-taxonomy-guard`). İş-kanıtı WORM ledger'dan ayrı düzlem.

## Mahremiyet / veri-yaşam-döngüsü (public, living)
- [privacy/data-lifecycle-register.md](./privacy/data-lifecycle-register.md) — ATS-0003 operationalized: veri-sınıfı × retention/erasure/transfer kanonik matrisi (drift-guard `data-lifecycle-guard`). WORM-içerik-yasağı + crypto-erase/unlinkable invariantları makine-zorlanır (DPO/procurement yüzeyi).

## Frontend standardı (public, living)
- [frontend/a11y-i18n-standard.md](./frontend/a11y-i18n-standard.md) — ATS-0011 WCAG 2.2 AA + Türkçe-first i18n kanonik kriter registry'si (drift-guard `a11y-standard-guard`). Enforcement (axe/eslint/i18n-extract) P1 UI ile aktif.

## Implementation (public, CI-yeşil)
- `../contracts/` — ATS-0001 4 TS sözleşme + parity (PARITY.md)
- `../backend/` — ats-core skeleton (shared-kernel + contracts-java + ArchUnit)
- `../ai/eval-harness/` — ATS-0004 Gate C ölçüm rig'i
- `../.github/workflows/` — ci (boundary+contracts+backend) + security (gitleaks+dependency-review)

## Strateji/G0/rekabet/procurement (PRIVATE)
`Halildeu/ats-strategy` (private) — master-plan · PRD · rekabet analizi · G0 kit (turnkey/ICP/LOI/scope-freeze/sector-pack) · procurement template pack · battle-card · golden-fixture collection pack.
> Not: ADR'lerdeki bazı `Bağlam kaynağı` linkleri bu taşınan dosyalara işaret eder (artık private). ADR'lerin mimari içeriği public kalır; strateji referansları private repodadır.
