# Deployment Profile v1 — sovereign readiness contract

> **Faz 25 P5 · public contract · evidence-first.** Bu yüzey managed, dedicated,
> BYO-region ve sovereign on-prem topolojilerini tek codebase üzerinde ayrı
> sorumluluk ve acceptance zincirleriyle tanımlar. Şema/CI başarısı gerçek
> cluster, müşteri, partner, restore, rollback, rotation veya production kanıtı
> değildir.

Kanonik artefaktlar:

- TypeScript: `contracts/wire/deployment-profile.ts`
- JSON Schema: `contracts/schemas/deployment-profile.schema.json`
- Tamamen sentetik fixture: `contracts/samples/deployment-profile.sample.json`
- Drift guard: `scripts/check-deployment-profile.mjs`
- Supply-chain authority: `release-evidence/v1` — bu kontrat yalnız opaque ref taşır

## 1. Neden ayrı kontrat?

Enterprise HCM/ATS değerlendirmelerinde topoloji, residency, kimlik, egress,
anahtar sahipliği, geri dönüş ve support boundary birlikte satın alınır. Ancak
managed bir kurulumda geçen test, BYO-region veya on-prem kabulü değildir.
`deployment-profile/v1` bu kanıtların yanlışlıkla birbirine taşınmasını engeller.

Rakip karşılaştırma ekseni, tek bir özellik listesi değil şu satın-alma
sorularıdır: immutable paket doğrulanabiliyor mu, kim control/data plane'i
işletiyor, egress gerçekten kapalı mı, restore ve rollback ölçüldü mü, kimlik ve
anahtar rotasyonu denendi mi, audit export alınabiliyor mu ve sorumluluk sınırı
yazılı mı? Workday/SAP/Oracle gibi enterprise HCM yüzeyleriyle veya
Greenhouse/Ashby gibi SaaS ATS yüzeyleriyle kıyas yapılırken bu kontrat yalnız
kanıt formatını standardize eder; rakip üstünlüğü ya da certification iddiası
üretmez.

## 2. Dört profil, dört ayrı acceptance sınırı

| Profil | Control / data plane | İzolasyon ve residency | Support sınırı | Ücretli partner minimumu |
|---|---|---|---|---:|
| `MANAGED` | platform / platform | logical tenant + platform-approved region | platform-operated | 0 |
| `DEDICATED` | platform / platform | dedicated tenant + customer-selected region | platform-operated | 1 |
| `BYO_REGION` | shared / customer | dedicated region + customer-selected region | shared responsibility | 1 |
| `SOVEREIGN_ON_PREM` | customer / customer | customer-controlled boundary/residency | customer-operated signed bundle | 2 |

Bu sayılar fixture'ın ticari/acceptance politikasıdır. `paid_partner_count=0` ve
`partner_evidence_verified=false` iken hiçbir profile release izni verilmez.
Managed profil partner eşiği taşımadığı halde G0, bütün gate'ler ve owner kabulü
olmadan açılmaz.

## 3. Monoton readiness modeli

| Durum | Kanıt anlamı |
|---|---|
| `NOT_CONFIGURED` | Ref olabilir; config, verification veya drill iddiası yoktur. |
| `CONFIGURED` | Desired configuration hazırlanmıştır; runtime doğrulaması yoktur. |
| `VERIFIED` | Opaque evidence receipt, verifier ve UTC verification zamanı vardır. |
| `DRILL_PASSED` | Drill-required gate için ölçümlü drill receipt vardır. |
| `OWNER_ACCEPTED` | Gate owner receipt ile ayrı kabul edilmiştir. |

Profil readiness değeri sekiz gate arasındaki **en düşük** durumdur. Bir gate'in
ileri olması bütün profilin ileri olduğu anlamına gelmez. Drill gerektirmeyen
gate'ler `VERIFIED` durumundan `OWNER_ACCEPTED` durumuna geçebilir; drill-required
gate'ler ölçümlü receipt olmadan geçemez.

## 4. Sekiz bağımsız gate

1. `SUPPLY_CHAIN` — `release-evidence/v1` manifest ref ve doğrulama receipt'i.
2. `PROFILE_RENDER` — profile/overlay render ve policy doğrulaması.
3. `IDENTITY` — OIDC/SAML/SCIM metadata ve erişim sınırı.
4. `EGRESS` — allowlist/deny-default/air-gap davranış drill'i.
5. `SECRET_ROTATION` — KMS/BYOK/offline-key rotation drill'i.
6. `BACKUP_RESTORE` — encrypted backup, restore ve observed RPO/RTO.
7. `UPGRADE_ROLLBACK` — immutable upgrade ve measured rollback/RPO/RTO.
8. `AUDIT_EXPORT` — denetim artefaktı çıkarma ve bütünlük drill'i.

