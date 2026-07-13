import { createHash } from "node:crypto";

/**
 * Faz 25 P6.0 — synthetic, aggregate-only Quality-of-Hire evidence contract.
 *
 * This contract deliberately cannot activate a real-data workflow or produce an
 * employment/performance action. It is bound to the existing
 * intelligence-evaluation/v1 QOH capability and exposes only descriptive,
 * contestable outcome associations.
 */

export const QUALITY_OF_HIRE_EVIDENCE_SCHEMA_VERSION =
  "quality-of-hire-evidence/v1" as const;
export const QUALITY_OF_HIRE_CAPABILITY_REF = "capability:qoh:v1" as const;
export const QUALITY_OF_HIRE_INTELLIGENCE_AUTHORITY =
  "intelligence-evaluation/v1" as const;

export type QualityOfHireWindowDays = 90 | 180;

export type QualityOfHireOutcomeDimension =
  | "RETENTION"
  | "RAMP_MILESTONE"
  | "STRUCTURED_MANAGER_OUTCOME"
  | "NEW_HIRE_EXPERIENCE";

export type QualityOfHireEvidenceStatus =
  | "SYNTHETIC_DESCRIPTIVE_ASSOCIATION"
  | "INSUFFICIENT_DATA";

export type QualityOfHireInsufficiencyReason =
  | "STATISTICAL_SAMPLE_BELOW_MINIMUM"
  | "DISCLOSURE_SAMPLE_BELOW_MINIMUM"
  | "MISSINGNESS_ABOVE_MAXIMUM";

export type QualityOfHireComparisonKind =
  | "NONE"
  | "PREREGISTERED_DESCRIPTIVE_BASELINE";

export interface QualityOfHireComparisonProtocolV1 {
  readonly kind: QualityOfHireComparisonKind;
  readonly protocolRef: string;
  readonly baselineRef: string | null;
  readonly preregistered: true;
  readonly causalClaimAllowed: false;
}

export interface QualityOfHireAggregateDimensionInputV1 {
  readonly kind: QualityOfHireOutcomeDimension;
  readonly outcomeCategoryRef: string;
  readonly eligibleCount: number;
  readonly observedCount: number;
  readonly missingCount: number;
  readonly censoredCount: number;
  readonly outcomeCategoryCount: number;
}

export interface QualityOfHireObservationWindowInputV1 {
  readonly windowDays: QualityOfHireWindowDays;
  readonly dimensions: readonly QualityOfHireAggregateDimensionInputV1[];
}

export interface QualityOfHireOutcomeLineageV1 {
  readonly hiringEvidenceAggregateRef: string;
  readonly hrisOutcomeSnapshotRef: string;
  readonly structuredHumanOutcomeReceiptRef: string;
  readonly newHireExperienceReceiptRef: string;
  readonly linkageProtocolRef: string;
  readonly linkageUsesDestroyableHmac: true;
  readonly sourceSchemaVersionRefs: readonly string[];
  readonly provenanceChainRef: string;
}

export interface QualityOfHireGovernanceRefsV1 {
  readonly purposeRef: string;
  readonly legalBasisReviewRef: string;
  readonly retentionPolicyRef: string;
  readonly accessPolicyRef: string;
  readonly suppressionPolicyRef: string;
  readonly differencingControlRef: string;
  readonly queryBudgetPolicyRef: string;
  readonly erasurePropagationRef: string;
  readonly correctionPathRef: string;
  readonly appealPathRef: string;
  readonly auditPolicyRef: string;
  readonly humanOversightStandardRef: "human-oversight:canonical:v1";
}

export interface SyntheticQualityOfHireEvidenceInputV1 {
  readonly schemaVersion: typeof QUALITY_OF_HIRE_EVIDENCE_SCHEMA_VERSION;
  readonly intelligenceEvaluationAuthority: typeof QUALITY_OF_HIRE_INTELLIGENCE_AUTHORITY;
  readonly capabilityRef: typeof QUALITY_OF_HIRE_CAPABILITY_REF;
  readonly synthetic: true;
  readonly aggregateOnly: true;
  readonly tenantRef: `tenant_${string}`;
  readonly cohortRef: `cohort_${string}`;
  readonly measurementPlanRef: string;
  readonly measurementPlanVersionRef: string;
  readonly preregistrationDigest: `sha256:${string}`;
  readonly cohortDefinitionRef: string;
  readonly cohortDefinitionVersionRef: string;
  readonly comparisonProtocol: QualityOfHireComparisonProtocolV1;
  readonly dataCutoffAt: string;
  readonly minimumStatisticalSampleSize: number;
  readonly minimumDisclosureSampleSize: number;
  readonly maximumMissingnessRate: number;
  readonly observationWindows: readonly QualityOfHireObservationWindowInputV1[];
  readonly missingnessPlanRef: string;
  readonly confounderPlanRefs: readonly string[];
  readonly uncertaintyMethod: "WILSON_SCORE_95";
  readonly groundTruthStatus: "CONTESTABLE_HUMAN_REPORTED_OUTCOME";
  readonly lineage: QualityOfHireOutcomeLineageV1;
  readonly governance: QualityOfHireGovernanceRefsV1;
  readonly containsRawPii: false;
  readonly containsRawProtectedAttributes: false;
  readonly containsRawEmployeePerformanceData: false;
  readonly containsPersonLevelOutcome: false;
  readonly causalClaimAllowed: false;
  readonly candidateRankingAllowed: false;
  readonly retrospectiveCandidateRankingAllowed: false;
  readonly retrospectiveCandidateScoringAllowed: false;
  readonly automatedEmploymentDecisionAllowed: false;
  readonly modelTrainingUseAllowed: false;
  readonly selectionModelOptimizationAllowed: false;
  readonly protectedAttributeOptimizationAllowed: false;
  readonly proxyFeatureOptimizationAllowed: false;
  readonly employeePerformanceActionAllowed: false;
  readonly internalMobilityRankingAllowed: false;
  readonly singleCompositeQohScore: "DISALLOWED";
  readonly humanReviewRequired: true;
  readonly humanActionAllowed: false;
  readonly correctionReasonRef: string | null;
  readonly supersedesReceiptDigest: `sha256:${string}` | null;
}

export interface QualityOfHireWilsonIntervalV1 {
  readonly lower: number;
  readonly upper: number;
  readonly confidenceLevel: 0.95;
  readonly method: "WILSON_SCORE";
}

