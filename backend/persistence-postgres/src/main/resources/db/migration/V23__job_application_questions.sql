-- Faz 25 #240 dilim A: ilana özel başvuru soruları.
--
-- Sahip talebi: "adaya sorular da yöneltebilmeliyiz; başvuru sırasında
-- yanıtlamasını isteyeceğimiz sorular olmalı."
--
-- Bugüne kadar ilan sözleşmesinde yalnız sabit `applicationFields` vardı; İK
-- ilana kendi sorusunu ekleyemiyordu. Tek çıkış yolu adayın serbest `note`
-- alanına yazmasıydı: ne sorulduğu belli değil, cevap yapısal değil, ilan
-- bazında karşılaştırma imkânsız.
--
-- SORU != OTOMATİK ELEME. Bu kolon yalnız soruyu taşır; eleme/puanlama
-- bilinçli olarak kapsam dışıdır (EU AI Act + KVKK insan kontrolü ilkesi).
--
-- Genişlet/daralt disiplini: kolon NOT NULL DEFAULT '[]' — mevcut ilanlar
-- "sorusu yok" olarak geçerli kalır, eski istemci kırılmaz.
-- `[]` = soru YOK; NULL olamaz, çünkü "bilinmiyor" ile "yok" karışırsa
-- aday formu hangi durumda soru göstereceğini bilemez (#218 dersi).

ALTER TABLE ats_job_posting
    ADD COLUMN IF NOT EXISTS questions JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE ats_job_posting
    DROP CONSTRAINT IF EXISTS ats_job_posting_questions_array;
ALTER TABLE ats_job_posting
    ADD CONSTRAINT ats_job_posting_questions_array
    CHECK (jsonb_typeof(questions) = 'array');

-- Üst sınır ŞEMADA da durur: uygulama doğrulaması atlanırsa (ör. doğrudan SQL
-- ile veri yükleme) aday formu 200 soruyla açılmasın.
ALTER TABLE ats_job_posting
    DROP CONSTRAINT IF EXISTS ats_job_posting_questions_max;
ALTER TABLE ats_job_posting
    ADD CONSTRAINT ats_job_posting_questions_max
    CHECK (jsonb_array_length(questions) <= 10);

COMMENT ON COLUMN ats_job_posting.questions IS
    '#240 A: ilana ozel basvuru sorulari [{position,text,kind,required,options}]. '
    'kind kapali kume: SHORT_TEXT|LONG_TEXT|YES_NO|SINGLE_CHOICE. '
    'Yalniz SORU tasir; otomatik eleme kapsam disidir.';
