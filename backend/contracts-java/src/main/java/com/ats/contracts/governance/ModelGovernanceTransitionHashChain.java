package com.ats.contracts.governance;

import com.ats.kernel.JsonCodec;
import com.ats.kernel.JsonValue;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * gov1-1e GLOBAL model-governance transition-WORM'unun TEK deterministik hash-chain yardımcısı
 * (kernel {@link JsonCodec} kanonik JSON + SHA-256). Bir transition'ın {@code entryHash}'i:
 * transition'ın anlamsal içeriği (transitionId + approvalRef + capability + fromStatus + toStatus +
 * actorRef + occurredAt + reasonCode + sequence) + zincir bağı ({@code previousHash}) KANONİK
 * serileştirilip hash'lenir. Genesis'te {@code previousHash = }{@link #GENESIS_PREVIOUS_HASH}.
 *
 * <p><b>Neden tek kaynak:</b> WRITE tarafı ({@code InMemoryModelGovernanceLedger}, 1e-b PG-adapter) ve
 * READ tarafı ({@code ModelGovernanceStatusProjection}) AYNI hesabı çağırır — iki kopya YASAK (drift =
 * sessiz zincir-bütünlüğü açığı). {@code previousHash} de hash içeriğine dahildir; bu yüzden bir satırın
 * {@code previousHash}'ini kurcalamak {@code entryHash} yeniden-hesabını da bozar (tamper-evident).
 */
public final class ModelGovernanceTransitionHashChain {

    /** Genesis (ilk satır) için sabit sentinel önceki-hash (64 sıfır; "önce hiçbir şey yok"). */
    public static final String GENESIS_PREVIOUS_HASH = "0".repeat(64);

    /** entryHash / previousHash biçimi: 64 küçük-hex (SHA-256). Tek kaynak (record + projeksiyon buna bağlanır). */
    private static final Pattern HASH_HEX = Pattern.compile("[0-9a-f]{64}");

    private ModelGovernanceTransitionHashChain() {}

    /** 64 küçük-hex biçim doğrulaması (nesne üretmeden; {@link ModelGovernanceTransition} format guard'ı buna bağlanır). */
    public static boolean isHashHex(String value) {
        return value != null && HASH_HEX.matcher(value).matches();
    }

    /**
     * Bir transition'ın kanonik {@code entryHash}'i (açık alanlardan; WRITE tarafı record'u kurmadan ÖNCE
     * çağırır). {@code previousHash} genesis'te {@link #GENESIS_PREVIOUS_HASH}, aksi halde önceki satırın
     * {@code entryHash}'idir. Alanlar non-null (fail-closed; hesap sessiz-default üretmez).
     */
    public static String entryHash(
            String previousHash,
            TransitionId transitionId,
            ModelApprovalRef approvalRef,
            Capability capability,
            ApprovalStatus fromStatus,
            ApprovalStatus toStatus,
            GovernanceActorRef actorRef,
            String occurredAt,
            TransitionReason reasonCode,
            long sequence) {
        if (previousHash == null || transitionId == null || approvalRef == null || capability == null
                || fromStatus == null || toStatus == null || actorRef == null || occurredAt == null
                || reasonCode == null) {
            throw new IllegalArgumentException("entryHash: tüm içerik alanları zorunlu (fail-closed)");
        }
        Map<String, JsonValue> content = new LinkedHashMap<>();
        content.put("transition_id", JsonValue.of(transitionId.value()));
        content.put("approval_ref", JsonValue.of(approvalRef.value()));
        content.put("capability", JsonValue.of(capability.name()));
        content.put("from_status", JsonValue.of(fromStatus.name()));
        content.put("to_status", JsonValue.of(toStatus.name()));
        content.put("actor_ref", JsonValue.of(actorRef.value()));
        content.put("occurred_at", JsonValue.of(occurredAt));
        content.put("reason_code", JsonValue.of(reasonCode.name()));
        // sequence STRING olarak serileştirilir (double-precision drift'i imkânsız; hash girdisi opak).
        content.put("sequence", JsonValue.of(Long.toString(sequence)));
        content.put("previous_hash", JsonValue.of(previousHash));
        return sha256Hex(JsonCodec.canonical(JsonValue.object(content)));
    }

    /**
     * Mevcut bir {@link ModelGovernanceTransition}'ın {@code entryHash}'ini yeniden hesaplar (READ tarafı
     * projeksiyonun tamper-tespiti: yeniden-hesap ≠ saklanan {@code entryHash} → zincir bozuk). Adapter'ın
     * yazarken kullandığı AYNI hesap (single-source) — {@code t.previousHash()} girdiye dahil.
     */
    public static String recompute(ModelGovernanceTransition t) {
        return entryHash(t.previousHash(), t.transitionId(), t.approvalRef(), t.capability(),
                t.fromStatus(), t.toStatus(), t.actorRef(), t.occurredAt(), t.reasonCode(), t.sequence());
    }

    private static String sha256Hex(String text) {
        try {
            return HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 mevcut olmalı", e);
        }
    }
}
