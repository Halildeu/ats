package com.ats.contracts.governance;

import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.util.List;

/**
 * gov1-1e GLOBAL model-governance transition-WORM'unun PORTU (adapter'lar model-governance modülünde;
 * 1e-b PostgreSQL, bu slice in-memory). READ/WRITE otoritesi AYRI iki yüzeydir (Codex 1e-a):
 *
 * <ul>
 *   <li>{@link Reader} — {@code readAll()}: WORM satırlarını okur (app-boot BUNU görür; onaylı-model
 *       status'ünü {@code ModelGovernanceStatusProjection} ile türetmek için). Yazamaz.</li>
 *   <li>{@link Appender} — {@code append(AppendCommand)}: yeni transition ekler (yalnız admin CLI/writer
 *       görür; app-boot GÖRMEZ). Fail-closed: stale {@code expectedFrom} / illegal geçiş / çakışan replay
 *       reddedilir.</li>
 * </ul>
 *
 * <p>İki ayrı interface'tir; tek concrete adapter ikisini de uygular ama bean-ayrımı yapılabilir
 * (least-privilege: boot yalnız Reader'a bağlanır). Bu tip yalnız namespace + kabul-komutu + red-vokabüleri
 * taşır (metotsuz umbrella).
 */
public interface ModelGovernanceLedger {

    /** READ otoritesi: WORM'u okur (app-boot boot-snapshot + projeksiyon girdisi). Yazamaz. */
    interface Reader {
        /** WORM'un TÜM transition'ları, GLOBAL sequence sırasında (değişmez görünüm; projeksiyon girdisi). */
        List<ModelGovernanceTransition> readAll();
    }

    /** WRITE otoritesi: yeni transition ekler (admin CLI/writer). Fail-closed CAS + idempotent-replay. */
    interface Appender {
        /**
         * Yeni transition'ı append eder. {@code expectedFrom} öznenin gerçek-son durumuyla karşılaştırılır
         * (stale → {@link AppendRejection#STALE_EXPECTED_FROM} conflict); geçiş matris+gerekçe-tutarlı olmalı
         * ({@link AppendRejection#ILLEGAL_TRANSITION}); aynı {@code transitionId} + byte-özdeş içerik →
         * idempotent-OK (mevcut satır döner), farklı içerik → {@link AppendRejection#TRANSITION_ID_CONFLICT}.
         * {@code occurredAt}/hash/sequence adapter üretir. null komut → {@link AppendRejection#INVALID_COMMAND}.
         */
        Outcome<ModelGovernanceTransition> append(AppendCommand command);
    }

    /**
     * Append niyeti (adapter {@code occurredAt}/previousHash/entryHash/sequence ÜRETİR — caller değil).
     * {@code expectedFrom} = optimistic-concurrency (CAS) beklentisi: caller'ın gördüğü son durum; adapter
     * gerçek-son durumla karşılaştırır. Tüm alanlar non-null (fail-closed).
     */
    record AppendCommand(
            ModelApprovalRef approvalRef,
            Capability capability,
            ApprovalStatus expectedFrom,
            ApprovalStatus toStatus,
            GovernanceActorRef actorRef,
            TransitionReason reasonCode,
            TransitionId transitionId) {

        public AppendCommand {
            if (approvalRef == null) {
                throw new IllegalArgumentException("AppendCommand.approvalRef zorunlu (fail-closed)");
            }
            if (capability == null) {
                throw new IllegalArgumentException("AppendCommand.capability zorunlu (fail-closed)");
            }
            if (expectedFrom == null) {
                throw new IllegalArgumentException(
                        "AppendCommand.expectedFrom zorunlu (fail-closed; genesis dahil açık token)");
            }
            if (toStatus == null) {
                throw new IllegalArgumentException("AppendCommand.toStatus zorunlu (fail-closed)");
            }
            if (actorRef == null) {
                throw new IllegalArgumentException("AppendCommand.actorRef zorunlu (fail-closed)");
            }
            if (reasonCode == null) {
                throw new IllegalArgumentException("AppendCommand.reasonCode zorunlu (fail-closed)");
            }
            if (transitionId == null) {
                throw new IllegalArgumentException("AppendCommand.transitionId zorunlu (fail-closed)");
            }
        }
    }

    /**
     * KAPALI append-red vokabüleri (serbest string YOK; her değer bir kernel {@link OutcomeCode} taşır).
     * {@code Outcome.Fail}'e {@code code()==outcomeCode()}, {@code reason()==name()} olarak taşınır.
     */
    enum AppendRejection {
        /** {@code expectedFrom} öznenin gerçek-son durumuyla uyuşmuyor (optimistic-concurrency conflict). */
        STALE_EXPECTED_FROM(OutcomeCode.INVALID),
        /** Aynı {@code transitionId} FARKLI içerikle yeniden gönderildi (idempotency ihlali). */
        TRANSITION_ID_CONFLICT(OutcomeCode.INVALID),
        /** Geçiş izinli-matris/gerekçe-tutarlılığını ihlal ediyor. */
        ILLEGAL_TRANSITION(OutcomeCode.INVALID),
        /** Komut null/yapısal-geçersiz. */
        INVALID_COMMAND(OutcomeCode.INVALID);

        private final OutcomeCode outcomeCode;

        AppendRejection(OutcomeCode outcomeCode) {
            this.outcomeCode = outcomeCode;
        }

        public OutcomeCode outcomeCode() {
            return outcomeCode;
        }
    }
}
