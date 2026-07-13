/**
 * Faz 25 P6.5 — governed agentic proposals, PRE-G0 reference registry.
 *
 * `APPROVED_FOR_ACTION` is a human review outcome. It is NOT FINALIZED,
 * execution authority, a bearer credential, production activation, or proof
 * that any side effect occurred. This contract has no execute/send/apply/
 * mutate/batch API. External execution and rollback methods record receipts
 * for independently authorized actions performed outside this contract.
 */

import { createHash } from "node:crypto";

export const GOVERNED_AGENTIC_SCHEMA_VERSION =
  "governed-agentic-proposal/v1" as const;

export type ApprovalTier = "T1" | "T2" | "T3";

export type GovernedActionKind =
  | "INTERNAL_REVIEW_TASK"
  | "EVIDENCE_FOLLOW_UP_DRAFT"
  | "CANDIDATE_COMMUNICATION_DRAFT"
  | "INTERVIEW_SCHEDULE_CHANGE_DRAFT";

export type ProposalState =
  | "AI_PROPOSED"
  | "HUMAN_REVIEW"
  | "RETURNED_FOR_REVISION"
  | "APPROVED_FOR_ACTION"
  | "REJECTED"
  | "WITHDRAWN"
  | "EXPIRED"
  | "SUPERSEDED";

export type ActorKind = "AGENT" | "HUMAN" | "OWNER" | "SYSTEM";

export type AuditEventKind =
  | "STATE_TRANSITION"
  | "EXTERNAL_EXECUTION_RECORDED"
  | "EXTERNAL_ROLLBACK_ATTESTED";

export interface AgenticEvidenceRefV1 {
  readonly evidenceRef: `evidence_${string}`;
  readonly evidenceDigest: `sha256:${string}`;
}

export interface CreateGovernedProposalV1 {
  readonly schemaVersion: typeof GOVERNED_AGENTIC_SCHEMA_VERSION;
  readonly synthetic: true;
  readonly tenantRef: `tenant_${string}`;
  readonly scopeRef: `scope_${string}`;
  readonly proposalId: `proposal_${string}`;
  readonly actionKind: GovernedActionKind;
  readonly payloadRef: `payload_${string}`;
  readonly payloadDigest: `sha256:${string}`;
  readonly targetResourceRef: `resource_${string}`;
  readonly targetResourceVersionRef: string;
  readonly suggestedByAgentRef: `agent_${string}`;
  readonly sourceEvidence: readonly AgenticEvidenceRefV1[];
  readonly aiOutputVersionRef: string;
  readonly policyVersionRef: string;
  readonly rollbackPlanRef: `rollback_${string}`;
  readonly rollbackPlanDigest: `sha256:${string}`;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly supersedesProposalId: `proposal_${string}` | null;
  readonly supersedesProposalDigest: `sha256:${string}` | null;
  readonly creationEventId: `event_${string}`;
  readonly idempotencyKey: `idem_${string}`;

  readonly humanOversightStandardRef: "human-oversight:canonical:v1";
  readonly lifecycleMappingRef: "agentic:ai-proposed-human-review:v1";
  readonly containsRawPii: false;
  readonly containsRawContent: false;
  readonly containsProtectedAttributes: false;
  readonly executionAuthority: "NONE";
  readonly executionPerformedByContract: false;
  readonly autoExecute: false;
  readonly batchApproval: false;
  readonly mutationAllowed: false;
  readonly automatedEmploymentDecision: false;
  readonly candidateRanking: "DISALLOWED";
  readonly candidateRejection: "DISALLOWED";
  readonly candidateHiring: "DISALLOWED";
  readonly scoring: "DISALLOWED";
  readonly verdict: "NONE";
  readonly evidenceGate: "NOT_MET";
  readonly legalGate: "NOT_MET";
  readonly ownerGate: "NOT_MET";
  readonly productionEligible: false;
}

export type GovernedProposalReceiptV1 = CreateGovernedProposalV1 & {
  readonly requiredTier: "T1" | "T2";
  readonly initialState: "AI_PROPOSED";
  readonly immutable: true;
  readonly proposalDigest: `sha256:${string}`;
};

export interface ReviewerAuthorizationV1 {
  readonly authorizationRef: `authorization_${string}`;
  readonly tenantRef: `tenant_${string}`;
  readonly reviewerRef: `reviewer_${string}`;
  readonly oversightRoleRef: string;
  readonly allowedScopeRefs: readonly `scope_${string}`[];
  readonly allowedActionKinds: readonly GovernedActionKind[];
  readonly tierCeiling: ApprovalTier;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly revoked: false;
  readonly issuerRef: `issuer_${string}`;
  readonly verificationMode: "REFERENCE_ONLY_PRE_G0";
  readonly authorizationDigest: `sha256:${string}`;
}

export interface TransitionCommandV1 {
  readonly proposalId: `proposal_${string}`;
  readonly proposalDigest: `sha256:${string}`;
  readonly eventId: `event_${string}`;
  readonly idempotencyKey: `idem_${string}`;
  readonly actorKind: ActorKind;
  readonly actorRef: string;
  readonly reasonRef: string;
  readonly occurredAt: string;
}

export interface BeginHumanReviewCommandV1 extends TransitionCommandV1 {
  readonly actorKind: "HUMAN";
  readonly reviewerAuthorization: ReviewerAuthorizationV1;
}

export interface ApprovalCommandV1 extends TransitionCommandV1 {
  readonly actorKind: "HUMAN";
  readonly approvalId: `approval_${string}`;
  readonly reviewedPayloadDigest: `sha256:${string}`;
  readonly humanAuthoredRationaleRef: `rationale_${string}`;
  readonly reviewerAuthorization: ReviewerAuthorizationV1;
}

export interface RevisionCommandV1 {
  readonly predecessorProposalId: `proposal_${string}`;
  readonly predecessorProposalDigest: `sha256:${string}`;
  readonly supersedeEventId: `event_${string}`;
  readonly supersedeReasonRef: string;
  readonly occurredAt: string;
  readonly idempotencyKey: `idem_${string}`;
  readonly newProposal: CreateGovernedProposalV1;
}

export interface AuditEventReceiptV1 {
  readonly schemaVersion: typeof GOVERNED_AGENTIC_SCHEMA_VERSION;
  readonly eventId: `event_${string}`;
  readonly proposalId: `proposal_${string}`;
  readonly proposalDigest: `sha256:${string}`;
  readonly payloadDigest: `sha256:${string}`;
  readonly eventKind: AuditEventKind;
  readonly fromState: ProposalState | null;
  readonly toState: ProposalState | null;
  readonly actorKind: ActorKind;
  readonly actorRef: string;
  readonly reasonRef: string;
  readonly occurredAt: string;
  readonly sequence: number;
  readonly previousEventDigest: `sha256:${string}` | null;
  readonly eventDigest: `sha256:${string}`;
}

export interface ApprovalReceiptV1 {
  readonly schemaVersion: typeof GOVERNED_AGENTIC_SCHEMA_VERSION;
  readonly approvalId: `approval_${string}`;
  readonly proposalId: `proposal_${string}`;
  readonly proposalDigest: `sha256:${string}`;
  readonly approvedPayloadDigest: `sha256:${string}`;
  readonly tenantRef: `tenant_${string}`;
  readonly scopeRef: `scope_${string}`;
  readonly actionKind: GovernedActionKind;
  readonly requiredTier: "T1" | "T2";
  readonly reviewerRef: `reviewer_${string}`;
  readonly reviewerAuthorizationRef: `authorization_${string}`;
  readonly reviewerAuthorizationDigest: `sha256:${string}`;
  readonly humanAuthoredRationaleRef: `rationale_${string}`;
  readonly approvalAuditEventDigest: `sha256:${string}`;
  readonly approvedAt: string;
  readonly reviewOutcome: "APPROVED_FOR_ACTION";
  readonly approvalScope: "SYNTHETIC_PREVIEW_ONLY";
  readonly finalizedEmploymentDecision: false;
  readonly executionAuthority: "NONE";
  readonly bearerCredential: false;
  readonly requiresIndependentExecutionAuthorization: true;
  readonly currentProposalStateCheckRequired: true;
  readonly executionPerformedByContract: false;
  readonly executionEvidence: null;
  readonly productionEligible: false;
  readonly approvalDigest: `sha256:${string}`;
}

