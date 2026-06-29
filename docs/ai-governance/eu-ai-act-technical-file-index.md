# EU AI Act Technical-File / Risk-Management Index (readiness)

> **Public · living document.** [[ATS-0005]] (AI-governance + EU AI Act) kararını **madde→artefakt izlenebilirliği** olan bir teknik-dosya **hazırlık (readiness)** indeksine döker. **Bu bir uygunluk/conformity BEYANI DEĞİL** — Annex III (işe alım = yüksek-riskli) için hangi gereksinimin hangi artefakta bağlandığını ve **residual (eksik)**'i izler.
> **Drift guard:** `scripts/check-eu-ai-act-index.mjs` (CI job `eu-ai-act-guard`).
> Kapsam: ürün **provider** rolünde; **deployer** (kullanan kurum) yükümlülükleri (Art.26) müşteriye aittir. Yürürlük kademeli (yüksek-riskli ~2027); bu indeks erken hazırlık.
> Çapraz-bağ: [[ATS-0004]] citation/eval · [[ATS-0005]] assist-vs-conduct/bias · [[ATS-0003]] kayıt/erasure · [docs/security/threat-register.md](../security/threat-register.md) · [docs/observability/event-taxonomy.md](../observability/event-taxonomy.md) · [docs/privacy/data-lifecycle-register.md](../privacy/data-lifecycle-register.md).

## 0. Statü sözlüğü (No Fake Work — overclaim YASAK)

| Statü | Anlam |
|---|---|
| `design` | Tasarım/ADR kararı var, artefakta bağlı (kod öncesi). |
| `gate-locked` | Kontrol tasarımı kabul; runtime kanıtı P1/G0 sonrası. |
| `p1-evidence-required` | Madde, P1 fonksiyonel kanıt (eval/log/test) gerektirir — henüz YOK. |
| `owner-evidence-required` | Madde, owner/operatör kanıtı (DPIA imza, post-market süreç) gerektirir. |

> **YASAK kelimeler** (PRE-G0, guard reddeder): `compliant` · `certified` · `conformity achieved` · `fully meets` · `guaranteed` · `uygundur` (uygunluk beyanı). Bu indeks readiness'tir, uygunluk değil.

## 1. Madde → artefakt → residual matrisi

| Madde | Gereksinim | Mapped artefakt | Statü | Residual |
|---|---|---|---|---|
| **Art.9** | Risk management system (yaşam-döngüsü) | [docs/security/threat-register.md](../security/threat-register.md) + [[ATS-0005]] | design | sürekli risk-review süreci owner |
| **Art.10** | Data & data governance (kalite, bias, governance) | [docs/privacy/data-lifecycle-register.md](../privacy/data-lifecycle-register.md) + [[ATS-0003]] + [[ATS-0005]] | design | bias-audit veri-seti + golden fixture owner/P1 |
| **Art.11** | Technical documentation (Annex IV) | bu indeks + [docs/README.md](../README.md) ADR seti | design | tam teknik dosya derlemesi (P1 artefaktlarıyla) |
| **Art.12** | Record-keeping / otomatik loglama | [docs/observability/event-taxonomy.md](../observability/event-taxonomy.md) ([[ATS-0010]]) | gate-locked | runtime event emisyonu P1 |
| **Art.13** | Transparency & deployer'a bilgi | [[ATS-0005]] + [[ATS-0004]] (citation görünürlüğü) | gate-locked | kullanım talimatı + model-card P1 |
| **Art.14** | Human oversight | [[ATS-0005]] (assist-vs-conduct; otomatik karar YOK) + [[ATS-0004]] human-approval | gate-locked | human-oversight state-machine standardı (round-2 #3) + P1 |
| **Art.15** | Accuracy, robustness, cybersecurity | [docs/security/threat-register.md](../security/threat-register.md) + [[ATS-0007]] + [docs/adr/ATS-0004-mulakat-ai-citation-eval-human-approval.md](../adr/ATS-0004-mulakat-ai-citation-eval-human-approval.md) (eval-gate) | p1-evidence-required | WER/DER/citation baseline gerçek fixture (owner/P1) |
| **Art.50** | Transparency (AI etkileşim/üretim açıklaması) | [[ATS-0005]] + [[ATS-0003]] (rıza/aydınlatma) | design | UI disclosure metni P1 |
| **Art.72** | Post-market monitoring (provider) | [docs/observability/event-taxonomy.md](../observability/event-taxonomy.md) + incident-runbook (PRIVATE ats-strategy) | owner-evidence-required | post-market izleme planı + incident süreci owner |
| **Art.26** | Deployer yükümlülükleri (müşteri) | [[ATS-0005]] (rol ayrımı) + deployer-guidance (PRIVATE) | owner-evidence-required | müşteri-facing deployer kılavuzu owner |

## 2. Doğrulama (drift-guard `scripts/check-eu-ai-act-index.mjs`)

- Required AB AI Act maddeleri (Art.9/10/11/12/13/14/15/50/72/26) hepsi mevcut + tekil.
- Statü sözlük-geçerli; **YASAK overclaim kelimeleri** indekste görünemez (uygunluk beyanı PRE-G0 yasak).
- Her satırın `Mapped artefakt` hücresi en az bir **mevcut public repo path** VEYA `[[ATS-XXXX]]` (docs/adr'de var) VEYA `PRIVATE` marker içerir (boş/ölü-link reddedilir → readiness iddiası kanıta bağlı).

## 3. Bağlantı
- [[ATS-0005]] (karar) · [[ATS-0004]] · [[ATS-0003]] · threat-register · event-taxonomy · data-lifecycle-register · PRIVATE: eu-ai-act-readiness-checklist + incident-runbook (`ats-strategy/docs/procurement`).
