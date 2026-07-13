package com.ats.contracts.governance;

/**
 * gov1-1e model-governance transition'ının KAPALI gerekçe vokabüleri (serbest açıklama WORM'a GİRMEZ —
 * veri-minimizasyonu + makine-okur governance). Her gerekçe, izin verdiği TEK {@code (fromStatus, toStatus)}
 * geçişini taşır: böylece gerekçe-tutarlılığı ({@code REVOKED→APPROVED yalnız REAPPROVED}) enum'un kendisinde
 * single-source'tur ve {@link ModelGovernanceTransitions} matris + gerekçe kontrollerini buradan türetir
 * (vokabüler drift YOK). Yeni bir gerekçe/geçiş eklemek onay-politikası genişletmesidir (ADR gerekir).
 *
 * <p>İzinli geçiş matrisi (tam küme):
 * <ul>
 *   <li>{@link #DRAFTED}: {@code UNINITIALIZED → DRAFT}</li>
 *   <li>{@link #INITIAL_APPROVAL}: {@code UNINITIALIZED → APPROVED}</li>
 *   <li>{@link #APPROVED_FROM_DRAFT}: {@code DRAFT → APPROVED}</li>
 *   <li>{@link #REVOKED_BY_OWNER}: {@code APPROVED → REVOKED}</li>
 *   <li>{@link #REAPPROVED}: {@code REVOKED → APPROVED} (yalnız explicit re-approval)</li>
 * </ul>
 * Listelenmeyen her geçiş (ör. {@code APPROVED→DRAFT}, {@code REVOKED→DRAFT}, {@code status→AYNI-status})
 * gerekçesizdir → {@link ModelGovernanceTransitions#isAllowed} tarafından fail-closed reddedilir.
 */
public enum TransitionReason {

    /** Taslak oluşturuldu: {@code UNINITIALIZED → DRAFT}. */
    DRAFTED(ApprovalStatus.UNINITIALIZED, ApprovalStatus.DRAFT),
    /** İlk onay (taslaksız doğrudan): {@code UNINITIALIZED → APPROVED}. */
    INITIAL_APPROVAL(ApprovalStatus.UNINITIALIZED, ApprovalStatus.APPROVED),
    /** Taslaktan onaya: {@code DRAFT → APPROVED}. */
    APPROVED_FROM_DRAFT(ApprovalStatus.DRAFT, ApprovalStatus.APPROVED),
    /** Sahip/operatör iptali: {@code APPROVED → REVOKED}. */
    REVOKED_BY_OWNER(ApprovalStatus.APPROVED, ApprovalStatus.REVOKED),
    /** İptalden explicit yeniden onay: {@code REVOKED → APPROVED}. */
    REAPPROVED(ApprovalStatus.REVOKED, ApprovalStatus.APPROVED);

    private final ApprovalStatus fromStatus;
    private final ApprovalStatus toStatus;

    TransitionReason(ApprovalStatus fromStatus, ApprovalStatus toStatus) {
        this.fromStatus = fromStatus;
        this.toStatus = toStatus;
    }

    /** Bu gerekçenin izin verdiği geçişin kaynak durumu (matris single-source). */
    public ApprovalStatus fromStatus() {
        return fromStatus;
    }

    /** Bu gerekçenin izin verdiği geçişin hedef durumu (matris single-source). */
    public ApprovalStatus toStatus() {
        return toStatus;
    }
}
