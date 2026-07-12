package com.ats.contracts.governance;

/**
 * Onaylı-model kaydının onay durumu. Yalnız {@code APPROVED} çözülebilir
 * (fail-closed): {@code REVOKED}/{@code DRAFT} her zaman DENY. Durum, içerik-adresli
 * {@link ModelApprovalRef}'i DEĞİŞTİRMEZ — aynı politika farklı durumla aynı ref'i
 * üretir (status ref girdisi değildir).
 */
public enum ApprovalStatus {
    APPROVED,
    REVOKED,
    DRAFT
}
