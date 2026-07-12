/** Faz 25 P6 — governed intelligence evaluation and proposal wire contract. */

export const INTELLIGENCE_EVALUATION_SCHEMA_VERSION =
  "intelligence-evaluation/v1" as const;

declare const intelligenceDigestBrand: unique symbol;
export type IntelligenceDigest = `sha256:${string}` & {
  readonly [intelligenceDigestBrand]: true;
};

export function parseIntelligenceDigest(value: string): IntelligenceDigest {
  if (!/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new TypeError("Expected sha256: followed by exactly 64 lowercase hex characters");
  }
  return value as IntelligenceDigest;
}

export type IntelligenceCapabilityKind =
  | "QOH"
  | "FAIRNESS"
  | "COACHING"
  | "SKILLS_ONTOLOGY"
  | "DEEPFAKE_PROVENANCE"
  | "INTERNAL_MOBILITY"
  | "AGENTIC_PROPOSAL";

export type IntelligenceCapabilityLifecycle =
  | "RESEARCH_ONLY"
  | "EVIDENCE_REQUIRED"
  | "BLOCKED"
  | "PROPOSAL_ONLY"
  | "GOVERNED_ACTIVE"
  | "DISALLOWED";

export type IntelligenceMetricState =
  | "NOT_DEFINED"
  | "DESIGNED"
  | "MEASURED"
  | "INDEPENDENTLY_REVIEWED"
  | "OWNER_ACCEPTED";

export type IntelligenceMetricKind =
  | "OUTCOME_ASSOCIATION"
  | "SELECTION_RATE_SCREENING"
  | "CITATION_COVERAGE"
  | "ONTOLOGY_PROVENANCE_COVERAGE"
  | "PROVENANCE_RISK_SIGNAL"
  | "HUMAN_REVIEWED_SKILL_MATCH"
  | "PROPOSAL_SAFETY";

export type IntelligenceOutputMode =
  | "AGGREGATE_EVIDENCE"
  | "SCREENING_INDICATOR"
  | "CITATION_BACKED_PROPOSAL"
  | "PROVENANCE_BACKED_PROPOSAL"
  | "NO_OUTPUT";

export type IntelligenceGateKind =
  | "EVIDENCE"
  | "LEGAL"
  | "INDEPENDENT_AUDIT"
  | "OWNER";

export type IntelligenceGateStatus =
  | "NOT_MET"
  | "EVIDENCE_SUBMITTED"
  | "VERIFIED"
  | "OWNER_ACCEPTED";

export interface IntelligenceGateV1 {
  readonly kind: IntelligenceGateKind;
  readonly status: IntelligenceGateStatus;
  readonly evidenceRef?: string;
  readonly verifierRef?: string;
  readonly verifiedAt?: string;
}

export interface IntelligenceMetricResultV1 {
  readonly metricResultRef: string;
  readonly confidenceIntervalRef: string;
  readonly evidenceRef: string;
  readonly screeningIndicatorOnly: true;
  readonly verdict: "NONE";
}

export interface IntelligenceMetricProtocolV1 {
  readonly state: IntelligenceMetricState;
  readonly metricKind: IntelligenceMetricKind;
  readonly cohortOrigin: "SYNTHETIC" | "AGGREGATED_RUNTIME";
  readonly containsRawPii: false;
  readonly containsRawProtectedAttributes: false;
  readonly protectedAttributeAccess: "NONE" | "AUDIT_ONLY_AGGREGATED";
  readonly cohortDefinitionRef: string;
  readonly minimumSampleSizeDefined: boolean;
  readonly minimumSampleSize?: number;
  readonly observedSampleSize: number;
  readonly groundTruthOwner:
    | "UNASSIGNED"
    | "CUSTOMER_HUMAN"
    | "INDEPENDENT_AUDITOR"
    | "SHARED_DOCUMENTED";
  readonly missingnessPlanRef: string;
  readonly confounderPlanRefs: readonly string[];
  readonly uncertaintyMethod:
    | "NOT_DEFINED"
    | "BOOTSTRAP_CI"
    | "EXACT_CI"
    | "BAYESIAN_INTERVAL";
  readonly provenanceChainRef: string;
  readonly result?: IntelligenceMetricResultV1;
}

export interface IntelligenceCapabilityPolicyV1 {
  readonly outputMode: IntelligenceOutputMode;
  readonly individualActionScope:
    | "NO_INDIVIDUAL_ACTION"
    | "HUMAN_REVIEWED_PROPOSAL";
  readonly humanScreeningOnly: boolean;
  readonly fourFifthsIndicatorRole: "NOT_APPLICABLE" | "SCREENING_ONLY";
  readonly deepfakeSignalRole: "NOT_APPLICABLE" | "SCREENING_ONLY";
  readonly citationRequired: boolean;
  readonly ontologyProvenanceRequired: boolean;
  readonly humanReviewRequired: true;
  readonly appealRequired: true;
  readonly rollbackRequired: true;
  readonly producesDecision: false;
  readonly numericScoring: "DISALLOWED";
  readonly ranking: "DISALLOWED";
  readonly automatedEmploymentDecision: "DISALLOWED";
  readonly affectEmotionInference: "DISALLOWED";
  readonly personalityInference: "DISALLOWED";
  readonly deceptionInference: "DISALLOWED";
  readonly protectedAttributeOptimization: "DISALLOWED";
  readonly provenanceSoleAdverseAction: "DISALLOWED";
  readonly autonomousMutation: "DISALLOWED";
  readonly batchApproval: "DISALLOWED";
}

