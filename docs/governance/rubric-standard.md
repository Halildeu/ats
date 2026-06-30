# Structured Interview Rubric Standard (canonical)

> **Public · living document.** [[ATS-0005]] (assist-not-conduct) + [[ATS-0004]] (evidence/citation) kararlarını **yapılandırılmış, iş-ilişkili (job-related) rubric sözleşmesine** döker. "Kanıt neye göre toplanıyor; AI/mülakatçı korumalı-özellik (yaş/din/etnik/sağlık/cinsiyet/medeni-hal/sendika/siyasi/hamilelik) değerlendirmeye sokabilir mi?" Greenhouse-tarzı structured-hiring disiplini + ayrımcılık/KVKK kalkanı.
> **Kapsam dürüstlüğü (No Fake Work):** Şema+guard **açık/okunabilir** korumalı-özellik ve scoring token'larının sözleşme/sample yüzeyine girmesini **fail-closed** engeller (TR-normalize + **safe-phrase-strip**; iş-ilişkili çakışmalar regression-testli — race-condition/health-domain karışık string'lerde bile kalan protected token yakalanır). Ancak **opak ref'in semantik içeriği** (örn. `c-x1` ile yaş encode etme) regex'le **garanti edilemez** → semantik protected-attribute review, rubric registry ve **insan/hukuk onayı P1/G0 sonrası gate-locked**'tır.
> **Gate sınırı (No Fake Work):** Bu **şema + örnek + guard bir SÖZLEŞMEdir**; runtime rubric editor/enforcement = **P1/G0 sonrası gate-locked**.
> **Şema:** [contracts/schemas/rubric.schema.json](../../contracts/schemas/rubric.schema.json) · **Örnek:** [contracts/samples/rubric.sample.json](../../contracts/samples/rubric.sample.json) · **Drift guard:** `scripts/check-rubric.mjs` (CI `rubric-guard`).

## 0. İlke (fail-closed)

- **Yalnız iş-ilişkili kriter:** `criterion_type ∈ {skill, competency, experience, knowledge, work_sample}`; her kriter **`job_relatedness_rationale_ref`** taşır (iş-ilişkililik gerekçesi zorunlu).
- **Korumalı-özellik YASAK:** yaş/doğum-tarihi · din/inanç/mezhep · etnik/ırk/köken/milliyet · sendika · sağlık/engellilik · cinsiyet/cinsel-yönelim · medeni-hal · siyasi-görüş · hamilelik — **hiçbir kriter id/gerekçe/değerinde** görünemez (guard reddeder; ayrımcılık + KVKK m.6 özel-nitelikli veri).
- **Skor/sıralama/affect YASAK:** `score`/`weight`/`rank`/`rating`/`affect` alanları yok ([[ATS-0005]] — AI sıralama/karar vermez; kanıt toplar, insan karar verir).
- **İzinli kanıt türleri:** `allowed_evidence_types ∈ {interview_response, work_sample, portfolio, reference_check}`.

## 1. Doğrulama (drift-guard `scripts/check-rubric.mjs`)

- Minimal JSON-Schema validator (no-dep, `$ref`/`$defs`/`pattern`/`maxLength`/`maxItems`; unsupported-keyword FAIL).
- **Protected-attribute registry (TR-normalize + safe-phrase-strip):** korumalı-özellik token'ları key+value+schema-key'de reddedilir; iş-ilişkili çakışma phrase'i çıkarılıp kalan taranır.
- **Scoring/affect yasağı:** scoring/sıralama/affect token'ları key+value+schema-key'de reddedilir.
- Her criterion `job_relatedness_rationale_ref` + geçerli `criterion_type`.
- **Korumalı-özellik kapsamı (TR+EN):** yaş/doğum-tarihi · din/inanç/mezhep · etnik/ırk/köken/milliyet · sendika · sağlık/engellilik/sağlık-durumu · cinsiyet/cinsel-yönelim/gender-identity · medeni-hal/ebeveyn/caregiver · siyasi · felsefi-inanç · sabıka-kaydı · ana-dil/aksan · dernek/vakıf-üyeliği · hamilelik. **False-positive engeli (safe-phrase-strip):** race-condition / data-race / health-domain / medical-domain / health-tech çakışma phrase'leri çıkarılır (clinical / language-skill / english-proficiency zaten protected-eşleşmez → pass).
- **Gömülü outcome-aware self-test:** **31 negatif vektör** (TR-translit yaş/ırk/inanç + sağlık-durumu/cinsel-yönelim/sabıka/ana-dil/ebeveyn/dernek/felsefi + scoring-value/field + bad-type + duplicate + missing-job-relatedness + schema-forbidden-field + unsupported-keyword + overlong-ref + **mixed allow+protected** english-native-speaker/clinical-pregnancy/race-condition-age/medical-domain-pregnancy...) **fail** + 3 ALLOW vektör (race-condition/health-domain/clinical) **pass** her CI koşusunda doğrulanır (durable regression).

## 2. Bağlantı
- [[ATS-0005]] (assist-not-conduct/bias) · [[ATS-0004]] (evidence) · evidence-packet-manifest (rubric↔claim coverage; `criterion_id` paylaşımı) · eu-ai-act Art.10 (data governance/bias). PRIVATE: sektör-bazlı rubric şablonları (`ats-strategy`).
