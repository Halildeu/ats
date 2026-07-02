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
- 🔒 Sonraki ayrı ADR'ler: gerçek Keycloak/OpenFGA/MinIO(object-store, ATS-0008 D-D G0'a ertelendi)/ATS-connector bağlantıları; STT wire-contract adapter'ı LANDED (`ai-provider-faz24`, ATS-0017) — canlı GPU-host bağlantısı deploy işi.
- 🔒 Release-locked (G0): gerçek aday verisi/pilot/demo-dogfood; build'de yalnız sentetik/açık-rızalı fixture.
- ⛔ scoring/affect/auto-reject/candidate-write (ADR-0005 — **kalıcı yasak**, forbidden-surface testi zorlar).

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
