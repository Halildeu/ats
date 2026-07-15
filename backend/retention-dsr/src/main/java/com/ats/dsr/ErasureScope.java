package com.ats.dsr;

import java.util.List;

/**
 * Silinecek content-plane anahtarları + tombstone hedef WORM evidence-id'leri (hepsi OPAK REF).
 * WORM entry'leri SİLİNMEZ — her hedefe append-only tombstone yazılır (ATS-0003).
 */
public record ErasureScope(
        List<String> transcriptKeys,
        List<String> citationKeys,
        List<String> exportArtifactKeys,
        List<String> reviewCaseKeys,
        List<String> screeningFindingSetRefs,
        List<String> tombstoneTargetEvidenceIds) {

    public ErasureScope {
        transcriptKeys = List.copyOf(transcriptKeys);
        citationKeys = List.copyOf(citationKeys);
        exportArtifactKeys = List.copyOf(exportArtifactKeys);
        reviewCaseKeys = List.copyOf(reviewCaseKeys);
        screeningFindingSetRefs = List.copyOf(screeningFindingSetRefs);
        tombstoneTargetEvidenceIds = List.copyOf(tombstoneTargetEvidenceIds);
    }

    public boolean empty() {
        return transcriptKeys.isEmpty() && citationKeys.isEmpty() && exportArtifactKeys.isEmpty()
                && reviewCaseKeys.isEmpty() && screeningFindingSetRefs.isEmpty()
                && tombstoneTargetEvidenceIds.isEmpty();
    }
}
