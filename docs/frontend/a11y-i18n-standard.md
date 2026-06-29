# Accessibility (WCAG 2.2 A+AA) + i18n Standard (canonical registry)

> ATS-0011 kanonik kriter kaydı. **Machine-checked** (`scripts/check-a11y-standard.mjs`, CI job `a11y-standard-guard`).
> Kapsam: tüm P1 UI yüzeyleri — `web/` · `mobile/` · `desktop/` · `packages/shared` UI primitives.
> Statü: `enforced (CI)` · `gate-locked` · `design`. Gerçek UI yok (P1 gated) → a11y/i18n satırları bugün `gate-locked`/`design`; enforcement (axe/eslint/i18n-extract) P1 ile aktif. Yalnız bu registry'nin **bütünlüğü** `enforced (CI)`.
> **Tam set:** WCAG 2.2 **A + AA** başarı kriterlerinin tamamı (55). AAA dahil DEĞİL (bilinçli sınır — over-promise yok). `4.1.1 Parsing` WCAG 2.2'de obsolete → dahil edilmez. Drift-guard **eksik/fazla/yanlış-seviye** kriteri reddeder.

## 0. Statü & seviye sözlüğü

- **Seviye:** `A` · `AA` (WCAG) · `n/a` (i18n/proje-kuralı).
- **Status:** `enforced (CI)` (bugün CI guard ile, impl/test repo path'e bağlı) · `gate-locked` (tasarım kabul, kodu P1 UI'a bağlı) · `design` (karar verildi, kod öncesi).

## 1. Erişilebilirlik kriterleri — WCAG 2.2 A+AA (tam set)

### 1.1 Perceivable

| ID | Kriter | Seviye | Doğrulama (araç/yöntem) | Status |
|---|---|---|---|---|
| **WCAG-1.1.1** | Non-text Content (alt-text) | A | eslint-jsx-a11y `alt-text` + axe | gate-locked |
| **WCAG-1.2.1** | Audio-only & Video-only (Prerecorded) | A | manual media review | gate-locked |
| **WCAG-1.2.2** | Captions (Prerecorded) | A | manual + media pipeline | gate-locked |
| **WCAG-1.2.3** | Audio Description or Media Alternative (Prerecorded) | A | manual media review | gate-locked |
| **WCAG-1.2.4** | Captions (Live) | AA | manual live-caption test | gate-locked |
| **WCAG-1.2.5** | Audio Description (Prerecorded) | AA | manual media review | gate-locked |
| **WCAG-1.3.1** | Info & Relationships (semantik yapı) | A | axe + manual SR | gate-locked |
| **WCAG-1.3.2** | Meaningful Sequence | A | axe + manual SR | gate-locked |
| **WCAG-1.3.3** | Sensory Characteristics | A | manual review | gate-locked |
| **WCAG-1.3.4** | Orientation | AA | manual + responsive test | gate-locked |
| **WCAG-1.3.5** | Identify Input Purpose | AA | eslint-jsx-a11y autocomplete + axe | gate-locked |
| **WCAG-1.4.1** | Use of Color (renk-tek-başına YASAK) | A | manual + design review | gate-locked |
| **WCAG-1.4.2** | Audio Control | A | manual media review | gate-locked |
| **WCAG-1.4.3** | Contrast (Minimum) 4.5:1 | AA | design-token contrast + axe | gate-locked |
| **WCAG-1.4.4** | Resize Text (200%) | AA | manual zoom test | gate-locked |
| **WCAG-1.4.5** | Images of Text | AA | manual + design review | gate-locked |
| **WCAG-1.4.10** | Reflow (320px) | AA | manual responsive test | gate-locked |
| **WCAG-1.4.11** | Non-text Contrast 3:1 (UI bileşen) | AA | design-token + axe | gate-locked |
| **WCAG-1.4.12** | Text Spacing | AA | manual + axe | gate-locked |
| **WCAG-1.4.13** | Content on Hover or Focus | AA | manual keyboard/pointer test | gate-locked |

### 1.2 Operable

| ID | Kriter | Seviye | Doğrulama (araç/yöntem) | Status |
|---|---|---|---|---|
| **WCAG-2.1.1** | Keyboard (tam klavye erişimi) | A | axe + manual keyboard | gate-locked |
| **WCAG-2.1.2** | No Keyboard Trap | A | manual keyboard | gate-locked |
| **WCAG-2.1.4** | Character Key Shortcuts | A | manual review | gate-locked |
| **WCAG-2.2.1** | Timing Adjustable | A | manual session/timeout test | gate-locked |
| **WCAG-2.2.2** | Pause, Stop, Hide | A | manual review | gate-locked |
| **WCAG-2.3.1** | Three Flashes or Below Threshold | A | manual review | gate-locked |
| **WCAG-2.4.1** | Bypass Blocks (skip-link) | A | axe + manual | gate-locked |
| **WCAG-2.4.2** | Page Titled | A | axe + manual | gate-locked |
| **WCAG-2.4.3** | Focus Order | A | manual keyboard + axe | gate-locked |
| **WCAG-2.4.4** | Link Purpose (In Context) | A | eslint-jsx-a11y + axe | gate-locked |
| **WCAG-2.4.5** | Multiple Ways | AA | manual review | gate-locked |
| **WCAG-2.4.6** | Headings and Labels | AA | axe + manual SR | gate-locked |
| **WCAG-2.4.7** | Focus Visible | AA | eslint-jsx-a11y + axe | gate-locked |
| **WCAG-2.4.11** | Focus Not Obscured (Minimum) — 2.2 yeni | AA | manual + visual-regression | gate-locked |
| **WCAG-2.5.1** | Pointer Gestures | A | manual pointer test | gate-locked |
| **WCAG-2.5.2** | Pointer Cancellation | A | manual pointer test | gate-locked |
| **WCAG-2.5.3** | Label in Name | A | axe + manual SR | gate-locked |
| **WCAG-2.5.4** | Motion Actuation | A | manual review | gate-locked |
| **WCAG-2.5.7** | Dragging Movements — 2.2 yeni | AA | manual pointer test | gate-locked |
| **WCAG-2.5.8** | Target Size (Minimum) ≥24px — 2.2 yeni | AA | target-size token + axe | gate-locked |

