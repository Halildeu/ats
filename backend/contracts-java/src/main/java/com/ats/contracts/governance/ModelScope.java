package com.ats.contracts.governance;

/**
 * Onaylı-model kaydının kapsamı. Şimdilik yalnız {@code GLOBAL} (tenant-özel onay
 * YOK) — tenant-scoped onaylar sonraki slice + ADR (boot-validation da yalnız
 * GLOBAL doğrular). Kapalı küme: bilinmeyen kapsam fail-closed reddedilir.
 */
public enum ModelScope {
    GLOBAL
}
