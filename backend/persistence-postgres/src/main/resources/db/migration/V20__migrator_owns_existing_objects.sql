-- Faz 25 #230 P0-FULLATS-DB-02: migrator->runtime ownership transfer'i otomasyona al
-- (#176'nın kalan yarısı).
--
-- ats_app V1'den beri NOLOGIN'dir (yalnız GRANT toplayan bir grup rolü) — hiçbir bağlantı
-- literal olarak "ats_app" OLARAK CREATE TABLE çalıştırmaz; nesnelerin gerçek sahibi HER
-- ZAMAN o anki bağlı LOGIN kimliğidir (bugün: mevcut Flyway/runtime login'i, örn.
-- ats_app_login — henüz ats_migrator_login'e ayrılmadı, bkz. runbook adım 4).
--
-- Review düzeltmesi (Halil, PR#246): ilk revizyon "REASSIGN OWNED BY CURRENT_USER"
-- kullanıyordu — bu, o an bağlı kullanıcının SAHİP OLDUĞU HER ŞEYİ (public dışındaki
-- schema'lar, hatta CURRENT_USER veritabanın/schema'nın kendisinin sahibiyse o dahil)
-- devreder; #230 kabulü yalnız public'teki YÖNETİLEN ATS tablo/sequence'lerini kapsıyor.
-- Bunun yerine public şemasındaki, CURRENT_USER'a ait her tabloyu VE her sequence'i tek
-- tek numaralandırıp ayrı ayrı devrediyoruz — kapsam kesin olarak public ile sınırlı,
-- schema/database sahipliğine hiç dokunulmaz.
--
-- Doğru hedef bağlı LOGIN kimliğinin KENDİSİ: CURRENT_USER. Kendi sahip olduğun nesneleri
-- devretmek özel bir yetki istemez — yalnız hedef role (ats_migrator) üyeliği gerekir, ki
-- bu zaten V16'nın kendi ALTER DEFAULT PRIVILEGES FOR ROLE ats_migrator satırının başarılı
-- olması için önkoşuldu (bkz. RB-ats-migrator-role-split.md "Before any of this") — yeni
-- bir operasyonel önkoşul yok.
--
-- flyway_schema_history bu migration çalışırken Flyway tarafından kilitlidir. Aynı
-- transaction içinde o tabloya ALTER TABLE ... OWNER uygulamak PostgreSQL'de kendi
-- kilidini bekleyen bir lock wait üretir. Bu nedenle history tablosu burada bilinçli
-- olarak hariç tutulur; sahiplik devri Flyway kilidi bırakıldıktan sonraki iki-datasource
-- operasyon adımına aittir.
--
-- Idempotent: CURRENT_USER, flyway_schema_history dışında hiçbir şeye sahip değilse
-- döngüler sıfır kez çalışır (no-op, hata değil) — hem taze kurulumda hem yükseltmede
-- aynı blok geçerli.
DO $migrator_ownership_transfer$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT tablename FROM pg_catalog.pg_tables
         WHERE schemaname = 'public'
           AND tableowner = CURRENT_USER
           AND tablename <> 'flyway_schema_history'
    LOOP
        EXECUTE format('ALTER TABLE public.%I OWNER TO ats_migrator', r.tablename);
    END LOOP;

    FOR r IN
        SELECT sequencename FROM pg_catalog.pg_sequences
         WHERE schemaname = 'public' AND sequenceowner = CURRENT_USER
    LOOP
        EXECUTE format('ALTER SEQUENCE public.%I OWNER TO ats_migrator', r.sequencename);
    END LOOP;
END
$migrator_ownership_transfer$;

-- flyway_schema_history burada devredilmez, ancak iki-datasource ayrımı tamamlanana kadar
-- ats_app rolünün mevcut Flyway/runtime geçiş sürecinde history tablosuna erişebilmesi
-- gerekir. Bu grant, owner değişikliğinden bağımsız olarak geçiş sözleşmesini açık tutar.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE flyway_schema_history TO ats_app;
