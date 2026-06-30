# Interview Analysis Dimensions (canonical registry)

> ATS-0012 kanonik kayıt. **Machine-checked** (`scripts/check-analysis-dimensions.mjs`, CI `analysis-dimensions-guard`).
> Owner vizyonundaki "derin analiz" (duygu/ses/davranış/yalan/CV-kıyas) yalnız **içerik-tabanlı + EU-uyumlu** boyutlarla; ses-tonu/video-piksel/biyometrik duygu/davranış/kimlik ÇIKARIMI YOK; çıktı kanıt/alıntı (skor/ranking YOK).
> İstenen yasaklı yetenekler burada **görünür** (kayıp değil) — her biri yasal-güvenli muadile eşli.

## 0. Sözlük
- **input:** `transcript_text` · `cv_text` · `rubric` · `claim` (izinli; metin). · **yasaklı input:** `audio_waveform` · `voice_tone` · `video_pixel` · `facial` · `biometric_signal`.
- **output:** `evidence` · `citation` · `finding` · `coverage` · `consistency_flag` (izinli). · **yasaklı output:** `score` · `ranking` · `affect_label` · `personality_label`.
- **status:** `active-compliant` (içerik-tabanlı, izinli) · `excluded-legal` (yasaklı; muadile eşli) · `gate-locked` (runtime P1).

### İnvariantlar (guard)
1. `active-compliant` boyut: tüm input izinli-metin; **yasaklı input içeremez**.
2. `active-compliant` boyut: output izinli; **yasaklı output (score/ranking/affect/personality) içeremez**.
3. `excluded-legal` boyut: `substitute` (muadil) dolu + bir `active-compliant` boyuta işaret eder; **aktif edilemez**.
4. Sentinel yasaklı boyutlar (affect_emotion/voice_stress/facial_microexpression/deception_detection/personality_inference/demographic_inference) registry'de **excluded-legal** olarak durmalı (sessizce silinemez/aktive edilemez).

## 1. Aktif boyutlar (compliant)

| dimension | input | output | status | not |
|---|---|---|---|---|
| **content_consistency** | cv_text, transcript_text | consistency_flag, citation | active-compliant | CV↔mülakat tutarlılık (CV-kıyas + "doğru mu" yasal muadili) |
| **internal_contradiction** | transcript_text | consistency_flag, citation | active-compliant | transkript-içi çelişki ("yalan" yasal muadili; içerik) |
| **answer_quality** | transcript_text, rubric | finding, citation | active-compliant | tamlık/ilgililik/yapı (içerik) |
| **topic_coverage** | transcript_text, rubric | coverage, citation | active-compliant | rubric kriter kapsama (iş-ilişkili) |
| **claim_citation** | transcript_text, claim | citation, evidence | active-compliant | iddia↔kaynak + entailment (ATS-0004) |

## 2. Yasaklı boyutlar (excluded-legal → muadil)

| dimension | sebep | substitute |
|---|---|---|
| **affect_emotion** | EU işyeri duygu-tanıma yasağı (Şub 2025); BIPA | answer_quality |
| **voice_stress** | biyometrik duygu çıkarımı yasağı | content_consistency |
| **facial_microexpression** | duygu/biyometrik yasağı | answer_quality |
| **deception_detection** | yüksek-risk + bilimsel-çürük + biyometrik | internal_contradiction |
| **personality_inference** | yüksek-risk profilleme | topic_coverage |
| **demographic_inference** | KVKK özel-nitelikli + EU | answer_quality |

## 3. Doğrulama (`scripts/check-analysis-dimensions.mjs`)
§0 sözlük + invariant 1–4: aktif boyutlar yasaklı input/output içeremez; yasaklı boyutlar substitute-eşli + aktif-değil; sentinel yasaklılar excluded-legal olarak korunur; gömülü self-test.

## 4. Bağlantı
- [[ATS-0012]] kararı · [[ATS-0005]] (affect yasağı/assist) · [[ATS-0004]] (citation) · [[ATS-0003]] (biyometrik) · rubric-standard · evidence-packet (claim/citation) · eu-ai-act-index.
