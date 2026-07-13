import { describe, expect, it } from "vitest";
import {
  GOVERNED_AGENTIC_SCHEMA_VERSION,
  GovernedAgenticProposalRegistry,
  computeIndependentExecutionAuthorizationDigest,
  computeReviewerAuthorizationDigest,
  type ApprovalCommandV1,
  type CreateGovernedProposalV1,
  type ExternalExecutionCommandV1,
  type ExternalRollbackCommandV1,
  type GovernedProposalReceiptV1,
  type IndependentExecutionAuthorizationV1,
  type ReviewerAuthorizationV1,
  type TransitionCommandV1,
} from "../agentic/governed-agentic-proposals.js";

const tenantRef = "tenant_aaaaaaaaaaaaaaaa" as const;
const scopeRef = "scope_bbbbbbbbbbbbbbbb" as const;
const reviewerRef = "reviewer_cccccccccccccccc" as const;
const digest = (character: string) => `sha256:${character.repeat(64)}` as `sha256:${string}`;

function proposal(overrides: Partial<CreateGovernedProposalV1> = {}): CreateGovernedProposalV1 {
  return {
    schemaVersion: GOVERNED_AGENTIC_SCHEMA_VERSION,
    synthetic: true,
    tenantRef,
    scopeRef,
    proposalId: "proposal_1111111111111111",
    actionKind: "INTERNAL_REVIEW_TASK",
    payloadRef: "payload_1111111111111111",
    payloadDigest: digest("1"),
    targetResourceRef: "resource_1111111111111111",
    targetResourceVersionRef: "resource-version:synthetic:v1",
    suggestedByAgentRef: "agent_1111111111111111",
    sourceEvidence: [{ evidenceRef: "evidence_1111111111111111", evidenceDigest: digest("2") }],
    aiOutputVersionRef: "ai-output:synthetic:v1",
    policyVersionRef: "policy:agentic:synthetic-v1",
    rollbackPlanRef: "rollback_1111111111111111",
    rollbackPlanDigest: digest("3"),
    createdAt: "2026-07-13T10:00:00.000Z",
    expiresAt: "2026-07-13T12:00:00.000Z",
    supersedesProposalId: null,
    supersedesProposalDigest: null,
    creationEventId: "event_1111111111111111",
    idempotencyKey: "idem_1111111111111111",
    humanOversightStandardRef: "human-oversight:canonical:v1",
    lifecycleMappingRef: "agentic:ai-proposed-human-review:v1",
    containsRawPii: false,
    containsRawContent: false,
    containsProtectedAttributes: false,
    executionAuthority: "NONE",
    executionPerformedByContract: false,
    autoExecute: false,
    batchApproval: false,
    mutationAllowed: false,
    automatedEmploymentDecision: false,
    candidateRanking: "DISALLOWED",
    candidateRejection: "DISALLOWED",
    candidateHiring: "DISALLOWED",
    scoring: "DISALLOWED",
    verdict: "NONE",
    evidenceGate: "NOT_MET",
    legalGate: "NOT_MET",
    ownerGate: "NOT_MET",
    productionEligible: false,
    ...overrides,
  };
}

function authorization(
  receipt: GovernedProposalReceiptV1,
  overrides: Partial<ReviewerAuthorizationV1> = {},
): ReviewerAuthorizationV1 {
  const payload = {
    authorizationRef: "authorization_1111111111111111" as const,
    tenantRef: receipt.tenantRef,
    reviewerRef,
    oversightRoleRef: "role:human-reviewer:synthetic-v1",
    allowedScopeRefs: [receipt.scopeRef],
    allowedActionKinds: [receipt.actionKind],
    tierCeiling: "T2" as const,
    issuedAt: "2026-07-13T09:00:00.000Z",
    expiresAt: "2026-07-13T11:30:00.000Z",
    revoked: false as const,
    issuerRef: "issuer_1111111111111111" as const,
    verificationMode: "REFERENCE_ONLY_PRE_G0" as const,
    ...overrides,
  };
  return { ...payload, authorizationDigest: computeReviewerAuthorizationDigest(payload) };
}

function transition(
  receipt: GovernedProposalReceiptV1,
  overrides: Partial<TransitionCommandV1> = {},
): TransitionCommandV1 {
  return {
    proposalId: receipt.proposalId,
    proposalDigest: receipt.proposalDigest,
    eventId: "event_2222222222222222",
    idempotencyKey: "idem_2222222222222222",
    actorKind: "HUMAN",
    actorRef: reviewerRef,
    reasonRef: "reason:agentic:human-review:v1",
    occurredAt: "2026-07-13T10:01:00.000Z",
    ...overrides,
  };
}

