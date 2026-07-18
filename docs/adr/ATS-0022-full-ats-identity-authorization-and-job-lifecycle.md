# ATS-0022 — Full ATS kimlik/yetki otoritesi ve ilan yaşam döngüsü

- **Durum:** Accepted — müşteri-öncelikli Full ATS kararı, 2026-07-17
- **Kapsam:** İK tenant/kullanıcı erişimi, kariyer sitesi, ilan oluşturma-yayınlama ve sonraki Full ATS dikey dilimleri
- **Bağlam:** [ATS-0001](./ATS-0001-urun-boundary-primitives-via-interfaces.md), [ATS-0002](./ATS-0002-multi-tenant-izolasyon-deployment-topolojisi.md), [ATS-0018](./ATS-0018-persistence-unlock-postgres-jdbc.md), [ATS-0019](./ATS-0019-platform-web-mfe-integration.md)

## Problem

Full ATS'nin ilk gerçek müşterisi olan tenant yöneticisi, ayrı bir teknik konsola girmeden İK kullanıcısına erişim vermeli; İK kullanıcısı kendi hesabıyla ilan oluşturup yayınlamalı; aday da yayınlanan ilanı bulup başvurabilmelidir. Yalnız seed edilmiş ilan, Keycloak konsolundan elle client-role verme, frontend route'unu göstermek veya mock ekran bu yolculuğu tamamlamaz.

## Karar 1 — Kimlik ve tenant tek otoritede kalır

- Kimlik doğrulama ve oturum otoritesi platform Keycloak'tır.
- Kullanıcı profili otoritesi platform `user-service`, rol/modül/aksiyon yetkisi otoritesi platform `permission-service` + OpenFGA'dır.
- ATS kullanıcı, parola, davet veya genel rol tablosu **oluşturmaz**; Keycloak Admin REST'i doğrudan çağırmaz.
- Tenant yalnız imzası, issuer'ı ve audience'ı doğrulanmış JWT'nin yapılandırılmış tenant claim'inden alınır. Path, body ve header tenant override olamaz.
- Tenant yöneticisi mevcut platform **Kullanıcılar / Erişim Yönetimi** ürün yüzeyini kullanır. Keycloak yönetim konsolu müşteri yolculuğu değildir.

## Karar 2 — Full ATS ile mülakat kanıtı ayrı yetki sınırlarıdır

- `ATS` modülü, “Aday Takip Sistemi” ana ürün erişimidir ve varsayılan olarak hiçbir role örtük eklenmez.
- `INTERVIEW_EVIDENCE`, hassas kayıt/transkript/kanıt alt ürününün bağımsız, açık-atamalı modülü olarak kalır. Bu modül tek başına ilan, aday pipeline'ı veya teklif yönetimi yetkisi vermez.
- Full ATS için platform izin kataloğunda en az şu aksiyonlar yer alır:
  - `ATS_JOB_MANAGE`
  - `ATS_APPLICATION_MANAGE`
  - `ATS_INTERVIEW_MANAGE`
  - `ATS_OFFER_MANAGE`
  - `ATS_RETENTION_EXECUTE`
- `ATS:VIEW`, işe alım havuzunu salt-okur; `ATS:MANAGE` yönetim işlemlerini açar. Yıkıcı retention/silme işlemi yalnız `ATS_RETENTION_EXECUTE` ile yapılır; genel `MANAGE` bunu örtük vermez.
- Platform shell görünürlüğü yalnız UX kapısıdır. ATS API her korumalı istekte aynı bearer kimliği için platform authorization projection/decision sonucunu doğrular. Karar servisi yoksa veya cevap bozuksa erişim fail-closed reddedilir; frontend görünürlüğü API yetkisi sayılmaz.
- Geçiş dönemindeki `resource_access.ats-api.roles` scope-rolları yalnız açıkça `ATS_ALLOW_LEGACY_AUTHZ=true` verilen test/rolling-deploy profilinde kullanılabilir. Varsayılan ve production davranışı `false`/fail-closed'dur; yeni müşteri atamalarının otoritesi platform izin yazarıdır ve iki ayrı kalıcı rol kaynağı kurulmaz.

## Karar 3 — Kariyer sitesi tenant UUID'sini açığa çıkarmaz

- ATS, kimlik kaynağı olmayan bir `ats_career_site` projection'ı tutar: `tenant_id ↔ public_handle`.
- Kanonik public yol `/careers/{publicHandle}/jobs` biçimindedir. Tenant UUID URL'ye veya tarayıcı payload'ına çıkmaz.
- Mevcut `/jobs` yolu testte yapılandırılmış varsayılan kariyer sitesine geriye-uyumlu alias olarak kalır; yeni tenant entegrasyonu bu alias'a bağlanmaz.
- `public_handle` global benzersiz, küçük harfli ve değişikliği audit edilen bir tanıtıcıdır. Bir handle başka tenant'a yeniden atanamaz.
- Aktif kariyer sitesi/handle bulunmayan tenant ilanı taslak olarak hazırlayabilir ama yayınlayamaz; böylece public sonucu olmayan `PUBLISHED` ilan üretilemez.

## Karar 4 — İlan yaşam döngüsü ve başvuru kabulü

Kanonik durum makinesi:

```
DRAFT -> PUBLISHED -> PAUSED -> PUBLISHED
                  \-> CLOSED -> ARCHIVED
PUBLISHED -----------------> CLOSED
PAUSED --------------------> CLOSED
```