export interface QualityOfHireAggregateDimensionResultV1 {
  readonly kind: QualityOfHireOutcomeDimension;
  readonly outcomeCategoryRef: string;
  readonly visibility: "VISIBLE" | "SUPPRESSED_INSUFFICIENT_DATA";
  readonly eligibleCount: number | null;
  readonly observedCount: number | null;
  readonly missingCount: number | null;
  readonly censoredCount: number | null;
  readonly outcomeCategoryCount: number | null;
  readonly missingnessRate: number | null;
  readonly outcomeCategoryRate: number | null;
  readonly uncertaintyInterval: QualityOfHireWilsonIntervalV1 | null;
}

export interface QualityOfHireObservationWindowResultV1 {
  readonly windowDays: QualityOfHireWindowDays;
  readonly dimensions: readonly QualityOfHireAggregateDimensionResultV1[];
}

export interface SyntheticQualityOfHireEvidenceReceiptV1 {
  readonly schemaVersion: typeof QUALITY_OF_HIRE_EVIDENCE_SCHEMA_VERSION;
  readonly intelligenceEvaluationAuthority: typeof QUALITY_OF_HIRE_INTELLIGENCE_AUTHORITY;
  readonly capabilityRef: typeof QUALITY_OF_HIRE_CAPABILITY_REF;
  readonly synthetic: true;
  readonly aggregateOnly: true;
  readonly outputMode: "AGGREGATE_RESEARCH_EVIDENCE";
  readonly tenantRef: `tenant_${string}`;
  readonly cohortRef: `cohort_${string}`;
  readonly measurementPlanRef: string;
  readonly measurementPlanVersionRef: string;
  readonly preregistrationDigest: `sha256:${string}`;
  readonly cohortDefinitionRef: string;
  readonly cohortDefinitionVersionRef: string;
  readonly comparisonProtocol: QualityOfHireComparisonProtocolV1;
  readonly dataCutoffAt: string;
  readonly minimumStatisticalSampleSize: number;
  readonly minimumDisclosureSampleSize: number;
  readonly maximumMissingnessRate: number;
  readonly missingnessPlanRef: string;
  readonly confounderPlanRefs: readonly string[];
  readonly uncertaintyMethod: "WILSON_SCORE_95";
  readonly groundTruthStatus: "CONTESTABLE_HUMAN_REPORTED_OUTCOME";
  readonly lineage: QualityOfHireOutcomeLineageV1;
  readonly governance: QualityOfHireGovernanceRefsV1;
  readonly containsRawPii: false;
  readonly containsRawProtectedAttributes: false;
  readonly containsRawEmployeePerformanceData: false;
  readonly containsPersonLevelOutcome: false;
  readonly causalClaimAllowed: false;
  readonly candidateRankingAllowed: false;
  readonly retrospectiveCandidateRankingAllowed: false;
  readonly retrospectiveCandidateScoringAllowed: false;
  readonly automatedEmploymentDecisionAllowed: false;
  readonly modelTrainingUseAllowed: false;
  readonly selectionModelOptimizationAllowed: false;
  readonly protectedAttributeOptimizationAllowed: false;
  readonly proxyFeatureOptimizationAllowed: false;
  readonly employeePerformanceActionAllowed: false;
  readonly internalMobilityRankingAllowed: false;
  readonly singleCompositeQohScore: "DISALLOWED";
  readonly humanReviewRequired: true;
  readonly humanActionAllowed: false;
  readonly correctionReasonRef: string | null;
  readonly supersedesReceiptDigest: `sha256:${string}` | null;
  readonly correctionStatus: "ORIGINAL" | "SUPERSEDING_SYNTHETIC_CORRECTION";
  readonly status: QualityOfHireEvidenceStatus;
  readonly insufficiencyReasons: readonly QualityOfHireInsufficiencyReason[];
  readonly observationWindows: readonly QualityOfHireObservationWindowResultV1[];
  readonly correlationOnly: true;
  readonly causalConclusion: "NONE";
  readonly complianceConclusion: "NONE";
  readonly evidenceGate: "SYNTHETIC_EVIDENCE_ONLY";
  readonly legalGate: "NOT_MET";
  readonly independentAuditGate: "NOT_MET";
  readonly customerControllerGate: "NOT_MET";
  readonly ownerGate: "NOT_MET";
  readonly realDataAccepted: false;
  readonly realActivationAllowed: false;
  readonly productionEligible: false;
  readonly receiptDigest: `sha256:${string}`;
}

const REQUIRED_DIMENSIONS: readonly QualityOfHireOutcomeDimension[] = [
  "RETENTION",
  "RAMP_MILESTONE",
  "STRUCTURED_MANAGER_OUTCOME",
  "NEW_HIRE_EXPERIENCE",
] as const;
const REQUIRED_WINDOWS: readonly QualityOfHireWindowDays[] = [90, 180] as const;
const OPAQUE_TENANT_REF = /^tenant_[a-f0-9]{16}$/;
const OPAQUE_COHORT_REF = /^cohort_[a-f0-9]{16}$/;
const OPAQUE_OUTCOME_CATEGORY_REF = /^category_[a-f0-9]{16}$/;
const REF = /^[A-Za-z][A-Za-z0-9._:/-]{2,199}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const TIMESTAMP = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?Z$/;
const MAX_COUNT = 10_000_000;

