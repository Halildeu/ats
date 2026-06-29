# ATS-0011 — Accessibility (WCAG 2.2 AA) + i18n (Türkçe-first) Standard

- **Durum:** Önerildi (cross-AI review bekliyor)
- **Tarih:** 2026-06-29
- **Bağlam kaynağı:** Gate-safe hardening backlog #5 · ürün direği: Türkçe-first + regüle kurum erişilebilirlik beklentisi · [[ATS-0001]] boundary (UI primitives) · [[ATS-0008]] system architecture frame (web/mobile/desktop)
- **Karar tipi:** Frontend kalite standardı (gate-safe; enforcement P1)

## Bağlam

Ürün regüle Türk kurumlarına satılır; mülakat-kanıt UI'ı (aday + İK + denetçi) **Türkçe-first** ve **erişilebilir** olmalı. Kamu/regüle alımlarında WCAG uyumu giderek bir **procurement filtresidir** (EU EN 301 549 / KVKK-bitişik erişilebilirlik beklentisi). Bu standart **P1 UI başlamadan önce** sabitlenirse, UI kodu gün-1 doğru yazılır; sonradan retrofit pahalı + eksik kalır. Standart bugün **bağlayıcı tasarım**; enforcement tooling (axe/eslint/i18n-extract) **gerçek UI ile (P1) gelir**.

## Karar

**Tüm P1 UI yüzeyleri (web + mobile + desktop) WCAG 2.2 Level AA + Türkçe-first i18n standardına uyar.** Kanonik kriter kaydı: [docs/frontend/a11y-i18n-standard.md](../frontend/a11y-i18n-standard.md) (machine-checked: `scripts/check-a11y-standard.mjs`, CI job `a11y-standard-guard`).

### 1. Erişilebilirlik (WCAG 2.2 A+AA — bağlayıcı bar)
WCAG 2.2 **A + AA başarı kriterlerinin TAMAMI** (55 kriter, registry'de tam liste; AAA hariç bilinçli sınır; `4.1.1 Parsing` 2.2'de obsolete → hariç). 2.2'nin yeni kriterleri dahil: **2.4.11 Focus Not Obscured (AA)**, **2.5.7 Dragging Movements (AA)**, **2.5.8 Target Size ≥24px (AA)**, **3.2.6 Consistent Help (A)**, **3.3.7 Redundant Entry (A)**, **3.3.8 Accessible Authentication (AA)**. Klavye-tam-erişim, görünür focus, 4.5:1 metin / 3:1 UI kontrast, semantic rol/ad/değer, status message duyurusu, renk-tek-başına-anlam YASAK. Drift-guard tam-set + seviye eşleşmesini makine-doğrular (eksik/fazla/yanlış-seviye reddedilir).

### 2. i18n (Türkçe-first)
Varsayılan locale **tr-TR**; tüm UI metni **dışsallaştırılmış** (hardcoded string YASAK); ICU message-format + **çoğulluk**; **locale-duyarlı** tarih/sayı/para (`Intl.NumberFormat('tr-TR',{currency:'TRY'})`, literal ₺ YASAK); cümle için **string-concatenation YASAK**; çeviri-anahtarı bütünlüğü (eksik/orphan key YOK); **yön-bağımsız** layout (logical CSS; RTL-ready, zorunlu değil); `lang`/content-language doğru; **Türkçe case/collation** (`toLocale*('tr-TR')` + `Intl.Collator('tr-TR')` — I/İ/ı/i arama-filtre bug guard); **timezone politikası** (UI display `Europe/Istanbul` vs tenant policy ayrımı).

### 3. Enforcement planı (gate-locked → P1 UI ile aktif)
- `eslint-plugin-jsx-a11y` (statik) + **axe-core** (jest-axe / @axe-core/playwright, runtime) CI job.
- i18n key-extraction lint (missing/orphan key fail) + format/ICU doğrulama.
- Design-system **kontrast token** + target-size token kontrolü.
- **Bugün enforced (CI):** yalnız kriter-registry bütünlüğü (`a11y-standard-guard`) — registry sessizce zayıflayamaz; gerçek UI testleri P1.

## Sonuçlar

**Olumlu:** procurement-aligned erişilebilirlik/i18n standardı (uyumun **kanıtı** P1 axe/eslint testleriyle gelir); Türkçe-first gün-1 doğru; retrofit maliyeti yok; UI primitives [[ATS-0001]] boundary'siyle tutarlı kurulur.
**Olumsuz:** P1 UI hızını bir miktar yavaşlatır (a11y/i18n disiplini); axe/eslint CI bütçesi; design-system kontrast/target token işi gerektirir.

## Gate disiplini

Standart + registry + drift-guard **gate-safe** (spec + makine-doğrulanan kriter kaydı). Gerçek UI'ın bu kriterleri **karşıladığının kanıtı** (axe pass, eslint-a11y temiz, i18n key-integrity) = **P1, G0=GO sonrası**. Registry satırları `gate-locked`/`design`; yalnız registry-bütünlüğü `enforced (CI)`. "a11y yapıldı" DENMEZ (No Fake Work) — UI yok.

## Değerlendirilen alternatifler

- **(A) a11y/i18n'i UI yazılırken düşün** — RED: retrofit pahalı + eksik; procurement filtresine yakalanır.
- **(B) Sadece i18n (a11y sonra)** — RED: regüle/kamu erişilebilirlik beklentisi baştan gerekir.
- **(C) WCAG 2.2 AA + Türkçe-first standardı gün-1 sabitle, enforcement P1 (seçilen).**

## Bağlantı
- Kanonik registry: [docs/frontend/a11y-i18n-standard.md](../frontend/a11y-i18n-standard.md) · [[ATS-0001]] boundary · [[ATS-0008]] architecture (web/mobile/desktop) · ürün Türkçe-first direği.
