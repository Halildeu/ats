# ATS Connector Capability Standard (canonical registry)

> **Public · living document.** "Mevcut ATS'imize nasıl bağlanacak, API yoksa ne olur, hangi scope'ları isteyeceksiniz, aday/karar verisi yazacak mısınız?" sorusunun cevabı. [[ATS-0001]] boundary (primitives-via-interfaces) + [[ATS-0005]] assist-not-conduct disiplininde **export baseline + dar (narrow) write-back**.
> **Gate sınırı (No Fake Work):** Bu **şema + örnek + guard bir SÖZLEŞMEdir**; runtime connector = **P1/G0 sonrası gate-locked**. Narrow write-back yalnız `ats_name` + `api_verified` + `loi_condition` kanıtlarıyla (G0 kriter-3) açılır.
> **Şema:** [contracts/schemas/connector-capability.schema.json](../../contracts/schemas/connector-capability.schema.json) · **Örnek:** [contracts/samples/connector-capability.sample.json](../../contracts/samples/connector-capability.sample.json) · **Drift guard:** `scripts/check-connector-capability.mjs` (CI `connector-capability-guard`).

## 0. İlke (fail-closed)

- **Aday/iş/aşama/karar YAZIMI YASAK:** write-back yalnız `dossier_url` / `evidence_status` / `audit_completed_at` (dar dossier-metadata). **candidate/job/stage/score/reject/advance/hire** alanları şema enum + deep-scan ile yasak ([[ATS-0001]]/[[ATS-0005]]).
- **Export baseline:** `pdf` / `secure_link` / `email` / `webhook` (API gerektirmez — "API yoksa" senaryosu PDF/secure-link ile karşılanır).
- **Narrow write-back gating:** `mode=narrow_writeback` → `status=p1-evidence-required` + `p1_evidence{ats_name, api_verified, loi_condition}` (3-koşul; G0 ATS-entegrasyon teyidi). Export modunda write-back YASAK.
- **Auth:** oauth2 / api_key / service_account / none; data_classes = evidence_packet_ref / dossier_metadata / audit_link (ham aday-PII connector'dan AKMAZ).

## 1. Doğrulama (drift-guard `scripts/check-connector-capability.mjs`)

- Minimal JSON-Schema validator (no-dep, `$ref`/`$defs`/`pattern`; unsupported-keyword FAIL).
- **Forbidden write-back deep-scan** (key+value, schema+sample): candidate/job/stage/score/reject/advance/hire/rating yok.
- Cross-invariant: narrow_writeback → writeback_fields(≥1)+p1-evidence-gated; export → writeback YOK; connector_id tekil.
- Gömülü self-test: **10 negatif vektör** (forbidden-writeback-enum/key/value, writeback-without-p1, wrong-status, export-with-writeback, duplicate-id, bad-mode/auth, unsupported-keyword) her CI koşusunda fail-doğrulanır.

## 2. Bağlantı
- [[ATS-0001]] boundary · [[ATS-0005]] assist-not-conduct · [contracts/src/ats-connector.ts](../../contracts/src/ats-connector.ts) (ATSConnector sözleşmesi; export/writeBack) · evidence-packet (export edilen içerik) · G0 kriter-3 ATS-entegrasyon teyidi (PRIVATE ats-strategy). PRIVATE: per-ATS entegrasyon evidence şablonu.
