package com.ats.dsr;

import java.util.regex.Pattern;

/**
 * DSAR intake veri-minimizasyonu sözleşmesi.
 *
 * <p>{@code subjectRef}, adayın adı/e-postası/telefonu gibi serbest metin değildir. Yalnız
 * kimlik-çözümleme düzleminde önceden üretilmiş kanonik UUIDv4'ü veya
 * {@code subj-<UUIDv4>}/{@code subject-<UUIDv4>} opak anahtarını kabul eder. Bu biçim tek başına
 * semantik opaklık kanıtı değildir; ref'i üreten kimlik sistemi PII kodlamamakla yükümlüdür.
 * {@code reasonCode} hukuki açıklama metni değil,
 * bu akışın tek desteklediği kapalı operasyon kodudur. Yeni hukuki kategoriler Legal/DPO kararı
 * olmadan eklenmez. Böylece yaygın PII biçimi/serbest metnin kalıcı state ve operasyon event'lerine
 * taşınması fail-closed kesilir.
 */
public final class DsarInputPolicy {

    public static final int SUBJECT_REF_MIN_LENGTH = 36;
    public static final int SUBJECT_REF_MAX_LENGTH = 44;
    public static final int REASON_CODE_LENGTH = 20;
    public static final String DATA_SUBJECT_ERASURE_REASON = "DATA_SUBJECT_ERASURE";
    public static final String UUID_V4_PATTERN =
            "[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-4[0-9A-Fa-f]{3}"
                    + "-[89AaBb][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}";
    public static final String SUBJECT_REF_PATTERN =
            "^(?:(?:subj|subject)[._:-])?" + UUID_V4_PATTERN + "$";
    public static final String REASON_CODE_PATTERN = "^DATA_SUBJECT_ERASURE$";

    private static final Pattern SUBJECT_REF = Pattern.compile(SUBJECT_REF_PATTERN);

    private DsarInputPolicy() {}

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
