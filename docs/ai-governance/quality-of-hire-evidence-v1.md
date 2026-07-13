# Quality-of-Hire Evidence v1 — sentetik aggregate outcome association

> **Faz 25 P6.0 · public contract · PRE-G0 / synthetic only.** Bu artefakt
> `intelligence-evaluation/v1` içindeki `capability:qoh:v1` otoritesini çalışan,
> fail-closed bir aggregate evaluator yüzeyine bağlar. Gerçek HRIS verisi,
> çalışan performans skoru, candidate ranking, nedensel etki, legal kabul,
> müşteri/controller onayı, owner kabulü veya production aktivasyonu değildir.

Kanonik artefaktlar:

- TypeScript/evaluator: `contracts/qoh/quality-of-hire-evidence.ts`
- Adversarial contract testleri: `contracts/test/quality-of-hire-evidence.contract.test.ts`
- Umbrella otorite: `contracts/wire/intelligence-evaluation.ts`
- Veri yaşam döngüsü: `docs/privacy/data-lifecycle-register.md`
- İnsan karar otoritesi: `docs/governance/human-oversight-standard.md`

## 1. Kontratın rolü

QoH tek bir “iyi işe alım” skoru değildir. Bu kontrat yalnız önceden kayıtlı
ölçüm planı altında, aggregate ve sentetik outcome kategorilerinin işe-alım
kanıtıyla **betimleyici ilişkisini** gösterir. `correlation_only=true` sabittir;
`causal_conclusion=NONE` değiştirilemez.

Manager rubric ve retention gibi post-hire sinyaller objektif ground truth
değildir. İş koşulları, manager/team etkisi, survivorship/selection bias,
missingness ve censoring taşırlar. Bu nedenle ground-truth statüsü sabit olarak
`CONTESTABLE_HUMAN_REPORTED_OUTCOME` kalır.

## 2. Otorite bağı

Her input ve receipt iki exact binding taşır:

- `intelligenceEvaluationAuthority = intelligence-evaluation/v1`
- `capabilityRef = capability:qoh:v1`

Dedicated evaluator umbrella kontratı kopyalayıp ikinci lifecycle üretmez.
Umbrella QOH sınırı `RESEARCH_ONLY + AGGREGATE_EVIDENCE + bireysel action yok`
olarak kalır. Generic metric-result rolü capability-aware’dır:

- QOH: `DESCRIPTIVE_ASSOCIATION`, `screeningIndicatorOnly=false`
- fairness/deepfake: `SCREENING_INDICATOR`, `screeningIndicatorOnly=true`
- diğerleri: `EVIDENCE_METRIC`, `screeningIndicatorOnly=false`

## 3. 90/180 günlük, dört boyutlu model

Input exact iki pencere taşır: `90` ve `180`. Her pencerede exact dört boyut
bulunur:

1. `RETENTION`
2. `RAMP_MILESTONE`
3. `STRUCTURED_MANAGER_OUTCOME`
4. `NEW_HIRE_EXPERIENCE`

Her boyut yalnız opaque outcome-category ref ve aggregate sayılar taşır:

- eligible,
- observed,
- missing,
- censored,
- tanımlı outcome kategorisinde gözlenen aggregate sayı.

`observed + missing + censored = eligible` zorunludur. 180 günlük pencereye
henüz ulaşmamış kayıt, missing veya başarısız sayılmaz; `censored` olarak ayrı
kalır. Outcome-category sayısı observed sayıyı aşamaz.

Tek composite QoH skoru, boyutlar-arası ağırlıklandırma ve kişi sıralaması
kontrat seviyesinde yasaktır.

## 4. Sample ve disclosure güvenliği

İki eşik birbirinden ayrıdır:

- `minimumStatisticalSampleSize`: measurement-plan sahibinin analiz eşiği,
- `minimumDisclosureSampleSize`: küçük-kohort disclosure/singling-out eşiği.

Evrensel “N örnek yeterlidir” iddiası yoktur. Her iki eşik de ölçüm planında
önceden tanımlanır. Suppression policy, differencing control ve query-budget
policy ref’leri access policy’den ayrı ve zorunludur. Herhangi bir boyutta
observed sayı ilgili eşiğin altında kalırsa ya da outcome-category,
outcome-complement, missing veya censored hücrelerinden herhangi biri sıfırdan
büyük olup disclosure minimumunun altında kalırsa receipt bütünü
`INSUFFICIENT_DATA` olur. Missingness limiti aşımı da aynı global suppression'ı
tetikler. Tüm count/rate/interval alanları `null` ile suppress
edilir. Zero cell tek başına küçük-hücre disclosure iddiası taşımaz; non-zero
hücre eşiği uygulanır. Böylece yeterli bir boyut üzerinden yetersiz diğer
boyutun küçük-kohort bilgisi açığa çıkmaz.

Yeterli sentetik input’ta her boyut yalnız aggregate category rate ve Wilson
%95 interval üretir. Bu interval causal etki veya model accuracy iddiası değildir.

## 5. Comparison, confounder ve preregistration

Comparison yalnız:

- `NONE`, veya
- `PREREGISTERED_DESCRIPTIVE_BASELINE`

olabilir. İkinci halde baseline ref zorunludur; `NONE` halinde baseline ref
yasaktır. Measurement plan version, cohort-definition version, comparison
protocol ve preregistration SHA-256 digest’i receipt’e bağlanır. Confounder plan
en az bir opaque ref taşır; sonradan “iyi görünen” cohort/baseline seçimi kontrat
olarak kabul edilmez. Set-semantikli `confounderPlanRefs` ve
`sourceSchemaVersionRefs` receipt oluşturulurken canonical sıralanır; input
permutasyonu digest'i değiştirmez.

