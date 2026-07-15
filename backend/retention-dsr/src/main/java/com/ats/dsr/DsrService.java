package com.ats.dsr;

import com.ats.contracts.EvidenceLedger;
import com.ats.contracts.EvidenceLedger.LedgerEntry;
import com.ats.dsr.ErasureExecutionStore.BeginCommand;
import com.ats.dsr.ErasureExecutionStore.Execution;
import com.ats.dsr.ErasureExecutionStore.ExecutionKind;
import com.ats.dsr.ErasureExecutionStore.ExecutionState;
import com.ats.dsr.ErasureExecutionStore.ExecutionStep;
import com.ats.dsr.ErasureExecutionStore.PlannedStep;
import com.ats.dsr.ErasureExecutionStore.StepEffect;
import com.ats.dsr.ErasureExecutionStore.StepState;
import com.ats.dsr.ErasureExecutionStore.StepType;
import com.ats.export.ExportArtifactStore;
import com.ats.ingest.ObjectStorePort;
import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.EvidenceId;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import com.ats.ops.OperationalEvent;
import com.ats.ops.OperationalEventSink;
import com.ats.ops.PiiClass;
import com.ats.orchestration.CitationStore;
import com.ats.orchestration.TranscriptStore;
import com.ats.review.HumanReviewService;
import com.ats.review.ReviewCase;
import com.ats.review.ReviewCaseStore;
import com.ats.screening.FindingSetRef;
import com.ats.screening.ScreeningEvidenceStore;
import com.ats.screening.ScreeningEvidenceStore.PurgeCommand;
import com.ats.screening.ScreeningEvidenceStore.PurgeReason;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * ATS #169 cross-plane erasure/retention orchestration.
 *
 * <p>DSAR kapsamı caller'dan alınmaz: PostgreSQL truth'undan resolve edilir ve aynı transaction'da
 * interview terminal olarak seal edilir. Her yan etki kalıcı saga adımıdır. Crash, stale worker veya
 * aynı anda ikinci worker halinde tamamlanmış adımlar replay edilmez; side-effect ile step-commit
 * arasındaki crash ise hedef adapter'ların idempotent davranışıyla aynı mantıksal receipt'e döner.
 * WORM silinmez; DSR'da kaynak evidence için append-only tombstone yazılır.
 */
public final class DsrService {

    static final String DSAR_RECEIVED_EVENT = "privacy.dsar.received";
    static final String DSAR_FULFILLED_EVENT = "privacy.dsar.fulfilled";
    static final String ERASURE_EXECUTED_EVENT = "privacy.erasure.executed";
    static final String TOMBSTONE_APPENDED_EVENT = "evidence.tombstone.appended";
    static final String RETENTION_PURGED_EVENT = "privacy.retention.purged";

    private static final Duration WORKER_LEASE = Duration.ofSeconds(30);

    public record ErasureReceipt(
            String dsarKey,
            int tombstoneCount,
            int deletedContentCount,
            int objectDeleteIssuedCount,
            boolean caseTransitioned) {}

    public record PurgeReceipt(
            int interviewCount, int deletedContentCount, int objectDeleteIssuedCount) {}

    private record RunReceipt(Execution execution, boolean newlyFulfilled) {}

    @FunctionalInterface
    private interface CompletionGate {
        Outcome<Void> complete();
    }

    private final DsarStore dsarStore;
    private final ErasureScopeResolver scopeResolver;
    private final ErasureExecutionStore executionStore;
    private final ObjectStorePort objectStore;
    private final TranscriptStore transcriptStore;
    private final CitationStore citationStore;
    private final ExportArtifactStore artifactStore;
    private final ReviewCaseStore reviewStore;
    private final HumanReviewService humanReview;
    private final ScreeningEvidenceStore screeningStore;
    private final EvidenceLedger ledger;
    private final OperationalEventSink sink;
    private final Clock clock;

