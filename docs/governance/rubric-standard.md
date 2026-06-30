# Structured Interview Rubric Standard (canonical)

> **Public · living document.** [[ATS-0005]] (assist-not-conduct) + [[ATS-0004]] (evidence/citation) kararlarını **yapılandırılmış, iş-ilişkili (job-related) rubric sözleşmesine** döker. "Kanıt neye göre toplanıyor; AI/mülakatçı korumalı-özellik (yaş/din/etnik/sağlık/cinsiyet/medeni-hal/sendika/siyasi/hamilelik) değerlendirmeye sokabilir mi?" sorusunun cevabı: **HAYIR — şema+guard düzeyinde yasak.** Greenhouse-tarzı structured-hiring disiplini + ayrımcılık/KVKK kalkanı.
> **Gate sınırı (No Fake Work):** Bu **şema + örnek + guard bir SÖZLEŞMEdir**; runtime rubric editor/enforcement = **P1/G0 sonrası gate-locked**.
> **Şema:** [contracts/schemas/rubric.schema.json](../../contracts/schemas/rubric.schema.json) · **Örnek:** [contracts/samples/rubric.sample.json](../../contracts/samples/rubric.sample.json) · **Drift guard:** `scripts/check-rubric.mjs` (CI `rubric-guard`).

## 0. İlke (fail-closed)

- **Yalnız iş-ilişkili kriter:** `criterion_type ∈ {skill, competency, experience, knowledge, work_sample}`; her kriter **`job_relatedness_rationale_ref`** taşır (iş-ilişkililik gerekçesi zorunlu).
- **Korumalı-özellik YASAK:** yaş/doğum-tarihi · din/inanç/mezhep · etnik/ırk/köken/milliyet · sendika · sağlık/engellilik · cinsiyet/cinsel-yönelim · medeni-hal · siyasi-görüş · hamilelik — **hiçbir kriter id/gerekçe/değerinde** görünemez (guard reddeder; ayrımcılık + KVKK m.6 özel-nitelikli veri).
- **Skor/sıralama/affect YASAK:** `score`/`weight`/`rank`/`rating`/`affect` alanları yok ([[ATS-0005]] — AI sıralama/karar vermez; kanıt toplar, insan karar verir).
- **İzinli kanıt türleri:** `allowed_evidence_types ∈ {interview_response, work_sample, portfolio, reference_check}`.

## 1. Doğrulama (drift-guard `scripts/check-rubric.mjs`)

- Minimal JSON-Schema validator (no-dep, `$ref`/`$defs`/`pattern`; unsupported-keyword FAIL).
- **Protected-attribute registry (TR+EN regex):** korumalı-özellik token'ları key+value'da reddedilir.
- **Scoring/affect yasağı:** scoring/sıralama/affect alan adları reddedilir.
- Her criterion `job_relatedness_rationale_ref` + geçerli `criterion_type`.
- **Gömülü self-test:** 8 negatif vektör (protected-criterion/age/value, scoring-field, bad-type, free-text-rationale, missing-job-relatedness, unsupported-keyword) her CI koşusunda fail-doğrulanır.

## 2. Bağlantı
- [[ATS-0005]] (assist-not-conduct/bias) · [[ATS-0004]] (evidence) · evidence-packet-manifest (rubric↔claim coverage; `criterion_id` paylaşımı) · eu-ai-act Art.10 (data governance/bias). PRIVATE: sektör-bazlı rubric şablonları (`ats-strategy`).
