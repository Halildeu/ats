# Versioned Skills Ontology v1 — P6.3 proposal-only contract

> **Faz 25 P6.3 · PRE-G0 · sentetik/ref-only.** Bu yüzey, sürümlü beceri
> ontolojisi ile kanıta bağlı sentetik beceri eşleme ve talent rediscovery
> proposal'larını modeller. Canlı aday verisi, otomatik sourcing/ranking,
> employment action, gerçek partner kabulü, full-ATS aktivasyonu veya hukuki
> uygunluk kanıtı değildir.

Kanonik artefaktlar:

- Contract: `contracts/skills/versioned-skills-ontology.ts`
- Contract test: `contracts/test/versioned-skills-ontology.contract.test.ts`
- Package export: `@ats/contracts/versioned-skills-ontology-v1`
- Citation kararı: ATS-0004
- Assist-only sınırı: ATS-0005
- Lexical-only analiz: ATS-0012 ve ATS-0015
- İnsan otoritesi: `docs/governance/human-oversight-standard.md`

## 1. Ontoloji release sınırı

Her release:

- opaque `releaseRef`, exact `releaseVersion`, kaynak URI/sürümü ve license
  ref'i taşır;
- `digestAlgorithm=SHA-256`, `immutable=true` ve canonical
  `releaseDigest` ile seal edilir;
- genesis için null, sonraki release için exact
  `supersedesReleaseRef + supersedesReleaseDigest` lineage'i taşır;
- tek-successor lineage zorlar; aynı release'ten iki canonical successor fork'u
  reddedilir;
- concept ve edge dizileri digest öncesi canonical sıralanır;
- concept display metni taşımaz; yalnız `labelRef + labelLocale` taşır;
- concept kaynağını release source manifest'iyle birebir bağlar;
- deprecated concept'in yeni mapping/rediscovery kaynağı olmasını reddeder;
- duplicate semantic edge, BROADER/NARROWER inverse duplicate ve hierarchy
  cycle'ını fail-closed reddeder.

Bu v1 bilinçli olarak tek-kaynaklı release kabul eder. ESCO/O*NET referansı,
parity/certification/conformance iddiası değildir. HR Open bir veri değişim
standardı referansıdır; taxonomy eşdeğerliği anlamına gelmez. Cross-source
derived/equivalent mapping, upstream manifest ve human-reviewed mapping
evidence tasarlanmadan bu contract'a alınmaz.

## 2. Evidence-bound skill mapping

Skill mapping closure'ı:

`proposal → conceptRef → exact ontology release ref/version/digest → evidenceRef → citationRef → SUPPORTED entailment → lexical sourceSegmentRef → provenanceRef`

Kurallar:

- yalnız `synthetic=true` ve opaque subject/proposal/evidence/citation/segment
  ref'leri;
- raw PII, raw protected attribute ve serbest AI metni yok;
- `silentInferenceAllowed=false`;
- her concept için en az bir `SUPPORTED` evidence;
- cross-tenant, cross-subject, cross-concept veya cross-release evidence
  reddedilir;
- proposal yalnız `AI_SUGGESTED`, `proposalOnly=true`, human review/rationale
  required durumundadır;
- verdict, individual action, auto-execute, batch approval ve mutation yoktur;
- legal, independent-audit ve owner gate'leri `NOT_MET`, production eligibility
  `false` kalır.

Opaque ref regex'i tek başına ref'in semantik olarak korumalı özellik encode
etmediğini kanıtlayamaz. Upstream rubric/template registry semantic review ve
authorization gate'leri dış sınırdır.

## 3. Correction ve deletion

Correction:

- exact proposal digest ve AI-output version'a bağlanır;
- human requester ile ayrı authorization receipt ref'i gerektirir;
- yalnız `CORRECTION_REVIEW_ONLY` receipt'i üretir;
- proposal'ı mutate/finalize etmez ve action uygulamaz.

Deletion iki katmanlı tombstone uygular:

- Her reason için exact proposal + evidence/citation/segment/provenance lineage
  tekrar kullanımı engellenir.
- `DATA_SUBJECT_DELETION` ve `LEGAL_OBLIGATION` için tenant+subject terminal
  scope tombstone oluşur; yeni proposal kimliğiyle yeniden yaratma reddedilir.
- `ONTOLOGY_VERSION_RETIRED` ilgili release'i tüm yeni mapping ve rediscovery
  proposal'larına kapatır.

Tombstone receipt, content-plane erasure veya WORM/DSAR operasyonunun tamamı
değildir. Bu PRE-G0 registry yalnız contract-level terminality ve audit trace
sağlar. Gerçek depolama silimi, retention, identity authorization ve owner/legal
acceptance ayrı runtime gate'leridir.

## 4. Talent rediscovery lineage

Her match şu exact zinciri taşır ve doğrular:

`match → sourceProposalId + sourceProposalDigest → evidenceRef + citationRef → same subject + same concept + same release ref/version/digest + SUPPORTED`

Broad “aynı tenant içinde bir citation bulundu” taraması yapılmaz. Tombstoned,
expired veya tamper edilmiş source proposal rediscovery kaynağı olamaz.

Rediscovery ayrıca:

- explicit consent receipt, processing-purpose ref ve en fazla 24 saatlik
  güncel opt-out check gerektirir;
- `optedOut=false`, `silentInferenceAllowed=false` sabitlerini zorlar;
- `unordered=true` ve `displayOrder=UNSPECIFIED` taşır; score/rank/order
  semantiği üretmez;
- target, match ve evidence/citation setlerini canonical sıralar;
- aynı subject+concept+source proposal duplicate match'ini reddeder;
- real-subject acceptance, real activation ve full-ATS acceptance değerlerini
  `false` tutar;
- bütün PRE-G0 action/production gate'lerini kapalı tutar.

Önceden üretilmiş bir rediscovery receipt tarihsel audit artefaktı olarak
kalabilir; current eligibility değildir. `getRediscoveryTraceStatus()` source
proposal tombstone sonrası `TRACE_INVALIDATED_BY_TOMBSTONE` döndürür. Her
consumer action öncesi current trace status'ü yeniden çözmelidir.

## 5. Ürün yüzeyi ve acceptance ayrımı

Contract merge'i P6.3 ürün acceptance'ı değildir. Dedicated platform-web
Skills Ontology/Talent Rediscovery yüzeyi en az şunları göstermelidir:

- release version, source/license/provenance ve supersedes lineage;
- concept label ref/locale, deprecated state ve graph relation drill-down;
- mapping başına exact evidence/citation/entailment closure;
- görünür `PROPOSAL ONLY`, `AI_SUGGESTED`, `UNSPECIFIED ORDER` ve disabled
  action;
- consent/purpose/opt-out, appeal/correction ve tombstone invalidation state;
- desktop + 390 px, keyboard/focus order ve accessible names.

Dedicated browser acceptance ve gerçek partner/owner gate'i oluşmadan issue
`Done` veya ürün “canlı/uygun/full ATS” sayılmaz.

## 6. Standart ve rakip sınırı

- ESCO/O*NET: referans taxonomy source/provenance yönü; parity iddiası yok.
- HR Open: entegrasyon/veri değişim yönü; ontology certification iddiası yok.
- EU AI Act Art.14 yönü: human oversight ve action guard tasarımı; conformity
  iddiası yok.
- Greenhouse/Workday/LinkedIn-style skills/talent discovery, ürün benchmark
  kategorisidir. Hedef farklılaşma exact citation lineage, immutable ontology
  version, visible correction/deletion trace ve egemen deployment
  abstraction'ıdır. Rakip paritesi veya üstünlük kanıtlanmış değildir.
