# ATS-0010 — Audit & Observability Event Taxonomy

- **Durum:** Önerildi (cross-AI review bekliyor)
- **Tarih:** 2026-06-29
- **Bağlam kaynağı:** Gate-safe hardening backlog #3 (Codex thread 019f12e2) · cross-AI PR review thread 019f1354 (REVISE absorb iter-2) · [[ATS-0003]] WORM evidence-ledger · [[ATS-0007]] threat model (T-R1/T-R2 repudiation, **T-I6** operasyonel log PII sızıntısı) · [docs/security/threat-register.md](../security/threat-register.md)
- **Karar tipi:** Gözlemlenebilirlik / denetim mimarisi (gate-safe; emisyon kodu P1)

## Bağlam

Ürün regüle kurumlar için yüksek-hassasiyet aday-PII + ham mülakat medyası işler, multi-tenant, on-prem opsiyonlu. İki ayrı **denetim düzlemi** karışırsa ya KVKK ihlali (PII operasyonel log'a sızar) ya da denetlenemezlik (kim-ne-zaman-ne-yaptı izlenemez) doğar:

1. **İş-kanıtı düzlemi (business evidence):** WORM, hash-zincirli, tenant-veri taşır → `EvidenceLedger` ([[ATS-0003]], `contracts/src/evidence-ledger.ts`). Aday/mülakat kanıtının değişmez kaydı; "ne karar verildi, hangi citation'a dayandı" sorusunun cevabı.
2. **Operasyonel telemetri düzlemi (operational observability):** log + metric + trace; sistem sağlığı + güvenlik-denetimi + sorun-teşhisi. **Ham PII/içerik taşımaz** — yalnız opak ID/hash + kategorize event.

Bu ADR **2. düzlemi** karara bağlar. Olmazsa: prompt-injection/tenant-leak/break-glass gibi tehditlerin (ATS-0007) tespiti ve adli-iz (forensics) kanıtı eksik kalır; aynı anda denetimsiz log PII-sızıntı/exfiltration kanalına döner (threat-register **T-I6**).

## Karar

**Tüm operasyonel event'ler ortak bir zarf (envelope) + kanonik taksonomi ile yapılandırılır; ham PII/içerik/secret log'a YAZILAMAZ (fail-closed redaction).** Kanonik kayıt: [docs/observability/event-taxonomy.md](../observability/event-taxonomy.md) (machine-checked, drift-guard'lı).

### 1. Zarf (her event ZORUNLU taşır)
`schema_version` · `event_type` (kanonik tip ID) · `event_id` (olay-örneği benzersiz ID) · `category` · `severity` · `occurred_at` (ISO-8601 UTC) · `tenant_id` (opak) · `correlation_id` · `trace_id` · `source` (servis) · `outcome`. Opsiyonel: `span_id` · `actor_ref` (pseudonim/opak) · `reason_code` · `environment` · `deployment_version` · `ledger_entry_ref` · `target_ref`. **`event_type` (sınıf) ≠ `event_id` (örnek)** ayrımı zorunlu; `schema_version` forward-compat sağlar.

### 2. PII sınıflandırması (redaction invariant)
Her event bir `pii_class` beyan eder. **İzinli:** `none` · `id-only` (opak ID/hash) · `pseudonymized`. **YASAK (fail-closed):** `raw-pii` (aday adı/email/telefon/CV içeriği) · `content` (transkript/medya gövdesi) · `secret` (token/anahtar/parola). Yasak sınıflar registry'de **tanımlıdır** ama **§2 event satırının `pii_class` hücresinde kullanılamaz** (drift-guard CI-enforced reddeder); kod-seviyede serializer allow-list + redaksiyon **ayrı** ve zorunlu (P1 emisyon, gate-locked).

### 3. Korelasyon & izlenebilirlik
Dağıtık iz **W3C Trace Context** (`traceparent`) ile taşınır: `trace_id`/`span_id` standardın `trace-id`/`parent-id` alanlarıdır. `correlation_id` ise **uygulama-seviyesi** iş-akışı korelasyonudur (standardın birebir karşılığı değil) ve **opak** olmalıdır — tenant/aday/email/domain encode **edemez**. Aynı iş-akışının tüm event'leri tek correlation_id ile bağlanır. Güvenlik/denetim event'leri (auth/authz/admin/security/consent/privacy) **silinmez, örneklenmez (no-sampling)**.

### 4. Tenant-güvenli log invariantı
`tenant_id` her event'te bulunur (filtre/izolasyon için) ama **log deposu erişimi RBAC-kapsamlı** (audit-reader ≠ tenant-data-reader, ATS-0007 §3). Cross-tenant log korelasyonu yalnız platform-operator rolüne; tenant'a yalnız kendi `tenant_id` görünür.

### 5. Saklama & egress sınırı (on-prem)
Güvenlik/denetim event'leri ≥ yasal saklama süresi (KVKK + iş gereksinimi; kesin süre [[ATS-0003]] retention matrisine bağlı). **On-prem varsayılan: dışa telemetri YOK** — harici APM/log SaaS opt-in + egress-allowlist (ATS-0007 §6). Bu, "verileriniz sizin sınırınızda kalır" iddiasının log düzleminde karşılığı.

## Sonuçlar

**Olumlu:** procurement-ready denetlenebilirlik (DPIA/security-whitepaper girdisi); T-R1/T-R2 repudiation + tenant-leak tespiti adli-iz kazanır; T-I6 PII-log-sızıntısı **registry düzeyinde fail-closed tasarlanır** (yasak `pii_class` §2 event registry satırlarında imkânsız, drift-guard CI-enforced) — **runtime redaksiyon enforcement P1 gate-locked** (serializer allow-list); on-prem "egress yok" iddiası somutlanır.
**Olumsuz:** envelope + redaction P1 emisyon-kodunda disiplin ister (serializer allow-list); correlation_id propagation servis-sınırı tutarlılığı gerektirir; no-sampling güvenlik-event'i log hacmini artırır.

## Gate disiplini

Bu ADR + taksonomi-registry + drift-guard **gate-safe** (tasarım + makine-doğrulanan spec; fonksiyonel logging kodu DEĞİL). Emisyon (servislerin gerçekten bu event'leri üretmesi) = **P1**, `G0=GO` sonrası. Registry'deki event'ler bugün `design`/`gate-locked` statüsünde; yalnız registry-yapısı + redaction-invariantı `enforced (CI)`.

## Değerlendirilen alternatifler

- **(A) Serbest-form log (taksonomi yok)** — RED: PII sızıntısı + denetlenemezlik; regüle pilot açılamaz.
- **(B) Tek düzlem (evidence-ledger'ı operasyonel log olarak da kullan)** — RED: WORM'a PII-redacted-olmayan teşhis verisi karışır; iki amacın saklama/erişim profili çelişir.
- **(C) İki düzlem + kanonik taksonomi + fail-closed redaction + drift-guard (seçilen).**

## Bağlantı
- Kanonik registry: [docs/observability/event-taxonomy.md](../observability/event-taxonomy.md) (drift-guard: `scripts/check-event-taxonomy.mjs`, CI job `event-taxonomy-guard`).
- [[ATS-0003]] WORM evidence-ledger (iş-kanıtı düzlemi) · [[ATS-0007]] §3 RBAC/break-glass, §6 egress-allowlist · [docs/security/threat-register.md](../security/threat-register.md) **T-I6** (operasyonel log PII sızıntısı) · T-R1/T-R2 (repudiation). (P-L1 yalnız tombstone/linkability bağlamında; operasyonel log değil.)