### 1.3 Understandable

| ID | Kriter | Seviye | Doğrulama (araç/yöntem) | Status |
|---|---|---|---|---|
| **WCAG-3.1.1** | Language of Page (`lang`) | A | axe + manual | gate-locked |
| **WCAG-3.1.2** | Language of Parts | AA | axe + manual | gate-locked |
| **WCAG-3.2.1** | On Focus | A | manual keyboard test | gate-locked |
| **WCAG-3.2.2** | On Input | A | manual form test | gate-locked |
| **WCAG-3.2.3** | Consistent Navigation | AA | manual + design-system | gate-locked |
| **WCAG-3.2.4** | Consistent Identification | AA | manual + design-system | gate-locked |
| **WCAG-3.2.6** | Consistent Help — 2.2 yeni | A | manual + design-system | gate-locked |
| **WCAG-3.3.1** | Error Identification | A | axe + manual form test | gate-locked |
| **WCAG-3.3.2** | Labels or Instructions | A | eslint-jsx-a11y `label-has-associated-control` + axe | gate-locked |
| **WCAG-3.3.3** | Error Suggestion | AA | manual form test | gate-locked |
| **WCAG-3.3.4** | Error Prevention (Legal, Financial, Data) | AA | manual flow test | gate-locked |
| **WCAG-3.3.7** | Redundant Entry — 2.2 yeni | A | manual flow test | gate-locked |
| **WCAG-3.3.8** | Accessible Authentication (Minimum) — 2.2 yeni | AA | manual auth flow (no cognitive-only) | gate-locked |

### 1.4 Robust

| ID | Kriter | Seviye | Doğrulama (araç/yöntem) | Status |
|---|---|---|---|---|
| **WCAG-4.1.2** | Name, Role, Value | A | axe + SR | gate-locked |
| **WCAG-4.1.3** | Status Messages | AA | axe live-region test | gate-locked |

> Not: `4.1.1 Parsing` WCAG 2.2'de **obsolete/removed** → bilinçli olarak dahil edilmez. EN 301 549 bir WCAG 2.1-mapping isterse ayrı compatibility notu eklenir.

## 2. i18n kriterleri (Türkçe-first)

| ID | Kriter | Seviye | Doğrulama (araç/yöntem) | Status |
|---|---|---|---|---|
| **I18N-1** | Varsayılan locale tr-TR | n/a | config assertion (P1) | design |
| **I18N-2** | Dışsallaştırılmış string (hardcoded UI metni YASAK) | n/a | i18n-extract + eslint no-literal-string | gate-locked |
| **I18N-3** | ICU message-format + çoğulluk | n/a | format doğrulama (P1) | gate-locked |
| **I18N-4** | Locale-duyarlı sayı/decimal/percent + para `Intl.NumberFormat('tr-TR',{currency:'TRY'})` (literal ₺ + manuel format YASAK) | n/a | Intl format test (P1) | gate-locked |
| **I18N-5** | Cümle için string-concatenation YASAK | n/a | lint + review | gate-locked |
| **I18N-6** | Çeviri-anahtarı bütünlüğü (eksik/orphan key YOK) | n/a | i18n key-extract diff (CI, P1) | gate-locked |
| **I18N-7** | Yön-bağımsız layout (logical CSS; RTL-ready) | n/a | lint logical-props + review | gate-locked |
| **I18N-8** | `lang`/content-language doğru | n/a | axe + manual | gate-locked |
| **I18N-9** | Türkçe case/collation: `toLocale*('tr-TR')` + `Intl.Collator('tr-TR')` (I/İ/ı/i bug guard) | n/a | unit test (P1) | gate-locked |
| **I18N-10** | Tarih/saat timezone politikası (UI display `Europe/Istanbul` vs tenant policy ayrımı) | n/a | Intl.DateTimeFormat test (P1) | gate-locked |

## 3. Doğrulama (drift-guard `scripts/check-a11y-standard.mjs`)

- **Tam-set kontrolü:** WCAG 2.2 A+AA **required ID→seviye haritası** (55 kriter) script'te sabit; registry'de her required ID **birebir** bulunmalı + **seviye eşleşmeli**; **eksik / fazla / bilinmeyen** WCAG ID (örn. AAA `2.4.13`) veya **yanlış seviye** (örn. `3.3.8`=A) → exit 1.
- i18n: required `I18N-1..10` hepsi bulunmalı.
- Her satır: boş-olmayan doğrulama + geçerli status.
- `enforced (CI)` iddiası → doğrulama hücresinde **impl/test path prefix'i** (`scripts/`·`.github/workflows/`·`web/`·`mobile/`·`desktop/`·`packages/shared/`) + repo'da mevcut; aksi halde over-claim → exit 1 (yalnız standard doc'a self-referans enforced sayılmaz).

## 4. Bağlantı
- [[ATS-0011]] kararı · [[ATS-0001]] UI primitives boundary · [[ATS-0008]] web/mobile/desktop · ürün Türkçe-first direği.
