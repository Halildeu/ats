-- Faz 25 #235: aday girişi — e-posta + tek kullanımlık kod.
--
-- Aday erişimi bugüne kadar başvuru-başına anahtardı; anahtar kaybolunca
-- kurtarma yoktu ve aynı adayın başvuruları tek yerden görünmüyordu (#226).
-- Bu iki tablo e-posta sahipliği kanıtına dayalı, kısa ömürlü bir oturum verir.
--
-- Düz metin kod veya oturum anahtarı ASLA saklanmaz — yalnız SHA-256 digest
-- (ats_application.candidate_access_digest ile aynı sözleşme: ^[0-9a-f]{64}$).

CREATE TABLE ats_candidate_login_challenge (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- lower(btrim()) normalizasyonu yazan tarafta yapılır; CHECK bunu kilitler
    -- ki hatalı bir yazıcı sessiz çift-kimlik üretmek yerine kapalı düşsün
    -- (#229'daki İK "diğer başvurular" eşleşmesiyle aynı normalizasyon).
    email_normalized TEXT NOT NULL CHECK (
        email_normalized = lower(btrim(email_normalized))
        AND length(email_normalized) BETWEEN 3 AND 320),
    code_digest TEXT NOT NULL CHECK (code_digest ~ '^[0-9a-f]{64}$'),
    created_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at > created_at),
    consumed_at TIMESTAMPTZ,
    -- Deneme sayacı DB'de: kilit kararı süreç belleğine bırakılırsa replica
    -- yeniden başlayınca sıfırlanır ve brute-force penceresi yeniden açılır.
    attempt_count INT NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 100)
);

-- verify akışı "bu adresin EN YENİ aktif kodu" diye okur; istek sıklığı
-- sınırı da pencere içindeki satırları sayar. İkisi de bu indeksle çözülür.
CREATE INDEX ats_candidate_login_challenge_email_created
    ON ats_candidate_login_challenge (email_normalized, created_at DESC);

CREATE TABLE ats_candidate_session (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    token_digest TEXT NOT NULL UNIQUE CHECK (token_digest ~ '^[0-9a-f]{64}$'),
    email_normalized TEXT NOT NULL CHECK (
        email_normalized = lower(btrim(email_normalized))
        AND length(email_normalized) BETWEEN 3 AND 320),
    created_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at > created_at)
);

-- V16 default privilege'ları ats_app'e yalnız SELECT+INSERT verir. Challenge
-- tablosu verify'da UPDATE ister (attempt_count++ / consumed_at); açık grant
-- olmadan uç canlıda permission-denied ile düşer. Session tablosuna UPDATE
-- bilerek verilmez — oturum uzatılmaz, süresi dolunca yeniden giriş yapılır.
GRANT SELECT, INSERT, UPDATE ON ats_candidate_login_challenge TO ats_app;
GRANT SELECT, INSERT ON ats_candidate_session TO ats_app;
