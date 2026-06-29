# ATS Threat Register (STRIDE + LINDDUN → control → test)

> **Public · living document.** [[ATS-0007]] güvenlik/threat-model kararını **izlenebilir register**'a döker:
> her tehdit stabil ID + STRIDE/LINDDUN sınıfı + etkilenen bileşen + kontrol + **doğrulama (test/CI/manuel)** + durum taşır.
> Strateji/G0/rekabet/iç-altyapı içeriği burada **yoktur** (private `ats-strategy`). Bu register ürünün
> güvenlik/mahremiyet duruşunun alıcı-görür (procurement) yüzeyidir.
>
> Durum kodları: **enforced** = makine-uygulanan test/CI guard var · **gate-locked** = P1/G0=GO sonrası
> implement edilecek, kontrol tasarımı kabul · **design** = kararı verilmiş, kod öncesi.
>
> Kapsam notu: pre-G0 yalnız sözleşme/iskelet kodu var; bu yüzden bugün **enforced** olanlar gate-safe
> guard'lar (boundary, contract-surface parity, WORM-immutability, eval fail-closed, supply-chain CI).
> P1 yüzeyine ait kontroller **gate-locked**'tır — "yapıldı" demiyoruz, "tasarımı kilitli + testi tanımlı".

## 1. Bileşenler & güven sınırları (trust boundaries)

| # | Bileşen | Güven sınırı | Hassasiyet |
|---|---|---|---|
| K1 | ATS-connector (export/narrow write-back) | dış ATS ↔ ürün | aday-PII dışa akış kanalı |
| K2 | IdentityTenant (token→tenant) | istemci ↔ ürün | authn/authz girişi |
| K3 | Ingest (medya/transkript upload) | yükleyen ↔ ürün | ham medya + olası kötücül içerik |
| K4 | AIProvider (STT/diarization/citation) | ürün ↔ model/provider | prompt-injection + model-output-leak |
| K5 | EvidenceLedger (WORM audit) | tüm yazıcılar ↔ ledger | bütünlük/denetim kaynağı |
| K6 | Depolama (DB/pgvector/object store) | ürün ↔ persistence | tenant-izolasyon + at-rest |
| K7 | Tedarik zinciri (image/dep/model artifact) | build/CI ↔ runtime | provenance/güncelleme bütünlüğü |

## 2. STRIDE register (component-by-component)

| ID | STRIDE | Bileşen | Tehdit | Kontrol | Doğrulama | Durum |
|---|---|---|---|---|---|---|
| **T-S1** | Spoofing | K2 | Geçersiz/eksik token ile sahte tenant bağlamı | Fail-closed `resolveTenant` (default tenant ÜRETİLMEZ) — [[ATS-0002]] | `identity-tenant.contract.test.ts` + `ContractTest.java` (UNAUTHENTICATED/DENIED) | enforced |
| **T-S2** | Spoofing | K1 | ATS-connector kimlik taklidi / aşırı yetki | Per-tenant least-privilege credential; default `NOT_CONFIGURED` | `ats-connector.contract.test.ts` (gate stub) ; P1 cred-scope | gate-locked |
| **T-T1** | Tampering | K5 | Audit kaydının değiştirilmesi/silinmesi | WORM append-only; `update/delete/overwrite/purge` yüzeyde YOK — [[ATS-0003]] | `evidence-ledger.contract.test.ts` (deep-immutable) + `parity` forbidden-surface + `SurfaceParityTest` | enforced |
| **T-T2** | Tampering | K4 | Transcript-poisoning (kaynak transkript manipülasyonu) | Kaynak doğrulama + entailment-citation fail-closed — [[ATS-0004]] | eval-harness `fail_closed_rate=1.0` invariant ; P1 ingest-verify | gate-locked |
| **T-T3** | Tampering | K7 | Bağımlılık/imaj/model artefakt zehirlenmesi | SHA-pinned actions + dependency-review + gitleaks ; (P3) SBOM + artifact hash/provenance — [[ATS-0007]] §6 | `.github/workflows/security.yml` (dependency-review fail-on high + gitleaks) | enforced (CI) / gate-locked (SBOM) |
| **T-R1** | Repudiation | K5 | "Bu kararı ben vermedim" inkârı | Her olay actor+occurredAt+idempotencyKey+contentHash hash-zincirli LedgerEntry | `evidence-ledger.contract.test.ts` (hash chain + sequence) | enforced |
| **T-I1** | Info-disclosure | K6 | Cross-tenant veri sızıntısı (depo/sorgu/job/log/backup) | Tenant-scoped her yüzey + per-tenant KMS; kod-seviye fail-closed — [[ATS-0002]] | `IdentityTenant.assertTenantScope` contract test (TENANT_SCOPE_VIOLATION) ; P1 storage scoping | enforced (contract) / gate-locked (storage) |
| **T-I2** | Info-disclosure | K4 | Model çıktısında PII sızıntısı (model-output-leak) | LLM çıktı PII-guard + citation = yalnız kaynak alıntı — [[ATS-0004]]/[[ATS-0005]] | P1 output-redaction test ; audit/observability taxonomy (backlog) | gate-locked |
| **T-I3** | Info-disclosure | K1 | Egress/connector üzerinden veri exfil | Egress allowlist (model/provider/ATS yolu) — [[ATS-0007]] §6 | P1/infra netpol ; deployment checklist (backlog) | gate-locked |
| **T-D1** | DoS | K3 | Büyük/kötücül upload ile kaynak tüketimi | Boyut/oran limiti + attachment sandbox/scan | P1 ingest guard | gate-locked |
| **T-E1** | Elevation | K2/K6 | RBAC bypass (audit-reader → editor/admin) | Least-privilege RBAC (reader≠editor≠admin); admin-impersonation loglu+sınırlı; break-glass time-boxed+dual-control — [[ATS-0007]] §3 | P1 RBAC test matrix ; break-glass dual-control test | gate-locked |
| **T-E2** | Elevation | K4 | Prompt-injection (transkript içeriği → LLM talimatı) | İçerik-veri/talimat ayrımı; transkript asla talimat taşımaz — [[ATS-0007]] §4 | P1 prompt-injection red-team fixture (eval-harness uzantısı) | gate-locked |
| **T-E3** | Elevation | K1 | Ürün boundary ihlali (platform iç-paket import) | Primitives-via-interfaces; iç-paket import YASAK — [[ATS-0001]] | `scripts/check-boundary.sh` (CI `boundary-guard`) | enforced |

