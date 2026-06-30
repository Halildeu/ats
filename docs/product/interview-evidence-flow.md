# Interview-Evidence Product Flow (canonical, buyer-readable)

> **Public · living document.** Mülakat-kanıt ürününün **uçtan-uca yüzeyi** tek yerde: aday rızası → kayıt → AI-önerisi → insan-inceleme → kesinleştirme → export/ATS → geri-çekme/DSAR. Mevcut sözleşme/registry/standartları **alıcı-okunur** bir akışa bağlar (Metaview/BrightHire-tarzı review/share/export table-stakes'i spec seviyesinde netleştirir).
> **Gate sınırı (No-Fake-Work):** Bu bir **akış SÖZLEŞMESİ**dir; çalışan UI/runtime DEĞİL. Her adımın `P1 residual`'ı gerçek davranışın **G0=GO sonrası** geleceğini söyler. "ürün çalışıyor / pilot-ready" İDDİA EDİLMEZ.
> **Drift guard:** `scripts/check-product-flow.mjs` (CI `product-flow-guard`) — adım backing'leri çözülür + human-oversight state'leri + event-taxonomy event'leri ile hizalı + sentinel adımlar + self-test.

## 0. Adım sözlüğü
- **owner_surface:** akışı kim görür/yürütür (aday / interviewer / İK-reviewer / denetçi / sistem).
- **backing:** adımı destekleyen mevcut artefakt (repo path / `[[ATS-XXXX]]`).
- **forbidden:** o adımda YASAK içerik/davranış (boş olamaz).
- **p1_residual:** runtime/P1 (G0=GO sonrası) kalan (boş olamaz).

## 1. Uçtan-uca akış

| step | owner_surface | backing | forbidden | p1_residual |
|---|---|---|---|---|
| **DISCLOSURE_VIEWED** | aday | [[ATS-0003]] + [i18n](../../web/i18n/tr-TR.json) (consent.disclosure) | rıza-öncesi kayıt/işleme | gerçek aydınlatma UI render |
| **CONSENT_RECORDED** | aday | [[ATS-0003]] + [data-lifecycle](../privacy/data-lifecycle-register.md) (consent_record) + event `consent.recorded` | zorunlu-rıza / karanlık-desen | rıza persist + WORM event emisyonu |
| **RECORDING_GATED** | sistem | event `evidence.recording.blocked_no_consent` + [[ATS-0003]] | rızasız kayıt başlatma | gerçek kayıt gate runtime |
| **AI_SUGGESTED_EVIDENCE** | sistem | [[ATS-0004]] + [ai-provider](../../contracts/src/ai-provider.ts) | otomatik karar / skor / sıralama | gerçek STT/diarization/LLM/citation runtime |
| **HUMAN_REVIEWING** | İK-reviewer | [human-oversight](../governance/human-oversight-standard.md) (HUMAN_REVIEWING) | rubber-stamp / toplu-onay | gerçek inceleme UI + audit |
| **EVIDENCE_INSPECTED** | İK-reviewer | [evidence-packet](../evidence/evidence-packet-manifest.md) + [rubric](../governance/rubric-standard.md) | unsupported-iddia karar-kanıtı / korumalı-özellik kriteri | citation kaynak-quote inspect runtime |
| **HUMAN_RATIONALE_RECORDED** | İK-reviewer | [human-oversight](../governance/human-oversight-standard.md) (HUMAN_RATIONALE_RECORDED) | boş/otomatik gerekçe | gerekçe persist (primary-db) |
| **FINALIZED** | İK-reviewer | [human-oversight](../governance/human-oversight-standard.md) (FINALIZED) + event `evidence.human_decision.finalized` | insan-gerekçesiz finalize / re-open | 6-pointer accountability runtime + WORM |
| **EXPORTED** | denetçi | [evidence-packet](../evidence/evidence-packet-manifest.md) + [release/integrity](../security/release-evidence-manifest.md) | ham-medya/PII/skor paket içinde | gerçek paket üretimi + imza |
| **ATS_ATTACHED** | sistem | [connector](../integrations/connector-capability-standard.md) + [ats-connector](../../contracts/src/ats-connector.ts) | candidate/stage/score write-back | gerçek ATS write-back (P1, dar) |
| **WITHDRAWN_OR_DSAR** | aday/denetçi | [[ATS-0003]] + [data-lifecycle](../privacy/data-lifecycle-register.md) + event `privacy.dsar.received` | crypto-erase olmadan "silindi" iddiası | gerçek erasure + unlinkable tombstone runtime |

## 2. Doğrulama (drift-guard `scripts/check-product-flow.mjs`)
- Her adımın `backing` hücresi en az bir çözülür referans (mevcut repo path / `[[ATS-XXXX]]`) taşır; `forbidden` + `p1_residual` boş olamaz.
- Sentinel adımlar (CONSENT_RECORDED / AI_SUGGESTED_EVIDENCE / HUMAN_RATIONALE_RECORDED / FINALIZED / WITHDRAWN_OR_DSAR) silinemez.
- Hizalama: `FINALIZED`/`HUMAN_REVIEWING`/`HUMAN_RATIONALE_RECORDED` human-oversight state'leriyle; bahsedilen event'ler (`consent.recorded`/`evidence.human_decision.finalized`/`privacy.dsar.received`/`evidence.recording.blocked_no_consent`) event-taxonomy'de mevcut.
- Gömülü self-test (durable regression).

## 3. Bağlantı
- [[ATS-0003]]/[[ATS-0004]]/[[ATS-0005]] · human-oversight-standard · evidence-packet-manifest · rubric-standard · connector-capability-standard · data-lifecycle-register · event-taxonomy · web foundation (i18n/contracts). Akış adımları human-oversight state-machine'in **buyer-readable** yansımasıdır; runtime P1.