## 6. Lineage ve veri sınırı

Receipt şu ref-only zinciri taşır:

- hiring-evidence aggregate,
- HRIS outcome snapshot,
- structured human-outcome receipt,
- new-hire-experience receipt,
- source schema versions,
- provenance chain,
- destroyable-HMAC linkage protocol.

Ham candidate/employee/person ID, ad, iletişim bilgisi, raw manager notu,
raw employee performance, protected attribute/group, numeric person score,
candidate rank, karar veya token/secret kabul edilmez. Linkage
`linkageUsesDestroyableHmac=true` olmadan geçmez.

Outcome-category ref’leri de opaque `category_<16 hex>` biçimindedir; manager
rubric/performance label’ı ref içine encode edilemez. Human-oversight authority
`human-oversight:canonical:v1` olarak exact pinlidir ve sentetik yorumda bile
`humanReviewRequired=true` kalır; bu insan action yetkisi üretmez.

`qoh_aggregate_evidence` veri sınıfı canonical lifecycle register’da
`pseudonymized + primary-db + hard-delete + gate-locked` olarak tutulur. Gerçek
veri için müşteri/controller amaç+dayanak kararı, legal review ve owner-approved
tenant policy gelmeden kayıt/aktivasyon yoktur.

## 7. Kalıcı feedback ve action yasakları

Şunların tamamı exact `false` veya `DISALLOWED` pinlidir:

- causal claim,
- candidate ranking,
- retrospective candidate scoring,
- automated employment decision,
- model-training use,
- selection-model optimization,
- protected-attribute optimization,
- proxy-feature optimization,
- employee performance action,
- internal-mobility ranking,
- single composite QoH score,
- human/individual action.

Bu sınır, biased manager/retention outcome’unu hiring modeline target/label olarak
geri besleme ve geçmiş adayları bugünkü outcome ile yeniden sıralama riskini
fail-closed tutar.

## 8. Gate truth

Sentetik receipt aşağıdaki durumları sabit üretir:

- `EVIDENCE = SYNTHETIC_EVIDENCE_ONLY`
- `LEGAL = NOT_MET`
- `INDEPENDENT_AUDIT = NOT_MET`
- `CUSTOMER_CONTROLLER = NOT_MET`
- `OWNER = NOT_MET`
- `realDataAccepted = false`
- `realActivationAllowed = false`
- `productionEligible = false`
- `complianceConclusion = NONE`

Customer/controller gate owner gate’inden ayrıdır. Ürünün processor rolü,
müşteri veri sorumlusunun amaç, hukuki dayanak ve kullanım kararının yerine
geçmez.

## 9. Correction ve supersession

Orijinal receipt `correctionReasonRef=null` ve `supersedesReceiptDigest=null`
taşır. Sentetik düzeltmede iki alan birlikte zorunludur; biri olmadan diğeri
kabul edilmez. Düzeltme yalnız `evaluateSyntheticQualityOfHireCorrection`
yüzeyine exact doğrulanmış önceki receipt verilerek üretilebilir. Yeni receipt
önceki exact SHA-256 digest’i bağlar; tenant, cohort, capability, measurement
planı/preregistration, cohort-definition ve correction-policy bağlamı aynı
kalır, data cutoff geriye gidemez. Nonexistent digest, farklı bağlam veya
değiştirilmiş plan reddedilir. Kabul edilen çıktı
`SUPERSEDING_SYNTHETIC_CORRECTION` olur; eski receipt sessizce overwrite edilmez.

Purpose, legal-basis-review, retention, access, erasure-propagation,
correction, appeal ve audit policy ref’leri her receipt’te zorunludur.
`verifySyntheticQualityOfHireReceipt` exact runtime shape'i, sabit güvenlik/gate
invariantlarını, görünür derived oran/interval değerlerini, global suppression
durumunu ve digest'i birlikte doğrular. SHA-256 `receiptDigest` yalnız canonical
payload için **integrity/tamper detection** sağlar; imza, MAC, issuer kimliği
veya authenticity kanıtı değildir. Güvenilir kaynak/registry ve gerekiyorsa
ayrı imzalı envelope olmadan receipt'in kim tarafından üretildiği sonucuna
varılamaz.

## 10. Standart hizası ve residual

- NIST AI RMF Govern/Map/Measure/Manage: rol+yasak, etkilenen bağlam,
  missingness/confounder/uncertainty ve correction/deactivation kanıt girdileri.
- ISO/IEC 42001: intended purpose, risk treatment, data quality,
  responsibility ve lifecycle-monitoring için evidence input.
- EU AI Act readiness: Art.9/10/11/12/13/14/15/26/72 yönünde teknik dosya
  girdileri ve insan/controller sınırı.

Bu hizalama sertifika, conformity, hukuki görüş veya gerçek kullanım kabulü
değildir.

Source testleri ve mevcut SHA-pinned `contracts` CI job’u yalnız kontrat
invariantlarının çalıştığını kanıtlar. Şunları kanıtlamaz:

- lawful gerçek HRIS/employee outcome verisi,
- gerçek cohort yeterliliği,
- outcome label geçerliliği veya causal validity,
- independent audit,
- customer/controller, legal veya owner kabulü,
- üretim aktivasyonu,
- rakip parity veya müşteri değeri.
