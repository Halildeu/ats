# Security Posture Whitepaper — TASLAK

> ⚠️ TASLAK — `[OWNER/INFOSEC DOLDURUR]`. **Sertifika/garanti DEĞİL** (SOC2/ISO yok); mimari duruş + kontrol iskeleti (ATS-0007). Pilot'a göre kesinleşir.

## 1. Tenant izolasyon (ATS-0002)
- Logical (default): tenant_id + row-level + Keycloak realm/tenant ayrımı; her sorgu tenant-filtre (fail-closed default-deny).
- Dedicated (yüksek-güvence): ayrı namespace + DB/şema + medya bucket.
- On-prem/BYO-region (sovereign): tam ayrı kurulum (ATS-0006, gate'li).
- Boundary contract test (DB/API/object-key/job/log/export/backup) = pilot-open P0.

## 2. Key management (ATS-0007)
- Per-tenant encryption + **KMS**; secret rotation; backup şifreli; anahtarlar uygulama dışı (Vault/KMS).
- Erasure: salt-key destruction → unlinkable tombstone.

## 3. Erişim & kimlik
- RBAC least-privilege (audit-reader ≠ editor ≠ admin); admin impersonation loglu+sınırlı; break-glass time-boxed + dual-control + değişmez kayıt; SSO/SCIM (P4).

## 4. AI-spesifik tehditler
- Prompt-injection (içerik-veri/talimat ayrımı); malicious attachment (tarama/sandbox); transcript-poisoning (kaynak doğrulama); model-output PII leak guard; citation-tamper (entailment + fail-closed).

## 5. Bütünlük & denetim
- WORM audit (tamper koruması); model/version + human-oversight log.

## 6. Supply-chain (ATS-0007)
- Signed images + SBOM + dependency/container vuln-scan + model artifact provenance/hash + release attestation + egress allowlist + incident-response.
- **Mevcut repo kontrolleri (kanıt):** GitHub Actions SHA-pin · gitleaks secret-scan · dependency-review · native secret-scanning + push-protection + Dependabot. (CI: `.github/workflows/`)

## 7. Olay müdahale
- Bkz. [incident-response-runbook.md](./incident-response-runbook.md).

> `[INFOSEC DOLDURUR]` partner-özel detay. Bu doküman **mimari duruş**tur; bağımsız denetim/sertifika ayrı süreç.
