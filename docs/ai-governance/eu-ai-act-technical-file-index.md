# EU AI Act Technical-File / Risk-Management Index (readiness)

> **Public · living document.** [[ATS-0005]] (AI-governance + EU AI Act) kararını **madde→artefakt izlenebilirliği** olan bir teknik-dosya **hazırlık (readiness)** indeksine döker. **Bu bir uygunluk/conformity BEYANI DEĞİL** — Annex III (işe alım = yüksek-riskli) için hangi gereksinimin hangi artefakta bağlandığını ve **residual (eksik)**'i izler.
> **Drift guard:** `scripts/check-eu-ai-act-index.mjs` (CI job `eu-ai-act-guard`).
> **Rol & yürürlük:** ürün **provider**; **deployer** (kullanan kurum) Art.26 yükümlülükleri müşteriye aittir (ama provider Art.13 kullanım-talimatı sağlamalı). Annex III işe-alım/seçim yüksek-riskli kabul edilir → genel yükümlülükler **~2026 (24 ay)** riski varsayılır; 2027 daha çok Annex I product-safety hattıdır. Bu indeks erken hazırlık.
> Çapraz-bağ: [[ATS-0004]] citation/eval · [[ATS-0005]] assist-vs-conduct/bias · [[ATS-0003]] kayıt/erasure · [docs/security/threat-register.md](../security/threat-register.md) · [docs/observability/event-taxonomy.md](../observability/event-taxonomy.md) · [docs/privacy/data-lifecycle-register.md](../privacy/data-lifecycle-register.md).

## 0. Statü sözlüğü (No Fake Work — overclaim YASAK)

