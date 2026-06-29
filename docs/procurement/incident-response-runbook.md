# Incident Response Runbook — TASLAK

> ⚠️ TASLAK iskelet — `[OWNER/INFOSEC/LEGAL DOLDURUR]`. Yetkili onay + jurisdiction bildirim süreleri zorunlu.

## 1. Kapsam & roller
- Olay türleri: veri ihlali (cross-tenant/PII leak), kimlik/erişim, AI-output leak, supply-chain, kullanılabilirlik.
- Roller `[DOLDUR]`: Incident Lead · InfoSec · DPO/Legal · Owner · iletişim.

## 2. Akış
1. **Tespit** (alert/secret-scan/audit anomali/bildirim) → triage + severity `[DOLDUR matris]`.
2. **Kontrol altına al** (containment): etkilenen tenant/anahtar izole; gerekirse erişim revoke; break-glass kayıt.
3. **Kök neden** + etki kapsamı (hangi tenant/ilgili kişi/veri).
4. **Bildirim:** controller'a tespitten `[DOLDUR, ör. 24/72h]`; gerekirse otorite (KVKK Kurulu) + ilgili kişi `[jurisdiction süresi]`.
5. **İyileştirme** + **post-mortem** (blameless) + kalıcı kontrol.

## 3. Kanıt (audit)
- WORM audit + model/version + human-oversight log → "olay olursa ne gösteriyoruz" (procurement sorusu).
- Audit-evidence export hazır.

## 4. İletişim şablonları `[OWNER/LEGAL DOLDURUR]`
- Controller bildirim · ilgili kişi bildirim · otorite bildirim taslakları.

> `[DOLDUR]` tüm süreler/roller jurisdiction + partner sözleşmesine göre. ATS-0007 referans.
