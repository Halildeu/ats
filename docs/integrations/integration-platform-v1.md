# Integration Platform v1 (P4 contract)

> **Contract-only · PRE-G0 · runtime değil.** Bu kayıt P4 kapsamını eksiksiz tarif eder; gerçek connector, tenant, credential, API doğrulaması veya veri aktarımı üretmez. Canonical wire şeması: [`integration-platform.schema.json`](../../contracts/schemas/integration-platform.schema.json), tamamı sentetik fixture: [`integration-platform.sample.json`](../../contracts/samples/integration-platform.sample.json), drift guard: [`check-integration-platform.mjs`](../../scripts/check-integration-platform.mjs).

## 0. Sürüm ve mevcut P1 sözleşmesiyle ilişki

`connector-capability/v1` korunur: P1 wedge’in export baseline + dar evidence write-back sınırıdır. `integration-platform/v1` onu sessizce genişletmez veya yeniden yorumlamaz; P4’ün ayrı land-and-expand kontratıdır. Dört ATS-0001 stable interface değişmez. Runtime aktivasyon P4 parent [#115](https://github.com/Halildeu/ats/issues/115) acceptance sınırındadır.

## 1. Capability matrisi

| Domain           | Normatif operation alanı                                                                | Veri sınıfı                                    | Mevcut durum                                                       |
| ---------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------ |
| ATS              | candidate/interview/role **opaque ref pull** + human-approved evidence-ref push         | opaque refs · evidence packet ref · audit link | `UNVERIFIED`                                                       |
| HRIS             | role/worker ref pull + işe-alım kararı **sonrası** human-approved handoff ref           | role/worker ref · dossier metadata             | `BLOCKED`                                                          |
| Calendar / email | availability pull · slot proposal · human-approved invite/notification                  | interview ref · availability window            | `NOT_CONFIGURED`                                                   |
| SSO / SCIM       | metadata verification · human-approved provision/deprovision                            | yalnız identity-admin ref                      | `NOT_CONFIGURED`                                                   |
| Portability      | CSV ref import/export · open API read · signed webhook · tenant archive/erasure request | opaque refs · archive ref                      | `UNVERIFIED`                                                       |
| Distribution     | human-approved job-ref publish                                                          | job ref                                        | Kariyer.net **opsiyonel**, `critical_path=false`, `NOT_CONFIGURED` |

Operation adı capability’dir; çalıştığına dair kanıt değildir. `api_verified=false` ve `activation_evidence` yokluğu pre-G0’da zorunludur.

## 2. Fail-closed mutation ve karar sınırı

Her connector aşağıdaki literal policy’yi taşır:

- `human_approval_required=true`
- `idempotency_required=true`
- `decision_impact=NONE`
- `destructive_operations=DISALLOWED`
- `batch_approval=DISALLOWED`

Auto-reject, auto-hire, hidden rank/score, candidate stage/decision mutation bu kontratın operation vocabulary’sinde yoktur. HRIS `push_hire_handoff_ref`, yalnız insan tarafından daha önce verilmiş işe-alım kararının post-hire referans devridir; karar üretmez.

## 3. Envelope ve güvenilirlik

`integration-envelope/v1` gerçek payload taşımaz. Zorunlu yüzey:

- sentetik/opaque `event_id`, `tenant_ref`, `connector_id`, `correlation_id`
- tenant-prefix’li `idempotency_key`
- `sha256:<64hex>` payload digest
- operation + declared data classes
- mutating operation’da `human_approval_ref`
- pull/replay için opaque cursor (uygunsa)

At-least-once teslim duplicate üretmeye elverişlidir; consumer `(tenant_ref, idempotency_key)` üzerinde content/digest eşleşmeli idempotent replay uygular, farklı digest’i conflict olarak reddeder. Signed webhook capability’si signature doğrulaması ve pozitif replay window olmadan geçemez. Secret/token/cookie/signature value envelope’a girmez.

## 4. Veri sahipliği ve portability

Her connector `purpose`, `pii_mode=OPAQUE_REF_ONLY`, DSAR owner ve retention owner bildirir. Raw candidate email/telefon/ad, credential veya token fixture/schema içinde yasaktır. Portability kontratı:

- CSV ve tenant archive çıktısında versioned schema + digest receipt,
- import sırasında dry-run/mapping preview + idempotent apply,
- tenant erasure talebinde source/target owner ve tombstone/export receipt,
- connector exit’te credential revocation + cursor/checkpoint disposal

bekler. Bu kayıt receipt tiplerini tanımlar; runtime davranışı veya hukuki uygunluk iddiası üretmez.

## 5. Standart hizası

- JSON Schema 2020-12 ve açık schema version
- HTTP idempotency/retry semantiği ve RFC 9457 tarzı reason-code hedefi
- SCIM 2.0 (RFC 7643/7644) kimlik-yönetimi sınırı
- CloudEvents benzeri event identity/correlation alanları (normatif bağımlılık yok)
- OAuth2/OIDC/SAML yalnız auth-model metadata; secret değeri kontratta yok
- KVKK/GDPR purpose limitation, data minimization, portability ve erasure ownership

Bu liste sertifika/uygunluk beyanı değildir; uygulanacak test ve evidence sınıflarını sabitler.

## 6. Aktivasyon acceptance

Bir connector ancak hepsiyle `VERIFIED` olabilir:

1. G0=GO ve P3 compliance port acceptance,
2. partner/provider sandbox contract version,
3. credential’ı ifşa etmeyen sandbox receipt,
4. pull/push idempotency + replay + tenant-isolation testleri,
5. data-class/purpose/DSAR/retention owner acceptance,
6. human-approved mutation audit receipt,
7. owner acceptance.

Bugünkü fixture’da bunların hiçbiri yoktur; guard `VERIFIED`, `api_verified=true` veya `activation_evidence` görürse fail eder.

## 7. Doğrulama

```bash
node scripts/check-integration-platform.mjs
cd contracts
npm run typecheck
npm test
```

Guard JSON Schema’yı, altı domain kaydını, üç sentetik envelope’u ve 24 negatif self-test vektörünü doğrular.
