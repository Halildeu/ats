# ATS-0013 — Speaker Attribution: diarization (ayrıştırma) + biyometrisiz eşleme; sesten-kimlik default-dışlanmış

- **Durum:** Önerildi (cross-AI review bekliyor) — owner senaryosu 2026-07-02 ("aynı odada tek bilgisayar/mikrofondan çok kişi konuşuyor")
- **Tarih:** 2026-07-02
- **Bağlam kaynağı:** owner senaryosu (paylaşımlı tek-mikrofon oda) · [[ATS-0012]] (`biometric_signal` yasaklı input; transcript_text lexical-only) · [[ATS-0003]] (kayıt rızası + özel-nitelikli sınır) · [[ATS-0005]] (assist-vs-conduct)
- **Karar tipi:** Ürün/veri-kapsam kararı (gate-safe; runtime P1). **Uygunluk/conformity iddiası DEĞİL.**

## Bağlam

Owner senaryosu: mülakat/toplantıda bazen herkes **aynı odada**, **tek bilgisayar + tek mikrofon** üzerinden **çok sayıda kişi** konuşuyor. Cihaz/oturum metadata'sı ("bu cihaz Halil'in") konuşmacı-kişi eşlemesi için tek başına yetmez. Owner "kişiyi sesinden tanımak" istedi.

Hukuki gerçek: **sesten kimlik = voiceprint = biyometrik veri** → KVKK m.6 özel-nitelikli (açık rıza şart) + EU AI Act biyometrik-tanımlama yüksek-risk + US BIPA dava yüzeyi. Kategorik yasak değil ama ağır rejim. Buna karşılık **diarization** (oturum-içi konuşmacı AYIRMA, `S1..Sn` takma-ad) kimlik iddiası taşımaz ve kalıcı şablon üretmezse tanımlama eşiğini geçmez.

## Karar

Üç işlemi ayrıştırıp farklı rejimlere bağlıyoruz — kanonik kayıt: [docs/ai-governance/speaker-attribution-standard.md](../ai-governance/speaker-attribution-standard.md) (machine-checked: `scripts/check-speaker-attribution.mjs`, CI `speaker-attribution-guard`):

1. **separation (diarization) — İZİNLİ:** tek mikrofon kanalı oturum-içi akustik kümelemeyle `S1..Sn` takma-ad konuşmacılara ayrılır. **Embedding invariantı:** session-scoped; persist/export/cross-session karşılaştırma/kimlik-DB eşleme YASAK → kalıcı ses-şablonu yok, biyometrik TANIMLAMA değil.
2. **attribution (kümeyi kişiye eşleme) — YALNIZ BİYOMETRİSİZ 4 YOL:**
   - **device_metadata** — tek-konuşmacılı cihazda otomatik öneri (paylaşımlı odada tek başına yetmez);
   - **lexical_self_introduction** — toplantı başı sözlü tanıtım/yoklama; transkript İÇERİĞİNDEN öneri (söylenen sözden, akustik karakteristikten değil) + insan onayı;
   - **per_participant_device** — opsiyonel: aynı odada herkes kendi cihazından da katılır;
   - **human_labeling** — paylaşımlı-mikrofon **kanonik yolu**: görüşmeci küme başına kısa-kesit dinleyip atar; atama = insan beyanı + `evidence.speaker.attributed` audit event'i.
   Attribution opsiyoneldir; eşlenmemiş `S1` geçerli kalır.
3. **identification (voiceprint_enrollment) — DEFAULT-DIŞLANMIŞ sentinel:** kalıcı ses-şablonu + cross-session otomatik "bu ses = Ahmet" eşlemesi ürünün default kapsamında YOK. Gelecekte açılması ancak: **ayrı ADR + açık-rıza akışı + özel-nitelikli envanter/retention + owner risk-kabul** ile opsiyonel modül olarak.

## Sonuçlar

**Olumlu:** owner'ın paylaşımlı-mikrofon senaryosu biyometrik veri işlemeden çözülür (diarization + insan/içerik-tabanlı eşleme); ürün KVKK özel-nitelikli/BIPA/high-risk-biometric rejimine girmez; kanıt zinciri insan-onaylı kalır ([[human-oversight-standard]]).
**Olumsuz:** tam otomatik "sistem herkesi sesinden tanır" konforu yok (bilinçli); paylaşımlı odada görüşmeciye küme-etiketleme adımı düşer (UI bunu 30-sn'lik akışa indirir, P1). Overlap'li konuşmada diarization kalitesi düşebilir — kalite sınırı dürüstçe raporlanır, kimliğe zorlanmaz.

## Değerlendirilen alternatifler

- **(A) Voiceprint enrollment ile otomatik tanıma** — RED (default): özel-nitelikli biyometrik rejim + BIPA + high-risk; değeri (etiketleme zahmetinden tasarruf) riske değmez. Opsiyonel modül yolu §Karar-3'te açık bırakıldı.
- **(B) Attribution hiç yapmama (hep S1/S2)** — RED: kanıt paketinde "kim söyledi" bağlamı zayıflar; insan-onaylı eşleme düşük-riskli ve yeterli.
- **(C) Diarization + biyometrisiz attribution + sentinel dışlama (seçilen).**

## Gate disiplini

ADR + registry + guard **gate-safe** (kapsam sözleşmesi). Diarization/attribution runtime'ı **P1, G0=GO sonrası**. "attribution çalışıyor" DENMEZ.

## Bağlantı

- [docs/ai-governance/speaker-attribution-standard.md](../ai-governance/speaker-attribution-standard.md) registry · [[ATS-0012]] (analiz-boyutları; biometric_signal yasak) · [[ATS-0003]] (rıza/özel-nitelikli) · [[ATS-0010]] (event taxonomy) · [[ATS-0005]] (assist-vs-conduct).
