# ATS Threat Register (STRIDE + LINDDUN → control → test)

> **Public · living document.** [[ATS-0007]] güvenlik/threat-model kararını **izlenebilir register**'a döker:
> her tehdit stabil ID + STRIDE/LINDDUN sınıfı + bileşen + kontrol + **doğrulama (test/CI path)** + durum taşır.
> Strateji/ticari içerik burada **yoktur** (private `ats-strategy`). Bu register ürünün güvenlik/mahremiyet
> duruşunun alıcı-görür (procurement) yüzeyidir.
>
> - **Son gözden geçirme:** 2026-06-29 · **Sonraki:** her yeni sözleşme/bileşen/tehdit-sınıfı eklemesinde.
> - **Karar kaynağı (ADR):** [[ATS-0007]] (+ [[ATS-0001]]/[[ATS-0002]]/[[ATS-0003]]/[[ATS-0004]]/[[ATS-0005]]).
> - **Drift guard:** `scripts/check-threat-register.mjs` (CI job `threat-register-guard`) — status vocabulary,
>   ID tekilliği ve **enforced satırlarının repo'da mevcut path'e bağlı olması** makine-doğrulanır.

## 0. Statü vocabulary (kesin anlam — No Fake Work)

| Statü | Anlam |
|---|---|
| `enforced (CI)` | Kontrol bugün **CI'da koşan** bir test/guard ile zorlanır (PR'da kırmızı yapar). Verification hücresi **mevcut repo path** içerir. |
| `enforced (repo-test)` | Repo'da test var ama henüz CI-required değil. (Şu an kullanılmıyor; eklenirse path zorunlu.) |
| `gate-locked` | Kontrol **tasarımı kabul**, kodu pilot-onayı (release approval) / onay-sonrası fonksiyonel build'e bağlı. "Yapıldı" DENMEZ. |
| `design` | Karar verildi, kod öncesi (örn. veri modeli gün-1 gereği). |
| `accepted-risk` | Kontrol yok, risk **bilinçli + tarihli** kabul edildi (sessizce `design`'a gömülmez). |

> Kapsam: pilot-öncesi (pre-pilot) yalnız sözleşme/iskelet kodu vardır; bu yüzden bugün `enforced` olanlar
> gate-safe guard'lardır. `enforced` → kanıt zinciri: ilgili test CI'da koşar + verification path mevcuttur.

## 1. Bileşenler & güven sınırları (trust boundaries)

| # | Bileşen | Güven sınırı | Hassasiyet |
|---|---|---|---|
| K1 | ATS-connector (export/narrow write-back) | dış ATS ↔ ürün | aday-PII dışa akış kanalı |
| K2 | IdentityTenant (token→tenant) | istemci ↔ ürün | authn/authz girişi |
| K3 | Ingest (medya/transkript upload) | yükleyen ↔ ürün | ham medya + kötücül içerik + medya-özgünlüğü |
| K4 | AIProvider (STT/diarization/citation) | ürün ↔ model/provider | prompt-injection · output-leak · provider-retention · maliyet-DoS |
| K5 | EvidenceLedger (WORM audit) | tüm yazıcılar ↔ ledger | bütünlük/denetim kaynağı |
| K6 | Depolama (DB/pgvector/object store) | ürün ↔ persistence | tenant-izolasyon + at-rest |
| K7 | Tedarik zinciri (image/dep/model artifact) | build/CI ↔ runtime | provenance/güncelleme bütünlüğü |
| K8 | Key management (KMS/secret/backup-key) | ürün ↔ KMS/Vault | per-tenant şifreleme + rotation + erasure salt-key |

## 2. STRIDE register

| ID | STRIDE | Bileşen | Tehdit | Kontrol | Doğrulama | Durum |
|---|---|---|---|---|---|---|
| **T-S1** | Spoofing | K2 | Geçersiz/eksik token ile sahte tenant bağlamı | Fail-closed `resolveTenant` (default tenant ÜRETİLMEZ) — [[ATS-0002]] | `contracts/test/identity-tenant.contract.test.ts` (sözleşme/stub seviyesi; runtime IdP gate-locked) | enforced (CI) |
| **T-S2** | Spoofing | K1 | ATS-connector kimlik taklidi / aşırı yetki | Per-tenant least-privilege credential; default `NOT_CONFIGURED` | runtime cred-scope testi | gate-locked |
| **T-S3** | Spoofing | K3 | Aday kimlik taklidi / deepfake / medya özgünlüğü | Medya-authenticity sinyalleri + insan-onayı (assist; otomatik karar YOK) — [[ATS-0005]] | ileri faz authenticity kontrolü | design |
| **T-T1** | Tampering | K5 | Audit kaydının değiştirilmesi/silinmesi | WORM append-only; `update/delete/overwrite/purge` yüzeyde YOK — [[ATS-0003]] | `contracts/test/evidence-ledger.contract.test.ts` (deep-immutable + hash-chain; sözleşme/stub) — kalıcı WORM storage gate-locked | enforced (CI) / gate-locked (storage) |
| **T-T2** | Tampering | K4 | Transcript-poisoning (kaynak transkript manipülasyonu) | Kaynak doğrulama + entailment-citation fail-closed — [[ATS-0004]] | pipeline kaynak-verify (gate-locked); fail-closed metrik invariant: `ai/eval-harness/tests/test_metrics.py` | gate-locked |
| **T-T3a** | Tampering | K7 | Secret sızıntısı / zafiyetli yeni bağımlılık / mutable action | Secret scan + yeni-dep vuln review + SHA-pinned actions — [[ATS-0007]] §6 | `.github/workflows/security.yml` (gitleaks + dependency-review) | enforced (CI) |
| **T-T3b** | Tampering | K7 | İmaj/model-artefakt zehirlenmesi (signing/SBOM/provenance) | Signed images + SBOM + container-scan + model-artifact hash/provenance + release attestation | release pipeline (P3) | gate-locked |
| **T-R1** | Repudiation | K5 | "Bu kararı ben vermedim" inkârı | Olay actor+occurredAt+idempotencyKey+contentHash hash-zincirli LedgerEntry | `contracts/test/evidence-ledger.contract.test.ts` (hash chain + sequence; sözleşme/stub) | enforced (CI) |
| **T-R2** | Repudiation | K5 | Olay anında kanıt üretememe (operational) | Incident-response runbook + audit-evidence export — [[ATS-0007]] §6 | runbook + export pipeline | gate-locked |
| **T-I1** | Info-disclosure | K6 | Cross-tenant veri sızıntısı (depo/sorgu/job/log/backup) | Tenant-scoped her yüzey + per-tenant KMS; kod-seviye fail-closed — [[ATS-0002]] | `backend/contracts-java/src/test/java/com/ats/contracts/ContractTest.java` (`assertTenantScope` TENANT_SCOPE_VIOLATION; sözleşme) — storage scoping gate-locked | enforced (CI) / gate-locked (storage) |
| **T-I2** | Info-disclosure | K4 | Model çıktısında PII sızıntısı (model-output-leak; operasyonel log düzlemi ayrı → T-I6) | LLM çıktı PII-guard + citation = yalnız kaynak alıntı — [[ATS-0004]]/[[ATS-0005]] | output-redaction testi (runtime, gate-locked) | gate-locked |
| **T-I3** | Info-disclosure | K1 | Egress/connector üzerinden veri exfil | Egress allowlist (model/provider/ATS yolu) — [[ATS-0007]] §6 | netpol + deployment checklist | gate-locked |
| **T-I4** | Info-disclosure | K8 | Key compromise / cross-tenant key reuse / rotation-failure / backup-key leak / salt-destruction failure | Per-tenant KMS key · rotation politikası · şifreli backup · erasure=salt-key destruction — [[ATS-0007]] §2, [[ATS-0003]] | KMS/rotation/break-glass testleri | gate-locked |
| **T-I5** | Info-disclosure | K4 | Provider retention/training/log kanalına aday verisi sızması | No-train/DPA + provider-retention-off + self-host mode + egress allowlist + audit evidence — [[ATS-0004]] | provider sözleşme + config conformance | gate-locked |
| **T-I6** | Info-disclosure | K6 | Operasyonel telemetri/log kanalına PII sızması veya log-exfiltration (model-output-leak'ten ayrı; teşhis/observability düzlemi) | Kanonik event taksonomi + zarf + **fail-closed PII-redaction invariantı** (yasak `pii_class` registry'de imkânsız) + tenant-safe log RBAC + on-prem egress-yok — [[ATS-0010]], [[ATS-0007]] §6 | `scripts/check-event-taxonomy.mjs` (CI `event-taxonomy-guard`; registry fail-closed) — runtime serializer redaksiyonu gate-locked (P1) | enforced (CI) / gate-locked (runtime) |
| **T-D1** | DoS | K3 | Büyük/kötücül upload ile kaynak tüketimi | Boyut/oran limiti + attachment sandbox/scan | ingest guard | gate-locked |
| **T-D2** | DoS | K4 | AI/provider maliyet & kota DoS (runaway job, provider outage, queue exhaustion) | Per-tenant quota · job timeout · backpressure · circuit-breaker · retry budget | orchestration guard | gate-locked |
| **T-E1** | Elevation | K2/K6 | RBAC bypass (audit-reader → editor/admin) | Least-privilege RBAC; admin-impersonation loglu+sınırlı; break-glass time-boxed+dual-control — [[ATS-0007]] §3 | RBAC test matrisi + break-glass dual-control testi | gate-locked |
| **T-E2** | Elevation | K4 | Prompt-injection (transkript içeriği → LLM talimatı) | İçerik-veri/talimat ayrımı; transkript asla talimat taşımaz — [[ATS-0007]] §4 | prompt-injection red-team fixture (eval-harness uzantısı) | gate-locked |
| **T-E3** | Elevation | K1 | Ürün boundary ihlali (platform iç-paket import) | Primitives-via-interfaces; iç-paket import YASAK — [[ATS-0001]] | `scripts/check-boundary.sh` (CI `boundary-guard`) | enforced (CI) |

## 3. LINDDUN privacy register

| ID | LINDDUN | Tehdit | Kontrol | Doğrulama | Durum |
|---|---|---|---|---|---|
| **P-L1** | Linkability | Tombstone/silme sonrası kalan içerikle yeniden ilişkilendirme | Unlinkable tombstone + ham içerik key-destruction; ledger metadata kalır — [[ATS-0003]] | `contracts/test/evidence-ledger.contract.test.ts` (tombstone; sözleşme) — erasure pipeline gate-locked | enforced (CI) / gate-locked (erasure) |
| **P-I1** | Identifiability | Diarization etiketinin kimliğe bağlanması (provider `speaker`'a gerçek ad koyar) | Pseudonymous speaker invariant ("S1"/"S2"; ad/e-posta/telefon YASAK) — provider çıktı guard | output-conformance testi | gate-locked |
| **P-N1** | Non-repudiation (privacy) | Aday rızasının izlenememesi | Açık rıza + aydınlatma kaydı; consent olayı ledger'da — [[ATS-0003]] | consent-event ingest | gate-locked |
| **P-D1** | Detectability | Kayıt varlığının yetkisiz tespiti | Tenant-scoped listeleme; başka tenant girdisi boş/`NOT_FOUND` | `contracts/test/evidence-ledger.contract.test.ts` (list tenant-scope) + `backend/contracts-java/src/test/java/com/ats/contracts/ContractTest.java` | enforced (CI) |
| **P-D2** | Disclosure of info | Aşırı veri toplama / amaç dışı kullanım | Veri-minimizasyon; assist-only (scoring/affect YOK) — [[ATS-0005]] | `contracts/test/surface-parity.contract.test.ts` (forbidden decision/affect surface) — retention+collection minimization gate-locked | enforced (CI) / gate-locked (retention) |
| **P-U1** | Unawareness | DSAR/erişim hakkının işletilememesi | DSAR + VERBIS + aydınlatma (KVKK) — [[ATS-0003]] | DSAR endpoint | gate-locked |
| **P-C1** | Non-compliance | EU AI Act / KVKK uyum boşluğu | Assist-posture + audit verisi gün-1 + transparency log — [[ATS-0005]] | uyum checklist (private procurement) + bias-audit veri modeli | design |

## 4. Kontrol ↔ makine-uygulama özeti (bugün CI-enforced)

| Kontrol sınıfı | Guard (CI job) | Repo path |
|---|---|---|
| Ürün boundary | `boundary-guard` | `scripts/check-boundary.sh` |
| Sözleşme yüzeyi + YASAK yüzey (score/affect/WORM-mutate) | `contracts` + `backend` | `contracts/test/surface-parity.contract.test.ts` · `backend/contracts-java/src/test/java/com/ats/contracts/SurfaceParityTest.java` |
| WORM derin-immutability + hash chain + tenant-scope | `contracts` + `backend` | `contracts/test/evidence-ledger.contract.test.ts` · `backend/contracts-java/src/test/java/com/ats/contracts/ContractTest.java` |
| Citation fail-closed metrik invariant | `ai-eval` | `ai/eval-harness/tests/test_metrics.py` |
| Tedarik zinciri (secret/dep/SHA-pin) | `gitleaks` + `dependency-review` | `.github/workflows/security.yml` |
| Register bütünlüğü (bu doküman) | `threat-register-guard` | `scripts/check-threat-register.mjs` |
| Operasyonel event taksonomi (PII-redaction fail-closed invariantı, T-I6) | `event-taxonomy-guard` | `scripts/check-event-taxonomy.mjs` |

## 5. Gate ilişkisi

- `enforced (CI)` kontroller pilot-öncesi gate-safe yüzeyi korur (drift/forbidden-surface/supply-chain/register-bütünlüğü).
- `gate-locked` kontroller [[ATS-0007]] release-approval gate + onay-sonrası fonksiyonel build'le implement edilir;
  kontrol **tasarımı** burada kilitli, **kodu** onaya bağlı (No Fake Work: "yapıldı" denmez).
- `gate-locked` → `enforced (CI)` geçişi yalnız ilgili testin CI'da yeşil kanıtıyla + verification path eklenerek.

## 6. Bilinçli kabul edilen riskler (accepted-risk)

_(Şu an boş.)_ Kontrolsüz bir tehdit kalırsa burada **tarihli + gerekçeli** listelenir; sessizce `design` altında gizlenmez.

## 7. Retired ID'ler

_(Şu an boş.)_ Bir tehdit kapsam dışı kalırsa ID **geri-kullanılmaz**; burada `retired` olarak kalır.

## Bağlantı
- [[ATS-0007]] (karar) · [[ATS-0002]] tenant-izolasyon · [[ATS-0003]] KVKK/WORM · [[ATS-0004]] citation · [[ATS-0005]] AI-governance · [[ATS-0001]] boundary.