const FORBIDDEN_KEYS = new Set([
  "candidateId",
  "employeeId",
  "personId",
  "personName",
  "email",
  "phone",
  "protectedAttribute",
  "protectedGroup",
  "rawAttribute",
  "rawPii",
  "rawEmployeePerformance",
  "rawPerformanceText",
  "performanceScore",
  "qohScore",
  "compositeScore",
  "singleScore",
  "numericScore",
  "rankingScore",
  "candidateRank",
  "modelTrainingPayload",
  "rawMetricValue",
  "hireDecision",
  "rejectDecision",
  "autoDecision",
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

function assertRef(value: string, code: string): void {
  invariant(REF.test(value), code);
}

function assertRefList(values: readonly string[], code: string): void {
  invariant(values.length > 0 && values.length <= 20, code);
  invariant(new Set(values).size === values.length, code);
  invariant(values.every((value) => REF.test(value)), code);
}

function assertDigest(value: string, code: string): void {
  invariant(DIGEST.test(value), code);
}

function assertTimestamp(value: string, code: string): void {
  invariant(TIMESTAMP.test(value) && Number.isFinite(Date.parse(value)), code);
}

function assertCount(value: number, allowZero: boolean, code: string): void {
  invariant(
    Number.isInteger(value) &&
      value >= (allowZero ? 0 : 1) &&
      value <= MAX_COUNT,
    code,
  );
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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

function sha256(value: unknown): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(canonical(value)).digest("hex")}`;
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function wilson95(selected: number, population: number): QualityOfHireWilsonIntervalV1 {
  const z = 1.959963984540054;
  const zSquared = z * z;
  const observed = selected / population;
  const denominator = 1 + zSquared / population;
  const center = (observed + zSquared / (2 * population)) / denominator;
  const margin =
    (z * Math.sqrt((observed * (1 - observed) + zSquared / (4 * population)) / population)) /
    denominator;
  return {
    lower: round(Math.max(0, center - margin)),
    upper: round(Math.min(1, center + margin)),
    confidenceLevel: 0.95,
    method: "WILSON_SCORE",
  };
}

function validateInput(input: SyntheticQualityOfHireEvidenceInputV1): void {
  assertNoForbiddenKeys(input);
  assertOnlyKeys(
    input,
    [
      "schemaVersion",
      "intelligenceEvaluationAuthority",
      "capabilityRef",
      "synthetic",
      "aggregateOnly",
      "tenantRef",
      "cohortRef",
      "measurementPlanRef",
      "measurementPlanVersionRef",
      "preregistrationDigest",
      "cohortDefinitionRef",
      "cohortDefinitionVersionRef",
      "comparisonProtocol",
      "dataCutoffAt",
      "minimumStatisticalSampleSize",
      "minimumDisclosureSampleSize",
      "maximumMissingnessRate",
      "observationWindows",
      "missingnessPlanRef",
      "confounderPlanRefs",
      "uncertaintyMethod",
      "groundTruthStatus",
      "lineage",
      "governance",
      "containsRawPii",
      "containsRawProtectedAttributes",
      "containsRawEmployeePerformanceData",
      "containsPersonLevelOutcome",
      "causalClaimAllowed",
      "candidateRankingAllowed",
      "retrospectiveCandidateRankingAllowed",
      "retrospectiveCandidateScoringAllowed",
      "automatedEmploymentDecisionAllowed",
      "modelTrainingUseAllowed",
      "selectionModelOptimizationAllowed",
      "protectedAttributeOptimizationAllowed",
      "proxyFeatureOptimizationAllowed",
      "employeePerformanceActionAllowed",
      "internalMobilityRankingAllowed",
      "singleCompositeQohScore",
      "humanReviewRequired",
      "humanActionAllowed",
      "correctionReasonRef",
      "supersedesReceiptDigest",
    ],
    "INPUT_UNKNOWN_FIELD",
  );

  invariant(input.schemaVersion === QUALITY_OF_HIRE_EVIDENCE_SCHEMA_VERSION, "SCHEMA_VERSION_UNSUPPORTED");
  invariant(
    input.intelligenceEvaluationAuthority === QUALITY_OF_HIRE_INTELLIGENCE_AUTHORITY,
    "INTELLIGENCE_AUTHORITY_MISMATCH",
  );
  invariant(input.capabilityRef === QUALITY_OF_HIRE_CAPABILITY_REF, "QOH_CAPABILITY_REF_MISMATCH");
  invariant(input.synthetic === true, "SYNTHETIC_ONLY");
  invariant(input.aggregateOnly === true, "AGGREGATE_ONLY");
  invariant(OPAQUE_TENANT_REF.test(input.tenantRef), "TENANT_REF_NOT_OPAQUE");
  invariant(OPAQUE_COHORT_REF.test(input.cohortRef), "COHORT_REF_NOT_OPAQUE");
  assertRef(input.measurementPlanRef, "MEASUREMENT_PLAN_REF_INVALID");
  assertRef(input.measurementPlanVersionRef, "MEASUREMENT_PLAN_VERSION_REF_INVALID");
  assertDigest(input.preregistrationDigest, "PREREGISTRATION_DIGEST_INVALID");
  assertRef(input.cohortDefinitionRef, "COHORT_DEFINITION_REF_INVALID");
  assertRef(input.cohortDefinitionVersionRef, "COHORT_DEFINITION_VERSION_REF_INVALID");
  assertTimestamp(input.dataCutoffAt, "DATA_CUTOFF_INVALID");
  assertCount(input.minimumStatisticalSampleSize, false, "STATISTICAL_MINIMUM_INVALID");
  assertCount(input.minimumDisclosureSampleSize, false, "DISCLOSURE_MINIMUM_INVALID");
  invariant(
    Number.isFinite(input.maximumMissingnessRate) &&
      input.maximumMissingnessRate >= 0 &&
      input.maximumMissingnessRate <= 1,
    "MAXIMUM_MISSINGNESS_RATE_INVALID",
  );
  invariant(input.uncertaintyMethod === "WILSON_SCORE_95", "UNCERTAINTY_METHOD_INVALID");
  invariant(
    input.groundTruthStatus === "CONTESTABLE_HUMAN_REPORTED_OUTCOME",
    "GROUND_TRUTH_OVERCLAIM",
  );
  assertRef(input.missingnessPlanRef, "MISSINGNESS_PLAN_REF_INVALID");
  assertRefList(input.confounderPlanRefs, "CONFOUNDER_PLAN_REFS_INVALID");

  const comparison = input.comparisonProtocol;
  assertOnlyKeys(
    comparison,
    ["kind", "protocolRef", "baselineRef", "preregistered", "causalClaimAllowed"],
    "COMPARISON_UNKNOWN_FIELD",
  );
  invariant(
    comparison.kind === "NONE" || comparison.kind === "PREREGISTERED_DESCRIPTIVE_BASELINE",
    "COMPARISON_KIND_INVALID",
  );
  assertRef(comparison.protocolRef, "COMPARISON_PROTOCOL_REF_INVALID");
  invariant(comparison.preregistered === true, "COMPARISON_NOT_PREREGISTERED");
  invariant(comparison.causalClaimAllowed === false, "CAUSAL_COMPARISON_DISALLOWED");
  if (comparison.kind === "NONE") {
    invariant(comparison.baselineRef === null, "BASELINE_FORBIDDEN_WITH_NONE");
  } else {
    invariant(comparison.baselineRef !== null, "BASELINE_REF_REQUIRED");
    assertRef(comparison.baselineRef, "BASELINE_REF_INVALID");
  }

  const lineage = input.lineage;
  assertOnlyKeys(
    lineage,
    [
      "hiringEvidenceAggregateRef",
      "hrisOutcomeSnapshotRef",
      "structuredHumanOutcomeReceiptRef",
      "newHireExperienceReceiptRef",
      "linkageProtocolRef",
      "linkageUsesDestroyableHmac",
      "sourceSchemaVersionRefs",
      "provenanceChainRef",
    ],
    "LINEAGE_UNKNOWN_FIELD",
  );
  assertRef(lineage.hiringEvidenceAggregateRef, "HIRING_EVIDENCE_REF_INVALID");
  assertRef(lineage.hrisOutcomeSnapshotRef, "HRIS_OUTCOME_REF_INVALID");
  assertRef(lineage.structuredHumanOutcomeReceiptRef, "HUMAN_OUTCOME_REF_INVALID");
  assertRef(lineage.newHireExperienceReceiptRef, "NEW_HIRE_EXPERIENCE_REF_INVALID");
  assertRef(lineage.linkageProtocolRef, "LINKAGE_PROTOCOL_REF_INVALID");
  invariant(lineage.linkageUsesDestroyableHmac === true, "DESTROYABLE_HMAC_LINKAGE_REQUIRED");
  assertRefList(lineage.sourceSchemaVersionRefs, "SOURCE_SCHEMA_VERSION_REFS_INVALID");
  assertRef(lineage.provenanceChainRef, "PROVENANCE_CHAIN_REF_INVALID");

  const governance = input.governance;
  assertOnlyKeys(
    governance,
    [
      "purposeRef",
      "legalBasisReviewRef",
      "retentionPolicyRef",
      "accessPolicyRef",
      "suppressionPolicyRef",
      "differencingControlRef",
      "queryBudgetPolicyRef",
      "erasurePropagationRef",
      "correctionPathRef",
      "appealPathRef",
      "auditPolicyRef",
      "humanOversightStandardRef",
    ],
    "GOVERNANCE_UNKNOWN_FIELD",
  );
  for (const [key, value] of Object.entries(governance)) {
    assertRef(value, `GOVERNANCE_REF_INVALID:${key}`);
  }
  invariant(
    governance.humanOversightStandardRef === "human-oversight:canonical:v1",
    "HUMAN_OVERSIGHT_AUTHORITY_MISMATCH",
  );

  invariant(input.observationWindows.length === REQUIRED_WINDOWS.length, "WINDOW_SET_INCOMPLETE");
  const windowSet = new Set(input.observationWindows.map((window) => window.windowDays));
  invariant(
    windowSet.size === REQUIRED_WINDOWS.length && REQUIRED_WINDOWS.every((window) => windowSet.has(window)),
    "WINDOW_SET_INVALID",
  );
  for (const window of input.observationWindows) {
    assertOnlyKeys(window, ["windowDays", "dimensions"], "WINDOW_UNKNOWN_FIELD");
    invariant(REQUIRED_WINDOWS.includes(window.windowDays), "WINDOW_DAYS_INVALID");
    invariant(window.dimensions.length === REQUIRED_DIMENSIONS.length, "DIMENSION_SET_INCOMPLETE");
    const dimensionSet = new Set(window.dimensions.map((dimension) => dimension.kind));
    invariant(
      dimensionSet.size === REQUIRED_DIMENSIONS.length &&
        REQUIRED_DIMENSIONS.every((dimension) => dimensionSet.has(dimension)),
      "DIMENSION_SET_INVALID",
    );
    for (const dimension of window.dimensions) {
      assertOnlyKeys(
        dimension,
        [
          "kind",
          "outcomeCategoryRef",
          "eligibleCount",
          "observedCount",
          "missingCount",
          "censoredCount",
          "outcomeCategoryCount",
        ],
        "DIMENSION_UNKNOWN_FIELD",
      );
      invariant(REQUIRED_DIMENSIONS.includes(dimension.kind), "DIMENSION_KIND_INVALID");
      invariant(
        OPAQUE_OUTCOME_CATEGORY_REF.test(dimension.outcomeCategoryRef),
        "OUTCOME_CATEGORY_REF_NOT_OPAQUE",
      );
      assertCount(dimension.eligibleCount, false, "ELIGIBLE_COUNT_INVALID");
      assertCount(dimension.observedCount, true, "OBSERVED_COUNT_INVALID");
      assertCount(dimension.missingCount, true, "MISSING_COUNT_INVALID");
      assertCount(dimension.censoredCount, true, "CENSORED_COUNT_INVALID");
      assertCount(dimension.outcomeCategoryCount, true, "OUTCOME_CATEGORY_COUNT_INVALID");
      invariant(
        dimension.observedCount + dimension.missingCount + dimension.censoredCount ===
          dimension.eligibleCount,
        "OBSERVED_MISSING_CENSORED_TOTAL_MISMATCH",
      );
      invariant(
        dimension.outcomeCategoryCount <= dimension.observedCount,
        "OUTCOME_CATEGORY_COUNT_EXCEEDS_OBSERVED",
      );
    }
  }

  invariant(input.containsRawPii === false, "RAW_PII_DISALLOWED");
  invariant(input.containsRawProtectedAttributes === false, "RAW_PROTECTED_ATTRIBUTES_DISALLOWED");
  invariant(
    input.containsRawEmployeePerformanceData === false,
    "RAW_EMPLOYEE_PERFORMANCE_DISALLOWED",
  );
  invariant(input.containsPersonLevelOutcome === false, "PERSON_LEVEL_OUTCOME_DISALLOWED");
  invariant(input.causalClaimAllowed === false, "CAUSAL_CLAIM_DISALLOWED");
  invariant(input.candidateRankingAllowed === false, "CANDIDATE_RANKING_DISALLOWED");
  invariant(
    input.retrospectiveCandidateRankingAllowed === false,
    "RETROSPECTIVE_RANKING_DISALLOWED",
  );
  invariant(
    input.retrospectiveCandidateScoringAllowed === false,
    "RETROSPECTIVE_SCORING_DISALLOWED",
  );
  invariant(
    input.automatedEmploymentDecisionAllowed === false,
    "AUTOMATED_EMPLOYMENT_DECISION_DISALLOWED",
  );
  invariant(input.modelTrainingUseAllowed === false, "MODEL_TRAINING_USE_DISALLOWED");
  invariant(
    input.selectionModelOptimizationAllowed === false,
    "SELECTION_MODEL_OPTIMIZATION_DISALLOWED",
  );
  invariant(
    input.protectedAttributeOptimizationAllowed === false,
    "PROTECTED_ATTRIBUTE_OPTIMIZATION_DISALLOWED",
  );
  invariant(
    input.proxyFeatureOptimizationAllowed === false,
    "PROXY_FEATURE_OPTIMIZATION_DISALLOWED",
  );
  invariant(
    input.employeePerformanceActionAllowed === false,
    "EMPLOYEE_PERFORMANCE_ACTION_DISALLOWED",
  );
  invariant(input.internalMobilityRankingAllowed === false, "INTERNAL_MOBILITY_RANKING_DISALLOWED");
  invariant(input.singleCompositeQohScore === "DISALLOWED", "COMPOSITE_QOH_SCORE_DISALLOWED");
  invariant(input.humanReviewRequired === true, "HUMAN_REVIEW_REQUIRED");
  invariant(input.humanActionAllowed === false, "HUMAN_ACTION_DISALLOWED");

  const hasCorrectionReason = input.correctionReasonRef !== null;
  const hasSupersededReceipt = input.supersedesReceiptDigest !== null;
  invariant(hasCorrectionReason === hasSupersededReceipt, "CORRECTION_SUPERSESSION_PAIR_REQUIRED");
  if (input.correctionReasonRef !== null) {
    assertRef(input.correctionReasonRef, "CORRECTION_REASON_REF_INVALID");
  }
  if (input.supersedesReceiptDigest !== null) {
    assertDigest(input.supersedesReceiptDigest, "SUPERSEDES_RECEIPT_DIGEST_INVALID");
  }
}

function collectInsufficiencyReasons(
  input: SyntheticQualityOfHireEvidenceInputV1,
): QualityOfHireInsufficiencyReason[] {
  let statisticalSampleBelowMinimum = false;
  let disclosureSampleBelowMinimum = false;
  let missingnessAboveMaximum = false;
  for (const window of input.observationWindows) {
    for (const dimension of window.dimensions) {
      statisticalSampleBelowMinimum ||=
        dimension.observedCount < input.minimumStatisticalSampleSize;
      const disclosureCells = [
        dimension.outcomeCategoryCount,
        dimension.observedCount - dimension.outcomeCategoryCount,
        dimension.missingCount,
        dimension.censoredCount,
      ];
      disclosureSampleBelowMinimum ||=
        dimension.observedCount < input.minimumDisclosureSampleSize ||
        disclosureCells.some(
          (count) => count > 0 && count < input.minimumDisclosureSampleSize,
        );
      missingnessAboveMaximum ||=
        dimension.missingCount / dimension.eligibleCount > input.maximumMissingnessRate;
    }
  }
  const reasons: QualityOfHireInsufficiencyReason[] = [];
  if (statisticalSampleBelowMinimum) reasons.push("STATISTICAL_SAMPLE_BELOW_MINIMUM");
  if (disclosureSampleBelowMinimum) reasons.push("DISCLOSURE_SAMPLE_BELOW_MINIMUM");
  if (missingnessAboveMaximum) reasons.push("MISSINGNESS_ABOVE_MAXIMUM");
  return reasons;
}

function toResult(
  dimension: QualityOfHireAggregateDimensionInputV1,
  suppressed: boolean,
): QualityOfHireAggregateDimensionResultV1 {
  if (suppressed) {
    return {
      kind: dimension.kind,
      outcomeCategoryRef: dimension.outcomeCategoryRef,
      visibility: "SUPPRESSED_INSUFFICIENT_DATA",
      eligibleCount: null,
      observedCount: null,
      missingCount: null,
      censoredCount: null,
      outcomeCategoryCount: null,
      missingnessRate: null,
      outcomeCategoryRate: null,
      uncertaintyInterval: null,
    };
  }
  return {
    kind: dimension.kind,
    outcomeCategoryRef: dimension.outcomeCategoryRef,
    visibility: "VISIBLE",
    eligibleCount: dimension.eligibleCount,
    observedCount: dimension.observedCount,
    missingCount: dimension.missingCount,
    censoredCount: dimension.censoredCount,
    outcomeCategoryCount: dimension.outcomeCategoryCount,
    missingnessRate: round(dimension.missingCount / dimension.eligibleCount),
    outcomeCategoryRate: round(dimension.outcomeCategoryCount / dimension.observedCount),
    uncertaintyInterval: wilson95(dimension.outcomeCategoryCount, dimension.observedCount),
  };
}

function issueValidatedSyntheticQualityOfHireReceipt(
  input: SyntheticQualityOfHireEvidenceInputV1,
): SyntheticQualityOfHireEvidenceReceiptV1 {
  const insufficiencyReasons = collectInsufficiencyReasons(input);
  const suppressed = insufficiencyReasons.length > 0;
  const dimensionOrder = new Map(REQUIRED_DIMENSIONS.map((dimension, index) => [dimension, index]));
  const observationWindows = [...input.observationWindows]
    .sort((left, right) => left.windowDays - right.windowDays)
    .map((window): QualityOfHireObservationWindowResultV1 => ({
      windowDays: window.windowDays,
      dimensions: [...window.dimensions]
        .sort(
          (left, right) =>
            (dimensionOrder.get(left.kind) ?? Number.MAX_SAFE_INTEGER) -
            (dimensionOrder.get(right.kind) ?? Number.MAX_SAFE_INTEGER),
        )
        .map((dimension) => toResult(dimension, suppressed)),
    }));

  const unsigned = {
    schemaVersion: QUALITY_OF_HIRE_EVIDENCE_SCHEMA_VERSION,
    intelligenceEvaluationAuthority: QUALITY_OF_HIRE_INTELLIGENCE_AUTHORITY,
    capabilityRef: QUALITY_OF_HIRE_CAPABILITY_REF,
    synthetic: true,
    aggregateOnly: true,
    outputMode: "AGGREGATE_RESEARCH_EVIDENCE",
    tenantRef: input.tenantRef,
    cohortRef: input.cohortRef,
    measurementPlanRef: input.measurementPlanRef,
    measurementPlanVersionRef: input.measurementPlanVersionRef,
    preregistrationDigest: input.preregistrationDigest,
    cohortDefinitionRef: input.cohortDefinitionRef,
    cohortDefinitionVersionRef: input.cohortDefinitionVersionRef,
    comparisonProtocol: clone(input.comparisonProtocol),
    dataCutoffAt: input.dataCutoffAt,
    minimumStatisticalSampleSize: input.minimumStatisticalSampleSize,
    minimumDisclosureSampleSize: input.minimumDisclosureSampleSize,
    maximumMissingnessRate: input.maximumMissingnessRate,
    missingnessPlanRef: input.missingnessPlanRef,
    confounderPlanRefs: [...input.confounderPlanRefs].sort(),
    uncertaintyMethod: "WILSON_SCORE_95",
    groundTruthStatus: "CONTESTABLE_HUMAN_REPORTED_OUTCOME",
    lineage: {
      ...clone(input.lineage),
      sourceSchemaVersionRefs: [...input.lineage.sourceSchemaVersionRefs].sort(),
    },
    governance: clone(input.governance),
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
    correctionReasonRef: input.correctionReasonRef,
    supersedesReceiptDigest: input.supersedesReceiptDigest,
    correctionStatus:
      input.supersedesReceiptDigest === null
        ? "ORIGINAL"
        : "SUPERSEDING_SYNTHETIC_CORRECTION",
    status: suppressed ? "INSUFFICIENT_DATA" : "SYNTHETIC_DESCRIPTIVE_ASSOCIATION",
    insufficiencyReasons,
    observationWindows,
    correlationOnly: true,
    causalConclusion: "NONE",
    complianceConclusion: "NONE",
    evidenceGate: "SYNTHETIC_EVIDENCE_ONLY",
    legalGate: "NOT_MET",
    independentAuditGate: "NOT_MET",
    customerControllerGate: "NOT_MET",
    ownerGate: "NOT_MET",
    realDataAccepted: false,
    realActivationAllowed: false,
    productionEligible: false,
  } as const;
  const receiptDigest = sha256(unsigned);
  invariant(receiptDigest !== input.supersedesReceiptDigest, "SELF_SUPERSESSION_DISALLOWED");
  return { ...unsigned, receiptDigest };
}

export function evaluateSyntheticQualityOfHireEvidence(
  input: SyntheticQualityOfHireEvidenceInputV1,
): SyntheticQualityOfHireEvidenceReceiptV1 {
  validateInput(input);
  invariant(
    input.supersedesReceiptDigest === null,
    "CORRECTION_REQUIRES_TRUSTED_PREVIOUS_RECEIPT",
  );
  return issueValidatedSyntheticQualityOfHireReceipt(input);
}

function correctionMeasurementContext(
  value: SyntheticQualityOfHireEvidenceInputV1 | SyntheticQualityOfHireEvidenceReceiptV1,
): unknown {
  return {
    measurementPlanRef: value.measurementPlanRef,
    measurementPlanVersionRef: value.measurementPlanVersionRef,
    preregistrationDigest: value.preregistrationDigest,
    comparisonProtocol: value.comparisonProtocol,
    minimumStatisticalSampleSize: value.minimumStatisticalSampleSize,
    minimumDisclosureSampleSize: value.minimumDisclosureSampleSize,
    maximumMissingnessRate: value.maximumMissingnessRate,
    missingnessPlanRef: value.missingnessPlanRef,
    confounderPlanRefs: [...value.confounderPlanRefs].sort(),
    uncertaintyMethod: value.uncertaintyMethod,
    groundTruthStatus: value.groundTruthStatus,
  };
}

export function evaluateSyntheticQualityOfHireCorrection(
  input: SyntheticQualityOfHireEvidenceInputV1,
  trustedPreviousReceipt: unknown,
): SyntheticQualityOfHireEvidenceReceiptV1 {
  validateInput(input);
  invariant(
    input.supersedesReceiptDigest !== null,
    "CORRECTION_SUPERSESSION_REQUIRED",
  );
  invariant(
    trustedPreviousReceipt !== null && trustedPreviousReceipt !== undefined,
    "CORRECTION_TRUSTED_PREVIOUS_RECEIPT_REQUIRED",
  );
  verifySyntheticQualityOfHireReceipt(trustedPreviousReceipt);
  const previous = trustedPreviousReceipt;
  invariant(
    input.supersedesReceiptDigest === previous.receiptDigest,
    "CORRECTION_SUPERSEDED_DIGEST_MISMATCH",
  );
  invariant(input.tenantRef === previous.tenantRef, "CORRECTION_TENANT_CONTEXT_MISMATCH");
  invariant(input.cohortRef === previous.cohortRef, "CORRECTION_COHORT_CONTEXT_MISMATCH");
  invariant(
    input.capabilityRef === previous.capabilityRef,
    "CORRECTION_CAPABILITY_CONTEXT_MISMATCH",
  );
  invariant(
    canonical(correctionMeasurementContext(input)) ===
      canonical(correctionMeasurementContext(previous)),
    "CORRECTION_MEASUREMENT_CONTEXT_MISMATCH",
  );
  invariant(
    input.cohortDefinitionRef === previous.cohortDefinitionRef &&
      input.cohortDefinitionVersionRef === previous.cohortDefinitionVersionRef,
    "CORRECTION_COHORT_DEFINITION_CONTEXT_MISMATCH",
  );
  invariant(
    input.governance.correctionPathRef === previous.governance.correctionPathRef,
    "CORRECTION_POLICY_CONTEXT_MISMATCH",
  );
  invariant(
    Date.parse(input.dataCutoffAt) >= Date.parse(previous.dataCutoffAt),
    "CORRECTION_DATA_CUTOFF_REGRESSION",
  );
  return issueValidatedSyntheticQualityOfHireReceipt(input);
}

export function verifySyntheticQualityOfHireReceipt(
  receipt: unknown,
): asserts receipt is SyntheticQualityOfHireEvidenceReceiptV1 {
  invariant(
    receipt !== null && typeof receipt === "object" && !Array.isArray(receipt),
    "QOH_RECEIPT_OBJECT_REQUIRED",
  );
  assertNoForbiddenKeys(receipt);
  assertOnlyKeys(
    receipt,
    [
      "schemaVersion",
      "intelligenceEvaluationAuthority",
      "capabilityRef",
      "synthetic",
      "aggregateOnly",
      "outputMode",
      "tenantRef",
      "cohortRef",
      "measurementPlanRef",
      "measurementPlanVersionRef",
      "preregistrationDigest",
      "cohortDefinitionRef",
      "cohortDefinitionVersionRef",
      "comparisonProtocol",
      "dataCutoffAt",
      "minimumStatisticalSampleSize",
      "minimumDisclosureSampleSize",
      "maximumMissingnessRate",
      "missingnessPlanRef",
      "confounderPlanRefs",
      "uncertaintyMethod",
      "groundTruthStatus",
      "lineage",
      "governance",
      "containsRawPii",
      "containsRawProtectedAttributes",
      "containsRawEmployeePerformanceData",
      "containsPersonLevelOutcome",
      "causalClaimAllowed",
      "candidateRankingAllowed",
      "retrospectiveCandidateRankingAllowed",
      "retrospectiveCandidateScoringAllowed",
      "automatedEmploymentDecisionAllowed",
      "modelTrainingUseAllowed",
      "selectionModelOptimizationAllowed",
      "protectedAttributeOptimizationAllowed",
      "proxyFeatureOptimizationAllowed",
      "employeePerformanceActionAllowed",
      "internalMobilityRankingAllowed",
      "singleCompositeQohScore",
      "humanReviewRequired",
      "humanActionAllowed",
      "correctionReasonRef",
      "supersedesReceiptDigest",
      "correctionStatus",
      "status",
      "insufficiencyReasons",
      "observationWindows",
      "correlationOnly",
      "causalConclusion",
      "complianceConclusion",
      "evidenceGate",
      "legalGate",
      "independentAuditGate",
      "customerControllerGate",
      "ownerGate",
      "realDataAccepted",
      "realActivationAllowed",
      "productionEligible",
      "receiptDigest",
    ],
    "RECEIPT_UNKNOWN_FIELD",
  );

  const candidate = receipt as SyntheticQualityOfHireEvidenceReceiptV1;
  assertDigest(candidate.receiptDigest, "QOH_RECEIPT_DIGEST_INVALID");
  const { receiptDigest, ...unsigned } = candidate;
  invariant(sha256(unsigned) === receiptDigest, "QOH_RECEIPT_DIGEST_MISMATCH");

  invariant(candidate.outputMode === "AGGREGATE_RESEARCH_EVIDENCE", "QOH_OUTPUT_MODE_INVALID");
  invariant(candidate.correlationOnly === true, "QOH_CORRELATION_ONLY_REQUIRED");
  invariant(candidate.causalConclusion === "NONE", "QOH_CAUSAL_CONCLUSION_DISALLOWED");
  invariant(candidate.complianceConclusion === "NONE", "QOH_COMPLIANCE_OVERCLAIM");
  invariant(candidate.evidenceGate === "SYNTHETIC_EVIDENCE_ONLY", "QOH_EVIDENCE_GATE_INVALID");
  invariant(candidate.legalGate === "NOT_MET", "QOH_LEGAL_GATE_MUST_REMAIN_CLOSED");
  invariant(
    candidate.independentAuditGate === "NOT_MET",
    "QOH_AUDIT_GATE_MUST_REMAIN_CLOSED",
  );
  invariant(
    candidate.customerControllerGate === "NOT_MET",
    "QOH_CONTROLLER_GATE_MUST_REMAIN_CLOSED",
  );
  invariant(candidate.ownerGate === "NOT_MET", "QOH_OWNER_GATE_MUST_REMAIN_CLOSED");
  invariant(candidate.realDataAccepted === false, "QOH_REAL_DATA_ACCEPTANCE_DISALLOWED");
  invariant(candidate.realActivationAllowed === false, "QOH_REAL_ACTIVATION_DISALLOWED");
  invariant(candidate.productionEligible === false, "QOH_PRODUCTION_ELIGIBILITY_DISALLOWED");
  invariant(
    candidate.correctionStatus ===
      (candidate.supersedesReceiptDigest === null
        ? "ORIGINAL"
        : "SUPERSEDING_SYNTHETIC_CORRECTION"),
    "QOH_CORRECTION_STATUS_MISMATCH",
  );

  invariant(
    Array.isArray(candidate.observationWindows) &&
      candidate.observationWindows.length === REQUIRED_WINDOWS.length,
    "QOH_RECEIPT_WINDOW_SET_INVALID",
  );
  const reconstructedWindows: QualityOfHireObservationWindowInputV1[] = [];
  let allVisible = true;
  let allSuppressed = true;
  for (const [windowIndex, window] of candidate.observationWindows.entries()) {
    assertOnlyKeys(window, ["windowDays", "dimensions"], "RECEIPT_WINDOW_UNKNOWN_FIELD");
    invariant(
      window.windowDays === REQUIRED_WINDOWS[windowIndex],
      "QOH_RECEIPT_WINDOW_ORDER_INVALID",
    );
    invariant(
      Array.isArray(window.dimensions) &&
        window.dimensions.length === REQUIRED_DIMENSIONS.length,
      "QOH_RECEIPT_DIMENSION_SET_INVALID",
    );
    const reconstructedDimensions: QualityOfHireAggregateDimensionInputV1[] = [];
    for (const [dimensionIndex, dimension] of window.dimensions.entries()) {
      assertOnlyKeys(
        dimension,
        [
          "kind",
          "outcomeCategoryRef",
          "visibility",
          "eligibleCount",
          "observedCount",
          "missingCount",
          "censoredCount",
          "outcomeCategoryCount",
          "missingnessRate",
          "outcomeCategoryRate",
          "uncertaintyInterval",
        ],
        "RECEIPT_DIMENSION_UNKNOWN_FIELD",
      );
      invariant(
        dimension.kind === REQUIRED_DIMENSIONS[dimensionIndex],
        "QOH_RECEIPT_DIMENSION_ORDER_INVALID",
      );
      invariant(
        dimension.visibility === "VISIBLE" ||
          dimension.visibility === "SUPPRESSED_INSUFFICIENT_DATA",
        "QOH_RECEIPT_VISIBILITY_INVALID",
      );
      allVisible &&= dimension.visibility === "VISIBLE";
      allSuppressed &&= dimension.visibility === "SUPPRESSED_INSUFFICIENT_DATA";
      if (dimension.visibility === "VISIBLE") {
        invariant(
          dimension.eligibleCount !== null &&
            dimension.observedCount !== null &&
            dimension.missingCount !== null &&
            dimension.censoredCount !== null &&
            dimension.outcomeCategoryCount !== null &&
            dimension.missingnessRate !== null &&
            dimension.outcomeCategoryRate !== null &&
            dimension.uncertaintyInterval !== null,
          "QOH_VISIBLE_DIMENSION_INCOMPLETE",
        );
        reconstructedDimensions.push({
          kind: dimension.kind,
          outcomeCategoryRef: dimension.outcomeCategoryRef,
          eligibleCount: dimension.eligibleCount,
          observedCount: dimension.observedCount,
          missingCount: dimension.missingCount,
          censoredCount: dimension.censoredCount,
          outcomeCategoryCount: dimension.outcomeCategoryCount,
        });
      } else {
        invariant(
          dimension.eligibleCount === null &&
            dimension.observedCount === null &&
            dimension.missingCount === null &&
            dimension.censoredCount === null &&
            dimension.outcomeCategoryCount === null &&
            dimension.missingnessRate === null &&
            dimension.outcomeCategoryRate === null &&
            dimension.uncertaintyInterval === null,
          "QOH_SUPPRESSED_DIMENSION_DISCLOSURE",
        );
        reconstructedDimensions.push({
          kind: dimension.kind,
          outcomeCategoryRef: dimension.outcomeCategoryRef,
          eligibleCount: 1,
          observedCount: 1,
          missingCount: 0,
          censoredCount: 0,
          outcomeCategoryCount: 1,
        });
      }
    }
    reconstructedWindows.push({ windowDays: window.windowDays, dimensions: reconstructedDimensions });
  }

  const reconstructedInput: SyntheticQualityOfHireEvidenceInputV1 = {
    schemaVersion: candidate.schemaVersion,
    intelligenceEvaluationAuthority: candidate.intelligenceEvaluationAuthority,
    capabilityRef: candidate.capabilityRef,
    synthetic: candidate.synthetic,
    aggregateOnly: candidate.aggregateOnly,
    tenantRef: candidate.tenantRef,
    cohortRef: candidate.cohortRef,
    measurementPlanRef: candidate.measurementPlanRef,
    measurementPlanVersionRef: candidate.measurementPlanVersionRef,
    preregistrationDigest: candidate.preregistrationDigest,
    cohortDefinitionRef: candidate.cohortDefinitionRef,
    cohortDefinitionVersionRef: candidate.cohortDefinitionVersionRef,
    comparisonProtocol: candidate.comparisonProtocol,
    dataCutoffAt: candidate.dataCutoffAt,
    minimumStatisticalSampleSize: candidate.minimumStatisticalSampleSize,
    minimumDisclosureSampleSize: candidate.minimumDisclosureSampleSize,
    maximumMissingnessRate: candidate.maximumMissingnessRate,
    observationWindows: reconstructedWindows,
    missingnessPlanRef: candidate.missingnessPlanRef,
    confounderPlanRefs: candidate.confounderPlanRefs,
    uncertaintyMethod: candidate.uncertaintyMethod,
    groundTruthStatus: candidate.groundTruthStatus,
    lineage: candidate.lineage,
    governance: candidate.governance,
    containsRawPii: candidate.containsRawPii,
    containsRawProtectedAttributes: candidate.containsRawProtectedAttributes,
    containsRawEmployeePerformanceData: candidate.containsRawEmployeePerformanceData,
    containsPersonLevelOutcome: candidate.containsPersonLevelOutcome,
    causalClaimAllowed: candidate.causalClaimAllowed,
    candidateRankingAllowed: candidate.candidateRankingAllowed,
    retrospectiveCandidateRankingAllowed: candidate.retrospectiveCandidateRankingAllowed,
    retrospectiveCandidateScoringAllowed: candidate.retrospectiveCandidateScoringAllowed,
    automatedEmploymentDecisionAllowed: candidate.automatedEmploymentDecisionAllowed,
    modelTrainingUseAllowed: candidate.modelTrainingUseAllowed,
    selectionModelOptimizationAllowed: candidate.selectionModelOptimizationAllowed,
    protectedAttributeOptimizationAllowed: candidate.protectedAttributeOptimizationAllowed,
    proxyFeatureOptimizationAllowed: candidate.proxyFeatureOptimizationAllowed,
    employeePerformanceActionAllowed: candidate.employeePerformanceActionAllowed,
    internalMobilityRankingAllowed: candidate.internalMobilityRankingAllowed,
    singleCompositeQohScore: candidate.singleCompositeQohScore,
    humanReviewRequired: candidate.humanReviewRequired,
    humanActionAllowed: candidate.humanActionAllowed,
    correctionReasonRef: candidate.correctionReasonRef,
    supersedesReceiptDigest: candidate.supersedesReceiptDigest,
  };
  validateInput(reconstructedInput);
  invariant(
    canonical(candidate.confounderPlanRefs) ===
      canonical([...candidate.confounderPlanRefs].sort()),
    "QOH_CONFOUNDER_REFS_NOT_CANONICAL",
  );
  invariant(
    canonical(candidate.lineage.sourceSchemaVersionRefs) ===
      canonical([...candidate.lineage.sourceSchemaVersionRefs].sort()),
    "QOH_SOURCE_SCHEMA_REFS_NOT_CANONICAL",
  );
  invariant(
    candidate.receiptDigest !== candidate.supersedesReceiptDigest,
    "SELF_SUPERSESSION_DISALLOWED",
  );

  const insufficiencyReasonOrder: readonly QualityOfHireInsufficiencyReason[] = [
    "STATISTICAL_SAMPLE_BELOW_MINIMUM",
    "DISCLOSURE_SAMPLE_BELOW_MINIMUM",
    "MISSINGNESS_ABOVE_MAXIMUM",
  ];
  invariant(
    Array.isArray(candidate.insufficiencyReasons) &&
      new Set(candidate.insufficiencyReasons).size === candidate.insufficiencyReasons.length &&
      candidate.insufficiencyReasons.every((reason) => insufficiencyReasonOrder.includes(reason)) &&
      canonical(candidate.insufficiencyReasons) ===
        canonical(
          insufficiencyReasonOrder.filter((reason) =>
            candidate.insufficiencyReasons.includes(reason),
          ),
        ),
    "QOH_INSUFFICIENCY_REASONS_INVALID",
  );
  if (allVisible) {
    invariant(
      candidate.status === "SYNTHETIC_DESCRIPTIVE_ASSOCIATION" &&
        candidate.insufficiencyReasons.length === 0,
      "QOH_VISIBLE_STATUS_MISMATCH",
    );
    invariant(
      canonical(issueValidatedSyntheticQualityOfHireReceipt(reconstructedInput)) ===
        canonical(candidate),
      "QOH_RECEIPT_INVARIANT_MISMATCH",
    );
  } else {
    invariant(
      allSuppressed,
      "QOH_GLOBAL_SUPPRESSION_REQUIRED",
    );
    invariant(
      candidate.status === "INSUFFICIENT_DATA" && candidate.insufficiencyReasons.length > 0,
      "QOH_SUPPRESSED_STATUS_MISMATCH",
    );
  }
}