`BACKUP_RESTORE` ve `UPGRADE_ROLLBACK`, `DRILL_PASSED` veya daha ileri durumda
`observed_rpo_seconds` ve `observed_rto_seconds` taşımak zorundadır. Hedef değer,
gözlenen değer yerine geçmez. `recovery_objectives.targets_defined=true` ise
hedef RPO ve RTO birlikte bulunur ve gözlenen değerler hedefi aşamaz. Tüm
profiller immutable/signed release, ayrı approval ve en az `72h` rollback window
politikası taşır; PRE-G0 fixture hedef veya ölçüm başarısı iddia etmez.

## 5. Release izni — fail-closed zincir

Bir profile `release_allowed=true` denebilmesi için aynı anda:

- `activation_gate=G0_ACCEPTED_RUNTIME` ve `synthetic=false`,
- sekiz gate'in tamamı `OWNER_ACCEPTED`,
- supply-chain gate'i `release_evidence_manifest_ref` ile birebir bağlı ve verified,
- ücretli partner eşiği karşılanmış; eşik >0 ise partner evidence verified,
- profile owner kabulü ve activation receipt mevcut,
- `production_eligible=true`

olmalıdır. `production_eligible` ve `release_allowed` birbirinden kopamaz.
PRE-G0 fixture'da tüm değerler kapalıdır ve activation evidence bulunmaz.

## 6. Supply-chain tekrar edilmez

OCI digest, SPDX/CycloneDX SBOM, vulnerability/license/secret scan, SLSA/in-toto
provenance, Sigstore/cosign/notation signature, trust root, revocation ve offline
verification alanlarının sahibi `release-evidence/v1` kontratıdır.
`deployment-profile/v1` bunları yeniden modellemez; yalnız
`release_evidence_manifest_ref`, bu ref'i sabitleyen SHA-256 digest ve bağımsız
verification boolean'ı taşır. Guard,
`images`, `sbom`, `provenance`, `signature` gibi alanların bu fixture'a gömülmesini
reddeder.

## 7. Güvenlik ve mahremiyet sınırı

- Opaque ref dışında müşteri/tenant/candidate kimliği yoktur.
- Raw secret, token, password, private key, hostname, IP, URL veya cluster endpoint yoktur.
- Sample sentetiktir; gerçek müşteri, host, region coordinate veya credential içermez.
- CI, render veya ref varlığı `evidence_verified=true` yapmaz.
- Managed kanıtı dedicated/BYO/on-prem profile taşınmaz.
- ISO 27001, SOC 2 veya EU AI Act conformity/certification iddiası dış kabul olmadan yapılmaz.

## 8. Standart hizası

- OCI immutable artifact + digest pinning
- SPDX/CycloneDX SBOM
- SLSA/in-toto provenance ve Sigstore/cosign/notation doğrulaması
- Kubernetes NetworkPolicy/deny-by-default ve GitOps drift/promotion disiplini
- ISO/IEC 27001 iş sürekliliği, access/key management ve supplier evidence girdileri
- SOC 2 security/availability evidence girdileri
- NIST SP 800-53/800-34 backup, contingency ve recovery evidence dili

Bu hizalama kontrol/evidence modelidir; certification veya compliance sonucu değildir.

## 9. Doğrulama

`node scripts/check-deployment-profile.mjs` şunları birlikte kanıtlar:

- JSON Schema Draft 2020-12 subset doğrulaması ve unsupported-keyword fail-close,
- dört topolojinin eksiksiz/benzersiz olması ve sabit sorumluluk matrisi,
- sekiz gate'in profile başına eksiksiz/benzersiz olması,
- monoton state/evidence/drill/owner receipt bağı,
- supply-chain ref-only sınırı,
- partner/G0/owner/release zinciri,
- secret/PII/network coordinate yasağı,
- gömülü negatif vektörlerin tamamının gerçekten fail etmesi,
- bellekte üretilen tam kabul zincirli bir G0 runtime fixture'ının pozitif geçmesi.

Pozitif runtime fixture yalnız state-machine'in ulaşılabilir ve tutarlı olduğunu
kanıtlayan sentetik verifier girdisidir; gerçek partner, owner, cluster veya
deployment evidence iddiası değildir.

## 10. Bu child'ın done olmadığı alanlar

Bu contract/guard kabul edilse bile P5 parent kapanmaz. Dedicated/BYO/on-prem
reference architecture, gerçek imzalı paket, offline verification, cluster
preflight, backup/restore, upgrade/rollback, rotation, egress ve audit drill'i ile
en az bir gerçek partner topolojisindeki owner acceptance ayrı kanıtlanmalıdır.
