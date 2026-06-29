# Evidence Packet / Audit Export Manifest (canonical)

> **Public · living document.** Ürünün **çekirdeği**: citation-backed + insan-onaylı + denetlenebilir **mülakat kanıt paketi**'nin kanonik içeriği. "Paketin içinde ne var, ham medya var mı, citation nasıl gösterilir, model versiyonu nerede, WORM hash'i nasıl doğrulanır?" sorusunun tek cevabı. ([[ATS-0004]] citation/human-approval · [[ATS-0005]] assist-not-conduct · [[ATS-0003]] WORM/redaction).
> **Gate sınırı (No Fake Work):** Bu **şema + örnek + guard bir SÖZLEŞMEdir**; CI `evidence-packet-guard` yeşili = şema/sample drift kontrolü. **Runtime packet generation, redaction/serializer enforcement, gerçek export = P1/G0 sonrası gate-locked** — bu doküman onların yapıldığını iddia ETMEZ. Tüm alanlar **opak ref** (serbest metin yok → değer-düzeyinde PII smuggling pattern ile engellenir).
> **Şema:** [contracts/schemas/evidence-packet.schema.json](../../contracts/schemas/evidence-packet.schema.json) (Draft 2020-12, `additionalProperties:false`).
> **Örnek:** [contracts/samples/evidence-packet.sample.json](../../contracts/samples/evidence-packet.sample.json).
> **Drift guard:** `scripts/check-evidence-packet.mjs` (CI job `evidence-packet-guard`) — sample şemaya uyar + yasak alan yok + claim invariantı.

## 0. İlke (fail-closed)

- **Ham içerik YOK:** paket ham medya/transkript/PII **taşımaz**; yalnız referans + hash (`excluded_raw_content: true`, [[ATS-0003]]).
- **Skor/sıralama/affect YOK:** `score`/`ranking`/`affect`/`sentiment`/`emotion` alanları **şema + örnek + guard** seviyesinde yasak ([[ATS-0005]] assist-not-conduct).
- **Her iddia citation'lı:** `claims[].source_segment_refs ≥ 1` + `entailment` (supported/partially/unsupported). **unsupported iddialar karar-kanıtı olarak SUNULMAZ** (`flag-and-exclude-from-decision`).
- **İnsan hesap-verebilirliği:** `human_decision` = **6 pointer** (`human_actor_ref`/`oversight_role_ref`/`human_authored_rationale_ref`/`source_evidence_refs`/`ai_output_version_ref`/`decision_outcome_ref`) — [docs/governance/human-oversight-standard.md](../governance/human-oversight-standard.md) FINALIZED ile **birebir** hizalı. `source_evidence_refs` yalnız / +  claim'lere işaret edebilir (guard).
- **Bütünlük/provenance:** `generated_at` · `generator_version_ref` · `locale`/`timezone` · `integrity` (sha256 schema/packet digest + signature_ref) · `worm_chain_refs` · `ai_assistance_disclosure_ref` · `export_event_ref`.

## 1. Bölümler (şema required)

| Bölüm | Anlam |
|---|---|
| `schema_version` | `evidence-packet/v1` (const) |
| `packet_id` / `tenant_ref` | paket kimliği + opak tenant |
| `generated_at` / `generator_version_ref` / `locale` / `timezone` | üretim provenance (ISO-8601 / opak ref / `tr-TR` / `Europe/Istanbul`) |
| `ai_assistance_disclosure_ref` | AI-destekli olduğunun açıklaması (EU AI Act Art.50) |
| `interview_refs` / `consent_refs` | mülakat + rıza referansları (≥1) |
| `rubric` | `rubric_version_ref` + criteria (her biri `job_relatedness_rationale_ref` — iş-ilişkili; round-2 #5 ile hizalı) |
| `claims` | iddia↔kaynak-segment + entailment + `human_reviewed` (citation fail-closed; criterion↔claim coverage) |
| `unsupported_claim_policy` | `flag-and-exclude-from-decision` (const) |
| `human_decision` | 6 accountability pointer (human-oversight FINALIZED) + `source_evidence_refs` |
| `model_version_ref` | model/sürüm (EU AI Act Art.12/13) |
| `worm_chain_refs` | WORM ledger entry hash-zincir referansları (≥1) |
| `redaction` | `applied: true` + `redaction_policy_ref` + `redaction_run_ref` (TC-Kimlik/PII redaction) |
| `excluded_raw_content` | `true` (const — ham içerik pakette yok) |
| `retention_policy_ref` | saklama/erasure politika referansı (data-lifecycle) |
| `integrity` | `digest_algorithm: sha256` + `schema_digest` + `packet_digest` (hex64) + `signature_ref` (tamper-evidence) |
| `export_event_ref` | export olayı referansı (chain-of-custody) |

## 2. Doğrulama (drift-guard `scripts/check-evidence-packet.mjs`)

- Minimal JSON-Schema validator (no-dep): sample şemaya uyar (type/const/enum/required/`additionalProperties:false`/items/minItems/uniqueItems/minLength).
- Forbidden-field deep-scan (şema + sample): ham/PII/skor/affect alan adları hiçbir yerde yok.
- Claim invariantı: her claim `source_segment_refs≥1` + geçerli entailment; unsupported policy = flag-and-exclude.

## 3. Bağlantı
- [[ATS-0004]] (citation/eval/human-approval) · [[ATS-0005]] (assist-not-conduct) · [[ATS-0003]] (WORM/redaction) · human-oversight-standard (FINALIZED) · data-lifecycle (`evidence_packet`/`claim_citation_ref`) · eu-ai-act Art.12/13. PRIVATE: redacted sample-evidence-packet (`ats-strategy`).