export interface IndependentExecutionAuthorizationV1 {
  readonly authorizationRef: `executionauth_${string}`;
  readonly tenantRef: `tenant_${string}`;
  readonly scopeRef: `scope_${string}`;
  readonly actionKind: GovernedActionKind;
  readonly proposalId: `proposal_${string}`;
  readonly proposalDigest: `sha256:${string}`;
  readonly payloadDigest: `sha256:${string}`;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly revoked: false;
  readonly issuerRef: `issuer_${string}`;
  readonly verificationMode: "REFERENCE_ONLY_PRE_G0";
  readonly authorizationDigest: `sha256:${string}`;
}

export interface ExternalExecutionCommandV1 {
  readonly executionId: `execution_${string}`;
  readonly proposalId: `proposal_${string}`;
  readonly proposalDigest: `sha256:${string}`;
  readonly payloadDigest: `sha256:${string}`;
  readonly approvalId: `approval_${string}`;
  readonly approvalDigest: `sha256:${string}`;
  readonly independentAuthorization: IndependentExecutionAuthorizationV1;
  readonly recordingSystemRef: `system_${string}`;
  readonly externalSystemRef: `external_${string}`;
  readonly externalEvidenceRef: `evidence_${string}`;
  readonly externalEvidenceDigest: `sha256:${string}`;
  readonly eventId: `event_${string}`;
  readonly idempotencyKey: `idem_${string}`;
  readonly occurredAt: string;
}

export interface ExternalExecutionReceiptV1 {
  readonly schemaVersion: typeof GOVERNED_AGENTIC_SCHEMA_VERSION;
  readonly executionId: `execution_${string}`;
  readonly proposalId: `proposal_${string}`;
  readonly proposalDigest: `sha256:${string}`;
  readonly payloadDigest: `sha256:${string}`;
  readonly approvalId: `approval_${string}`;
  readonly approvalDigest: `sha256:${string}`;
  readonly independentAuthorizationRef: `executionauth_${string}`;
  readonly independentAuthorizationDigest: `sha256:${string}`;
  readonly externalSystemRef: `external_${string}`;
  readonly externalEvidenceRef: `evidence_${string}`;
  readonly externalEvidenceDigest: `sha256:${string}`;
  readonly occurredAt: string;
  readonly observation: "EXTERNAL_EXECUTION_RECORDED";
  readonly executionPerformedByContract: false;
  readonly executionAuthorityGrantedByContract: false;
  readonly auditEventDigest: `sha256:${string}`;
  readonly executionReceiptDigest: `sha256:${string}`;
}

export interface ExternalRollbackCommandV1 {
  readonly rollbackId: `rollbackreceipt_${string}`;
  readonly proposalId: `proposal_${string}`;
  readonly proposalDigest: `sha256:${string}`;
  readonly payloadDigest: `sha256:${string}`;
  readonly approvalDigest: `sha256:${string}`;
  readonly executionId: `execution_${string}`;
  readonly executionReceiptDigest: `sha256:${string}`;
  readonly rollbackPlanRef: `rollback_${string}`;
  readonly rollbackPlanDigest: `sha256:${string}`;
  readonly humanAuthorization: ReviewerAuthorizationV1;
  readonly rollbackEvidenceRef: `evidence_${string}`;
  readonly rollbackEvidenceDigest: `sha256:${string}`;
  readonly eventId: `event_${string}`;
  readonly idempotencyKey: `idem_${string}`;
  readonly occurredAt: string;
}

export interface ExternalRollbackReceiptV1 {
  readonly schemaVersion: typeof GOVERNED_AGENTIC_SCHEMA_VERSION;
  readonly rollbackId: `rollbackreceipt_${string}`;
  readonly proposalId: `proposal_${string}`;
  readonly executionId: `execution_${string}`;
  readonly executionReceiptDigest: `sha256:${string}`;
  readonly approvalDigest: `sha256:${string}`;
  readonly payloadDigest: `sha256:${string}`;
  readonly rollbackPlanRef: `rollback_${string}`;
  readonly rollbackPlanDigest: `sha256:${string}`;
  readonly humanAuthorizationRef: `authorization_${string}`;
  readonly humanAuthorizationDigest: `sha256:${string}`;
  readonly rollbackEvidenceRef: `evidence_${string}`;
  readonly rollbackEvidenceDigest: `sha256:${string}`;
  readonly occurredAt: string;
  readonly observation: "EXTERNAL_ROLLBACK_ATTESTED";
  readonly rollbackPerformedByContract: false;
  readonly proposalReactivated: false;
  readonly newExecutionAuthorityCreated: false;
  readonly auditEventDigest: `sha256:${string}`;
  readonly rollbackReceiptDigest: `sha256:${string}`;
}

export interface ProposalSnapshotV1 {
  readonly proposal: GovernedProposalReceiptV1;
  readonly state: ProposalState;
  readonly approval: ApprovalReceiptV1 | null;
  readonly externalExecution: ExternalExecutionReceiptV1 | null;
  readonly externalRollback: ExternalRollbackReceiptV1 | null;
  readonly history: readonly AuditEventReceiptV1[];
}

export interface AgenticClock {
  now(): Date;
}

const SYSTEM_CLOCK: AgenticClock = { now: () => new Date() };
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const OPAQUE = /^[a-z]+_[a-f0-9]{16,64}$/;
const SEMANTIC_REF = /^[a-z][a-z0-9_-]*(?::[a-z0-9._-]+)+$/;
const MAX_TTL_MS = 72 * 60 * 60 * 1000;
const MAX_ACTIVE_PER_TENANT = 25;

const PROPOSAL_KEYS = new Set([
  "schemaVersion", "synthetic", "tenantRef", "scopeRef", "proposalId",
  "actionKind", "payloadRef", "payloadDigest", "targetResourceRef",
  "targetResourceVersionRef", "suggestedByAgentRef", "sourceEvidence",
  "aiOutputVersionRef", "policyVersionRef", "rollbackPlanRef",
  "rollbackPlanDigest", "createdAt", "expiresAt", "supersedesProposalId",
  "supersedesProposalDigest", "creationEventId", "idempotencyKey",
  "humanOversightStandardRef", "lifecycleMappingRef", "containsRawPii",
  "containsRawContent", "containsProtectedAttributes", "executionAuthority",
  "executionPerformedByContract", "autoExecute", "batchApproval",
  "mutationAllowed", "automatedEmploymentDecision", "candidateRanking",
  "candidateRejection", "candidateHiring", "scoring", "verdict",
  "evidenceGate", "legalGate", "ownerGate", "productionEligible",
]);
const EVIDENCE_KEYS = new Set(["evidenceRef", "evidenceDigest"]);
const AUTH_KEYS = new Set([
  "authorizationRef", "tenantRef", "reviewerRef", "oversightRoleRef",
  "allowedScopeRefs", "allowedActionKinds", "tierCeiling", "issuedAt",
  "expiresAt", "revoked", "issuerRef", "verificationMode",
  "authorizationDigest",
]);
const TRANSITION_KEYS = new Set([
  "proposalId", "proposalDigest", "eventId", "idempotencyKey", "actorKind",
  "actorRef", "reasonRef", "occurredAt",
]);
const REVIEW_KEYS = new Set([...TRANSITION_KEYS, "reviewerAuthorization"]);
const APPROVAL_KEYS = new Set([
  ...TRANSITION_KEYS, "approvalId", "reviewedPayloadDigest",
  "humanAuthoredRationaleRef", "reviewerAuthorization",
]);
const REVISION_KEYS = new Set([
  "predecessorProposalId", "predecessorProposalDigest", "supersedeEventId",
  "supersedeReasonRef", "occurredAt", "idempotencyKey", "newProposal",
]);
const EXEC_AUTH_KEYS = new Set([
  "authorizationRef", "tenantRef", "scopeRef", "actionKind", "proposalId",
  "proposalDigest", "payloadDigest", "issuedAt", "expiresAt", "revoked",
  "issuerRef", "verificationMode", "authorizationDigest",
]);
const EXECUTION_KEYS = new Set([
  "executionId", "proposalId", "proposalDigest", "payloadDigest", "approvalId",
  "approvalDigest", "independentAuthorization", "recordingSystemRef",
  "externalSystemRef",
  "externalEvidenceRef", "externalEvidenceDigest", "eventId",
  "idempotencyKey", "occurredAt",
]);
const ROLLBACK_KEYS = new Set([
  "rollbackId", "proposalId", "proposalDigest", "payloadDigest",
  "approvalDigest", "executionId", "executionReceiptDigest", "rollbackPlanRef",
  "rollbackPlanDigest", "humanAuthorization",
  "rollbackEvidenceRef", "rollbackEvidenceDigest", "eventId",
  "idempotencyKey", "occurredAt",
]);

