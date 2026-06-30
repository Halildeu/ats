# Release Evidence Manifest (supply-chain / air-gap doğrulama)

> **Public · living document.** Air-gapped/on-prem teslimde verilen paketin **doğrulanabilir kanıt** manifesti — on-prem checklist §2'nin **supply-chain evidence subset'i** (tam §2 değil; chain-of-custody/internal-registry-import/egress-zero-preflight/trust-root-rotation gibi operasyonel adımlar PRIVATE on-prem checklist'te kalır). "Verdiğiniz paketin doğrulanabilir kanıt formatı nedir?" sorusunun cevabı ([[ATS-0007]] §6).
> **Gate sınırı (No Fake Work):** Bu **şema + örnek + guard bir SÖZLEŞMEdir**; CI yeşili = şema/sample drift. **Gerçek build evidence** (cosign imza, gerçek SBOM, SLSA attestation, gerçek vuln-scan) = release pipeline P3/gate-locked — bu doküman onların üretildiğini iddia ETMEZ.
> **Şema:** [contracts/schemas/release-evidence.schema.json](../../contracts/schemas/release-evidence.schema.json) · **Örnek:** [contracts/samples/release-evidence.sample.json](../../contracts/samples/release-evidence.sample.json) · **Drift guard:** `scripts/check-release-evidence.mjs` (CI `release-evidence-guard`).

## 0. İlke (fail-closed)

- **Digest-pin:** image/release **moving-tag** (`:latest`/`:main`/`:stable`/`:edge`/`:dev`) YASAK; her image `sha256:` digest taşır (D30 immutable-artifact disiplini).
- **Vuln disposition:** shippable release `vuln_scan.critical=0` + `high=0` (çözülmemiş critical/high YASAK); `disposition.critical_high_resolved: true`.
- **Doğrulanabilirlik:** SBOM (spdx/cyclonedx) + **cosign/notation imza** + `verified_offline: true` (air-gap'te offline doğrulama) + **SLSA provenance** (L1-L3) + **trust-root** + revocation kontrolü.
- **Model artefakt:** her model `sha256:` digest + provenance_ref (model zehirlenmesi guard — T-T3b).

## 1. Bölümler (şema required)

| Bölüm | Anlam |
|---|---|
| `release_ref` / `generated_at` | sürüm kimliği + üretim zamanı |
| `package` | checksum-manifest + digest + offline-verification ref |
| `images[]` | `name` + `sha256:` digest + base-image-provenance (moving-tag yasak) |
| `sbom` | format (spdx/cyclonedx) + ref + digest + tool |
| `vuln_scan` | tool + scanner-DB + report + `critical`/`high` (0 olmalı) |
| `license_scan` / `secret_scan` | tool + report + `policy_violations`/`findings` (0 olmalı) |
| `provenance` | predicate-type + SLSA-level + attestation(+digest) + **subject_digests** (image'a bağlı) + source-repo/commit + build-type |
| `signature` | cosign/notation + **expected_subject** + issuer/CA + key-id + trust-root + revocation + offline-verify + transparency + `verified_offline:true` |
| `model_artifacts[]` | model digest + provenance |
| `disposition` | `critical_high_resolved` + `revocation_checked` + patch-SLA |

## 2. Doğrulama (drift-guard `scripts/check-release-evidence.mjs`)

- Minimal JSON-Schema validator (no-dep, `$ref`/`$defs`/`pattern`/`minimum`/`maximum`/`maxItems`/integer; canonical-uniqueItems; unsupported-keyword FAIL).
- Cross-invariant: `vuln_scan.critical/high=0` + `license_scan.policy_violations=0` + `secret_scan.findings=0`; **provenance.subject_digests image digest'lerini kapsamalı** (attestation subject-binding); image/release **moving-tag yasak** (digest-pin; kolonsuz `latest`/`main` dahil).
- Gömülü self-test: **17 negatif vektör** (unresolved-crit/high, moving-tag-release/image/bare, bad-digest, verified-offline-false, disposition-not-resolved, missing-provenance/signature-subject, bad-slsa, unsupported-keyword, license-violation, secret-finding, provenance-subject-mismatch, maximum-enforced) her CI koşusunda fail-doğrulanır.

## 3. Bağlantı
- [[ATS-0007]] §6 (supply-chain/update-integrity) · [docs/security/threat-register.md](./threat-register.md) T-T3a/T-T3b · [docs/security/control-map.md](./control-map.md) (tedarik-zinciri/vuln satırları) · on-prem checklist §2 (PRIVATE air-gap import).
