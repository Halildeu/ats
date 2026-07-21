-- GENERATED from contracts/policies/dsar-input-contract.v1.json by scripts/generate-dsar-input-contract.mjs.
-- DO NOT EDIT: ilk yayından önce canonical contract+generator; sonrasında v2+V9+ değişir.
-- ATS #169: DSAR state/log düzlemine yaygın PII biçimleri veya serbest gerekçe metni yazılmasını kes.
-- Eski uygunsuz satırı sessizce sertifikalandırıp yarım-çalışır runtime açılmaz: yalnız violation
-- SAYISI raporlanır (ham değer yok), Flyway transaction durur ve operatör runbook'a yönlendirilir.
DO $$
DECLARE
    violation_count BIGINT;
BEGIN
    SELECT count(*) INTO violation_count
    FROM dsar_request
    WHERE NOT (
        char_length(subject_ref) BETWEEN 36 AND 44
        AND subject_ref ~ '^((subj|subject)[._:-])?[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-4[0-9A-Fa-f]{3}-[89AaBb][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}$'
        AND reason_code = 'DATA_SUBJECT_ERASURE'
    );
    IF violation_count > 0 THEN
        RAISE EXCEPTION
            'V8 DSAR input contract: % uygunsuz eski satır; migration durduruldu. docs/runbooks/RB-dsar-v8-input-contract-migration.md runbook''unu uygulayın',
            violation_count;
    END IF;
END $$;

ALTER TABLE dsar_request
    ADD CONSTRAINT dsar_request_subject_ref_contract_ck CHECK (
        char_length(subject_ref) BETWEEN 36 AND 44
        AND subject_ref ~ '^((subj|subject)[._:-])?[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-4[0-9A-Fa-f]{3}-[89AaBb][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}$'
    ),
    ADD CONSTRAINT dsar_request_reason_code_contract_ck CHECK (
        reason_code = 'DATA_SUBJECT_ERASURE'
    );
