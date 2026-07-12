package com.ats.review;

import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import java.util.List;

/** Tenant-scoped vaka deposu portu (persistence sonraki slice; slice-4 in-memory). */
public interface ReviewCaseStore {

    /** Pointer-only liste girdisi — ref GÖVDELERİ taşımaz; key + state. */
    record CaseSummary(String caseKey, ReviewState state) {}

    Outcome<String> put(ReviewCase reviewCase);

    Outcome<ReviewCase> find(TenantId tenantId, InterviewId interviewId, String caseKey);

    /** Mülakatın vaka listesi (tenant-scoped; UI devam-etme yüzeyi). Boş liste = Ok([]). */
    Outcome<List<CaseSummary>> listByInterview(TenantId tenantId, InterviewId interviewId);

    /** Geçiş sonrası aynı anahtara yazım; ledger-fail telafisinde önceki state'e geri dönüş için de kullanılır. */
    Outcome<Void> save(TenantId tenantId, String caseKey, ReviewCase reviewCase);

    /** 39d-11 CAS sonucu — repair yolunun ayırt etmesi gereken üç başarı/çatışma hali. */
    enum ExportTransitionResult {
        TRANSITIONED,
        ALREADY_EXPORTED_SAME_ARTIFACT,
        INTEGRITY_CONFLICT
    }

    /**
     * 39d-11 (Codex blocker-2): FINALIZED→EXPORTED geçişini ATOMİK compare-and-set
     * ile yapar (read-then-save yarışına kapalı). updated=0 ise yeniden okunur:
     * EXPORTED+AYNI artifactRef → ALREADY_EXPORTED_SAME_ARTIFACT (idempotent);
     * EXPORTED+farklı ref → INTEGRITY_CONFLICT; başka state → INVALID fail;
     * vaka yok → NOT_FOUND; store hatası kodu AYNEN taşınır (düzlenmez).
     */
    Outcome<ExportTransitionResult> markExportedIfFinalized(
            TenantId tenantId, InterviewId interviewId, String caseKey, String exportArtifactRef);
}
