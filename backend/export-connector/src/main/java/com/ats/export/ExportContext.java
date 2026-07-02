package com.ats.export;

import java.util.List;
import java.util.Map;

/**
 * Export girdi-pointer'ları (hepsi OPAK REF — gövde yok). Runtime store'u henüz olmayan
 * düzlemler (rıza kayıt-ref'leri, rubric sürümü/kriter job-relatedness ref'leri, redaction
 * koşusu, retention politikası, imza) P1-UI/persistence slice'larında kendi store'larından
 * gelir; bu slice'ta çağıran sağlar. Packet şekli contracts/samples/evidence-packet.sample.json
 * mirror'ıdır.
 */
public record ExportContext(
        String generatorVersionRef,
        String locale,
        String timezone,
        String aiAssistanceDisclosureRef,
        List<String> consentRefs,
        String rubricVersionRef,
        List<CriterionRef> criteria,
        Map<String, String> citationCriterion,
        List<String> wormChainRefs,
        String redactionPolicyRef,
        String redactionRunRef,
        String retentionPolicyRef,
        String schemaDigest,
        String signatureRef) {

    public record CriterionRef(String criterionId, String jobRelatednessRationaleRef) {}

    public ExportContext {
        consentRefs = List.copyOf(consentRefs);
        criteria = List.copyOf(criteria);
        citationCriterion = Map.copyOf(citationCriterion);
        wormChainRefs = List.copyOf(wormChainRefs);
    }
}
