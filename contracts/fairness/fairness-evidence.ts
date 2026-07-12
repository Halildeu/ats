import { createHash } from "node:crypto";

export const FAIRNESS_EVIDENCE_SCHEMA_VERSION = "fairness-evidence/v1" as const;

export type FairnessScreeningStatus =
  | "SCREENING_SIGNAL_REVIEW_REQUIRED"
  | "NO_SCREENING_SIGNAL_OBSERVED"
  | "INSUFFICIENT_DATA";

export type FairnessInsufficiencyReason =
  | "GROUP_BELOW_MINIMUM_SIZE"
  | "MISSINGNESS_ABOVE_MAXIMUM"
  | "REFERENCE_SELECTION_RATE_ZERO";

export interface FairnessAggregateGroupV1 {
  readonly groupRef: `grp_${string}`;
  readonly populationCount: number;
  readonly selectedCount: number;
}

export interface SyntheticFairnessEvidenceInputV1 {
  readonly schemaVersion: typeof FAIRNESS_EVIDENCE_SCHEMA_VERSION;
  readonly synthetic: true;
  readonly tenantRef: string;
  readonly cohortRef: `cohort_${string}`;
  readonly dimensionRef: `dimension_${string}`;
  readonly referenceGroupRef: `grp_${string}`;
  readonly totalPopulationCount: number;
  readonly unassignedGroupCount: number;
  readonly groups: readonly FairnessAggregateGroupV1[];
  readonly minimumGroupSize: number;
  readonly maximumMissingnessRate: number;
  readonly fourFifthsThreshold: 0.8;
  readonly uncertaintyMethod: "WILSON_SCORE_95";
  readonly provenanceChainRef: string;
  readonly missingnessPlanRef: string;
  readonly confounderPlanRefs: readonly string[];
  readonly containsRawPii: false;
  readonly containsRawProtectedAttributes: false;
  readonly protectedAttributeAccess: "AUDIT_ONLY_AGGREGATED";
}

export interface WilsonIntervalV1 {
  readonly lower: number;
  readonly upper: number;
  readonly confidenceLevel: 0.95;
  readonly method: "WILSON_SCORE";
}

export interface FairnessAggregateResultV1 {
  readonly groupRef: `grp_${string}`;
  readonly populationCount: number;
  readonly selectedCount: number;
  readonly selectionRate: number;
  readonly selectionRateInterval: WilsonIntervalV1;
  readonly selectionRateRatio: number | null;
  readonly referenceGroup: boolean;
}

export interface SyntheticFairnessEvidenceReceiptV1 {
  readonly schemaVersion: typeof FAIRNESS_EVIDENCE_SCHEMA_VERSION;
  readonly synthetic: true;
  readonly tenantRef: string;
  readonly cohortRef: `cohort_${string}`;
  readonly dimensionRef: `dimension_${string}`;
  readonly referenceGroupRef: `grp_${string}`;
  readonly status: FairnessScreeningStatus;
  readonly insufficiencyReasons: readonly FairnessInsufficiencyReason[];
  readonly missingnessRate: number;
  readonly minimumGroupSize: number;
  readonly maximumMissingnessRate: number;
  readonly fourFifthsThreshold: 0.8;
  readonly uncertaintyMethod: "WILSON_SCORE_95";
  readonly results: readonly FairnessAggregateResultV1[];
  readonly provenanceChainRef: string;
  readonly missingnessPlanRef: string;
  readonly confounderPlanRefs: readonly string[];
  readonly screeningIndicatorOnly: true;
  readonly verdict: "NONE";
  readonly automatedEmploymentDecision: false;
  readonly individualActionAllowed: false;
  readonly productionEligible: false;
  readonly receiptDigest: `sha256:${string}`;
}

