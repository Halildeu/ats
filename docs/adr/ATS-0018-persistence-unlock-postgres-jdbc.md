# ATS-0018 — Persistence unlock: PostgreSQL 16 + Flyway + plain-JDBC adapter modülü (JPA'sız)

- **Durum:** **Accepted** (cross-AI Codex AGREE, 2026-07-02) — architecture-unlock KARARI. **İmplementasyon durumu (ayrı satır — audit netliği):** 8a worm_ledger + 8b 6-store adapter **LANDED** (Testcontainers-PG16 profili; PG-smoke dahil); 8c retention-purge **LANDED** (zamanlayıcı-tetikleyici composition işi); slice-9 **app-boot composition LANDED** (Spring Boot 3 yalnız composition modülünde — §2 Boot/DataSource istisnası artık gerçek; veri-endpoint'i yok, yalnız /healthz); prod deploy/DSN/Vault wiring YOK — "prod'da çalışıyor" iddiası YOK.
- **Tarih:** 2026-07-02
- **Bağlam kaynağı:** slice-1 sınırı (backend/pom.xml: "persistence PORT-ONLY; ayrı architecture-unlock slice + ADR") · ArchUnit `contracts_and_kernel_have_no_persistence_or_framework_deps` · ATS-0008 D-E stack-lock (PostgreSQL 16 + pgvector, Flyway, Java 21) · slice-6 dürüst sınırı (retention-TIMER persist timestamp ister) · [[ATS-0003]]/[[ATS-0007]]

## Bağlam

P1 dilimleri 1-7 port-only tamamlandı: **6 mutable store portu** in-memory adapter'la yaşıyor (Transcript, Citation, ReviewCase, Dsar, ExportArtifact, RecordingPermission) ve `EvidenceLedger`'ın GERÇEK (durable, hash-chain) adapter'ı yok. Retention-timer (F10 kalanı) `created_at` timestamp'i olmadan yazılamaz. Slice-1'in bilinçli yasağı ("JPA/Flyway/Spring Data/vendor SDK YOK") ancak ADR'li unlock ile açılabilir — bu ADR o unlock'tur.

**Kapsam sınırı (Codex blocker-2 netleştirmesi):** bu unlock **yalnız PostgreSQL düzlemidir** — 6 store + worm_ledger. **Raw media / object-store (ingest-media'nın binary düzlemi) KAPSAM DIŞI**: ATS-0008 D-D gereği object-store seçimi (MinIO vs S3) **G0'a ertelendi**; PG'ye yalnız `source_object_key` gibi **opak referanslar** girer (data-lifecycle: `raw_media`=object-store, `transcript_raw`=primary-db satırlarıyla birebir), medya byte'ları ASLA PG'ye girmez.

## Karar

**1. Stack — ATS-0008 D-E kilidiyle BİREBİR:** PostgreSQL 16 (tek canonical store; pgvector ileride embedding için) + **Flyway** migration + Java 21.

**2. JPA/Hibernate/Spring-Data KULLANILMAZ — yeni `backend/persistence-postgres` modülü plain-JDBC adapter'dır** (`com.ats.persistence..` paketi):
- Domain kayıtları zaten immutable record + `Outcome` — ORM katmanı değer katmaz; iki-düzlem/minimizasyon denetimini (hangi kolona ne yazılıyor) ZORLAŞTIRIR.
- ArchUnit yasağının ruhu korunur: contracts/kernel/domain-modüller persistence'a bağlanamaz; **tek izinli nokta adapter paketi**.
- Spring Boot 3 runtime'ı (ATS-0008 D-A deployable) P1 API/UI dilimiyle gelir; adapter framework'süz kalır, Boot geldiğinde `DataSource` ile bağlanır.

**3. Şema haritası (store-port → tablo; hepsi tenant-scoped PK `(tenant_id, key)` + `created_at timestamptz` — retention-timer'ı AÇAR):**

| Tablo | Port | Not (iki-düzlem/minimizasyon) |
|---|---|---|
| `transcript` | TranscriptStore | segments `jsonb` (lexical-only; ATS-0012 sanitize edilmiş); `source_object_key` |
| `citation` | CitationStore | claim METNİ silinebilir-düzlem OLARAK BURADA (WORM'da değil); `segment_indexes int[]`, entailment |
| `review_case` | ReviewCaseStore | state + ref kolonları (gerekçe GÖVDESİ yok — pointer) |
| `dsar_request` | DsarStore | subject_ref/reason_code/state (talep gövdesi yok) |
| `export_artifact` | ExportArtifactStore | kanonik packet JSON (pointer-only; leak-scan'den geçmiş) |
| `recording_permission` | consent | ATS-0003 permission-state |
| **`worm_ledger`** | EvidenceLedger | **append-only** (aşağıdaki 8a-invariant seti) |

**`worm_ledger` 8a-invariant seti (Codex blocker-3 — implementasyona kesin sözleşme):**
1. Kolonlar: `seq bigserial` · `tenant_id` · `evidence_id` (contract alanı; `getById(tenant, evidenceId)` bu kolondan; `UNIQUE(tenant_id, evidence_id)`) · `actor_ref` · `interview_id` · `event_type` · `occurred_at` · `idempotency_key` · `content_hash` · `payload jsonb` · `prev_hash` · `entry_hash`.
2. **Idempotency TENANT-SCOPED:** `UNIQUE(tenant_id, idempotency_key)` — global UNIQUE cross-tenant çakışma/denial yaratır, YASAK.
3. **`entry_hash` kanonik kapsamı (deterministik, alan-listesi sabit):** `sha256(prev_hash || tenant_id || evidence_id || actor_ref || interview_id || event_type || occurred_at || idempotency_key || content_hash || canonical(payload))` — canonical = sorted-keys JSON (PacketJson kalıbı); `seq` hash'e girmez (zincir sırası prev_hash ile bağlı).
4. **Rol/ownership ayrımı:** migration-owner rolü ≠ uygulama rolü; uygulama rolü tablo sahibi DEĞİL, yalnız `INSERT/SELECT` grant; `UPDATE/DELETE/TRUNCATE` REVOKE + **reject-trigger** (üçü için de testli — TRUNCATE dahil).
5. Tombstone = ayrı satır tipi (`event_type='evidence.tombstoned'`, payload = target `evidence_id` + reason **pointer-only**); hedef satır DEĞİŞMEZ.
6. **Payload minimizasyon testi 8a'da zorunlu:** payload'a content/raw-pii/secret sınıfı değer giremez ([[data-lifecycle-register]] WORM-içerik-yasağı invariantının PG-adapter testi).

**4. ArchUnit kural evrimi (fail-closed daralma, gevşeme DEĞİL):** mevcut "hiç kimse persistence'a bağlanamaz" kuralı → "`com.ats.persistence..` DIŞINDA hiçbir paket `org.postgresql../org.flywaydb../java.sql..` kullanamaz; contracts/kernel/domain için yasak AYNEN sürer; JPA/Hibernate/Spring-Data HERKES için yasak KALIR". Böylece unlock, sızıntıya değil tek adaptöre açılır. **İstisna sınırı (Codex non-blocking netleştirmesi):** `javax.sql.DataSource` yalnız `com.ats.persistence..` VE (geldiğinde) Boot composition katmanında (`com.ats.app..` benzeri wiring paketi) görünebilir — domain modülleri DataSource'u da göremez.

**5. Test stratejisi:** adapter davranış testleri **Testcontainers-PostgreSQL** ile (PG-özgü jsonb/trigger/REVOKE — H2/SQLite parity YOK; test-scope bağımlılık kabulü, vendor-runtime değildir; CI ubuntu-runner Docker'lı ✓). Mevcut in-memory adapter'lar test-fixture olarak KALIR (hızlı birim testleri).

**6. Güvenlik bağları (dürüst residual'lar):** içerik kolonları için **per-tenant envelope-encryption + crypto-erase anahtar düzlemi = ATS-0007 key-mgmt dilimi** (bu unlock'un parçası DEĞİL — data-lifecycle `crypto-erase` satırları o dilime kadar "mantıksal silme + anahtar-düzlemi-pending" olarak okunur); DSN/secret'lar Vault'tan (deploy düzlemi `ats-gitops`); pgvector aktivasyonu embedding dilimiyle.

**7. Dilim planı:** **8a** Flyway migration seti + lokal `docker compose` PG + `worm_ledger` adapter (hash-chain + idempotent append + tombstone + append-only trigger testi) → **8b** 6 store adapter'ı + orkestrasyon servislerinin PG-profil contract-testleri → **8c** retention-timer (artık `created_at` var; data-lifecycle `retention_timer_state`).

## Değerlendirilen alternatifler

- **(A) JPA/Spring-Data** — RED: ORM soyutlaması immutable-record+Outcome dünyasında değer katmıyor; kolon-düzeyi minimizasyon denetimi bulanıklaşıyor; ArchUnit yasağının ruhu (framework-coupling'den kaçınma) bozulur.
- **(B) H2/SQLite (hafif start)** — RED: ATS-0008 PostgreSQL-canonical stack-lock; jsonb/trigger/REVOKE prod-parity gerektirir.
- **(C) PostgreSQL + Flyway + plain-JDBC tek-adapter-modülü (seçilen).**

## Gate disiplini

Bu ADR **karar + plan**dır; hiçbir adapter bu PR'da gelmez. Dilim 8a-8c ayrı PR + Codex review. Release/gerçek-veri G0-kilitli (ATS-0016). "DB'ye yazıyor/çalışıyor" DENMEZ.

## Bağlantı

- ATS-0008 D-E (stack-lock; private) · [[ATS-0003]] (WORM≠deletion; tombstone) · [[ATS-0007]] (key-mgmt/crypto-erase dilimi) · [[ATS-0016]] (P1 build unlock / release-gate) · backend/pom.xml slice-1 sınırı · ArchitectureTest.java (kural evrimi 8a'da bu ADR referansıyla).
