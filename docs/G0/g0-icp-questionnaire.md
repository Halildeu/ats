# G0 — ICP Discovery & Qualification Soru-Seti

> Discovery call'da kullanılır. Amaç: prospect'i **nitelendir/ele** + M6 kriterlerine kanıt topla + tek-cümle ICP'yi netleştir. Her blokta **🟢 nitelik / 🔴 eleme** sinyalleri var. Skorlama §11'de.
>
> Kullanım: konuşmayı yönlendir, cevapları [prospect tracker](./g0-design-partner-gate.md#6-prospect-tracker-doldurulacak--owner)'a yaz. "Satış sunumu" değil; **müşterinin acısını + satın alma gerçeğini** ölçen tanı görüşmesi.

---

## ICP hipotezi (kilitlenecek — kriter 1)

> Çalışma hipotezi: **"Türkiye'de 500+ çalışanlı, Microsoft 365 kullanan, yılda 1.000+ beyaz-yaka mülakat yapan, regüle sektörde (banka/sigorta/holding) faaliyet gösteren, mevcut ATS'inden memnun ama mülakat karar kanıtı / denetim problemi yaşayan kurum."**

G0 sonunda bu cümle gerçek verilerle **kilitlenir** (daralt veya kaydır, ama tek cümle kalsın).

---

## Blok 1 — Kurum profili
- Sektör? Çalışan sayısı? Regülasyon rejimi (BDDK/SPK/sağlık/kamu-tedarik)?
- Lokasyon / veri-residency beklentisi var mı?
- 🟢 regüle + 500+ + TR-residency hassas · 🔴 küçük KOBİ, regülasyon-dışı, residency umursamıyor

## Blok 2 — Mevcut ATS (kriter 3 girdisi)
- Hangi ATS kullanılıyor? (Greenhouse / Workday / SAP SF / Oracle / Kariyer.net 360 / Kolay İK / Logo / kendi sistemi?)
- Memnuniyet? Değiştirme niyeti var mı? (varsa biz add-on değil replacement'a düşeriz — dikkat)
- ATS'in API / marketplace / webhook desteği var mı (biliniyorsa)?
- 🟢 yerleşik ATS + memnun + API'li · 🔴 ATS yok / değiştirmek istiyor / tamamen kapalı sistem

## Blok 3 — Mülakat hacmi & roller
- Yılda kaç mülakat? Hangi roller (beyaz-yaka/teknik/yönetici)? Panel mi (3+ kişi)?
- Mülakatlar nerede yapılıyor? (MS Teams / yüz yüze / telefon / Zoom?)
- 🟢 1000+/yıl, Teams, panel · 🔴 yılda <100, kayıt-dışı yüz yüze, ad-hoc

## Blok 4 — Acı: "kanıt / denetim" problemi (migren testi — en kritik)
- Bir işe-alım kararını **6 ay sonra denetçi/hukuk sorsa**, gerekçeyi nasıl gösteriyorsunuz bugün?
- Hiç "neden bu adayı aldık/almadık" sorgusu / itiraz / dava / denetim yaşadınız mı?
- Bu sorunu çözmek için **şu an** ne yapıyorsunuz (manuel not, e-posta, hiçbir şey)?
- Bu bir **öncelik mi**, yoksa "olsa iyi olur" mu? Bunun için ayrılmış bütçe/girişim var mı?
- 🟢 gerçek denetim/itiraz acısı + mevcut çözüm zayıf + bütçe niyeti (= migren) · 🔴 "idare ediyoruz", öncelik değil (= baş ağrısı → muhtemel NO-GO)
- ⚠️ **Migren yeşili (2 puan) için ≥2 SOMUT kanıt zorunlu** (söylem yetmez — "evet acı var" tek başına = sarı/1): (a) son 12 ayda gerçek olay/itiraz/dava/denetim (b) kişi-saat veya ₺ maliyet (c) audit/yasal deadline (d) mevcut manuel dosya örneği (e) ayrılmış bütçe satırı. En az 2'si gösterilmeli.

## Blok 5 — Kayıt izni & hukuk (kriter 4 — pilot ön-şartı)
- Mülakat kaydı (ses/video) **hukuken/politika olarak** mümkün mü? Daha önce yapıldı mı?
- Aday + interviewer **aydınlatma/rıza** süreciniz nasıl işler? DPO kim?
- KVKK/saklama/silme politikanız mülakat verisini nasıl ele alır?
- 🟢 kayıt mümkün + DPO erişilebilir + rıza akışı kurulabilir · 🔴 kayıt yasak/imkansız, DPO "olmaz" diyor

## Blok 6 — Adoption gerçeği (3-AI kör nokta — kritik)
- Adaylar kaydı kabul eder mi? Reddederse süreç ne olur?
- Interviewer'lar kaydedilmeyi/AI-analizini kabul eder mi (sendika/kültür/direnç)?
- 🟢 kayıt kültürel kabul görür, interviewer açık · 🔴 güçlü direnç, en iyi adaylar reddeder

## Blok 7 — Buyer haritası (kriter 2 girdisi)
- Bu projeyi kim **sahiplenir** (Operational)? Kim **veto** edebilir (Legal/InfoSec/DPO)?
- Bütçeyi kim onaylar (Economic)? Pilotu kim **imzalar**?
- 🟢 net isimler, imza yetkisi belli · 🔴 "komite bakar", kimse sahiplenmiyor

## Blok 8 — Entegrasyon beklentisi (kriter 3)
- Çıktı nerede yaşamalı? (ATS içinde mi, ayrı rapor/PDF yeterli mi, secure link/e-posta?)
- "ATS'imde göremezsem kullanmam" mı, "denetim dosyası export yeter" mi?
- 🟢 export/secure-link kabul VEYA tek-ATS'e net write-back yolu · 🔴 "tüm ATS'lerle derin entegre" şartı

## Blok 9 — Fiyat & ticari (kriter 2)
- Böyle bir çözüme bütçe bandı? Seat/mülakat-başı mı, kurumsal lisans mı tercih?
- TL + e-Fatura gerekli mi? Satın alma süreci ne kadar sürer (procurement)?
- 🟢 bütçe bandı net + makul procurement · 🔴 "ücretsiz olmalı", 12 ay procurement

## Blok 10 — Pilot taahhüdü (kriter 2 — LOI köprüsü)
- 8-12 haftalık ücretli pilot'a **bütçe + sponsor + başarı metriği** ile girer misiniz?
- Pilot başarı tanımınız ne olurdu? (örn. "değerlendirme süresi −%X", "audit-request'e 1 günde cevap", "scorecard adoption %80")
- Bir **LOI** imzalamaya açık mısınız?
- 🟢 evet + metrik + imza niyeti · 🔴 "önce ücretsiz görelim", taahhüt yok

---

## 11. Skorlama rubric

Her blok için: 🟢 = 2 · 🟡 (kısmi) = 1 · 🔴 = 0. Maks 20.

| Toplam | Yorum |
|---|---|
| **16-20** | Güçlü nitelikli → LOI sun (öncelik) |
| **11-15** | Nitelikli ama boşluklar → eksik kriteri (kayıt-izni/buyer/bütçe) kapat, tekrar değerlendir |
| **≤10** | Eleme — neden kaydet (genelde Blok 4 "baş ağrısı" veya Blok 5 "kayıt yasak") |

**Sert eleme (skordan bağımsız NO):** Blok 5 kayıt hukuken imkansız **VEYA** Blok 4 hiç somut-kanıtlı acı yok (söylem-acı sayılmaz) **VEYA** Blok 6 **uygulanabilir aday-consent akışı yok / güçlü interviewer-aday reddi** (ürün ölü doğar) **VEYA** Blok 7 hiç economic-buyer/imza yetkisi yok → bu prospect GO üretmez.

---

## 12. Görüşme sonu — owner notu
- Tek-cümle ICP'yi bu görüşme **doğruladı mı / daralttı mı / kaydırdı mı?**
- En güçlü 3 prospect kim, LOI sırası ne?
- Hangi M6 kriteri hâlâ kanıtsız?
