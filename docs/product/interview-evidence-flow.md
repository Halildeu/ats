# Interview-Evidence Product Flow (canonical, buyer-readable)

> **Public · living document.** Mülakat-kanıt ürününün **uçtan-uca yüzeyi** tek yerde: aday rızası + AI-açıklaması → kayıt → transkript → AI-alıntı → insan-inceleme → kesinleştirme → export/erişim/ATS → geri-çekme/DSAR/erasure/retention. Mevcut sözleşme/registry/standartları **alıcı-okunur** akışa bağlar (Metaview/BrightHire review/share/export table-stakes spec seviyesinde).
> **Gate sınırı (No-Fake-Work):** Bu bir **akış SÖZLEŞMESİ**dir; çalışan UI/runtime DEĞİL. Her adımın `p1_residual`'ı gerçek davranışın **G0=GO sonrası** geleceğini söyler. "ürün çalışıyor / pilot-ready" İDDİA EDİLMEZ.
> **Drift guard:** `scripts/check-product-flow.mjs` (CI `product-flow-guard`) — backing link/ADR **hepsi** çözülür + event/state token'ları taksonomi/state-machine'de **birebir** doğrulanır + sentinel/duplicate + self-test.

## 0. Adım sözlüğü
- **owner_surface:** akışı kim görür/yürütür (aday / interviewer / İK-reviewer / denetçi / sistem).
- **backing:** destekleyen mevcut artefakt (repo path / `[[ATS-XXXX]]`); bahsedilen event `` `ns.x` `` taksonomide, state `(STATE)` human-oversight'ta olmalı.
- **forbidden / p1_residual:** YASAK içerik + runtime/P1 kalan (ikisi de boş olamaz).

## 1. Uçtan-uca akış

| step | owner_surface | backing | forbidden | p1_residual |
|---|---|---|---|---|
| **DISCLOSURE_VIEWED** | aday | [[ATS-0003]] + [i18n](../../web/i18n/tr-TR.json) (consent.disclosure) | rıza-öncesi kayıt/işleme | aydınlatma UI render |
| **AI_ASSISTANCE_DISCLOSED** | aday | [[ATS-0005]] + [eu-ai-act](../ai-governance/eu-ai-act-technical-file-index.md) (Art.50) + [i18n](../../web/i18n/tr-TR.json) (aiAssistanceDisclosure) | AI-kullanımını gizleme / "AI karar verir" ima | Art.50 AI-disclosure UI |
| **CONSENT_RECORDED** | aday | [[ATS-0003]] + [data-lifecycle](../privacy/data-lifecycle-register.md) (consent_record) + event `consent.recorded` | zorunlu-rıza / karanlık-desen | rıza persist + WORM event |
| **RECORDING_GATED** | sistem | [[ATS-0003]] + event `evidence.recording.blocked_no_consent` | rızasız kayıt başlatma | kayıt gate runtime |
| **RECORDING_CAPTURED** | sistem | [data-lifecycle](../privacy/data-lifecycle-register.md) (raw_media) + event `evidence.recording.started` + event `evidence.recording.stopped` | rıza-dışı/izinsiz kayıt | gerçek kayıt yakalama |
| **TRANSCRIPT_READY** | sistem | [[ATS-0004]] + [ai-provider](../../contracts/src/ai-provider.ts) + [data-lifecycle](../privacy/data-lifecycle-register.md) (transcript_redacted) | ham PII transkriptin denetime sızması | STT/diarization runtime + redaction |
| **AI_CITED_CLAIMS** | sistem | [[ATS-0004]] + [ai-provider](../../contracts/src/ai-provider.ts) (cite) | otomatik karar / skor / sıralama | LLM citation/entailment runtime |
| **HUMAN_REVIEWING** | İK-reviewer | [human-oversight](../governance/human-oversight-standard.md) (HUMAN_REVIEWING) | rubber-stamp / toplu-onay | inceleme UI + audit |
| **EVIDENCE_INSPECTED** | İK-reviewer | [evidence-packet](../evidence/evidence-packet-manifest.md) + [rubric](../governance/rubric-standard.md) | unsupported-iddia karar-kanıtı / korumalı-özellik kriteri | citation kaynak-quote inspect |
| **HUMAN_RATIONALE_RECORDED** | İK-reviewer | [human-oversight](../governance/human-oversight-standard.md) (HUMAN_RATIONALE_RECORDED) | boş/otomatik gerekçe | gerekçe persist (primary-db) |
| **FINALIZED** | İK-reviewer | [human-oversight](../governance/human-oversight-standard.md) (FINALIZED) + event `evidence.human_decision.finalized` | insan-gerekçesiz finalize / re-open | 6-pointer accountability + WORM |
| **EXPORTED** | denetçi | [evidence-packet](../evidence/evidence-packet-manifest.md) (integrity) + [ats-connector](../../contracts/src/ats-connector.ts) + event `security.audit_export.generated` | ham-medya/PII/skor paket içinde | gerçek paket üretimi + imza |
| **PACKET_ACCESSED_OR_SHARED** | denetçi | [data-lifecycle](../privacy/data-lifecycle-register.md) (audit_event) + event `security.audit_log.read` | erişim-logsuz paylaşım | erişim/paylaşım audit runtime |
| **ATS_ATTACHED** | sistem | [connector](../integrations/connector-capability-standard.md) + [ats-connector](../../contracts/src/ats-connector.ts) | candidate/stage/score write-back | gerçek dar ATS write-back |
| **CONTEST_OR_CORRECTION** | aday | [[ATS-0005]] + [human-oversight](../governance/human-oversight-standard.md) | otomatik-ret / itiraz-yolu-yok | aday itiraz/düzeltme akışı |
| **CONSENT_WITHDRAWN** | aday | [[ATS-0003]] + event `consent.withdrawn` | geri-çekmeyi engelleme | withdrawal runtime |
| **DSAR_RECEIVED** | denetçi | [[ATS-0003]] + event `privacy.dsar.received` + event `privacy.dsar.fulfilled` | DSAR yanıtsız bırakma | DSAR workflow runtime |
| **ERASURE_EXECUTED** | sistem | [data-lifecycle](../privacy/data-lifecycle-register.md) (erasure_key_material) + event `privacy.erasure.executed` + event `evidence.tombstone.appended` | crypto-erase'siz "silindi" iddiası | erasure + unlinkable tombstone runtime |
| **RETENTION_PURGED** | sistem | [data-lifecycle](../privacy/data-lifecycle-register.md) (retention_timer_state) + event `privacy.retention.purged` | süresiz saklama | otomatik imha timer runtime |

## 2. Doğrulama (drift-guard `scripts/check-product-flow.mjs`)
- Her adımın `backing`'indeki **tüm** markdown-link path'leri + `[[ATS-XXXX]]` ref'leri mevcut (tek ölü-link bile fail); satır en az bir çözülür anchor.
- `forbidden` + `p1_residual` boş olamaz; adım tekil.
- **Token hizalama:** backing'deki `` `ns.x` `` event token'ları event-taxonomy §2'de; `(STATE)` token'ları human-oversight §1'de **birebir** bulunmalı (typo yakalanır).
- Sentinel adımlar silinemez. Gömülü self-test (durable regression).

## 3. Bağlantı
- [[ATS-0003]]/[[ATS-0004]]/[[ATS-0005]] · human-oversight · evidence-packet · rubric · connector · data-lifecycle · event-taxonomy · eu-ai-act (Art.50) · web foundation. Akış, human-oversight state-machine'in **buyer-readable** yansıması; runtime P1.
