# RB — Model-Governance Owner-Gated İlk Transition (UNINITIALIZED→APPROVED)

> **Kapsam:** gov1-1e-c authority cutover ([[ATS-0021]]). Cutover sonrası onay-durumu TEK OTORİTE GLOBAL
> model-governance WORM'dan gelir; **normal boot WORM'a YAZMAZ (boot-seed YASAK)**. Bir modelin bir
> deployment'ta çalışabilmesi için ilgili `(approvalRef, capability)` öznesinin WORM'da `APPROVED` olması
> gerekir — bu, **owner-gated** bir append işlemidir (bu runbook). Aksi halde boot-gate fail-closed düşer
> (bu DOĞRU davranıştır: approval yoksa boot yok).

## Tetik

- Yeni bir onaylı-model kimliği (`approved-models.json` catalog'una eklenen politika) ilk kez canlıya
  alınacak → WORM'da henüz transition yok (`UNINITIALIZED`) → boot-gate DENY.
- Bir modelin iptali (`APPROVED→REVOKED`) ya da yeniden onayı (`REVOKED→APPROVED`) gerekiyor.

> **Müşteri-öncelikli çalışma modu:** Onay beklerken deployment `ats.ai.enabled=false` ile çekirdek
> ilan/başvuru/aday-takip/İK yolunu sunar. AI çağrı uçlarının `503 AI_NOT_APPROVED` dönmesi beklenen
> fail-closed durumdur; çekirdek ürünün bütünü bu owner gate yüzünden kapatılmaz. `enabled=true` yalnız
> aşağıdaki exact owner transition başarıyla doğrulandıktan sonra GitOps üzerinden etkinleştirilir.

## Önkoşullar (owner)

1. **Writer authority** (`ats_governance_writer`; INSERT+SELECT — V4; schema USAGE — V6). Bağlantı zarfı
   **Vault/credential broker'dan doğrudan stdin pipe** ile gelir; plaintext credential shell-history/argv/log/WORM'a
   **GİRMEZ** (D43). CLI her DB bağlantısında `SET ROLE ats_governance_writer` çalıştırır ve
   `current_user` exact eşleşmesini doğrular. Ayrıca `session_user` ayrı, explicit member ve
   `NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOREPLICATION/NOBYPASSRLS` değilse bağlantıyı reddeder; admin
   credential CLI'ye verilemez. Runtime app-rolü (`ats_app`)
   SELECT-only'dir ve bu role geçemez. Test recovery de kısa ömürlü ayrı operator login oluşturup member yapar;
   PostgreSQL bootstrap/superuser parolasını CLI'ye taşımaz.
2. **approvalRef** (içerik-adresli `mapr_<64hex>`): catalog politika alanlarından türetilir —
   `ApprovedModelSpec.of(capability, providerRef, modelId, version, idAliases, versionAliases, endpointRef,
   invocationProfileVersion, GLOBAL).approvalRef().value()` ([[ATS-0020]] §8). Shipped kimliklerin ref'leri
   golden-pinlidir (`ShippedApprovalRefGoldenTest`).
3. **İzinli geçiş + gerekçe** (`TransitionReason` single-source, `ModelGovernanceTransitions`):
   - `UNINITIALIZED→APPROVED` = `INITIAL_APPROVAL`
   - `UNINITIALIZED→DRAFT` = `DRAFTED` · `DRAFT→APPROVED` = `APPROVED_FROM_DRAFT`
   - `APPROVED→REVOKED` = `REVOKED_BY_OWNER` · `REVOKED→APPROVED` = `REAPPROVED`

## Adımlar

> İcra yüzeyi: imaj içindeki `model-governance-transition` operator komutu. Normal Spring boot'tan ayrı dispatch
> edilir; normal uygulama context'i hâlâ yalnız Reader görür ve boot-seed yapmaz. CLI de append/hash/CAS SQL'ini
> kopyalamaz: `ModelGovernanceAdminAppender` + `PostgresModelGovernanceLedger` canonical yolunu kullanır.
> `expectedFrom` = öznenin gerçek-son durumu (CAS); `occurredAt`/hash/sequence adapter üretir (backdating YOK).
> Stale/illegal/conflict fail-closed ve tipli reddir.

1. **Immutable imajı seç:** yalnız source-SHA + registry digest + kullanılan pod/iş digest'i eşleşen
   `ghcr.io/halildeu/ats-app-boot@sha256:<64hex>` kabul edilir; tag tek başına kanıt değildir.
2. **Credential zarfını stdin'e bağla:** exact-key JSON
   `{ "jdbcUrl", "username", "password", "sslMode" }`, en çok 16 KiB. `sslMode` yalnız `disable` (yalnız
   yerel/test network) veya `verify-full` (prod/uzak TLS) olabilir. TLS URL-query ile değil bu kapalı alanla
   verilir; JDBC URL içinde query/userinfo credential, bilinmeyen key veya eksik alan reddedilir. Raw zarfı
   terminale/loga yazdırma. Örnek yalnız veri akışı şablonudur:

   ```bash
   credential-broker --format ats-governance-stdin-json |
     docker run --rm -i --network <db-network> <IMAGE_AT_DIGEST> \
       model-governance-transition \
       --mode=check \
       --approval-ref=mapr_<64hex> \
       --capability=TRANSCRIBE \
       --expected-from=UNINITIALIZED \
       --to-status=APPROVED \
       --actor-ref=<opaque-owner-or-delegated-review-ref> \
       --reason=INITIAL_APPROVAL \
       --transition-id=mgt_<uuid-v4> \
       --confirm=CHECK_MODEL_GOVERNANCE_TRANSITION
   ```

3. **Aynı command alanlarıyla check çalıştır:** `MODEL_GOVERNANCE_CHECK:v1 outcome=OK` bekle. CLI approvalRef
   + capability'nin shipped kümülatif catalog'da exact tek kayıt olduğunu da doğrular. Check WORM'u
   tam projekte eder; herhangi bir global integrity bulgusu, stale state, illegal geçiş veya transition-id
   conflict varsa append'e geçmez ve yazım yapmaz. Check yalnız erken tanıdır; check→append arası başka writer
   yarışabilir. Otoriter yarış kapısı append transaction'ındaki advisory lock + `expectedFrom` CAS'tır; stale
   yarış yazmadan reddedilir.
4. **Owner/delegated-review kanıtını bağla:** actorRef PII/secret içermeyen opak referanstır; gerçek approval
   kaydı issue/evidence manifestindedir. Aynı `transitionId` korunur (yeniden koşum idempotent olsun).
5. **Yalnız açık mutation confirmation ile append çalıştır:** `--mode=append` ve
   `--confirm=APPEND_MODEL_GOVERNANCE_TRANSITION`. Credential zarfı yine stdin pipe'dır. Başarı çıktısı
   yalnız `transitionId`, `approvalRef`, `capability`, `sequence`, `entryHash`, `idempotent` taşır; DSN/user/
   password basılmaz.
6. **`MODEL_GOVERNANCE_APPEND:v1 outcome=OK` bekle.** CLI append sonrası WORM'u tekrar okuyup global chain
   bütünlüğünü, tek transition kimliğini ve hedef cari durumu doğrulamadan `OK` demez. Fail → **adım 7**.
7. **Doğrula (fail sinyali + devam eşiği):**
   - `Ok` → WORM'a yazıldı; `entry_hash`/`sequence` audit'e kaydet.
   - `STALE_EXPECTED_FROM` → özne beklenen durumda değil (ör. zaten APPROVED / yarış). Gerçek-son durumu
     `readAll`+projeksiyonla oku, `expectedFrom`'u düzelt, tekrar dene. **Idempotent re-run güvenli.**
   - `ILLEGAL_TRANSITION` → geçiş matriste yok (ör. `APPROVED→DRAFT`) → gerekçe/hedef yanlış; düzelt.
   - `NOT_CONFIGURED` → WORM/DB erişilemez → bağlantı/rol kontrol.
8. **AI aktivasyonunu GitOps'tan yap ve boot doğrula:** owner transition `Ok` kanıtlanmadan
   `ats.ai.enabled=true` yapılmaz. Exact ref/endpoint değerleriyle GitOps aktivasyonu sonrası boot-gate
   `resolve` WORM'u okur → `APPROVED` ise AI bean'leri kurulur. `resolve` DENIED kalıyorsa: özne gerçekten
   APPROVED mı, catalog↔WORM bütünlüğü (ref catalog'da mı, capability tutarlı mı, chain intact mi) kontrol
   et (ADR-0021 §3 taksonomi). Doğrudan workload patch/restart ile gate baypas edilmez.

## Rollback

- Yanlış onay → **REVOKE** (`APPROVED→REVOKED`, `REVOKED_BY_OWNER`). WORM append-only'dir; satır SİLİNMEZ
  (audit korunur) — durum yeni bir transition'la geri çevrilir. Revoke anında görünür (cache YOK; ADR-0021 §2).
- Boot fail-closed kaldı → bu güvenli varsayılandır (unapproved model çalışmaz); acele boot-seed ile
  bypass ETME (boot-seed YASAK).

## Referans

- [[ATS-0021]] (WORM tek status-otorite) · [[ATS-0020]] (boot-gate) · V4 migration (`model_governance_ledger`
  + `ats_governance_writer` rolü) · `ModelGovernanceAdminAppender` / `PostgresModelGovernanceLedger`
  (persistence-postgres) · `ModelGovernanceTransitions` (izinli geçiş matrisi)
- **Operator CLI kabul testi:** `ModelGovernanceOperatorCliTest` gerçek PostgreSQL 16'da check-no-mutation,
  writer-role assertion, append, idempotent replay, conflict ve secret-output guard'larını doğrular.
- **Boot test-fixture karşılığı** (canlı-run DEĞİL): `WormGovernanceTestSeed` +
  `WormStatusCutoverE2ETest` (boot/runtime REVOKE→re-approve canlı görünürlük kanıtı).
