import { createHash } from "node:crypto";

export const CITATION_BACKED_COACHING_SCHEMA_VERSION =
  "citation-backed-coaching/v1" as const;

export type CoachingEvidenceType =
  | "interview_response"
  | "work_sample"
  | "portfolio"
  | "reference_check";

export type CoachingEntailment =
  | "SUPPORTED"
  | "NOT_SUPPORTED"
  | "INSUFFICIENT";

export type CoachingSuggestionKind =
  | "RUBRIC_COVERAGE_FOLLOW_UP"
  | "EVIDENCE_GAP_REVIEW"
  | "UNSUPPORTED_CLAIM_REVIEW"
  | "PROCESS_PERSPECTIVE_FOLLOW_UP";

export type CoachingQualitySignalKind =
  | "RUBRIC_COVERAGE"
  | "EVIDENCE_GAP"
  | "CONTENT_CONSISTENCY"
  | "PROCESS_PERSPECTIVE_COVERAGE";

export type CoachingQualitySignalState =
  | "OBSERVED"
  | "NOT_OBSERVED"
  | "INSUFFICIENT_EVIDENCE";

export interface CoachingEvidenceV1 {
  readonly tenantRef: string;
  readonly interviewRef: `interview_${string}`;
  readonly evidenceRef: `evidence_${string}`;
  readonly citationRef: `citation_${string}`;
  readonly criterionRef: `criterion_${string}`;
  readonly evidenceType: CoachingEvidenceType;
  readonly entailment: CoachingEntailment;
  readonly sourceSegmentRefs: readonly `segment_${string}`[];
  readonly provenanceRef: string;
  readonly lexicalOnly: true;
}

export interface CoachingSuggestionV1 {
  readonly suggestionRef: `suggestion_${string}`;
  readonly kind: CoachingSuggestionKind;
  readonly templateRef: string;
  readonly criterionRef: `criterion_${string}`;
  readonly citationRefs: readonly `citation_${string}`[];
}

export interface CoachingQualitySignalV1 {
  readonly signalRef: `signal_${string}`;
  readonly kind: CoachingQualitySignalKind;
  readonly state: CoachingQualitySignalState;
  readonly criterionRef: `criterion_${string}`;
  readonly citationRefs: readonly `citation_${string}`[];
  readonly sessionLevelOnly: true;
}

export interface CreateSyntheticCoachingProposalV1 {
  readonly schemaVersion: typeof CITATION_BACKED_COACHING_SCHEMA_VERSION;
  readonly synthetic: true;
  readonly tenantRef: string;
  readonly interviewRef: `interview_${string}`;
  readonly proposalId: `proposal_${string}`;
  readonly rubricVersionRef: string;
  readonly criterionRefs: readonly `criterion_${string}`[];
  readonly aiOutputVersionRef: string;
  readonly humanOversightStandardRef: "human-oversight:canonical:v1";
  readonly provenanceChainRef: string;
  readonly containsRawPii: false;
  readonly containsRawProtectedAttributes: false;
  readonly evidenceInventory: readonly CoachingEvidenceV1[];
  readonly suggestions: readonly CoachingSuggestionV1[];
  readonly qualitySignals: readonly CoachingQualitySignalV1[];
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly oversightState: "AI_SUGGESTED";
  readonly proposalOnly: true;
  readonly humanReviewRequired: true;
  readonly humanRationaleRequired: true;
  readonly appealPathRef: string;
  readonly correctionPathRef: string;
  readonly auditLineageRefs: readonly string[];
  readonly actionAllowed: false;
  readonly individualDecisionAllowed: false;
  readonly autoExecute: false;
  readonly batchApproval: false;
  readonly mutationAllowed: false;
  readonly verdict: "NONE";
  readonly evidenceGate: "SYNTHETIC_EVIDENCE_ONLY";
  readonly legalGate: "NOT_MET";
  readonly independentAuditGate: "NOT_MET";
  readonly ownerGate: "NOT_MET";
  readonly productionEligible: false;
}