    public DsrService(
            DsarStore dsarStore,
            ErasureScopeResolver scopeResolver,
            ErasureExecutionStore executionStore,
            ObjectStorePort objectStore,
            TranscriptStore transcriptStore,
            CitationStore citationStore,
            ExportArtifactStore artifactStore,
            ReviewCaseStore reviewStore,
            HumanReviewService humanReview,
            ScreeningEvidenceStore screeningStore,
            EvidenceLedger ledger,
            OperationalEventSink sink,
            Clock clock) {
        this.dsarStore = dsarStore;
        this.scopeResolver = scopeResolver;
        this.executionStore = executionStore;
        this.objectStore = objectStore;
        this.transcriptStore = transcriptStore;
        this.citationStore = citationStore;
        this.artifactStore = artifactStore;
        this.reviewStore = reviewStore;
        this.humanReview = humanReview;
        this.screeningStore = screeningStore;
        this.ledger = ledger;
        this.sink = sink;
        this.clock = clock;
    }

    /** DSAR kabul kaydı; subjectRef opak pointer'dır, aday içeriği değildir. */
    public Outcome<String> receiveDsar(
            TenantId tenantId, InterviewId interviewId, String subjectRef, String reasonCode) {
        if (isBlank(subjectRef) || isBlank(reasonCode)) {
            return Outcome.fail(OutcomeCode.INVALID,
                    "subject_ref + reason_code zorunlu (opak pointer)");
        }
        Outcome<String> stored = dsarStore.put(new DsarRequest(
                tenantId, interviewId, subjectRef, reasonCode, DsarRequest.State.RECEIVED));
        if (stored instanceof Outcome.Ok<String>) {
            emit(tenantId, DSAR_RECEIVED_EVENT, "privacy", "notice", PiiClass.ID_ONLY,
                    Map.of("reason_code", reasonCode));
        }
        return stored;
    }

    /**
     * Caller yalnız DSAR anahtarı verir. Silinecek object/content/review/WORM hedefleri server
     * truth'undan resolve edilir; caller-authored scope kabul eden overload bilinçli olarak yoktur.
     */
    public Outcome<ErasureReceipt> executeErasure(
            TenantId tenantId, ActorId actorId, InterviewId interviewId, String dsarKey) {
        if (tenantId == null || actorId == null || interviewId == null
                || isBlank(actorId.value()) || isBlank(dsarKey)) {
            return Outcome.fail(OutcomeCode.INVALID, "tenant/actor/interview/dsarKey zorunlu");
        }
        Outcome<DsarRequest> found = dsarStore.find(tenantId, interviewId, dsarKey);
        if (!(found instanceof Outcome.Ok<DsarRequest> dsarOk)) {
            return copyFailure(found);
        }
        DsarRequest dsar = dsarOk.value();

        Outcome<Execution> existing = executionStore.find(tenantId, interviewId, dsarKey);
        Execution execution;
        if (existing instanceof Outcome.Ok<Execution> ok) {
            execution = ok.value();
            if (execution.kind() != ExecutionKind.DATA_SUBJECT_ERASURE) {
                return Outcome.fail(OutcomeCode.CONFLICT,
                        "dsarKey farklı execution kind ile bağlı");
            }
        } else if (((Outcome.Fail<Execution>) existing).code() == OutcomeCode.NOT_FOUND) {
            if (dsar.state() == DsarRequest.State.FULFILLED) {
                return Outcome.fail(OutcomeCode.NOT_CONFIGURED,
                        "FULFILLED DSAR için durable execution receipt yok (fail-closed)");
            }
            Outcome<ErasureScope> resolved = scopeResolver.resolveAndSealDsr(
                    tenantId, interviewId, dsarKey);
            if (!(resolved instanceof Outcome.Ok<ErasureScope> scopeOk)) {
                return copyFailure(resolved);
            }
            ErasureScope scope = scopeOk.value();
            Outcome<Execution> begun = executionStore.begin(new BeginCommand(
                    tenantId, interviewId, dsarKey, ExecutionKind.DATA_SUBJECT_ERASURE,
                    scope.digest(), actorId.value(), dsrPlan(scope)));
            if (!(begun instanceof Outcome.Ok<Execution> begunOk)) {
                return copyFailure(begun);
            }
            execution = begunOk.value();
        } else {
            return copyFailure(existing);
        }

        Outcome<RunReceipt> run = runExecution(execution, dsar.reasonCode(),
                () -> dsar.state() == DsarRequest.State.FULFILLED
                        ? Outcome.ok(null)
                        : dsarStore.save(tenantId, dsarKey, dsar.fulfilled()));
        if (!(run instanceof Outcome.Ok<RunReceipt> runOk)) {
            return copyFailure(run);
        }
        Execution receipt = runOk.value().execution();
        if (runOk.value().newlyFulfilled()) {
            emit(tenantId, ERASURE_EXECUTED_EVENT, "privacy", "notice", PiiClass.ID_ONLY,
                    Map.of("actor_ref", receipt.actorRef(), "reason_code", dsar.reasonCode()));
            emit(tenantId, DSAR_FULFILLED_EVENT, "privacy", "notice", PiiClass.ID_ONLY,
                    Map.of("actor_ref", receipt.actorRef()));
        }
        return Outcome.ok(new ErasureReceipt(dsarKey, receipt.tombstoneCount(),
                receipt.deletedContentCount(), receipt.objectDeleteIssuedCount(),
                receipt.caseTransitioned()));
    }

