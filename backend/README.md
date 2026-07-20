# backend/ — ats-core (modular monolith)

ATS-0008: `ats-core` = Java 21 + Spring Boot 3 **modular monolith** + `ats-ai` ayrı (Python). **P1 build AKTİF** ([ATS-0016](../docs/adr/ATS-0016-p1-build-unlock-g0-release-gate.md), owner kararı 2026-07-02); **release/gerçek-veri/kalibrasyon-iddiası G0-kilitli**. Slice-1 sınırı: persistence **port-only/in-memory** (JPA/Flyway/Spring Data YOK — ArchUnit yasağı korunur; persistence = ayrı "architecture unlock" slice + ADR).

> **Toolchain (repo-gerçeği):** ATS-0008 stack-lock "Gradle" diyordu; ortamda **Gradle yok, Maven 3.9 + JDK kurulu** → local-verify edilebilirlik + Spring Boot parity için **Maven** kullanıldı. (ATS-0008 toolchain satırı bu PR'da Maven'a güncellendi.)

## Şu an (gate-safe — `mvn test` ile doğrulanır)
| Modül | İçerik | Durum |
|---|---|---|
| `shared-kernel` | `Outcome` (fail-closed), `OutcomeCode`, `Ids` (tenant-scoped) | ✅ |
| `contracts-java` | ATS-0001 4 sözleşmenin Java mirror'ı (TS `contracts/` kanonik) + reference stub + contract-test + **ArchUnit** boundary | ✅ |

