# ATS-0021 — gov1-1e-c: WORM tek status-otorite (catalog = değişmez politika-içeriği)

- **Durum:** **Accepted** (cross-AI Codex thread `019f57cb` AGREE — gov1-1e 3-PR decomposition'ın 3'ü/son slice'ı `1e-c authority cutover`). **İmplementasyon durumu:** catalog-status TAM kaldırıldı; `ApprovedModelRegistry.resolve`/`resolveConfigured` cari onay-durumunu YALNIZ GLOBAL model-governance WORM'undan çözer (her resolve TAZE; cache YOK). **LANDED** (contracts-java + model-governance + app-boot; Testcontainers full-reactor PASS + boot/runtime REVOKE E2E).
- **Tarih:** 2026-07-13
- **Bağlam kaynağı:** [[ATS-0020]] (P3-gov0 boot-gate) · gov1-1e-a (transition contracts + `ModelGovernanceStatusProjection`) · gov1-1e-b (PostgreSQL WORM + `ModelGovernanceAdminAppender` writer-authority) · [[ATS-0005]] (AI-governance) · [[ATS-0003]] (WORM/veri-minimizasyonu)

## Bağlam

gov0/1e-a/1e-b'de `ApprovedModelSpec` bir `status` alanı (APPROVED/REVOKED/DRAFT) taşıyordu ve registry `resolve`/`resolveConfigured` bu **catalog-status**'una bakıyordu. Aynı anda gov1-1e GLOBAL model-governance WORM'u (transition hash-chain + `isAuthoritativelyApproved` projeksiyonu) kuruldu ama status-source cutover 1e-c'ye ertelendi. Sonuç: İKİ status-source vardı (catalog `status` + WORM) → drift/çift-otorite riski; canlı revoke catalog'u yeniden deploy etmeden görünmezdi.

## Karar

**Atomik cutover:** `status` catalog'dan (`ApprovedModelSpec` + `approved-models.json`) TAM KALDIRILIR. Catalog artık YALNIZ **değişmez politika-içeriği**dir; cari onay-durumu TEK OTORİTE olan GLOBAL WORM'dan çözülür.

### 1. Catalog = değişmez politika-içeriği (status yok)

`ApprovedModelSpec` record'undan `status` component kaldırıldı; `ApprovalStatus` enum yalnız **WORM-transition-state** vokabüleri olarak kalır (kayıt alanı değil). İçerik-adresli `approvalRef` zaten status-hariç digest'ti → **ref DEĞİŞMEZ** (golden-pin test `ShippedApprovalRefGoldenTest` shipped 3 kimliğin `mapr_` değerlerini gov0'la BİREBİR pinler). `approved-models.json` (+ test resource'ları) `"status"` anahtarını taşımaz.

**Strict exact-key parser (fail-closed):** `FileBackedApprovedModelRegistry` eski `"status"` anahtarını (ve her bilinmeyen alanı) SESSİZCE ignore ETMEZ → açık RED. Eski/kurcalanmış catalog yüklenemez.

**Kümülatif/append-only catalog:** revoke edilen bir politika-içeriği catalog'dan SİLİNMEZ (historical REVOKED ref dahil TÜM ref'ler catalog'da kalır). Böylece WORM asla catalog-dışı bir ref'e atıf yapmaz (bkz. §3 bütünlük).

### 2. WORM tek status-otorite (resolve semantiği; PORT imzası değişmez)

`ApprovedModelRegistry` PORT interface'i (contracts.governance) DEĞİŞMEZ. Adapter (`InMemory`/`FileBacked`) constructor'a **catalog + `ModelGovernanceLedger.Reader`** alır. `resolve(ref, cap)`/`resolveConfigured(...)`:

1. catalog policy-lookup (byRef / byConfig),
2. `Reader.readAll()` → `ModelGovernanceStatusProjection.project(...)` → `isAuthoritativelyApproved(ref, cap)`,
3. `Ok(policy-content spec)` ya da fail-closed.

**Cache/boot-status-snapshot KULLANILMAZ** — her resolve WORM'u TAZE okur (canlı revoke anında görünür; snapshot'a bağlı değil).

### 3. Catalog ↔ WORM mismatch taksonomisi (Codex — birebir, fail-closed)

| Durum | OutcomeCode |
|---|---|
| catalog'da ref yok | `NOT_FOUND` |
| config-key catalog'da yok (`resolveConfigured`) | `NOT_FOUND` |
| capability catalog-kaydıyla uyuşmuyor | `DENIED` |
| catalog-ref var, WORM-transition yok → `UNINITIALIZED` | `DENIED` |
| cari durum `DRAFT` / `REVOKED` | `DENIED` |
| WORM okunamaz (Reader `Fail` / `null` / `Ok(null)`) | `NOT_CONFIGURED` |
| GLOBAL hash-chain kırık VEYA özne tainted (state-machine bozuk) | `NOT_CONFIGURED` |
| WORM ref catalog'da yok (bütünlük ihlali) | `NOT_CONFIGURED` |
| WORM-capability ≠ catalog-capability (bütünlük ihlali) | `NOT_CONFIGURED` |

