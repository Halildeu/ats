# Intelligence Evaluation v1 — P6 evidence and human-action protocol

> **Faz 25 P6 · public contract · assist-only.** Bu kontrat QoH, fairness,
> citation-backed coaching, skills ontology, deepfake/provenance, internal
> mobility ve agentic proposal yeteneklerinin ölçüm ve action sınırını tanımlar.
> Gerçek cohort, protected-attribute veri seti, legal opinion, fairness verdict,
> model aktivasyonu veya production action iddiası değildir.

Kanonik artefaktlar:

- TypeScript: `contracts/wire/intelligence-evaluation.ts`
- P6.1 sentetik aggregate evaluator: `contracts/fairness/fairness-evidence.ts`
- JSON Schema: `contracts/schemas/intelligence-evaluation.schema.json`
- Tamamen sentetik fixture: `contracts/samples/intelligence-evaluation.sample.json`
- Drift guard: `scripts/check-intelligence-evaluation.mjs`
- İnsan karar otoritesi: `docs/governance/human-oversight-standard.md`
- Kalıcı analiz sınırı: ATS-0005 ve ATS-0012

## 1. Neden ayrı protokol?

İleri analytics kartı göstermek, güvenilir ve action-ready bir capability
kanıtlamaz. Her capability farklı cohort, ground truth, missingness, confounder,
uncertainty ve provenance gerektirir. Bu kontrat bütün yeteneklere tek bir
"AI hazır" etiketi vermek yerine metric protokolünü ve dört gate'i ayrı taşır.

Rakip benchmark yüzeyi; Ashby/Greenhouse structured analytics, Eightfold-style
skills/internal mobility ve interview-intelligence araçlarının capability
beklentileridir. Bizim fark hedefimiz citation, Türkçe/egemen çalışma ve
denetlenebilir insan otoritesidir. Bu doküman rakip üstünlüğü veya compliance
sonucu iddia etmez.

## 2. Yedi capability ve başlangıç sınırı

| Capability | PRE-G0 lifecycle | Output mode | Kalıcı action sınırı |
|---|---|---|---|
| `QOH` | `RESEARCH_ONLY` | aggregate evidence | bireysel karar yok |
| `FAIRNESS` | `EVIDENCE_REQUIRED` | screening indicator | 4/5 discrimination verdict değildir |
| `COACHING` | `PROPOSAL_ONLY` | citation-backed proposal | insan review/rationale olmadan uygulanmaz |
| `SKILLS_ONTOLOGY` | `PROPOSAL_ONLY` | provenance-backed proposal | skill suggestion; ranking/promotion yok |
| `DEEPFAKE_PROVENANCE` | `EVIDENCE_REQUIRED` | screening indicator | risk sinyali tek başına red nedeni değil |
| `INTERNAL_MOBILITY` | `BLOCKED` | provenance-backed proposal | full ATS/consent/owner gate olmadan yok |
| `AGENTIC_PROPOSAL` | `DISALLOWED` | no umbrella output | ayrı PRE-G0 registry yalnız sentetik proposal; execution authority yok |

P6.5 reference registry, üst capability/umbrella output'u açmadan PRE-G0
sentetik proposal ve insan review akışını ayrı
`governed-agentic-proposal/v1` sözleşmesinde sınırlar. Mevcut evaluation
fixture'ı `AGENTIC_PROPOSAL=DISALLOWED` kalır; bu registry production/action
gate'lerini açmaz: `human_action_allowed` kalıcı olarak false, execution
authority `NONE` ve legal/owner gate'leri `NOT_MET` kalır. Ayrıntı:
`docs/ai-governance/governed-agentic-proposals-v1.md`.

## 3. Capability-başına metric protocol

Her kayıt şu alanları taşır:

- metric kind ve state (`DESIGNED → MEASURED → INDEPENDENTLY_REVIEWED → OWNER_ACCEPTED`),
- cohort origin (`SYNTHETIC` veya yalnız aggregate/ref-only `AGGREGATED_RUNTIME`),
- raw PII ve raw protected attribute için sabit `false`,
- fairness dışında protected-attribute erişimi `NONE`; fairness için yalnız
  `AUDIT_ONLY_AGGREGATED`,
