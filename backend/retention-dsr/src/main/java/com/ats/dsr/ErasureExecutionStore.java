package com.ats.dsr;

import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import java.time.Instant;
import java.util.List;
import java.util.Objects;

/**
 * Cross-plane erasure/retention saga ledger'ı. Content değildir; yalnız opak hedef ref'leri,
 * adım durumu ve sayısal etki makbuzunu taşır. Kayıtlar UPDATE ile ilerler ama DELETE edilmez.
 */
public interface ErasureExecutionStore {

    enum ExecutionKind {
        DATA_SUBJECT_ERASURE,
        RETENTION_EXPIRED
    }

    enum ExecutionState {
        RUNNING,
        FULFILLED
    }

    enum StepType {
        INTERVIEW_SEAL,
        WORM_TOMBSTONE,
        OBJECT_DELETE,
        SCREENING_PURGE,
        TRANSCRIPT_DELETE,
        CITATION_DELETE,
        EXPORT_ARTIFACT_DELETE,
        REVIEW_WITHDRAW
    }

    enum StepState {
        PENDING,
        COMPLETED
    }

    record PlannedStep(int sequence, StepType type, String targetRef) {
        public PlannedStep {
            if (sequence < 0 || type == null || invalidRef(targetRef)) {
                throw new IllegalArgumentException("planned step alanları geçersiz");
            }
        }
    }

    record StepEffect(int tombstoneCount, int deletedContentCount, boolean caseTransitioned) {
        public StepEffect {
            if (tombstoneCount < 0 || deletedContentCount < 0
                    || tombstoneCount > 1 || deletedContentCount > 1) {
                throw new IllegalArgumentException("step effect sayıları 0..1 olmalı");
            }
        }

        public static StepEffect none() {
            return new StepEffect(0, 0, false);
        }
    }

    record ExecutionStep(
            int sequence,
            StepType type,
            String targetRef,
            StepState state,
            StepEffect effect) {
        public ExecutionStep {
            if (sequence < 0 || type == null || invalidRef(targetRef) || state == null || effect == null) {
                throw new IllegalArgumentException("execution step alanları geçersiz");
            }
            if (state == StepState.PENDING && !effect.equals(StepEffect.none())) {
                throw new IllegalArgumentException("PENDING adım etki taşıyamaz");
            }
        }
    }

    record BeginCommand(
            TenantId tenantId,
            InterviewId interviewId,
            String executionKey,
            ExecutionKind kind,
            String scopeDigest,
            String actorRef,
            List<PlannedStep> steps) {
        public BeginCommand {
            Objects.requireNonNull(tenantId, "tenantId");
            Objects.requireNonNull(interviewId, "interviewId");
            Objects.requireNonNull(kind, "kind");
            if (invalidRef(executionKey) || invalidRef(actorRef)
                    || scopeDigest == null || !scopeDigest.matches("[0-9a-f]{64}")) {
                throw new IllegalArgumentException("begin command alanları geçersiz");
            }
            steps = List.copyOf(steps);
            if (steps.isEmpty()) {
                throw new IllegalArgumentException("execution en az bir adım taşımalı");
            }
            for (int i = 0; i < steps.size(); i++) {
                if (steps.get(i).sequence() != i) {
                    throw new IllegalArgumentException("step sequence kesintisiz 0..n olmalı");
                }
            }
        }
    }

    record Execution(
            TenantId tenantId,
            InterviewId interviewId,
            String executionKey,
            ExecutionKind kind,
            String scopeDigest,
            String actorRef,
            ExecutionState state,
            String leaseOwner,
            String leaseUntil,
            List<ExecutionStep> steps) {
        public Execution {
            Objects.requireNonNull(tenantId, "tenantId");
            Objects.requireNonNull(interviewId, "interviewId");
            Objects.requireNonNull(kind, "kind");
            Objects.requireNonNull(state, "state");
            if (invalidRef(executionKey) || invalidRef(actorRef)
                    || scopeDigest == null || !scopeDigest.matches("[0-9a-f]{64}")) {
                throw new IllegalArgumentException("execution alanları geçersiz");
            }
            if ((leaseOwner == null) != (leaseUntil == null)) {
                throw new IllegalArgumentException("lease owner/until birlikte olmalı");
            }
            steps = List.copyOf(steps);
        }

        public int tombstoneCount() {
            return steps.stream().mapToInt(s -> s.effect().tombstoneCount()).sum();
        }

        public int deletedContentCount() {
            // OBJECT_DELETE bu source slice'ta yalnız "issued" kanıtıdır. Eski/aday bir
            // execution satırı yanlışlıkla deleted_content_count=1 taşısa bile kalıcı veya
            // crypto-erasure gibi yeniden raporlanmaz; G0 adapter kararı gelene kadar ayrı tutulur.
            return steps.stream()
                    .filter(s -> s.type() != StepType.OBJECT_DELETE)
                    .mapToInt(s -> s.effect().deletedContentCount())
                    .sum();
        }

        /**
         * Başarıyla çağrılıp durable saga'da COMPLETED olmuş object-delete adımı sayısıdır.
         * Kalıcı/crypto-erasure kanıtı DEĞİLDİR; G0 object-store slice'ı gelene kadar
         * deletedContentCount'tan bilinçli olarak ayrıdır.
         */
        public int objectDeleteIssuedCount() {
            return (int) steps.stream()
                    .filter(s -> s.type() == StepType.OBJECT_DELETE)
                    .filter(s -> s.state() == StepState.COMPLETED)
                    .count();
        }

        public boolean caseTransitioned() {
            return steps.stream().anyMatch(s -> s.effect().caseTransitioned());
        }

        public boolean allStepsCompleted() {
            return steps.stream().allMatch(s -> s.state() == StepState.COMPLETED);
        }
    }

    Outcome<Execution> find(TenantId tenantId, InterviewId interviewId, String executionKey);

    /** First-writer-wins: aynı key aynı planı replay eder; farklı scope/kind/interview conflict. */
    Outcome<Execution> begin(BeginCommand command);

    /** Tek aktif worker lease'i; başka canlı lease varsa CONFLICT. */
    Outcome<Execution> acquire(
            TenantId tenantId, InterviewId interviewId, String executionKey,
            String leaseOwner, Instant now, Instant leaseUntil);

    /** Stale worker adım commit edemez; başarılı commit lease'i uzatır. */
    Outcome<Execution> completeStep(
            TenantId tenantId, InterviewId interviewId, String executionKey,
            String leaseOwner, int sequence, StepEffect effect, Instant now, Instant leaseUntil);

    /** Bütün adımlar COMPLETED olmadan execution FULFILLED olamaz. */
    Outcome<Execution> fulfill(
            TenantId tenantId, InterviewId interviewId, String executionKey,
            String leaseOwner, Instant now);

    Outcome<Void> release(
            TenantId tenantId, InterviewId interviewId, String executionKey, String leaseOwner);

    /** Scheduler her yeni taramadan önce yarım kalmış retention execution'larını resume eder. */
    Outcome<List<Execution>> listRunning(TenantId tenantId, ExecutionKind kind);

    private static boolean invalidRef(String value) {
        return value == null || value.isBlank() || value.length() > 512
                || value.chars().anyMatch(c -> c < 0x20 || c == 0x7f);
    }
}
