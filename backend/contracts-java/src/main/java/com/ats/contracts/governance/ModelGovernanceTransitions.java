package com.ats.contracts.governance;

/**
 * gov1-1e model-governance geçiş kuralları (SAF util; framework/persistence/state YOK). İzinli geçiş
 * matrisi + gerekçe-tutarlılığı, {@link TransitionReason} enum'unun kendi {@code (fromStatus, toStatus)}
 * bağlarından TÜRETİLİR (single-source; matris ve gerekçe iki ayrı yerde tanımlanmaz → drift YOK). WRITE
 * tarafı ({@code InMemoryModelGovernanceLedger}, 1e-b PG-adapter) ve READ tarafı
 * ({@code ModelGovernanceStatusProjection}) AYNI kuralları çağırır.
 *
 * <p>İzinli (tam küme): {@code UNINITIALIZED→DRAFT}, {@code UNINITIALIZED→APPROVED}, {@code DRAFT→APPROVED},
 * {@code APPROVED→REVOKED}, {@code REVOKED→APPROVED}. Reddedilen (gerekçesiz): {@code APPROVED→DRAFT},
 * {@code REVOKED→DRAFT}, her {@code status→AYNI-status} (self-transition), {@code UNINITIALIZED}'e dönüş.
 * Gerekçe-tutarlılığı: bir geçiş yalnız kendi bağlı gerekçesiyle yazılabilir (ör. {@code REVOKED→APPROVED}
 * yalnız {@link TransitionReason#REAPPROVED}).
 */
public final class ModelGovernanceTransitions {

    private ModelGovernanceTransitions() {}

    /**
     * {@code from → to} geçişi izinli mi (matris; gerekçeden bağımsız). true ancak {@link TransitionReason}
     * kümesinde bu çifti bağlayan bir gerekçe VARSA. Hiçbir gerekçe {@code from == to} bağlamadığından
     * self-transition otomatik reddedilir. null argüman → false (fail-closed).
     */
    public static boolean isAllowed(ApprovalStatus from, ApprovalStatus to) {
        if (from == null || to == null || from == to) {
            return false;
        }
        for (TransitionReason r : TransitionReason.values()) {
            if (r.fromStatus() == from && r.toStatus() == to) {
                return true;
            }
        }
        return false;
    }

    /**
     * Verilen {@code reason} tam olarak {@code from → to} geçişini mi bağlıyor (gerekçe-tutarlılığı).
     * null argüman → false (fail-closed). {@code isConsistent} true ise geçiş zaten izinlidir (gerekçe
     * gerçek bir geçişi bağlar), ama {@link #isValidTransition} ikisini de açıkça birleştirir (savunma).
     */
    public static boolean isConsistent(ApprovalStatus from, ApprovalStatus to, TransitionReason reason) {
        return reason != null && reason.fromStatus() == from && reason.toStatus() == to;
    }

    /**
     * Geçiş hem izinli (matris) hem gerekçe-tutarlı mı (WRITE-öncesi ve projeksiyon-doğrulama tek kapısı).
     * Fail-closed: null/self/gerekçe-uyuşmazlığı → false.
     */
    public static boolean isValidTransition(ApprovalStatus from, ApprovalStatus to, TransitionReason reason) {
        return isAllowed(from, to) && isConsistent(from, to, reason);
    }
}
