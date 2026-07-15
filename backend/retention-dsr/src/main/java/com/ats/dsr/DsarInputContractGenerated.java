package com.ats.dsr;

import java.util.regex.Pattern;

/**
 * GENERATED from contracts/policies/dsar-input-contract.v1.json by scripts/generate-dsar-input-contract.mjs.
 * DO NOT EDIT — ilk yayından önce contract+generator; sonrasında v2+forward migration değişir.
 */
public final class DsarInputContractGenerated {

    public static final int SUBJECT_REF_MIN_LENGTH = 36;
    public static final int SUBJECT_REF_MAX_LENGTH = 44;
    public static final int REASON_CODE_LENGTH = 20;
    public static final String DATA_SUBJECT_ERASURE_REASON = "DATA_SUBJECT_ERASURE";
    public static final String UUID_V4_PATTERN = "[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-4[0-9A-Fa-f]{3}-[89AaBb][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}";
    public static final String SUBJECT_REF_PATTERN = "^(?:(?:subj|subject)[._:-])?[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-4[0-9A-Fa-f]{3}-[89AaBb][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}$";
    public static final String REASON_CODE_PATTERN = "^DATA_SUBJECT_ERASURE$";

    private static final Pattern SUBJECT_REF = Pattern.compile(SUBJECT_REF_PATTERN);

    private DsarInputContractGenerated() {}

    public static boolean validSubjectRef(String value) {
        return value != null
                && value.length() >= SUBJECT_REF_MIN_LENGTH
                && value.length() <= SUBJECT_REF_MAX_LENGTH
                && SUBJECT_REF.matcher(value).matches();
    }

    public static boolean validReasonCode(String value) {
        return value != null
                && value.length() == REASON_CODE_LENGTH
                && DATA_SUBJECT_ERASURE_REASON.equals(value);
    }
}
