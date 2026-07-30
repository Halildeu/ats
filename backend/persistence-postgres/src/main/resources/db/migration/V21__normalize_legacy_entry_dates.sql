-- Faz 25 #242 dilim C: miras tarih değerlerinin tek seferlik normalizasyonu.
--
-- NEDEN: sahip gereksinimi toplu hesap ("verileri ay ve yıl olarak toplayacağız
-- ve kıyaslayacağız"). Karışık veri üzerinde toplama SESSİZCE yanlış sonuç verir:
-- ayrıştırılamayan satırlar yok sayılır ve çıkan sayı doğru görünür.
--
-- ÖLÇÜM (k3d-test canlı verisi, 2026-07-30, 38 başvuru / 34'ü dolu). Deneyim
-- tarihi değerlerinin dağılımı:
--
--     bos               56
--     yil (YYYY)        13
--     SERBEST METIN      9   ->  "Eyl 2022"      4
--                             ->  "Devam ediyor" 4
--                             ->  "Devam"        1
--     ay (YYYY-MM)       0
--
-- Yani serbest metnin ÇOĞU bozuk tarih değil, "iş hâlâ sürüyor" işaretiydi.
-- Bunu "ayrıştırılamadı" diye işaretlemek ölçülebilir veriyi çöpe atmak olurdu:
-- süregelen bir işin süresi pekâlâ hesaplanır (bitiş = bugün). Bu yüzden
-- süregelenlik tarih alanından çıkarılıp `ongoing: true` alanına taşınır.
-- Eğitim tarafında serbest metin YOKTU (12 yıl + 56 boş) — yine de aynı dönüşüm
-- uygulanır, çünkü CV içe aktarımı oraya da metin yazabilir.
--
-- ÇEVRİLEMEYENE DOKUNULMAZ: tanınmayan değer ham hâliyle korunur, sessizce
-- boşaltılmaz (#218 dersi: NULL != '[]'; bilinmeyen, boş değildir). Şekli zaten
-- "hesaplanamaz" der; ayrıca bir işaret alanına gerek yok.
--
-- SÖZLÜK SÜRÜKLENMESİ — bilinçli karar: aşağıdaki ay ve süregelenlik sözcükleri,
-- ResumeDateNormalizer'ın V21 anındaki SNAPSHOT'ıdır. Bu migration tarihsel bir
-- olaydır; bir kez koşar ve sonrasında atıl kalır. Java sözlüğü büyüdüğünde bu
-- dosya GÜNCELLENMEZ (frozen). İleriye dönük garanti kodda: ExperienceEntry /
-- EducationEntry kurucusu her yazma ve okuma yolunda normalize eder.
-- SQL ile Java'nın bu snapshot için aynı sonucu verdiği testle pinlenmiştir
-- (V21LegacyEntryDateNormalizationTest).
--
-- GERİ ALMA — neden ayrı yedek TABLOSU yok: yedek tablo, aday verisinin İKİNCİ bir
-- kopyası olurdu ve silme (KVKK erasure) yüzeyine ayrıca bağlanması gerekirdi;
-- bağlanmazsa silinmiş bir adayın geçmişini elde tutan gizli bir kopya kalır.
-- Ayrıca yeni tablo, #230'un "göç koşucusu yönetilen tablo SAHİBİ olmamalı"
-- değişmezini bozuyordu (V20 sahipliği devrediyor; sonradan yaratılan tablo
-- koşucuya ait kalır).
--
-- Bu yüzden ham değer AYNI girdinin içine yazılır: değişen her alan için
-- `<alan>Legacy` anahtarı eklenir (ör. startDateLegacy: "Eyl 2022"). Sonuçları:
--   * silme yüzeyi ARTMAZ — veri, erasure'ın zaten kapsadığı satırın içinde
--   * API'de GÖRÜNMEZ — DTO'da böyle bir alan yok
--   * KENDİ KENDİNİ TEMİZLER — yazma yolu yalnız bilinen anahtarları yazar,
--     aday kaydını bir kez düzenlediğinde `Legacy` anahtarı kendiliğinden düşer
--   * GERİ ALMA tek UPDATE: her `<alan>Legacy` değerini `<alan>`a geri koy
-- Değer DEĞİŞMEDİYSE anahtar hiç eklenmez — gereksiz kopya yok.

-- 1) Yardımcılar --------------------------------------------------------------
-- (pg_temp: oturum sonunda kendiliğinden yok olur, kalıcı iz yok)

CREATE FUNCTION pg_temp.v21_month(name TEXT) RETURNS TEXT AS $v21_month$
BEGIN
    RETURN CASE name
        WHEN 'ocak' THEN '01' WHEN 'oca' THEN '01'
        WHEN 'january' THEN '01' WHEN 'jan' THEN '01'
        WHEN 'subat' THEN '02' WHEN 'sub' THEN '02'
        WHEN 'february' THEN '02' WHEN 'feb' THEN '02'
        WHEN 'mart' THEN '03' WHEN 'mar' THEN '03' WHEN 'march' THEN '03'
        WHEN 'nisan' THEN '04' WHEN 'nis' THEN '04'
        WHEN 'april' THEN '04' WHEN 'apr' THEN '04'
        WHEN 'mayis' THEN '05' WHEN 'may' THEN '05'
        WHEN 'haziran' THEN '06' WHEN 'haz' THEN '06'
        WHEN 'june' THEN '06' WHEN 'jun' THEN '06'
        WHEN 'temmuz' THEN '07' WHEN 'tem' THEN '07'
        WHEN 'july' THEN '07' WHEN 'jul' THEN '07'
        WHEN 'agustos' THEN '08' WHEN 'agu' THEN '08'
        WHEN 'august' THEN '08' WHEN 'aug' THEN '08'
        WHEN 'eylul' THEN '09' WHEN 'eyl' THEN '09'
        WHEN 'september' THEN '09' WHEN 'sep' THEN '09'
        WHEN 'ekim' THEN '10' WHEN 'eki' THEN '10'
        WHEN 'october' THEN '10' WHEN 'oct' THEN '10'
        WHEN 'kasim' THEN '11' WHEN 'kas' THEN '11'
        WHEN 'november' THEN '11' WHEN 'nov' THEN '11'
        WHEN 'aralik' THEN '12' WHEN 'ara' THEN '12'
        WHEN 'december' THEN '12' WHEN 'dec' THEN '12'
        ELSE NULL END;
END
$v21_month$ LANGUAGE plpgsql IMMUTABLE;

CREATE FUNCTION pg_temp.v21_ongoing(raw TEXT) RETURNS BOOLEAN AS $v21_ongoing$
DECLARE
    v TEXT := regexp_replace(btrim(coalesce(raw, '')), '\s+', ' ', 'g');
    k TEXT;
BEGIN
    IF v = '' THEN RETURN false; END IF;
    k := regexp_replace(translate(lower(v), 'şğıüöç', 'sgiuoc'), '[.…—–-]+$', '');
    RETURN k IN ('devam', 'devam ediyor', 'devam ediyorum', 'devam etmekte',
                 'devamediyor', 'halen', 'halen devam ediyor', 'hala',
                 'hala devam ediyor', 'gunumuz', 'gunumuze kadar', 'bugun',
                 'suruyor', 'present', 'current', 'currently', 'now',
                 'to date', 'till date', 'ongoing');
END
$v21_ongoing$ LANGUAGE plpgsql IMMUTABLE;

CREATE FUNCTION pg_temp.v21_norm(raw TEXT) RETURNS TEXT AS $v21_norm$
DECLARE
    v TEXT := regexp_replace(btrim(coalesce(raw, '')), '\s+', ' ', 'g');
    sep TEXT;
    yr TEXT;
    mo TEXT;
BEGIN
    IF v = '' THEN RETURN raw; END IF;
    -- Zaten kanonik: YYYY ya da YYYY-MM.
    IF v ~ '^(19|20)[0-9]{2}(-(0[1-9]|1[0-2]))?$' THEN RETURN v; END IF;
    -- YYYY/MM, YYYY.MM  (tire hâlini yukarıdaki kanonik dal yakalar)
    IF v ~ '^(19|20)[0-9]{2}\s*[./]\s*(0?[1-9]|1[0-2])$' THEN
        sep := regexp_replace(v, '\s*[./]\s*', '/', 'g');
        RETURN split_part(sep, '/', 1) || '-' || lpad(split_part(sep, '/', 2), 2, '0');
    END IF;
    -- MM/YYYY, MM.YYYY, MM-YYYY
    IF v ~ '^(0?[1-9]|1[0-2])\s*[./-]\s*(19|20)[0-9]{2}$' THEN
        sep := regexp_replace(v, '\s*[./-]\s*', '/', 'g');
        RETURN split_part(sep, '/', 2) || '-' || lpad(split_part(sep, '/', 1), 2, '0');
    END IF;
    -- <ay adı> YYYY
    IF v ~ '^[^0-9 ]{3,9} (19|20)[0-9]{2}$' THEN
        mo := pg_temp.v21_month(translate(lower(split_part(v, ' ', 1)), 'şğıüöç', 'sgiuoc'));
        IF mo IS NOT NULL THEN RETURN split_part(v, ' ', 2) || '-' || mo; END IF;
    END IF;
    -- YYYY <ay adı>
    IF v ~ '^(19|20)[0-9]{2} [^0-9 ]{3,9}$' THEN
        mo := pg_temp.v21_month(translate(lower(split_part(v, ' ', 2)), 'şğıüöç', 'sgiuoc'));
        IF mo IS NOT NULL THEN RETURN split_part(v, ' ', 1) || '-' || mo; END IF;
    END IF;
    -- Tanınmadı: HAM değer korunur (boşaltmak veri kaybıdır).
    RETURN raw;
END
$v21_norm$ LANGUAGE plpgsql IMMUTABLE;

CREATE FUNCTION pg_temp.v21_fix_entry(entry JSONB, start_key TEXT, end_key TEXT)
RETURNS JSONB AS $v21_fix$
DECLARE
    out JSONB := entry;
    raw TEXT;
    fixed TEXT;
BEGIN
    raw := entry ->> start_key;
    IF btrim(coalesce(raw, '')) <> '' THEN
        -- Başlangıç alanına yazılmış süregelenlik işareti anlamsızdır; ham kalır.
        IF NOT pg_temp.v21_ongoing(raw) THEN
            fixed := pg_temp.v21_norm(raw);
            IF fixed <> raw THEN
                out := jsonb_set(out, ARRAY[start_key], to_jsonb(fixed))
                       || jsonb_build_object(start_key || 'Legacy', raw);
            END IF;
        END IF;
    END IF;
    raw := entry ->> end_key;
    IF btrim(coalesce(raw, '')) <> '' THEN
        IF pg_temp.v21_ongoing(raw) THEN
            out := (out - end_key) || jsonb_build_object('ongoing', true,
                                                        end_key || 'Legacy', raw);
        ELSE
            fixed := pg_temp.v21_norm(raw);
            IF fixed <> raw THEN
                out := jsonb_set(out, ARRAY[end_key], to_jsonb(fixed))
                       || jsonb_build_object(end_key || 'Legacy', raw);
            END IF;
        END IF;
    END IF;
    RETURN out;
END
$v21_fix$ LANGUAGE plpgsql IMMUTABLE;

-- 3) Normalizasyon ------------------------------------------------------------
-- Girdi SIRASI korunur (jsonb_agg ... ORDER BY ord): sıra adayın beyanıdır.
-- Değişmeyen satır UPDATE EDİLMEZ (updated_at gürültüsü ve gereksiz WAL yok).

UPDATE ats_application a
SET experience_entries = f.entries
FROM (
    SELECT s.tenant_id, s.application_id,
           jsonb_agg(pg_temp.v21_fix_entry(s.val, 'startDate', 'endDate')
                     ORDER BY s.ord) AS entries
    FROM (
        SELECT x.tenant_id, x.application_id, e.val, e.ord
        FROM ats_application x,
             jsonb_array_elements(x.experience_entries) WITH ORDINALITY e(val, ord)
        WHERE x.experience_entries <> '[]'::jsonb
    ) s
    GROUP BY s.tenant_id, s.application_id
) f
WHERE a.tenant_id = f.tenant_id
  AND a.application_id = f.application_id
  AND a.experience_entries <> f.entries;

UPDATE ats_application a
SET education_entries = f.entries
FROM (
    SELECT s.tenant_id, s.application_id,
           jsonb_agg(pg_temp.v21_fix_entry(s.val, 'startYear', 'endYear')
                     ORDER BY s.ord) AS entries
    FROM (
        SELECT x.tenant_id, x.application_id, e.val, e.ord
        FROM ats_application x,
             jsonb_array_elements(x.education_entries) WITH ORDINALITY e(val, ord)
        WHERE x.education_entries <> '[]'::jsonb
    ) s
    GROUP BY s.tenant_id, s.application_id
) f
WHERE a.tenant_id = f.tenant_id
  AND a.application_id = f.application_id
  AND a.education_entries <> f.entries;

DROP FUNCTION pg_temp.v21_fix_entry(JSONB, TEXT, TEXT);
DROP FUNCTION pg_temp.v21_norm(TEXT);
DROP FUNCTION pg_temp.v21_ongoing(TEXT);
DROP FUNCTION pg_temp.v21_month(TEXT);
