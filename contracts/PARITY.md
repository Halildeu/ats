# ATS-0001 Contract Parity (TS canonical ↔ Java mirror)

> Codex WS-3 drift-guard: `backend/contracts-java` (Java) **mirror**'dır; `contracts/` (TS) **kanonik**tir.
>
> **Test kapsamı (dürüst sınır):** otomatik parity testleri (`parity.contract.test.ts` + `ParityTest.java`) yalnız **metot-adı yüzeyini** kilitler — parametre/dönüş **tipi**, DTO **shape**'i veya enum değerlerini karşılaştırmaz. **Tip/shape parity** bu dokümandaki tablolarla elle güvence altına alınır + kodda hizalı tutulur; tam yapısal parity ileride **contract codegen** ile otomatikleşecek (ATS-0007 hardening, deferred). Yani: metot-adı drift'i → test kırmızı; tip/shape drift'i → bu doküman + review yakalar.

## Kanonik yüzey (4 sözleşme)

| Sözleşme | Metotlar (kanonik) |
|---|---|
| **IdentityTenant** | `resolveTenant`, `assertTenantScope` |
| **EvidenceLedger** | `append`, `appendTombstoneEvent`, `getById`, `list` |
| **AIProvider** | `transcribe`, `cite` |
| **ATSConnector** | `exportPacket`, `writeBack` |

## YASAK yüzey (her iki tarafta da olmamalı — ADR-0005 + scope-freeze)
`score`/`rank`/`fit`/`recommend`/`compare`/`sentiment`/`emotion`/`affect`/`reject`/`autoDecision`/`autoReject` ·
`createCandidate`/`updateCandidate`/`advanceCandidate`/`writeScore`/`moveStage` ·
EvidenceLedger'da `update`/`delete`/`overwrite`/`purge`/`replace`/`remove` (WORM).

## Tip / shape parity (elle güvence — kod hizalı)
- `Outcome<T>` fail-closed (TS `{ok,code,reason}` ↔ Java sealed `Ok|Fail`).
- `JsonValue` derin-immutable (TS sealed union ↔ Java sealed interface).
- Branded id'ler (TS `Brand<string>` ↔ Java `Ids.*` record) — runtime düz string.

### DTO field-set (TS ↔ Java birebir)
| DTO | Alanlar |
|---|---|
| `EvidenceEvent` | tenantId, actorId, interviewId, eventType, occurredAt, idempotencyKey, contentHash, payload(JsonObject) |
| `LedgerEntry` | **flat** = EvidenceEvent alanları **+** evidenceId, sequence, previousHash, entryHash (TS `extends EvidenceEvent` ↔ Java düz record — nesting YOK) |
| `LedgerListFilter` | interviewId?, eventType? (ikisi de nullable) |
| `list()` imzası | `(tenantId, filter?)` — TS opsiyonel filter ↔ Java nullable `LedgerListFilter` (interviewId + eventType) |

> Codex WS-3 tespitiyle hizalandı: Java `list` eskiden yalnız `eventType` alıyordu (interviewId yoktu) + `LedgerEntry` nested'di → ikisi de TS-flat canonical'a çekildi.

> Değişiklik kuralı: bir sözleşmenin yüzeyi değişince **önce bu tablo** + iki taraftaki parity testi güncellenir; sonra impl. Aksi halde parity testi kırmızı.
