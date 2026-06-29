# backend/ — ats-core (modular monolith)

ATS-0008: `ats-core` = Java 21 + Spring Boot 3 **modular monolith** + `ats-ai` ayrı (Python). **P1 fonksiyonel build G0=GO'ya KİLİTLİ** (gate disiplini). Bu ağaç yalnız **gate-safe skeleton**: sözleşme + kernel + boundary guard.

> **Toolchain (repo-gerçeği):** ATS-0008 stack-lock "Gradle" diyordu; ortamda **Gradle yok, Maven 3.9 + JDK kurulu** → local-verify edilebilirlik + Spring Boot parity için **Maven** kullanıldı. (ATS-0008 toolchain satırı bu PR'da Maven'a güncellendi.)

## Şu an (gate-safe — `mvn test` ile doğrulanır)
| Modül | İçerik | Durum |
|---|---|---|
| `shared-kernel` | `Outcome` (fail-closed), `OutcomeCode`, `Ids` (tenant-scoped) | ✅ |
| `contracts-java` | ATS-0001 4 sözleşmenin Java mirror'ı (TS `contracts/` kanonik) + reference stub + contract-test + **ArchUnit** boundary | ✅ |

## Gate-locked (G0=GO sonrası — bu ağaçta YOK; Codex WS-3 gate-check)
- Domain modülleri **iş mantığı** (ATS-0008 8 modül: identity-tenant/consent/ingest-media/interview-workspace/evidence-ledger/ai-orchestration/export-connector/retention-dsr).
- JPA entity/repository, **Flyway domain migration**, ürün controller (actuator-health hariç), gerçek Keycloak/OpenFGA/PG/MinIO/STT/LLM/ATS bağlantısı.
- scoring/affect/auto-reject/candidate-write (ADR-0005 — **kalıcı yasak**, forbidden-surface testi zorlar).

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