export interface FairnessAuditExportRequestV1 {
  readonly exportId: string;
  readonly tenantRef: string;
  readonly cohortRef: `cohort_${string}`;
  readonly evidenceReceiptDigest: `sha256:${string}`;
  readonly humanAuditorRef: string;
  readonly auditPurposeRef: string;
  readonly accessApprovalRef: string;
  readonly requestedAt: string;
}

export interface SyntheticFairnessAuditExportV1 {
  readonly schemaVersion: typeof FAIRNESS_EVIDENCE_SCHEMA_VERSION;
  readonly exportId: string;
  readonly synthetic: true;
  readonly aggregateOnly: true;
  readonly tenantRef: string;
  readonly cohortRef: `cohort_${string}`;
  readonly evidenceReceiptDigest: `sha256:${string}`;
  readonly humanAuditorRef: string;
  readonly auditPurposeRef: string;
  readonly accessApprovalRef: string;
  readonly requestedAt: string;
  readonly disposition: "SYNTHETIC_AGGREGATE_AUDIT_EXPORT";
  readonly evidenceGate: "SYNTHETIC_EVIDENCE_ONLY";
  readonly legalGate: "NOT_MET";
  readonly independentAuditGate: "NOT_MET";
  readonly ownerGate: "NOT_MET";
  readonly independentAuditCompleted: false;
  readonly realCohortAccepted: false;
  readonly complianceConclusion: "NONE";
  readonly actionAllowed: false;
  readonly productionEligible: false;
  readonly exportDigest: `sha256:${string}`;
}

const OPAQUE_GROUP_REF = /^grp_[a-f0-9]{16}$/;
const OPAQUE_COHORT_REF = /^cohort_[a-f0-9]{16}$/;
const OPAQUE_DIMENSION_REF = /^dimension_[a-f0-9]{16}$/;
const REF = /^[A-Za-z][A-Za-z0-9._:/-]{2,199}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const MAX_GROUPS = 100;
const MAX_TOTAL_POPULATION = 10_000_000;

