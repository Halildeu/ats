-- ats#250 (sahip kararı 2026-09-25, yol (a)): girdisi olmayan eski başvuruların
-- deneyim/eğitim TEXT'i tek bir yapısal girdinin `description` alanına taşınır.
--
-- NEDEN: eski TEXT kolonlarını okuyan tek yüzey İK detayıdır ve TEXT'i yalnız yapısal
-- girdisi boş eski başvurularda gösterir (#250 denetimi, 2026-09-25). Kolon düşmeden
-- önce bu satırların bilgisi yapısal temsile taşınmalı; aksi hâlde düşürme bu
-- başvuruların deneyim ve eğitimini İK ekranından siler.
--
-- KURALLAR (sahip şartları):
--  * Yalnız girdisi BOŞ ('[]') ve TEXT'i dolu satırlar taşınır. Girdisi olan satıra
--    dokunulmaz; iki temsil çelişirse yapısal kazanır.
--  * Girdi yalnız {"description": <TEXT>} taşır; başlık, kurum ve tarih boş kalır. Bu,
--    yazma yolunun boş alanı hiç yazmama kuralıyla aynı şekildir (Pg.*EntriesToJson).
--    Tarihi olmadığı için #242 toplamına girmez; experience-coverage bunu
--    "uncomputable" olarak açıkça sayar.
--  * TEXT değişmez ve bu dilimde kolon düşmez: iki temsil bir süre birlikte kalır.
--  * Sayım eşitliği: taşınması gereken N satır = taşınan N satır ve sonrasında uygun
--    satır kalmaz. Eşitlik bozulursa göç hata verir ve işlem bütünüyle geri alınır.
--  * TEXT kısaltılmaz. Eski deneyim metni 8000 karaktere kadar olabilir; yeni girdi
--    açıklaması yazma yolunda 4000 ile sınırlı. Veri kaybı yerine sınır aşımı seçildi.
--
-- GERİ ALMA: TEXT aynen durduğu için tek UPDATE yeter (NOTICE'taki sayıyla karşılaştır):
--   UPDATE ats_application SET experience_entries = '[]'::jsonb
--    WHERE experience_entries = jsonb_build_array(jsonb_build_object('description', experience));
--   UPDATE ats_application SET education_entries = '[]'::jsonb
--    WHERE education_entries = jsonb_build_array(jsonb_build_object('description', education));
-- Uyarı: aynı şekli kendisi giren (yalnız açıklama yazmış) bir adayın satırı da eşleşir;
-- geri alma yalnız bu göçün hemen ardından koşulmalıdır.

DO $v26$
DECLARE
    experience_due   BIGINT;
    education_due    BIGINT;
    experience_moved BIGINT;
    education_moved  BIGINT;
    experience_left  BIGINT;
    education_left   BIGINT;
BEGIN
    SELECT count(*) INTO experience_due FROM ats_application
     WHERE experience_entries = '[]'::jsonb AND btrim(coalesce(experience, '')) <> '';
    SELECT count(*) INTO education_due FROM ats_application
     WHERE education_entries = '[]'::jsonb AND btrim(coalesce(education, '')) <> '';

    UPDATE ats_application
       SET experience_entries = jsonb_build_array(jsonb_build_object('description', experience))
     WHERE experience_entries = '[]'::jsonb AND btrim(coalesce(experience, '')) <> '';
    GET DIAGNOSTICS experience_moved = ROW_COUNT;

    UPDATE ats_application
       SET education_entries = jsonb_build_array(jsonb_build_object('description', education))
     WHERE education_entries = '[]'::jsonb AND btrim(coalesce(education, '')) <> '';
    GET DIAGNOSTICS education_moved = ROW_COUNT;

    SELECT count(*) INTO experience_left FROM ats_application
     WHERE experience_entries = '[]'::jsonb AND btrim(coalesce(experience, '')) <> '';
    SELECT count(*) INTO education_left FROM ats_application
     WHERE education_entries = '[]'::jsonb AND btrim(coalesce(education, '')) <> '';

    IF experience_moved <> experience_due OR education_moved <> education_due
            OR experience_left <> 0 OR education_left <> 0 THEN
        RAISE EXCEPTION 'V26 sayım eşitliği bozuk: deneyim %/% (kalan %), eğitim %/% (kalan %)',
            experience_moved, experience_due, experience_left,
            education_moved, education_due, education_left;
    END IF;
    RAISE NOTICE 'V26: deneyim % satır, eğitim % satır yapısal girdiye taşındı',
        experience_moved, education_moved;
END
$v26$;
