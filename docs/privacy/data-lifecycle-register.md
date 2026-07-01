# Data Lifecycle / Retention / Erasure / Transfer Register (canonical)

> **Public · living document.** [[ATS-0003]] (KVKK/recording-consent/WORM≠deletion) kararını **izlenebilir, machine-checked** veri-yaşam-döngüsü matrisine döker. DPO/procurement sorusunun tek kanonik cevabı.
> **Drift guard:** `scripts/check-data-lifecycle.mjs` (CI job `data-lifecycle-guard`).
> **Rol:** Bu ürün işlediği müşteri verisinde **processor**; **müşteri = controller**. Aşağıdaki `Rol` kolonu ATS rolünü gösterir.
> **Subprocessor/sağlayıcı ADLARI burada YOK** (deal-özeli) → ayrı PRIVATE subprocessor register (`ats-strategy`).
> Çapraz-bağ: [[ATS-0003]] · [[ATS-0004]] citation/provider · [[ATS-0005]] human-oversight · [docs/security/threat-register.md](../security/threat-register.md) T-I4/T-I5/T-I6/P-L1/P-U1 · [docs/observability/event-taxonomy.md](../observability/event-taxonomy.md).

## 0. Sözlük (machine-checked)

- **sensitivity:** `none` · `id-only` · `pseudonymized` · `raw-pii` · `content` · `secret` · `mixed`.
- **plane:** `worm-ledger` · `primary-db` · `object-store` · `vector-index` · `telemetry` · `backup` · `kms-vault` · `none`.
- **deletion:** `hard-delete` · `crypto-erase` (salt/anahtar imhası — unlinkable) · `tombstone-append` (WORM; silme değil) · `transient` (persist edilmez) · `n/a`.
- **WORM:** `EVET` · `HAYIR` · `miras` (backup — kapsadığı plane'den).
- **WORM-identity-binding** (yalnız worm-ledger satırı için anlamlı): `HMAC-destroyable` (subject ref HMAC(salt); salt-destruction → unlinkable) · `no-subject` (ledger kaydı bireye bağlı değil, ör. model/sürüm) · `n/a` (WORM-dışı satır). WORM-dışı satırların bireye-bağlılığı `sensitivity` + erasure ile yönetilir (bu kolon değil).
- **transfer:** `none` (yurtiçi/on-prem persist) · `self-host-only` · `no-train-DPA` · `SCC` · `KVKK-açık-rıza` · `adequacy` · `müşteri-yönlendirmeli`.
- **status:** `gate-locked` (runtime/P1) · `design` (veri-modeli kararı). *(Data-class satırı `enforced` İDDİA ETMEZ — enforce edilen, bu register'ın `data-lifecycle-guard` bütünlüğüdür.)*

### İnvariantlar (guard zorlar)
1. `content`/`raw-pii`/`secret`/`mixed` sensitivity **`worm-ledger` plane'de TUTULAMAZ** ([[ATS-0003]]: ledger meta+hash).
2. `worm-ledger` → `WORM=EVET` + `deletion=tombstone-append` + `WORM-identity-binding ∈ {HMAC-destroyable, no-subject}` (statik linklenebilir hash YASAK — hash-tuzağı). WORM-dışı satır → `n/a`.
3. `content`/`raw-pii`/`secret`/`mixed` → `deletion ∈ {hard-delete, crypto-erase, transient}` (asla tombstone/n/a — silinebilir olmalı, KVKK silme hakkı).
4. `kms-vault` plane → `sensitivity=secret`.
5. `ai_provider_payload` → `transfer ∈ {self-host-only, no-train-DPA, SCC, KVKK-açık-rıza}` (düz `none` YASAK — T-I5 provider kanalı saklanamaz).
6. Her satır `legal_basis` + `retention` dolu (`[DOLDUR]` YASAK); data-class **tekil** (duplicate YASAK).

## 1. Veri-sınıfı yaşam-döngüsü matrisi

| Data Class | Amaç | Rol | sensitivity | Plane | Legal basis | Retention | Deletion | WORM | WORM-identity-binding | Transfer | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **raw_media** | mülakat kaydı | processor | content | object-store | açık-rıza+aydınlatma (özel-nitelikli doğarsa m.6 minimizasyon) | tenant-policy (≥yasal-min) | crypto-erase | HAYIR | n/a | none | design |
| **transcript_raw** | STT ham çıktısı | processor | content | primary-db | açık-rıza | tenant-policy | crypto-erase | HAYIR | n/a | none | design |
| **transcript_redacted** | PII-azaltılmış transkript | processor | pseudonymized | primary-db | açık-rıza | tenant-policy | hard-delete | HAYIR | n/a | none | design |
| **speaker_label** | diarization etiketi (S1/S2) | processor | pseudonymized | primary-db | açık-rıza | tenant-policy | hard-delete | HAYIR | n/a | none | design |
| **speaker_attribution_map** | S1..Sn ↔ katılımcı display-ref eşlemesi (insan-onaylı; ATS-0013 — biyometrik şablon DEĞİL) | processor | pseudonymized | primary-db | açık-rıza | tenant-policy | hard-delete | HAYIR | n/a | none | design |
| **candidate_pii** | aday kimlik verisi | processor | raw-pii | primary-db | açık-rıza | tenant-policy | crypto-erase | HAYIR | n/a | none | design |
| **participant_pii** | interviewer kimlik verisi | processor | raw-pii | primary-db | açık-rıza/sözleşme (m.5/2-c) | tenant-policy | crypto-erase | HAYIR | n/a | none | design |
| **embedding_vector** | citation arama indexi | processor | pseudonymized | vector-index | açık-rıza | tenant-policy | crypto-erase | HAYIR | n/a | none | design |
| **redaction_map** | redacted↔raw eşleme (PII'ye bağlanabilir) | processor | raw-pii | primary-db | açık-rıza | tenant-policy | crypto-erase | HAYIR | n/a | none | design |
| **pseudonymization_map** | HMAC(salt) subject eşleme | processor | secret | kms-vault | meşru-menfaat (m.5/2-f) | erasure'a-kadar | crypto-erase | HAYIR | n/a | none | gate-locked |
| **erasure_key_material** | per-tenant şifre + salt-key | processor | secret | kms-vault | hukuki-yükümlülük (m.5/2-ç) | rotation/erasure-policy | crypto-erase | HAYIR | n/a | none | gate-locked |
| **recording_permission_state** | mülakat-başı kayıt izni state | processor | id-only | primary-db | açık-rıza | tenant-policy | hard-delete | HAYIR | n/a | none | design |
| **consent_record** | rıza + aydınlatma kaydı | processor | id-only | worm-ledger | hukuki-yükümlülük (m.5/2-ç; kayıt-tutma) | ≥yasal | tombstone-append | EVET | HMAC-destroyable | none | design |
| **worm_metadata** | ledger entry meta + hash-zincir | processor | id-only | worm-ledger | meşru-menfaat (denetlenebilirlik) | ≥yasal | tombstone-append | EVET | HMAC-destroyable | none | gate-locked |
| **model_version_log** | model/sürüm + approval olayı | processor | id-only | worm-ledger | meşru-menfaat | ≥yasal | tombstone-append | EVET | no-subject | none | gate-locked |
| **human_decision_rationale** | insan-yazımı gerekçe (audit) | processor | pseudonymized | primary-db | meşru-menfaat | tenant-policy | hard-delete | HAYIR | n/a | none | design |
| **claim_citation_ref** | iddia↔kaynak-segment referansı | processor | id-only | primary-db | meşru-menfaat | tenant-policy | hard-delete | HAYIR | n/a | none | design |
| **evidence_packet** | denetim kanıt paketi (export) | processor | pseudonymized | object-store | açık-rıza/sözleşme | tenant-policy | crypto-erase | HAYIR | n/a | müşteri-yönlendirmeli | design |
| **dsar_request_log** | DSAR/DSR talep kaydı | processor | id-only | primary-db | hukuki-yükümlülük (m.11/m.13) | ≥yasal | hard-delete | HAYIR | n/a | none | design |
| **dsar_response_artifact** | DSAR yanıt/erişim çıktısı | processor | pseudonymized | object-store | hukuki-yükümlülük | tenant-policy | crypto-erase | HAYIR | n/a | müşteri-yönlendirmeli | design |
| **retention_policy** | parametrik saklama config | processor | none | primary-db | meşru-menfaat | config-ömrü | hard-delete | HAYIR | n/a | none | design |
| **retention_timer_state** | otomatik imha timer state | processor | id-only | primary-db | meşru-menfaat | tenant-policy | hard-delete | HAYIR | n/a | none | gate-locked |
| **audit_event** | operasyonel telemetri ([[ATS-0010]]) | processor | id-only | telemetry | meşru-menfaat (güvenlik) | tenant-policy (≥yasal-güvenlik) | hard-delete | HAYIR | n/a | none | gate-locked |
| **connector_metadata** | ATS entegrasyon meta | processor | id-only | primary-db | sözleşme (m.5/2-c) | tenant-policy | hard-delete | HAYIR | n/a | none | design |
| **ai_provider_payload** | provider'a giden geçici girdi | processor | content | none | açık-rıza | persist-yok | transient | HAYIR | n/a | self-host-only | gate-locked |
| **backup_copy** | şifreli yedek (tüm plane) | processor | mixed | backup | meşru-menfaat (süreklilik) | RPO/RTO-policy | crypto-erase | miras | n/a | none | gate-locked |

> Erasure invariantı (on-prem checklist §6 + [[ATS-0003]]): `crypto-erase` = salt/anahtar imhası → silinen aday **backup restore sonrası yeniden ilişkilendirilemez**; `pseudonymization_map`+`erasure_key_material` destruction-propagation kapsamında. `ai_provider_payload` cloud-pilot modunda transfer `no-train-DPA`/`SCC`'ye döner (deployment-conditioned; default self-host-only).

## 2. Doğrulama (drift-guard `scripts/check-data-lifecycle.mjs`)

- Tüm required veri-sınıfları (sentinel, 26) mevcut + **tekil** (duplicate fail).
- Sözlük geçerliliği (sensitivity/plane/deletion/WORM/identity-binding/transfer/status).
- §0 invariant 1–6 (WORM-içerik-yasağı; worm-ledger→EVET+tombstone+subject-binding; content/raw/secret silinebilir; kms-vault→secret; provider transfer-tipi; legal/retention dolu+duplicate).
- Header-eşlemeli sütun parse.

## 3. Bağlantı
- [[ATS-0003]] · [[ATS-0004]] · [[ATS-0005]] · threat-register T-I4/T-I5/T-I6/P-L1/P-U1 · event-taxonomy · on-prem checklist §6 + PRIVATE subprocessor-provider-register (sağlayıcı adları).
