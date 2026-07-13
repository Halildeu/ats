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

## Önkoşullar (owner)

1. **Writer-rol credential** (`ats_governance_writer`; INSERT+SELECT — V4 migration). Bağlantı DSN'i
   **Vault'tan** alınır; plaintext credential shell-history/argv/log/WORM'a **GİRMEZ** (D43 stdin-pipe deseni).
   Runtime app-rolü (`ats_app`) SELECT-only'dir → yazamaz (least-privilege; ADR-0021 §4).
2. **approvalRef** (içerik-adresli `mapr_<64hex>`): catalog politika alanlarından türetilir —
   `ApprovedModelSpec.of(capability, providerRef, modelId, version, idAliases, versionAliases, endpointRef,
   invocationProfileVersion, GLOBAL).approvalRef().value()` ([[ATS-0020]] §8). Shipped kimliklerin ref'leri
   golden-pinlidir (`ShippedApprovalRefGoldenTest`).
3. **İzinli geçiş + gerekçe** (`TransitionReason` single-source, `ModelGovernanceTransitions`):
   - `UNINITIALIZED→APPROVED` = `INITIAL_APPROVAL`
   - `UNINITIALIZED→DRAFT` = `DRAFTED` · `DRAFT→APPROVED` = `APPROVED_FROM_DRAFT`
   - `APPROVED→REVOKED` = `REVOKED_BY_OWNER` · `REVOKED→APPROVED` = `REAPPROVED`

## Adımlar

> Append yüzeyi: `com.ats.persistence.ModelGovernanceAdminAppender` (writer-authority cephesi).
> `overPostgres(writerDataSource, Clock.systemUTC())` ile writer-DSN üstünde kurulur; `appendTransition(
> AppendCommand)` çağrılır. `expectedFrom` = öznenin gerçek-son durumu (CAS); `occurredAt`/hash/sequence
> adapter üretir (backdating YOK). Fail-closed: stale `expectedFrom` → `STALE_EXPECTED_FROM`; illegal geçiş
> → `ILLEGAL_TRANSITION`; aynı `transitionId` farklı içerik → `TRANSITION_ID_CONFLICT`.

1. **Vault'tan writer-DSN yükle** (env'e export ETMEDEN; stdin-pipe). Bağlantıyı `ats_governance_writer`
   kimliğiyle kur.
2. **AppendCommand oluştur** (fields non-null; fail-closed):
   `approvalRef`, `capability`, `expectedFrom` (ör. ilk onayda `UNINITIALIZED`), `toStatus` (`APPROVED`),
   `actorRef` (`GovernanceActorRef` — opak/bounded; PII/secret YOK), `reasonCode` (`INITIAL_APPROVAL`),
   `transitionId` (`TransitionId.random()` — UUIDv4).
3. **`appendTransition` çağır** → `Outcome.Ok(transition)` bekle. Fail → **adım 4**.
4. **Doğrula (fail sinyali + devam eşiği):**
   - `Ok` → WORM'a yazıldı; `entry_hash`/`sequence` audit'e kaydet.
   - `STALE_EXPECTED_FROM` → özne beklenen durumda değil (ör. zaten APPROVED / yarış). Gerçek-son durumu
     `readAll`+projeksiyonla oku, `expectedFrom`'u düzelt, tekrar dene. **Idempotent re-run güvenli.**
   - `ILLEGAL_TRANSITION` → geçiş matriste yok (ör. `APPROVED→DRAFT`) → gerekçe/hedef yanlış; düzelt.
   - `NOT_CONFIGURED` → WORM/DB erişilemez → bağlantı/rol kontrol.
5. **Boot doğrula:** ilgili deployment'ı (yeniden) başlat → boot-gate `resolve` WORM'u okur → `APPROVED`
   ise context kalkar. `resolve` DENIED kalıyorsa: özne gerçekten APPROVED mı, catalog↔WORM bütünlüğü
   (ref catalog'da mı, capability tutarlı mı, chain intact mi) kontrol et (ADR-0021 §3 taksonomi).

## Rollback

- Yanlış onay → **REVOKE** (`APPROVED→REVOKED`, `REVOKED_BY_OWNER`). WORM append-only'dir; satır SİLİNMEZ
  (audit korunur) — durum yeni bir transition'la geri çevrilir. Revoke anında görünür (cache YOK; ADR-0021 §2).
- Boot fail-closed kaldı → bu güvenli varsayılandır (unapproved model çalışmaz); acele boot-seed ile
  bypass ETME (boot-seed YASAK).

## Referans

- [[ATS-0021]] (WORM tek status-otorite) · [[ATS-0020]] (boot-gate) · V4 migration (`model_governance_ledger`
  + `ats_governance_writer` rolü) · `ModelGovernanceAdminAppender` / `PostgresModelGovernanceLedger`
  (persistence-postgres) · `ModelGovernanceTransitions` (izinli geçiş matrisi)
- **Test-fixture karşılığı** (canlı-run DEĞİL): `WormGovernanceTestSeed` (app-boot; Testcontainers superuser
  DataSource ile shipped kimlikleri `INITIAL_APPROVAL` seed'ler) + `WormStatusCutoverE2ETest` (boot/runtime
  REVOKE→re-approve canlı görünürlük kanıtı).
