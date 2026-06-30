# ATS-0012 — Interview Analysis Dimensions (compliant; affect/deception → legal-safe substitutes)

- **Durum:** Önerildi (cross-AI review bekliyor) — owner kararı 2026-06-29 ("duygu/yalan analizini yasal-güvenli alternatife çevir")
- **Tarih:** 2026-06-29
- **Bağlam kaynağı:** owner ürün-vizyonu (video/ses duygu + davranış + doğruluk/yalan + CV-kıyas) · [[ATS-0005]] (assist-vs-conduct; affect kalıcı yasak) · [[ATS-0004]] (citation/eval) · rekabet analizi (EU duygu-tanıma işyeri yasağı Şub 2025; US BIPA)
- **Karar tipi:** Ürün/AI-kapsam + hukuki-kalkan (gate-safe; analiz runtime P1)

## Bağlam

Owner vizyonu mülakat analizinde **derinlik** istiyor: ses/video duygu durumu, davranış, "doğru mu söylüyor (yalan)", CV ile tutarlılık. Ancak [[ATS-0005]] + rekabet/hukuk analizi net: **ses/video DUYGU-tanıma + biyometrik davranış + yalan/deception tespiti EU AI Act işyerinde YASAK (Şub 2025)**, US BIPA davalı, bilimsel olarak da çürük (deception). Bu ADR owner kararını uygular: **bu yetenekleri yasaklı tutar AMA istenen "derin analiz" değerini içerik-tabanlı, EU-uyumlu boyutlarla karşılar.** İstenen her şey burada **görünür** (silinmiş değil; yasal-güvenli muadile eşlenmiş).

## Karar

**Mülakat analizi yalnız İÇERİK-tabanlı boyutlarla yapılır (transkript/CV/rubric metni); ses-tonu/video-piksel/biyometrik sinyalden duygu/davranış/kimlik ÇIKARIMI YOK. Çıktı = kanıt/alıntı/bulgu, asla sayısal skor/ranking.** Kanonik kayıt: [docs/ai-governance/interview-analysis-dimensions.md](../ai-governance/interview-analysis-dimensions.md) (machine-checked: `scripts/check-analysis-dimensions.mjs`, CI `analysis-dimensions-guard`).

### 1. Aktif boyutlar (compliant — owner "derin analiz" değerini karşılar)
- **content_consistency** — CV ↔ mülakat beyan tutarlılığı (owner "CV-kıyas" + "doğru mu söylüyor"un yasal muadili: içerik-çelişkisi, biyometrik değil).
- **internal_contradiction** — transkript-içi çelişki (söylediğiyle çelişme; içerik-tabanlı, "yalan tespiti"nin yasal muadili).
- **answer_quality** — cevap tamlık/ilgililik/yapı (içerik).
- **topic_coverage** — rubric kriter kapsama (içerik; iş-ilişkili).
- **claim_citation** — iddia↔kaynak alıntı + entailment ([[ATS-0004]]).

### 2. Yasaklı boyutlar (hukuki — her biri yasal-güvenli muadile eşli)
| İstenen (yasaklı) | Sebep | Yasal-güvenli muadil |
|---|---|---|
| ses/yüz **duygu** analizi (affect/emotion) | EU işyeri yasağı Şub 2025; BIPA | answer_quality (içerik) |
| ses-tonu/stres (voice-stress/prosody-emotion) | biyometrik duygu çıkarımı yasağı | content_consistency |
| yüz **mikro-ifade**/jest/mimik | duygu/biyometrik yasağı | (içerik-only; muadil gerekmez) |
| **yalan/doğruluk** (deception) | yüksek-risk + bilimsel çürük + biyometrik | internal_contradiction + content_consistency |
| **kişilik** çıkarımı (personality) | yüksek-risk profilleme | answer_quality + topic_coverage |
| demografik/biyometrik çıkarım | KVKK özel-nitelikli + EU | (yok — kesin yasak) |

### 3. Girdi/çıktı invariantları
- **Girdi:** yalnız `transcript_text` · `cv_text` · `rubric` · `claim` (metin). **`audio_waveform`/`voice_tone`/`video_pixel`/`facial`/`biometric_signal` YASAK.**
- **Çıktı:** `evidence` · `citation` · `finding` · `coverage` · `consistency_flag`. **`score`/`ranking`/`affect_label` YASAK** ([[ATS-0005]] MVP-scoring-yok).
- **İnsan-final:** her boyut human-oversight FINALIZED'e besleme; otomatik karar yok.

## Sonuçlar
**Olumlu:** owner "derin analiz" vizyonu EU-uyumlu karşılanır (CV-tutarlılık + çelişki + kalite + kapsama + citation); "uyumlu + denetlenebilir" konumlanma korunur; istenen yasaklı yetenekler **görünür + muadile eşli** (kayıp değil).
**Olumsuz:** ses-tonu/duygu "vay" etkisi yok (bilinçli — yasal mayından kaçınma); bazı alıcı "rakipte video-duygu var" diyebilir → satışta "o yasak/davalı, biz uyumluyuz" anlatısı.

## Değerlendirilen alternatifler
- **(A) Duygu/yalan analizini yap (EU dahil)** — RED: EU işyeri yasağı + BIPA davası; ürünü hukuki mayına oturtur.
- **(B) On-prem + EU-dışı için yap (owner risk-kabul)** — owner reddetti (2026-06-29); ayrı ADR + risk-kabul gerekirdi.
- **(C) Yasal-güvenli içerik-tabanlı muadil (seçilen, owner kararı).**

## Gate disiplini
ADR + dimensions registry + guard **gate-safe** (kapsam kararı + machine-checked spec). Gerçek analiz **runtime = P1, G0=GO sonrası**. "analiz çalışıyor" DENMEZ.

## Bağlantı
- [docs/ai-governance/interview-analysis-dimensions.md](../ai-governance/interview-analysis-dimensions.md) registry · [[ATS-0005]] (affect yasağı/assist) · [[ATS-0004]] (citation/eval) · [[ATS-0003]] (biyometrik/özel-nitelikli) · rubric-standard (iş-ilişkili) · eu-ai-act-index Art.5(banned)/Art.50.
