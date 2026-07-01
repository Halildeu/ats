# Interview Analysis Dimensions (canonical registry)

> ATS-0012 kanonik kayıt. **Machine-checked** (`scripts/check-analysis-dimensions.mjs`, CI `analysis-dimensions-guard`).
> Owner vizyonundaki "derin analiz" (duygu/ses/davranış/yalan/CV-kıyas) yalnız **içerik-tabanlı** boyutlarla; ses-tonu/video-piksel/biyometrik/paralinguistik duygu-davranış-kimlik ÇIKARIMI YOK; çıktı kanıt/alıntı (skor/ranking YOK).
> **Kapsam dürüstlüğü (No Fake Work):** Bu bir **kapsam/tasarım kararıdır** — EU AI Act **Art.5 yasaklı (affect/biometric)** mayınlarından kaçınma + deception/profiling ürün-politikası dışlama. **"EU-compliant/uyumlu" İDDİA DEĞİL** (işe-alım Annex III high-risk; uygunluk = Art.9-15 + owner-evidence + readiness, [[eu-ai-act-technical-file-index]]). İstenen yasaklı yetenekler burada **görünür** (kayıp değil) — muadil/safe-alternative ile.

## 0. Sözlük
- **input:** `transcript_text` · `cv_text` · `rubric` · `claim` (izinli; **lexical-only metin**). · **yasaklı input:** `audio_waveform` · `voice_tone` · `video_pixel` · `facial` · `biometric_signal`.
  - **`transcript_text` invariantı:** YALNIZ sözcüksel içerik. **Hariç:** prosody/ton, duraklama-süresi, konuşma-hızı, filler-oranı, `[gergin gülme]`/iç-çekme/stres anotasyonu, yüz/beden/bakış işareti, diarization-confidence, biyometrik/davranışsal metadata (bunlar voice-stress/affect/deception proxy'sini geri sızdırır → runtime P1'de STT/diarization **sanitization gate** ayrı yazılır).
- **output:** `evidence` · `citation` · `finding` · `coverage` · `consistency_flag` (izinli). · **yasaklı output:** `score` · `ranking` · `affect_label` · `personality_label`.
- **status:** `active-compliant` (içerik-tabanlı, izinli) · `excluded-legal` (yasaklı/dışlanmış) · `gate-locked` (runtime P1).
- **equivalence (excluded için):** `partial` (sınırlı içerik-muadili var) · `none` (muadil YOK; yerine yalnız iş-ilişkili rubric kanıtı).

### İnvariantlar (guard)
1. Aktif boyut = **YALNIZ izinli 5 boyut** (allowlist): content_consistency · internal_contradiction · answer_quality · topic_coverage · claim_citation. Ekstra aktif boyut → fail (yeni boyut = ayrı ADR).
2. `active-compliant` boyut: input ⊆ izinli-lexical; **yasaklı input YOK**. output ⊆ izinli; **yasaklı output (score/ranking/affect/personality) YOK**.
3. Aktif satırlarda **yasaklı kavram** (truthfulness/lie/deception/credibility/honesty/stress/prosody/voice/tone/facial/microexpression/gaze/eye-contact/body-language/emotion/affect/personality/temperament/demographic/age/gender/accent/native-language/health/pregnancy + TR varyant) **geçemez** (dim adı/input/output/not).
4. `excluded-legal` boyut: `equivalence∈{partial,none}`; partial → `safe_alternative` bir aktif boyuta işaret eder; none → muadil aranmaz. Sentinel yasaklılar (affect_emotion/voice_stress/facial_microexpression/deception_detection/personality_inference/demographic_inference) registry'de durmalı + **aktif edilemez**.

## 1. Aktif boyutlar (içerik-tabanlı)

| dimension | input | output | status | not |
|---|---|---|---|---|
| **content_consistency** | cv_text, transcript_text | consistency_flag, citation | active-compliant | CV ile mülakat beyanı içerik-tutarlılığı; **karar/verdict değil**, insan takip-incelemesi için kanıt |
| **internal_contradiction** | transcript_text | consistency_flag, citation | active-compliant | transkript-içi kaynaklı çelişki bulgusu; **tek başına aday aleyhine kullanılamaz**, insan takip-sorusu üretir |
| **answer_quality** | transcript_text, rubric | finding, citation | active-compliant | cevap tamlık/ilgililik/yapı (içerik; iş-ilişkili) |
| **topic_coverage** | transcript_text, rubric | coverage, citation | active-compliant | rubric kriter kapsama (içerik; iş-ilişkili) |
| **claim_citation** | transcript_text, claim | citation, evidence | active-compliant | iddia↔kaynak alıntı + entailment (ATS-0004) |

## 2. Dışlanan yetenekler (excluded → safe-alternative / no-equivalent)

| dimension | sebep | safe_alternative | equivalence |
|---|---|---|---|
| **affect_emotion** | EU AI Act Art.5 işyeri duygu-tanıma yasağı (Şub 2025); BIPA | answer_quality | partial |
| **voice_stress** | biyometrik/affect çıkarımı (Art.5 proxy) | content_consistency | partial |
| **facial_microexpression** | duygu/biyometrik (Art.5) | — | none |
| **deception_detection** | ürün-politikası dışlama: pseudoscience + yüksek-risk profiling + affect/biyometrik-proxy'ye kayar | internal_contradiction | partial |
| **personality_inference** | yüksek-risk profilleme | topic_coverage | partial |
| **demographic_inference** | KVKK özel-nitelikli + ayrımcılık (muadil YOK; yerine iş-ilişkili rubric kanıtı) | — | none |

> **deception/truthfulness sınırı (net):** Ürün **doğruluk/yalan/güvenilirlik VERDICT'i ÜRETMEZ**. `internal_contradiction`/`content_consistency` yalnız **kaynaklı içerik-çelişkisi** veya **desteklenmeyen iddia** bulgusu sunar; insan takip-incelemesi içindir; aday aleyhine **tek başına** kullanılamaz.

## 3. Doğrulama (`scripts/check-analysis-dimensions.mjs`)
§0 sözlük + invariant 1–4: aktif boyut allowlist (sadece 5); aktif satırda yasaklı input/output **ve yasaklı kavram-alias** yok; excluded equivalence partial→active-substitute / none→muadil-aranmaz; sentinel yasaklılar korunur + aktif-değil; gömülü self-test.

## 4. Bağlantı
- [[ATS-0012]] kararı · [[ATS-0005]] (affect yasağı/assist/no-scoring) · [[ATS-0004]] (citation/fail-closed) · [[ATS-0003]] (biyometrik/özel-nitelikli) · rubric-standard (iş-ilişkili/protected-attr) · eu-ai-act-index (Art.5 banned / readiness≠conformity) · [[speaker-attribution-standard]] (ATS-0013: diarization takma-ad S1..Sn; sesten-kimlik default-dışlanmış).
