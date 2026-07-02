# P1 MFE START GATE — vendor-snapshot sabitlemesi (ATS-0008 D-C, canonical)

> ATS-0008 D-C kuralı: *"Bu gate karşılanmadan MFE UI dilimi başlamaz."* Bu doküman D-C'nin
> istediği 5 şartı **yazılı sabitler**; sabitleme sonrası `mfe-interview-evidence` UI dilimi
> AÇIKTIR (ATS-0016 P1 build kapsamı; release/gerçek-veri G0-kilitli kalır).
> **Machine-checked:** `scripts/check-mfe-start-gate.mjs` (CI `mfe-start-gate-guard`).

## 1. Kaynak repo + snapshot noktası (DONDURULDU)

| Alan | Değer |
|---|---|
| Kaynak repo | `Halildeu/platform-web` |
| **Snapshot commit SHA** | `d5db9b895305ec97ed9a6e987f0388e2b3aa9414` (main @ 2026-07-02; gh API'den okundu) |
| Snapshot yöntemi | tek-seferlik kopya → `ats/packages/` (runtime/registry coupling YOK — ADR-0001 boundary) |

## 2. Curated paket/component listesi (kopyalanacak alt-set)

| Kaynak paket | Alınan | P1 kullanımı |
|---|---|---|
| `packages/design-system` | core component seti + `a11y/` yardımcıları (dokümantasyon/`__visual__`/`benchmarks` HARİÇ) | form/buton/tablo/modal/toast/layout — ingest + segment-view + evidence-panel + human-approve + export akışı |
| `packages/blocks` | `src/blocks` + `src/composition` + `src/templates` curated alt-seti | sayfa iskeletleri/kompozisyon |
| `packages/config` | lint/tsconfig taban dosyaları (build hijyeni) | derleme temeli |

**BİLİNÇLE KAPSAM DIŞI (bu snapshot'ta):** `x-data-grid` (AG-Grid Enterprise bağımlılığı — aşağıda §4),
`x-charts`, `x-editor`, `auth`, `platform-capabilities`, `shared-http`, `shared-types`, `i18n-dicts`
(ATS kendi i18n kataloğunu taşıyor: `web/i18n/tr-TR.json`), `create-app`, `benchmarks`, `design-system-docs`, `docs`.
P1 segment/evidence tabloları design-system'in kendi tablo bileşeniyle karşılanır; enterprise-grid
ihtiyacı DOĞARSA ayrı karar (§4 lisans deseniyle) alınır — şimdi taşınmaz (over-engineering guard).

## 3. Namespace + ownership

- Hedef: **`ats/packages/ui`**, npm namespace **`@ats/ui`** (blocks alt-seti `@ats/ui/blocks`).
- **Ownership: ATS** — kopya sonrası bağımsız sürdürülür; platform-web'e runtime/build coupling YOK
  (ADR-0001; ArchUnit'in backend'te yaptığını web tarafında boundary-guard path-scan yapar).

## 4. Lisans

- Kopyalanan kod **kendi yazılımımızdır** (platform-web, aynı owner'ın private reposu) — üçüncü-taraf
  lisans yükümlülüğü doğurmaz; kopya, dosya başlıklarını/atıfları korur.
- **AG Grid Enterprise: bu snapshot'ta YOK** (x-data-grid dışlandı) → lisans anahtarı şartı **şimdilik n/a**.
  İleride gerekirse desen HAZIR ve değişmez: build-time GitHub secret `AG_GRID_LICENSE_KEY`
  (Vault DEĞİL; platform kalıbı) + immutable-tag rebuild — o gün ayrı karar/PR.
- OSS transitive bağımlılıklar: mevcut `dependency-review` CI'ı **vuln kapısıdır** (fail-on-severity: high);
  **lisans-politikası enforcement'ı BU PR'DA YOK** (dürüst sınır) — release-evidence gate'inin
  license/secret=0 disipliniyle release öncesi kapanır; snapshot-kopyası PR'ında ayrıca gözden geçirilir.

## 5. Upstream güncelleme politikası

- **Manuel re-snapshot kararıyla** — otomatik senkron akışı YOK. Yeni snapshot = bu dokümanda SHA
  güncellemesi + ayrı PR + cross-AI review (guard SHA formatını zorlar; değişiklik görünür olur).

## Gate durumu

- [x] 1. Kaynak repo + commit SHA donduruldu
- [x] 2. Curated liste yazıldı (dışlananlar gerekçeli)
- [x] 3. Namespace/ownership sabit (`@ats/ui`, ATS)
- [x] 4. Lisans netliği (AG-Grid dışlandı → n/a; desen belgelendi)
- [x] 5. Upstream politikası (manuel re-snapshot)

**SONUÇ: GATE KARŞILANDI — `mfe-interview-evidence` UI dilimi başlayabilir.** (İlk UI dilimi ayrı PR:
snapshot kopyası + F3 segment-view; runtime "çalışıyor" iddiası ancak browser-verify ile.)

## Bağlantı

ATS-0008 D-B/D-C (private) · [[ATS-0016]] (P1 build / release-gate) · web/design-system tokens +
tr-TR i18n + component-contracts (PR#38 tabanı) · frontend/a11y-i18n-standard (WCAG 2.2 AA).