`Ok` yalnızca catalog-eşleşme + WORM-authoritative + `APPROVED`'ta döner.

### 4. app-boot wiring + boot-seed YASAK

WORM-backed registry bean `Reader` + catalog-resource'la kurulur (Reader Flyway'e bağlı → şema hazır olmadan bean yok). Boot-gate (`AuthorizedModelBindings`) artık WORM-backed `resolve` kullanır → **WORM'da APPROVED transition YOKSA boot FAIL-CLOSED düşer** (bu DOĞRU: approval yoksa boot yok).

**Normal boot HİÇBİR initial-approval transition YAZMAZ (boot-seed YASAK).** 1e-b `ModelGovernanceAdminAppender` normal composition'da bean DEĞİLDİR (yalnız `Reader` wire edilir — least-privilege; app-boot runtime rolü SELECT-only `ats_app`). Gerçek deployment'ın ilk `UNINITIALIZED→APPROVED` transition'ı owner-gated ayrı CLI/workflow'da yazılır (§5 + runbook).

**Faz 25 müşteri-öncelikli ayrıştırma:** `ats.ai.enabled=false` (güvenli default) iken ilan, aday başvurusu,
aday takip ve İK inbox/durum akışı AI endpoint/ref/mTLS veya WORM onayına bağlı olmadan boot eder. Bu
modda `AudioAccessGrants`, `AIProvider`, `SegmentSanitizer`, `AuthorizedModelBindings`,
`ModelGovernanceGate`, `ModelGovernanceJournal`,
`TranscriptionService` ve `CitationService` bean'leri kurulmaz; yalnız AI çağrı uçları `503
AI_NOT_APPROVED` + `Cache-Control: no-store` verir. `ats.ai.enabled=true` olduğunda bu bölümdeki WORM
gate'i aynen fail-closed devreye girer: eksik/bozuk/ref-uyuşmaz/onaysız kimlikle uygulama AI'yı callable
hale getiremez. Bu bir governance gevşetmesi değil, opsiyonel AI özelliğinin çekirdek müşteri yolundan
ayrılmasıdır.

### 5. Owner-gated initial-transition workflow

İlk onay (`INITIAL_APPROVAL`) ve sonraki geçişler (`REVOKED_BY_OWNER`/`REAPPROVED`/…) ayrı
`model-governance-transition` operator komutuyla yürür. Komut credential zarfını yalnız strict stdin JSON'dan
alır; her bağlantıda admin-attribute taşımayan ayrı member login'den `ats_governance_writer` rolünü
assume+assert eder; superuser/createdb/createrole/replication/bypassrls session'ını reddeder; check/append ve exact confirmation'ı
ayırır; append/hash/CAS semantiğini `ModelGovernanceAdminAppender` + `PostgresModelGovernanceLedger` canonical
yoluna devreder. Normal Spring composition komutu wire etmez ve boot-seed hâlâ yasaktır. Ayrıntı ve kanıt
kontratı: [RB-model-governance-initial-transition](../runbooks/RB-model-governance-initial-transition.md).

## Sonuç

- **Olumlu:** tek status-otorite (drift/çift-otorite yok); canlı revoke cache olmadan anında görünür (boot/runtime REVOKE E2E kanıtı); catalog immutable + kümülatif (audit-safe); ref-stabilitesi golden-pinli; strict parser eski catalog'u fail-closed reddeder; boot-seed yasağı least-privilege'i korur.
- **Sınır (dürüst):** yalnız GLOBAL scope; `endpointRef↔baseUrl` gerçek karşılığı hâlâ deployment-authoritative
  (ATS-0020 §4); CLI owner kararını üretmez, yalnız kanıtlanmış kararı writer-role ile icra eder; prod writer
  credential/member lifecycle deploy düzlemindedir; catalog↔WORM bütünlük taraması her resolve'da O(n)
  (WORM küçük — kabul; cache yasağıyla bilinçli tercih).
- **Migration notu:** operatör `ats.ai.approvals.*` ref'leri DEĞİŞMEDİ (golden-pin); ama artık boot ÖNCESİ WORM'da ilgili kimlikler owner-gated `INITIAL_APPROVAL` ile APPROVED olmalı (aksi halde boot fail-closed düşer — beklenen davranış).
