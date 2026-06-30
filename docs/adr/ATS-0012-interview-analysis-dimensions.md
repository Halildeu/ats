# ATS-0012 — Interview Analysis Dimensions (Art.5 banned-affect/biometric avoidance + deception exclusion)

- **Durum:** Önerildi (cross-AI review bekliyor) — owner kararı 2026-06-29 ("duygu/yalan analizini yasal-güvenli alternatife çevir")
- **Tarih:** 2026-06-29
- **Bağlam kaynağı:** owner ürün-vizyonu (video/ses duygu + davranış + doğruluk/yalan + CV-kıyas) · [[ATS-0005]] (assist-vs-conduct; affect kalıcı yasak) · [[ATS-0004]] (citation/eval) · rekabet analizi (EU duygu-tanıma işyeri yasağı Şub 2025; US BIPA)
- **Karar tipi:** Ürün/AI-kapsam kararı (gate-safe; analiz runtime P1). **Uygunluk/conformity İDDİASI DEĞİL** — Art.5 yasaklı-affect/biometric'ten kaçınma + deception/profiling ürün-politikası dışlama tasarımı.

## Bağlam

Owner vizyonu mülakat analizinde **derinlik** istiyor: ses/video duygu durumu, davranış, "doğru mu söylüyor (yalan)", CV ile tutarlılık. Hukuk/risk gerçeği:
- **Ses/video duygu-tanıma + biyometrik davranış çıkarımı = EU AI Act Art.5 işyeri YASAĞI (Şub 2025)** + US BIPA davalı (kategorik yasak).
- **Deception/yalan tespiti = kategorik EU-yasağı DEĞİL; ürün-politikası dışlama:** pseudoscience + yüksek-risk profiling + pratikte affect/biyometrik-proxy'ye kayar → ürün bunu yapmaz.

[[ATS-0005]] affect'i zaten kalıcı yasaklıyor. Bu ADR owner kararını uygular: **bu yetenekleri dışlar AMA istenen "derin analiz" değerini içerik-tabanlı boyutlarla karşılar.** İstenen her şey burada **görünür** (silinmiş değil; muadil/safe-alternative ile). Bu kapsam kararı işe-alımın Annex III high-risk olduğunu değiştirmez — gerçek uygunluk Art.9-15 + owner-evidence ([[eu-ai-act-technical-file-index]]).

## Karar

**Mülakat analizi yalnız İÇERİK-tabanlı boyutlarla yapılır (transkript/CV/rubric metni — `transcript_text` lexical-only); ses-tonu/video-piksel/biyometrik/paralinguistik sinyalden duygu/davranış/kimlik ÇIKARIMI YOK. Çıktı = kanıt/alıntı/bulgu, asla sayısal skor/ranking. Ürün doğruluk/yalan/güvenilirlik VERDICT'i ÜRETMEZ.** Kanonik kayıt: [docs/ai-governance/interview-analysis-dimensions.md](../ai-governance/interview-analysis-dimensions.md) (machine-checked: `scripts/check-analysis-dimensions.mjs`, CI `analysis-dimensions-guard`).

