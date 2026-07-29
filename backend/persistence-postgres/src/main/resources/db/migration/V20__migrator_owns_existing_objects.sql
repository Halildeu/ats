-- Faz 25 #230 P0-FULLATS-DB-02: migrator->runtime ownership transfer'i otomasyona al
-- (#176'nın kalan yarısı).
--
-- V16 ats_app'ten schema CREATE'i aldı ve ats_migrator'ı DDL-yetkili yaptı, ama mevcut
-- her tablo/sequence'in SAHİPLİĞİ hâlâ ats_app'te kaldı (owner-implied DDL/DML narrow
-- V2..V19 grant'larını baypas eder). Bu satır PG16'nın REASSIGN OWNED semantiğiyle
-- çalışır: çağıran hem eski hem yeni rolün üyesi olmalı — bu üyelik zaten V16'nın kendi
-- ALTER DEFAULT PRIVILEGES FOR ROLE ats_migrator satırının başarılı olması için önkoşuldu
-- (bkz. RB-ats-migrator-role-split.md "Before any of this"), yani burada YENİ bir
-- operasyonel önkoşul eklenmiyor.
--
-- Idempotent: ats_app hiçbir şeye sahip değilse REASSIGN OWNED no-op'tur (hata değil) —
-- hem taze kurulumda (V1..V19 az önce ats_app olarak oluşturuldu) hem yükseltmede
-- (aylardır ats_app sahipliğinde biriken nesneler) aynı satır geçerli.
REASSIGN OWNED BY ats_app TO ats_migrator;

-- Sahiplik devri flyway_schema_history'i de kapsar. Flyway iki-datasource ayrımı
-- (runbook adım 5, follow-up PR) tamamlanana kadar gelecekteki migration'ları HÂLÂ
-- ats_app olarak çalıştırıyor — sahip artık ats_migrator olduğu için bu satır olmadan
-- V21+ "permission denied for table flyway_schema_history" ile patlardı.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE flyway_schema_history TO ats_app;
