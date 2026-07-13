import { describe, expect, it } from "vitest";
import {
  FORBIDDEN_INTELLIGENCE_FIELDS,
  INTELLIGENCE_EVALUATION_SCHEMA_VERSION,
  INTELLIGENCE_METRIC_RESULT_LEGACY_DEPRECATION,
  normalizeAndValidateIntelligenceMetricResultV1,
  parseIntelligenceDigest,
  type IntelligenceCapabilityPolicyV1,
  type IntelligenceCapabilityV1,
  type IntelligenceMetricResultV1,
  type IntelligenceProposalV1,
} from "../wire/intelligence-evaluation.js";

const hardBanPolicy = {
  humanReviewRequired: true,
  appealRequired: true,
  rollbackRequired: true,
  producesDecision: false,
  numericScoring: "DISALLOWED",
  ranking: "DISALLOWED",
  automatedEmploymentDecision: "DISALLOWED",
  affectEmotionInference: "DISALLOWED",
  personalityInference: "DISALLOWED",
  deceptionInference: "DISALLOWED",
  protectedAttributeOptimization: "DISALLOWED",
  provenanceSoleAdverseAction: "DISALLOWED",
  autonomousMutation: "DISALLOWED",
  batchApproval: "DISALLOWED",
} as const;

describe("P6 Intelligence Evaluation contract", () => {
  it("pins a versioned wire surface and exact SHA-256 digests", () => {
    expect(INTELLIGENCE_EVALUATION_SCHEMA_VERSION).toBe(
      "intelligence-evaluation/v1",
    );
    expect(parseIntelligenceDigest(`sha256:${"a".repeat(64)}`)).toHaveLength(71);
    expect(() => parseIntelligenceDigest("sha256:abc")).toThrow(TypeError);
  });

  it("keeps fairness an aggregate human-review screening indicator", () => {
    const policy: IntelligenceCapabilityPolicyV1 = {
      ...hardBanPolicy,
      outputMode: "SCREENING_INDICATOR",
      individualActionScope: "NO_INDIVIDUAL_ACTION",
      humanScreeningOnly: true,
      fourFifthsIndicatorRole: "SCREENING_ONLY",
      deepfakeSignalRole: "NOT_APPLICABLE",
      citationRequired: false,
      ontologyProvenanceRequired: false,
    };
    const capability: IntelligenceCapabilityV1 = {
      capabilityId: "capability:fairness:v1",
      kind: "FAIRNESS",
      lifecycle: "EVIDENCE_REQUIRED",
      synthetic: true,
      metricProtocol: {
        state: "DESIGNED",
        metricKind: "SELECTION_RATE_SCREENING",
        cohortOrigin: "SYNTHETIC",
        containsRawPii: false,
        containsRawProtectedAttributes: false,
        protectedAttributeAccess: "AUDIT_ONLY_AGGREGATED",
        cohortDefinitionRef: "cohort:fairness:synthetic",
        minimumSampleSizeDefined: false,
        observedSampleSize: 0,
        groundTruthOwner: "UNASSIGNED",
        missingnessPlanRef: "missingness:fairness:v1",
        confounderPlanRefs: ["confounder:fairness:v1"],
        uncertaintyMethod: "NOT_DEFINED",
        provenanceChainRef: "provenance:fairness:synthetic",
      },
      policy,
      gates: [
        { kind: "EVIDENCE", status: "NOT_MET" },
        { kind: "LEGAL", status: "NOT_MET" },
        { kind: "INDEPENDENT_AUDIT", status: "NOT_MET" },
        { kind: "OWNER", status: "NOT_MET" },
      ],
      evidenceVerified: false,
      legalReviewVerified: false,
      independentAuditVerified: false,
      ownerAccepted: false,
      fullAtsAccepted: false,
      proposalGenerationAllowed: false,
      humanActionAllowed: false,
      productionEligible: false,
    };

    expect(capability.policy.fourFifthsIndicatorRole).toBe("SCREENING_ONLY");
    expect(capability.policy.producesDecision).toBe(false);
    expect(capability.humanActionAllowed).toBe(false);
  });

  it("keeps QOH descriptive while fairness remains a screening indicator", () => {
    const qoh: IntelligenceMetricResultV1 = {
      metricResultRef: "metric-result:qoh:v1",
      confidenceIntervalRef: "confidence:qoh:v1",
      evidenceRef: "evidence:qoh:v1",
      resultRole: "DESCRIPTIVE_ASSOCIATION",
      screeningIndicatorOnly: false,
      verdict: "NONE",
    };
    const fairness: IntelligenceMetricResultV1 = {
      metricResultRef: "metric-result:fairness:v1",
      confidenceIntervalRef: "confidence:fairness:v1",
      evidenceRef: "evidence:fairness:v1",
      resultRole: "SCREENING_INDICATOR",
      screeningIndicatorOnly: true,
      verdict: "NONE",
    };

    expect(qoh.resultRole).toBe("DESCRIPTIVE_ASSOCIATION");
    expect(qoh.screeningIndicatorOnly).toBe(false);
    expect(fairness.resultRole).toBe("SCREENING_INDICATOR");
    expect(fairness.screeningIndicatorOnly).toBe(true);
  });

  it("normalizes deprecated v1 results and re-emits the capability-bound role", () => {
    const legacy: IntelligenceMetricResultV1 = {
      metricResultRef: "metric-result:qoh:v1",
      confidenceIntervalRef: "confidence:qoh:v1",
      evidenceRef: "evidence:qoh:v1",
      screeningIndicatorOnly: true,
      verdict: "NONE",
    };

    const normalized = normalizeAndValidateIntelligenceMetricResultV1("QOH", legacy);
    expect(normalized).toEqual({
      result: {
        metricResultRef: "metric-result:qoh:v1",
        confidenceIntervalRef: "confidence:qoh:v1",
        evidenceRef: "evidence:qoh:v1",
        resultRole: "DESCRIPTIVE_ASSOCIATION",
        screeningIndicatorOnly: false,
        verdict: "NONE",
      },
      compatibility: "LEGACY_SCREENING_ONLY_V1",
      deprecation: INTELLIGENCE_METRIC_RESULT_LEGACY_DEPRECATION,
    });
  });

  it("enforces capability, result role and screening semantics at the public runtime boundary", () => {
    const qoh = {
      metricResultRef: "metric-result:qoh:v1",
      confidenceIntervalRef: "confidence:qoh:v1",
      evidenceRef: "evidence:qoh:v1",
      resultRole: "DESCRIPTIVE_ASSOCIATION",
      screeningIndicatorOnly: false,
      verdict: "NONE",
    };
    expect(normalizeAndValidateIntelligenceMetricResultV1("QOH", qoh)).toMatchObject({
      compatibility: "CANONICAL",
      deprecation: null,
    });
    expect(() =>
      normalizeAndValidateIntelligenceMetricResultV1("FAIRNESS", qoh),
    ).toThrow("INTELLIGENCE_CAPABILITY_RESULT_ROLE_MISMATCH");
    expect(() =>
      normalizeAndValidateIntelligenceMetricResultV1("QOH", {
        ...qoh,
        screeningIndicatorOnly: true,
      }),
    ).toThrow("INTELLIGENCE_RESULT_ROLE_SCREENING_MISMATCH");
    expect(() =>
      normalizeAndValidateIntelligenceMetricResultV1("QOH", {
        metricResultRef: "metric-result:qoh:v1",
        confidenceIntervalRef: "confidence:qoh:v1",
        evidenceRef: "evidence:qoh:v1",
        screeningIndicatorOnly: false,
        verdict: "NONE",
      }),
    ).toThrow("INTELLIGENCE_LEGACY_RESULT_REQUIRES_SCREENING_TRUE");
  });

  it("allows only a closed AI_SUGGESTED synthetic proposal preview", () => {
    const proposal: IntelligenceProposalV1 = {
      proposalId: "proposal:coaching:synthetic",
      capabilityId: "capability:coaching:v1",
      synthetic: true,
      scopeRef: "scope:interview:synthetic",
      actionType: "COACHING_DRAFT",
      oversightState: "AI_SUGGESTED",
      humanOversightStandardRef: "human-oversight:canonical:v1",
      sourceEvidenceRefs: ["evidence:coaching:synthetic"],
      citationRefs: ["citation:coaching:synthetic"],
      aiOutputVersionRef: "ai-output:coaching:synthetic",
      contentDigest: parseIntelligenceDigest(`sha256:${"0".repeat(64)}`),
      createdAt: "1970-01-01T00:00:00Z",
      expiresAt: "1970-01-02T00:00:00Z",
      humanReviewRequired: true,
      humanRationaleRequired: true,
      autoExecute: false,
      batchApproval: false,
      mutationAllowed: false,
      actionAllowed: false,
      appealPathRef: "appeal:coaching:synthetic",
      rollbackPlanRef: "rollback:coaching:synthetic",
    };

    expect(proposal.oversightState).toBe("AI_SUGGESTED");
    expect(proposal.actionAllowed).toBe(false);
    expect(proposal.approvalReceipt).toBeUndefined();
  });

  it("does not expose raw PII, protected data, scores or decision fields", () => {
    const preview = {
      capabilityId: "capability:coaching:v1",
      scopeRef: "scope:interview:synthetic",
    } as Record<string, unknown>;

    for (const field of FORBIDDEN_INTELLIGENCE_FIELDS) {
      expect(preview[field]).toBeUndefined();
    }
  });
});