export interface IntelligenceCapabilityV1 {
  readonly capabilityId: string;
  readonly kind: IntelligenceCapabilityKind;
  readonly lifecycle: IntelligenceCapabilityLifecycle;
  readonly synthetic: boolean;
  readonly metricProtocol: IntelligenceMetricProtocolV1;
  readonly policy: IntelligenceCapabilityPolicyV1;
  readonly gates: readonly IntelligenceGateV1[];
  readonly evidenceVerified: boolean;
  readonly legalReviewVerified: boolean;
  readonly independentAuditVerified: boolean;
  readonly ownerAccepted: boolean;
  readonly fullAtsAccepted: boolean;
  readonly fullAtsAcceptanceRef?: string;
  readonly proposalGenerationAllowed: boolean;
  readonly humanActionAllowed: boolean;
  readonly productionEligible: boolean;
}

export type IntelligenceProposalActionType =
  | "COACHING_DRAFT"
  | "SKILL_SUGGESTION"
  | "RISK_REVIEW_REQUEST"
  | "MOBILITY_REVIEW_SUGGESTION"
  | "NO_ACTION";

export type HumanOversightState =
  | "AI_SUGGESTED"
  | "HUMAN_REVIEWING"
  | "HUMAN_EDITED"
  | "HUMAN_REVIEWED_NO_CHANGE"
  | "AI_SUGGESTION_REJECTED"
  | "HUMAN_RATIONALE_RECORDED"
  | "FINALIZED"
  | "EXPORTED"
  | "WITHDRAWN";

export interface IntelligenceHumanApprovalReceiptV1 {
  readonly humanActorRef: string;
  readonly oversightRoleRef: string;
  readonly humanAuthoredRationaleRef: string;
  readonly sourceEvidenceRefs: readonly string[];
  readonly aiOutputVersionRef: string;
  readonly decisionOutcomeRef: string;
  readonly auditReceiptRef: string;
  readonly finalizedAt: string;
}

export interface IntelligenceProposalV1 {
  readonly proposalId: string;
  readonly capabilityId: string;
  readonly synthetic: boolean;
  readonly scopeRef: string;
  readonly actionType: IntelligenceProposalActionType;
  readonly oversightState: HumanOversightState;
  readonly humanOversightStandardRef: string;
  readonly sourceEvidenceRefs: readonly string[];
  readonly citationRefs: readonly string[];
  readonly aiOutputVersionRef: string;
  readonly contentDigest: IntelligenceDigest;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly humanReviewRequired: true;
  readonly humanRationaleRequired: true;
  readonly autoExecute: false;
  readonly batchApproval: false;
  readonly mutationAllowed: false;
  readonly actionAllowed: boolean;
  readonly appealPathRef: string;
  readonly rollbackPlanRef: string;
  readonly approvalReceipt?: IntelligenceHumanApprovalReceiptV1;
}

export interface IntelligenceHardBansV1 {
  readonly numericScoring: "DISALLOWED";
  readonly ranking: "DISALLOWED";
  readonly automatedEmploymentDecision: "DISALLOWED";
  readonly affectEmotionInference: "DISALLOWED";
  readonly personalityInference: "DISALLOWED";
  readonly deceptionInference: "DISALLOWED";
  readonly protectedAttributeOptimization: "DISALLOWED";
  readonly provenanceSoleAdverseAction: "DISALLOWED";
  readonly autonomousMutation: "DISALLOWED";
  readonly batchApproval: "DISALLOWED";
}

export interface IntelligenceEvaluationRegistryV1 {
  readonly schemaVersion: typeof INTELLIGENCE_EVALUATION_SCHEMA_VERSION;
  readonly activationGate: "PRE_G0_CONTRACT_ONLY" | "GATED_RUNTIME";
  readonly humanOversightStandardRef: string;
  readonly hardBans: IntelligenceHardBansV1;
  readonly maxPendingProposals: number;
  readonly proposalTtlHours: number;
  readonly capabilities: readonly IntelligenceCapabilityV1[];
  readonly proposals: readonly IntelligenceProposalV1[];
}

export const FORBIDDEN_INTELLIGENCE_FIELDS = [
  "candidateId",
  "employeeId",
  "personName",
  "email",
  "phone",
  "protectedAttribute",
  "protectedGroup",
  "rawMetricValue",
  "numericScore",
  "rankingScore",
  "candidateRank",
  "affectLabel",
  "emotionLabel",
  "personalityLabel",
  "deceptionLabel",
  "autoDecision",
  "accessToken",
  "clientSecret",
  "password",
] as const;