- Yeni ilan `DRAFT` oluşur; taslak public katalogda görünmez ve başvuru kabul etmez.
- Yalnız `PUBLISHED` ilan yeni başvuru kabul eder.
- `PAUSED` ve `CLOSED` ilan yeni başvuruyu fail-closed reddeder; daha önceki başvurular recruiter havuzunda kalır.
- `ARCHIVED` terminaldir. Yayınlanmış ilan hard-delete edilmez.
- İçerik güncelleme ve durum geçişi `expectedVersion` ile optimistic CAS kullanır.
- Ağ retry'si için create/update/transition komutları tenant-kapsamlı idempotency key + request digest taşır. CAS, idempotency'nin yerine geçmez. Üç komut tipi aynı tenant-geneli idempotency namespace'ini paylaşır; istemci her yeni mantıksal komut için yeni key üretir ve yalnız aynı komutun retry'sinde aynı key'i tekrar kullanır.
- Her başarılı create/update/transition, aynı DB transaction'ında append-only `ats_job_posting_event` kaydı üretir. Event PII veya serbest metin içermez; actor ref, sürüm, önceki/yeni durum, komut tipi ve digest içerir.

## Karar 5 — Plain JDBC ve güvenli migration

- ATS-0018 gereği JPA/Hibernate/Spring Data eklenmez; persistence plain JDBC'dir.
- `V7` additive ve rolling-compatible'dır: mevcut `published` kolonundan `status` backfill edilir; uygulama geçiş boyunca `published == (status == PUBLISHED)` invariantını dual-write eder. Legacy bridge, eski pod yazısında dahi `CLOSED/ARCHIVED` ilanı yeniden yayınlayamaz ve aktif career-site olmadan `PUBLISHED` üretemez; ihlal transaction'ı check-violation ile fail-closed keser.
- Public okumalar `status/apply_enabled` otoritesine geçtikten ve rollback penceresi kanıtlandıktan sonra ayrı bir ileri migration eski `published` kolonunu kaldırabilir. Trigger veya gecelik reconcile ile iki kalıcı truth tutulmaz.
- `ats_app` ilan için yalnız gerekli `SELECT/INSERT/UPDATE`, event/idempotency için gerekli dar yetkileri alır; ilan hard-delete yetkisi verilmez.

## API sözleşmesi

Korunan tenant yolları:

- `GET /api/v1/recruiter/jobs`
- `POST /api/v1/recruiter/jobs`
- `PUT /api/v1/recruiter/jobs/{jobId}`
- `POST /api/v1/recruiter/jobs/{jobId}/transitions`

Public yollar:

- `GET /api/v1/careers/{publicHandle}/jobs`
- `GET /api/v1/careers/{publicHandle}/jobs/{jobSlug}`
- `POST /api/v1/careers/{publicHandle}/jobs/{jobSlug}/applications`

Mutasyonlar `X-ATS-Idempotency-Key` zorunlu başlığını kullanır. Güncelleme ve geçiş gövdeleri `expectedVersion` taşır. Başarı response'u yeni `version` ve public visibility/apply state'i döndürür.

## Absorbe edilen ve reddedilen ikinci görüşler

2026-07-18 canonical inceleme sırasının ilk turunda doğrudan Anthropic CLI ile exact `claude-opus-4-8`, content-addressed ve secret-taramalı exact-head kapsamına `REVISE` verdi. Eski pod'un `published=true` yazısıyla terminal ilanı yeniden yayınlayabilmesi veya aktif kariyer sitesi olmadan yayın oluşturabilmesi P1 olarak; public yol alias'larının ayrı rate-limit bucket'ları, recruiter mutasyonlarında pre-deserialization body limiti eksikliği ve tenant-geneli idempotency namespace'inin açık belgelenmemesi P2 olarak raporlandı. Bulgular aynı dilime absorbe edildi; yeni exact head için Claude Opus 4.8 -> MiniMax M3 -> Codex 5.6 SOL yeniden incelemesi tamamlanmadan bu dal merge-ready sayılmaz.

Absorbe edilenler: platform kimlik otoritesini koruma, product-native admin UI, plain-JDBC CAS, create idempotency'sini CAS'tan ayırma, append-only lifecycle event, seed'siz ilan oluşturma, pause/resume/close ve mevcut başvuruları koruma; ayrıca platform PDP eksikliğinde legacy role'a sessiz düşüşü kaldırma, canonical kariyer handle'ını gerçekten tenant'a bağlama, role-separation negatiflerini genişletme, legacy rolling-deploy köprüsünü terminal durum ve aktif kariyer sitesi invariantlarıyla fail-closed kılma, public alias'ları tek rate-limit bucket'ında birleştirme ve recruiter mutasyonlarına gövde limiti uygulama.

Reddedilenler: JPA `@Version`, zaten var olan slug unique constraint'ini yeniden ekleme, Keycloak admin konsolunu müşteri UX'i sayma, ATS'nin Keycloak Admin REST ile ikinci rol/davet otoritesi kurması, her istekte JWT introspection, Flyway down migration, hukuki dayanak olmadan sabit yedi-yıl retention ve `published+status` için kalıcı çift-truth/trigger/reconcile.

## Teslimat kanıtı

Bu ADR tek başına teslimat değildir. İlk dikey dilim ancak test ortamında şu zincir tarayıcıyla kanıtlandığında ürün ilerlemesidir:

1. Tenant yöneticisi platform arayüzünde İK kullanıcısına `ATS` erişimi verir.
2. İK kullanıcısı kendi hesabıyla ilan oluşturur, düzenler ve yayınlar.
3. İlan public kariyer URL'sinde görünür.
4. Aday gerçek formu gönderir ve kalıcı başvuru referansı alır.
5. İK kullanıcısı aynı başvuruyu tenant-kapsamlı havuzunda görür.
