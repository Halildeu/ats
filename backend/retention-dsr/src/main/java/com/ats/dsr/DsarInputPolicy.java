package com.ats.dsr;

/**
 * DSAR intake veri-minimizasyonu sözleşmesi.
 *
 * <p>{@code subjectRef}, adayın adı/e-postası/telefonu gibi serbest metin değildir. Yalnız
 * kimlik-çözümleme düzleminde önceden üretilmiş kanonik UUIDv4'ü veya
 * {@code subj|subject} öneki ile {@code . _ : -} ayırıcısından birini kullanan opak anahtarı
 * kabul eder. Bu biçim tek başına
 * semantik opaklık kanıtı değildir; ref'i üreten kimlik sistemi PII kodlamamakla yükümlüdür.
 * {@code reasonCode} hukuki açıklama metni değil,
 * bu akışın tek desteklediği kapalı operasyon kodudur. Yeni hukuki kategoriler Legal/DPO kararı
 * olmadan eklenmez. Böylece yaygın PII biçimi/serbest metnin kalıcı state ve operasyon event'lerine
 * taşınması fail-closed kesilir.
 */
public final class DsarInputPolicy {

    public static final int SUBJECT_REF_MIN_LENGTH =
            DsarInputContractGenerated.SUBJECT_REF_MIN_LENGTH;
    public static final int SUBJECT_REF_MAX_LENGTH =
            DsarInputContractGenerated.SUBJECT_REF_MAX_LENGTH;
    public static final int REASON_CODE_LENGTH = DsarInputContractGenerated.REASON_CODE_LENGTH;
    public static final String DATA_SUBJECT_ERASURE_REASON =
            DsarInputContractGenerated.DATA_SUBJECT_ERASURE_REASON;
    public static final String UUID_V4_PATTERN = DsarInputContractGenerated.UUID_V4_PATTERN;
    public static final String SUBJECT_REF_PATTERN = DsarInputContractGenerated.SUBJECT_REF_PATTERN;
    public static final String REASON_CODE_PATTERN = DsarInputContractGenerated.REASON_CODE_PATTERN;

    private DsarInputPolicy() {}

    public static boolean validSubjectRef(String value) {
        return DsarInputContractGenerated.validSubjectRef(value);
    }

    public static boolean validReasonCode(String value) {
        return DsarInputContractGenerated.validReasonCode(value);
    }
}
