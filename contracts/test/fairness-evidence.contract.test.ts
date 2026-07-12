import { describe, expect, it } from "vitest";
import {
  FAIRNESS_EVIDENCE_SCHEMA_VERSION,
  SyntheticFairnessAuditExporter,
  evaluateSyntheticFairnessEvidence,
  type FairnessAuditExportRequestV1,
  type SyntheticFairnessEvidenceInputV1,
} from "../fairness/fairness-evidence.js";

const referenceGroupRef = "grp_aaaaaaaaaaaaaaaa" as const;
const comparisonGroupRef = "grp_bbbbbbbbbbbbbbbb" as const;

function fixture(
  overrides: Partial<SyntheticFairnessEvidenceInputV1> = {},
): SyntheticFairnessEvidenceInputV1 {
  return {
    schemaVersion: FAIRNESS_EVIDENCE_SCHEMA_VERSION,
    synthetic: true,
    tenantRef: "tenant:synthetic:alpha",
    cohortRef: "cohort_1111111111111111",
    dimensionRef: "dimension_2222222222222222",
    referenceGroupRef,
    totalPopulationCount: 210,
    unassignedGroupCount: 10,
    groups: [
      { groupRef: referenceGroupRef, populationCount: 100, selectedCount: 50 },
      { groupRef: comparisonGroupRef, populationCount: 100, selectedCount: 35 },
    ],
    minimumGroupSize: 30,
    maximumMissingnessRate: 0.05,
    fourFifthsThreshold: 0.8,
    uncertaintyMethod: "WILSON_SCORE_95",
    provenanceChainRef: "provenance:fairness:synthetic:v1",
    missingnessPlanRef: "missingness:fairness:v1",
    confounderPlanRefs: ["confounder:fairness:v1"],
    containsRawPii: false,
    containsRawProtectedAttributes: false,
    protectedAttributeAccess: "AUDIT_ONLY_AGGREGATED",
    ...overrides,
  };
}

function auditRequest(
  receiptDigest: `sha256:${string}`,
  overrides: Partial<FairnessAuditExportRequestV1> = {},
): FairnessAuditExportRequestV1 {
  return {
    exportId: "export:fairness:synthetic:001",
    tenantRef: "tenant:synthetic:alpha",
    cohortRef: "cohort_1111111111111111",
    evidenceReceiptDigest: receiptDigest,
    humanAuditorRef: "human-auditor:synthetic:001",
    auditPurposeRef: "purpose:fairness-screening-review:v1",
    accessApprovalRef: "approval:aggregate-access:synthetic:001",
    requestedAt: "2026-07-13T12:00:00Z",
    ...overrides,
  };
}