    /**
     * Retention scheduler önce bütün yarım RUNNING execution'ları resume eder, sonra yeni cutoff
     * scope'larını first-writer plan olarak kaydeder. Aynı scope sonraki timer turunda tekrar görünse
     * bile FULFILLED receipt replay edilir ve silme sayısı yeniden raporlanmaz.
     */
    public Outcome<PurgeReceipt> purgeExpired(
            TenantId tenantId, ActorId actorId, RetentionScanner scanner, String cutoffIso) {
        if (tenantId == null || scanner == null || isBlank(cutoffIso)
                || actorId == null || isBlank(actorId.value())) {
            return Outcome.fail(OutcomeCode.INVALID,
                    "tenant + scanner + cutoffIso + actor zorunlu");
        }

        int deleted = 0;
        int objectDeletesIssued = 0;
        Set<String> newlyCompleted = new HashSet<>();
        Outcome<List<Execution>> running = executionStore.listRunning(
                tenantId, ExecutionKind.RETENTION_EXPIRED);
        if (!(running instanceof Outcome.Ok<List<Execution>> runningOk)) {
            return copyFailure(running);
        }
        for (Execution execution : runningOk.value()) {
            Outcome<RunReceipt> resumed = runExecution(
                    execution, PurgeReason.RETENTION_EXPIRED.name(), () -> Outcome.ok(null));
            if (!(resumed instanceof Outcome.Ok<RunReceipt> resumedOk)) {
                return copyFailure(resumed);
            }
            if (resumedOk.value().newlyFulfilled()
                    && newlyCompleted.add(execution.executionKey())) {
                deleted += resumedOk.value().execution().deletedContentCount();
                objectDeletesIssued += resumedOk.value().execution().objectDeleteIssuedCount();
                emitRetention(resumedOk.value().execution());
            }
        }

        Outcome<List<RetentionScanner.ExpiredContent>> scanned =
                scanner.scanExpired(tenantId, cutoffIso);
        if (!(scanned instanceof Outcome.Ok<List<RetentionScanner.ExpiredContent>> scannedOk)) {
            return copyFailure(scanned);
        }
        for (RetentionScanner.ExpiredContent expired : scannedOk.value()) {
            if (expired.empty()) {
                continue;
            }
            ErasureScope scope;
            try {
                scope = new ErasureScope(
                        expired.objectKeys(), expired.transcriptKeys(), expired.citationKeys(),
                        expired.exportArtifactKeys(), List.of(),
                        expired.screeningFindingSetRefs(), List.of());
            } catch (IllegalArgumentException ex) {
                return Outcome.fail(OutcomeCode.NOT_CONFIGURED,
                        "retention scanner server scope'u geçersiz (fail-closed)");
            }
            String executionKey = retentionExecutionKey(expired.interviewId(), scope);
            Outcome<Execution> foundExecution = executionStore.find(
                    tenantId, expired.interviewId(), executionKey);
            Execution execution;
            if (foundExecution instanceof Outcome.Ok<Execution> existingOk) {
                execution = existingOk.value();
            } else if (((Outcome.Fail<Execution>) foundExecution).code() == OutcomeCode.NOT_FOUND) {
                Outcome<Execution> begun = executionStore.begin(new BeginCommand(
                        tenantId, expired.interviewId(), executionKey,
                        ExecutionKind.RETENTION_EXPIRED, scope.digest(), actorId.value(),
                        retentionPlan(scope)));
                if (!(begun instanceof Outcome.Ok<Execution> begunOk)) {
                    return copyFailure(begun);
                }
                execution = begunOk.value();
            } else {
                return copyFailure(foundExecution);
            }
            Outcome<RunReceipt> run = runExecution(
                    execution, PurgeReason.RETENTION_EXPIRED.name(), () -> Outcome.ok(null));
            if (!(run instanceof Outcome.Ok<RunReceipt> runOk)) {
                return copyFailure(run);
            }
            if (runOk.value().newlyFulfilled()
                    && newlyCompleted.add(execution.executionKey())) {
                deleted += runOk.value().execution().deletedContentCount();
                objectDeletesIssued += runOk.value().execution().objectDeleteIssuedCount();
                emitRetention(runOk.value().execution());
            }
        }
        return Outcome.ok(new PurgeReceipt(
                newlyCompleted.size(), deleted, objectDeletesIssued));
    }