const ALLOWED_ACTIONS = new Set<GovernedActionKind>([
  "INTERNAL_REVIEW_TASK", "EVIDENCE_FOLLOW_UP_DRAFT",
  "CANDIDATE_COMMUNICATION_DRAFT", "INTERVIEW_SCHEDULE_CHANGE_DRAFT",
]);
const FORBIDDEN_ACTION_TOKENS = [
  "REJECT", "HIRE", "ADVANCE", "OFFER", "RANK", "SCORE", "CONSENT_OVERRIDE",
  "ERASURE_OVERRIDE", "SEND", "EXECUTE", "MUTATE", "APPLY",
];
const ACTIVE_STATES = new Set<ProposalState>([
  "AI_PROPOSED", "HUMAN_REVIEW", "RETURNED_FOR_REVISION",
  "APPROVED_FOR_ACTION",
]);
const TERMINAL_STATES = new Set<ProposalState>([
  "REJECTED", "WITHDRAWN", "EXPIRED", "SUPERSEDED",
]);

function fail(code: string): never { throw new Error(code); }
function assertObject(value: unknown, code: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(code);
}
function assertOnlyKeys(value: Record<string, unknown>, keys: ReadonlySet<string>, code: string): void {
  for (const key of Object.keys(value)) if (!keys.has(key)) fail(`${code}:${key}`);
}
function assertOpaque(value: unknown, prefix: string, code: string): asserts value is string {
  if (typeof value !== "string" || !value.startsWith(`${prefix}_`) || !OPAQUE.test(value)) fail(code);
}
function assertDigest(value: unknown, code: string): asserts value is `sha256:${string}` {
  if (typeof value !== "string" || !SHA256.test(value)) fail(code);
}
function assertSemantic(value: unknown, code: string): asserts value is string {
  if (typeof value !== "string" || !SEMANTIC_REF.test(value) || value.length > 180) fail(code);
  if (value.split(":").some((segment) => segment === "." || segment === "..")) fail(code);
}
function parseTime(value: unknown, code: string): number {
  if (typeof value !== "string") fail(code);
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value) fail(code);
  return time;
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => [key, canonical(nested)]));
  }
  return value;
}
function sha(value: unknown): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")}`;
}
function clone<T>(value: T): T { return structuredClone(value); }
function exactTier(action: GovernedActionKind): "T1" | "T2" {
  return action === "INTERNAL_REVIEW_TASK" || action === "EVIDENCE_FOLLOW_UP_DRAFT"
    ? "T1" : "T2";
}
function tierValue(tier: ApprovalTier): number { return tier === "T1" ? 1 : tier === "T2" ? 2 : 3; }
function sortedUnique(values: readonly string[], code: string): void {
  if (values.length === 0 || new Set(values).size !== values.length) fail(code);
  if (values.join("\u0000") !== [...values].sort().join("\u0000")) fail(`${code}_NOT_CANONICAL`);
}

function validateProposal(input: unknown, clock: AgenticClock): asserts input is CreateGovernedProposalV1 {
  assertObject(input, "PROPOSAL_INVALID");
  assertOnlyKeys(input, PROPOSAL_KEYS, "PROPOSAL_UNKNOWN_FIELD");
  if (input.schemaVersion !== GOVERNED_AGENTIC_SCHEMA_VERSION) fail("SCHEMA_VERSION_INVALID");
  if (input.synthetic !== true) fail("SYNTHETIC_REQUIRED");
  assertOpaque(input.tenantRef, "tenant", "TENANT_REF_INVALID");
  assertOpaque(input.scopeRef, "scope", "SCOPE_REF_INVALID");
  assertOpaque(input.proposalId, "proposal", "PROPOSAL_ID_INVALID");
  if (!ALLOWED_ACTIONS.has(input.actionKind as GovernedActionKind)) {
    const token = String(input.actionKind).toUpperCase();
    if (FORBIDDEN_ACTION_TOKENS.some((forbidden) => token.includes(forbidden))) fail("ACTION_KIND_HARD_DISALLOWED");
    fail("ACTION_KIND_INVALID");
  }
  assertOpaque(input.payloadRef, "payload", "PAYLOAD_REF_INVALID");
  assertDigest(input.payloadDigest, "PAYLOAD_DIGEST_INVALID");
  assertOpaque(input.targetResourceRef, "resource", "TARGET_RESOURCE_REF_INVALID");
  assertSemantic(input.targetResourceVersionRef, "TARGET_RESOURCE_VERSION_INVALID");
  assertOpaque(input.suggestedByAgentRef, "agent", "AGENT_REF_INVALID");
  if (!Array.isArray(input.sourceEvidence) || input.sourceEvidence.length === 0 || input.sourceEvidence.length > 32) fail("EVIDENCE_REQUIRED");
  const evidenceRefs: string[] = [];
  const evidenceDigests: string[] = [];
  for (const evidence of input.sourceEvidence) {
    assertObject(evidence, "EVIDENCE_INVALID");
    assertOnlyKeys(evidence, EVIDENCE_KEYS, "EVIDENCE_UNKNOWN_FIELD");
    assertOpaque(evidence.evidenceRef, "evidence", "EVIDENCE_REF_INVALID");
    assertDigest(evidence.evidenceDigest, "EVIDENCE_DIGEST_INVALID");
    evidenceRefs.push(evidence.evidenceRef);
    evidenceDigests.push(evidence.evidenceDigest);
  }
  sortedUnique(evidenceRefs, "EVIDENCE_REF_DUPLICATE");
  sortedUnique(evidenceDigests, "EVIDENCE_DIGEST_DUPLICATE");
  assertSemantic(input.aiOutputVersionRef, "AI_OUTPUT_VERSION_INVALID");
  assertSemantic(input.policyVersionRef, "POLICY_VERSION_INVALID");
  assertOpaque(input.rollbackPlanRef, "rollback", "ROLLBACK_PLAN_REF_INVALID");
  assertDigest(input.rollbackPlanDigest, "ROLLBACK_PLAN_DIGEST_INVALID");
  assertOpaque(input.creationEventId, "event", "CREATION_EVENT_ID_INVALID");
  assertOpaque(input.idempotencyKey, "idem", "IDEMPOTENCY_KEY_INVALID");
  const createdAt = parseTime(input.createdAt, "CREATED_AT_INVALID");
  const expiresAt = parseTime(input.expiresAt, "EXPIRES_AT_INVALID");
  if (createdAt > clock.now().getTime() || expiresAt <= createdAt || expiresAt - createdAt > MAX_TTL_MS) fail("PROPOSAL_TTL_INVALID");
  const predecessorFields = [input.supersedesProposalId, input.supersedesProposalDigest];
  if (predecessorFields.some((value) => value !== null) && predecessorFields.some((value) => value === null)) fail("SUPERSEDES_LINEAGE_INCOMPLETE");
  if (input.supersedesProposalId !== null) {
    assertOpaque(input.supersedesProposalId, "proposal", "SUPERSEDES_ID_INVALID");
    assertDigest(input.supersedesProposalDigest, "SUPERSEDES_DIGEST_INVALID");
    if (input.supersedesProposalId === input.proposalId) fail("SUPERSEDES_SELF_REFERENCE");
  }
  const literals: readonly [unknown, unknown, string][] = [
    [input.humanOversightStandardRef, "human-oversight:canonical:v1", "HUMAN_OVERSIGHT_REF_INVALID"],
    [input.lifecycleMappingRef, "agentic:ai-proposed-human-review:v1", "LIFECYCLE_MAPPING_INVALID"],
    [input.containsRawPii, false, "RAW_PII_NOT_ALLOWED"],
    [input.containsRawContent, false, "RAW_CONTENT_NOT_ALLOWED"],
    [input.containsProtectedAttributes, false, "PROTECTED_ATTRIBUTES_NOT_ALLOWED"],
    [input.executionAuthority, "NONE", "EXECUTION_AUTHORITY_NOT_ALLOWED"],
    [input.executionPerformedByContract, false, "CONTRACT_EXECUTION_NOT_ALLOWED"],
    [input.autoExecute, false, "AUTO_EXECUTE_NOT_ALLOWED"],
    [input.batchApproval, false, "BATCH_APPROVAL_NOT_ALLOWED"],
    [input.mutationAllowed, false, "MUTATION_NOT_ALLOWED"],
    [input.automatedEmploymentDecision, false, "EMPLOYMENT_DECISION_NOT_ALLOWED"],
    [input.candidateRanking, "DISALLOWED", "RANKING_NOT_ALLOWED"],
    [input.candidateRejection, "DISALLOWED", "CANDIDATE_REJECTION_NOT_ALLOWED"],
    [input.candidateHiring, "DISALLOWED", "CANDIDATE_HIRING_NOT_ALLOWED"],
    [input.scoring, "DISALLOWED", "SCORING_NOT_ALLOWED"],
    [input.verdict, "NONE", "VERDICT_NOT_ALLOWED"],
    [input.evidenceGate, "NOT_MET", "EVIDENCE_GATE_MUST_BE_NOT_MET"],
    [input.legalGate, "NOT_MET", "LEGAL_GATE_MUST_BE_NOT_MET"],
    [input.ownerGate, "NOT_MET", "OWNER_GATE_MUST_BE_NOT_MET"],
    [input.productionEligible, false, "PRODUCTION_NOT_ALLOWED"],
  ];
  for (const [actual, expected, code] of literals) if (actual !== expected) fail(code);
}

