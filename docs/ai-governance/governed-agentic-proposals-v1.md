# Governed agentic proposals v1

Faz 25 P6.5, agentic davranışı sentetik ve değişmez bir **öneri zarfı** ile
sınırlar. Bu yüzey bir yürütme motoru, iş akışı otomasyonu, aday kararı,
production aktivasyonu veya compliance sonucu değildir.

Kanonik artefaktlar:

- TypeScript: `contracts/agentic/governed-agentic-proposals.ts`
- Contract testleri: `contracts/test/governed-agentic-proposals.contract.test.ts`
- İnsan karar otoritesi: `docs/governance/human-oversight-standard.md`
- Üst capability sınırı: `docs/ai-governance/intelligence-evaluation-v1.md`

## 1. Kapalı action kataloğu ve tier

| Action kind | Tier | İzin verilen anlam |
|---|---:|---|
| `INTERNAL_REVIEW_TASK` | T1 | yalnız iç insan inceleme görevi önerisi |
| `EVIDENCE_FOLLOW_UP_DRAFT` | T1 | yalnız kanıt takip taslağı |
| `CANDIDATE_COMMUNICATION_DRAFT` | T2 | gönderilmemiş iletişim taslağı |
| `INTERVIEW_SCHEDULE_CHANGE_DRAFT` | T2 | uygulanmamış mülakat zamanlama taslağı |

Red, hire, advance, offer, rank, score, consent/erasure override, send,
execute, mutate ve apply action'ları hard-disallowed'dur. T3 reviewer ceiling
bir T3 action açmaz; katalogda T3 action yoktur.

## 2. Değişmez öneri ve approval sınırı

Her öneri exact `tenant + scope + action + target resource/version + payload
digest + source evidence + AI/policy version + rollback plan + TTL` bağını
taşır. Öneri oluşturulduktan sonra mutation API'si yoktur. Değişiklik gerekiyorsa
insan `RETURNED_FOR_REVISION` seçer; yeni payload yeni proposal id/digest ile
oluşur ve önceki öneri `SUPERSEDED` olur.

İnsan review yetkilendirmesi exact tenant, scope allowlist, action allowlist,
tier ceiling, reviewer, issuer, geçerlilik zamanı ve digest üzerinden yeniden
doğrulanır. Approval yalnız incelenen exact payload digest'i için
`APPROVED_FOR_ACTION` outcome üretir. Receipt açıkça şunları sabitler:

- `approvalScope = SYNTHETIC_PREVIEW_ONLY`
- `executionAuthority = NONE`
- `bearerCredential = false`
- `currentProposalStateCheckRequired = true`
- `executionPerformedByContract = false`
- `executionEvidence = null`
- `finalizedEmploymentDecision = false`
- `productionEligible = false`

Bu nedenle approval, canonical human-oversight state machine'indeki
`FINALIZED` değildir ve ona gizli bir kısa yol oluşturmaz. P6.5 yaşam döngüsü
canonical standarda referans verir; gerçek iş kararını finalize etmeye çalışmaz.

## 3. Açık yaşam döngüsü

`AI_PROPOSED → HUMAN_REVIEW` sonrasında insan yalnız approve,
`RETURNED_FOR_REVISION` veya proposal-scoped `REJECTED` seçebilir. Ayrıca
`WITHDRAWN`, TTL sonrası `EXPIRED` ve revision lineage için `SUPERSEDED`
state'leri vardır. Rejected proposal bir adayı reddetmez; yalnız bu öneriyi
terminal yapar.

Approval receipt tarihsel ve değişmezdir; proposal sonradan `WITHDRAWN` veya
`EXPIRED` olduğunda silinmez. Bu receipt hiçbir zaman bearer credential değildir.
Her downstream tüketici approval digest'inin yanında **güncel proposal state**
kontrolünü yapmak zorundadır; registry de terminal state sonrasında dış execution
kaydını reddeder.

Her geçiş exact proposal/payload digest, actor, reason, monotonic timestamp,
event id, idempotency key ve previous-event digest zinciri üretir. Exact retry
aynı receipt'i döndürür; aynı idempotency key farklı içerikle tekrar kullanılırsa
fail-closed olur. Proposal, event, evidence, approval, execution ve rollback
kimliklerinde replay guard vardır.

## 4. Dış execution ve rollback yalnız gözlemdir

Registry'de `execute`, `send`, `apply`, `mutate`, `approveMany` veya batch
approval metodu yoktur. `recordExternalExecution`, başka bir sistemde önceden
yapılmış bir eylemi ancak proposal/payload/approval lineage'ına bağlı ayrı ve
geçerli execution authorization ile kaydeder. Bu receipt:

- eylemi bu contract'ın yapmadığını,
- contract'ın execution authority vermediğini,
- proposal state'inin `APPROVED_FOR_ACTION` olarak kaldığını

makine-okunur biçimde taşır.

Rollback da bu contract tarafından yapılmaz. `recordExternalRollback`, exact
execution receipt + approval + payload + önceden mühürlenmiş rollback planı +
aktif review-session insan yetkilendirmesi + dış kanıt digest'ini doğrulayarak
yalnız observation receipt'i üretir. Proposal'ı yeniden aktive etmez ve yeni
execution authority oluşturmaz.

PRE-G0 registry authorization imzasını, issuer trust chain'ini veya gerçek
kimliği kriptografik olarak doğruladığını iddia etmez. Reviewer ve execution
authorization zarfları `verificationMode=REFERENCE_ONLY_PRE_G0` taşır; trusted
identity/issuer adapter'ı ayrı bir production gate'tir.

## 5. Veri ve PRE-G0 sınırı

Proposal yüzeyi yalnız opaque prefix + 16–64 hex ref'ler ve exact SHA-256
digest'ler kabul eder. Raw PII, raw content, protected attributes, aday skoru,
ranking, verdict ve serbest metin payload sözleşme dışıdır. TTL en fazla 72
saat, tenant başına aktif öneri tavanı 25'tir.

Semantik sürüm ref'leri dosya yolu değildir; `.`/`..` segmentleri reddedilir ve
downstream tüketici bu ref'leri path interpolation için kullanmamalıdır.

`evidenceGate`, `legalGate` ve `ownerGate` daima `NOT_MET`; production
eligibility daima `false` kalır. Bu source/test kanıtı dedicated desktop ve
390 px browser acceptance, legal/owner kabulü veya gerçek dış sistem
entegrasyonu yerine geçmez.

## 6. Ürün dili

Panelde “AI önerisi”, “insan incelemesi”, “revizyon istendi”, “eylem için
onaylandı” ve “dış icra kanıtı kaydedildi” ayrımları görünür olmalıdır.
“AI yaptı”, “otomatik uygulandı”, “nihai karar”, “aday reddedildi”, “güvenli/
uyumlu”, “production-ready” veya approval ile execution'ı eşitleyen dil
kullanılmaz. Payload ve gerekçe gövdesi yerine digest/ref lineage gösterilir.