    private Outcome<RunReceipt> runExecution(
            Execution initial, String reasonCode, CompletionGate completionGate) {
        if (initial.state() == ExecutionState.FULFILLED) {
            Outcome<Void> completion = completionGate.complete();
            if (!completion.isOk()) {
                return copyFailure(completion);
            }
            return Outcome.ok(new RunReceipt(initial, false));
        }

        String worker = "erasure-worker-" + UUID.randomUUID();
        Instant now = Instant.now(clock);
        Outcome<Execution> acquired = executionStore.acquire(
                initial.tenantId(), initial.interviewId(), initial.executionKey(),
                worker, now, now.plus(WORKER_LEASE));
        if (!(acquired instanceof Outcome.Ok<Execution> acquiredOk)) {
            return copyFailure(acquired);
        }
        Execution current = acquiredOk.value();
        if (current.state() == ExecutionState.FULFILLED) {
            Outcome<Void> completion = completionGate.complete();
            if (!completion.isOk()) {
                return copyFailure(completion);
            }
            return Outcome.ok(new RunReceipt(current, false));
        }

        for (ExecutionStep step : current.steps()) {
            if (step.state() == StepState.COMPLETED) {
                continue;
            }
            Outcome<StepEffect> performed = performStep(current, step, reasonCode);
            if (!(performed instanceof Outcome.Ok<StepEffect> performedOk)) {
                executionStore.release(current.tenantId(), current.interviewId(),
                        current.executionKey(), worker);
                return copyFailure(performed);
            }
            Instant completedAt = Instant.now(clock);
            Outcome<Execution> completed = executionStore.completeStep(
                    current.tenantId(), current.interviewId(), current.executionKey(),
                    worker, step.sequence(), performedOk.value(), completedAt,
                    completedAt.plus(WORKER_LEASE));
            if (!(completed instanceof Outcome.Ok<Execution> completedOk)) {
                executionStore.release(current.tenantId(), current.interviewId(),
                        current.executionKey(), worker);
                return copyFailure(completed);
            }
            current = completedOk.value();
            if (step.type() == StepType.WORM_TOMBSTONE
                    || step.type() == StepType.SCREENING_PURGE) {
                emit(current.tenantId(), TOMBSTONE_APPENDED_EVENT, "evidence", "notice",
                        PiiClass.ID_ONLY,
                        Map.of("actor_ref", current.actorRef(), "reason_code", reasonCode));
            }
        }

        Outcome<Void> completion = completionGate.complete();
        if (!completion.isOk()) {
            executionStore.release(current.tenantId(), current.interviewId(),
                    current.executionKey(), worker);
            return copyFailure(completion);
        }
        Outcome<Execution> fulfilled = executionStore.fulfill(
                current.tenantId(), current.interviewId(), current.executionKey(),
                worker, Instant.now(clock));
        if (!(fulfilled instanceof Outcome.Ok<Execution> fulfilledOk)) {
            executionStore.release(current.tenantId(), current.interviewId(),
                    current.executionKey(), worker);
            return copyFailure(fulfilled);
        }
        return Outcome.ok(new RunReceipt(fulfilledOk.value(), true));
    }

