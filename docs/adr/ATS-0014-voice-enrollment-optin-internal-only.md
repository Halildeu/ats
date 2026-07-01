# ATS-0014 — Voice-enrollment opt-in modülü (YALNIZ iç-kullanıcı; aday kategorik-dışlanmış) — owner risk-kabul kapılı

- **Durum:** **Accepted** — owner risk-kabul beyanı **KAYITLI (2026-07-02)**: (a) owner mesajı "Açık rıza sorun değil bunları zaten alacağız"; (b) owner /goal direktifi "KVK gibi konuları da izinlerinin alınacağını düşünülerek beklemeden KVKK'ya takılmadan tam otonom" → internal-only scope risk-kabul olarak bu ADR'ye işlendi. Registry-v2 flip aynı gün yapıldı ([[speaker-attribution-standard]] §2 → `active-internal-consented`, design-plane). **Runtime-enable AYRI kapı:** imzalı [[dpia-voice-enrollment]] + VERBIS + P1 gate (çift kilit).
- **Tarih:** 2026-07-02 (taslak + owner beyanı + flip aynı gün)
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

## Aktivasyon önkoşulları — durum kaydı (2026-07-02 amendment)

**Design-plane vs runtime-enable ayrımı:** owner beyanı + taslak artefaktlarla **design-plane flip** yapılır (registry status); **runtime-enable** için imzalı owner-evidence şarttır (çift kilit: P1 gate + imzalı DPIA).

1. ✅ **Owner risk-kabul beyanı** — KAYITLI (Durum satırındaki iki beyan; internal-only scope).
2. ✅ **Rıza metinleri (taslak landed):** [[consent-texts-voice-enrollment]] — (a) iç-kullanıcı enrollment açık-rıza metni (amaç/saklama/silme/dezavantajsızlık); (b) aday kayıt-rızası ek-cümlesi: aday enroll edilmez + kalıcı şablon üretilmez, ANCAK geçici oturum ses temsili iç-şablonlarla karşılaştırılabilir + no-match→"muhtemel aday/misafir" ÖNERİSİ + insan onayı + aday referansı loglanmaz/persist edilmez. **Tenant adaptasyonu + yayım = owner/DPO.**
3. ✅(taslak) / ⏳(imza) **DPIA + ölçülülük dosyası:** [[dpia-voice-enrollment]] — DPIA + ölçülülük/gereklilik alternatif analizi + risk matrisi + EU AI Act high-risk delta ([[eu-ai-act-technical-file-index]] Art.9/11/16/43 owner-evidence hattı) + jurisdictional BIPA release/retention-policy eki. **DPO/owner sign-off PENDING — imzalı hali runtime-enable kanıtı.**
4. ⏳ Özel-nitelikli veri envanteri + (TR tenant) **VERBIS** kategori güncellemesi — owner/DPO adımı (runtime-enable önkoşulu).
5. ✅ **Registry-v2 flip (bu amendment ile):** [[speaker-attribution-standard]] §2 → `active-internal-consented` + guard v2 (aday-dışlama/amaç-sınırı/self-service-silme/DPIA/P1 tokenları machine-checked; sentinel silinmez, §1'e taşınamaz).
6. ⏳ Modül runtime'ı **P1+ gate-locked** (G0=GO sonrası; PRE-G0'da fonksiyonel build YASAK) + **imzalı DPIA/VERBIS olmadan runtime açılamaz**.

## Değerlendirilen alternatifler

- **(A) Herkese enrollment (aday dahil)** — RED: aday rızası güç-asimetrisiyle zayıf + ölçülülük + adaya değeri YOK (tek-seferlik konuşmacı).
- **(B) Statüko (hiç açmama)** — işler ama paylaşımlı odada her toplantıda manuel etiketleme sürtünmesi kalır; owner rıza-altyapısı hazırken değer masada kalır.
- **(C) Internal-only opt-in + candidate-by-elimination (önerilen).**

## Gate disiplini

Bu ADR + amendment gate-safe kapsam/risk çerçevesidir. Flip **design-plane**'dir: registry status değişir, **çalışan hiçbir özellik yoktur ve açılamaz** — runtime P1 gate-locked + imzalı-DPIA/VERBIS çift kilidi. "modül çalışıyor" DENMEZ.

## Bağlantı

- [[ATS-0013]] (sentinel + koşul) · [[speaker-attribution-standard]] · [[ATS-0003]] (rıza akışı) · [[data-lifecycle-register]] (`voiceprint_template` gate-locked sınıf) · [[eu-ai-act-technical-file-index]] (high-risk readiness) · [[human-oversight-standard]] (insan-onay düzlemi).