### 1. Aktif boyutlar (içerik-tabanlı — owner "derin analiz" değerini sınırlı/yasal-güvenli karşılar)
- **content_consistency** — CV ↔ mülakat beyan içerik-tutarlılığı (owner "CV-kıyas"; **verdict değil**, insan-incelemesi için kanıt).
- **internal_contradiction** — transkript-içi kaynaklı çelişki **bulgusu** (deception_detection dışlandı; bu onun yerine sunulan **sınırlı içerik-evidence**'ıdır — doğruluk/yalan kararı DEĞİL, insan takip-sorusu üretir, aday aleyhine tek başına kullanılamaz).
- **answer_quality** — cevap tamlık/ilgililik/yapı (içerik).
- **topic_coverage** — rubric kriter kapsama (içerik; iş-ilişkili).
- **claim_citation** — iddia↔kaynak alıntı + entailment ([[ATS-0004]]).

### 2. Yasaklı boyutlar (hukuki — her biri yasal-güvenli muadile eşli)
> `equivalence`: `partial` (sınırlı içerik-muadili var) · `none` (muadil YOK — yerine yalnız iş-ilişkili rubric kanıtı; sahte-muadil zorlanmaz).

| İstenen (dışlanan) | Sebep | safe_alternative | equivalence |
|---|---|---|---|
| ses/yüz **duygu** analizi (affect/emotion) | EU AI Act Art.5 işyeri yasağı Şub 2025; BIPA | answer_quality | partial |
| ses-tonu/stres (voice-stress/prosody) | biyometrik/affect çıkarımı (Art.5 proxy) | content_consistency | partial |
| yüz **mikro-ifade**/jest/mimik | duygu/biyometrik (Art.5) | — (muadil yok) | none |
| **yalan/doğruluk** (deception) | ürün-politikası: pseudoscience + yüksek-risk profiling + affect/biyometrik-proxy'ye kayar (kategorik EU-yasağı değil) | internal_contradiction (sınırlı içerik-bulgu) | partial |
| **kişilik** çıkarımı (personality) | yüksek-risk profilleme | topic_coverage | partial |
| demografik/biyometrik çıkarım | KVKK özel-nitelikli + ayrımcılık | — (muadil yok; iş-ilişkili rubric kanıtı) | none |

### 3. Girdi/çıktı invariantları
- **Girdi:** yalnız `transcript_text` · `cv_text` · `rubric` · `claim` (**`transcript_text` lexical-only** — prosody/ton/duraklama/stres/yüz/beden/bakış/biyometrik anotasyon HARİÇ; runtime P1'de STT/diarization sanitization gate). **`audio_waveform`/`voice_tone`/`video_pixel`/`facial`/`biometric_signal` YASAK.**
- **Çıktı:** `evidence` · `citation` · `finding` · `coverage` · `consistency_flag`. **`score`/`ranking`/`affect_label` YASAK** ([[ATS-0005]] MVP-scoring-yok).
- **İnsan-final:** her boyut human-oversight FINALIZED'e besleme; otomatik karar/verdict yok.

## Sonuçlar
**Olumlu:** owner "derin analiz" vizyonu Art.5-yasaklı'dan kaçınan içerik-boyutlarıyla (CV-tutarlılık + çelişki-bulgu + kalite + kapsama + citation) sınırlı karşılanır; istenen yasaklı yetenekler **görünür + equivalence-eşli** (kayıp değil).
**Olumsuz:** ses-tonu/duygu "vay" etkisi yok (bilinçli — Art.5 mayınından kaçınma); bazı alıcı "rakipte video-duygu var" diyebilir → satışta "o Art.5-yasaklı/davalı, biz kaçınıyoruz" anlatısı. Uygunluk yine de Art.9-15 + owner-evidence gerektirir (bu ADR uygunluk iddia etmez).

## Değerlendirilen alternatifler
- **(A) Duygu/yalan analizini yap (EU dahil)** — RED: duygu/biyometrik EU Art.5 yasağı + BIPA; deception pseudoscience/yüksek-risk; ürünü mayına oturtur.
- **(B) On-prem + EU-dışı için yap (owner risk-kabul)** — owner reddetti (2026-06-29); ayrı ADR + risk-kabul gerekirdi.
- **(C) Yasal-güvenli içerik-tabanlı muadil (seçilen, owner kararı).**

## Gate disiplini
ADR + dimensions registry + guard **gate-safe** (kapsam kararı + machine-checked spec). Gerçek analiz **runtime = P1, G0=GO sonrası**. "analiz çalışıyor" DENMEZ.

## Bağlantı
- [docs/ai-governance/interview-analysis-dimensions.md](../ai-governance/interview-analysis-dimensions.md) registry · [[ATS-0005]] (affect yasağı/assist) · [[ATS-0004]] (citation/eval) · [[ATS-0003]] (biyometrik/özel-nitelikli) · rubric-standard (iş-ilişkili) · eu-ai-act-index Art.5(banned)/Art.50.