## 3. LINDDUN privacy register

| ID | LINDDUN | Tehdit | Kontrol | Doğrulama | Durum |
|---|---|---|---|---|---|
| **P-L1** | Linkability | Tombstone/silme sonrası kalan içerikle yeniden ilişkilendirme | Unlinkable tombstone + ham içerik key-destruction ile silinir, ledger metadata kalır — [[ATS-0003]] | `evidence-ledger` tombstone contract test ; P1 erasure pipeline | enforced (contract) / gate-locked (erasure) |
| **P-I1** | Identifiability | Diarization etiketinin kimliğe bağlanması | `speaker` = "S1" etiketi, PII değil (sözleşme yorumu) | `ai-provider.contract.test.ts` (TranscriptSegment shape) | enforced |
| **P-N1** | Non-repudiation (privacy) | Aday rızasının izlenememesi | Açık rıza + aydınlatma kaydı; consent olayı ledger'da — [[ATS-0003]] | P1 consent-event ingest | gate-locked |
| **P-D1** | Detectability | Kayıt varlığının yetkisiz tespiti | Tenant-scoped listeleme; başka tenant girdisi `NOT_FOUND/DENIED` | `evidence-ledger.list` contract test | enforced (contract) |
| **P-D2** | Disclosure of info | Aşırı veri toplama / amaç dışı kullanım | Veri-minimizasyon; assist-only (scoring/affect YOK) — [[ATS-0005]] | `parity` forbidden-surface (score/rank/affect absent) + `SurfaceParityTest` | enforced |
| **P-U1** | Unawareness | DSAR/erişim hakkının işletilememesi | DSAR + VERBIS + aydınlatma (KVKK) — [[ATS-0003]] | P1 DSAR endpoint | gate-locked |
| **P-C1** | Non-compliance | EU AI Act / KVKK uyum boşluğu | Assist-posture + audit verisi gün-1 + transparency log — [[ATS-0005]] | eu-ai-act-readiness checklist (private procurement) ; bias-audit veri modeli | gate-locked / design |

## 4. Kontrol ↔ makine-uygulama özeti (bugün enforced)

| Kontrol sınıfı | Guard (CI/test) | Repo konumu |
|---|---|---|
| Ürün boundary | `boundary-guard` job | `scripts/check-boundary.sh` |
| Sözleşme yüzeyi + YASAK yüzey (score/affect/WORM-mutate) | contract tests + `SurfaceParityTest` (TS↔Java, codegen-grade) | `contracts/test/*` · `backend/contracts-java/.../*Test.java` |
| WORM derin-immutability + hash chain | `evidence-ledger.contract.test.ts` | `contracts/test/evidence-ledger.contract.test.ts` |
| Citation fail-closed (T-T2/T-I2 zemini) | eval-harness `fail_closed_rate=1.0` | `ai/eval-harness/` |
| Tedarik zinciri | `gitleaks` + `dependency-review` (SHA-pinned actions) | `.github/workflows/security.yml` |

## 5. Gate ilişkisi

- **enforced** kontroller pre-G0 gate-safe yüzeyi korur (drift/forbidden-surface/supply-chain).
- **gate-locked** kontroller [[ATS-0007]] Gate F (pilot-open) + P1 fonksiyonel build'le birlikte implement edilir; kontrol **tasarımı** burada kilitli, **kodu** G0=GO'ya bağlı (No Fake Work: "yapıldı" denmez).
- **design** maddeleri (örn. bias-audit veri modeli) gün-1 veri toplama gereği nedeniyle erken kararı verilmiştir.

## 6. Bakım

- Register her yeni sözleşme/bileşen/tehdit-sınıfı eklenince güncellenir (ID asla geri-kullanılmaz).
- Yeni STRIDE/LINDDUN maddesi → kontrol + doğrulama satırı zorunlu (kontrolsüz tehdit = açık risk, kabul = explicit not).
- `gate-locked` → `enforced` geçişi yalnız ilgili testin yeşil kanıtıyla yapılır.

## Bağlantı
- [[ATS-0007]] (karar) · [[ATS-0002]] tenant-izolasyon · [[ATS-0003]] KVKK/WORM · [[ATS-0004]] citation · [[ATS-0005]] AI-governance · [[ATS-0001]] boundary.
