-- Faz 25 #230 P0-FULLATS-DB-02: migrator->runtime ownership transfer'i otomasyona al
-- (#176'nın kalan yarısı).
--
-- ats_app V1'den beri NOLOGIN'dir (yalnız GRANT toplayan bir grup rolü) — hiçbir bağlantı
-- literal olarak "ats_app" OLARAK CREATE TABLE çalıştırmaz; nesnelerin gerçek sahibi HER
-- ZAMAN o anki bağlı LOGIN kimliğidir (bugün: mevcut Flyway/runtime login'i, örn.
-- ats_app_login — henüz ats_migrator_login'e ayrılmadı, bkz. runbook adım 4). "REASSIGN
-- OWNED BY ats_app" bu yüzden yanlış hedefti: ats_app hiçbir zaman sahip olmadığı için
-- no-op'a benzer ama CI'daki MigrationRoleProvisioningPrerequisiteTest'in least-privilege
-- runner'ında (ats_deployer benzeri, yalnız ats_migrator üyesi) "permission denied to
-- reassign objects — Only roles with privileges of role ats_app may reassign objects
-- owned by it" ile SERT patlar (o runner ats_app'in üyesi değil).
--
-- Doğru hedef bağlı LOGIN kimliğinin KENDİSİ: CURRENT_USER. REASSIGN OWNED BY CURRENT_USER
-- kendi sahip olduğun nesneleri devretmek için özel bir yetki istemez — yalnız hedef role
-- (ats_migrator) üyeliği gerekir, ki bu zaten V16'nın kendi ALTER DEFAULT PRIVILEGES FOR
-- ROLE ats_migrator satırının başarılı olması için önkoşuldu (bkz.
-- RB-ats-migrator-role-split.md "Before any of this") — yeni bir operasyonel önkoşul yok.
--
-- Idempotent: CURRENT_USER hiçbir şeye sahip değilse REASSIGN OWNED no-op'tur (hata
-- değil) — hem taze kurulumda hem yükseltmede aynı satır geçerli.
REASSIGN OWNED BY CURRENT_USER TO ats_migrator;

-- Sahiplik devri flyway_schema_history'i de kapsar. Flyway iki-datasource ayrımı
-- (runbook adım 5, follow-up PR) tamamlanana kadar gelecekteki migration'ları HÂLÂ
-- ats_app olarak çalıştırıyor — sahip artık ats_migrator olduğu için bu satır olmadan
-- V21+ "permission denied for table flyway_schema_history" ile patlardı.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE flyway_schema_history TO ats_app;