export type SyntheticCoachingProposalReceiptV1 =
  CreateSyntheticCoachingProposalV1 & {
    readonly proposalDigest: `sha256:${string}`;
  };

export interface CoachingCorrectionRequestV1 {
  readonly correctionId: `correction_${string}`;
  readonly tenantRef: string;
  readonly interviewRef: `interview_${string}`;
  readonly proposalId: `proposal_${string}`;
  readonly proposalDigest: `sha256:${string}`;
  readonly aiOutputVersionRef: string;
  readonly humanRequesterRef: string;
  readonly correctionReasonRef: string;
  readonly requestedAt: string;
  readonly requestedTransition: "CORRECTION_REVIEW_ONLY";
  readonly actionRequested: false;
  readonly finalizeRequested: false;
}

export interface CoachingCorrectionReceiptV1 {
  readonly schemaVersion: typeof CITATION_BACKED_COACHING_SCHEMA_VERSION;
  readonly correctionId: `correction_${string}`;
  readonly tenantRef: string;
  readonly interviewRef: `interview_${string}`;
  readonly proposalId: `proposal_${string}`;
  readonly proposalDigest: `sha256:${string}`;
  readonly aiOutputVersionRef: string;
  readonly humanRequesterRef: string;
  readonly correctionReasonRef: string;
  readonly requestedAt: string;
  readonly disposition: "CORRECTION_REVIEW_REQUESTED";
  readonly oversightState: "AI_SUGGESTED";
  readonly proposalMutated: false;
  readonly actionApplied: false;
  readonly finalized: false;
  readonly productionEligible: false;
  readonly correctionDigest: `sha256:${string}`;
}

export interface CoachingClock {
  now(): Date;
}

const REF = /^[A-Za-z][A-Za-z0-9._:/-]{2,199}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const OPAQUE = {
  interview: /^interview_[a-f0-9]{16}$/,
  proposal: /^proposal_[a-f0-9]{16}$/,
  evidence: /^evidence_[a-f0-9]{16}$/,
  citation: /^citation_[a-f0-9]{16}$/,
  criterion: /^criterion_[a-f0-9]{16}$/,
  segment: /^segment_[a-f0-9]{16}$/,
  suggestion: /^suggestion_[a-f0-9]{16}$/,
  signal: /^signal_[a-f0-9]{16}$/,
  correction: /^correction_[a-f0-9]{16}$/,
} as const;
const MAX_EVIDENCE = 50;
const MAX_SUGGESTIONS = 20;
const MAX_SIGNALS = 20;
const MAX_CITATIONS_PER_ITEM = 10;
const MAX_SOURCE_SEGMENTS = 10;
const MAX_TTL_MS = 168 * 60 * 60 * 1000;

const EVIDENCE_TYPES = new Set<CoachingEvidenceType>([
  "interview_response",
  "work_sample",
  "portfolio",
  "reference_check",
]);
const ENTAILMENTS = new Set<CoachingEntailment>([
  "SUPPORTED",
  "NOT_SUPPORTED",
  "INSUFFICIENT",
]);
const SUGGESTION_KINDS = new Set<CoachingSuggestionKind>([
  "RUBRIC_COVERAGE_FOLLOW_UP",
  "EVIDENCE_GAP_REVIEW",
  "UNSUPPORTED_CLAIM_REVIEW",
  "PROCESS_PERSPECTIVE_FOLLOW_UP",
]);
const SIGNAL_KINDS = new Set<CoachingQualitySignalKind>([
  "RUBRIC_COVERAGE",
  "EVIDENCE_GAP",
  "CONTENT_CONSISTENCY",
  "PROCESS_PERSPECTIVE_COVERAGE",
]);
const SIGNAL_STATES = new Set<CoachingQualitySignalState>([
  "OBSERVED",
  "NOT_OBSERVED",
  "INSUFFICIENT_EVIDENCE",
]);
const TEMPLATE_BY_KIND: Readonly<Record<CoachingSuggestionKind, string>> = {
  RUBRIC_COVERAGE_FOLLOW_UP: "template:coaching:rubric-coverage-follow-up:v1",
  EVIDENCE_GAP_REVIEW: "template:coaching:evidence-gap-review:v1",
  UNSUPPORTED_CLAIM_REVIEW: "template:coaching:unsupported-claim-review:v1",
  PROCESS_PERSPECTIVE_FOLLOW_UP:
    "template:coaching:process-perspective-follow-up:v1",
};

