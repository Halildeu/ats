package com.ats.orchestration;

import com.ats.contracts.AIProvider.Entailment;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import java.util.List;

/**
 * Claim-citation domain kaydı (SİLİNEBİLİR content düzlemi — data-lifecycle `claim_citation_ref`).
 * Claim METNİ ve çözülmüş segment index'leri burada yaşar; WORM ledger'a claim içeriği VEYA
 * claim-türevi hash GİRMEZ (ATS-0003 "hash kişisel-veri tuzağı"; Codex 019f23a6 slice-3 A2).
 */
public record Citation(
        TenantId tenantId,
        InterviewId interviewId,
        String transcriptKey,
        String claim,
        List<Integer> segmentIndexes,
        Entailment entailment) {

    public Citation {
        segmentIndexes = List.copyOf(segmentIndexes);
    }
}
