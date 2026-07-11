# ATS-0001 Contract Parity (TS canonical ↔ Java mirror)

> Codex WS-3 drift-guard: `backend/contracts-java` (Java) **mirror**'dır; `contracts/` (TS) **kanonik**tir.
>
> **Test kapsamı (machine-enforced — full shape parity):** artık yalnız metot-adı değil; **metot param/return tipleri + DTO alan tipleri + enum üyeleri** de iki tarafta makine-uygulanır. Mekanizma:
> 1. `contracts/tools/extract-surface.ts` TS kaynağından tüm yüzeyi **AST node**'larından çıkarır → dilden-bağımsız **token vocabulary**'sine normalize eder → `contract-surface.json` (TS-strict, opsiyonellik dahil) + `contract-surface.tokens.txt` (cross-language projeksiyon).
> 2. `test/surface-parity.contract.test.ts` (vitest): re-extract → committed json + tokens ile **deep-equal**. TS'te herhangi bir tip/DTO/enum değişimi → kırmızı (bilinçli `npm run surface:gen` zorunlu).
> 3. `SurfaceParityTest.java` (JUnit): `com.ats.contracts` paket **kaynak dizininden** interface'leri keşfeder (elle liste yok) + **reflection** ile okur → aynı token vocabulary'sine map'ler → `contract-surface.tokens.txt` (JSON dep'siz, `Files.readAllLines`) ile karşılaştırır. Java tarafında tip/DTO/enum drift'i → kırmızı.
>
> **Sessiz-miss kapalı (Codex 019f131f REVISE absorbe):**
> - **Discovery, elle-liste YOK:** TS kaynak dosyaları `src/*.ts` glob ile; Java contract'ları `com.ats.contracts` paket **kaynak dizininden** keşfedilir. Yeni dosya/interface eklenince otomatik kapsama girer (eklenmeyi unutmak drift'i gizleyemez).
> - **Orphan/named enum:** committed `E` satırları canonical named-enum kümesini belirler; canonical bir enum'u named edip Java'da yoksa → fail; tanımlı ama referanssız + named-olmayan enum → fail.
> - **Fail-fast:** mixed interface (method+property) · contract inheritance · method overload · desteklenmeyen üye → iki tarafta da test kırmızı (TS extractor throw / Java `fail`).
> - **JSON `optional`+`nullable` korunur:** method param `optional`/`nullable` + DTO field `nullable` artık `contract-surface.json`'da tutulur (canon'da erimez) → TS-only deep-equal yakalar.
>
> Kanıt (negatif testler): (1) tokens.txt'e sahte satır → Java BUILD FAILURE; (2) canonical'a sahte named enum → "Java'da bulunamadı" FAILURE; geri al → yeşil. Yani metot-adı **ve** param/return tipi, DTO shape, enum üyesi, yeni-yüzef drift'i artık review değil **test** yakalar.
>
> **Dürüst kalan sınır:** (a) optional/nullable **cross-language** karşılaştırılmaz — Java record opsiyonelliği ifade edemez; TS json deep-equal ile (TS-only) kilitli. (b) numeric = **JSON-level parity** (Java `long`/`int`/`double` hepsi `number`; range/precision drift'i kapsam dışı). (c) `Entailment` enum'u top-level değil, `CitationResult.entailment` alan token'ıyla zorlanır (TS'te isimsiz inline union). (d) `CitationId` (TS branded) hiçbir yüzeyde kullanılmadığı için Java'da yok — token yüzeyinde görünmez.
>
> **Token vocabulary:** `string|number|boolean|void|Json` · `id:<Brand>` · `array:<elem>` · `outcome:<inner>` · `dto:<SimpleName>` · `enum:<sorted-members>`.

## Kanonik yüzey (4 sözleşme)

| Sözleşme | Metotlar (kanonik) |
|---|---|
| **IdentityTenant** | `resolveTenant`, `assertTenantScope` |
| **EvidenceLedger** | `append`, `appendTombstoneEvent`, `findByIdempotencyKey`, `findTombstoneForEvidence`, `getById`, `list` |
| **AIProvider** | `transcribe`, `cite` |
| **ATSConnector** | `exportPacket`, `writeBack` |

## YASAK yüzey (her iki tarafta da olmamalı — ADR-0005 + scope-freeze)
`score`/`rank`/`fit`/`recommend`/`compare`/`sentiment`/`emotion`/`affect`/`reject`/`autoDecision`/`autoReject` ·
`createCandidate`/`updateCandidate`/`advanceCandidate`/`writeScore`/`moveStage` ·
EvidenceLedger'da `update`/`delete`/`overwrite`/`purge`/`replace`/`remove` (WORM).

## Tip / shape parity (machine-enforced — extractor + reflection)
- `Outcome<T>` fail-closed (TS `{ok,code,reason}` ↔ Java sealed `Ok|Fail`).
- `JsonValue` derin-immutable (TS sealed union ↔ Java sealed interface).
- Branded id'ler (TS `Brand<string>` ↔ Java `Ids.*` record) — runtime düz string.

### DTO field-set (TS ↔ Java birebir)
| DTO | Alanlar |
|---|---|
| `EvidenceEvent` | tenantId, actorId, interviewId, eventType, occurredAt, idempotencyKey, contentHash, payload(JsonObject) |
| `LedgerEntry` | **flat** = EvidenceEvent alanları **+** evidenceId, sequence, previousHash, entryHash (TS `extends EvidenceEvent` ↔ Java düz record — nesting YOK) |
| `LedgerListFilter` | interviewId?, eventType? (ikisi de **optional** — snapshot'ta `optional:true`, `nullable:false`) |
| `list()` imzası | `(tenantId, filter?)` — TS opsiyonel filter ↔ Java nullable `LedgerListFilter` (interviewId + eventType) |

> Codex WS-3 tespitiyle hizalandı: Java `list` eskiden yalnız `eventType` alıyordu (interviewId yoktu) + `LedgerEntry` nested'di → ikisi de TS-flat canonical'a çekildi.

> Değişiklik kuralı: bir sözleşmenin TS yüzeyi değişince → `npm run surface:gen` ile `contract-surface.json` + `.tokens.txt` yeniden üret + bu tabloyu güncelle + Java mirror'ı hizala. Aksi halde: TS değişip regen edilmezse `surface-parity` (vitest) kırmızı; Java mirror hizalanmazsa `SurfaceParityTest` (JUnit) kırmızı.
