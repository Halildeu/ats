# Accessibility (WCAG 2.2 AA) + i18n Standard (canonical registry)

> ATS-0011 kanonik kriter kaydı. **Machine-checked** (`scripts/check-a11y-standard.mjs`, CI job `a11y-standard-guard`).
> Kapsam: tüm P1 UI yüzeyleri — `web/` · `mobile/` · `desktop/` · `packages/shared` UI primitives.
> Statü: `enforced (CI)` · `gate-locked` · `design`. Gerçek UI yok (P1 gated) → a11y/i18n satırları bugün `gate-locked`/`design`; enforcement (axe/eslint/i18n-extract) P1 ile aktif. Yalnız bu registry'nin **bütünlüğü** `enforced (CI)`.

## 0. Statü & seviye sözlüğü

- **Seviye:** `A` · `AA` (WCAG) · `n/a` (i18n/proje-kuralı).
- **Status:** `enforced (CI)` (bugün CI guard ile, repo path'e bağlı) · `gate-locked` (tasarım kabul, kodu P1 UI'a bağlı) · `design` (karar verildi, kod öncesi).

## 1. Erişilebilirlik kriterleri (WCAG 2.2)

| ID | Kriter | Seviye | Doğrulama (araç/yöntem) | Status |
|---|---|---|---|---|
| **WCAG-1.1.1** | Non-text Content (alt-text) | A | eslint-jsx-a11y `alt-text` + axe | gate-locked |
| **WCAG-1.3.1** | Info & Relationships (semantik yapı) | A | axe + manual SR | gate-locked |
| **WCAG-1.4.3** | Contrast (Minimum) 4.5:1 | AA | design-token contrast + axe | gate-locked |
| **WCAG-1.4.11** | Non-text Contrast 3:1 (UI bileşen) | AA | design-token + axe | gate-locked |
| **WCAG-2.1.1** | Keyboard (tam klavye erişimi) | A | axe + manual keyboard | gate-locked |
| **WCAG-2.4.3** | Focus Order | A | manual keyboard + axe | gate-locked |
| **WCAG-2.4.7** | Focus Visible | AA | eslint-jsx-a11y + axe | gate-locked |
| **WCAG-2.4.11** | Focus Not Obscured (Minimum) — 2.2 yeni | AA | manual + visual-regression | gate-locked |
| **WCAG-2.5.8** | Target Size (Minimum) ≥24px — 2.2 yeni | AA | target-size token + axe | gate-locked |
| **WCAG-3.2.6** | Consistent Help — 2.2 yeni | A | manual + design-system | gate-locked |
| **WCAG-3.3.1** | Error Identification | A | axe + manual form test | gate-locked |
| **WCAG-3.3.2** | Labels or Instructions | A | eslint-jsx-a11y `label-has-associated-control` + axe | gate-locked |
| **WCAG-3.3.7** | Redundant Entry — 2.2 yeni | A | manual flow test | gate-locked |
| **WCAG-3.3.8** | Accessible Authentication (Minimum) — 2.2 yeni | AA | manual auth flow (no cognitive-only) | gate-locked |
| **WCAG-4.1.2** | Name, Role, Value | A | axe + SR | gate-locked |
| **WCAG-4.1.3** | Status Messages | AA | axe live-region test | gate-locked |

## 2. i18n kriterleri (Türkçe-first)

| ID | Kriter | Seviye | Doğrulama (araç/yöntem) | Status |
|---|---|---|---|---|
| **I18N-1** | Varsayılan locale tr-TR | n/a | config assertion (P1) | design |
| **I18N-2** | Dışsallaştırılmış string (hardcoded UI metni YASAK) | n/a | i18n-extract + eslint no-literal-string | gate-locked |
| **I18N-3** | ICU message-format + çoğulluk | n/a | format doğrulama (P1) | gate-locked |
| **I18N-4** | Locale-duyarlı tarih/sayı/para (₺) | n/a | Intl format test (P1) | gate-locked |
| **I18N-5** | Cümle için string-concatenation YASAK | n/a | lint + review | gate-locked |
| **I18N-6** | Çeviri-anahtarı bütünlüğü (eksik/orphan key YOK) | n/a | i18n key-extract diff (CI, P1) | gate-locked |
| **I18N-7** | Yön-bağımsız layout (logical CSS; RTL-ready) | n/a | lint logical-props + review | gate-locked |
| **I18N-8** | `lang`/content-language doğru | n/a | axe + manual | gate-locked |

## 3. Doğrulama (drift-guard `scripts/check-a11y-standard.mjs`)

- §1/§2 her kriter satırı: ID regex (`WCAG-x.y.z` veya `I18N-n`) + tekillik + geçerli seviye (`A`/`AA`/`n/a`) + boş-olmayan doğrulama + geçerli status.
- WCAG 2.2 yeni kriterlerin (2.4.11 / 2.5.8 / 3.2.6 / 3.3.7 / 3.3.8) **silinmemesi** (sentinel — 2.2 → 2.1 geriye düşüş guard'ı).
- `enforced (CI)` iddiası → doğrulama hücresinde mevcut repo path zorunlu (UI gelince; over-claim guard).
- Minimum kriter eşiği.

## 4. Bağlantı
- [[ATS-0011]] kararı · [[ATS-0001]] UI primitives boundary · [[ATS-0008]] web/mobile/desktop · ürün Türkçe-first direği.
