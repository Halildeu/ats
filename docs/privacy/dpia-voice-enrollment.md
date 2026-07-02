# DPIA + Ölçülülük Dosyası (Taslak) — Voice-Enrollment (ATS-0014)

> **Durum: DRAFT — owner/DPO sign-off PENDING.** Bu belge [[ATS-0014]] aktivasyon önkoşulu-3'ün ajan-hazırladığı taslağıdır; **imzalı hali runtime-enable kanıtıdır** (imzasız hâlde modül runtime'ı açılamaz — P1 gate ile birlikte çift kilit). Hukuki görüş değildir.

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

## 5. Sign-off (runtime-enable kanıtı — İMZA PENDING)

| Rol | Ad | Tarih | İmza |
|---|---|---|---|
| Owner (risk-kabul beyanı 2026-07-02 kayıtlı — [[ATS-0014]]) | [DOLDURULACAK] | | |
| DPO / veri-koruma sorumlusu | [DOLDURULACAK] | | |

> İmza tamamlanmadan: registry `active-internal-consented` **design-plane** kalır; modül runtime'ı **açılamaz** (P1 gate + bu dosya çift kilit).