- cohort definition, missingness plan, confounder plan ve provenance chain refs,
- protokol sahibi tarafından tanımlanan minimum sample ve gözlenen aggregate sayı,
- ground-truth owner ve uncertainty method,
- sayı/label taşımayan metric-result, confidence-interval ve evidence refs,
- `screening_indicator_only=true`, `verdict=NONE`.

Evrensel "30 örnek yeter" gibi sahte bir eşik yoktur. Minimum sample ölçümden
önce açıkça tanımlanır; observed sample minimumun altındaysa `MEASURED` state
geçemez. Guard'ın in-memory pozitif fixture'ı state-machine erişilebilirliğini
test etmek için 30/100 sentetik sayıları kullanır; bu bir ürün eşiği değildir.

## 4. Dört bağımsız gate

1. `EVIDENCE` — metric/cohort/provenance receipt.
2. `LEGAL` — kullanım amacı ve action sınırı için legal review receipt.
3. `INDEPENDENT_AUDIT` — capability-bağımsız audit/verifier receipt.
4. `OWNER` — ilk üç gate verified olmadan `OWNER_ACCEPTED` olamaz.

Boolean readiness alanları gate durumlarıyla birebir eşleşir. Production
eligibility yalnız `GATED_RUNTIME`, non-synthetic capability, metric
`OWNER_ACCEPTED` ve dört gate birlikte sağlandığında true olabilir.

## 5. Proposal ve human-oversight bağı

Proposal envelope, mevcut human-oversight state machine'ini kopyalamaz;
`human-oversight:canonical:v1` ref ve canonical state adlarını kullanır.

- `AI_SUGGESTED` doğrudan action veya approval receipt taşıyamaz.
- `FINALIZED`, human actor, oversight role, human-authored rationale, source
  evidence, AI output version, outcome ve audit receipt'in tamamını gerektirir.
- Approval receipt, proposal'ın AI output version ve source evidence setine bağlıdır.
- `EXPORTED` state, önceki `FINALIZED` human receipt lineage'ini korumak zorundadır;
  export receipt'siz bir AI çıktısı olamaz.
- Auto-execute, batch approval ve mutation schema seviyesinde `false` pinlidir.
- Pending proposal sayısı en fazla 5; TTL en fazla 168 saattir.
- Coaching proposal citation olmadan oluşamaz.
- Fairness/deepfake screening ve agentic proposal bireysel action'a dönüşemez.
- Internal mobility proposal generation full ATS acceptance olmadan açılamaz.
- Full ATS acceptance yalnız boolean değildir; accepted gate'ler ve ayrı opaque
  acceptance receipt ref birlikte zorunludur.

## 6. Kalıcı hard bans

Root ve capability policy yüzeyinde aynı fail-closed yasaklar vardır:

- numeric scoring ve ranking,
- automated hire/reject/advance kararı,
- affect/emotion, personality veya deception inference,
- protected attribute/proxy optimization,
- provenance/deepfake sinyalini tek başına adverse action yapmak,
- autonomous mutation ve batch approval.

Raw candidate/employee/person ID, ad, iletişim bilgisi, protected group/attribute,
metric value, score/rank, affect/personality/deception label, token veya secret
fixture ve proposal yüzeyine giremez.

## 7. Fairness ve deepfake doğru anlamı

EEOC four-fifths oranı yalnız bir **screening indicator** başlangıç sinyalidir;
cohort yeterliliği, confidence/uncertainty, missingness, confounder, bağımsız
audit ve legal/owner değerlendirmesinin yerine geçmez. Otomatik discrimination
verdict veya aday action üretemez.

