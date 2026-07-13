package com.ats.contracts.governance;

/**
 * Onaylı-model kaydının onay durumu. Yalnız {@code APPROVED} çözülebilir
 * (fail-closed): {@code UNINITIALIZED}/{@code REVOKED}/{@code DRAFT} her zaman DENY. Durum,
 * içerik-adresli {@link ModelApprovalRef}'i DEĞİŞTİRMEZ — aynı politika farklı durumla aynı
 * ref'i üretir (status ref girdisi değildir).
 *
 * <p><b>gov1-1e:</b> bu enum artık GLOBAL model-governance WORM'unun transition-state
 * vokabüleridir de ({@link ModelGovernanceTransition}). {@code UNINITIALIZED} = bir
 * {@code (approvalRef, capability)} öznesi için HİÇ transition yazılmamış ilk-satır durumu:
 * genesis {@code fromStatus} açık bir token'dır (null DEĞİL; fail-closed başlangıç). Bir öznenin
 * yalnız ilk transition'ının {@code fromStatus}'u {@code UNINITIALIZED} olabilir; hiçbir izinli
 * geçiş {@code UNINITIALIZED}'e GERİ dönemez (tek-yön genesis). {@code UNINITIALIZED} de
 * çözülebilir değildir (APPROVED değil → DENY), yani WORM projeksiyonu bu durumu APPROVED
 * saymaz (fail-closed).
 */
public enum ApprovalStatus {
    /** Öznenin (approvalRef, capability) HİÇ transition'ı yok — genesis fromStatus token'ı (fail-closed; APPROVED değil). */
    UNINITIALIZED,
    APPROVED,
    REVOKED,
    DRAFT
}
