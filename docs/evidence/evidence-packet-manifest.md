# Evidence Packet / Audit Export Manifest (canonical)

> **Public · living document.** Ürünün **çekirdeği**: citation-backed + insan-onaylı + denetlenebilir **mülakat kanıt paketi**'nin kanonik içeriği. "Paketin içinde ne var, ham medya var mı, citation nasıl gösterilir, model versiyonu nerede, WORM hash'i nasıl doğrulanır?" sorusunun tek cevabı. ([[ATS-0004]] citation/human-approval · [[ATS-0005]] assist-not-conduct · [[ATS-0003]] WORM/redaction).
> **Şema:** [contracts/schemas/evidence-packet.schema.json](../../contracts/schemas/evidence-packet.schema.json) (Draft 2020-12, `additionalProperties:false`).
> **Örnek:** [contracts/samples/evidence-packet.sample.json](../../contracts/samples/evidence-packet.sample.json).
> **Drift guard:** `scripts/check-evidence-packet.mjs` (CI job `evidence-packet-guard`) — sample şemaya uyar + yasak alan yok + claim invariantı.

## 0. İlke (fail-closed)

- **Ham içerik YOK:** paket ham medya/transkript/PII **taşımaz**; yalnız referans + hash (`excluded_raw_content: true`, [[ATS-0003]]).
- **Skor/sıralama/affect YOK:** `score`/`ranking`/`affect`/`sentiment`/`emotion` alanları **şema + örnek + guard** seviyesinde yasak ([[ATS-0005]] assist-not-conduct).
- **Her iddia citation'lı:** `claims[].source_segment_refs ≥ 1` + `entailment` (supported/partially/unsupported). **unsupported iddialar karar-kanıtı olarak SUNULMAZ** (`flag-and-exclude-from-decision`).
- **İnsan hesap-verebilirliği:** `human_decision` = 6 pointer (actor/role/rationale/outcome/ai-version) — [docs/governance/human-oversight-standard.md](../governance/human-oversight-standard.md) FINALIZED ile hizalı.

## 1. Bölümler (şema required)

| Bölüm | Anlam |
|---|---|
| `schema_version` | `evidence-packet/v1` (const) |
| `packet_id` / `tenant_ref` | paket kimliği + opak tenant |
| `interview_refs` / `consent_refs` | mülakat + rıza referansları (≥1) |
| `rubric` | `rubric_version_ref` + criteria (her biri `job_relatedness_rationale` — iş-ilişkili; round-2 #5 ile hizalı) |
| `claims` | iddia↔kaynak-segment + entailment (citation fail-closed) |
| `unsupported_claim_policy` | `flag-and-exclude-from-decision` (const) |
| `human_decision` | 6 accountability pointer (human-oversight FINALIZED) |
| `model_version_ref` | model/sürüm (EU AI Act Art.12/13) |
| `worm_chain_refs` | WORM ledger entry hash-zincir referansları (≥1) |
| `redaction` | `applied: true` + boundary-note (TC-Kimlik/PII redaction) |
| `excluded_raw_content` | `true` (const — ham içerik pakette yok) |
| `retention_notice` | saklama/erasure bildirimi (data-lifecycle) |

## 2. Doğrulama (drift-guard `scripts/check-evidence-packet.mjs`)

- Minimal JSON-Schema validator (no-dep): sample şemaya uyar (type/const/enum/required/`additionalProperties:false`/items/minItems/uniqueItems/minLength).
- Forbidden-field deep-scan (şema + sample): ham/PII/skor/affect alan adları hiçbir yerde yok.
- Claim invariantı: her claim `source_segment_refs≥1` + geçerli entailment; unsupported policy = flag-and-exclude.

## 3. Bağlantı
- [[ATS-0004]] (citation/eval/human-approval) · [[ATS-0005]] (assist-not-conduct) · [[ATS-0003]] (WORM/redaction) · human-oversight-standard (FINALIZED) · data-lifecycle (`evidence_packet`/`claim_citation_ref`) · eu-ai-act Art.12/13. PRIVATE: redacted sample-evidence-packet (`ats-strategy`).
