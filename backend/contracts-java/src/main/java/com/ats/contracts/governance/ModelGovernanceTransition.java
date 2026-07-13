package com.ats.contracts.governance;

import java.time.Instant;
import java.time.format.DateTimeParseException;

/**
 * gov1-1e GLOBAL model-governance WORM'unun tek satırı: bir {@code (approvalRef, capability)} öznesinin
 * onay-durumu geçişi (approval/revocation), append-only hash-chain'e bağlı. WORM 1e-c'de tek status-otorite
 * olur (bu slice temeli kurar). Değişmez, doğrulanmış record.
 *
 * <p><b>Sınır (leniency by design):</b> bu record YALNIZ YAPISAL geçerliliği zorlar (non-null alanlar,
 * ISO occurredAt, 64-hex previous/entry-hash biçimi, {@code sequence >= 0}). Geçiş-MATRİSİ legalliği
 * ({@link ModelGovernanceTransitions}) ve {@code entryHash} DOĞRULUĞU ({@link ModelGovernanceTransitionHashChain})
 * BURADA zorlanmaz — READ tarafı {@code ModelGovernanceStatusProjection} bunları fail-closed doğrular ve
 * kurcalanmış/illegal satırları makine-görünür {@code IntegrityIssue}'ya çevirir (silent-skip YOK; 1d
 * JournalRecord deseni). Böylece bozuk-WORM senaryoları test-edilebilir kalır (kurulamayan fixture ≠ kanıt).
 *
 * <p><b>Veri-minimizasyonu (fail-closed):</b> claim/transcript/URL/bearer/secret/PII ASLA taşınmaz;
 * {@code actorRef} opak/bounded ({@link GovernanceActorRef}), {@code reasonCode} kapalı-enum
 * ({@link TransitionReason}) — serbest açıklama girmez.
 *
 * @param transitionId opak idempotency/korelasyon anahtarı (WORM içinde tekil)
 * @param approvalRef  içerik-adresli onaylı-model referansı (özne kimliğinin bir yarısı)
 * @param capability   yetenek (özne kimliğinin diğer yarısı; approvalRef ile tutarlı olmalı)
 * @param fromStatus   geçişin kaynak durumu (genesis'te {@link ApprovalStatus#UNINITIALIZED})
 * @param toStatus     geçişin hedef durumu
 * @param actorRef     geçişi gerçekleştiren opak/bounded aktör referansı
 * @param occurredAt   ISO-8601 instant (bu slice test-fixture'dan; 1e-b'de injected Clock)
 * @param reasonCode   kapalı gerekçe (matris + gerekçe-tutarlılığı single-source'u)
 * @param previousHash zincir bağı: önceki satırın entryHash'i (genesis'te {@link ModelGovernanceTransitionHashChain#GENESIS_PREVIOUS_HASH})
 * @param entryHash    bu satırın kanonik hash'i (previousHash + içerik); 64 küçük-hex
 * @param sequence     GLOBAL monoton, boşluksuz dizin (genesis = 0)
 */
public record ModelGovernanceTransition(
        TransitionId transitionId,
        ModelApprovalRef approvalRef,
        Capability capability,
        ApprovalStatus fromStatus,
        ApprovalStatus toStatus,
        GovernanceActorRef actorRef,
        String occurredAt,
        TransitionReason reasonCode,
        String previousHash,
        String entryHash,
        long sequence) {

    public ModelGovernanceTransition {
        if (transitionId == null) {
            throw new IllegalArgumentException("transitionId zorunlu (fail-closed)");
        }
        if (approvalRef == null) {
            throw new IllegalArgumentException("approvalRef zorunlu (fail-closed)");
        }
        if (capability == null) {
            throw new IllegalArgumentException("capability zorunlu (fail-closed)");
        }
        if (fromStatus == null) {
            throw new IllegalArgumentException("fromStatus zorunlu (fail-closed; genesis dahil açık token)");
        }
        if (toStatus == null) {
            throw new IllegalArgumentException("toStatus zorunlu (fail-closed)");
        }
        if (actorRef == null) {
            throw new IllegalArgumentException("actorRef zorunlu (fail-closed)");
        }
        if (reasonCode == null) {
            throw new IllegalArgumentException("reasonCode zorunlu (fail-closed)");
        }
        validateIso(occurredAt);
        if (!ModelGovernanceTransitionHashChain.isHashHex(previousHash)) {
            throw new IllegalArgumentException(
                    "previousHash 64 küçük-hex olmalı (fail-closed): " + previousHash);
        }
        if (!ModelGovernanceTransitionHashChain.isHashHex(entryHash)) {
            throw new IllegalArgumentException(
                    "entryHash 64 küçük-hex olmalı (fail-closed): " + entryHash);
        }
        if (sequence < 0) {
            throw new IllegalArgumentException("sequence negatif olamaz (fail-closed): " + sequence);
        }
    }

    private static void validateIso(String occurredAt) {
        if (occurredAt == null || occurredAt.isBlank()) {
            throw new IllegalArgumentException("occurredAt zorunlu (fail-closed)");
        }
        try {
            Instant.parse(occurredAt);
        } catch (DateTimeParseException e) {
            throw new IllegalArgumentException(
                    "occurredAt ISO-8601 instant olmalı (fail-closed): " + occurredAt);
        }
    }
}
