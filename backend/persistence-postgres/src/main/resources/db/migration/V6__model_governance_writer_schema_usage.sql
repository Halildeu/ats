-- Faz 25 operator CLI: ats_governance_writer tablo grant'ini kullanabilmek için schema lookup yetkisi.
-- V4 immutable ve dağıtılmıştır; historical checksum değiştirilmez. Login/credential burada yaratılmaz:
-- owner-gated operator workflow ayrı, kısa ömürlü NO-SUPERUSER login'i bu NOLOGIN role member yapar.
GRANT USAGE ON SCHEMA public TO ats_governance_writer;