function beginReview(registry: GovernedAgenticProposalRegistry, receipt: GovernedProposalReceiptV1) {
  const reviewerAuthorization = authorization(receipt);
  const command = { ...transition(receipt), actorKind: "HUMAN" as const, reviewerAuthorization };
  const event = registry.beginHumanReview(command);
  return { reviewerAuthorization, command, event };
}

function approvalCommand(
  receipt: GovernedProposalReceiptV1,
  reviewerAuthorization: ReviewerAuthorizationV1,
  overrides: Partial<ApprovalCommandV1> = {},
): ApprovalCommandV1 {
  return {
    ...transition(receipt, {
      eventId: "event_3333333333333333",
      idempotencyKey: "idem_3333333333333333",
      occurredAt: "2026-07-13T10:02:00.000Z",
      reasonRef: "reason:agentic:approved-for-action:v1",
    }),
    actorKind: "HUMAN",
    approvalId: "approval_1111111111111111",
    reviewedPayloadDigest: receipt.payloadDigest,
    humanAuthoredRationaleRef: "rationale_1111111111111111",
    reviewerAuthorization,
    ...overrides,
  };
}

function approvedRegistry() {
  const registry = new GovernedAgenticProposalRegistry({ now: () => new Date("2026-07-14T00:00:00.000Z") });
  const receipt = registry.createProposal(proposal());
  const { reviewerAuthorization } = beginReview(registry, receipt);
  const approval = registry.approveForAction(approvalCommand(receipt, reviewerAuthorization));
  return { registry, receipt, reviewerAuthorization, approval };
}

function executionCommand(
  receipt: GovernedProposalReceiptV1,
  approval: ReturnType<typeof approvedRegistry>["approval"],
  overrides: Partial<ExternalExecutionCommandV1> = {},
): ExternalExecutionCommandV1 {
  const authPayload = {
    authorizationRef: "executionauth_1111111111111111" as const,
    tenantRef: receipt.tenantRef,
    scopeRef: receipt.scopeRef,
    actionKind: receipt.actionKind,
    proposalId: receipt.proposalId,
    proposalDigest: receipt.proposalDigest,
    payloadDigest: receipt.payloadDigest,
    issuedAt: "2026-07-13T10:03:00.000Z",
    expiresAt: "2026-07-13T11:00:00.000Z",
    revoked: false as const,
    issuerRef: "issuer_2222222222222222" as const,
    verificationMode: "REFERENCE_ONLY_PRE_G0" as const,
  };
  const independentAuthorization: IndependentExecutionAuthorizationV1 = {
    ...authPayload,
    authorizationDigest: computeIndependentExecutionAuthorizationDigest(authPayload),
  };
  return {
    executionId: "execution_1111111111111111",
    proposalId: receipt.proposalId,
    proposalDigest: receipt.proposalDigest,
    payloadDigest: receipt.payloadDigest,
    approvalId: approval.approvalId,
    approvalDigest: approval.approvalDigest,
    independentAuthorization,
    recordingSystemRef: "system_2222222222222222",
    externalSystemRef: "external_1111111111111111",
    externalEvidenceRef: "evidence_3333333333333333",
    externalEvidenceDigest: digest("4"),
    eventId: "event_4444444444444444",
    idempotencyKey: "idem_4444444444444444",
    occurredAt: "2026-07-13T10:04:00.000Z",
    ...overrides,
  };
}