describe("P6.1 synthetic fairness evidence", () => {
  it("reports a four-fifths screening signal with Wilson 95% intervals", () => {
    const receipt = evaluateSyntheticFairnessEvidence(fixture());

    expect(receipt.status).toBe("SCREENING_SIGNAL_REVIEW_REQUIRED");
    expect(receipt.missingnessRate).toBe(0.047619);
    expect(receipt.results).toEqual([
      {
        groupRef: referenceGroupRef,
        populationCount: 100,
        selectedCount: 50,
        selectionRate: 0.5,
        selectionRateInterval: {
          lower: 0.403832,
          upper: 0.596168,
          confidenceLevel: 0.95,
          method: "WILSON_SCORE",
        },
        selectionRateRatio: 1,
        referenceGroup: true,
      },
      {
        groupRef: comparisonGroupRef,
        populationCount: 100,
        selectedCount: 35,
        selectionRate: 0.35,
        selectionRateInterval: {
          lower: 0.263642,
          upper: 0.447456,
          confidenceLevel: 0.95,
          method: "WILSON_SCORE",
        },
        selectionRateRatio: 0.7,
        referenceGroup: false,
      },
    ]);
    expect(receipt.verdict).toBe("NONE");
    expect(receipt.individualActionAllowed).toBe(false);
    expect(receipt.automatedEmploymentDecision).toBe(false);
    expect(receipt.receiptDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("reports no observed screening signal without claiming fairness", () => {
    const receipt = evaluateSyntheticFairnessEvidence(
      fixture({
        groups: [
          { groupRef: referenceGroupRef, populationCount: 100, selectedCount: 50 },
          { groupRef: comparisonGroupRef, populationCount: 100, selectedCount: 45 },
        ],
      }),
    );

    expect(receipt.status).toBe("NO_SCREENING_SIGNAL_OBSERVED");
    expect(receipt.results[1]?.selectionRateRatio).toBe(0.9);
    expect(receipt.verdict).toBe("NONE");
    expect(receipt.productionEligible).toBe(false);
  });

  it("fails closed to insufficient data for undersized groups and excess missingness", () => {
    const receipt = evaluateSyntheticFairnessEvidence(
      fixture({
        totalPopulationCount: 230,
        unassignedGroupCount: 30,
        minimumGroupSize: 110,
      }),
    );

    expect(receipt.status).toBe("INSUFFICIENT_DATA");
    expect(receipt.insufficiencyReasons).toEqual([
      "GROUP_BELOW_MINIMUM_SIZE",
      "MISSINGNESS_ABOVE_MAXIMUM",
    ]);
  });

  it("fails closed when the reference selection rate is zero", () => {
    const receipt = evaluateSyntheticFairnessEvidence(
      fixture({
        groups: [
          { groupRef: referenceGroupRef, populationCount: 100, selectedCount: 0 },
          { groupRef: comparisonGroupRef, populationCount: 100, selectedCount: 20 },
        ],
      }),
    );

    expect(receipt.status).toBe("INSUFFICIENT_DATA");
    expect(receipt.insufficiencyReasons).toContain("REFERENCE_SELECTION_RATE_ZERO");
    expect(receipt.results.every((item) => item.selectionRateRatio === null)).toBe(true);
  });

  it("pins the threshold, aggregate access and synthetic-only protocol", () => {
    expect(() =>
      evaluateSyntheticFairnessEvidence({ ...fixture(), fourFifthsThreshold: 0.79 } as never),
    ).toThrow("FOUR_FIFTHS_THRESHOLD_FIXED");
    expect(() =>
      evaluateSyntheticFairnessEvidence({ ...fixture(), synthetic: false } as never),
    ).toThrow("SYNTHETIC_ONLY");
    expect(() =>
      evaluateSyntheticFairnessEvidence({
        ...fixture(),
        protectedAttributeAccess: "RAW",
      } as never),
    ).toThrow("PROTECTED_ACCESS_INVALID");
    expect(() =>
      evaluateSyntheticFairnessEvidence({
        ...fixture(),
        containsRawProtectedAttributes: true,
      } as never),
    ).toThrow("RAW_PROTECTED_ATTRIBUTES_DISALLOWED");
  });

  it("accepts only opaque cohort, dimension and group references", () => {
    expect(() =>
      evaluateSyntheticFairnessEvidence({ ...fixture(), referenceGroupRef: "group:female" } as never),
    ).toThrow("REFERENCE_GROUP_REF_NOT_OPAQUE");
    expect(() =>
      evaluateSyntheticFairnessEvidence({ ...fixture(), dimensionRef: "dimension:gender" } as never),
    ).toThrow("DIMENSION_REF_NOT_OPAQUE");
    expect(() =>
      evaluateSyntheticFairnessEvidence({
        ...fixture(),
        groups: [
          { groupRef: referenceGroupRef, populationCount: 100, selectedCount: 50 },
          { groupRef: "grp_not_opaque", populationCount: 100, selectedCount: 35 },
        ],
      } as never),
    ).toThrow("GROUP_REF_NOT_OPAQUE");
  });

  it("rejects inconsistent counts, duplicate groups and invalid selected counts", () => {
    expect(() =>
      evaluateSyntheticFairnessEvidence({ ...fixture(), totalPopulationCount: 211 }),
    ).toThrow("POPULATION_TOTAL_MISMATCH");
    expect(() =>
      evaluateSyntheticFairnessEvidence({
        ...fixture(),
        groups: [
          { groupRef: referenceGroupRef, populationCount: 100, selectedCount: 50 },
          { groupRef: referenceGroupRef, populationCount: 100, selectedCount: 35 },
        ],
      }),
    ).toThrow("GROUP_REF_DUPLICATE");
    expect(() =>
      evaluateSyntheticFairnessEvidence({
        ...fixture(),
        groups: [
          { groupRef: referenceGroupRef, populationCount: 100, selectedCount: 101 },
          { groupRef: comparisonGroupRef, populationCount: 100, selectedCount: 35 },
        ],
      }),
    ).toThrow("GROUP_SELECTED_COUNT_INVALID");
    expect(() =>
      evaluateSyntheticFairnessEvidence({
        ...fixture(),
        referenceGroupRef: "grp_cccccccccccccccc",
      }),
    ).toThrow("REFERENCE_GROUP_MISSING");
  });

  it("rejects forbidden or unknown fields at runtime", () => {
    expect(() =>
      evaluateSyntheticFairnessEvidence({ ...fixture(), candidateId: "candidate:1" } as never),
    ).toThrow("FORBIDDEN_FIELD:candidateId");
    expect(() =>
      evaluateSyntheticFairnessEvidence({ ...fixture(), legalVerdict: "COMPLIANT" } as never),
    ).toThrow("INPUT_UNKNOWN_FIELD:legalVerdict");
    expect(() =>
      evaluateSyntheticFairnessEvidence({
        ...fixture(),
        groups: [
          { groupRef: referenceGroupRef, populationCount: 100, selectedCount: 50, groupLabel: "A" },
          { groupRef: comparisonGroupRef, populationCount: 100, selectedCount: 35 },
        ],
      } as never),
    ).toThrow("FORBIDDEN_FIELD:groupLabel");
  });

  it("creates an idempotent human-bound aggregate audit export with all PRE-G0 gates closed", () => {
    const receipt = evaluateSyntheticFairnessEvidence(fixture());
    const exporter = new SyntheticFairnessAuditExporter();
    const request = auditRequest(receipt.receiptDigest);
    const first = exporter.export(receipt, request);
    (first as { tenantRef: string }).tenantRef = "mutated";
    const second = exporter.export(receipt, request);

    expect(second.tenantRef).toBe("tenant:synthetic:alpha");
    expect(second.disposition).toBe("SYNTHETIC_AGGREGATE_AUDIT_EXPORT");
    expect(second.evidenceGate).toBe("SYNTHETIC_EVIDENCE_ONLY");
    expect(second.legalGate).toBe("NOT_MET");
    expect(second.independentAuditGate).toBe("NOT_MET");
    expect(second.ownerGate).toBe("NOT_MET");
    expect(second.independentAuditCompleted).toBe(false);
    expect(second.realCohortAccepted).toBe(false);
    expect(second.complianceConclusion).toBe("NONE");
    expect(second.actionAllowed).toBe(false);
    expect(second.productionEligible).toBe(false);
    expect(second.exportDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("requires exact receipt binding and human audit/access references", () => {
    const receipt = evaluateSyntheticFairnessEvidence(fixture());
    const exporter = new SyntheticFairnessAuditExporter();

    expect(() =>
      exporter.export(receipt, auditRequest(`sha256:${"0".repeat(64)}`)),
    ).toThrow("EVIDENCE_RECEIPT_DIGEST_MISMATCH");
    expect(() =>
      exporter.export(receipt, auditRequest(receipt.receiptDigest, { humanAuditorRef: "" })),
    ).toThrow("HUMAN_AUDITOR_REF_REQUIRED");
    expect(() =>
      exporter.export(receipt, auditRequest(receipt.receiptDigest, { accessApprovalRef: "" })),
    ).toThrow("ACCESS_APPROVAL_REF_REQUIRED");

    const tampered = {
      ...receipt,
      status: "NO_SCREENING_SIGNAL_OBSERVED" as const,
    };
    expect(() =>
      exporter.export(tampered, auditRequest(receipt.receiptDigest)),
    ).toThrow("EVIDENCE_RECEIPT_TAMPERED");
  });

  it("treats exactly 0.8 as no observed screening signal and tightens Wilson intervals with larger samples", () => {
    const boundary = evaluateSyntheticFairnessEvidence(
      fixture({
        groups: [
          { groupRef: referenceGroupRef, populationCount: 100, selectedCount: 50 },
          { groupRef: comparisonGroupRef, populationCount: 100, selectedCount: 40 },
        ],
      }),
    );
    const larger = evaluateSyntheticFairnessEvidence(
      fixture({
        totalPopulationCount: 2_010,
        groups: [
          { groupRef: referenceGroupRef, populationCount: 1_000, selectedCount: 500 },
          { groupRef: comparisonGroupRef, populationCount: 1_000, selectedCount: 400 },
        ],
      }),
    );

    expect(boundary.status).toBe("NO_SCREENING_SIGNAL_OBSERVED");
    expect(boundary.results[1]?.selectionRateRatio).toBe(0.8);
    const boundaryWidth =
      boundary.results[1]!.selectionRateInterval.upper -
      boundary.results[1]!.selectionRateInterval.lower;
    const largerWidth =
      larger.results[1]!.selectionRateInterval.upper -
      larger.results[1]!.selectionRateInterval.lower;
    expect(largerWidth).toBeLessThan(boundaryWidth);
  });

  it("isolates tenant scope and rejects same-id semantic conflicts", () => {
    const receipt = evaluateSyntheticFairnessEvidence(fixture());
    const exporter = new SyntheticFairnessAuditExporter();
    const request = auditRequest(receipt.receiptDigest);
    exporter.export(receipt, request);

    expect(() =>
      exporter.export(receipt, { ...request, auditPurposeRef: "purpose:changed:v2" }),
    ).toThrow("EXPORT_ID_CONFLICT");
    expect(() =>
      exporter.export(receipt, { ...request, tenantRef: "tenant:synthetic:other" }),
    ).toThrow("TENANT_SCOPE_MISMATCH");
  });
});
