# DPIA + Ölçülülük Dosyası — Voice-Enrollment (ATS-0014)

> **Durum: OWNER-APPROVED (2026-07-02, kayıtlı beyan)** — owner, kalan-madde listesi kendisine açıkça sunulduktan sonra "**onaylıyorum / tam otonom devam**" beyanı verdi (session c9445b2a; bu repo'nun ADR-kabul governance kalıbıyla aynı: kayıtlı chat beyanı = owner onayı). **DPO eş-imzası: pre-G0'da atanmış DPO yok** (KVKK'da DPO zorunlu organ değildir; veri sorumlusu yetkilisi = owner) — DPO/irtibat kişisi atanırsa eş-imza eklenir; tenant-onboarding'de kurumsal imza süreci tekrarlanabilir.
> **Bu kayıt ıslak/e-imza veya tenant kurumsal onayı DEĞİLDİR; repo-owner risk/onay kaydıdır** (tenant-onboarding'de kurumsal imza süreci ayrıca yürütülür). VERBIS irtibat kişisi ≠ DPO (ayrı kavramlar).
> **Runtime-enable hâlâ KAPALI** — kalan önkoşullar: **VERBIS güncellemesi (§6 kopyala-yapıştır paketi hazır) + fiili açık-rıza toplama (runtime'da) + P1 gate**. Hukuki görüş değildir.

## 1. Kapsam ve işleme tanımı

| Alan | Değer |
|---|---|
| İşleme | İç-kullanıcı (görüşmeci/ekip) **opt-in** ses tanıma profili (voiceprint_template) oluşturma + oturum diarization kümeleriyle 1:N karşılaştırma → konuşmacı-eşleme **ÖNERİSİ** |
| Veri kategorisi | **Özel-nitelikli (biyometrik)** — KVKK m.6 / GDPR Art.9; sınıf: [[data-lifecycle-register]] `voiceprint_template` |
| İlgili kişi grupları | (a) **iç-kullanıcı** (enrollment; açık rıza); (b) **aday/misafir** — **enrollment YOK, kalıcı şablon YOK**; yalnız geçici oturum-temsili karşılaştırması ([[consent-texts-voice-enrollment]] §B cümlesiyle bilgilendirilmiş) |
| Hukuki dayanak | Açık rıza (KVKK m.6; GDPR Art.9(2)(a)) — [[consent-texts-voice-enrollment]] §A/§B |
| Saklama/silme | opt-in süresince; self-service **crypto-erase**; aktarım none; model-eğitimi yasak |
| Karar etkisi | YOK — çıktı yalnız öneri; kesinleşme insan onayı ([[human-oversight-standard]]); aday hakkında karar üretmez |

## 2. Gereklilik + ölçülülük (alternatif analizi — KVKK Kurulu içtihat riskine cevap)

**Alternatifler mevcut ve operasyonel olarak EŞDEĞER sunulur** ([[speaker-attribution-standard]] §1: cihaz-metadata, sözlü-tanıtım-lexical, katılımcı-cihazı, insan-etiketleme). Enrollment bunların YERİNE değil, **tekrarlayan iç-konuşmacının etiketleme sürtünmesini azaltan gönüllü konfor katmanı** olarak eklenir:

- Paylaşımlı tek-mikrofon odada her oturumda küme-başına manuel etiketleme gerekir; enrollment yalnız İÇ sesler için bunu öneriye çevirir.
- **Ölçülülük gerekçesi:** (a) en dar veri — yalnız opt-in iç-kullanıcı şablonu, aday asla; (b) en dar amaç — yalnız attribution önerisi, amaç-genişlemesi machine-checked yasak; (c) en kısa saklama — opt-in süresince + self-service silme; (d) reddetme maliyetsiz — alternatif eşdeğer, sıfır performans/değerlendirme etkisi (DPO/HR policy kaydı); (e) karar-etkisiz — öneri + insan onayı.
- **Artık risk (dürüst):** Kurul, alternatif varken biyometrik işlemeyi rızaya rağmen ölçüsüz bulabilir (işyeri PDKS içtihat hattı). Mitigasyon yukarıdaki (a)-(e) + gönüllülük belgeleme; owner bu artığı [[ATS-0014]] beyanıyla kabul etti (2026-07-02).

## 3. Risk matrisi

| Risk | Olasılık | Etki | Mitigasyon |
|---|---|---|---|
| Kurul ölçülülük aykırılık tespiti | orta | yüksek | §2 (a)-(e) + eşdeğer-alternatif belgeleme + dar scope |
| Çalışan rızasının özgür sayılmaması (KVKK+GDPR+iş hukuku) | orta | orta | opt-in + sıfır-dezavantaj + self-service silme + DPO/HR policy kaydı + alternatif |
| Aday geçici-karşılaştırmasının "biyometrik işleme" sayılması | orta | orta | [[consent-texts-voice-enrollment]] §B açık dil + no-match anında silme + aday referansı log'lanmaz + şablon üretilmez (machine-checked candidate_exclusion) |
| Amaç genişlemesi (authentication/izleme'ye kayma) | düşük | yüksek | registry amaç-sınır invariantı + guard; ihlal = CI fail |
| Şablon sızıntısı | düşük | yüksek | tenant-içi saklama + crypto-erase + [[ATS-0007]] threat-register/key-mgmt kontrolleri |
| EU AI Act high-risk yükümlülük boşluğu | — | yüksek | rıza muafiyet DEĞİL; [[eu-ai-act-technical-file-index]] Art.9/11/16/43 owner-evidence hattı (readiness≠conformity) |

## 4. Jurisdiction ekleri

- **TR:** VERBIS kaydına özel-nitelikli biyometrik kategori eklemesi (owner/DPO — runtime-enable önkoşulu).
- **EU:** GDPR Art.35 DPIA bu dosyanın imzalı hali; Art.9(2)(a) explicit consent.
- **US (varsa):** Illinois BIPA vb. için **yazılı release** ([[consent-texts-voice-enrollment]] §A karşılar) + **yayımlı retention/destruction policy** (bu dosya §1 saklama/silme satırı politika metnine dönüştürülür).

## 5. Sign-off (runtime-enable kanıtı)

| Rol | Ad | Tarih | Onay |
|---|---|---|---|
| Owner (veri sorumlusu yetkilisi; risk-kabul [[ATS-0014]]) | Halil Koçoğlu | 2026-07-02 | **KAYITLI BEYAN** — kalan-madde listesi sunulduktan sonra "onaylıyorum / tam otonom devam" (session c9445b2a) |
| DPO / irtibat kişisi | pre-G0'da atanmadı | — | atanırsa eş-imza; tenant-onboarding'de kurumsal imza tekrarlanabilir |

> Owner onayı kayıtlı; ancak modül runtime'ı **hâlâ açılamaz** — kalan: VERBIS (§6) + fiili açık-rıza toplama + P1 gate. Registry `active-internal-consented` **design-plane** kalır.

## 6. VERBIS güncelleme paketi (owner için kopyala-yapıştır — TR tenant)

> VERBIS kayıt/güncelleme ekranındaki alanlara birebir taşınacak içerik. Yürütme = owner (VERBIS girişi şirket yetkilisi kimliğiyle yapılır; ajan yapamaz).

| VERBIS alanı | Girilecek değer |
|---|---|
| Veri kategorisi | **Biyometrik veri** (ses tanıma profili / ses şablonu) |
| İlgili kişi grubu | **Çalışanlar / iç-kullanıcılar** (YALNIZ açık rızayla opt-in olanlar) — **aday/stajyer DEĞİL** (aday için şablon üretilmez) |
| İşleme amacı | Toplantı/mülakat kayıtlarında konuşmacı-eşleme ÖNERİSİ üretimi (iş faaliyetlerinin yürütülmesi; İK karar amacı DEĞİL — öneri insan onaylıdır) |
| Hukuki sebep | Açık rıza (KVKK m.6) |
| Saklama süresi | Opt-in süresince; rıza geri çekildiğinde **derhal kriptografik silme** (self-service) |
| Alıcı / alıcı grupları | Yok (tenant dışına aktarım yok; üçüncü tarafla paylaşım yok; model eğitiminde kullanılmaz) |
| Yabancı ülkeye aktarım | Yok |
| Güvenlik tedbirleri | Şifreleme (at-rest/in-transit), erişim yetkilendirme + denetim logu (`evidence.speaker.attributed`), amaç-sınırı makine-zorlanır (CI guard), kriptografik silme, tenant izolasyonu ([[ATS-0002]]/[[ATS-0007]]) |
