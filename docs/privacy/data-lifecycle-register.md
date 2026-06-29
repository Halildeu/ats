# Data Lifecycle / Retention / Erasure / Transfer Register (canonical)

> **Public · living document.** [[ATS-0003]] (KVKK/recording-consent/WORM≠deletion) kararını **izlenebilir, machine-checked** veri-yaşam-döngüsü matrisine döker. DPO/procurement sorusunun ("hangi veri, hangi amaç, nerede, ne kadar, nasıl silinir, backup'tan geri-bağlanır mı, kim işler, yurtdışına gider mi?") tek kanonik cevabı.
> **Drift guard:** `scripts/check-data-lifecycle.mjs` (CI job `data-lifecycle-guard`).
> **Subprocessor/sağlayıcı ADLARI burada YOK** (deal-özeli) → ayrı PRIVATE subprocessor register (`ats-strategy`). Bu register yalnız **veri-sınıfı × politika** yüzeyidir.
> Çapraz-bağ: [[ATS-0003]] WORM/erasure · [docs/security/threat-register.md](../security/threat-register.md) T-I4/T-I5/T-I6/P-L1 · [docs/observability/event-taxonomy.md](../observability/event-taxonomy.md) pii_class.

## 0. Sözlük (machine-checked)

- **pii_class:** `none` · `id-only` · `pseudonymized` · `raw-pii` · `content` · `mixed`.
- **plane (storage):** `worm-ledger` · `primary-db` · `object-store` · `vector-index` · `telemetry` · `backup` · `none`.
- **deletion:** `hard-delete` · `crypto-erase` (salt/anahtar imhası — [[ATS-0003]] unlinkable) · `tombstone-append` (WORM; silme değil) · `n/a`.
- **WORM:** `EVET` (append-only, silinmez) · `HAYIR` · `miras` (kapsadığı plane'den devralır — backup).
- **transfer:** `none` (yurtiçi/on-prem) · `SCC` · `KVKK-açık-rıza` · `adequacy` · `müşteri-yönlendirmeli` (export hedefi müşteri kararı).
- **status:** `enforced (CI)` · `gate-locked` (runtime/P1) · `design`.

### İnvariantlar (guard zorlar)
1. **WORM içerik yasağı ([[ATS-0003]]):** `content`/`raw-pii` sınıfı veri **`worm-ledger` plane'inde TUTULAMAZ** (ledger yalnız metadata+hash taşır). İhlal → fail.
2. `worm-ledger` plane satırı → `WORM=EVET` olmalı + deletion=`tombstone-append`.
3. Her satır: `legal_basis` + `retention` dolu (canonical'de `[DOLDUR]` YASAK).
4. `transfer` ∈ sözlük; `none` dışı ise tip beyanı zorunlu (sağlayıcı adı değil).

## 1. Veri-sınıfı yaşam-döngüsü matrisi

| Data Class | Amaç | Rol | pii_class | Plane | Legal basis | Retention | Deletion | WORM | Transfer | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| **raw_media** | mülakat kaydı (kanıt kaynağı) | processor | content | object-store | açık-rıza (KVKK m.6) | tenant-policy (≥yasal-min) | crypto-erase | HAYIR | none | design |
| **transcript_raw** | STT ham çıktısı | processor | content | primary-db | açık-rıza | tenant-policy | crypto-erase | HAYIR | none | design |
| **transcript_redacted** | PII-azaltılmış transkript | processor | pseudonymized | primary-db | açık-rıza | tenant-policy | hard-delete | HAYIR | none | design |
| **speaker_label** | diarization etiketi (S1/S2) | processor | pseudonymized | primary-db | açık-rıza | tenant-policy | hard-delete | HAYIR | none | design |
| **candidate_pii** | aday kimlik verisi | processor | raw-pii | primary-db | açık-rıza | tenant-policy | crypto-erase | HAYIR | none | design |
| **embedding_vector** | citation arama indexi | processor | pseudonymized | vector-index | açık-rıza | tenant-policy | crypto-erase | HAYIR | none | design |
| **consent_record** | rıza + aydınlatma kaydı | controller | id-only | worm-ledger | yasal-yükümlülük (KVKK m.10) | ≥yasal | tombstone-append | EVET | none | design |
| **worm_metadata** | ledger entry meta + hash-zincir | processor | id-only | worm-ledger | meşru-menfaat (denetlenebilirlik) | ≥yasal | tombstone-append | EVET | none | gate-locked |
| **model_version_log** | model/sürüm + human-oversight kaydı | processor | id-only | worm-ledger | meşru-menfaat | ≥yasal | tombstone-append | EVET | none | gate-locked |
| **audit_event** | operasyonel telemetri ([[ATS-0010]]) | processor | id-only | telemetry | meşru-menfaat (güvenlik/denetim) | tenant-policy (≥yasal-güvenlik) | hard-delete | HAYIR | none | gate-locked |
| **evidence_export_artifact** | denetim kanıt paketi | controller | pseudonymized | object-store | açık-rıza / sözleşme | tenant-policy | crypto-erase | HAYIR | müşteri-yönlendirmeli | design |
| **connector_metadata** | ATS entegrasyon meta | processor | id-only | primary-db | sözleşme | tenant-policy | hard-delete | HAYIR | none | design |
| **backup_copy** | şifreli yedek (tüm plane) | processor | mixed | backup | meşru-menfaat (süreklilik) | RPO/RTO-policy | crypto-erase | miras | none | gate-locked |

> Erasure invariantı (on-prem checklist §6 + [[ATS-0003]]): `crypto-erase` = salt/anahtar imhası → silinen aday **backup restore sonrası yeniden ilişkilendirilemez**; `backup_copy` destruction-propagation kapsamında.

## 2. Doğrulama (drift-guard `scripts/check-data-lifecycle.mjs`)

- Tüm required veri-sınıfları (sentinel) mevcut.
- Her hücre sözlük-geçerli (pii_class/plane/deletion/WORM/transfer/status).
- §0 invariant 1–4 (WORM-içerik-yasağı, worm-ledger→EVET+tombstone, legal_basis/retention dolu + `[DOLDUR]` yok, transfer tipi).
- Header-eşlemeli sütun parse (sütun sırası değişse de doğru).

## 3. Bağlantı
- [[ATS-0003]] (karar) · [docs/security/threat-register.md](../security/threat-register.md) T-I4/T-I5/T-I6/P-L1 · [docs/observability/event-taxonomy.md](../observability/event-taxonomy.md) · on-prem checklist §6 (PRIVATE ats-strategy) · PRIVATE subprocessor-provider-register (sağlayıcı adları).