## Slice-sınırları (ATS-0016 sonrası)
- 🟢 Slice-1 (build aktif): consent-gated upload-ingest dikey dilimi — interview/session/recording domain + tenant-scope + fail-closed consent-gate + operasyonel audit-event emisyonu + **port-only** persistence/object-store/ledger (in-memory + local/test adapter; vendor SDK YOK).
- 🔓 Persistence unlock: [ATS-0018](../docs/adr/ATS-0018-persistence-unlock-postgres-jdbc.md) — **PG16 + Flyway + plain-JDBC tek-adapter-modülü (`persistence-postgres`); JPA/Hibernate/Spring-Data KULLANILMAZ**. Durum: **8a worm_ledger + 8b 6-store adapter LANDED** (Testcontainers-PG16 kanıtı; PG-smoke: CitationService uçtan-uca PG üzerinde); **8c retention-purge LANDED** (RetentionScanner portu + PG tarayıcı + purgeExpired; cutoff=çağıran-politikası, zamanlayıcı-tetikleyici composition işi); prod deploy/DSN/Vault wiring YOK.
- 🟢 Slice-9 composition (ATS-0008 D-A): **`app-boot` LANDED** — Spring Boot 3 YALNIZ bu modülde (domain framework-free; component-scan `com.ats.app` sınırlı, açık `@Bean` wiring); HikariCP DataSource + Flyway migrate-on-start + `/healthz` gerçek-DB-ping + Testcontainers boot-smoke (PG16'da tüm servisler ayakta + consent deny-by-default canlı). **Veri REST-endpoint'i YOK** — authn/z kapısı ilk veri-endpoint dilimiyle birlikte gelir (kapısız veri yüzeyi açılmaz); ObjectStore in-memory (D-D G0-ertelenmiş, startup WARN).
- 🟢 Slice-10 REST (ATS-0008 D-A devamı): **authn/z kapısı + ilk 3 veri-endpoint'i LANDED** — OAuth2 resource-server (JWT: JWKS+issuer+audience fail-closed doğrulama; IdP-nötr, vendor-coupling yok); **endpoint-bazlı scope ayrımı** (ats.consent.write / ats.recording.write / ats.transcript.read; authority YALNIZ tenant-claim varken; bilinmeyen yüzey denyAll; tenant DAİMA token'dan — ATS-0002); **consent yazımı = state + WORM kanıtı birlikte** (ConsentService: GRANTED=ledger-önce fail-closed, DENIED/WITHDRAWN=koruyucu-yön state-önce); consent PUT / recording POST (Content-Length zorunlu + üst sınır DoS-guard) / transcript GET (tenant-scoped, key=query-param). Test: GERÇEK RS256 imza + GERÇEK JWKS yayını + Testcontainers-PG (401/403 fail-closed matrisi + consent→upload→WORM-satırı-PG'de). İnce-taneli yetkilendirme (rol/ilişki; OpenFGA-benzeri) AYRI ADR — bu dilim kaba-taneli kapı.
- 🟢 Slice-11 REST devamı: **citation + human-review API'leri LANDED** — POST citations (CitationService fail-closed çekirdeği: claim_mismatch/invalid_refs/kaynaksız-SUPPORTED reddi aynen); review open→transition(TEK endpoint, kapalı action-enum: START/EDIT/REVIEWED_NO_CHANGE/REJECT/RATIONALE)→finalize + GET (query-param `case`; caseKey '/' içerir — path'e girmez); humanActorRef DAİMA token sub'ı (başkası adına review yapısal imkânsız); scope'lar ats.citation.write / ats.review.write / ats.review.read. E2E: gerçek JWT + Testcontainers-PG + **wire-contract ai-stub'ı (/v1/cite gerçek soket)** — citation 201+WORM, claim-değiştiren-sağlayıcı fail-closed, open→finalize+WORM, AI-state'ten finalize reddi, scope-matrisi.
- 🟢 Slice-12 REST kapanışı: **export + DSAR/erasure API'leri LANDED — P1 hattının API yüzeyi TAMAM** (consent/recording/transcript/citation/review/export/DSAR). POST export (FINALIZED-only + kriter-bağlama + source_evidence_refs⊆claims cross-invariant + pointer-only packet) + POST dsar + POST dsar/erasure (TOMBSTONE-ÖNCE; content silinir WORM kalır; terminal-vaka state korunur dürüst-receipt); scope'lar ats.export.write / ats.dsar.write (yalnız intake) / **ats.erasure.execute (yıkıcı content-silme AYRI yetki sınıfı)**.
- 🟢 Slice-15 composition devamı: **retention-scheduler (DEFAULT KAPALI)** — ats.retention.enabled=true açıkça verilmeden bean kurulmaz; cron+days+tenant-listesi fail-closed zorunlu; aktör=system-ref; tenant-izole hata (yutulmaz, idempotent retry); gerçek-PG testi (backdated silinir, taze + liste-dışı tenant korunur). **OpenAPI /v3/api-docs** (yalnız JSON metadata — swagger-UI bilinçle yok; permitAll: şema veri değildir; denyAll veri-endpoint'lerinde sürer). E2E full-chain: consent→citation→review→export→DSAR→erasure — transcript GET 404'e döner, evidence_packet.exported + evidence.tombstoned WORM satırları exact-assert.
- 🟢 Slice-16 Full ATS müşteri yolculuğu: **yayınlanmış sentetik ilan → adayın kendi başvurusunu kalıcı yazması → session-only takip anahtarıyla minimal durum → tenant-bound İK gelen kutusu → optimistic-lock insan durum geçişi**. Public submit strict JSON + 64 KiB limit + idempotency + bounded rate-limit; 256-bit takip anahtarı Web Crypto ile istemcide üretilir, idempotency digest'ine bağlanır ve DB'de yalnız SHA-256 özeti tutulur. İK yüzeyi `ats.application.read` / `ats.application.status.write` scope'larıyla ayrıdır; durum kümesi yalnız `SUBMITTED → UNDER_REVIEW → INTERVIEW_PENDING`, ret/teklif/puanlama yoktur. G0 gereği backend yalnız `.test` sentetik e-posta kabul eder; application-DSR/retention tamamlanmadan gerçek aday PII'sı konfigürasyonla dahi açılamaz.
- 🔒 Sonraki ayrı ADR'ler: gerçek Keycloak/OpenFGA/MinIO(object-store, ATS-0008 D-D G0'a ertelendi)/ATS-connector bağlantıları; STT wire-contract adapter'ı LANDED (`ai-provider-faz24`, ATS-0017) — canlı GPU-host bağlantısı deploy işi.
- 🔒 Release-locked (G0): gerçek aday verisi/pilot/demo-dogfood; build'de yalnız sentetik/açık-rızalı fixture.
- ⛔ scoring/affect/auto-reject ve **AI/connector kaynaklı aday yaşam-döngüsü write-back** (ADR-0005 — kalıcı yasak, forbidden-surface testi zorlar). Adayın kendi açık formunu göndermesi ve yetkili insan İK'nın kapalı durum makinesindeki adımları işletmesi bu yasak değildir; ATS-0005'teki ayrım geçerlidir.

## Boundary (ATS-0008 D-F)
ArchUnit: sözleşme/kernel pre-G0 **persistence/JPA/Flyway/Hibernate** + **platform iç-paket / vendor SDK**'ya bağlanamaz; `shared-kernel` sözleşmelere bağlı olamaz. Domain modülleri wire edilince `api`/`internal` ayrımı + modüller-arası import matrisi ADR ile açılır (split ucuz).

## Çalıştırma
```bash
cd backend
mvn -q test    # shared-kernel + contracts-java: contract + fail-closed + forbidden-surface + ArchUnit
```

## TS canonical parity (merge bağımlılığı — Codex WS-3)
`contracts-java`, TS `contracts/` (ATS-0001 kanonik, **PR #5** — henüz main'de değil) **mirror'ıdır**. Parity bu branch'te **doğrulanmadı** (TS kaynağı main'de yok). Merge sırası: **TS contracts (PR #5) önce main'e** → sonra WS-3; ya da parity golden-check aynı anda. `JsonValue` (shared-kernel) TS `JsonValue` ile birebir mirror — drift azaltır.

## CI notu
ats main'de workflow yok (Actions **billing** owner-blocked). Bu skeleton **local-verify**lidir; canonical gate "contract-test + CI guard" gereği **CI yeşillenmeden main'e "tamam" diye merge edilmez** (Codex WS-3 (d)) — billing düzelince workflow + merge.
