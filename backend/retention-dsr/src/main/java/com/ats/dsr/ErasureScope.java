package com.ats.dsr;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Set;

/**
 * Silinecek content-plane anahtarları + tombstone hedef WORM evidence-id'leri (hepsi OPAK REF).
 * WORM entry'leri SİLİNMEZ — her hedefe append-only tombstone yazılır (ATS-0003).
 */
public record ErasureScope(
        List<String> objectKeys,
        List<String> transcriptKeys,
        List<String> citationKeys,
        List<String> exportArtifactKeys,
        List<String> reviewCaseKeys,
        List<String> screeningFindingSetRefs,
        List<String> tombstoneTargetEvidenceIds) {

    private static final int MAX_TARGETS_PER_PLANE = 10_000;
    private static final int MAX_REF_LENGTH = 512;

    public ErasureScope {
        objectKeys = canonical(objectKeys, "objectKeys");
        transcriptKeys = canonical(transcriptKeys, "transcriptKeys");
        citationKeys = canonical(citationKeys, "citationKeys");
        exportArtifactKeys = canonical(exportArtifactKeys, "exportArtifactKeys");
        reviewCaseKeys = canonical(reviewCaseKeys, "reviewCaseKeys");
        screeningFindingSetRefs = canonical(screeningFindingSetRefs, "screeningFindingSetRefs");
        tombstoneTargetEvidenceIds = canonical(tombstoneTargetEvidenceIds, "tombstoneTargetEvidenceIds");
    }

    public boolean empty() {
        return objectKeys.isEmpty() && transcriptKeys.isEmpty() && citationKeys.isEmpty() && exportArtifactKeys.isEmpty()
                && reviewCaseKeys.isEmpty() && screeningFindingSetRefs.isEmpty()
                && tombstoneTargetEvidenceIds.isEmpty();
    }

    /**
     * Kalıcı saga first-writer binding'i için deterministik kapsam özeti. Yalnız sunucu tarafından
     * çözülen opak anahtarların tür-etiketli kanonik serisini hash'ler; aday içeriği taşımaz.
     */
    public String digest() {
        StringBuilder canonical = new StringBuilder("erasure-scope/v1\n");
        append(canonical, "object", objectKeys);
        append(canonical, "transcript", transcriptKeys);
        append(canonical, "citation", citationKeys);
        append(canonical, "export", exportArtifactKeys);
        append(canonical, "review", reviewCaseKeys);
        append(canonical, "screening", screeningFindingSetRefs);
        append(canonical, "worm", tombstoneTargetEvidenceIds);
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(canonical.toString().getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 runtime'da yok", ex);
        }
    }

    private static List<String> canonical(List<String> values, String field) {
        if (values == null) {
            throw new IllegalArgumentException(field + " null olamaz");
        }
        if (values.size() > MAX_TARGETS_PER_PLANE) {
            throw new IllegalArgumentException(field + " hedef sayısı sınırı aşıldı");
        }
        ArrayList<String> copy = new ArrayList<>(values.size());
        for (String value : values) {
            if (value == null || value.isBlank() || value.length() > MAX_REF_LENGTH
                    || value.chars().anyMatch(c -> c < 0x20 || c == 0x7f)) {
                throw new IllegalArgumentException(field + " opak ref değeri geçersiz");
            }
            copy.add(value);
        }
        if (Set.copyOf(copy).size() != copy.size()) {
            throw new IllegalArgumentException(field + " yinelenen hedef içeremez");
        }
        copy.sort(String::compareTo);
        return List.copyOf(copy);
    }

    private static void append(StringBuilder out, String type, List<String> values) {
        for (String value : values) {
            out.append(type).append(':').append(value.length()).append(':').append(value).append('\n');
        }
    }
}