const FORBIDDEN_KEYS = new Set([
  "candidateId",
  "employeeId",
  "personId",
  "personName",
  "email",
  "phone",
  "groupLabel",
  "protectedAttribute",
  "protectedGroup",
  "rawAttribute",
  "rawPii",
  "numericScore",
  "rankingScore",
  "candidateRank",
  "hireDecision",
  "rejectDecision",
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

function wilson95(selected: number, population: number): WilsonIntervalV1 {
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

function validateInput(input: SyntheticFairnessEvidenceInputV1): void {
  assertNoForbiddenKeys(input);
  assertOnlyKeys(
    input,
    [
      "schemaVersion",
      "synthetic",
      "tenantRef",
      "cohortRef",
      "dimensionRef",
      "referenceGroupRef",
      "totalPopulationCount",
      "unassignedGroupCount",
      "groups",
      "minimumGroupSize",
      "maximumMissingnessRate",
      "fourFifthsThreshold",
      "uncertaintyMethod",
      "provenanceChainRef",
      "missingnessPlanRef",
      "confounderPlanRefs",
      "containsRawPii",
      "containsRawProtectedAttributes",
      "protectedAttributeAccess",
    ],
    "INPUT_UNKNOWN_FIELD",
  );
  invariant(input.schemaVersion === FAIRNESS_EVIDENCE_SCHEMA_VERSION, "SCHEMA_VERSION_UNSUPPORTED");
  invariant(input.synthetic === true, "SYNTHETIC_ONLY");
  invariant(REF.test(input.tenantRef), "TENANT_REF_INVALID");
  invariant(OPAQUE_COHORT_REF.test(input.cohortRef), "COHORT_REF_NOT_OPAQUE");
  invariant(OPAQUE_DIMENSION_REF.test(input.dimensionRef), "DIMENSION_REF_NOT_OPAQUE");
  invariant(OPAQUE_GROUP_REF.test(input.referenceGroupRef), "REFERENCE_GROUP_REF_NOT_OPAQUE");
  invariant(
    Number.isInteger(input.totalPopulationCount) &&
      input.totalPopulationCount > 0 &&
      input.totalPopulationCount <= MAX_TOTAL_POPULATION,
    "TOTAL_POPULATION_INVALID",
  );
  invariant(
    Number.isInteger(input.unassignedGroupCount) && input.unassignedGroupCount >= 0,
    "UNASSIGNED_GROUP_COUNT_INVALID",
  );
  invariant(input.groups.length >= 2 && input.groups.length <= MAX_GROUPS, "GROUP_COUNT_INVALID");
  invariant(
    Number.isInteger(input.minimumGroupSize) && input.minimumGroupSize >= 2,
    "MINIMUM_GROUP_SIZE_INVALID",
  );
  invariant(
    Number.isFinite(input.maximumMissingnessRate) &&
      input.maximumMissingnessRate >= 0 &&
      input.maximumMissingnessRate <= 1,
    "MAXIMUM_MISSINGNESS_RATE_INVALID",
  );
  invariant(input.fourFifthsThreshold === 0.8, "FOUR_FIFTHS_THRESHOLD_FIXED");
  invariant(input.uncertaintyMethod === "WILSON_SCORE_95", "UNCERTAINTY_METHOD_INVALID");
  invariant(REF.test(input.provenanceChainRef), "PROVENANCE_CHAIN_REF_INVALID");
  invariant(REF.test(input.missingnessPlanRef), "MISSINGNESS_PLAN_REF_INVALID");
  invariant(input.confounderPlanRefs.length > 0, "CONFOUNDER_PLAN_REQUIRED");
  invariant(
    new Set(input.confounderPlanRefs).size === input.confounderPlanRefs.length &&
      input.confounderPlanRefs.every((item) => REF.test(item)),
    "CONFOUNDER_PLAN_REFS_INVALID",
  );
  invariant(input.containsRawPii === false, "RAW_PII_DISALLOWED");
  invariant(input.containsRawProtectedAttributes === false, "RAW_PROTECTED_ATTRIBUTES_DISALLOWED");
  invariant(input.protectedAttributeAccess === "AUDIT_ONLY_AGGREGATED", "PROTECTED_ACCESS_INVALID");

  let assignedPopulation = 0;
  for (const group of input.groups) {
    assertOnlyKeys(group, ["groupRef", "populationCount", "selectedCount"], "GROUP_UNKNOWN_FIELD");
    invariant(OPAQUE_GROUP_REF.test(group.groupRef), "GROUP_REF_NOT_OPAQUE");
    invariant(Number.isInteger(group.populationCount) && group.populationCount > 0, "GROUP_POPULATION_INVALID");
    invariant(
      Number.isInteger(group.selectedCount) &&
        group.selectedCount >= 0 &&
        group.selectedCount <= group.populationCount,
      "GROUP_SELECTED_COUNT_INVALID",
    );
    assignedPopulation += group.populationCount;
  }
  invariant(new Set(input.groups.map((item) => item.groupRef)).size === input.groups.length, "GROUP_REF_DUPLICATE");
  invariant(input.groups.some((item) => item.groupRef === input.referenceGroupRef), "REFERENCE_GROUP_MISSING");
  invariant(
    assignedPopulation + input.unassignedGroupCount === input.totalPopulationCount,
    "POPULATION_TOTAL_MISMATCH",
  );
}

export function evaluateSyntheticFairnessEvidence(
  input: SyntheticFairnessEvidenceInputV1,
): SyntheticFairnessEvidenceReceiptV1 {
  validateInput(input);
  const reference = input.groups.find((item) => item.groupRef === input.referenceGroupRef)!;
  const referenceRate = reference.selectedCount / reference.populationCount;
  const missingnessRate = input.unassignedGroupCount / input.totalPopulationCount;
  const insufficiencyReasons: FairnessInsufficiencyReason[] = [];
  if (input.groups.some((item) => item.populationCount < input.minimumGroupSize)) {
    insufficiencyReasons.push("GROUP_BELOW_MINIMUM_SIZE");
  }
  if (missingnessRate > input.maximumMissingnessRate) {
    insufficiencyReasons.push("MISSINGNESS_ABOVE_MAXIMUM");
  }
  if (referenceRate === 0) insufficiencyReasons.push("REFERENCE_SELECTION_RATE_ZERO");

  const results = input.groups.map((group): FairnessAggregateResultV1 => {
    const selectionRate = group.selectedCount / group.populationCount;
    return {
      groupRef: group.groupRef,
      populationCount: group.populationCount,
      selectedCount: group.selectedCount,
      selectionRate: round(selectionRate),
      selectionRateInterval: wilson95(group.selectedCount, group.populationCount),
      selectionRateRatio: referenceRate === 0 ? null : round(selectionRate / referenceRate),
      referenceGroup: group.groupRef === input.referenceGroupRef,
    };
  });

  let status: FairnessScreeningStatus = "INSUFFICIENT_DATA";
  if (insufficiencyReasons.length === 0) {
    status = results.some(
      (item) => !item.referenceGroup && item.selectionRateRatio! < input.fourFifthsThreshold,
    )
      ? "SCREENING_SIGNAL_REVIEW_REQUIRED"
      : "NO_SCREENING_SIGNAL_OBSERVED";
  }

  const unsigned = {
    schemaVersion: FAIRNESS_EVIDENCE_SCHEMA_VERSION,
    synthetic: true as const,
    tenantRef: input.tenantRef,
    cohortRef: input.cohortRef,
    dimensionRef: input.dimensionRef,
    referenceGroupRef: input.referenceGroupRef,
    status,
    insufficiencyReasons,
    missingnessRate: round(missingnessRate),
    minimumGroupSize: input.minimumGroupSize,
    maximumMissingnessRate: input.maximumMissingnessRate,
    fourFifthsThreshold: 0.8 as const,
    uncertaintyMethod: "WILSON_SCORE_95" as const,
    results,
    provenanceChainRef: input.provenanceChainRef,
    missingnessPlanRef: input.missingnessPlanRef,
    confounderPlanRefs: [...input.confounderPlanRefs],
    screeningIndicatorOnly: true as const,
    verdict: "NONE" as const,
    automatedEmploymentDecision: false as const,
    individualActionAllowed: false as const,
    productionEligible: false as const,
  };
  return clone({ ...unsigned, receiptDigest: sha256(unsigned) });
}

function validateAuditRequest(
  receipt: SyntheticFairnessEvidenceReceiptV1,
  request: FairnessAuditExportRequestV1,
): void {
  assertNoForbiddenKeys(receipt);
  assertOnlyKeys(
    receipt,
    [
      "schemaVersion",
      "synthetic",
      "tenantRef",
      "cohortRef",
      "dimensionRef",
      "referenceGroupRef",
      "status",
      "insufficiencyReasons",
      "missingnessRate",
      "minimumGroupSize",
      "maximumMissingnessRate",
      "fourFifthsThreshold",
      "uncertaintyMethod",
      "results",
      "provenanceChainRef",
      "missingnessPlanRef",
      "confounderPlanRefs",
      "screeningIndicatorOnly",
      "verdict",
      "automatedEmploymentDecision",
      "individualActionAllowed",
      "productionEligible",
      "receiptDigest",
    ],
    "EVIDENCE_RECEIPT_UNKNOWN_FIELD",
  );
  const { receiptDigest, ...unsignedReceipt } = receipt;
  invariant(DIGEST.test(receiptDigest), "EVIDENCE_RECEIPT_DIGEST_INVALID");
  invariant(sha256(unsignedReceipt) === receiptDigest, "EVIDENCE_RECEIPT_TAMPERED");
  invariant(
    receipt.schemaVersion === FAIRNESS_EVIDENCE_SCHEMA_VERSION &&
      receipt.synthetic === true &&
      receipt.screeningIndicatorOnly === true &&
      receipt.verdict === "NONE" &&
      receipt.automatedEmploymentDecision === false &&
      receipt.individualActionAllowed === false &&
      receipt.productionEligible === false,
    "EVIDENCE_RECEIPT_POLICY_INVALID",
  );
  assertNoForbiddenKeys(request);
  assertOnlyKeys(
    request,
    [
      "exportId",
      "tenantRef",
      "cohortRef",
      "evidenceReceiptDigest",
      "humanAuditorRef",
      "auditPurposeRef",
      "accessApprovalRef",
      "requestedAt",
    ],
    "AUDIT_REQUEST_UNKNOWN_FIELD",
  );
  invariant(REF.test(request.exportId), "EXPORT_ID_INVALID");
  invariant(request.tenantRef === receipt.tenantRef, "TENANT_SCOPE_MISMATCH");
  invariant(request.cohortRef === receipt.cohortRef, "COHORT_SCOPE_MISMATCH");
  invariant(DIGEST.test(request.evidenceReceiptDigest), "EVIDENCE_RECEIPT_DIGEST_INVALID");
  invariant(request.evidenceReceiptDigest === receipt.receiptDigest, "EVIDENCE_RECEIPT_DIGEST_MISMATCH");
  invariant(REF.test(request.humanAuditorRef), "HUMAN_AUDITOR_REF_REQUIRED");
  invariant(REF.test(request.auditPurposeRef), "AUDIT_PURPOSE_REF_REQUIRED");
  invariant(REF.test(request.accessApprovalRef), "ACCESS_APPROVAL_REF_REQUIRED");
  const requestedAt = Date.parse(request.requestedAt);
  invariant(Number.isFinite(requestedAt) && request.requestedAt.endsWith("Z"), "REQUESTED_AT_INVALID");
}

export class SyntheticFairnessAuditExporter {
  private readonly exports = new Map<string, { requestDigest: string; value: SyntheticFairnessAuditExportV1 }>();

  export(
    receipt: SyntheticFairnessEvidenceReceiptV1,
    request: FairnessAuditExportRequestV1,
  ): SyntheticFairnessAuditExportV1 {
    validateAuditRequest(receipt, request);
    const key = `${request.tenantRef}:${request.exportId}`;
    const requestDigest = sha256({ receipt, request });
    const existing = this.exports.get(key);
    if (existing) {
      invariant(existing.requestDigest === requestDigest, "EXPORT_ID_CONFLICT");
      return clone(existing.value);
    }

    const unsigned = {
      schemaVersion: FAIRNESS_EVIDENCE_SCHEMA_VERSION,
      exportId: request.exportId,
      synthetic: true as const,
      aggregateOnly: true as const,
      tenantRef: request.tenantRef,
      cohortRef: request.cohortRef,
      evidenceReceiptDigest: request.evidenceReceiptDigest,
      humanAuditorRef: request.humanAuditorRef,
      auditPurposeRef: request.auditPurposeRef,
      accessApprovalRef: request.accessApprovalRef,
      requestedAt: request.requestedAt,
      disposition: "SYNTHETIC_AGGREGATE_AUDIT_EXPORT" as const,
      evidenceGate: "SYNTHETIC_EVIDENCE_ONLY" as const,
      legalGate: "NOT_MET" as const,
      independentAuditGate: "NOT_MET" as const,
      ownerGate: "NOT_MET" as const,
      independentAuditCompleted: false as const,
      realCohortAccepted: false as const,
      complianceConclusion: "NONE" as const,
      actionAllowed: false as const,
      productionEligible: false as const,
    };
    const value: SyntheticFairnessAuditExportV1 = clone({
      ...unsigned,
      exportDigest: sha256(unsigned),
    });
    this.exports.set(key, { requestDigest, value });
    return clone(value);
  }
}
