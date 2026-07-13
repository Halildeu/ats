package com.ats.governance;

import com.ats.contracts.governance.ApprovalStatus;
import com.ats.contracts.governance.Capability;
import com.ats.contracts.governance.ModelApprovalRef;
import com.ats.contracts.governance.ModelGovernanceLedger;
import com.ats.contracts.governance.ModelGovernanceTransition;
import com.ats.contracts.governance.ModelGovernanceTransitionHashChain;
import com.ats.contracts.governance.ModelGovernanceTransitions;
import com.ats.kernel.Outcome;
import java.time.Clock;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * gov1-1e in-memory {@link ModelGovernanceLedger} adapter'ı (Reader + Appender; test + composition-varsayılan).
 * Framework/persistence/vendor YOK (ArchUnit zorlar) — yalnız shared-kernel + contracts-java + injected
 * {@link Clock}. GLOBAL append-only hash-chain'i tek-thread semantiğiyle tutar (concurrency advisory-lock
 * 1e-b PG'de).
 *
 * <p><b>Fail-closed append (Codex 1e-a):</b>
 * <ul>
 *   <li>{@code expectedFrom} öznenin gerçek-son durumuyla karşılaştırılır — uyuşmazsa
 *       {@link AppendRejection#STALE_EXPECTED_FROM} (optimistic-concurrency conflict; caller stale gördü).</li>
 *   <li>geçiş matris+gerekçe-tutarlı olmalı — değilse {@link AppendRejection#ILLEGAL_TRANSITION}.</li>
 *   <li>aynı {@code transitionId} + byte-özdeş içerik → idempotent-OK (mevcut satır döner, ÇİFT yazım YOK);
 *       aynı {@code transitionId} + FARKLI içerik → {@link AppendRejection#TRANSITION_ID_CONFLICT}.</li>
 * </ul>
 * {@code occurredAt} (injected Clock), {@code previousHash}, {@code entryHash} (helper single-source),
 * {@code sequence} adapter tarafından üretilir — caller değil.
 */
public final class InMemoryModelGovernanceLedger
        implements ModelGovernanceLedger.Reader, ModelGovernanceLedger.Appender {

    /** Öznenin CAS/cari-durum anahtarı (ref + capability; record → doğru equals/hashCode). */
    private record SubjectKey(ModelApprovalRef approvalRef, Capability capability) {}

    private final Clock clock;
    private final List<ModelGovernanceTransition> log = new ArrayList<>();
    private final Map<String, ModelGovernanceTransition> byTransitionId = new HashMap<>();
    private final Map<SubjectKey, ApprovalStatus> currentStatus = new LinkedHashMap<>();

    private String lastEntryHash = ModelGovernanceTransitionHashChain.GENESIS_PREVIOUS_HASH;
    private long nextSequence = 0L;

    /** occurredAt injected Clock'tan gelir (Date.now/random değil; fail-closed non-null). */
    public InMemoryModelGovernanceLedger(Clock clock) {
        if (clock == null) {
            throw new IllegalArgumentException("clock zorunlu (fail-closed; injected Clock)");
        }
        this.clock = clock;
    }

    @Override
    public Outcome<List<ModelGovernanceTransition>> readAll() {
        // Ok(immutable-copy): in-memory okuma her zaman erişilebilir; boş log → Ok(emptyList) (legit
        // UNINITIALIZED, "okunamadı" DEĞİL). Fail yolu 1e-b PG down senaryosunda anlam kazanır.
        return Outcome.ok(List.copyOf(log));
    }

    @Override
    public Outcome<ModelGovernanceTransition> append(ModelGovernanceLedger.AppendCommand command) {
        if (command == null) {
            return reject(ModelGovernanceLedger.AppendRejection.INVALID_COMMAND);
        }

        // Idempotent-replay: aynı transitionId → içerik byte-özdeşse mevcut satır (OK), farklıysa conflict.
        ModelGovernanceTransition existing = byTransitionId.get(command.transitionId().value());
        if (existing != null) {
            return contentMatches(existing, command)
                    ? Outcome.ok(existing)
                    : reject(ModelGovernanceLedger.AppendRejection.TRANSITION_ID_CONFLICT);
        }

        // CAS: expectedFrom öznenin gerçek-son durumu olmalı (stale → conflict).
        SubjectKey key = new SubjectKey(command.approvalRef(), command.capability());
        ApprovalStatus actualFrom = currentStatus.getOrDefault(key, ApprovalStatus.UNINITIALIZED);
        if (command.expectedFrom() != actualFrom) {
            return reject(ModelGovernanceLedger.AppendRejection.STALE_EXPECTED_FROM);
        }

        // Matris + gerekçe-tutarlılığı (expectedFrom == actualFrom bu noktada).
        if (!ModelGovernanceTransitions.isValidTransition(
                command.expectedFrom(), command.toStatus(), command.reasonCode())) {
            return reject(ModelGovernanceLedger.AppendRejection.ILLEGAL_TRANSITION);
        }

        // Üretim: sequence (GLOBAL monoton) + previousHash (zincir bağı) + occurredAt (Clock) + entryHash (helper).
        long sequence = nextSequence;
        String previousHash = lastEntryHash;
        String occurredAt = clock.instant().toString();
        String entryHash = ModelGovernanceTransitionHashChain.entryHash(
                previousHash, command.transitionId(), command.approvalRef(), command.capability(),
                command.expectedFrom(), command.toStatus(), command.actorRef(), occurredAt,
                command.reasonCode(), sequence);

        ModelGovernanceTransition transition = new ModelGovernanceTransition(
                command.transitionId(), command.approvalRef(), command.capability(),
                command.expectedFrom(), command.toStatus(), command.actorRef(), occurredAt,
                command.reasonCode(), previousHash, entryHash, sequence);

        // Commit (tek-thread; kısmi-yazım YOK).
        log.add(transition);
        byTransitionId.put(command.transitionId().value(), transition);
        currentStatus.put(key, command.toStatus());
        lastEntryHash = entryHash;
        nextSequence++;
        return Outcome.ok(transition);
    }

    /**
     * Idempotent-replay içerik eşitliği: transitionId zaten eşleşti; anlamsal alanlar (approvalRef, capability,
     * fromStatus/expectedFrom, toStatus, actorRef, reasonCode) byte-özdeş mi. Adapter-üretimli occurredAt/hash/
     * sequence KARŞILAŞTIRILMAZ (replay orijinal satırı döner).
     */
    private static boolean contentMatches(
            ModelGovernanceTransition existing, ModelGovernanceLedger.AppendCommand command) {
        return existing.approvalRef().equals(command.approvalRef())
                && existing.capability() == command.capability()
                && existing.fromStatus() == command.expectedFrom()
                && existing.toStatus() == command.toStatus()
                && existing.actorRef().equals(command.actorRef())
                && existing.reasonCode() == command.reasonCode();
    }

    private static Outcome<ModelGovernanceTransition> reject(ModelGovernanceLedger.AppendRejection rejection) {
        return Outcome.fail(rejection.outcomeCode(), rejection.name());
    }
}
