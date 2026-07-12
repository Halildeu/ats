package com.ats.contracts.governance;

import java.util.regex.Pattern;

/**
 * Onaylı-model kaydına İÇERİK-ADRESLİ referans: {@code mapr_<64-küçük-hex>} —
 * hex = {@link ApprovedModelSpec}'in politika alanlarının (status HARİÇ) kanonik
 * serileştirmesinin SHA-256'sı. Değişmez değer nesnesi; kurucu formatı fail-closed
 * doğrular (yanlış biçim ASLA nesneye dönüşmez). Ref'in politika-türevi olması,
 * çağıranın uydurma/eşleşmeyen ref taşımasını yapısal olarak engeller
 * ({@link ApprovedModelSpec} kurucusu ref==yeniden-hesaplanan-digest doğrular).
 */
public record ModelApprovalRef(String value) {

    private static final Pattern FORMAT = Pattern.compile("mapr_[0-9a-f]{64}");

    public ModelApprovalRef {
        if (value == null || !FORMAT.matcher(value).matches()) {
            throw new IllegalArgumentException(
                    "ModelApprovalRef biçimi geçersiz (beklenen mapr_<64-küçük-hex>): " + value);
        }
    }

    /** 64-karakter küçük-hex digest'ten {@code mapr_}-önekli ref üretir (fail-closed kurucu doğrular). */
    static ModelApprovalRef fromDigestHex(String lowercaseHex64) {
        return new ModelApprovalRef("mapr_" + lowercaseHex64);
    }
}
