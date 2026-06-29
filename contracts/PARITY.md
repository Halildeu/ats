# ATS-0001 Contract Parity (TS canonical ↔ Java mirror)

> Codex WS-3 drift-guard: `backend/contracts-java` (Java) **mirror**'dır; `contracts/` (TS) **kanonik**tir. İki taraf da aşağıdaki **kanonik yüzeyi** koruduğunu testle kanıtlar (`*.parity.test.ts` + `ParityTest.java`). Bir taraf imza değiştirip bu tabloyu güncellemezse test kırmızı olur.

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

## Tip parity
- `Outcome<T>` fail-closed (TS `{ok,code,reason}` ↔ Java sealed `Ok|Fail`).
- `JsonValue` derin-immutable (TS sealed union ↔ Java sealed interface).
- Branded id'ler (TS `Brand<string>` ↔ Java `Ids.*` record) — runtime düz string.

> Değişiklik kuralı: bir sözleşmenin yüzeyi değişince **önce bu tablo** + iki taraftaki parity testi güncellenir; sonra impl. Aksi halde parity testi kırmızı.
