# Citation-backed Coaching v1 — P6.2 proposal-only evidence contract

> **Faz 25 P6.2 · PRE-G0 · sentetik/ref-only.** Bu yüzey mülakatçı
> coaching önerilerini öneri-başına rubric kriteri ve destekli citation ile
> bağlar. Gerçek coaching modeli, canlı transcript/CV, production workflow,
> insan kararı, hukuki kabul veya conformity kanıtı değildir.

Kanonik artefaktlar:

- Contract: `contracts/coaching/citation-backed-coaching.ts`
- Contract test: `contracts/test/citation-backed-coaching.contract.test.ts`
- Parent protocol: `contracts/wire/intelligence-evaluation.ts`
- Citation kararı: ATS-0004
- Assist-only sınırı: ATS-0005
- Lexical-only analiz: ATS-0012 ve ATS-0015
- Rubric sahibi: `docs/governance/rubric-standard.md`
- İnsan otoritesi: `docs/governance/human-oversight-standard.md`

## 1. Kapatılan boşluk

Generic intelligence proposal'ın `citationRefs[]` taşıması tek başına her
önerinin kanıtlı olduğunu göstermez. P6.2 her suggestion için şu closure'ı
zorlar:

`suggestion → criterionRef → citationRef → SUPPORTED entailment → lexical sourceSegmentRef → provenanceRef`

Citation bilinmiyorsa, başka criterion'a aitse veya entailment
`NOT_SUPPORTED`/`INSUFFICIENT` ise suggestion reddedilir. `INSUFFICIENT`
evidence kaybolmaz; yalnız kategorik `INSUFFICIENT_EVIDENCE` quality signal
olarak görünür ve öneriyi/action'ı destekleyemez.

## 2. Veri ve rubric sınırı

- Girdi yalnız `synthetic=true`, opaque interview/proposal/evidence/citation/
  criterion/source-segment ref'leri ve rubric allowlist'indeki dört evidence
  türünü kabul eder: `interview_response`, `work_sample`, `portfolio`,
  `reference_check`.
- Evidence item root tenant/interview scope'una birebir bağlıdır; cross-tenant
  veya cross-interview citation reddedilir.
- `lexicalOnly=true` sabittir. Transcript gövdesi, audio waveform, voice
  tone/stress, prosody, video pixel, facial veya biometric signal yoktur.
- Raw PII ve raw protected attribute sabit `false`'tur.
- P2 rubric/workspace üretir. P6.2 yalnız `rubricVersionRef` ve kapalı
  `criterionRefs` kümesini tüketir; rubric düzenlemez veya kriterin semantiğini
  onaylamaz. Opaque ref'in korumalı özellik encode etmediği contract regex'iyle
  kanıtlanamaz; semantic rubric/legal review dış gate olarak kalır.

## 3. Öneri ve kalite sinyali

Öneri türleri yalnız evidence/process follow-up'tır:

- `RUBRIC_COVERAGE_FOLLOW_UP`
- `EVIDENCE_GAP_REVIEW`
- `UNSUPPORTED_CLAIM_REVIEW`
- `PROCESS_PERSPECTIVE_FOLLOW_UP`

Serbest AI metni taşınmaz. Her tür yalnız kendi exact, ön-onaylı
`templateRef`'ini kabul eder. Template registry/runtime rendering bu PRE-G0
contract'ın dışında kalır.

Quality signal'lar sayısal strength/rating/score değildir; yalnız
`OBSERVED`, `NOT_OBSERVED`, `INSUFFICIENT_EVIDENCE` kategorileridir.
`PROCESS_PERSPECTIVE_COVERAGE` her zaman `sessionLevelOnly=true` sınırında
kalır; kişi profili, trait veya cross-session ranking üretmez.

## 4. Proposal-only ve correction sınırı

Proposal şu sabitlerle oluşur:

- `oversightState=AI_SUGGESTED`, `proposalOnly=true`,
- human review/rationale required,
- `verdict=NONE`, individual decision/action yok,
- auto-execute, batch approval ve mutation `false`,
- evidence `SYNTHETIC_EVIDENCE_ONLY`; legal, independent-audit ve owner
  gate'leri `NOT_MET`,
- `productionEligible=false`.

Appeal, correction ve audit-lineage ref'leri zorunludur. Correction ayrı bir
human review request receipt'idir; proposal digest ve AI-output version'a
bağlıdır. Proposal'ı mutate/finalize etmez, action uygulamaz ve canonical human
oversight state machine'ini kopyalamaz.

Proposal ve correction digest'leri canonical byte representation için
deterministik bütünlük bağlarıdır; dijital imza, identity authentication,
WORM acceptance veya production provenance yerine geçmez.

## 5. Standart ve rakip sınırı

- ATS-0004: suggestion-level entailment citation ve unsupported fail-close.
- ATS-0005 / EU AI Act Art.14 yönü: AI yalnız önerir; insan otoritesi ayrı
  canonical state machine'dedir. Bu design alignment, conformity değildir.
- ATS-0012: lexical-only content evidence; affect/emotion, personality,
  deception, biometric/prosody ve numeric ranking dışlanır.
- Rubric standard: yalnız job-related criterion ref ve exact allowed evidence
  türleri tüketilir; gerçek semantic/legal kabul iddia edilmez.

Greenhouse structured-rubric disiplini ile Metaview/BrightHire interview
review/coaching kategorisi product benchmark'tır. Hedef fark; her öneriye ayrı
entailment citation, görünür correction/audit lineage ve Türkçe/egemen provider
abstraction'dır. Bu contract feature parity, üstünlük, legal-safety veya canlı
provider/model kalitesi iddia etmez.

## 6. Browser acceptance ayrımı

Genel Advanced Intelligence Governance Lab P6 parent yüzeyidir. #140 kabulü
için ayrı platform-web coaching detail panel'i; suggestion-level citation
drill-down, categorical signal, visible `PROPOSAL ONLY / AI_SUGGESTED`, disabled
action, appeal/correction/audit ve masaüstü + 390px + klavye/a11y kanıtı
üretmelidir. Bu ATS contract PR'ı tek başına #140'ı kapatmaz.
