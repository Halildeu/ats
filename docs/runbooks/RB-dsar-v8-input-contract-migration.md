# RB — DSAR V8 input-contract migration

Bu runbook, `V8__dsar_input_contract.sql` eski ve yeni DSAR satırlarında aynı kapalı sözleşmeyi
doğrulayamıyorsa uygulanır. V8 uygunsuz satırların yalnız **sayısını** raporlar ve Flyway
transaction'ını durdurur; uygulama yarım-çalışır durumda açılmaz.

## Güvenlik sınırı

- `subject_ref` veya başka ham değerleri terminale, CI loguna, issue/PR yorumuna ya da shell
  history'ye yazdırmayın.
- Uygunsuz referansı hashleyip/yeni UUID uydurup otomatik "temiz" saymayın. Bu, veri sahibinin
  kimlik bağını bozabilir ve sahte bir eşleme üretir.
- Hukuki gerekçe metni `reason_code` alanına taşınmaz. Bu akışta yalnız
  `DATA_SUBJECT_ERASURE` desteklenir; yeni kategori #170 Legal/DPO kararı ve ayrı migration ister.
- Düzeltme production ise migration-owner + DPO/owner onayı ve şifreli backup zorunludur.

## 1. PII-safe preflight

Migration-owner bağlantısıyla yalnız aşağıdaki toplamı ölçün; satır değerlerini seçmeyin:

```sql
SELECT count(*) AS invalid_row_count
FROM dsar_request
WHERE NOT (
    char_length(subject_ref) BETWEEN 36 AND 44
    AND subject_ref ~ '^((subj|subject)[._:-])?[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-4[0-9A-Fa-f]{3}-[89AaBb][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}$'
    AND reason_code = 'DATA_SUBJECT_ERASURE'
);
```

Sonuç `0` ise V8 yeniden çalıştırılabilir. Sıfırdan büyükse rollout'u durdurun; bu sayı dışında
değer/log paylaşmayın.

## 2. Owner-gated remediation

Her satır için canonical kimlik sisteminden doğrulanmış UUIDv4 eşlemesi bulunmalıdır. Düzeltme,
parameterized bir admin işlemiyle ve aynı tenant/interview/dsar anahtarına bağlı değişiklik
makbuzuyla yapılır. Aşağıdakilerden biri yoksa satıra dokunmayın ve migration'ı kapalı tutun:

1. canonical identity-system kaydı,
2. tenant + interview + DSAR bağının aynı kişiye ait olduğuna dair doğrulanmış kanıt,
3. DPO/owner düzeltme onayı,
4. işlem öncesi şifreli backup ve rollback sahibi.

Eşleme bulunamıyorsa UUID üretmeyin, satırı silmeyin ve `reason_code`'u körlemesine değiştirmeyin.
Bu durum #170 Legal/DPO kararına taşınır.

## 3. Yeniden doğrulama ve rollout

1. Preflight sayacını yeniden çalıştırın; sonuç tam `0` olmalı.
2. V8'i Flyway üzerinden yeniden çalıştırın.
3. Constraint'lerin gerçekten doğrulanmış olduğunu kontrol edin:

```sql
SELECT conname, convalidated
FROM pg_constraint
WHERE conrelid = 'dsar_request'::regclass
  AND conname IN (
      'dsar_request_subject_ref_contract_ck',
      'dsar_request_reason_code_contract_ck'
  );
```

İki satır da `convalidated=true` değilse rollout kabul edilmez. Uygulama image'ı ancak migration
başarılı olduktan sonra açılır; live erasure yürütmek ayrıca #169/#170 ve deployment gate'lerine
tabidir.

## Rollback

V8 validation'da durursa Flyway transaction şema değişikliğini geri alır; önceki uygulama image'ı
çalışmaya devam eder. Başarılı V8 sonrasında constraint düşürmek rollback değildir. Geri dönüş
gerekiyorsa yeni, gözden geçirilmiş forward migration kullanın ve DPO/owner onayını kaydedin.