const FORBIDDEN_KEYS = new Set([
  "candidateId",
  "employeeId",
  "personName",
  "freeText",
  "text",
  "content",
  "message",
  "description",
  "summary",
  "feedback",
  "coachingText",
  "suggestionText",
  "transcriptText",
  "audioWaveform",
  "voiceTone",
  "voiceStress",
  "prosody",
  "videoPixel",
  "facial",
  "biometricSignal",
  "protectedAttribute",
  "protectedProxy",
  "affect",
  "emotion",
  "personality",
  "deception",
  "numericScore",
  "rating",
  "ranking",
  "candidateRank",
  "hireDecision",
  "rejectDecision",
  "approvalReceipt",
]);

function invariant(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function assertOnlyKeys(value: object, allowed: readonly string[], code: string): void {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(value)) invariant(allowedKeys.has(key), `${code}:${key}`);
}

function assertNoForbiddenKeys(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) assertNoForbiddenKeys(item);
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    invariant(!FORBIDDEN_KEYS.has(key), `FORBIDDEN_FIELD:${key}`);
    assertNoForbiddenKeys(nested);
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonical(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: unknown): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(canonical(value)).digest("hex")}`;
}

function parseIso(value: string, code: string): number {
  const parsed = Date.parse(value);
  invariant(Number.isFinite(parsed) && value.endsWith("Z"), code);
  return parsed;
}

function unique<T>(values: readonly T[]): boolean {
  return new Set(values).size === values.length;
}

function refValid(value: unknown): value is string {
  return typeof value === "string" && REF.test(value);
}

function assertRefs(values: readonly string[], code: string, max: number): void {
  invariant(values.length > 0 && values.length <= max, code);
  invariant(unique(values) && values.every(refValid), code);
}

function validateProposal(
  input: CreateSyntheticCoachingProposalV1,
  clock: CoachingClock,
): void {
  assertNoForbiddenKeys(input);
  assertOnlyKeys(
    input,
    [
      "schemaVersion",
      "synthetic",
      "tenantRef",
      "interviewRef",
      "proposalId",
      "rubricVersionRef",
      "criterionRefs",
      "aiOutputVersionRef",
      "humanOversightStandardRef",
      "provenanceChainRef",
      "containsRawPii",
      "containsRawProtectedAttributes",
      "evidenceInventory",
      "suggestions",
      "qualitySignals",
      "createdAt",
      "expiresAt",
      "oversightState",
      "proposalOnly",
      "humanReviewRequired",
      "humanRationaleRequired",
      "appealPathRef",
      "correctionPathRef",
      "auditLineageRefs",
      "actionAllowed",
      "individualDecisionAllowed",
      "autoExecute",
      "batchApproval",
      "mutationAllowed",
      "verdict",
      "evidenceGate",
      "legalGate",
      "independentAuditGate",
      "ownerGate",
      "productionEligible",
    ],
    "PROPOSAL_UNKNOWN_FIELD",
  );
  invariant(input.schemaVersion === CITATION_BACKED_COACHING_SCHEMA_VERSION, "SCHEMA_VERSION_UNSUPPORTED");
  invariant(input.synthetic === true, "SYNTHETIC_ONLY");
  invariant(refValid(input.tenantRef), "TENANT_REF_INVALID");
  invariant(OPAQUE.interview.test(input.interviewRef), "INTERVIEW_REF_NOT_OPAQUE");
  invariant(OPAQUE.proposal.test(input.proposalId), "PROPOSAL_ID_NOT_OPAQUE");
  invariant(refValid(input.rubricVersionRef), "RUBRIC_VERSION_REF_INVALID");
  invariant(
    input.criterionRefs.length > 0 &&
      input.criterionRefs.length <= 50 &&
      unique(input.criterionRefs) &&
      input.criterionRefs.every((item) => OPAQUE.criterion.test(item)),
    "CRITERION_REFS_INVALID",
  );
  invariant(refValid(input.aiOutputVersionRef), "AI_OUTPUT_VERSION_REF_INVALID");
  invariant(input.humanOversightStandardRef === "human-oversight:canonical:v1", "HUMAN_OVERSIGHT_STANDARD_INVALID");
  invariant(refValid(input.provenanceChainRef), "PROVENANCE_CHAIN_REF_INVALID");
  invariant(input.containsRawPii === false, "RAW_PII_DISALLOWED");
  invariant(input.containsRawProtectedAttributes === false, "RAW_PROTECTED_ATTRIBUTES_DISALLOWED");

  const createdAt = parseIso(input.createdAt, "CREATED_AT_INVALID");
  const expiresAt = parseIso(input.expiresAt, "EXPIRES_AT_INVALID");
  const now = clock.now().getTime();
  invariant(createdAt <= now, "CREATED_AT_IN_FUTURE");
  invariant(expiresAt > now, "PROPOSAL_EXPIRED");
  invariant(expiresAt > createdAt && expiresAt - createdAt <= MAX_TTL_MS, "PROPOSAL_TTL_INVALID");

  invariant(input.oversightState === "AI_SUGGESTED", "OVERSIGHT_STATE_INVALID");
  invariant(input.proposalOnly === true, "PROPOSAL_ONLY_REQUIRED");
  invariant(input.humanReviewRequired === true && input.humanRationaleRequired === true, "HUMAN_REVIEW_REQUIRED");
  invariant(input.actionAllowed === false && input.individualDecisionAllowed === false, "ACTION_DISALLOWED");
  invariant(input.autoExecute === false && input.batchApproval === false && input.mutationAllowed === false, "AUTOMATION_DISALLOWED");
  invariant(input.verdict === "NONE", "VERDICT_DISALLOWED");
  invariant(input.evidenceGate === "SYNTHETIC_EVIDENCE_ONLY", "EVIDENCE_GATE_INVALID");
  invariant(
    input.legalGate === "NOT_MET" &&
      input.independentAuditGate === "NOT_MET" &&
      input.ownerGate === "NOT_MET",
    "ACCEPTANCE_GATE_INVALID",
  );
  invariant(input.productionEligible === false, "PRODUCTION_ELIGIBILITY_DISALLOWED");
  invariant(refValid(input.appealPathRef), "APPEAL_PATH_REF_REQUIRED");
  invariant(refValid(input.correctionPathRef), "CORRECTION_PATH_REF_REQUIRED");
  assertRefs(input.auditLineageRefs, "AUDIT_LINEAGE_REFS_INVALID", 10);

  invariant(input.evidenceInventory.length > 0 && input.evidenceInventory.length <= MAX_EVIDENCE, "EVIDENCE_COUNT_INVALID");
  for (const evidence of input.evidenceInventory) {
    assertOnlyKeys(
      evidence,
      [
        "tenantRef",
        "interviewRef",
        "evidenceRef",
        "citationRef",
        "criterionRef",
        "evidenceType",
        "entailment",
        "sourceSegmentRefs",
        "provenanceRef",
        "lexicalOnly",
      ],
      "EVIDENCE_UNKNOWN_FIELD",
    );
    invariant(evidence.tenantRef === input.tenantRef, "EVIDENCE_TENANT_SCOPE_MISMATCH");
    invariant(evidence.interviewRef === input.interviewRef, "EVIDENCE_INTERVIEW_SCOPE_MISMATCH");
    invariant(OPAQUE.evidence.test(evidence.evidenceRef), "EVIDENCE_REF_NOT_OPAQUE");
    invariant(OPAQUE.citation.test(evidence.citationRef), "CITATION_REF_NOT_OPAQUE");
    invariant(OPAQUE.criterion.test(evidence.criterionRef), "CRITERION_REF_NOT_OPAQUE");
    invariant(input.criterionRefs.includes(evidence.criterionRef), "EVIDENCE_CRITERION_UNKNOWN");
    invariant(EVIDENCE_TYPES.has(evidence.evidenceType), "EVIDENCE_TYPE_INVALID");
    invariant(ENTAILMENTS.has(evidence.entailment), "ENTAILMENT_INVALID");
    invariant(
      evidence.sourceSegmentRefs.length > 0 &&
        evidence.sourceSegmentRefs.length <= MAX_SOURCE_SEGMENTS &&
        unique(evidence.sourceSegmentRefs) &&
        evidence.sourceSegmentRefs.every((item) => OPAQUE.segment.test(item)),
      "SOURCE_SEGMENT_REFS_INVALID",
    );
    invariant(refValid(evidence.provenanceRef), "PROVENANCE_REF_INVALID");
    invariant(evidence.lexicalOnly === true, "LEXICAL_ONLY_REQUIRED");
  }
  invariant(unique(input.evidenceInventory.map((item) => item.evidenceRef)), "EVIDENCE_REF_DUPLICATE");
  invariant(unique(input.evidenceInventory.map((item) => item.citationRef)), "CITATION_REF_DUPLICATE");

  invariant(input.suggestions.length > 0 && input.suggestions.length <= MAX_SUGGESTIONS, "SUGGESTION_COUNT_INVALID");
  for (const suggestion of input.suggestions) {
    assertOnlyKeys(
      suggestion,
      ["suggestionRef", "kind", "templateRef", "criterionRef", "citationRefs"],
      "SUGGESTION_UNKNOWN_FIELD",
    );
    invariant(OPAQUE.suggestion.test(suggestion.suggestionRef), "SUGGESTION_REF_NOT_OPAQUE");
    invariant(SUGGESTION_KINDS.has(suggestion.kind), "SUGGESTION_KIND_INVALID");
    invariant(suggestion.templateRef === TEMPLATE_BY_KIND[suggestion.kind], "SUGGESTION_TEMPLATE_INVALID");
    invariant(OPAQUE.criterion.test(suggestion.criterionRef), "SUGGESTION_CRITERION_REF_NOT_OPAQUE");
    invariant(input.criterionRefs.includes(suggestion.criterionRef), "SUGGESTION_CRITERION_UNKNOWN");
    invariant(
      suggestion.citationRefs.length > 0 &&
        suggestion.citationRefs.length <= MAX_CITATIONS_PER_ITEM &&
        unique(suggestion.citationRefs),
      "SUGGESTION_CITATIONS_INVALID",
    );
    for (const citationRef of suggestion.citationRefs) {
      const evidence = input.evidenceInventory.find((item) => item.citationRef === citationRef);
      invariant(evidence, "SUGGESTION_CITATION_UNKNOWN");
      invariant(evidence.entailment === "SUPPORTED", "SUGGESTION_CITATION_NOT_SUPPORTED");
      invariant(evidence.criterionRef === suggestion.criterionRef, "SUGGESTION_CRITERION_MISMATCH");
    }
  }
  invariant(unique(input.suggestions.map((item) => item.suggestionRef)), "SUGGESTION_REF_DUPLICATE");

  invariant(input.qualitySignals.length > 0 && input.qualitySignals.length <= MAX_SIGNALS, "QUALITY_SIGNAL_COUNT_INVALID");
  for (const signal of input.qualitySignals) {
    assertOnlyKeys(
      signal,
      ["signalRef", "kind", "state", "criterionRef", "citationRefs", "sessionLevelOnly"],
      "QUALITY_SIGNAL_UNKNOWN_FIELD",
    );
    invariant(OPAQUE.signal.test(signal.signalRef), "QUALITY_SIGNAL_REF_NOT_OPAQUE");
    invariant(SIGNAL_KINDS.has(signal.kind), "QUALITY_SIGNAL_KIND_INVALID");
    invariant(SIGNAL_STATES.has(signal.state), "QUALITY_SIGNAL_STATE_INVALID");
    invariant(OPAQUE.criterion.test(signal.criterionRef), "QUALITY_SIGNAL_CRITERION_REF_NOT_OPAQUE");
    invariant(input.criterionRefs.includes(signal.criterionRef), "QUALITY_SIGNAL_CRITERION_UNKNOWN");
    invariant(signal.sessionLevelOnly === true, "SESSION_LEVEL_ONLY_REQUIRED");
    invariant(
      signal.citationRefs.length > 0 &&
        signal.citationRefs.length <= MAX_CITATIONS_PER_ITEM &&
        unique(signal.citationRefs),
      "QUALITY_SIGNAL_CITATIONS_INVALID",
    );
    for (const citationRef of signal.citationRefs) {
      const evidence = input.evidenceInventory.find((item) => item.citationRef === citationRef);
      invariant(evidence, "QUALITY_SIGNAL_CITATION_UNKNOWN");
      invariant(evidence.criterionRef === signal.criterionRef, "QUALITY_SIGNAL_CRITERION_MISMATCH");
      if (signal.state === "INSUFFICIENT_EVIDENCE") {
        invariant(evidence.entailment === "INSUFFICIENT", "INSUFFICIENT_SIGNAL_EVIDENCE_INVALID");
      } else {
        invariant(evidence.entailment === "SUPPORTED", "QUALITY_SIGNAL_CITATION_NOT_SUPPORTED");
      }
    }
  }
  invariant(unique(input.qualitySignals.map((item) => item.signalRef)), "QUALITY_SIGNAL_REF_DUPLICATE");
}

function validateStoredProposal(receipt: SyntheticCoachingProposalReceiptV1): void {
  const { proposalDigest, ...unsigned } = receipt;
  invariant(DIGEST.test(proposalDigest), "PROPOSAL_DIGEST_INVALID");
  invariant(sha256(unsigned) === proposalDigest, "PROPOSAL_TAMPERED");
}

export class CitationBackedCoachingRegistry {
  private readonly proposals = new Map<string, SyntheticCoachingProposalReceiptV1>();
  private readonly corrections = new Map<string, { requestDigest: string; value: CoachingCorrectionReceiptV1 }>();

  constructor(private readonly clock: CoachingClock) {}

  create(input: CreateSyntheticCoachingProposalV1): SyntheticCoachingProposalReceiptV1 {
    validateProposal(input, this.clock);
    const key = `${input.tenantRef}:${input.interviewRef}:${input.proposalId}`;
    const proposalDigest = sha256(input);
    const existing = this.proposals.get(key);
    if (existing) {
      invariant(existing.proposalDigest === proposalDigest, "PROPOSAL_ID_CONFLICT");
      return clone(existing);
    }
    const value: SyntheticCoachingProposalReceiptV1 = clone({ ...input, proposalDigest });
    this.proposals.set(key, value);
    return clone(value);
  }

  requestCorrection(request: CoachingCorrectionRequestV1): CoachingCorrectionReceiptV1 {
    assertNoForbiddenKeys(request);
    assertOnlyKeys(
      request,
      [
        "correctionId",
        "tenantRef",
        "interviewRef",
        "proposalId",
        "proposalDigest",
        "aiOutputVersionRef",
        "humanRequesterRef",
        "correctionReasonRef",
        "requestedAt",
        "requestedTransition",
        "actionRequested",
        "finalizeRequested",
      ],
      "CORRECTION_UNKNOWN_FIELD",
    );
    invariant(OPAQUE.correction.test(request.correctionId), "CORRECTION_ID_NOT_OPAQUE");
    invariant(refValid(request.tenantRef), "CORRECTION_TENANT_REF_INVALID");
    invariant(OPAQUE.interview.test(request.interviewRef), "CORRECTION_INTERVIEW_REF_NOT_OPAQUE");
    invariant(OPAQUE.proposal.test(request.proposalId), "CORRECTION_PROPOSAL_ID_NOT_OPAQUE");
    invariant(DIGEST.test(request.proposalDigest), "CORRECTION_PROPOSAL_DIGEST_INVALID");
    invariant(refValid(request.aiOutputVersionRef), "CORRECTION_AI_OUTPUT_VERSION_REF_INVALID");
    invariant(refValid(request.humanRequesterRef), "HUMAN_REQUESTER_REF_REQUIRED");
    invariant(refValid(request.correctionReasonRef), "CORRECTION_REASON_REF_REQUIRED");
    const requestedAt = parseIso(request.requestedAt, "CORRECTION_REQUESTED_AT_INVALID");
    invariant(requestedAt <= this.clock.now().getTime(), "CORRECTION_REQUESTED_AT_IN_FUTURE");
    invariant(request.requestedTransition === "CORRECTION_REVIEW_ONLY", "CORRECTION_TRANSITION_INVALID");
    invariant(request.actionRequested === false && request.finalizeRequested === false, "CORRECTION_ACTION_DISALLOWED");

    const proposalKey = `${request.tenantRef}:${request.interviewRef}:${request.proposalId}`;
    const proposal = this.proposals.get(proposalKey);
    invariant(proposal, "CORRECTION_PROPOSAL_NOT_FOUND");
    validateStoredProposal(proposal);
    invariant(this.clock.now().getTime() < Date.parse(proposal.expiresAt), "PROPOSAL_EXPIRED");
    invariant(requestedAt >= Date.parse(proposal.createdAt), "CORRECTION_REQUESTED_BEFORE_PROPOSAL");
    invariant(request.proposalDigest === proposal.proposalDigest, "CORRECTION_PROPOSAL_DIGEST_MISMATCH");
    invariant(request.aiOutputVersionRef === proposal.aiOutputVersionRef, "CORRECTION_AI_OUTPUT_VERSION_MISMATCH");

    const correctionKey = `${request.tenantRef}:${request.interviewRef}:${request.correctionId}`;
    const requestDigest = sha256(request);
    const existing = this.corrections.get(correctionKey);
    if (existing) {
      invariant(existing.requestDigest === requestDigest, "CORRECTION_ID_CONFLICT");
      return clone(existing.value);
    }
    const unsigned = {
      schemaVersion: CITATION_BACKED_COACHING_SCHEMA_VERSION,
      correctionId: request.correctionId,
      tenantRef: request.tenantRef,
      interviewRef: request.interviewRef,
      proposalId: request.proposalId,
      proposalDigest: request.proposalDigest,
      aiOutputVersionRef: request.aiOutputVersionRef,
      humanRequesterRef: request.humanRequesterRef,
      correctionReasonRef: request.correctionReasonRef,
      requestedAt: request.requestedAt,
      disposition: "CORRECTION_REVIEW_REQUESTED" as const,
      oversightState: "AI_SUGGESTED" as const,
      proposalMutated: false as const,
      actionApplied: false as const,
      finalized: false as const,
      productionEligible: false as const,
    };
    const value: CoachingCorrectionReceiptV1 = clone({
      ...unsigned,
      correctionDigest: sha256(unsigned),
    });
    this.corrections.set(correctionKey, { requestDigest, value });
    return clone(value);
  }
}
