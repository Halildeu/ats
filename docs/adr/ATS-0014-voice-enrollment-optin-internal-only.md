# ATS-0014 — Voice-enrollment opt-in modülü (YALNIZ iç-kullanıcı; aday kategorik-dışlanmış) — owner risk-kabul kapılı

- **Durum:** Önerildi — **owner risk-kabul bekliyor** (aktivasyon = bu ADR Accepted + registry-v2 flip PR'ı; o zamana kadar [[ATS-0013]] sentinel'i `excluded-biometric` kalır)
- **Tarih:** 2026-07-02
- **Bağlam kaynağı:** owner 2026-07-02 "açık rıza sorun değil, bunları zaten alacağız" + paylaşımlı tek-mikrofon senaryosu · [[ATS-0013]] sentinel koşulu (ayrı ADR + açık-rıza + özel-nitelikli envanter + owner risk-kabul) · [[ATS-0003]] (kayıt-rızası akışı mevcut)
- **Karar tipi:** Ürün/veri-kapsam kararı (gate-safe; modül runtime'ı P1+). **Uygunluk iddiası DEĞİL.**

## Bağlam — rıza NE ÇÖZER / NE ÇÖZMEZ (dürüst tablo)

| Katman | Açık rıza çözer mi? | Not |
|---|---|---|
| KVKK m.6 özel-nitelikli hukuki dayanak | **EVET (büyük parça)** | biyometrik veri için açık rıza ana dayanak; ürünün rıza akışı zaten var |
| GDPR Art.9(2)(a) | **EVET** | explicit consent istisnası |
| US eyalet-hukuku (Illinois BIPA vb.) | **BÜYÜK ÖLÇÜDE** | yazılı release + yayımlı retention/imha politikası BIPA'nın çekirdeği; jurisdictional |
| **KVKK Kurulu ölçülülük/gereklilik içtihadı** | **HAYIR** | Kurul, rızaya RAĞMEN daha az müdahaleci alternatif varken biyometrik işlemeyi hukuka aykırı bulabiliyor (işyeri PDKS/spor-salonu kararları hattı). Mitigasyon: gerçek gönüllülük + her an biyometrisiz alternatif ([[speaker-attribution-standard]] §1 yolları) + reddedene sıfır-dezavantaj + dar amaç |
| **İşe-alım güç asimetrisi (aday rızası)** | **HAYIR** | adayın rızası "özgürce verilmiş" sayılmayabilir (iş fırsatı baskısı). Mitigasyon: **aday HİÇBİR KOŞULDA enroll edilmez** (kategorik dışlama; bu modülün aday için değeri de yok — aday tek-seferlik konuşmacı, enrollment tekrarlayan konuşmacı içindir) |
| **EU AI Act high-risk yükümlülükleri** | **HAYIR** | rıza AI Act'ten muafiyet değildir; biyometrik-tanımlama + işe-alım bağlamı high-risk kalır → [[eu-ai-act-technical-file-index]] readiness kapsar; conformity owner-evidence |
| Çalışan/iç-kullanıcı rıza asimetrisi (KVKK + GDPR + iş hukuku) | **KISMEN** | işveren-çalışan/iş-ilişkisi rızası her iki rejimde de asimetrik (özgür-irade sorgusu). Mitigasyon: convenience-opt-in + **biyometrisiz alternatifin operasyonel olarak EŞDEĞER erişilebilirliği** + **opt-out sonrası sıfır performans/değerlendirme etkisi** + self-service silme + **DPO/HR policy kaydı** |

## Karar (önerilen tasarım — owner kabulüyle yürürlüğe girer)

**Scope: voice-enrollment YALNIZ iç/tekrarlayan kullanıcı (görüşmeci/ekip) için, opt-in.** Modül şunları sağlar:

1. **İç-kullanıcı enrollment (opt-in):** kullanıcı kendi sesini kaydeder → `voiceprint_template` üretilir (tenant-içi saklama; [[data-lifecycle-register]] sınıfı; self-service silme = crypto-erase; amaç-sınırlı: YALNIZ toplantı-içi attribution ÖNERİSİ — başka amaçla kullanım yasak).
2. **Eşleme:** oturum diarization kümeleri iç-kullanıcı şablonlarıyla karşılaştırılır → eşleşen kümeler "= Ayşe (önerildi)" etiketi alır; **insan onayı korunur** ([[ATS-0013]] attribution invariantı — enrollment yalnız öneri kalitesini yükseltir, otomatik kesin-kimlik iddiası yine yok).
3. **Aday eleme-yoluyla tespit (candidate-by-elimination):** iç sesler eşleşince **kalan küme "muhtemel aday/misafir" önerisi** olur → adayın biyometrik ŞABLONU hiç üretilmeden paylaşımlı-mikrofon odasında pratik tam-otomasyona yakınlık.
4. **candidate_exclusion invariantı (makine-zorlanır olacak):** aday/misafir için enrollment YOK, kalıcı şablon YOK, şablon-DB'ye yazım YOK.
5. **ATS-0013 embedding invariantı korunumu:** oturum diarization embedding'leri HERKES için yine session-scoped/atılır. Değişen tek şey: enroll-olmuş İÇ-kullanıcının KENDİ kalıcı şablonu (ayrı enrollment-store) oturum embedding'iyle karşılaştırılır; karşılaştırma sonrası oturum embedding'i yine persist edilmez.

### Açık kalan artık-risk (owner kabulünün kapsadığı şey)

- **Geçici eşleştirme adayın sesine de dokunur:** 1:N eşleme her kümenin (aday dahil) oturum-embedding'ini iç-şablon-DB ile karşılaştırır — adaydan kalıcı şablon üretilmez/saklanmaz ama **geçici biyometrik işleme** sayılabilir. Mitigasyon: aday kayıt-rızası metnine "konuşmacı ayrıştırma/eşleştirme amaçlı geçici ses işleme" cümlesi eklenir (owner "rızaları zaten alacağız" beyanıyla uyumlu) + no-match → anında at + hiçbir aday-referansı loglanmaz.
- **Ölçülülük içtihadı artığı:** alternatif dururken biyometrik convenience — gönüllülük + dezavantajsızlık + dar amaç belgelense de Kurul riski sıfırlanmaz.

## Aktivasyon önkoşulları (sıralı; hepsi tamamlanmadan registry flip YOK)

1. **Owner risk-kabul beyanı** (bu ADR'ye yazılı: "artık-riskleri kabul ediyorum, internal-only scope ile aktive et").
2. Rıza metinleri: (a) iç-kullanıcı enrollment açık-rıza metni (amaç/saklama/silme/dezavantajsızlık); (b) **aday kayıt-rızasına açık dil**: aday enroll edilmez + kalıcı şablon üretilmez, ANCAK adayın **geçici oturum ses temsili enroll-olmuş iç-konuşmacı şablonlarıyla karşılaştırılabilir** ve no-match sonucundan "muhtemel aday/misafir" ÖNERİSİ üretilebilir; sonuç insan onayına tabidir; aday referansı loglanmaz/persist edilmez.
3. **DPIA + ölçülülük dosyası (owner/DPO kanıt kapısı):** veri-koruma etki değerlendirmesi + DPO/owner sign-off + ölçülülük/gereklilik **alternatif analizi** (neden biyometrisiz yollar yetmiyor/nasıl eşdeğer sunuluyor) + **EU AI Act high-risk delta pack** ([[eu-ai-act-technical-file-index]] Art.9/11/16/43 owner-evidence hattı) + (jurisdiction'a göre) **BIPA written-release + yayımlı retention/destruction policy**.
4. Özel-nitelikli veri envanteri + (TR tenant için) VERBIS kategori güncellemesi — owner/DPO adımı.
5. **Registry-v2 flip PR'ı:** [[speaker-attribution-standard]] + guard v2 — `voiceprint_enrollment` → `active-internal-consented` (yeni status; aday-dışlama + amaç-sınırı + self-service-silme invariantları machine-checked; sentinel silinmez, scope'u değişir).
6. Modül runtime'ı **P1+ gate-locked** kalır (G0=GO sonrası; PRE-G0'da fonksiyonel build YASAK).

## Değerlendirilen alternatifler

- **(A) Herkese enrollment (aday dahil)** — RED: aday rızası güç-asimetrisiyle zayıf + ölçülülük + adaya değeri YOK (tek-seferlik konuşmacı).
- **(B) Statüko (hiç açmama)** — işler ama paylaşımlı odada her toplantıda manuel etiketleme sürtünmesi kalır; owner rıza-altyapısı hazırken değer masada kalır.
- **(C) Internal-only opt-in + candidate-by-elimination (önerilen).**

## Gate disiplini

Bu ADR gate-safe kapsam/risk çerçevesidir; hiçbir şeyi aktive etmez. [[ATS-0013]] sentinel'i owner risk-kabul + flip PR'ına kadar `excluded-biometric` kalır. "modül çalışıyor" DENMEZ.

## Bağlantı

- [[ATS-0013]] (sentinel + koşul) · [[speaker-attribution-standard]] · [[ATS-0003]] (rıza akışı) · [[data-lifecycle-register]] (`voiceprint_template` gate-locked sınıf) · [[eu-ai-act-technical-file-index]] (high-risk readiness) · [[human-oversight-standard]] (insan-onay düzlemi).
