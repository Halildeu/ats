# RB-ATS-V7 — Career-site quarantine çözümü

## Amaç

V7 migration, eski sürümde `published=true` olan fakat doğrulanmış aktif kariyer sitesi bulunmayan ilanı public ve başvuru kabul eder halde bırakmaz. Yalnız bu ilanı `PAUSED` durumuna alır; deployment diğer tenant'lar için devam eder.

## Ön kontrol ve kanıt

Migration sonrasında yalnız karantinaya alınan satırları oku:

```sql
SELECT tenant_id, job_id, slug, status, version, updated_at
  FROM ats_job_posting
 WHERE updated_by = 'migration:v7:unroutable-published'
 ORDER BY tenant_id, job_id;
```

Beklenen durum `status='PAUSED'`, `published=false`, `apply_enabled=false` olmalıdır. `PUBLISHED` kalan ve aktif siteye bağlanmayan satır varsa rollout durdurulur.

## Güvenli çözüm

1. Tenant kimliğini platform tenant otoritesinden doğrula; URL'den veya ilan içeriğinden tenant tahmin etme.
2. Müşteriye ait, onaylanmış ve global benzersiz public handle belirle. Tenant UUID'sini handle olarak kullanma.
3. `ats_career_site` kaydını yetkili migration/operator kimliğiyle ekle; raw credential veya PII'yi issue/evidence kaydına koyma.
4. Recruiter, ürün arayüzünde karantinadaki ilanı kontrol eder ve `PAUSED -> PUBLISHED` geçişini yapar. Doğrudan SQL ile status/published alanı değiştirilmez.
5. Canonical `/careers/{publicHandle}/jobs/{slug}` yolu, aday başvuru sonucu ve recruiter havuzu test ortamında doğrulanır.

Örnek provision kalıbı; değerler operator tarafından doğrulanmadan çalıştırılmaz:

```sql
INSERT INTO ats_career_site
    (tenant_id, public_handle, display_name, active, created_by, updated_by,
     created_at, updated_at)
VALUES
    (:verified_tenant_id, :approved_public_handle, :approved_display_name, true,
     :operator_ref, :operator_ref, now(), now());
```

## Rollback sınırı

Karantinayı aşmak için `published=true` veya `status='PUBLISHED'` doğrudan yazılmaz. Handle doğrulanamıyorsa ilan `PAUSED` kalır; diğer ilanlar ve tenant'lar geri alınmaz. V7 migration rollback yerine ileri-düzeltme uygulanır.