P6.1 evaluator bu sınırı çalışan bir PRE-G0 kanıt yüzeyine dönüştürür. Girdi
yalnız `grp_<16 hex>` biçimindeki opaque sentetik aggregate group ref'leri ile
population/selected sayılarını kabul eder; group label, kişi ID'si, raw PII veya
raw protected attribute kabul etmez. Referans grup önceden sabitlenir. Minimum
grup büyüklüğünün altı, izin verilen missingness oranının üstü veya sıfır
referans selection rate sonucu `INSUFFICIENT_DATA` yapar. Yeterli sentetik
veride seçim oranları, sabit `0.8` four-fifths oranı ve Wilson %95 interval
üretilir. Sonuç yalnız `SCREENING_SIGNAL_REVIEW_REQUIRED` ya da
`NO_SCREENING_SIGNAL_OBSERVED` olabilir; her iki durumda da `verdict=NONE`,
`individualActionAllowed=false` ve `productionEligible=false` kalır.

Audit export'u ayrı bir insan denetçi, amaç ve aggregate-access approval ref'i
gerektirir; evidence receipt digest'ine bağlanır, tenant-scoped idempotenttir ve
yalnız `SYNTHETIC_AGGREGATE_AUDIT_EXPORT` üretir. Evidence gate
`SYNTHETIC_EVIDENCE_ONLY`; legal, independent-audit ve owner gate'leri
`NOT_MET` kalır. Bu export bağımsız audit tamamlanması, real-cohort acceptance,
compliance sonucu veya üretim uygunluğu değildir.

C2PA/provenance ve deepfake model sinyali yalnız insan incelemesine yönlendiren
risk indicator'dır. Confidence yüksek olsa dahi otomatik red, ranking veya
güvenilirlik/deception etiketi üretemez.

## 8. Standart hizası

- EU AI Act high-risk employment sistemi, Art.14 human oversight ve Art.5 affect sınırı,
- NIST AI RMF Govern/Map/Measure/Manage evidence lifecycle,
- ISO/IEC 42001 AI management-system risk/evidence girdileri,
- EEOC four-fifths screening indicator ve NYC Local Law 144 bağımsız audit beklentisi,
- ESCO/O*NET-style versioned skills provenance,
- C2PA provenance signal boundary.

Bu hizalama conformity, certification veya legal conclusion değildir.
Rakip analytics/audit yüzeyleriyle karşılaştırma yalnız product-surface açıklığı
içindir: Ashby/Greenhouse benzeri funnel oranı görünürlüğü hedeflenir; fakat
sentetik hesap sonucu rakip parity, fairness etkinliği veya compliance kanıtı
sayılmaz. Kalıcı ürün farkı; belirsizlik, missingness/confounder provenance,
human audit export ve kapalı gate'lerin aynı receipt zincirinde görünmesidir.

## 9. Doğrulama

`node scripts/check-intelligence-evaluation.mjs` birlikte şunları kanıtlar:

- Draft 2020-12 subset schema validation ve unsupported-keyword fail-close,
- yedi capability'nin tam/benzersiz registry ve capability-specific policy map'i,
- metric minimum/cohort/ground-truth/uncertainty/result state invariants,
- dört gate ve derived boolean/owner ordering parity,
- PRE-G0 tüm acceptance/action iddialarının kapalı olması,
- ref-only/raw-data boundary ve exact SHA-256 proposal digest,
- proposal TTL, capability/action mapping ve human receipt binding,
- kalıcı hard bans,
- gömülü negatif vektörlerin fail etmesi,
- bellekte oluşturulan tam gated runtime fixture'ın pozitif geçmesi.

Pozitif runtime fixture yalnız verifier mantığının ulaşılabilir olduğunu kanıtlar;
gerçek cohort, audit, legal, owner, full ATS veya production action kanıtı değildir.

## 10. Bu child'ın kapatmadığı alanlar

Contract/guard kabul edilse bile P6 parent açık kalır. Gerçek QoH ground-truth,
bağımsız fairness audit, controlled protected-attribute access, legal/owner
acceptance, citation coaching browser/action audit, ontology version/provenance,
deepfake false-positive/appeal kanıtı, internal-mobility consent ve full ATS
customer decision ayrı milestone'lardır.