    private Outcome<StepEffect> performStep(
            Execution execution, ExecutionStep step, String reasonCode) {
        TenantId tenant = execution.tenantId();
        InterviewId interview = execution.interviewId();
        ActorId actor = new ActorId(execution.actorRef());
        return switch (step.type()) {
            case INTERVIEW_SEAL -> Outcome.ok(StepEffect.none());
            case WORM_TOMBSTONE -> {
                if (execution.kind() != ExecutionKind.DATA_SUBJECT_ERASURE) {
                    yield Outcome.fail(OutcomeCode.CONFLICT,
                            "retention execution WORM_TOMBSTONE adımı taşıyamaz");
                }
                Outcome<LedgerEntry> appended = ledger.appendTombstoneEvent(
                        tenant, actor, interview, new EvidenceId(step.targetRef()), reasonCode);
                if (!(appended instanceof Outcome.Ok<LedgerEntry>)) {
                    yield copyFailure(appended);
                }
                yield Outcome.ok(new StepEffect(1, 0, false));
            }
            case OBJECT_DELETE -> objectDeleteIssued(
                    objectStore.delete(tenant, step.targetRef()));
            case SCREENING_PURGE -> {
                FindingSetRef ref;
                try {
                    ref = new FindingSetRef(step.targetRef());
                } catch (IllegalArgumentException ex) {
                    yield Outcome.fail(OutcomeCode.NOT_CONFIGURED,
                            "durable screening target ref bozuk (fail-closed)");
                }
                PurgeReason purgeReason = execution.kind() == ExecutionKind.DATA_SUBJECT_ERASURE
                        ? PurgeReason.DATA_SUBJECT_ERASURE
                        : PurgeReason.RETENTION_EXPIRED;
                Outcome<ScreeningEvidenceStore.PurgeReceipt> purged = screeningStore.purge(
                        new PurgeCommand(tenant, actor, interview, ref, purgeReason,
                                Instant.now(clock).toString()));
                if (!(purged instanceof Outcome.Ok<ScreeningEvidenceStore.PurgeReceipt>)) {
                    yield copyFailure(purged);
                }
                // Physical retry replay olsa da bu durable planın mantıksal etkisi sabittir.
                yield Outcome.ok(new StepEffect(1, 1, false));
            }
            case TRANSCRIPT_DELETE -> deleted(
                    transcriptStore.delete(tenant, step.targetRef()), "transcript");
            case CITATION_DELETE -> deleted(
                    citationStore.delete(tenant, step.targetRef()), "citation");
            case EXPORT_ARTIFACT_DELETE -> deleted(
                    artifactStore.delete(tenant, step.targetRef()), "export-artifact");
            case REVIEW_WITHDRAW -> withdrawReview(
                    tenant, interview, step.targetRef(), reasonCode);
        };
    }

    private Outcome<StepEffect> withdrawReview(
            TenantId tenant, InterviewId interview, String caseKey, String reasonCode) {
        Outcome<ReviewCase> found = reviewStore.find(tenant, interview, caseKey);
        if (!(found instanceof Outcome.Ok<ReviewCase> foundOk)) {
            return copyFailure(found);
        }
        if (foundOk.value().state().name().equals("WITHDRAWN")) {
            return Outcome.ok(new StepEffect(0, 0, true));
        }
        if (foundOk.value().state().terminal()) {
            return Outcome.fail(OutcomeCode.CONFLICT,
                    "scope sonrası review terminal state yarışı tespit edildi (fail-closed)");
        }
        Outcome<Void> withdrawn = humanReview.withdraw(tenant, interview, caseKey, reasonCode);
        if (!withdrawn.isOk()) {
            return copyFailure(withdrawn);
        }
        return Outcome.ok(new StepEffect(0, 0, true));
    }

    private static Outcome<StepEffect> deleted(Outcome<Void> outcome, String plane) {
        if (!outcome.isOk()) {
            Outcome.Fail<Void> fail = (Outcome.Fail<Void>) outcome;
            return Outcome.fail(fail.code(), plane + " delete başarısız (saga RUNNING kaldı)");
        }
        return Outcome.ok(new StepEffect(0, 1, false));
    }

