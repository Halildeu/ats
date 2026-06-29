# Data Processing Agreement (DPA) — TASLAK

> ⚠️ TASLAK iskelet — `[OWNER/LEGAL DOLDURUR]`. Hukuki tavsiye değil; yetkili hukuk onayı zorunlu.

## 1. Taraflar
- **Veri sorumlusu (Controller):** [partner kurum] `[DOLDUR]`
- **Veri işleyen (Processor):** [şirket — ATS ürünü] `[DOLDUR]`

## 2. İşleme konusu & amaç
- Konu: mülakat ses/video kaydı + transkript + işe-alım kanıt dosyası.
- Amaç: yalnız işe-alım değerlendirmesine **kanıt üretimi** (AI kanıt çıkarır, **insan karar verir**; no-scoring/no-affect/no-auto-reject — ATS-0005).
- Süre: pilot süresi `[DOLDUR]` + saklama (bkz. retention matrisi).

## 3. Veri kategorileri & ilgili kişiler
- İlgili kişi: aday + interviewer.
- Kategoriler: ses/video, transkript, kimlik (redakte), değerlendirme notu. **Özel-nitelikli veri hedeflenmez** (geçerse minimizasyon + redaction — ATS-0003).

## 4. İşleyen yükümlülükleri
- Yalnız controller talimatıyla işleme; alt-işleyenler (subprocessors listesi) controller onayı.
- Teknik/idari tedbirler (security-posture-whitepaper): per-tenant şifreleme/KMS, RBAC, audit (WORM).
- Gizlilik + erişim sınırlama (least-privilege).
- İhlal bildirimi: tespitten sonra `[DOLDUR, ör. 24/72 saat]` içinde controller'a (incident-response-runbook).
- İlgili kişi taleplerine (DSR/erasure) destek (WORM≠deletion — ATS-0003).
- İşleme sonunda veri iade/imha + salt-key destruction (unlinkable tombstone).

## 5. Veri yeri (residency) & aktarım
- TR-residency / on-prem-uyumlu pilot deployment boundary `[DOLDUR]`. Yurtdışı aktarım `[varsa koşullar]`.

## 6. Denetim
- Controller denetim hakkı + sağlanan kanıt (audit export, model/version log).

> `[OWNER/LEGAL DOLDURUR]` tüm köşeli parantezler + jurisdiction-özel maddeler. ATS-0002/0003/0007 referans.
