# ATS-0020 — P3-gov0 model-governance boot-gate: GERÇEK provider'a bağlı fail-closed onay kapısı

- **Durum:** **Accepted** (cross-AI Codex thread `019f57cb` AGREE, 2026-07-12) — P3-gov0 v1 (#111) üstüne **durable-fix** amendment. **İmplementasyon durumu:** boot-gate + provider-bağlı authorization + gate-then-construct composition **LANDED** (contracts-java + model-governance + app-boot; Testcontainers AppBootSmokeTest full-context PASS). Runtime OBSERVED model doğrulaması (gov1 consumer-gate, #110) YOK — bu ADR yalnız **boot-time authorized policy** kapısıdır.
- **Tarih:** 2026-07-12
- **Bağlam kaynağı:** P3-gov0 v1 commit `e2fbcb4` · Codex post-impl REVISE (2 blocker: gate ayrı `wirings` listesini dolaşıyordu → default boş → no-op → aktif provider varken governance DEKORATİF; `endpointRef`+`invocationProfileVersion` approval-digest'te ama gerçek çalıştırma hedefine bağlı değil → false assurance) · [[ATS-0005]] (AI-governance) · [[ATS-0017]] (STT provider) · [[ATS-0018]] (composition düzlemi config'ten okur)

## Bağlam

gov0 v1'de `ModelGovernanceBoot` AYRI bir `ats.model-governance.wirings` listesini dolaşıyordu (DEFAULT BOŞ → no-op). Ama gerçek `AIProvider`/`TranscriptionService`/`CitationService` `WiringConfig`'te **koşulsuz** kuruluyordu. Sonuç: aktif provider (`http-json`/`live-stt`) varken `wirings=[]` ile boot geçiyordu → governance **dekoratif**. Ayrıca `endpointRef` + `invocationProfileVersion` approval-digest'e giriyordu ama gerçek çalıştırma hedefine (props) bağlanmıyordu → **false assurance**.

## Karar

Boot-gate GERÇEK provider bean'ine bağlanır: provider **yalnız** beyan-edilen onaylı politika APPROVED'a çözülür + cross-check'lerden geçerse boot eder. Gate girdileri `ats.ai.provider` + `ats.ai.endpoint-ref` + `ats.ai.approvals.{transcribe-ref,cite-ref}`'tir (eski `wirings` KALDIRILDI).

### 1. Provider → enabled-capability matrisi (KAPALI, deterministik; kod sabiti)

| Gerçek provider | Enabled capability kümesi | Onay-ref beyanı kuralı |
|---|---|---|
| `live-stt` | `{TRANSCRIBE}` | `transcribe-ref` ZORUNLU; `cite-ref` verilirse **boot FAIL** (live-stt cite çalıştırmaz — yanlış beyan reddi) |
| `http-json` | `{TRANSCRIBE, CITE}` | `transcribe-ref` VE `cite-ref` İKİSİ DE ZORUNLU (ikisi de callable; biri eksik → boot FAIL). Partial-enable gov0 kapsamı DIŞI — reachable her capability onay ister |

Enabled-capability GERÇEK provider'dan TÜRETİLİR (config'te ayrıca beyan edilmez → drift imkânsız). Bilinmeyen provider → fail-closed.

### 2. Provider-enum → `configuredProviderRef` eşlemesi (KAPALI; kod sabiti)

| provider | beklenen `configuredProviderRef` | beklenen `invocationProfileVersion` |
|---|---|---|
| `live-stt` | `faz24-live-stt` | `ip-live-stt-1` |
| `http-json` | `http-json-generic` | `ip-http-json-1` |

authorizeProvider, çözülen her spec'in `configuredProviderRef` + `invocationProfileVersion` alanını bu beklenen değerlerle **exact-match** doğrular; uyuşmazlık → boot FAIL.

### 3. Capability-başına AYRI approval ref

Her enabled capability ayrı `mapr_<64hex>` ref'e bağlanır (`transcribe-ref` ≠ `cite-ref`). Tek bir "provider onayı" değil — her çalıştırılabilir yetenek kendi onaylı politikasına içerik-adresli olarak bağlıdır.

### 4. `endpointRef` → `baseUrl` eşlemesi DEPLOYMENT-AUTHORITATIVE invariant'tır

