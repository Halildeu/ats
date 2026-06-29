# ats/docs — Faz 25 ATS kanonik bilgi evi

> Tek kanonik ev. (Önceki lokal-only `~/Documents/ats-planlama/` taşındı — paylaşılır + versiyonlu, drift kapandı.)

## Plan & strateji
- [00-ATS-MASTER-PLAN.md](./00-ATS-MASTER-PLAN.md) — v3.x canonical plan (3-AI mutabakat, roadmap G0-P6)
- [PRD-P1-interview-evidence-mvp.md](./PRD-P1-interview-evidence-mvp.md) — P1 PRD (F1-F10)
- [01-rekabet-analizi](./01-rekabet-analizi-ve-ozellik-stratejisi-2026.md) · [02-faz-roadmap](./02-faz-roadmap-rakip-benchmarkli.md) · [03-ilave-farklar](./03-rakip-guclu-yonler-ve-ilave-farklar.md)

## ADR seti
| ADR | Konu | Durum |
|---|---|---|
| [ATS-0001](./adr/ATS-0001-urun-boundary-primitives-via-interfaces.md) | ürün boundary + primitives-via-interfaces | Accepted |
| [ATS-0002](./adr/ATS-0002-multi-tenant-izolasyon-deployment-topolojisi.md) | multi-tenant izolasyon + topology | Accepted |
| [ATS-0003](./adr/ATS-0003-kvkk-recording-consent-worm-vs-deletion.md) | KVKK/recording-consent + WORM≠deletion | Accepted |
| [ATS-0004](./adr/ATS-0004-mulakat-ai-citation-eval-human-approval.md) | mülakat-AI (citation + eval + human-approval) | Accepted |
| [ATS-0005](./adr/ATS-0005-ai-governance-assist-vs-conduct-bias-audit.md) | AI-governance (assist-vs-conduct + EU AI Act) | Accepted |
| [ATS-0006](./adr/ATS-0006-sovereign-on-prem-sku-gated.md) | sovereign/on-prem SKU (gated) | Accepted |
| [ATS-0007](./adr/ATS-0007-security-key-management-threat-model.md) | security & key-management threat model | Accepted |
| [ATS-0008](./adr/ATS-0008-system-architecture-frame.md) | system architecture frame (servis/MFE + stack-lock) | Accepted |
| [ATS-0009](./adr/ATS-0009-ci-runner-architecture.md) | CI runner architecture (public → GitHub-hosted) | Accepted |

## G0 (design-partner gate kit + turnkey)
[G0/](./G0/) — gate · ICP · LOI · scope-freeze · execution-system · pilot-open-checklist · one-pager · outreach
- **[g0-turnkey-decision-pack.md](./G0/g0-turnkey-decision-pack.md)** — M6 7-kriter kanıt matrisi + ICP scoring + DPO/IT-ATS script + GO/NO-GO (owner çalıştırır)
- [prospect-tracker.csv](./G0/prospect-tracker.csv) — design-partner pipeline

## Eval (ATS-0004 Gate C)
- [eval/golden-fixture-collection-pack.md](./eval/golden-fixture-collection-pack.md) — consent/protocol/redaction/manifest/annotation/rubric (G0 kriter 6 enabler)
- rig: `../ai/eval-harness/`

## Procurement / DPO due-diligence (A-lite — TASLAK)
[procurement/](./procurement/) — DPA · DPIA · data-processing-record · security-posture-whitepaper · incident-response-runbook · ai-transparency · eu-ai-act-readiness-checklist (hepsi template + disclaimer; owner/legal doldurur)

## Competitive
- [competitive/battle-card.md](./competitive/battle-card.md) — rakip haritası + DPO/LOI itiraz→cevap

## Implementation (main'de, CI-yeşil)
- `../contracts/` — ATS-0001 4 TS sözleşme + parity (PARITY.md)
- `../backend/` — ats-core skeleton (shared-kernel + contracts-java + ArchUnit)
- `../ai/eval-harness/` — Gate C rig
- `../.github/workflows/` — ci (boundary+contracts+backend) + security (gitleaks+dependency-review)
