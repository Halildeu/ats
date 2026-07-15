package com.ats.dsr;

import com.ats.dsr.ErasureExecutionStore.BeginCommand;
import com.ats.dsr.ErasureExecutionStore.Execution;
import com.ats.dsr.ErasureExecutionStore.ExecutionKind;
import com.ats.dsr.ErasureExecutionStore.ExecutionState;
import com.ats.dsr.ErasureExecutionStore.ExecutionStep;
import com.ats.dsr.ErasureExecutionStore.StepEffect;
import com.ats.dsr.ErasureExecutionStore.StepState;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Deterministik unit adapter'ı; PostgreSQL adapter'ıyla aynı lease/CAS semantiğini taşır. */
public final class InMemoryErasureExecutionStore implements ErasureExecutionStore {

    private final Map<String, Execution> executions = new LinkedHashMap<>();

    @Override
    public synchronized Outcome<Execution> find(
            TenantId tenantId, InterviewId interviewId, String executionKey) {
        Execution execution = executions.get(key(tenantId, executionKey));
        if (execution == null || !execution.interviewId().equals(interviewId)) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "erasure execution yok (tenant/interview-scope)");
        }
        return Outcome.ok(copy(execution));
    }

    @Override
    public synchronized Outcome<Execution> begin(BeginCommand command) {
        String key = key(command.tenantId(), command.executionKey());
        Execution prior = executions.get(key);
        if (prior != null) {
            if (!prior.interviewId().equals(command.interviewId())
                    || prior.kind() != command.kind()
                    || !prior.scopeDigest().equals(command.scopeDigest())
                    || !prior.actorRef().equals(command.actorRef())
                    || !samePlan(prior, command)) {
                return Outcome.fail(OutcomeCode.CONFLICT,
                        "execution key farklı interview/kind/scope ile yeniden kullanılamaz");
            }
            return Outcome.ok(copy(prior));
        }
        List<ExecutionStep> steps = command.steps().stream()
                .map(s -> new ExecutionStep(s.sequence(), s.type(), s.targetRef(),
                        StepState.PENDING, StepEffect.none()))
                .toList();
        Execution created = new Execution(
                command.tenantId(), command.interviewId(), command.executionKey(), command.kind(),
                command.scopeDigest(), command.actorRef(), ExecutionState.RUNNING, null, null, steps);
        executions.put(key, created);
        return Outcome.ok(copy(created));
    }

    @Override
    public synchronized Outcome<Execution> acquire(
            TenantId tenantId, InterviewId interviewId, String executionKey,
            String leaseOwner, Instant now, Instant leaseUntil) {
        Outcome<Execution> found = find(tenantId, interviewId, executionKey);
        if (!(found instanceof Outcome.Ok<Execution> ok)) {
            return found;
        }
        Execution prior = ok.value();
        if (prior.state() == ExecutionState.FULFILLED) {
            return found;
        }
        boolean heldByOther = prior.leaseOwner() != null
                && !prior.leaseOwner().equals(leaseOwner)
                && Instant.parse(prior.leaseUntil()).isAfter(now);
        if (heldByOther) {
            return Outcome.fail(OutcomeCode.CONFLICT, "execution başka canlı worker lease'inde");
        }
        Execution acquired = replace(prior, prior.state(), leaseOwner, leaseUntil.toString(), prior.steps());
        executions.put(key(tenantId, executionKey), acquired);
        return Outcome.ok(copy(acquired));
    }

    @Override
    public synchronized Outcome<Execution> completeStep(
            TenantId tenantId, InterviewId interviewId, String executionKey,
            String leaseOwner, int sequence, StepEffect effect, Instant now, Instant leaseUntil) {
        Outcome<Execution> found = find(tenantId, interviewId, executionKey);
        if (!(found instanceof Outcome.Ok<Execution> ok)) {
            return found;
        }
        Execution prior = ok.value();
        if (!leaseValid(prior, leaseOwner, now)) {
            return Outcome.fail(OutcomeCode.CONFLICT, "stale worker step commit edemez");
        }
        if (sequence < 0 || sequence >= prior.steps().size()) {
            return Outcome.fail(OutcomeCode.INVALID, "step sequence execution planında yok");
        }
        ExecutionStep step = prior.steps().get(sequence);
        if (step.state() == StepState.COMPLETED) {
            if (!step.effect().equals(effect)) {
                return Outcome.fail(OutcomeCode.CONFLICT, "completed step farklı effect ile yazılamaz");
            }
            Execution replayed = replace(
                    prior, prior.state(), leaseOwner, leaseUntil.toString(), prior.steps());
            executions.put(key(tenantId, executionKey), replayed);
            return Outcome.ok(copy(replayed));
        }
        if (prior.steps().stream().anyMatch(s -> s.sequence() < sequence && s.state() != StepState.COMPLETED)) {
            return Outcome.fail(OutcomeCode.CONFLICT, "önceki saga adımı tamamlanmadan step ilerletilemez");
        }
        ArrayList<ExecutionStep> steps = new ArrayList<>(prior.steps());
        steps.set(sequence, new ExecutionStep(
                step.sequence(), step.type(), step.targetRef(), StepState.COMPLETED, effect));
        Execution updated = replace(prior, prior.state(), leaseOwner, leaseUntil.toString(), steps);
        executions.put(key(tenantId, executionKey), updated);
        return Outcome.ok(copy(updated));
    }

    @Override
    public synchronized Outcome<Execution> fulfill(
            TenantId tenantId, InterviewId interviewId, String executionKey,
            String leaseOwner, Instant now) {
        Outcome<Execution> found = find(tenantId, interviewId, executionKey);
        if (!(found instanceof Outcome.Ok<Execution> ok)) {
            return found;
        }
        Execution prior = ok.value();
        if (prior.state() == ExecutionState.FULFILLED) {
            return found;
        }
        if (!leaseValid(prior, leaseOwner, now)) {
            return Outcome.fail(OutcomeCode.CONFLICT, "stale worker execution fulfill edemez");
        }
        if (!prior.allStepsCompleted()) {
            return Outcome.fail(OutcomeCode.CONFLICT, "pending step varken execution fulfill edilemez");
        }
        Execution fulfilled = replace(prior, ExecutionState.FULFILLED, null, null, prior.steps());
        executions.put(key(tenantId, executionKey), fulfilled);
        return Outcome.ok(copy(fulfilled));
    }

    @Override
    public synchronized Outcome<Void> release(
            TenantId tenantId, InterviewId interviewId, String executionKey, String leaseOwner) {
        Outcome<Execution> found = find(tenantId, interviewId, executionKey);
        if (!(found instanceof Outcome.Ok<Execution> ok)) {
            return Outcome.fail(((Outcome.Fail<Execution>) found).code(),
                    ((Outcome.Fail<Execution>) found).reason());
        }
        Execution prior = ok.value();
        if (prior.leaseOwner() == null || !prior.leaseOwner().equals(leaseOwner)) {
            return Outcome.ok(null);
        }
        executions.put(key(tenantId, executionKey),
                replace(prior, prior.state(), null, null, prior.steps()));
        return Outcome.ok(null);
    }

    @Override
    public synchronized Outcome<List<Execution>> listRunning(TenantId tenantId, ExecutionKind kind) {
        return Outcome.ok(executions.values().stream()
                .filter(e -> e.tenantId().equals(tenantId)
                        && e.kind() == kind
                        && e.state() == ExecutionState.RUNNING)
                .map(InMemoryErasureExecutionStore::copy)
                .toList());
    }

    private static boolean leaseValid(Execution execution, String owner, Instant now) {
        return execution.leaseOwner() != null
                && execution.leaseOwner().equals(owner)
                && Instant.parse(execution.leaseUntil()).isAfter(now);
    }

    private static boolean samePlan(Execution execution, BeginCommand command) {
        if (execution.steps().size() != command.steps().size()) {
            return false;
        }
        for (int i = 0; i < execution.steps().size(); i++) {
            ExecutionStep actual = execution.steps().get(i);
            var expected = command.steps().get(i);
            if (actual.sequence() != expected.sequence()
                    || actual.type() != expected.type()
                    || !actual.targetRef().equals(expected.targetRef())) {
                return false;
            }
        }
        return true;
    }

    private static String key(TenantId tenantId, String executionKey) {
        return tenantId.value() + "\u0000" + executionKey;
    }

    private static Execution replace(
            Execution prior, ExecutionState state, String owner, String until,
            List<ExecutionStep> steps) {
        return new Execution(prior.tenantId(), prior.interviewId(), prior.executionKey(), prior.kind(),
                prior.scopeDigest(), prior.actorRef(), state, owner, until, List.copyOf(steps));
    }

    private static Execution copy(Execution execution) {
        return replace(execution, execution.state(), execution.leaseOwner(),
                execution.leaseUntil(), execution.steps());
    }
}