| Statü | Anlam |
|---|---|
| `design` | Tasarım/ADR kararı var, artefakta bağlı (kod öncesi). |
| `gate-locked` | Kontrol tasarımı kabul; runtime kanıtı P1/G0 sonrası. |
| `p1-evidence-required` | Madde, P1 fonksiyonel kanıt (eval/log/test) gerektirir — henüz YOK (residual'da `P1`). |
| `owner-evidence-required` | Madde, owner/operatör kanıtı (DPIA imza, QMS, kayıt, post-market) gerektirir — (residual'da `owner`/`operatör`). |

> **YASAK ifadeler** (PRE-G0, guard reddeder): readiness ≠ uygunluk. compliance/conformity/certified/lawful eşanlamlıları ve TR karşılıkları (uygundur/uyumlu/gereklilikleri karşılar/tam karşılar) indekste kullanılamaz.

## 1. Madde → artefakt → residual matrisi

| Madde | Gereksinim | Mapped artefakt | Statü | Residual |
|---|---|---|---|---|
| **Art.9** | Risk management system (AI yaşam-döngüsü; foreseeable misuse, residual-risk kabul, validation feedback, post-market loop) | [docs/security/threat-register.md](../security/threat-register.md) + [[ATS-0005]] | design | tam AI-risk-management-system artefaktı + sürekli risk-review cadence owner |
| **Art.10** | Data & data governance (kalite, bias, governance) | [docs/privacy/data-lifecycle-register.md](../privacy/data-lifecycle-register.md) + [[ATS-0003]] + [[ATS-0005]] | design | bias-audit veri-seti + golden fixture (P1; owner sağlar) |
| **Art.11** | Technical documentation (Annex IV) | bu indeks + [docs/README.md](../README.md) ADR seti | design | Annex IV assembly (system-description/intended-purpose/design/data-governance/evaluation/human-oversight/logs/post-market/QMS/standards/instructions) P1+owner |
| **Art.12** | Record-keeping / otomatik loglama | [docs/observability/event-taxonomy.md](../observability/event-taxonomy.md) ([[ATS-0010]]) | gate-locked | runtime event emisyonu P1 |
| **Art.13** | Transparency & deployer'a bilgi (intended-purpose, limits, performance, oversight, logs, misuse) | [[ATS-0005]] + [[ATS-0004]] | gate-locked | instructions-for-use + deployer-guide + model-card ayrı artefakt (P1; owner yayınlar) |
| **Art.14** | Human oversight | [[ATS-0005]] (assist-vs-conduct; otomatik karar YOK) + [[ATS-0004]] human-approval | gate-locked | human-oversight state-machine standardı (round-2 #3) + P1 |
| **Art.15** | Accuracy, robustness, cybersecurity | [docs/security/threat-register.md](../security/threat-register.md) + [[ATS-0007]] + [docs/adr/ATS-0004-mulakat-ai-citation-eval-human-approval.md](../adr/ATS-0004-mulakat-ai-citation-eval-human-approval.md) (eval-gate) | p1-evidence-required | WER/DER/citation baseline gerçek fixture (P1; owner sağlar) |
| **Art.16** | Provider yükümlülükleri (genel) | bu indeks + [[ATS-0005]] + [[ATS-0007]] | owner-evidence-required | QMS+kayıt+beyan+post-market süreçleri owner |
| **Art.17** | Quality management system (QMS) | PRIVATE:ats-strategy/docs/procurement/quality-management-system.md (PRIVATE ADR ATS-0009 CI-runner) | owner-evidence-required | QMS süreç dokümantasyonu owner |
| **Art.18** | Dokümantasyon saklama (10 yıl) | [docs/privacy/data-lifecycle-register.md](../privacy/data-lifecycle-register.md) (worm_metadata/retention) + [[ATS-0003]] | gate-locked | 10-yıl saklama politikası runtime P1 + owner |
| **Art.19** | Provider otomatik-log saklama | [docs/observability/event-taxonomy.md](../observability/event-taxonomy.md) + [docs/privacy/data-lifecycle-register.md](../privacy/data-lifecycle-register.md) (audit_event) | gate-locked | log saklama süresi runtime P1 |
| **Art.20** | Düzeltici eylem + bilgilendirme görevi | PRIVATE:ats-strategy/docs/procurement/incident-response-runbook.md + [[ATS-0007]] | owner-evidence-required | düzeltici-eylem + yetkili bildirim süreci owner |
| **Art.21** | Yetkili makamlarla işbirliği (gerekçeli talepte doc+log erişimi) | PRIVATE:ats-strategy/docs/procurement/authority-cooperation-procedure.md + [docs/observability/event-taxonomy.md](../observability/event-taxonomy.md) | owner-evidence-required | yetkili-makam talep/yanıt + doc/log erişim süreci owner |
| **Art.26** | Deployer yükümlülükleri (müşteri) | [[ATS-0005]] (rol ayrımı) + PRIVATE:ats-strategy/docs/procurement/deployer-guidance.md | owner-evidence-required | provider-side deployer-enablement paketi owner |
| **Art.43** | Conformity assessment (Annex III iç-kontrol) | bu indeks + PRIVATE:ats-strategy/docs/procurement/eu-ai-act-readiness-checklist.md | owner-evidence-required | iç-kontrol conformity yürütümü owner |
| **Art.47** | AB uygunluk beyanı (EU declaration) | PRIVATE:ats-strategy/docs/procurement/eu-declaration-of-conformity.md | owner-evidence-required | conformity sonrası beyan owner |
| **Art.48** | CE işareti + eşlik eden dokümantasyon | PRIVATE:ats-strategy/docs/procurement/ce-marking-packaging-docs.md | owner-evidence-required | CE marking + accompanying-docs owner |
| **Art.49** | AB veritabanı kaydı (registration) | PRIVATE:ats-strategy/docs/procurement/eu-database-registration.md | owner-evidence-required | yüksek-riskli sistem kaydı owner |
| **Art.50** | Transparency (AI etkileşim/üretim açıklaması) | [[ATS-0005]] + [[ATS-0003]] (rıza/aydınlatma) | design | UI disclosure metni P1 |
| **Art.72** | Post-market monitoring (provider) | [docs/observability/event-taxonomy.md](../observability/event-taxonomy.md) + PRIVATE:ats-strategy/docs/procurement/post-market-monitoring-plan.md | owner-evidence-required | post-market izleme planı yürütümü owner |
| **Art.73** | Ciddi olay bildirimi (serious incident) | PRIVATE:ats-strategy/docs/procurement/incident-response-runbook.md + [docs/observability/event-taxonomy.md](../observability/event-taxonomy.md) | owner-evidence-required | ciddi-olay tespit+bildirim süreci owner |

## 1b. Koşullu / deployment-bağımlı yükümlülükler (required-set DIŞI)

Her kurulumda provider-core olmayan; AB-pazar rotası / reseller-zinciri / deployer-FRIA senaryosunda aktive olur (owner kararı):
- **Art.22** — AB-dışı provider için **yetkili temsilci** (AB pazarına girişte).
- **Art.25** — value-chain / distributor / importer sorumluluk geçişi (reseller zinciri).
- **Art.27** — deployer **FRIA** (temel hak etki değerlendirmesi) desteği (müşteri-facing enablement).

## 2. Doğrulama (drift-guard `scripts/check-eu-ai-act-index.mjs`)

- Required AB AI Act maddeleri (21: Art.9/10/11/12/13/14/15/16/17/18/19/20/21/26/43/47/48/49/50/72/73) hepsi mevcut + tekil.
- Statü sözlük-geçerli; **YASAK overclaim ifadeleri** (EN+TR uygunluk/uyum iddiası eşanlamlıları; standalone `conformity` legal terim olarak serbest) indekste görünemez.
- Tüm `[[ATS-XXXX]]` referansları docs/adr'de mevcut olmalı (kopuk-ADR-ref reddi).
- `Mapped artefakt` hücresindeki **her markdown-link path mevcut olmalı** (ölü-link reddi); satır en az bir çözülür anchor (path / `[[ATS-XXXX]]` / `PRIVATE:<path>`) taşımalı.
- **Evidence-binding:** `p1-evidence-required` → residual'da `P1`; `owner-evidence-required` → residual'da `owner`/`operatör` (statü kanıt-ihtiyacını residual'a bağlar).

## 3. Bağlantı
- [[ATS-0005]] (karar) · [[ATS-0004]] · [[ATS-0003]] · [[ATS-0007]] · [[ATS-0009]] · threat-register · event-taxonomy · data-lifecycle-register · PRIVATE: QMS/incident-runbook/declaration/registration/post-market/deployer-guidance (`ats-strategy/docs/procurement`).
