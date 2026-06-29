# Mülakat Kanıt Çalışma Alanı — One-Pager (discovery leave-behind)

> G0 discovery görüşmesi sonrası bırakılacak / e-postaya eklenecek özet. Konumlama = **"regüle kurumlar için denetlenebilir mülakat kanıtı"** (AI notetaker DEĞİL). Dürüstlük notu: aşağısı **yetenek + mimari** beyanıdır; müşteri-kanıtı (ROI/metrik) **pilot ile** üretilir — overclaim yok ("dünyanın en iyisi" iddiası G0'da kullanılmaz).

---

## Sorun
Regüle kurumlarda işe-alım kararları **denetlenebilir kanıta** dayanmak zorunda (KVKK, EU AI Act, iç denetim, dava riski). Ama bugün mülakat değerlendirmesi çoğunlukla dağınık notlar/hafıza üzerinde: "6 ay sonra bu kararı neden verdik?" sorusuna tutarlı, kaynaklı yanıt yok. AI mülakat araçları ise ya **cloud-API bağımlı** (veri yurt dışına çıkar), ya **Türkçe'de zayıf**, ya da **gerçek kaynak-alıntı** sunmuyor.

## Ne yapıyoruz
**Mevcut ATS'inizin üstünde çalışan** (onu değiştirmeyen) bir **mülakat kanıt çalışma alanı**:
- Mülakat kaydı/transkript → **Türkçe** konuşma-tanıma + konuşmacı ayrımı
- Yapılandırılmış değerlendirme alanlarına **her madde için kaynak transkript alıntısı** (tıkla→adayın kendi sözü)
- **İnsan düzenler/onaylar** — AI kanıt çıkarır, **karar insanda** (otomatik eleme/puan YOK)
- Değiştirilemez **audit trail** + denetim/dava için **kanıt dosyası export** (PDF/güvenli link) + mevcut ATS'e bağlama
- **Rıza/saklama/silme** süreçleri gömülü (KVKK)

## Neden regüle kurum için farklı
| | Bizim duruş |
|---|---|
| **Veri egemenliği** | Türkiye'de barındırma + **on-prem opsiyonu** (veri çıkışı yasak sektörler için) |
| **Türkçe AI** | Türkçe konuşma-tanıma + 3+ kişilik panel desteği |
| **Gerçek kaynak-alıntı** | Her değerlendirme maddesi transkript alıntısına bağlı (denetim/EU AI Act açıklanabilirlik kanıtı) |
| **Uyum gömülü** | Rıza + saklama + silme + audit + insan-gözetimi ilk sürümde |
| **Duruş** | "assist": kanıt üretir, insan karar verir — **duygu analizi yok, otomatik ret yok** (EU yasak çizgisinin doğru tarafı) |

## Kanıt zemini (mevcut varlık)
Türkçe konuşma-tanıma + konuşmacı ayrımı + **self-host (on-prem) LLM** + **entailment-tabanlı kaynak-alıntı** altyapısı hazır ("Faz 24"). Pilot, bu altyapıyı sizin gerçek mülakatlarınızda ölçülebilir hedeflerle kanıtlar.

## Ne istiyoruz (design partner)
8-12 haftalık **ücretli pilot**: gerçek mülakatlarınızda kanıt dosyası üretimi + ölçülebilir başarı hedefi (örn. değerlendirme süresi, audit-talebine yanıt, scorecard tutarlılığı). Karşılığında: erken fiyat + yön verme + ihtiyaca göre şekillendirme.

## Sınırlar (dürüst)
Bu bir **tam ATS değil** (ilan/kariyer-sitesi/aday-havuzu yok); mevcut ATS'inizi tamamlar. Sayısal aday puanı/sıralaması ilk sürümde **yok** (kanıt + insan kararı). On-prem teslimi ilk ücretli partnerler sonrası SKU olarak.
