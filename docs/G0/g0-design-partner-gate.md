# G0 — Design-Partner Gate (çerçeve + GO/NO-GO kuralı)

> Faz 25 / ATS — Interview-Evidence add-on. Kaynak: [00-ATS-MASTER-PLAN v3.0](../00-ATS-MASTER-PLAN.md) §6 + M6 + 3-AI mutabakat [pingpong-3ai/05](../pingpong-3ai/05-consensus-draft.md). Board: [Halildeu/ats #1](https://github.com/Halildeu/ats/issues/1).
>
> **Bu, P1 kodu yazılmadan ÖNCE geçilmesi gereken kapı.** Çıktısı: GO/NO-GO + tek-cümleye kilitli ICP + ≥3 yazılı LOI. Bu kapı bir "yol haritası adımı" değil, bağımsız bir **satış/validasyon projesi** (owner işi).

---

## 0. Neden bu kapı var (en tehlikeli varsayım)

3 AI'nın da işaret ettiği tek en tehlikeli varsayım:

> *"Regüle kurumlar, mevcut ATS'lerinin üstüne mülakat kaydı işleyen, AI destekli, citation-backed bir add-on satın almaya hazır; ve bunun için kayıt-izni + entegrasyon + procurement bariyerlerini aşmaya istekli."*

Bu **migren mi, hafif baş ağrısı mı?** Kurum manuel süreçle denetimden geçebiliyorsa ürün "nice-to-have" kalır, bütçe önceliği olmaz. G0 = bu varsayımı **para/LOI ile** test etmek. Teknik yapabilirliği değil, **satın alınabilirliği** kanıtlar.

---

## 1. Funnel (hedef akış)

```
5-10 nitelikli regüle kurum (hedef liste)
        │  outreach (buyer-layer'a göre mesaj)
        ▼
  Discovery call (ICP soru-seti → g0-icp-questionnaire.md)
        │  qualify/disqualify skoru
        ▼
  Nitelikli prospect (≥ skor eşiği)
        │  LOI sun (g0-loi-template.md)
        ▼
  ≥3 yazılı LOI (bütçe + metrik + entegrasyon taahhüdü)
        │
        ▼
   ★ GO/NO-GO kararı (M6 7-kriter)
```

Dönüşüm gerçekçi beklenti: 10 hedef → ~5-6 discovery → ~3-4 nitelikli → **≥3 LOI** = GO.

---

## 2. GO/NO-GO kapısı — M6 7 kriter (geçer-bar)

GO demek için **7'sinin de** sağlanması gerekir. Hiçbiri "kısmen" sayılmaz.

| # | Kriter | Geçer eşiği (kanıt) |
|---|---|---|
| 1 | **ICP tek cümleye kilitli** | Yazılı tek cümle; ilk 90 gün bunun dışına çıkılmayacak. (örn. "TR'de 500+ çalışan, MS365 kullanan, yılda 1000+ beyaz-yaka mülakat yapan, regüle sektör — banka/sigorta/holding.") |
| 2 | **≥3 yazılı LOI / paid-pilot niyeti** | **Economic-buyer (bütçe sahibi) imzalı** LOI: kapsam(X) + ATS/entegrasyon(Y) + **min pilot bedeli eşiği + procurement/ödeme adımı + karar tarihi** (Z) + süre(N) + ölçülebilir başarı metriği + teknik-işbirliği taahhüdü + **"başarı→sonraki ticari adım" maddesi**. ≥3 LOI'nin **≥2'si non-friendly kurum (warm-network değil) + ≥2'si ücretli-pilot/procurement-tarihli**. "İlgileniriz" / temsili-bedel / yalnız-operational-imza GO DEĞİL. |
| 3 | **İlk ATS entegrasyon yolu doğrulanmış** | **LOI beyanından AYRI kanıt:** müşteri IT/teknik temasıyla ≥30 dk entegrasyon notu (temiz-API/marketplace teyidi VEYA kapalı-ATS için export/secure-link/email/webhook tabanının IT'since kabulü). Belirsiz entegrasyonla başlanmaz. |
| 4 | **Kayıt izni + hukuki uygulanabilirlik** | **LOI beyanından AYRI:** ≥2 kurumda DPO/Legal'den **yazılı** izin/şart listesi + **uygulanabilir aday-consent akışı** teyidi (sadece "yapılabilir" sözü yetmez). |
| 5 | **P1 scope dondurulmuş + yasak liste** | Yazılı P1 kapsamı (M3) + açık yasak liste (full-ATS/çoklu-ATS/HRIS/on-prem-SKU/bias-dashboard/agentic/SOC2-ISO). |
| 6 | **Teknik kalite baseline ölçülmüş** | Gerçek Türkçe panel-mülakat fixture setinde sayısal: WER (STT), DER (diarization), citation precision/recall, hallucination fail-closed oranı. |
| 7 | **Execution sistemi yazılı** | senior buddy (8-10h/hafta) + acceptance contract + golden Türkçe fixture + tek-hat + scope kill rule + owner QA. |

> **Agent-completable ŞİMDİ:** kriter 1 (taslak ICP), 5 (P1 scope freeze — M3 hazır), 7 (execution sistemi). **Owner gerçek-dünya işi:** 2 (LOI), 3 (ATS teyidi), 4 (DPO teyidi). **Karma:** 6 (fixture lazım → owner/Zeynep gerçek kayıt sağlar, agent ölçer).

---

## 3. Buyer-layer haritası (kiminle, hangi mesaj)

Tek "alıcı" yok — katmanlı. Satış kapısını **Operational** açar, **Veto** durdurur, **Economic** öder.

| Katman | Rol | Motivasyon / mesaj |
|---|---|---|
| **User** | Recruiter, hiring manager, interviewer | "Mülakat değerlendirmesi 48 saatten 15 dk'ya; scorecard'ı tutarlı doldur." |
| **Operational owner** | TA / HR (İK) — *satış kapısını açar* | "Yapılandırılmış mülakat disiplini + tutarlı kanıt; recruiter yükü azalır." |
| **Veto / sponsor** | Legal, Compliance, InfoSec, **DPO** | "Kayıt izni + KVKK + EU AI Act + audit-export; dava/ceza riskini azaltır." |
| **Economic buyer** | CHRO, COO, CFO, BU lideri | "Denetimden geç, riski yönet, ölçülebilir ROI." |

Mesaj **"AI notetaker"** OLMAMALI → **"regüle kurumlar için denetlenebilir mülakat kanıt dosyası."**

---

## 4. Süreç adımları

1. **Hedef liste (5-10):** ICP hipotezine uyan regüle kurumlar (banka/sigorta/holding/kamu-tedarikçi/sağlık). Sıcak bağlantı > soğuk.
2. **Outreach:** Operational owner (TA/HR) + paralel Veto (Compliance/DPO) köprüsü. Mesaj = §3.
3. **Discovery call:** `g0-icp-questionnaire.md` ile yapılandırılmış görüşme. Notlar prospect tracker'a.
4. **Qualify:** Soru-seti skoru → eşik üstü = nitelikli.
5. **LOI:** `g0-loi-template.md` sun. Hedef: ≥3 imzalı.
6. **GO/NO-GO:** §2 7-kriter checklist. Hepsi yeşil → GO → P1 başlar.

---

## 5. Anti-patterns (GO sanılmaması gerekenler)

- ❌ "İlgileniriz / harika fikir / haber verin" → sinyal, GO değil.
- ❌ Bütçe sahibi belirsiz ("bir bakarız") → ekonomik alıcı yok.
- ❌ "Kayıt iznini sonra hallederiz" → kriter 4 yok, pilot sahici değil.
- ❌ "Tüm ATS'lerle çalışsın" beklentisi → tek-ATS'e kilitle.
- ❌ Ücretsiz POC isteyip taahhüt vermeyen → LOI'siz custom iş YASAK (scope kill rule).
- ❌ ICP'yi genişletmek ("şu sektör de olur") → tek cümle, 90 gün.
- ❌ **Temsili/düşük bedelli LOI veya yalnız operational-sponsor imzası** → ekonomik niyet kanıtı değil (economic-buyer imzası + min bedel + karar tarihi şart).
- ❌ **ATS yolu / kayıt-izni yalnız LOI beyanında** → bağımsız kanıt yok (teknik not + DPO yazılı izin ayrı gerekir).
- ❌ **Pilot başarı sonrası ticari adım tanımsız** ("güzelmiş, sonra bakarız") → LOI'de conversion maddesi (paid extension/procurement tarihi) şart.
- ❌ **Uygulanabilir aday-consent akışı yok** → ürün ölü doğar; sert eleme.
- ❌ **3 LOI'nin hepsi warm-network** → ≥2 non-friendly kurum şart (nezaket ≠ talep).

---

## 6. Prospect tracker (doldurulacak — owner)

| # | Kurum (kod) | Sektör | Çalışan / yıllık mülakat | Mevcut ATS | MS365? | Buyer (Operational/Economic/DPO) | Kayıt izni (DPO) | Pain (migren/baş-ağrısı) | Entegrasyon yolu | Aşama | LOI? |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | | | discovery | ☐ |
| 2 | | | | | | | | | | | ☐ |
| 3 | | | | | | | | | | | ☐ |
| 4 | | | | | | | | | | | ☐ |
| 5 | | | | | | | | | | | ☐ |
| 6-10 | | | | | | | | | | | ☐ |

Aşama: `lead → discovery → qualified → LOI-sent → LOI-signed → GO` veya `disqualified (neden)`.

---

## 7. Karar kuralı (tek cümle)

**G0 = GO** yalnız: tek-cümle ICP kilitli + ≥3 yazılı LOI (bütçe+metrik+entegrasyon-taahhüt) + ATS yolu doğrulanmış + ≥2 kurum DPO kayıt-izni teyidi + P1 scope dondurulmuş + teknik baseline Türkçe fixture'da sayısal + execution sistemi yazılı. Aksi halde **NO-GO** veya **bekle** — P1 kodu başlamaz.
