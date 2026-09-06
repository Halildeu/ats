-- #240 B: adayın ilana özel sorulara cevapları, başvuru satırının ÜSTÜNDE (ayrı tablo değil).
--
-- Neden kolon: cevaplar başvuruyla 1:1'dir, hep onunla okunur/yazılır ve KVKK
-- yaşam döngüsünü (personal_data_erased_at + tüm okuma yollarındaki
-- "erased IS NULL" guard'ları) ek kod olmadan MİRAS ALIR. Ayrı tablo, unutulacak
-- yeni bir silme/guard/grant noktası olurdu.
--
-- CEVAP != OTOMATİK ELEME. Cevaplar yalnız saklanır ve (dilim C'de) İK'ya
-- soru metniyle gösterilir; eleme/puanlama/sıralama bilinçli olarak kapsam dışıdır.
--
-- Cevap sözleşmesi (kanonik JSON, camelCase):
--   [{"questionId":"q_…","text":"…"} | {"questionId":"q_…","yes":true|false}
--    | {"questionId":"q_…","optionId":"qo_…"}]
-- Tipe göre TAM BİR değer alanı; kimliğe bağlanır, görünen metne değil.

ALTER TABLE ats_application
    ADD COLUMN IF NOT EXISTS answers JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE ats_application DROP CONSTRAINT IF EXISTS ats_application_answers_is_array;
ALTER TABLE ats_application ADD CONSTRAINT ats_application_answers_is_array
    CHECK (jsonb_typeof(answers) = 'array');
ALTER TABLE ats_application DROP CONSTRAINT IF EXISTS ats_application_answers_max;
ALTER TABLE ats_application ADD CONSTRAINT ats_application_answers_max
    CHECK (jsonb_array_length(answers) BETWEEN 0 AND 10);
COMMENT ON COLUMN ats_application.answers IS
    '#240 B: ilan sorularına aday cevapları (questionId/optionId bağlı, kanonik JSON). Eleme/puanlama YOK.';

-- Onaylı plan md.6: başvuru anındaki ilan sürümü + soru/seçenek METNİ snapshot'ı.
-- İK sonradan soruyu düzenlese/silse bile cevap yorumlanabilir kalır; cevap
-- `questionId`'ye bağlıdır, metin buradan okunur.
ALTER TABLE ats_application
    ADD COLUMN IF NOT EXISTS job_version INTEGER;
ALTER TABLE ats_application
    ADD COLUMN IF NOT EXISTS questions_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE ats_application DROP CONSTRAINT IF EXISTS ats_application_questions_snapshot_is_array;
ALTER TABLE ats_application ADD CONSTRAINT ats_application_questions_snapshot_is_array
    CHECK (jsonb_typeof(questions_snapshot) = 'array');
COMMENT ON COLUMN ats_application.job_version IS
    '#240 B: başvuru anındaki ilan CAS sürümü (questions_snapshot bu sürüme aittir). Eski satırlarda NULL.';
COMMENT ON COLUMN ats_application.questions_snapshot IS
    '#240 B: başvuru anındaki ilan soruları (questionId/order/text/kind/required/options) — cevapların bağlamı.';
