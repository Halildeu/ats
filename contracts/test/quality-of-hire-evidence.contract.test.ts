import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  QUALITY_OF_HIRE_CAPABILITY_REF,
  QUALITY_OF_HIRE_EVIDENCE_SCHEMA_VERSION,
  QUALITY_OF_HIRE_INTELLIGENCE_AUTHORITY,
  evaluateSyntheticQualityOfHireCorrection,
  evaluateSyntheticQualityOfHireEvidence,
  verifySyntheticQualityOfHireReceipt,
  type QualityOfHireAggregateDimensionInputV1,
  type QualityOfHireObservationWindowInputV1,
  type QualityOfHireOutcomeDimension,
  type QualityOfHireWindowDays,
  type SyntheticQualityOfHireEvidenceInputV1,
} from "../qoh/quality-of-hire-evidence.js";

const dimensions: readonly QualityOfHireOutcomeDimension[] = [
  "RETENTION",
  "RAMP_MILESTONE",
  "STRUCTURED_MANAGER_OUTCOME",
  "NEW_HIRE_EXPERIENCE",
] as const;

function dimension(
  kind: QualityOfHireOutcomeDimension,
  overrides: Partial<QualityOfHireAggregateDimensionInputV1> = {},
): QualityOfHireAggregateDimensionInputV1 {
  return {
    kind,
    outcomeCategoryRef: `category_${(dimensions.indexOf(kind) + 1)
      .toString(16)
      .repeat(16)}`,
    eligibleCount: 200,
    observedCount: 160,
    missingCount: 20,
    censoredCount: 20,
    outcomeCategoryCount: 100,
    ...overrides,
  };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonical(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function resealReceipt<T extends { readonly receiptDigest: `sha256:${string}` }>(
  receipt: T,
  changes: Record<string, unknown>,
): T {
  const { receiptDigest: _ignored, ...unsigned } = { ...receipt, ...changes };
  const digest = createHash("sha256").update(canonical(unsigned)).digest("hex");
  return { ...unsigned, receiptDigest: `sha256:${digest}` } as T;
}

function window(
  windowDays: QualityOfHireWindowDays,
  dimensionOverrides: Partial<Record<QualityOfHireOutcomeDimension, Partial<QualityOfHireAggregateDimensionInputV1>>> = {},
): QualityOfHireObservationWindowInputV1 {
  return {
    windowDays,
    dimensions: dimensions.map((kind) => dimension(kind, dimensionOverrides[kind])),
  };
}

function fixture(
  overrides: Partial<SyntheticQualityOfHireEvidenceInputV1> = {},
): SyntheticQualityOfHireEvidenceInputV1 {
  return {
    schemaVersion: QUALITY_OF_HIRE_EVIDENCE_SCHEMA_VERSION,
    intelligenceEvaluationAuthority: QUALITY_OF_HIRE_INTELLIGENCE_AUTHORITY,
    capabilityRef: QUALITY_OF_HIRE_CAPABILITY_REF,
    synthetic: true,
    aggregateOnly: true,
    tenantRef: "tenant_aaaaaaaaaaaaaaaa",
    cohortRef: "cohort_bbbbbbbbbbbbbbbb",
    measurementPlanRef: "measurement-plan:qoh:synthetic:v1",
    measurementPlanVersionRef: "measurement-plan-version:qoh:synthetic:v1",
    preregistrationDigest: `sha256:${"1".repeat(64)}`,
    cohortDefinitionRef: "cohort-definition:qoh:synthetic:v1",
    cohortDefinitionVersionRef: "cohort-definition-version:qoh:synthetic:v1",
    comparisonProtocol: {
      kind: "NONE",
      protocolRef: "comparison-protocol:qoh:none:v1",
      baselineRef: null,
      preregistered: true,
      causalClaimAllowed: false,
    },
    dataCutoffAt: "2026-07-13T12:00:00Z",
    minimumStatisticalSampleSize: 30,
    minimumDisclosureSampleSize: 20,
    maximumMissingnessRate: 0.1,
    observationWindows: [window(90), window(180)],
    missingnessPlanRef: "missingness:qoh:synthetic:v1",
    confounderPlanRefs: [
      "confounder:qoh:role-family:v1",
      "confounder:qoh:location:v1",
      "confounder:qoh:hire-period:v1",
      "confounder:qoh:manager-context:v1",
    ],
    uncertaintyMethod: "WILSON_SCORE_95",
    groundTruthStatus: "CONTESTABLE_HUMAN_REPORTED_OUTCOME",
    lineage: {
      hiringEvidenceAggregateRef: "evidence-aggregate:hiring:synthetic:v1",
      hrisOutcomeSnapshotRef: "hris-outcome-snapshot:synthetic:v1",
      structuredHumanOutcomeReceiptRef: "human-outcome-receipt:synthetic:v1",
      newHireExperienceReceiptRef: "new-hire-experience-receipt:synthetic:v1",
      linkageProtocolRef: "linkage-protocol:destroyable-hmac:v1",
      linkageUsesDestroyableHmac: true,
      sourceSchemaVersionRefs: [
        "schema:hiring-evidence:v1",
        "schema:hris-outcome:v1",
      ],
      provenanceChainRef: "provenance:qoh:synthetic:v1",
    },
    governance: {
      purposeRef: "purpose:qoh:research-only:v1",
      legalBasisReviewRef: "legal-review:qoh:not-met:v1",
      retentionPolicyRef: "retention:qoh:synthetic:v1",
      accessPolicyRef: "access:qoh:aggregate-only:v1",
      suppressionPolicyRef: "suppression:qoh:small-cohort:v1",
      differencingControlRef: "differencing-control:qoh:synthetic:v1",
      queryBudgetPolicyRef: "query-budget:qoh:synthetic:v1",
      erasurePropagationRef: "erasure:qoh:propagation:v1",
      correctionPathRef: "correction:qoh:synthetic:v1",
      appealPathRef: "appeal:qoh:synthetic:v1",
      auditPolicyRef: "audit-policy:qoh:synthetic:v1",
      humanOversightStandardRef: "human-oversight:canonical:v1",
    },
    containsRawPii: false,
    containsRawProtectedAttributes: false,
    containsRawEmployeePerformanceData: false,
    containsPersonLevelOutcome: false,
    causalClaimAllowed: false,
    candidateRankingAllowed: false,
    retrospectiveCandidateRankingAllowed: false,
    retrospectiveCandidateScoringAllowed: false,
    automatedEmploymentDecisionAllowed: false,
    modelTrainingUseAllowed: false,
    selectionModelOptimizationAllowed: false,
    protectedAttributeOptimizationAllowed: false,
    proxyFeatureOptimizationAllowed: false,
    employeePerformanceActionAllowed: false,
    internalMobilityRankingAllowed: false,
    singleCompositeQohScore: "DISALLOWED",
    humanReviewRequired: true,
    humanActionAllowed: false,
    correctionReasonRef: null,
    supersedesReceiptDigest: null,
    ...overrides,
  };
}

describe("P6.0 synthetic Quality-of-Hire evidence", () => {
  it("produces a four-dimensional 90/180-day descriptive receipt with every real gate closed", () => {
    const receipt = evaluateSyntheticQualityOfHireEvidence(fixture());

    expect(receipt.schemaVersion).toBe("quality-of-hire-evidence/v1");
    expect(receipt.intelligenceEvaluationAuthority).toBe("intelligence-evaluation/v1");
    expect(receipt.capabilityRef).toBe("capability:qoh:v1");
    expect(receipt.status).toBe("SYNTHETIC_DESCRIPTIVE_ASSOCIATION");
    expect(receipt.observationWindows.map((item) => item.windowDays)).toEqual([90, 180]);
    expect(receipt.observationWindows[0]?.dimensions.map((item) => item.kind)).toEqual(dimensions);
    expect(receipt.observationWindows[0]?.dimensions[0]).toMatchObject({
      visibility: "VISIBLE",
      eligibleCount: 200,
      observedCount: 160,
      missingCount: 20,
      censoredCount: 20,
      outcomeCategoryCount: 100,
      missingnessRate: 0.1,
      outcomeCategoryRate: 0.625,
      uncertaintyInterval: {
        confidenceLevel: 0.95,
        method: "WILSON_SCORE",
      },
    });
    expect(receipt.groundTruthStatus).toBe("CONTESTABLE_HUMAN_REPORTED_OUTCOME");
    expect(receipt.correlationOnly).toBe(true);
    expect(receipt.causalConclusion).toBe("NONE");
    expect(receipt.evidenceGate).toBe("SYNTHETIC_EVIDENCE_ONLY");
    expect(receipt.legalGate).toBe("NOT_MET");
    expect(receipt.independentAuditGate).toBe("NOT_MET");
    expect(receipt.customerControllerGate).toBe("NOT_MET");
    expect(receipt.ownerGate).toBe("NOT_MET");
    expect(receipt.realDataAccepted).toBe(false);
    expect(receipt.realActivationAllowed).toBe(false);
    expect(receipt.productionEligible).toBe(false);
    expect(receipt.receiptDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(() => verifySyntheticQualityOfHireReceipt(receipt)).not.toThrow();
  });

  it("canonicalizes windows, dimensions and set-like refs before digesting", () => {
    const canonical = evaluateSyntheticQualityOfHireEvidence(fixture());
    const reversed = evaluateSyntheticQualityOfHireEvidence(
      fixture({
        observationWindows: [
          { ...window(180), dimensions: [...window(180).dimensions].reverse() },
          { ...window(90), dimensions: [...window(90).dimensions].reverse() },
        ],
        confounderPlanRefs: [...fixture().confounderPlanRefs].reverse(),
        lineage: {
          ...fixture().lineage,
          sourceSchemaVersionRefs: [...fixture().lineage.sourceSchemaVersionRefs].reverse(),
        },
      }),
    );

    expect(reversed.observationWindows).toEqual(canonical.observationWindows);
    expect(reversed.receiptDigest).toBe(canonical.receiptDigest);
  });

  it("separates statistical sufficiency from disclosure safety", () => {
    const statistical = evaluateSyntheticQualityOfHireEvidence(
      fixture({
        minimumStatisticalSampleSize: 161,
        minimumDisclosureSampleSize: 20,
      }),
    );
    const disclosure = evaluateSyntheticQualityOfHireEvidence(
      fixture({
        minimumStatisticalSampleSize: 30,
        minimumDisclosureSampleSize: 101,
      }),
    );

    expect(statistical.insufficiencyReasons).toEqual(["STATISTICAL_SAMPLE_BELOW_MINIMUM"]);
    expect(disclosure.insufficiencyReasons).toEqual(["DISCLOSURE_SAMPLE_BELOW_MINIMUM"]);
  });

  it.each([
    ["outcome category", { outcomeCategoryCount: 1 }],
    ["outcome complement", { outcomeCategoryCount: 159 }],
    [
      "missing",
      { eligibleCount: 181, observedCount: 160, missingCount: 1, censoredCount: 20 },
    ],
    [
      "censored",
      { eligibleCount: 181, observedCount: 160, missingCount: 20, censoredCount: 1 },
    ],
  ] as const)("globally suppresses when a non-zero %s cell is below disclosure minimum", (_name, overrides) => {
    const receipt = evaluateSyntheticQualityOfHireEvidence(
      fixture({
        observationWindows: [
          window(90, { RETENTION: overrides }),
          window(180),
        ],
      }),
    );

    expect(receipt.insufficiencyReasons).toContain("DISCLOSURE_SAMPLE_BELOW_MINIMUM");
    expect(
      receipt.observationWindows
        .flatMap((item) => item.dimensions)
        .every((result) => result.visibility === "SUPPRESSED_INSUFFICIENT_DATA"),
    ).toBe(true);
    expect(() => verifySyntheticQualityOfHireReceipt(receipt)).not.toThrow();
  });

  it("suppresses all aggregate counts when any dimension is insufficient", () => {
    const receipt = evaluateSyntheticQualityOfHireEvidence(
      fixture({
        observationWindows: [
          window(90, {
            RETENTION: {
              eligibleCount: 120,
              observedCount: 9,
              missingCount: 5,
              censoredCount: 106,
              outcomeCategoryCount: 7,
            },
          }),
          window(180),
        ],
      }),
    );

    expect(receipt.status).toBe("INSUFFICIENT_DATA");
    expect(receipt.insufficiencyReasons).toEqual([
      "STATISTICAL_SAMPLE_BELOW_MINIMUM",
      "DISCLOSURE_SAMPLE_BELOW_MINIMUM",
    ]);
    for (const result of receipt.observationWindows.flatMap((item) => item.dimensions)) {
      expect(result.visibility).toBe("SUPPRESSED_INSUFFICIENT_DATA");
      expect(result.eligibleCount).toBeNull();
      expect(result.outcomeCategoryRate).toBeNull();
      expect(result.uncertaintyInterval).toBeNull();
    }
  });

  it("fails closed on excess missingness without treating censoring as missing", () => {
    const receipt = evaluateSyntheticQualityOfHireEvidence(
      fixture({
        observationWindows: [
          window(90, {
            NEW_HIRE_EXPERIENCE: {
              eligibleCount: 130,
              observedCount: 90,
              missingCount: 20,
              censoredCount: 20,
              outcomeCategoryCount: 60,
            },
          }),
          window(180),
        ],
      }),
    );

    expect(receipt.insufficiencyReasons).toEqual(["MISSINGNESS_ABOVE_MAXIMUM"]);
  });

  it("requires observed + missing + censored to equal eligible", () => {
    expect(() =>
      evaluateSyntheticQualityOfHireEvidence(
        fixture({
          observationWindows: [
            window(90, {
              RETENTION: {
                eligibleCount: 120,
                observedCount: 100,
                missingCount: 5,
                censoredCount: 14,
              },
            }),
            window(180),
          ],
        }),
      ),
    ).toThrow("OBSERVED_MISSING_CENSORED_TOTAL_MISMATCH");
  });

  it("requires exact, unique 90 and 180 day windows", () => {
    expect(() =>
      evaluateSyntheticQualityOfHireEvidence(
        fixture({ observationWindows: [window(90)] }),
      ),
    ).toThrow("WINDOW_SET_INCOMPLETE");
    expect(() =>
      evaluateSyntheticQualityOfHireEvidence(
        fixture({ observationWindows: [window(90), window(90)] }),
      ),
    ).toThrow("WINDOW_SET_INVALID");
  });

  it("requires all four dimensions exactly once in every window", () => {
    const missing = window(90).dimensions.slice(0, 3);
    const duplicate = [
      ...window(90).dimensions.slice(0, 3),
      dimension("RETENTION"),
    ];
    expect(() =>
      evaluateSyntheticQualityOfHireEvidence(
        fixture({ observationWindows: [{ windowDays: 90, dimensions: missing }, window(180)] }),
      ),
    ).toThrow("DIMENSION_SET_INCOMPLETE");
    expect(() =>
      evaluateSyntheticQualityOfHireEvidence(
        fixture({ observationWindows: [{ windowDays: 90, dimensions: duplicate }, window(180)] }),
      ),
    ).toThrow("DIMENSION_SET_INVALID");
  });

  it("rejects aggregate category counts above observed records", () => {
    expect(() =>
      evaluateSyntheticQualityOfHireEvidence(
        fixture({
          observationWindows: [
            window(90, {
              RETENTION: { outcomeCategoryCount: 161 },
            }),
            window(180),
          ],
        }),
      ),
    ).toThrow("OUTCOME_CATEGORY_COUNT_EXCEEDS_OBSERVED");
  });

  it("accepts only a preregistered descriptive baseline and never a causal comparison", () => {
    const receipt = evaluateSyntheticQualityOfHireEvidence(
      fixture({
        comparisonProtocol: {
          kind: "PREREGISTERED_DESCRIPTIVE_BASELINE",
          protocolRef: "comparison-protocol:qoh:temporal:v1",
          baselineRef: "baseline:qoh:temporal:v1",
          preregistered: true,
          causalClaimAllowed: false,
        },
      }),
    );
    expect(receipt.comparisonProtocol.kind).toBe("PREREGISTERED_DESCRIPTIVE_BASELINE");
    expect(() =>
      evaluateSyntheticQualityOfHireEvidence({
        ...fixture(),
        comparisonProtocol: {
          ...fixture().comparisonProtocol,
          causalClaimAllowed: true,
        },
      } as never),
    ).toThrow("CAUSAL_COMPARISON_DISALLOWED");
    expect(() =>
      evaluateSyntheticQualityOfHireEvidence({
        ...fixture(),
        comparisonProtocol: {
          ...fixture().comparisonProtocol,
          baselineRef: "baseline:qoh:forbidden:v1",
        },
      }),
    ).toThrow("BASELINE_FORBIDDEN_WITH_NONE");
  });

  it("pins the existing intelligence authority and exact QOH capability", () => {
    expect(() =>
      evaluateSyntheticQualityOfHireEvidence({
        ...fixture(),
        intelligenceEvaluationAuthority: "intelligence-evaluation/v2",
      } as never),
    ).toThrow("INTELLIGENCE_AUTHORITY_MISMATCH");
    expect(() =>
      evaluateSyntheticQualityOfHireEvidence({
        ...fixture(),
        capabilityRef: "capability:fairness:v1",
      } as never),
    ).toThrow("QOH_CAPABILITY_REF_MISMATCH");
  });

  it.each([
    ["causalClaimAllowed", "CAUSAL_CLAIM_DISALLOWED"],
    ["candidateRankingAllowed", "CANDIDATE_RANKING_DISALLOWED"],
    ["retrospectiveCandidateRankingAllowed", "RETROSPECTIVE_RANKING_DISALLOWED"],
    ["retrospectiveCandidateScoringAllowed", "RETROSPECTIVE_SCORING_DISALLOWED"],
    ["automatedEmploymentDecisionAllowed", "AUTOMATED_EMPLOYMENT_DECISION_DISALLOWED"],
    ["modelTrainingUseAllowed", "MODEL_TRAINING_USE_DISALLOWED"],
    ["selectionModelOptimizationAllowed", "SELECTION_MODEL_OPTIMIZATION_DISALLOWED"],
    ["protectedAttributeOptimizationAllowed", "PROTECTED_ATTRIBUTE_OPTIMIZATION_DISALLOWED"],
    ["proxyFeatureOptimizationAllowed", "PROXY_FEATURE_OPTIMIZATION_DISALLOWED"],
    ["employeePerformanceActionAllowed", "EMPLOYEE_PERFORMANCE_ACTION_DISALLOWED"],
    ["internalMobilityRankingAllowed", "INTERNAL_MOBILITY_RANKING_DISALLOWED"],
    ["humanActionAllowed", "HUMAN_ACTION_DISALLOWED"],
  ] as const)("rejects %s feedback/action bypass", (field, error) => {
    expect(() =>
      evaluateSyntheticQualityOfHireEvidence({ ...fixture(), [field]: true } as never),
    ).toThrow(error);
  });

  it("rejects a composite QoH score and contestable-outcome overclaim", () => {
    expect(() =>
      evaluateSyntheticQualityOfHireEvidence({
        ...fixture(),
        singleCompositeQohScore: "ENABLED",
      } as never),
    ).toThrow("COMPOSITE_QOH_SCORE_DISALLOWED");
    expect(() =>
      evaluateSyntheticQualityOfHireEvidence({
        ...fixture(),
        groundTruthStatus: "OBJECTIVE_GROUND_TRUTH",
      } as never),
    ).toThrow("GROUND_TRUTH_OVERCLAIM");
  });

  it("rejects raw person/performance/protected data even when nested", () => {
    expect(() =>
      evaluateSyntheticQualityOfHireEvidence({ ...fixture(), employeeId: "employee:1" } as never),
    ).toThrow("FORBIDDEN_FIELD:employeeId");
    expect(() =>
      evaluateSyntheticQualityOfHireEvidence({
        ...fixture(),
        lineage: { ...fixture().lineage, rawPerformanceText: "manager note" },
      } as never),
    ).toThrow("FORBIDDEN_FIELD:rawPerformanceText");
    expect(() =>
      evaluateSyntheticQualityOfHireEvidence({
        ...fixture(),
        observationWindows: [
          {
            ...window(90),
            dimensions: [
              { ...dimension("RETENTION"), protectedAttribute: "age" },
              ...window(90).dimensions.slice(1),
            ],
          },
          window(180),
        ],
      } as never),
    ).toThrow("FORBIDDEN_FIELD:protectedAttribute");
  });

  it("rejects non-opaque subject refs, invalid digests and invalid cutoff timestamps", () => {
    expect(() =>
      evaluateSyntheticQualityOfHireEvidence({ ...fixture(), tenantRef: "tenant:customer" } as never),
    ).toThrow("TENANT_REF_NOT_OPAQUE");
    expect(() =>
      evaluateSyntheticQualityOfHireEvidence({ ...fixture(), cohortRef: "cohort:role:tr" } as never),
    ).toThrow("COHORT_REF_NOT_OPAQUE");
    expect(() =>
      evaluateSyntheticQualityOfHireEvidence({ ...fixture(), preregistrationDigest: "sha256:abc" } as never),
    ).toThrow("PREREGISTRATION_DIGEST_INVALID");
    expect(() =>
      evaluateSyntheticQualityOfHireEvidence({ ...fixture(), dataCutoffAt: "2026-07-13" }),
    ).toThrow("DATA_CUTOFF_INVALID");
  });

  it("requires destroyable linkage plus complete governance and lineage refs", () => {
    expect(() =>
      evaluateSyntheticQualityOfHireEvidence({
        ...fixture(),
        lineage: { ...fixture().lineage, linkageUsesDestroyableHmac: false },
      } as never),
    ).toThrow("DESTROYABLE_HMAC_LINKAGE_REQUIRED");
    expect(() =>
      evaluateSyntheticQualityOfHireEvidence({
        ...fixture(),
        governance: { ...fixture().governance, retentionPolicyRef: "" },
      }),
    ).toThrow("GOVERNANCE_REF_INVALID:retentionPolicyRef");
    expect(() =>
      evaluateSyntheticQualityOfHireEvidence({
        ...fixture(),
        governance: {
          ...fixture().governance,
          humanOversightStandardRef: "human-oversight:other:v2",
        },
      } as never),
    ).toThrow("HUMAN_OVERSIGHT_AUTHORITY_MISMATCH");
    expect(() =>
      evaluateSyntheticQualityOfHireEvidence({
        ...fixture(),
        confounderPlanRefs: [],
      }),
    ).toThrow("CONFOUNDER_PLAN_REFS_INVALID");
  });

  it("requires opaque outcome category refs and human review without action authority", () => {
    expect(() =>
      evaluateSyntheticQualityOfHireEvidence({
        ...fixture(),
        observationWindows: [
          {
            ...window(90),
            dimensions: [
              { ...dimension("RETENTION"), outcomeCategoryRef: "performance:high" },
              ...window(90).dimensions.slice(1),
            ],
          },
          window(180),
        ],
      }),
    ).toThrow("OUTCOME_CATEGORY_REF_NOT_OPAQUE");
    expect(() =>
      evaluateSyntheticQualityOfHireEvidence({ ...fixture(), humanReviewRequired: false } as never),
    ).toThrow("HUMAN_REVIEW_REQUIRED");
  });

  it("requires paired correction metadata and a trusted previous receipt", () => {
    expect(() =>
      evaluateSyntheticQualityOfHireEvidence({
        ...fixture(),
        correctionReasonRef: "correction-reason:qoh:v1",
      }),
    ).toThrow("CORRECTION_SUPERSESSION_PAIR_REQUIRED");
    expect(() =>
      evaluateSyntheticQualityOfHireEvidence({
        ...fixture(),
        supersedesReceiptDigest: `sha256:${"2".repeat(64)}`,
      }),
    ).toThrow("CORRECTION_SUPERSESSION_PAIR_REQUIRED");

    const previous = evaluateSyntheticQualityOfHireEvidence(fixture());
    const correctionInput = fixture({
      dataCutoffAt: "2026-07-14T12:00:00Z",
      correctionReasonRef: "correction-reason:qoh:synthetic:v1",
      supersedesReceiptDigest: previous.receiptDigest,
    });
    expect(() => evaluateSyntheticQualityOfHireEvidence(correctionInput)).toThrow(
      "CORRECTION_REQUIRES_TRUSTED_PREVIOUS_RECEIPT",
    );
    expect(() => evaluateSyntheticQualityOfHireCorrection(correctionInput, undefined)).toThrow(
      "CORRECTION_TRUSTED_PREVIOUS_RECEIPT_REQUIRED",
    );

    const corrected = evaluateSyntheticQualityOfHireCorrection(correctionInput, previous);
    expect(corrected.correctionStatus).toBe("SUPERSEDING_SYNTHETIC_CORRECTION");
    expect(corrected.supersedesReceiptDigest).toBe(previous.receiptDigest);
    expect(() => verifySyntheticQualityOfHireReceipt(corrected)).not.toThrow();
  });

  it("rejects nonexistent, cross-context, altered-plan and cutoff-regressing corrections", () => {
    const previous = evaluateSyntheticQualityOfHireEvidence(fixture());
    const correction = (overrides: Partial<SyntheticQualityOfHireEvidenceInputV1> = {}) =>
      fixture({
        dataCutoffAt: "2026-07-14T12:00:00Z",
        correctionReasonRef: "correction-reason:qoh:synthetic:v1",
        supersedesReceiptDigest: previous.receiptDigest,
        ...overrides,
      });

    expect(() =>
      evaluateSyntheticQualityOfHireCorrection(
        correction({ supersedesReceiptDigest: `sha256:${"2".repeat(64)}` }),
        previous,
      ),
    ).toThrow("CORRECTION_SUPERSEDED_DIGEST_MISMATCH");
    expect(() =>
      evaluateSyntheticQualityOfHireCorrection(
        correction({ tenantRef: "tenant_cccccccccccccccc" }),
        previous,
      ),
    ).toThrow("CORRECTION_TENANT_CONTEXT_MISMATCH");
    expect(() =>
      evaluateSyntheticQualityOfHireCorrection(
        correction({ cohortRef: "cohort_dddddddddddddddd" }),
        previous,
      ),
    ).toThrow("CORRECTION_COHORT_CONTEXT_MISMATCH");
    expect(() =>
      evaluateSyntheticQualityOfHireCorrection(
        correction({ measurementPlanVersionRef: "measurement-plan-version:qoh:synthetic:v2" }),
        previous,
      ),
    ).toThrow("CORRECTION_MEASUREMENT_CONTEXT_MISMATCH");
    expect(() =>
      evaluateSyntheticQualityOfHireCorrection(
        correction({ cohortDefinitionVersionRef: "cohort-definition-version:qoh:synthetic:v2" }),
        previous,
      ),
    ).toThrow("CORRECTION_COHORT_DEFINITION_CONTEXT_MISMATCH");
    expect(() =>
      evaluateSyntheticQualityOfHireCorrection(
        correction({
          governance: {
            ...fixture().governance,
            correctionPathRef: "correction:qoh:synthetic:v2",
          },
        }),
        previous,
      ),
    ).toThrow("CORRECTION_POLICY_CONTEXT_MISMATCH");
    expect(() =>
      evaluateSyntheticQualityOfHireCorrection(
        correction({ dataCutoffAt: "2026-07-12T12:00:00Z" }),
        previous,
      ),
    ).toThrow("CORRECTION_DATA_CUTOFF_REGRESSION");
  });

  it("detects receipt tampering after deterministic issuance", () => {
    const receipt = evaluateSyntheticQualityOfHireEvidence(fixture());
    const tampered = {
      ...receipt,
      legalGate: "VERIFIED",
    } as unknown as typeof receipt;

    expect(() => verifySyntheticQualityOfHireReceipt(tampered)).toThrow(
      "QOH_RECEIPT_DIGEST_MISMATCH",
    );
  });

  it.each([
    ["legal gate", { legalGate: "VERIFIED" }, "QOH_LEGAL_GATE_MUST_REMAIN_CLOSED"],
    ["production eligibility", { productionEligible: true }, "QOH_PRODUCTION_ELIGIBILITY_DISALLOWED"],
    ["raw PII", { containsRawPii: true }, "RAW_PII_DISALLOWED"],
  ] as const)("rejects a re-sealed forged %s claim", (_name, changes, error) => {
    const forged = resealReceipt(evaluateSyntheticQualityOfHireEvidence(fixture()), changes);
    expect(() => verifySyntheticQualityOfHireReceipt(forged)).toThrow(error);
  });

  it("rejects unknown root and nested fields", () => {
    expect(() =>
      evaluateSyntheticQualityOfHireEvidence({ ...fixture(), legalVerdict: "PASS" } as never),
    ).toThrow("INPUT_UNKNOWN_FIELD:legalVerdict");
    expect(() =>
      evaluateSyntheticQualityOfHireEvidence({
        ...fixture(),
        governance: { ...fixture().governance, ownerAccepted: true },
      } as never),
    ).toThrow("GOVERNANCE_UNKNOWN_FIELD:ownerAccepted");
  });
});