describe("governed-agentic-proposal/v1", () => {
  it("creates only an immutable, synthetic, non-executable proposal receipt", () => {
    const registry = new GovernedAgenticProposalRegistry({ now: () => new Date("2026-07-14T00:00:00.000Z") });
    const receipt = registry.createProposal(proposal());
    expect(receipt.requiredTier).toBe("T1");
    expect(receipt.executionAuthority).toBe("NONE");
    expect(receipt.productionEligible).toBe(false);
    expect(receipt.proposalDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(registry.getSnapshot(receipt.proposalId)?.state).toBe("AI_PROPOSED");
  });

  it("exposes no execute, send, apply, mutate or batch approval method", () => {
    const surface = GovernedAgenticProposalRegistry.prototype as unknown as Record<string, unknown>;
    for (const method of ["execute", "send", "apply", "mutate", "approveMany", "batchApprove"]) {
      expect(surface[method]).toBeUndefined();
    }
  });

  it.each(["CANDIDATE_REJECT", "HIRE_CANDIDATE", "RANK_CANDIDATES", "SEND_EMAIL", "EXECUTE_CHANGE"])(
    "hard-disallows high-impact or side-effect action kind %s",
    (actionKind) => {
      const registry = new GovernedAgenticProposalRegistry({ now: () => new Date("2026-07-14T00:00:00.000Z") });
      expect(() => registry.createProposal(proposal({ actionKind: actionKind as never }))).toThrow("ACTION_KIND_HARD_DISALLOWED");
    },
  );

  it("fails closed on unknown input fields and raw content claims", () => {
    const registry = new GovernedAgenticProposalRegistry({ now: () => new Date("2026-07-14T00:00:00.000Z") });
    expect(() => registry.createProposal({ ...proposal(), prompt: "raw" } as never)).toThrow("PROPOSAL_UNKNOWN_FIELD:prompt");
    expect(() => registry.createProposal(proposal({ containsRawContent: true as never }))).toThrow("RAW_CONTENT_NOT_ALLOWED");
  });

  it("rejects path-like dot segments in semantic version references", () => {
    const registry = new GovernedAgenticProposalRegistry({ now: () => new Date("2026-07-14T00:00:00.000Z") });
    expect(() => registry.createProposal(proposal({
      targetResourceVersionRef: "resource-version:..:etc:passwd",
    }))).toThrow("TARGET_RESOURCE_VERSION_INVALID");
  });

  it("derives T2 for candidate communication drafts", () => {
    const registry = new GovernedAgenticProposalRegistry({ now: () => new Date("2026-07-14T00:00:00.000Z") });
    expect(registry.createProposal(proposal({ actionKind: "CANDIDATE_COMMUNICATION_DRAFT" })).requiredTier).toBe("T2");
  });

  it("enters human review only with exact tenant, scope, action and tier authorization", () => {
    const registry = new GovernedAgenticProposalRegistry({ now: () => new Date("2026-07-14T00:00:00.000Z") });
    const receipt = registry.createProposal(proposal({ actionKind: "CANDIDATE_COMMUNICATION_DRAFT" }));
    const weak = authorization(receipt, { tierCeiling: "T1" });
    expect(() => registry.beginHumanReview({ ...transition(receipt), actorKind: "HUMAN", reviewerAuthorization: weak })).toThrow("REVIEWER_TIER_CEILING_EXCEEDED");
  });

  it("rejects a forged reviewer authorization digest", () => {
    const registry = new GovernedAgenticProposalRegistry({ now: () => new Date("2026-07-14T00:00:00.000Z") });
    const receipt = registry.createProposal(proposal());
    const forged = { ...authorization(receipt), authorizationDigest: digest("f") };
    expect(() => registry.beginHumanReview({ ...transition(receipt), actorKind: "HUMAN", reviewerAuthorization: forged })).toThrow("REVIEWER_AUTH_DIGEST_MISMATCH");
  });

  it("binds the active review session to the authorized human", () => {
    const registry = new GovernedAgenticProposalRegistry({ now: () => new Date("2026-07-14T00:00:00.000Z") });
    const receipt = registry.createProposal(proposal());
    beginReview(registry, receipt);
    expect(() => registry.returnForRevision(transition(receipt, {
      eventId: "event_3333333333333333", idempotencyKey: "idem_3333333333333333",
      actorRef: "reviewer_dddddddddddddddd", occurredAt: "2026-07-13T10:02:00.000Z",
    }))).toThrow("TRANSITION_REVIEW_SESSION_MISMATCH");
  });

  it("approves the exact immutable payload but grants no execution authority", () => {
    const { approval } = approvedRegistry();
    expect(approval.reviewOutcome).toBe("APPROVED_FOR_ACTION");
    expect(approval.approvalScope).toBe("SYNTHETIC_PREVIEW_ONLY");
    expect(approval.executionAuthority).toBe("NONE");
    expect(approval.currentProposalStateCheckRequired).toBe(true);
    expect(approval.executionEvidence).toBeNull();
    expect(approval.finalizedEmploymentDecision).toBe(false);
  });

  it("rejects approval against a payload digest that was not reviewed", () => {
    const registry = new GovernedAgenticProposalRegistry({ now: () => new Date("2026-07-14T00:00:00.000Z") });
    const receipt = registry.createProposal(proposal());
    const { reviewerAuthorization } = beginReview(registry, receipt);
    expect(() => registry.approveForAction(approvalCommand(receipt, reviewerAuthorization, { reviewedPayloadDigest: digest("9") }))).toThrow("APPROVAL_PAYLOAD_DIGEST_MISMATCH");
  });

  it("returns for revision, supersedes immutably, and never mutates the predecessor", () => {
    const registry = new GovernedAgenticProposalRegistry({ now: () => new Date("2026-07-14T00:00:00.000Z") });
    const receipt = registry.createProposal(proposal());
    beginReview(registry, receipt);
    registry.returnForRevision(transition(receipt, {
      eventId: "event_3333333333333333", idempotencyKey: "idem_3333333333333333",
      reasonRef: "reason:agentic:return-for-revision:v1", occurredAt: "2026-07-13T10:02:00.000Z",
    }));
    const revision = proposal({
      proposalId: "proposal_2222222222222222", payloadRef: "payload_2222222222222222",
      payloadDigest: digest("5"), sourceEvidence: [{ evidenceRef: "evidence_2222222222222222", evidenceDigest: digest("6") }],
      createdAt: "2026-07-13T10:04:00.000Z", expiresAt: "2026-07-13T12:30:00.000Z",
      supersedesProposalId: receipt.proposalId, supersedesProposalDigest: receipt.proposalDigest,
      creationEventId: "event_5555555555555555", idempotencyKey: "idem_5555555555555555",
    });
    const next = registry.createRevision({
      predecessorProposalId: receipt.proposalId, predecessorProposalDigest: receipt.proposalDigest,
      supersedeEventId: "event_4444444444444444", supersedeReasonRef: "reason:agentic:revision-created:v1",
      occurredAt: "2026-07-13T10:03:00.000Z", idempotencyKey: "idem_4444444444444444", newProposal: revision,
    });
    expect(registry.getSnapshot(receipt.proposalId)?.state).toBe("SUPERSEDED");
    expect(registry.getSnapshot(receipt.proposalId)?.proposal.payloadDigest).toBe(digest("1"));
    expect(next.payloadDigest).toBe(digest("5"));
  });

  it("keeps rejection proposal-scoped and terminal", () => {
    const registry = new GovernedAgenticProposalRegistry({ now: () => new Date("2026-07-14T00:00:00.000Z") });
    const receipt = registry.createProposal(proposal());
    beginReview(registry, receipt);
    registry.rejectProposal(transition(receipt, {
      eventId: "event_3333333333333333", idempotencyKey: "idem_3333333333333333",
      reasonRef: "reason:agentic:proposal-rejected:v1", occurredAt: "2026-07-13T10:02:00.000Z",
    }));
    expect(registry.getSnapshot(receipt.proposalId)?.state).toBe("REJECTED");
    expect(() => registry.withdraw(transition(receipt, {
      actorKind: "OWNER", actorRef: "owner_1111111111111111", eventId: "event_4444444444444444",
      idempotencyKey: "idem_4444444444444444", occurredAt: "2026-07-13T10:03:00.000Z",
    }))).toThrow("TRANSITION_STATE_INVALID");
  });

  it("supports explicit withdrawal before external execution", () => {
    const registry = new GovernedAgenticProposalRegistry({ now: () => new Date("2026-07-14T00:00:00.000Z") });
    const receipt = registry.createProposal(proposal());
    registry.withdraw(transition(receipt, {
      actorKind: "AGENT", actorRef: "agent_1111111111111111",
      reasonRef: "reason:agentic:proposal-withdrawn:v1",
    }));
    expect(registry.getSnapshot(receipt.proposalId)?.state).toBe("WITHDRAWN");
  });

  it("expires only after TTL and only through the system actor", () => {
    const registry = new GovernedAgenticProposalRegistry({ now: () => new Date("2026-07-14T00:00:00.000Z") });
    const receipt = registry.createProposal(proposal());
    const command = transition(receipt, {
      actorKind: "SYSTEM", actorRef: "system_1111111111111111",
      occurredAt: "2026-07-13T12:00:00.000Z", reasonRef: "reason:agentic:proposal-expired:v1",
    });
    registry.expire(command);
    expect(registry.getSnapshot(receipt.proposalId)?.state).toBe("EXPIRED");
  });

  it("records external execution only with independent exact-lineage authorization", () => {
    const { registry, receipt, approval } = approvedRegistry();
    const execution = registry.recordExternalExecution(executionCommand(receipt, approval));
    expect(execution.observation).toBe("EXTERNAL_EXECUTION_RECORDED");
    expect(execution.executionPerformedByContract).toBe(false);
    expect(execution.executionAuthorityGrantedByContract).toBe(false);
    expect(registry.getSnapshot(receipt.proposalId)?.state).toBe("APPROVED_FOR_ACTION");
  });

  it("rejects execution authorization laundering across scopes", () => {
    const { registry, receipt, approval } = approvedRegistry();
    const command = executionCommand(receipt, approval);
    const payload = { ...command.independentAuthorization, scopeRef: "scope_dddddddddddddddd" as const };
    const { authorizationDigest: _discarded, ...unsigned } = payload;
    const forged = { ...unsigned, authorizationDigest: computeIndependentExecutionAuthorizationDigest(unsigned) };
    expect(() => registry.recordExternalExecution({ ...command, independentAuthorization: forged })).toThrow("EXECUTION_AUTH_LINEAGE_MISMATCH");
  });

  it("rejects a forged execution authorization digest", () => {
    const { registry, receipt, approval } = approvedRegistry();
    const command = executionCommand(receipt, approval);
    const forged = { ...command.independentAuthorization, authorizationDigest: digest("f") };
    expect(() => registry.recordExternalExecution({ ...command, independentAuthorization: forged })).toThrow("EXECUTION_AUTH_DIGEST_MISMATCH");
  });

  it("rejects future-dated execution observations", () => {
    const { registry, receipt, approval } = approvedRegistry();
    const command = executionCommand(receipt, approval, { occurredAt: "2026-07-15T10:04:00.000Z" });
    expect(() => registry.recordExternalExecution(command)).toThrow("EXECUTION_TIME_IN_FUTURE");
  });

  it("rejects external execution at or after proposal expiry", () => {
    const { registry, receipt, approval } = approvedRegistry();
    const command = executionCommand(receipt, approval, { occurredAt: receipt.expiresAt });
    expect(() => registry.recordExternalExecution(command)).toThrow("EXECUTION_PROPOSAL_EXPIRED");
  });

  it("records at most one external execution observation per proposal", () => {
    const { registry, receipt, approval } = approvedRegistry();
    registry.recordExternalExecution(executionCommand(receipt, approval));
    expect(() => registry.recordExternalExecution(executionCommand(receipt, approval, {
      executionId: "execution_2222222222222222", externalEvidenceRef: "evidence_5555555555555555",
      externalEvidenceDigest: digest("8"), eventId: "event_5555555555555555",
      idempotencyKey: "idem_5555555555555555", occurredAt: "2026-07-13T10:05:00.000Z",
    }))).toThrow("EXECUTION_ALREADY_RECORDED");
  });

  it("records rollback only with live review-session authorization and exact lineage", () => {
    const { registry, receipt, reviewerAuthorization, approval } = approvedRegistry();
    const execution = registry.recordExternalExecution(executionCommand(receipt, approval));
    const command: ExternalRollbackCommandV1 = {
      rollbackId: "rollbackreceipt_1111111111111111", proposalId: receipt.proposalId,
      proposalDigest: receipt.proposalDigest, payloadDigest: receipt.payloadDigest,
      approvalDigest: approval.approvalDigest, executionId: execution.executionId,
      executionReceiptDigest: execution.executionReceiptDigest, rollbackPlanRef: receipt.rollbackPlanRef,
      rollbackPlanDigest: receipt.rollbackPlanDigest, humanAuthorization: reviewerAuthorization,
      rollbackEvidenceRef: "evidence_4444444444444444", rollbackEvidenceDigest: digest("7"),
      eventId: "event_5555555555555555", idempotencyKey: "idem_5555555555555555",
      occurredAt: "2026-07-13T10:05:00.000Z",
    };
    const rollback = registry.recordExternalRollback(command);
    expect(rollback.observation).toBe("EXTERNAL_ROLLBACK_ATTESTED");
    expect(rollback.rollbackPerformedByContract).toBe(false);
    expect(rollback.proposalReactivated).toBe(false);
    expect(rollback.newExecutionAuthorityCreated).toBe(false);
  });

  it("rejects rollback evidence against a changed rollback-plan digest", () => {
    const { registry, receipt, reviewerAuthorization, approval } = approvedRegistry();
    const execution = registry.recordExternalExecution(executionCommand(receipt, approval));
    const command: ExternalRollbackCommandV1 = {
      rollbackId: "rollbackreceipt_1111111111111111", proposalId: receipt.proposalId,
      proposalDigest: receipt.proposalDigest, payloadDigest: receipt.payloadDigest,
      approvalDigest: approval.approvalDigest, executionId: execution.executionId,
      executionReceiptDigest: execution.executionReceiptDigest, rollbackPlanRef: receipt.rollbackPlanRef,
      rollbackPlanDigest: digest("f"), humanAuthorization: reviewerAuthorization,
      rollbackEvidenceRef: "evidence_4444444444444444", rollbackEvidenceDigest: digest("7"),
      eventId: "event_5555555555555555", idempotencyKey: "idem_5555555555555555",
      occurredAt: "2026-07-13T10:05:00.000Z",
    };
    expect(() => registry.recordExternalRollback(command)).toThrow("ROLLBACK_LINEAGE_MISMATCH");
  });

  it("records at most one external rollback observation per proposal", () => {
    const { registry, receipt, reviewerAuthorization, approval } = approvedRegistry();
    const execution = registry.recordExternalExecution(executionCommand(receipt, approval));
    const command: ExternalRollbackCommandV1 = {
      rollbackId: "rollbackreceipt_1111111111111111", proposalId: receipt.proposalId,
      proposalDigest: receipt.proposalDigest, payloadDigest: receipt.payloadDigest,
      approvalDigest: approval.approvalDigest, executionId: execution.executionId,
      executionReceiptDigest: execution.executionReceiptDigest, rollbackPlanRef: receipt.rollbackPlanRef,
      rollbackPlanDigest: receipt.rollbackPlanDigest, humanAuthorization: reviewerAuthorization,
      rollbackEvidenceRef: "evidence_4444444444444444", rollbackEvidenceDigest: digest("7"),
      eventId: "event_5555555555555555", idempotencyKey: "idem_5555555555555555",
      occurredAt: "2026-07-13T10:05:00.000Z",
    };
    registry.recordExternalRollback(command);
    expect(() => registry.recordExternalRollback({
      ...command, rollbackId: "rollbackreceipt_2222222222222222",
      rollbackEvidenceRef: "evidence_6666666666666666", rollbackEvidenceDigest: digest("9"),
      eventId: "event_6666666666666666", idempotencyKey: "idem_6666666666666666",
      occurredAt: "2026-07-13T10:06:00.000Z",
    })).toThrow("ROLLBACK_ALREADY_RECORDED");
  });

  it("makes exact retries idempotent even after state transition", () => {
    const registry = new GovernedAgenticProposalRegistry({ now: () => new Date("2026-07-14T00:00:00.000Z") });
    const receipt = registry.createProposal(proposal());
    const { command, event } = beginReview(registry, receipt);
    expect(registry.beginHumanReview(command)).toEqual(event);
    expect(registry.history(receipt.proposalId)).toHaveLength(2);
  });

  it("rejects an idempotency key reused with changed content", () => {
    const registry = new GovernedAgenticProposalRegistry({ now: () => new Date("2026-07-14T00:00:00.000Z") });
    const receipt = registry.createProposal(proposal());
    const { command } = beginReview(registry, receipt);
    expect(() => registry.beginHumanReview({ ...command, reasonRef: "reason:agentic:changed:v1" })).toThrow("IDEMPOTENCY_CONFLICT");
  });

  it("rejects stale proposal digests", () => {
    const registry = new GovernedAgenticProposalRegistry({ now: () => new Date("2026-07-14T00:00:00.000Z") });
    const receipt = registry.createProposal(proposal());
    expect(() => registry.withdraw(transition(receipt, { proposalDigest: digest("f") }))).toThrow("PROPOSAL_DIGEST_MISMATCH");
  });

  it("rejects evidence digest replay across proposals", () => {
    const registry = new GovernedAgenticProposalRegistry({ now: () => new Date("2026-07-14T00:00:00.000Z") });
    registry.createProposal(proposal());
    expect(() => registry.createProposal(proposal({
      proposalId: "proposal_2222222222222222", payloadRef: "payload_2222222222222222",
      payloadDigest: digest("8"), creationEventId: "event_2222222222222222",
      idempotencyKey: "idem_2222222222222222",
    }))).toThrow("EVIDENCE_DIGEST_REPLAY");
  });

  it("returns cloned snapshots so consumers cannot mutate registry state", () => {
    const { registry, receipt } = approvedRegistry();
    const snapshot = registry.getSnapshot(receipt.proposalId);
    expect(snapshot).not.toBeNull();
    (snapshot as { state: string }).state = "REJECTED";
    expect(registry.getSnapshot(receipt.proposalId)?.state).toBe("APPROVED_FOR_ACTION");
  });
});
