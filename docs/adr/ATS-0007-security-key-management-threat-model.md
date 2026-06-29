# ATS-0007 — Security & Key-Management Threat Model

- **Durum:** Kabul edildi (cross-AI AGREE — Codex thread 019ef3d9, REVISE→AGREE: supply-chain/update-integrity sınıfı eklendi)
- **Tarih:** 2026-06-23
- **Bağlam kaynağı:** MASTER-PLAN v3.0 §10 (threat model) · Codex residual (thread 019ef3d9: "regulated pilot açılmadan security/key-management threat model şart") · [[ATS-0002]] tenant-izolasyon · [[ATS-0003]] KVKK/erasure
- **Karar tipi:** Güvenlik / threat model (release-gate; ayrı ADR ama pilot-open şartı)

## Bağlam

Ürün regüle kurumlar için **mülakat kayıtları** (yüksek-hassasiyet aday-PII + ham medya) işler, multi-tenant. Codex foundational-set review'da net: **bu olmadan regulated pilot açılmamalı.** Master-plan §10 threat listesi (prompt-injection / malicious-attachment / transcript-poisoning / impersonation-deepfake / tenant-leak / RBAC / model-output-leak / audit-tamper) + key-management (per-tenant encryption/KMS, secret rotation, admin impersonation, break-glass, audit-reader perms, backup encryption, ATS-connector credential scope) burada karara bağlanır.

## Karar

**Threat model + kontroller pilot-open release-gate'inin parçası (Gate F); aşağıdaki 5 sınıf zorunlu.**

1. **Tenant izolasyon & sızıntı (ATS-0002 ile):** per-tenant encryption key (KMS); tenant-scoped depolama/sorgu/object-key/background-job/log/export/backup; cross-tenant erişim kod-seviye fail-closed + boundary contract test (P0).
2. **Key management:** per-tenant encryption + **KMS**; secret rotation politikası; backup **şifreli**; erasure salt-key destruction (ATS-0003 unlinkable tombstone); anahtarlar uygulama dışı (Vault/KMS deseni).
3. **Erişim & kimlik:** RBAC (audit-reader ≠ editor ≠ admin, least-privilege); **admin impersonation** = loglu + sınırlı; **break-glass** = time-boxed + dual-control + değişmez kayıt; SSO/SCIM (P4); ATS-connector credential **least-privilege + per-tenant scope**.
4. **AI-spesifik tehditler:** **prompt-injection** (transkript içeriği → LLM talimatı taşıyamaz; içerik-veri/talimat ayrımı) · **malicious attachment** (yüklenen medya tarama/sandbox) · **transcript-poisoning** (kaynak doğrulama) · **model-output-leak** (LLM çıktısında PII sızıntısı guard) · **citation-tamper** (entailment + fail-closed, ATS-0004).
5. **Bütünlük & denetim:** **audit-tamper** koruması (WORM, ATS-0003) · model/version + human-oversight log · deepfake/aday-fraud tespiti (P6 gated, ileri).
6. **Supply-chain & update integrity (Codex REVISE — en kritik kalan sınıf):** signed images/artifacts + **SBOM** + dependency/container **vuln-scan** + **model artifact provenance/hash** + release attestation + patch SLA + on-prem update **rollback drill** · **egress/network allowlist** (model/provider/ATS-connector yolu = pratik veri-sızıntı kanalı) · **incident-response runbook** + audit-evidence export ("olay olursa ne gösteriyoruz?" satıştan önce sorulur). Özellikle on-prem/BYO anlatısında imzalı/doğrulanabilir kanal olmazsa güvenlik iddiası zayıflar.

## Sonuçlar

**Olumlu:** procurement-ready güvenlik duruşu (security whitepaper / DPIA girdisi, P3); regüle alıcıya "verileriniz izole + şifreli + denetlenebilir" kanıtı; AI-spesifik tehditler baştan ele alınır.
**Olumsuz:** gerçek maliyet (KMS, rotation, break-glass tooling, attachment sandbox); sürekli threat-review yükü; prompt-injection guard AI pipeline karmaşası ekler.

## Değerlendirilen alternatifler

- **(A) Security'i sonraya bırak** — RED (Codex): regulated pilot açılamaz, ihlal = ~₺17M ceza + güven kaybı.
- **(B) Genel güvenlik (tenant-agnostik)** — RED: multi-tenant + AI-spesifik tehditler özel kontrol ister.
- **(C) Threat-model release-gate (Gate F) + per-tenant KMS + AI-guard (seçilen).**

## Bağlantı
- **İzlenebilir register:** [docs/security/threat-register.md](../security/threat-register.md) — bu kararın STRIDE/LINDDUN → kontrol → test matrisi (public, living).
- Pilot-open: G0 pilot-open release checklist Gate F (private `ats-strategy`) · [[ATS-0002]] · [[ATS-0003]] · [[ATS-0004]] citation-tamper · procurement artifact: security-whitepaper/DPIA (private, P3).