function authorizationPayload(auth: ReviewerAuthorizationV1): Omit<ReviewerAuthorizationV1, "authorizationDigest"> {
  const { authorizationDigest: _discarded, ...payload } = auth;
  return payload;
}

export function computeReviewerAuthorizationDigest(auth: Omit<ReviewerAuthorizationV1, "authorizationDigest">): `sha256:${string}` {
  return sha(auth);
}

function validateReviewerAuthorization(auth: unknown, proposal: GovernedProposalReceiptV1, at: number): asserts auth is ReviewerAuthorizationV1 {
  assertObject(auth, "REVIEWER_AUTH_INVALID");
  assertOnlyKeys(auth, AUTH_KEYS, "REVIEWER_AUTH_UNKNOWN_FIELD");
  assertOpaque(auth.authorizationRef, "authorization", "REVIEWER_AUTH_REF_INVALID");
  assertOpaque(auth.tenantRef, "tenant", "REVIEWER_AUTH_TENANT_INVALID");
  assertOpaque(auth.reviewerRef, "reviewer", "REVIEWER_REF_INVALID");
  assertSemantic(auth.oversightRoleRef, "OVERSIGHT_ROLE_INVALID");
  if (!Array.isArray(auth.allowedScopeRefs) || !Array.isArray(auth.allowedActionKinds)) fail("REVIEWER_ALLOWLIST_INVALID");
  for (const scope of auth.allowedScopeRefs) assertOpaque(scope, "scope", "REVIEWER_SCOPE_INVALID");
  for (const action of auth.allowedActionKinds) if (!ALLOWED_ACTIONS.has(action as GovernedActionKind)) fail("REVIEWER_ACTION_INVALID");
  sortedUnique(auth.allowedScopeRefs as string[], "REVIEWER_SCOPE_DUPLICATE");
  sortedUnique(auth.allowedActionKinds as string[], "REVIEWER_ACTION_DUPLICATE");
  if (auth.tierCeiling !== "T1" && auth.tierCeiling !== "T2" && auth.tierCeiling !== "T3") fail("REVIEWER_TIER_INVALID");
  const issuedAt = parseTime(auth.issuedAt, "REVIEWER_AUTH_ISSUED_AT_INVALID");
  const expiresAt = parseTime(auth.expiresAt, "REVIEWER_AUTH_EXPIRES_AT_INVALID");
  if (issuedAt > at || expiresAt <= at) fail("REVIEWER_AUTH_NOT_ACTIVE");
  if (auth.revoked !== false) fail("REVIEWER_AUTH_REVOKED");
  assertOpaque(auth.issuerRef, "issuer", "REVIEWER_AUTH_ISSUER_INVALID");
  if (auth.verificationMode !== "REFERENCE_ONLY_PRE_G0") fail("REVIEWER_AUTH_VERIFICATION_MODE_INVALID");
  assertDigest(auth.authorizationDigest, "REVIEWER_AUTH_DIGEST_INVALID");
  if (auth.authorizationDigest !== computeReviewerAuthorizationDigest(authorizationPayload(auth as unknown as ReviewerAuthorizationV1))) fail("REVIEWER_AUTH_DIGEST_MISMATCH");
  if (auth.tenantRef !== proposal.tenantRef) fail("REVIEWER_TENANT_MISMATCH");
  if (!(auth.allowedScopeRefs as unknown[]).includes(proposal.scopeRef)) fail("REVIEWER_SCOPE_NOT_ALLOWED");
  if (!(auth.allowedActionKinds as unknown[]).includes(proposal.actionKind)) fail("REVIEWER_ACTION_NOT_ALLOWED");
  if (tierValue(auth.tierCeiling as ApprovalTier) < tierValue(proposal.requiredTier)) fail("REVIEWER_TIER_CEILING_EXCEEDED");
}

function executionAuthorizationPayload(auth: IndependentExecutionAuthorizationV1): Omit<IndependentExecutionAuthorizationV1, "authorizationDigest"> {
  const { authorizationDigest: _discarded, ...payload } = auth;
  return payload;
}
export function computeIndependentExecutionAuthorizationDigest(auth: Omit<IndependentExecutionAuthorizationV1, "authorizationDigest">): `sha256:${string}` { return sha(auth); }

interface StoredProposal {
  receipt: GovernedProposalReceiptV1;
  state: ProposalState;
  reviewerAuthorization: ReviewerAuthorizationV1 | null;
  approval: ApprovalReceiptV1 | null;
  externalExecution: ExternalExecutionReceiptV1 | null;
  externalRollback: ExternalRollbackReceiptV1 | null;
  history: AuditEventReceiptV1[];
  revisionChildId: string | null;
}

interface IdempotencyRecord { requestDigest: string; result: unknown; }

export class GovernedAgenticProposalRegistry {
  readonly #clock: AgenticClock;
  readonly #records = new Map<string, StoredProposal>();
  readonly #proposalOwners = new Map<string, string>();
  readonly #eventOwners = new Map<string, string>();
  readonly #evidenceDigestOwners = new Map<string, string>();
  readonly #idempotency = new Map<string, IdempotencyRecord>();
  readonly #approvalIds = new Set<string>();
  readonly #executionIds = new Set<string>();
  readonly #rollbackIds = new Set<string>();