Kod, `ats.ai.base-url`'in gerçekten `endpointRef`'e karşılık geldiğini **KANITLAMAZ**. `endpointRef` opak bir deploy-referansıdır; boot-gate yalnız **beyan tutarlılığını** zorlar: (a) `ats.ai.endpoint-ref` == çözülen her spec'in `endpointRef`'i (exact); (b) çok-yetenekli provider'da tüm binding'ler AYNI `endpointRef` (tek bean/baseUrl). `endpointRef`↔`baseUrl` gerçek karşılığı **deployment sorumluluğudur** (bu invariant'ı operator/deploy-wiring taşır, kod değil).

### 5. Boot-gate INTENDED/authorized politikayı doğrular; OBSERVED runtime gov1'e aittir

Boot-gate = "bu deployment'ın çalıştırmayı BEYAN ettiği model onaylı mı?" (intended/authorized). Sağlayıcının çağrı-anında GERÇEKTEN hangi model-id/versiyon döndürdüğünün doğrulanması (OBSERVED) **gov1 consumer-gate (#110) işidir** — `ApprovedModelSpec.matchesReported` o yüzeydir. gov0 hard-required: `matchesReported`'ta absent (null/blank) reported-değer artık **MISMATCH** (default-deny; sağlayıcı kimlik beyan etmezse eşleşme verilmez). Opsiyonel-politika alanı gov0'da YOK (erken standardizasyon değil).

### 6. `approvalRef` "halen onaylı" kanıtı DEĞİLDİR

İçerik-adresli `approvalRef` yalnız **politika kimliğidir** (status hariç digest). "Bu politika ŞU AN onaylı" kanıtı DEĞİL — her boot (ve gov1'de her çağrı) **güncel registry-status resolution** gerektirir: `registry.resolve(ref, capability)` APPROVED değilse (REVOKED/DRAFT/NOT_FOUND) → boot FAIL. Aynı `approvalRef` REVOKED statüyle de üretilir; status taze çözülür.

### 7. Gate-then-construct composition garantisi

`WiringConfig`'te `@Bean AuthorizedModelBindings authorizedModelBindings(...)` `authorizeProvider`'ı çağırır (fail → composition patlar). `@Bean AIProvider aiProvider(..., AuthorizedModelBindings bindings)` bu bean'e **parametre-bağımlılığı** ile depend eder → Spring bean-dependency ordering: provider bean'i **yalnız** authorization TAMAMLANDIKTAN sonra kurulur. Gate patlarsa provider HİÇ oluşmaz (dekoratif değil). Kanıt: `ModelGovernanceCompositionTest` (ApplicationContextRunner — fail'de provider prob'u kurulmaz).

### 8. Operatör ref'i nasıl elde eder

`approvalRef`, kayıt kaynağındaki (`approved-models.json`) politika alanlarından **türetilir**: `ApprovedModelSpec.of(capability, providerRef, modelId, version, idAliases, versionAliases, endpointRef, invocationProfileVersion, APPROVED, GLOBAL).approvalRef().value()`. Operatör bu değeri (içerik-adresli SHA-256, status hariç) hesaplayıp `ats.ai.approvals.*`'a yazar. Shipped default `approved-models.json` `http-json-generic` (TRANSCRIBE+CITE) + `faz24-live-stt` (TRANSCRIBE) kimliklerini kapsar; default `application.yaml` `http-json` ref'lerini taşır (fail-closed full-context boot yeşil).

## Sonuç

- **Olumlu:** governance artık aktif provider'a bağlı (dekoratif değil); her enabled capability içerik-adresli onaya + provider/endpoint/profile cross-check'ine bağlı; gate-then-construct ile provider onaysız kurulamaz; `wirings` drift-yüzeyi kaldırıldı.
- **Sınır (dürüst):** `endpointRef`↔`baseUrl` gerçek karşılığı deployment-authoritative (kod kanıtlamaz); OBSERVED runtime model doğrulaması gov1'e ertelendi; yalnız GLOBAL scope (tenant-özel onay sonraki slice).
- **Log hijyeni:** boot-log yalnız `approvalRef`+`capability`+`providerRef`+`endpointRef` taşır (secret/URL YOK).
