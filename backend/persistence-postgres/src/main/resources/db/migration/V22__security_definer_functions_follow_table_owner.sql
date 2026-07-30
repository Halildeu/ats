-- Faz 25: SECURITY DEFINER fonksiyonlarının sahibi, TABLO sahibini takip etsin.
--
-- CANLI ARIZA (ölçüldü 2026-07-30, k3d-test): mülakat içeriği yazma yolu
-- `PostgreSQL 42501 insufficient_privilege` ile düşüyordu:
--
--   FAIL: consent -> 503
--   {"reason":"rıza kanıtı yazılamadı — izin AKTİFLEŞTİRİLMEDİ (fail-closed):
--             ledger DB hatası (fail-closed): 42501"}
--
-- KÖK NEDEN İKİ KATMANLI. İlk teşhisim yarımdı; canlı ölçüm tamamladı.
--
-- (A) TANIMLAYICI hizası — üç halkalı ve ilk bakışta görünmüyor:
--   1. Content yazma tetikleyicileri (V14) `interview_content_gate` satırında
--      SHARE lock alır. Bu fonksiyonlar SECURITY DEFINER'dır, yani TANIMLAYICININ
--      (sahibinin) yetkileriyle koşar.
--   2. Canlıda o fonksiyonların sahibi `ats_app`'ti (tarihsel: nesneleri o login
--      yaratmıştı). `ats_app` gate tablosuna erişimini SAHİPLİK üzerinden
--      alıyordu — açık GRANT yoktu.
--   3. V20 (#230) tabloların sahipliğini `ats_migrator`'a devretti ama
--      FONKSİYONLARA dokunmadı. Tanımlayıcı `ats_app` kaldı, tablo sahibi
--      değişti → tanımlayıcı erişimini kaybetti → 42501.
--
-- (B) SAHİBİN KENDİ YETKİSİ SİLİNMİŞ. (A) düzeltildikten sonra arıza SÜRDÜ.
-- Ölçüm, ACL'nin BOŞ olduğunu gösterdi — sahiplik "zımni tam yetki" demek
-- DEĞİLDİR; ACL bir kez yazıldıysa sahip de o listeye tabidir:
--
--   relname                | sahip        | relacl | sahip_okuyabilir
--   interview_content_gate | ats_migrator | {}     | f
--
-- Yani devir sonrası tabloyu SAHİBİ bile okuyamıyordu; SECURITY DEFINER
-- fonksiyonu tanımlayıcı doğru olsa bile 42501 alıyordu. Bu tablo şemadaki
-- TEK böyle tabloydu (ölçüldü) — ama tekrar edebilecek bir sınıf.
--
-- YANLIŞ ÇÖZÜM (denedim, mevcut bir test durdurdu): `ats_app`'e gate tablosunda
-- SELECT/INSERT/UPDATE vermek. PostgresErasureScopeResolverTest bunu reddetti —
-- *"ats_app gate tablosunu UPDATE edememeli"*: mühürleme YALNIZ dar
-- `ats_seal_interview_for_erasure` yüzeyinden geçmeli, uygulama rolü tabloyu
-- doğrudan değiştirememeli. Tablo yetkisi vermek o güvenlik sınırını gevşetirdi.
--
-- DOĞRU ÇÖZÜM: tanımlayıcıyı tablo sahibine hizala. Fonksiyon gövdesi dar ve
-- sabittir; uygulama rolü hâlâ tabloya DOKUNAMAZ, yalnız EXECUTE grant'ıyla
-- fonksiyonu çağırır (V14 grant'ı sahiplik değişiminden etkilenmez).
--
-- Idempotent: sahibi zaten `ats_migrator` olan fonksiyon için no-op.
-- Keşif ÇALIŞMA ANINDA yapılır; fonksiyon adı hardcode edilmez (yeni SECURITY
-- DEFINER fonksiyonu eklendiğinde bu migration'ı güncellemek gerekmesin).

DO $definer_follows_owner$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure AS sig
        FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prosecdef
          AND pg_catalog.pg_get_userbyid(p.proowner) <> 'ats_migrator'
    LOOP
        EXECUTE format('ALTER FUNCTION %s OWNER TO ats_migrator', r.sig);
    END LOOP;
END
$definer_follows_owner$;

-- (B) düzeltmesi: sahibe kendi yetkilerini geri ver. Uygulama rolüne DOKUNMAZ —
-- `ats_app` gate tablosuna hâlâ erişemez (mühürleme yalnız dar fonksiyondan).
GRANT SELECT, INSERT, UPDATE, DELETE ON interview_content_gate TO ats_migrator;

-- SINIFI KAPAT (B): sahibinin OKUYAMADIĞI yönetilen tablo kalmamalı. Boş ACL
-- sessiz bir tuzaktır: sahiplik satırı doğru görünür, erişim yoktur ve arıza
-- uygulama katmanında "ledger DB hatası" diye çıkar.
DO $owner_can_read_audit$
DECLARE
    blind TEXT;
BEGIN
    SELECT string_agg(c.relname || ' (sahip=' || pg_catalog.pg_get_userbyid(c.relowner)
                      || ', acl=' || coalesce(c.relacl::text, 'NULL') || ')',
                      ', ' ORDER BY c.relname)
      INTO blind
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname NOT LIKE 'dsar_request_v15_quarantine_%'
      AND NOT has_table_privilege(pg_catalog.pg_get_userbyid(c.relowner), c.oid, 'SELECT');

    IF blind IS NOT NULL THEN
        RAISE EXCEPTION
            'Su tablolari SAHIBI bile okuyamiyor: %. Sahiplik zimni tam yetki '
            'DEGILDIR; ACL bir kez yazildiysa sahip de listeye tabidir.', blind;
    END IF;
END
$owner_can_read_audit$;

-- SINIFI KAPAT (A): tanımlayıcı ile tablo sahibi bir daha ayrışmasın. Ayrışırsa
-- arıza uygulama katmanında, sebepten üç adım uzakta görünür (42501, "ledger DB
-- hatası") — bu yüzden hata migration anında, adıyla verilir.
DO $definer_owner_audit$
DECLARE
    drifted TEXT;
BEGIN
    SELECT string_agg(p.proname || ' (sahip=' || pg_catalog.pg_get_userbyid(p.proowner) || ')',
                      ', ' ORDER BY p.proname)
      INTO drifted
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND pg_catalog.pg_get_userbyid(p.proowner) <> 'ats_migrator';

    IF drifted IS NOT NULL THEN
        RAISE EXCEPTION
            'SECURITY DEFINER fonksiyonlarinin sahibi tablo sahibi (ats_migrator) '
            'OLMALI; ayrisanlar: %. Tanimlayici tablo yetkisini kaybederse cagri '
            '42501 ile duser ve ariza uygulama katmaninda gorunur.', drifted;
    END IF;
END
$definer_owner_audit$;