    /**
     * Mevcut object-store adapter'ı yalnız in-memory-dev'tir. Başarılı çağrı saga'da
     * "delete issued" olarak tamamlanır; kalıcı/crypto-erasure kanıtı olmadığı için
     * deletedContentCount artırılmaz. G0 adapter/erasure kararı gelmeden bu sınır genişletilmez.
     */
    private static Outcome<StepEffect> objectDeleteIssued(Outcome<Void> outcome) {
        if (!outcome.isOk()) {
            Outcome.Fail<Void> fail = (Outcome.Fail<Void>) outcome;
            return Outcome.fail(fail.code(),
                    "object-store delete başarısız (saga RUNNING kaldı)");
        }
        return Outcome.ok(StepEffect.none());
    }

    private static List<PlannedStep> dsrPlan(ErasureScope scope) {
        ArrayList<PlannedStep> steps = new ArrayList<>();
        add(steps, StepType.INTERVIEW_SEAL, "sealed");
        addAll(steps, StepType.WORM_TOMBSTONE, scope.tombstoneTargetEvidenceIds());
        addAll(steps, StepType.OBJECT_DELETE, scope.objectKeys());
        addAll(steps, StepType.SCREENING_PURGE, scope.screeningFindingSetRefs());
        addAll(steps, StepType.TRANSCRIPT_DELETE, scope.transcriptKeys());
        addAll(steps, StepType.CITATION_DELETE, scope.citationKeys());
        addAll(steps, StepType.EXPORT_ARTIFACT_DELETE, scope.exportArtifactKeys());
        addAll(steps, StepType.REVIEW_WITHDRAW, scope.reviewCaseKeys());
        return List.copyOf(steps);
    }

    private static List<PlannedStep> retentionPlan(ErasureScope scope) {
        ArrayList<PlannedStep> steps = new ArrayList<>();
        addAll(steps, StepType.OBJECT_DELETE, scope.objectKeys());
        addAll(steps, StepType.SCREENING_PURGE, scope.screeningFindingSetRefs());
        addAll(steps, StepType.TRANSCRIPT_DELETE, scope.transcriptKeys());
        addAll(steps, StepType.CITATION_DELETE, scope.citationKeys());
        addAll(steps, StepType.EXPORT_ARTIFACT_DELETE, scope.exportArtifactKeys());
        return List.copyOf(steps);
    }

    /**
     * erasure_execution PK'si tenant+execution_key'dir; scope ref'leri başka interview'da aynı
     * olsa bile plan identity çakışmasın diye interview kimliği de uzunluk-prefix'li hash'e bağlıdır.
     */
    static String retentionExecutionKey(InterviewId interviewId, ErasureScope scope) {
        String material = "retention-execution/v1\n"
                + interviewId.value().length() + ":" + interviewId.value() + "\n"
                + scope.digest();
        try {
            return "retention-" + HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(material.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 runtime'da yok", ex);
        }
    }

    private static void addAll(
            List<PlannedStep> steps, StepType type, List<String> targets) {
        for (String target : targets) {
            add(steps, type, target);
        }
    }

    private static void add(List<PlannedStep> steps, StepType type, String target) {
        steps.add(new PlannedStep(steps.size(), type, target));
    }

    private void emitRetention(Execution execution) {
        emit(execution.tenantId(), RETENTION_PURGED_EVENT, "privacy", "notice",
                PiiClass.ID_ONLY,
                Map.of("reason_code", "retention_expired", "actor_ref", execution.actorRef()));
    }

    private void emit(
            TenantId tenantId, String eventTypeId, String category, String severity,
            PiiClass pii, Map<String, String> extras) {
        OperationalEvent.create(tenantId, eventTypeId, category, severity, pii, extras)
                .asOptional()
                .ifPresent(sink::emit);
    }

    private static <T, R> Outcome<T> copyFailure(Outcome<R> outcome) {
        Outcome.Fail<R> fail = (Outcome.Fail<R>) outcome;
        return Outcome.fail(fail.code(), fail.reason());
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