  constructor(clock: AgenticClock = SYSTEM_CLOCK) { this.#clock = clock; }

  createProposal(input: CreateGovernedProposalV1): GovernedProposalReceiptV1 {
    validateProposal(input, this.#clock);
    return this.#withIdempotency(input.tenantRef, input.idempotencyKey, input, () => {
      this.#assertProposalIdentityAvailable(input);
      const activeCount = [...this.#records.values()].filter((record) =>
        record.receipt.tenantRef === input.tenantRef && ACTIVE_STATES.has(record.state)).length;
      if (activeCount >= MAX_ACTIVE_PER_TENANT) fail("TENANT_ACTIVE_PROPOSAL_LIMIT");
      const receipt = this.#buildProposalReceipt(input);
      const creationEvent = this.#buildAuditEvent(receipt, [], {
        eventId: input.creationEventId,
        eventKind: "STATE_TRANSITION",
        fromState: null,
        toState: "AI_PROPOSED",
        actorKind: "AGENT",
        actorRef: input.suggestedByAgentRef,
        reasonRef: "reason:agentic:proposal-created:v1",
        occurredAt: input.createdAt,
      });
      this.#storeNewRecord(receipt, creationEvent);
      return clone(receipt);
    });
  }

  beginHumanReview(command: BeginHumanReviewCommandV1): AuditEventReceiptV1 {
    assertObject(command, "REVIEW_COMMAND_INVALID");
    assertOnlyKeys(command, REVIEW_KEYS, "REVIEW_COMMAND_UNKNOWN_FIELD");
    const record = this.#exactRecord(command.proposalId, command.proposalDigest);
    const at = this.#validateTransitionBase(command, record);
    return this.#withIdempotency(record.receipt.tenantRef, command.idempotencyKey, command, () => {
      if (record.state !== "AI_PROPOSED") fail("REVIEW_STATE_INVALID");
      if (command.actorKind !== "HUMAN") fail("REVIEW_HUMAN_REQUIRED");
      validateReviewerAuthorization(command.reviewerAuthorization, record.receipt, at);
      if (command.actorRef !== command.reviewerAuthorization.reviewerRef) fail("REVIEW_ACTOR_MISMATCH");
      const event = this.#transition(record, command, "HUMAN_REVIEW");
      record.reviewerAuthorization = clone(command.reviewerAuthorization);
      return clone(event);
    });
  }

  approveForAction(command: ApprovalCommandV1): ApprovalReceiptV1 {
    assertObject(command, "APPROVAL_COMMAND_INVALID");
    assertOnlyKeys(command, APPROVAL_KEYS, "APPROVAL_COMMAND_UNKNOWN_FIELD");
    const record = this.#exactRecord(command.proposalId, command.proposalDigest);
    const at = this.#validateTransitionBase(command, record);
    assertOpaque(command.approvalId, "approval", "APPROVAL_ID_INVALID");
    assertDigest(command.reviewedPayloadDigest, "REVIEWED_PAYLOAD_DIGEST_INVALID");
    assertOpaque(command.humanAuthoredRationaleRef, "rationale", "RATIONALE_REF_INVALID");
    return this.#withIdempotency(record.receipt.tenantRef, command.idempotencyKey, command, () => {
      if (record.state !== "HUMAN_REVIEW") fail("APPROVAL_STATE_INVALID");
      if (this.#approvalIds.has(command.approvalId)) fail("APPROVAL_ID_REPLAY");
      if (command.actorKind !== "HUMAN") fail("APPROVAL_HUMAN_REQUIRED");
      validateReviewerAuthorization(command.reviewerAuthorization, record.receipt, at);
      if (!record.reviewerAuthorization || record.reviewerAuthorization.authorizationDigest !== command.reviewerAuthorization.authorizationDigest) fail("APPROVAL_REVIEW_SESSION_MISMATCH");
      if (command.actorRef !== command.reviewerAuthorization.reviewerRef) fail("APPROVAL_ACTOR_MISMATCH");
      if (command.reviewedPayloadDigest !== record.receipt.payloadDigest) fail("APPROVAL_PAYLOAD_DIGEST_MISMATCH");
      const event = this.#transition(record, command, "APPROVED_FOR_ACTION");
      const payload = {
        schemaVersion: GOVERNED_AGENTIC_SCHEMA_VERSION,
        approvalId: command.approvalId,
        proposalId: record.receipt.proposalId,
        proposalDigest: record.receipt.proposalDigest,
        approvedPayloadDigest: record.receipt.payloadDigest,
        tenantRef: record.receipt.tenantRef,
        scopeRef: record.receipt.scopeRef,
        actionKind: record.receipt.actionKind,
        requiredTier: record.receipt.requiredTier,
        reviewerRef: command.reviewerAuthorization.reviewerRef,
        reviewerAuthorizationRef: command.reviewerAuthorization.authorizationRef,
        reviewerAuthorizationDigest: command.reviewerAuthorization.authorizationDigest,
        humanAuthoredRationaleRef: command.humanAuthoredRationaleRef,
        approvalAuditEventDigest: event.eventDigest,
        approvedAt: command.occurredAt,
        reviewOutcome: "APPROVED_FOR_ACTION" as const,
        approvalScope: "SYNTHETIC_PREVIEW_ONLY" as const,
        finalizedEmploymentDecision: false as const,
        executionAuthority: "NONE" as const,
        bearerCredential: false as const,
        requiresIndependentExecutionAuthorization: true as const,
        currentProposalStateCheckRequired: true as const,
        executionPerformedByContract: false as const,
        executionEvidence: null,
        productionEligible: false as const,
      };
      const receipt: ApprovalReceiptV1 = { ...payload, approvalDigest: sha(payload) };
      record.approval = clone(receipt);
      this.#approvalIds.add(command.approvalId);
      return clone(receipt);
    });
  }

  returnForRevision(command: TransitionCommandV1): AuditEventReceiptV1 {
    return this.#simpleTransition(command, new Set(["HUMAN_REVIEW"]), "RETURNED_FOR_REVISION", new Set(["HUMAN"]));
  }

  rejectProposal(command: TransitionCommandV1): AuditEventReceiptV1 {
    const event = this.#simpleTransition(command, new Set(["HUMAN_REVIEW"]), "REJECTED", new Set(["HUMAN"]));
    return clone(event);
  }

  withdraw(command: TransitionCommandV1): AuditEventReceiptV1 {
    const record = this.#exactRecord(command.proposalId, command.proposalDigest);
    if (record.externalExecution) fail("WITHDRAW_AFTER_EXECUTION_NOT_ALLOWED");
    return this.#simpleTransition(command, new Set(["AI_PROPOSED", "HUMAN_REVIEW", "RETURNED_FOR_REVISION", "APPROVED_FOR_ACTION"]), "WITHDRAWN", new Set(["AGENT", "HUMAN", "OWNER"]));
  }

  expire(command: TransitionCommandV1): AuditEventReceiptV1 {
    const record = this.#exactRecord(command.proposalId, command.proposalDigest);
    if (Date.parse(command.occurredAt) < Date.parse(record.receipt.expiresAt)) fail("EXPIRE_BEFORE_TTL");
    return this.#simpleTransition(command, new Set(["AI_PROPOSED", "HUMAN_REVIEW", "RETURNED_FOR_REVISION", "APPROVED_FOR_ACTION"]), "EXPIRED", new Set(["SYSTEM"]));
  }

  createRevision(command: RevisionCommandV1): GovernedProposalReceiptV1 {
    assertObject(command, "REVISION_COMMAND_INVALID");
    assertOnlyKeys(command, REVISION_KEYS, "REVISION_COMMAND_UNKNOWN_FIELD");
    assertOpaque(command.predecessorProposalId, "proposal", "PREDECESSOR_ID_INVALID");
    assertDigest(command.predecessorProposalDigest, "PREDECESSOR_DIGEST_INVALID");
    assertOpaque(command.supersedeEventId, "event", "SUPERSEDE_EVENT_ID_INVALID");
    assertSemantic(command.supersedeReasonRef, "SUPERSEDE_REASON_INVALID");
    assertOpaque(command.idempotencyKey, "idem", "REVISION_IDEMPOTENCY_INVALID");
    const predecessor = this.#exactRecord(command.predecessorProposalId, command.predecessorProposalDigest);
    const at = parseTime(command.occurredAt, "REVISION_TIME_INVALID");
    validateProposal(command.newProposal, this.#clock);
    return this.#withIdempotency(predecessor.receipt.tenantRef, command.idempotencyKey, command, () => {
      if (predecessor.state !== "RETURNED_FOR_REVISION") fail("REVISION_STATE_INVALID");
      if (predecessor.revisionChildId) fail("REVISION_FORK_NOT_ALLOWED");
      const next = command.newProposal;
      if (next.supersedesProposalId !== predecessor.receipt.proposalId || next.supersedesProposalDigest !== predecessor.receipt.proposalDigest) fail("REVISION_PREDECESSOR_MISMATCH");
      if (next.tenantRef !== predecessor.receipt.tenantRef || next.scopeRef !== predecessor.receipt.scopeRef || next.actionKind !== predecessor.receipt.actionKind) fail("REVISION_SCOPE_MISMATCH");
      if (next.payloadDigest === predecessor.receipt.payloadDigest) fail("REVISION_PAYLOAD_MUST_CHANGE");
      if (Date.parse(next.createdAt) < at) fail("REVISION_TIME_ORDER_INVALID");
      this.#assertProposalIdentityAvailable(next);
      const nextReceipt = this.#buildProposalReceipt(next);
      const oldEvent = this.#buildAuditEvent(predecessor.receipt, predecessor.history, {
        eventId: command.supersedeEventId,
        eventKind: "STATE_TRANSITION",
        fromState: "RETURNED_FOR_REVISION",
        toState: "SUPERSEDED",
        actorKind: "SYSTEM",
        actorRef: "system_aaaaaaaaaaaaaaaa",
        reasonRef: command.supersedeReasonRef,
        occurredAt: command.occurredAt,
      });
      const newEvent = this.#buildAuditEvent(nextReceipt, [], {
        eventId: next.creationEventId,
        eventKind: "STATE_TRANSITION",
        fromState: null,
        toState: "AI_PROPOSED",
        actorKind: "AGENT",
        actorRef: next.suggestedByAgentRef,
        reasonRef: "reason:agentic:revision-created:v1",
        occurredAt: next.createdAt,
      });
      predecessor.history.push(clone(oldEvent));
      predecessor.state = "SUPERSEDED";
      predecessor.revisionChildId = next.proposalId;
      this.#registerEvent(oldEvent);
      this.#storeNewRecord(nextReceipt, newEvent);
      return clone(nextReceipt);
    });
  }

  recordExternalExecution(command: ExternalExecutionCommandV1): ExternalExecutionReceiptV1 {
    assertObject(command, "EXECUTION_COMMAND_INVALID");
    assertOnlyKeys(command, EXECUTION_KEYS, "EXECUTION_COMMAND_UNKNOWN_FIELD");
    const record = this.#exactRecord(command.proposalId, command.proposalDigest);
    assertOpaque(command.executionId, "execution", "EXECUTION_ID_INVALID");
    assertDigest(command.payloadDigest, "EXECUTION_PAYLOAD_DIGEST_INVALID");
    assertOpaque(command.approvalId, "approval", "EXECUTION_APPROVAL_ID_INVALID");
    assertDigest(command.approvalDigest, "EXECUTION_APPROVAL_DIGEST_INVALID");
    assertOpaque(command.recordingSystemRef, "system", "EXECUTION_RECORDING_SYSTEM_REF_INVALID");
    assertOpaque(command.externalSystemRef, "external", "EXTERNAL_SYSTEM_REF_INVALID");
    assertOpaque(command.externalEvidenceRef, "evidence", "EXTERNAL_EVIDENCE_REF_INVALID");
    assertDigest(command.externalEvidenceDigest, "EXTERNAL_EVIDENCE_DIGEST_INVALID");
    assertOpaque(command.eventId, "event", "EXECUTION_EVENT_ID_INVALID");
    assertOpaque(command.idempotencyKey, "idem", "EXECUTION_IDEMPOTENCY_INVALID");
    const at = parseTime(command.occurredAt, "EXECUTION_TIME_INVALID");
    if (at > this.#clock.now().getTime()) fail("EXECUTION_TIME_IN_FUTURE");
    if (at >= Date.parse(record.receipt.expiresAt)) fail("EXECUTION_PROPOSAL_EXPIRED");
    return this.#withIdempotency(record.receipt.tenantRef, command.idempotencyKey, command, () => {
      if (record.state !== "APPROVED_FOR_ACTION" || !record.approval) fail("EXECUTION_APPROVAL_REQUIRED");
      if (record.externalExecution) fail("EXECUTION_ALREADY_RECORDED");
      if (this.#executionIds.has(command.executionId)) fail("EXECUTION_ID_REPLAY");
      if (this.#evidenceDigestOwners.has(command.externalEvidenceDigest)) fail("EXTERNAL_EVIDENCE_DIGEST_REPLAY");
      if (command.payloadDigest !== record.receipt.payloadDigest || command.approvalId !== record.approval.approvalId || command.approvalDigest !== record.approval.approvalDigest) fail("EXECUTION_LINEAGE_MISMATCH");
      this.#validateExecutionAuthorization(command.independentAuthorization, record, at);
      const event = this.#appendObservation(record, command.eventId, "EXTERNAL_EXECUTION_RECORDED", command.occurredAt, "SYSTEM", command.recordingSystemRef, "reason:agentic:external-execution-recorded:v1");
      const payload = {
        schemaVersion: GOVERNED_AGENTIC_SCHEMA_VERSION,
        executionId: command.executionId,
        proposalId: record.receipt.proposalId,
        proposalDigest: record.receipt.proposalDigest,
        payloadDigest: record.receipt.payloadDigest,
        approvalId: record.approval.approvalId,
        approvalDigest: record.approval.approvalDigest,
        independentAuthorizationRef: command.independentAuthorization.authorizationRef,
        independentAuthorizationDigest: command.independentAuthorization.authorizationDigest,
        externalSystemRef: command.externalSystemRef,
        externalEvidenceRef: command.externalEvidenceRef,
        externalEvidenceDigest: command.externalEvidenceDigest,
        occurredAt: command.occurredAt,
        observation: "EXTERNAL_EXECUTION_RECORDED" as const,
        executionPerformedByContract: false as const,
        executionAuthorityGrantedByContract: false as const,
        auditEventDigest: event.eventDigest,
      };
      const receipt: ExternalExecutionReceiptV1 = { ...payload, executionReceiptDigest: sha(payload) };
      record.externalExecution = clone(receipt);
      this.#executionIds.add(command.executionId);
      this.#evidenceDigestOwners.set(command.externalEvidenceDigest, record.receipt.proposalId);
      return clone(receipt);
    });
  }

  recordExternalRollback(command: ExternalRollbackCommandV1): ExternalRollbackReceiptV1 {
    assertObject(command, "ROLLBACK_COMMAND_INVALID");
    assertOnlyKeys(command, ROLLBACK_KEYS, "ROLLBACK_COMMAND_UNKNOWN_FIELD");
    const record = this.#exactRecord(command.proposalId, command.proposalDigest);
    assertOpaque(command.rollbackId, "rollbackreceipt", "ROLLBACK_ID_INVALID");
    assertDigest(command.payloadDigest, "ROLLBACK_PAYLOAD_DIGEST_INVALID");
    assertDigest(command.approvalDigest, "ROLLBACK_APPROVAL_DIGEST_INVALID");
    assertOpaque(command.executionId, "execution", "ROLLBACK_EXECUTION_ID_INVALID");
    assertDigest(command.executionReceiptDigest, "ROLLBACK_EXECUTION_DIGEST_INVALID");
    assertOpaque(command.rollbackPlanRef, "rollback", "ROLLBACK_PLAN_REF_INVALID");
    assertDigest(command.rollbackPlanDigest, "ROLLBACK_PLAN_DIGEST_INVALID");
    assertOpaque(command.rollbackEvidenceRef, "evidence", "ROLLBACK_EVIDENCE_REF_INVALID");
    assertDigest(command.rollbackEvidenceDigest, "ROLLBACK_EVIDENCE_DIGEST_INVALID");
    assertOpaque(command.eventId, "event", "ROLLBACK_EVENT_ID_INVALID");
    assertOpaque(command.idempotencyKey, "idem", "ROLLBACK_IDEMPOTENCY_INVALID");
    const at = parseTime(command.occurredAt, "ROLLBACK_TIME_INVALID");
    if (at > this.#clock.now().getTime()) fail("ROLLBACK_TIME_IN_FUTURE");
    return this.#withIdempotency(record.receipt.tenantRef, command.idempotencyKey, command, () => {
      if (!record.externalExecution || !record.approval) fail("ROLLBACK_EXECUTION_REQUIRED");
      if (record.externalRollback) fail("ROLLBACK_ALREADY_RECORDED");
      if (this.#rollbackIds.has(command.rollbackId)) fail("ROLLBACK_ID_REPLAY");
      if (this.#evidenceDigestOwners.has(command.rollbackEvidenceDigest)) fail("ROLLBACK_EVIDENCE_DIGEST_REPLAY");
      if (command.executionId !== record.externalExecution.executionId || command.executionReceiptDigest !== record.externalExecution.executionReceiptDigest || command.approvalDigest !== record.approval.approvalDigest || command.payloadDigest !== record.receipt.payloadDigest || command.rollbackPlanRef !== record.receipt.rollbackPlanRef || command.rollbackPlanDigest !== record.receipt.rollbackPlanDigest) fail("ROLLBACK_LINEAGE_MISMATCH");
      validateReviewerAuthorization(command.humanAuthorization, record.receipt, at);
      if (!record.reviewerAuthorization || record.reviewerAuthorization.authorizationDigest !== command.humanAuthorization.authorizationDigest) fail("ROLLBACK_REVIEW_SESSION_MISMATCH");
      const event = this.#appendObservation(record, command.eventId, "EXTERNAL_ROLLBACK_ATTESTED", command.occurredAt, "HUMAN", command.humanAuthorization.reviewerRef, "reason:agentic:external-rollback-attested:v1");
      const payload = {
        schemaVersion: GOVERNED_AGENTIC_SCHEMA_VERSION,
        rollbackId: command.rollbackId,
        proposalId: record.receipt.proposalId,
        executionId: record.externalExecution.executionId,
        executionReceiptDigest: record.externalExecution.executionReceiptDigest,
        approvalDigest: record.approval.approvalDigest,
        payloadDigest: record.receipt.payloadDigest,
        rollbackPlanRef: record.receipt.rollbackPlanRef,
        rollbackPlanDigest: record.receipt.rollbackPlanDigest,
        humanAuthorizationRef: command.humanAuthorization.authorizationRef,
        humanAuthorizationDigest: command.humanAuthorization.authorizationDigest,
        rollbackEvidenceRef: command.rollbackEvidenceRef,
        rollbackEvidenceDigest: command.rollbackEvidenceDigest,
        occurredAt: command.occurredAt,
        observation: "EXTERNAL_ROLLBACK_ATTESTED" as const,
        rollbackPerformedByContract: false as const,
        proposalReactivated: false as const,
        newExecutionAuthorityCreated: false as const,
        auditEventDigest: event.eventDigest,
      };
      const receipt: ExternalRollbackReceiptV1 = { ...payload, rollbackReceiptDigest: sha(payload) };
      record.externalRollback = clone(receipt);
      this.#rollbackIds.add(command.rollbackId);
      this.#evidenceDigestOwners.set(command.rollbackEvidenceDigest, record.receipt.proposalId);
      return clone(receipt);
    });
  }

  getSnapshot(proposalId: `proposal_${string}`): ProposalSnapshotV1 | null {
    const record = this.#records.get(proposalId);
    if (!record) return null;
    return clone({ proposal: record.receipt, state: record.state, approval: record.approval, externalExecution: record.externalExecution, externalRollback: record.externalRollback, history: record.history });
  }

  history(proposalId: `proposal_${string}`): readonly AuditEventReceiptV1[] {
    return clone(this.#records.get(proposalId)?.history ?? []);
  }

  #buildProposalReceipt(input: CreateGovernedProposalV1): GovernedProposalReceiptV1 {
    const base = { ...clone(input), requiredTier: exactTier(input.actionKind), initialState: "AI_PROPOSED" as const, immutable: true as const };
    return { ...base, proposalDigest: sha(base) };
  }

  #assertProposalIdentityAvailable(input: CreateGovernedProposalV1): void {
    if (this.#records.has(input.proposalId) || this.#proposalOwners.has(input.proposalId)) fail("PROPOSAL_ID_REPLAY");
    if (this.#eventOwners.has(input.creationEventId)) fail("EVENT_ID_REPLAY");
    for (const evidence of input.sourceEvidence) if (this.#evidenceDigestOwners.has(evidence.evidenceDigest)) fail("EVIDENCE_DIGEST_REPLAY");
  }

  #storeNewRecord(receipt: GovernedProposalReceiptV1, event: AuditEventReceiptV1): void {
    this.#records.set(receipt.proposalId, { receipt: clone(receipt), state: "AI_PROPOSED", reviewerAuthorization: null, approval: null, externalExecution: null, externalRollback: null, history: [clone(event)], revisionChildId: null });
    this.#proposalOwners.set(receipt.proposalId, receipt.tenantRef);
    for (const evidence of receipt.sourceEvidence) this.#evidenceDigestOwners.set(evidence.evidenceDigest, receipt.proposalId);
    this.#registerEvent(event);
  }

  #registerEvent(event: AuditEventReceiptV1): void {
    if (this.#eventOwners.has(event.eventId)) fail("EVENT_ID_REPLAY");
    this.#eventOwners.set(event.eventId, event.proposalId);
  }

  #exactRecord(proposalId: string, proposalDigest: string): StoredProposal {
    assertOpaque(proposalId, "proposal", "PROPOSAL_ID_INVALID");
    assertDigest(proposalDigest, "PROPOSAL_DIGEST_INVALID");
    const record = this.#records.get(proposalId);
    if (!record) fail("PROPOSAL_NOT_FOUND");
    if (record.receipt.proposalDigest !== proposalDigest) fail("PROPOSAL_DIGEST_MISMATCH");
    return record;
  }

  #validateTransitionBase(command: TransitionCommandV1, record: StoredProposal): number {
    assertOpaque(command.eventId, "event", "TRANSITION_EVENT_ID_INVALID");
    assertOpaque(command.idempotencyKey, "idem", "TRANSITION_IDEMPOTENCY_INVALID");
    if (command.actorKind !== "AGENT" && command.actorKind !== "HUMAN" && command.actorKind !== "OWNER" && command.actorKind !== "SYSTEM") fail("ACTOR_KIND_INVALID");
    assertOpaque(command.actorRef, command.actorKind === "AGENT" ? "agent" : command.actorKind === "HUMAN" ? "reviewer" : command.actorKind === "OWNER" ? "owner" : "system", "ACTOR_REF_INVALID");
    assertSemantic(command.reasonRef, "TRANSITION_REASON_INVALID");
    const at = parseTime(command.occurredAt, "TRANSITION_TIME_INVALID");
    if (at > this.#clock.now().getTime()) fail("TRANSITION_IN_FUTURE");
    if (this.#hasExactIdempotency(record.receipt.tenantRef, command.idempotencyKey, command)) return at;
    const previous = record.history.at(-1);
    if (previous && at <= Date.parse(previous.occurredAt)) fail("TRANSITION_TIME_NOT_MONOTONIC");
    if (record.state !== "EXPIRED" && at >= Date.parse(record.receipt.expiresAt) && command.actorKind !== "SYSTEM") fail("PROPOSAL_EXPIRED");
    return at;
  }

  #simpleTransition(command: TransitionCommandV1, from: ReadonlySet<ProposalState>, to: ProposalState, actors: ReadonlySet<ActorKind>): AuditEventReceiptV1 {
    assertObject(command, "TRANSITION_COMMAND_INVALID");
    assertOnlyKeys(command, TRANSITION_KEYS, "TRANSITION_COMMAND_UNKNOWN_FIELD");
    const record = this.#exactRecord(command.proposalId, command.proposalDigest);
    this.#validateTransitionBase(command, record);
    return this.#withIdempotency(record.receipt.tenantRef, command.idempotencyKey, command, () => {
      if (TERMINAL_STATES.has(record.state) || !from.has(record.state)) fail("TRANSITION_STATE_INVALID");
      if (!actors.has(command.actorKind)) fail("TRANSITION_ACTOR_NOT_ALLOWED");
      if (command.actorKind === "HUMAN" && record.reviewerAuthorization?.reviewerRef !== command.actorRef) fail("TRANSITION_REVIEW_SESSION_MISMATCH");
      return clone(this.#transition(record, command, to));
    });
  }

  #transition(record: StoredProposal, command: TransitionCommandV1, to: ProposalState): AuditEventReceiptV1 {
    const event = this.#buildAuditEvent(record.receipt, record.history, { eventId: command.eventId, eventKind: "STATE_TRANSITION", fromState: record.state, toState: to, actorKind: command.actorKind, actorRef: command.actorRef, reasonRef: command.reasonRef, occurredAt: command.occurredAt });
    this.#registerEvent(event);
    record.history.push(clone(event));
    record.state = to;
    return event;
  }

  #appendObservation(record: StoredProposal, eventId: `event_${string}`, kind: "EXTERNAL_EXECUTION_RECORDED" | "EXTERNAL_ROLLBACK_ATTESTED", occurredAt: string, actorKind: "HUMAN" | "SYSTEM", actorRef: string, reasonRef: string): AuditEventReceiptV1 {
    const previous = record.history.at(-1);
    const at = parseTime(occurredAt, "OBSERVATION_TIME_INVALID");
    if (previous && at <= Date.parse(previous.occurredAt)) fail("OBSERVATION_TIME_NOT_MONOTONIC");
    assertOpaque(actorRef, actorKind === "HUMAN" ? "reviewer" : "system", "OBSERVATION_ACTOR_REF_INVALID");
    const event = this.#buildAuditEvent(record.receipt, record.history, { eventId, eventKind: kind, fromState: record.state, toState: record.state, actorKind, actorRef, reasonRef, occurredAt });
    this.#registerEvent(event);
    record.history.push(clone(event));
    return event;
  }

  #buildAuditEvent(receipt: GovernedProposalReceiptV1, history: readonly AuditEventReceiptV1[], data: Omit<AuditEventReceiptV1, "schemaVersion" | "proposalId" | "proposalDigest" | "payloadDigest" | "sequence" | "previousEventDigest" | "eventDigest">): AuditEventReceiptV1 {
    if (this.#eventOwners.has(data.eventId)) fail("EVENT_ID_REPLAY");
    const previous = history.at(-1) ?? null;
    const payload = { schemaVersion: GOVERNED_AGENTIC_SCHEMA_VERSION, eventId: data.eventId, proposalId: receipt.proposalId, proposalDigest: receipt.proposalDigest, payloadDigest: receipt.payloadDigest, eventKind: data.eventKind, fromState: data.fromState, toState: data.toState, actorKind: data.actorKind, actorRef: data.actorRef, reasonRef: data.reasonRef, occurredAt: data.occurredAt, sequence: history.length + 1, previousEventDigest: previous?.eventDigest ?? null };
    return { ...payload, eventDigest: sha(payload) };
  }

  #validateExecutionAuthorization(auth: unknown, record: StoredProposal, at: number): asserts auth is IndependentExecutionAuthorizationV1 {
    assertObject(auth, "EXECUTION_AUTH_INVALID");
    assertOnlyKeys(auth, EXEC_AUTH_KEYS, "EXECUTION_AUTH_UNKNOWN_FIELD");
    assertOpaque(auth.authorizationRef, "executionauth", "EXECUTION_AUTH_REF_INVALID");
    assertOpaque(auth.tenantRef, "tenant", "EXECUTION_AUTH_TENANT_INVALID");
    assertOpaque(auth.scopeRef, "scope", "EXECUTION_AUTH_SCOPE_INVALID");
    if (!ALLOWED_ACTIONS.has(auth.actionKind as GovernedActionKind)) fail("EXECUTION_AUTH_ACTION_INVALID");
    assertOpaque(auth.proposalId, "proposal", "EXECUTION_AUTH_PROPOSAL_INVALID");
    assertDigest(auth.proposalDigest, "EXECUTION_AUTH_PROPOSAL_DIGEST_INVALID");
    assertDigest(auth.payloadDigest, "EXECUTION_AUTH_PAYLOAD_DIGEST_INVALID");
    const issued = parseTime(auth.issuedAt, "EXECUTION_AUTH_ISSUED_INVALID");
    const expires = parseTime(auth.expiresAt, "EXECUTION_AUTH_EXPIRES_INVALID");
    if (issued > at || expires <= at || auth.revoked !== false) fail("EXECUTION_AUTH_NOT_ACTIVE");
    assertOpaque(auth.issuerRef, "issuer", "EXECUTION_AUTH_ISSUER_INVALID");
    if (auth.verificationMode !== "REFERENCE_ONLY_PRE_G0") fail("EXECUTION_AUTH_VERIFICATION_MODE_INVALID");
    assertDigest(auth.authorizationDigest, "EXECUTION_AUTH_DIGEST_INVALID");
    if (auth.authorizationDigest !== computeIndependentExecutionAuthorizationDigest(executionAuthorizationPayload(auth as unknown as IndependentExecutionAuthorizationV1))) fail("EXECUTION_AUTH_DIGEST_MISMATCH");
    if (auth.tenantRef !== record.receipt.tenantRef || auth.scopeRef !== record.receipt.scopeRef || auth.actionKind !== record.receipt.actionKind || auth.proposalId !== record.receipt.proposalId || auth.proposalDigest !== record.receipt.proposalDigest || auth.payloadDigest !== record.receipt.payloadDigest) fail("EXECUTION_AUTH_LINEAGE_MISMATCH");
  }

  #withIdempotency<T>(tenantRef: string, key: string, request: unknown, producer: () => T): T {
    const mapKey = `${tenantRef}\u0000${key}`;
    const requestDigest = sha(request);
    const existing = this.#idempotency.get(mapKey);
    if (existing) {
      if (existing.requestDigest !== requestDigest) fail("IDEMPOTENCY_CONFLICT");
      return clone(existing.result as T);
    }
    const result = producer();
    this.#idempotency.set(mapKey, { requestDigest, result: clone(result) });
    return clone(result);
  }

  #hasExactIdempotency(tenantRef: string, key: string, request: unknown): boolean {
    const existing = this.#idempotency.get(`${tenantRef}\u0000${key}`);
    if (!existing) return false;
    if (existing.requestDigest !== sha(request)) fail("IDEMPOTENCY_CONFLICT");
    return true;
  }
}
