import { describe, expect, it } from "vitest";
import {
  CITATION_BACKED_COACHING_SCHEMA_VERSION,
  CitationBackedCoachingRegistry,
  type CoachingClock,
  type CoachingCorrectionRequestV1,
  type CreateSyntheticCoachingProposalV1,
} from "../coaching/citation-backed-coaching.js";

const interviewRef = "interview_1111111111111111" as const;
const proposalId = "proposal_2222222222222222" as const;
const criterionA = "criterion_aaaaaaaaaaaaaaaa" as const;
const criterionB = "criterion_bbbbbbbbbbbbbbbb" as const;
const citationA = "citation_aaaaaaaaaaaaaaaa" as const;
const citationB = "citation_bbbbbbbbbbbbbbbb" as const;
const citationInsufficient = "citation_cccccccccccccccc" as const;

const clock: CoachingClock = {
  now: () => new Date("2026-07-13T12:00:00Z"),
};

function fixture(
  overrides: Partial<CreateSyntheticCoachingProposalV1> = {},
): CreateSyntheticCoachingProposalV1 {
  return {
    schemaVersion: CITATION_BACKED_COACHING_SCHEMA_VERSION,
    synthetic: true,
    tenantRef: "tenant:synthetic:alpha",
    interviewRef,
    proposalId,
    rubricVersionRef: "rubric:structured-interview:v7",
    criterionRefs: [criterionA, criterionB],
    aiOutputVersionRef: "ai-output:coaching:synthetic:v3",
    humanOversightStandardRef: "human-oversight:canonical:v1",
    provenanceChainRef: "provenance:coaching:synthetic:v1",
    containsRawPii: false,
    containsRawProtectedAttributes: false,
    evidenceInventory: [
      {
        tenantRef: "tenant:synthetic:alpha",
        interviewRef,
        evidenceRef: "evidence_aaaaaaaaaaaaaaaa",
        citationRef: citationA,
        criterionRef: criterionA,
        evidenceType: "interview_response",
        entailment: "SUPPORTED",
        sourceSegmentRefs: ["segment_aaaaaaaaaaaaaaaa"],
        provenanceRef: "provenance:citation:a:v1",
        lexicalOnly: true,
      },
      {
        tenantRef: "tenant:synthetic:alpha",
        interviewRef,
        evidenceRef: "evidence_bbbbbbbbbbbbbbbb",
        citationRef: citationB,
        criterionRef: criterionB,
        evidenceType: "work_sample",
        entailment: "SUPPORTED",
        sourceSegmentRefs: ["segment_bbbbbbbbbbbbbbbb"],
        provenanceRef: "provenance:citation:b:v1",
        lexicalOnly: true,
      },
      {
        tenantRef: "tenant:synthetic:alpha",
        interviewRef,
        evidenceRef: "evidence_cccccccccccccccc",
        citationRef: citationInsufficient,
        criterionRef: criterionB,
        evidenceType: "portfolio",
        entailment: "INSUFFICIENT",
        sourceSegmentRefs: ["segment_cccccccccccccccc"],
        provenanceRef: "provenance:citation:c:v1",
        lexicalOnly: true,
      },
    ],
    suggestions: [
      {
        suggestionRef: "suggestion_aaaaaaaaaaaaaaaa",
        kind: "RUBRIC_COVERAGE_FOLLOW_UP",
        templateRef: "template:coaching:rubric-coverage-follow-up:v1",
        criterionRef: criterionA,
        citationRefs: [citationA],
      },
      {
        suggestionRef: "suggestion_bbbbbbbbbbbbbbbb",
        kind: "EVIDENCE_GAP_REVIEW",
        templateRef: "template:coaching:evidence-gap-review:v1",
        criterionRef: criterionB,
        citationRefs: [citationB],
      },
    ],
    qualitySignals: [
      {
        signalRef: "signal_aaaaaaaaaaaaaaaa",
        kind: "RUBRIC_COVERAGE",
        state: "OBSERVED",
        criterionRef: criterionA,
        citationRefs: [citationA],
        sessionLevelOnly: true,
      },
      {
        signalRef: "signal_bbbbbbbbbbbbbbbb",
        kind: "EVIDENCE_GAP",
        state: "INSUFFICIENT_EVIDENCE",
        criterionRef: criterionB,
        citationRefs: [citationInsufficient],
        sessionLevelOnly: true,
      },
    ],
    createdAt: "2026-07-13T11:00:00Z",
    expiresAt: "2026-07-14T11:00:00Z",
    oversightState: "AI_SUGGESTED",
    proposalOnly: true,
    humanReviewRequired: true,
    humanRationaleRequired: true,
    appealPathRef: "appeal:coaching:synthetic:v1",
    correctionPathRef: "correction-path:coaching:synthetic:v1",
    auditLineageRefs: ["audit:coaching:synthetic:v1"],
    actionAllowed: false,
    individualDecisionAllowed: false,
    autoExecute: false,
    batchApproval: false,
    mutationAllowed: false,
    verdict: "NONE",
    evidenceGate: "SYNTHETIC_EVIDENCE_ONLY",
    legalGate: "NOT_MET",
    independentAuditGate: "NOT_MET",
    ownerGate: "NOT_MET",
    productionEligible: false,
    ...overrides,
  };
}

function correction(
  proposalDigest: `sha256:${string}`,
  overrides: Partial<CoachingCorrectionRequestV1> = {},
): CoachingCorrectionRequestV1 {
  return {
    correctionId: "correction_3333333333333333",
    tenantRef: "tenant:synthetic:alpha",
    interviewRef,
    proposalId,
    proposalDigest,
    aiOutputVersionRef: "ai-output:coaching:synthetic:v3",
    humanRequesterRef: "human:auditor:synthetic:001",
    correctionReasonRef: "reason:coaching:evidence-binding-review:v1",
    requestedAt: "2026-07-13T11:30:00Z",
    requestedTransition: "CORRECTION_REVIEW_ONLY",
    actionRequested: false,
    finalizeRequested: false,
    ...overrides,
  };
}

describe("P6.2 citation-backed coaching contract", () => {
  it("creates a synthetic proposal with suggestion-level SUPPORTED citation binding", () => {
    const receipt = new CitationBackedCoachingRegistry(clock).create(fixture());

    expect(receipt.schemaVersion).toBe("citation-backed-coaching/v1");
    expect(receipt.suggestions).toHaveLength(2);
    expect(receipt.suggestions[0]?.citationRefs).toEqual([citationA]);
    expect(receipt.qualitySignals[1]?.state).toBe("INSUFFICIENT_EVIDENCE");
    expect(receipt.oversightState).toBe("AI_SUGGESTED");
    expect(receipt.proposalOnly).toBe(true);
    expect(receipt.verdict).toBe("NONE");
    expect(receipt.actionAllowed).toBe(false);
    expect(receipt.individualDecisionAllowed).toBe(false);
    expect(receipt.autoExecute).toBe(false);
    expect(receipt.batchApproval).toBe(false);
    expect(receipt.mutationAllowed).toBe(false);
    expect(receipt.productionEligible).toBe(false);
    expect(receipt.proposalDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("rejects citation-less, unknown and non-supported suggestion evidence", () => {
    const base = fixture();
    const suggestion = base.suggestions[0]!;
    const registry = new CitationBackedCoachingRegistry(clock);

    expect(() => registry.create(fixture({ suggestions: [{ ...suggestion, citationRefs: [] }] }))).toThrow(
      "SUGGESTION_CITATIONS_INVALID",
    );
    expect(() =>
      registry.create(
        fixture({
          suggestions: [{ ...suggestion, citationRefs: ["citation_dddddddddddddddd"] }],
        }),
      ),
    ).toThrow("SUGGESTION_CITATION_UNKNOWN");
    expect(() =>
      registry.create(
        fixture({ suggestions: [{ ...suggestion, criterionRef: criterionB, citationRefs: [citationInsufficient] }] }),
      ),
    ).toThrow("SUGGESTION_CITATION_NOT_SUPPORTED");
    expect(() =>
      registry.create(
        fixture({
          evidenceInventory: base.evidenceInventory.map((item) =>
            item.citationRef === citationA ? { ...item, entailment: "NOT_SUPPORTED" } : item,
          ),
        }),
      ),
    ).toThrow("SUGGESTION_CITATION_NOT_SUPPORTED");
  });

  it("rejects criterion laundering between evidence and suggestion", () => {
    const suggestion = fixture().suggestions[0]!;
    expect(() =>
      new CitationBackedCoachingRegistry(clock).create(
        fixture({ suggestions: [{ ...suggestion, criterionRef: criterionB, citationRefs: [citationA] }] }),
      ),
    ).toThrow("SUGGESTION_CRITERION_MISMATCH");
    expect(() =>
      new CitationBackedCoachingRegistry(clock).create(
        fixture({ criterionRefs: [criterionA] }),
      ),
    ).toThrow("EVIDENCE_CRITERION_UNKNOWN");
  });

  it("enforces the rubric evidence allowlist, lexical-only boundary and exact scope", () => {
    const evidence = fixture().evidenceInventory[0]!;
    expect(() =>
      new CitationBackedCoachingRegistry(clock).create(
        fixture({ evidenceInventory: [{ ...evidence, evidenceType: "social_media" }] as never }),
      ),
    ).toThrow("EVIDENCE_TYPE_INVALID");
    expect(() =>
      new CitationBackedCoachingRegistry(clock).create(
        fixture({ evidenceInventory: [{ ...evidence, lexicalOnly: false }] as never }),
      ),
    ).toThrow("LEXICAL_ONLY_REQUIRED");
    expect(() =>
      new CitationBackedCoachingRegistry(clock).create(
        fixture({ evidenceInventory: [{ ...evidence, tenantRef: "tenant:synthetic:other" }] }),
      ),
    ).toThrow("EVIDENCE_TENANT_SCOPE_MISMATCH");
    expect(() =>
      new CitationBackedCoachingRegistry(clock).create(
        fixture({ evidenceInventory: [{ ...evidence, interviewRef: "interview_9999999999999999" }] }),
      ),
    ).toThrow("EVIDENCE_INTERVIEW_SCOPE_MISMATCH");
  });

  it("rejects raw data, free-text, biometric and forbidden inference fields", () => {
    const registry = new CitationBackedCoachingRegistry(clock);
    expect(() => registry.create({ ...fixture(), containsRawPii: true } as never)).toThrow(
      "RAW_PII_DISALLOWED",
    );
    expect(() =>
      registry.create({ ...fixture(), containsRawProtectedAttributes: true } as never),
    ).toThrow("RAW_PROTECTED_ATTRIBUTES_DISALLOWED");
    expect(() => registry.create({ ...fixture(), suggestionText: "free AI output" } as never)).toThrow(
      "FORBIDDEN_FIELD:suggestionText",
    );
    expect(() => registry.create({ ...fixture(), audioWaveform: [1, 2] } as never)).toThrow(
      "FORBIDDEN_FIELD:audioWaveform",
    );
    expect(() => registry.create({ ...fixture(), personality: "trait" } as never)).toThrow(
      "FORBIDDEN_FIELD:personality",
    );
    expect(() => registry.create({ ...fixture(), numericScore: 80 } as never)).toThrow(
      "FORBIDDEN_FIELD:numericScore",
    );
  });

  it("rejects unknown nested fields and unsafe template substitution", () => {
    const suggestion = fixture().suggestions[0]!;
    expect(() =>
      new CitationBackedCoachingRegistry(clock).create(
        fixture({ suggestions: [{ ...suggestion, hiddenAction: true }] as never }),
      ),
    ).toThrow("SUGGESTION_UNKNOWN_FIELD:hiddenAction");
    expect(() =>
      new CitationBackedCoachingRegistry(clock).create(
        fixture({ suggestions: [{ ...suggestion, templateRef: "template:custom:free-form:v1" }] }),
      ),
    ).toThrow("SUGGESTION_TEMPLATE_INVALID");
  });

  it("pins proposal-only lifecycle and all PRE-G0 gates", () => {
    const registry = new CitationBackedCoachingRegistry(clock);
    expect(() => registry.create({ ...fixture(), oversightState: "FINALIZED" } as never)).toThrow(
      "OVERSIGHT_STATE_INVALID",
    );
    expect(() => registry.create({ ...fixture(), actionAllowed: true } as never)).toThrow(
      "ACTION_DISALLOWED",
    );
    expect(() => registry.create({ ...fixture(), batchApproval: true } as never)).toThrow(
      "AUTOMATION_DISALLOWED",
    );
    expect(() => registry.create({ ...fixture(), ownerGate: "OWNER_ACCEPTED" } as never)).toThrow(
      "ACCEPTANCE_GATE_INVALID",
    );
    expect(() => registry.create({ ...fixture(), productionEligible: true } as never)).toThrow(
      "PRODUCTION_ELIGIBILITY_DISALLOWED",
    );
    expect(() => registry.create({ ...fixture(), approvalReceipt: {} } as never)).toThrow(
      "FORBIDDEN_FIELD:approvalReceipt",
    );
  });

  it("fails closed for future, expired and overlong proposals", () => {
    const registry = new CitationBackedCoachingRegistry(clock);
    expect(() =>
      registry.create(fixture({ createdAt: "2026-07-13T13:00:00Z", expiresAt: "2026-07-14T13:00:00Z" })),
    ).toThrow("CREATED_AT_IN_FUTURE");
    expect(() =>
      registry.create(fixture({ createdAt: "2026-07-12T11:00:00Z", expiresAt: "2026-07-13T11:59:59Z" })),
    ).toThrow("PROPOSAL_EXPIRED");
    expect(() =>
      registry.create(fixture({ createdAt: "2026-07-13T11:00:00Z", expiresAt: "2026-07-21T11:00:01Z" })),
    ).toThrow("PROPOSAL_TTL_INVALID");
  });

  it("keeps insufficient evidence visible but prevents it from backing action-like suggestions", () => {
    const base = fixture();
    expect(new CitationBackedCoachingRegistry(clock).create(base).qualitySignals[1]?.state).toBe(
      "INSUFFICIENT_EVIDENCE",
    );
    expect(() =>
      new CitationBackedCoachingRegistry(clock).create(
        fixture({
          qualitySignals: [
            {
              ...base.qualitySignals[1]!,
              state: "OBSERVED",
              citationRefs: [citationInsufficient],
            },
          ],
        }),
      ),
    ).toThrow("QUALITY_SIGNAL_CITATION_NOT_SUPPORTED");
    expect(() =>
      new CitationBackedCoachingRegistry(clock).create(
        fixture({
          qualitySignals: [
            { ...base.qualitySignals[1]!, state: "INSUFFICIENT_EVIDENCE", citationRefs: [citationB] },
          ],
        }),
      ),
    ).toThrow("INSUFFICIENT_SIGNAL_EVIDENCE_INVALID");
  });

  it("is deterministic, tenant-scoped, idempotent and deep-cloned", () => {
    const registry = new CitationBackedCoachingRegistry(clock);
    const first = registry.create(fixture());
    const digest = first.proposalDigest;
    (first as { tenantRef: string }).tenantRef = "mutated";
    const second = registry.create(fixture());

    expect(second.tenantRef).toBe("tenant:synthetic:alpha");
    expect(second.proposalDigest).toBe(digest);
    expect(() =>
      registry.create(fixture({ appealPathRef: "appeal:coaching:changed:v2" })),
    ).toThrow("PROPOSAL_ID_CONFLICT");

    const otherTenant = fixture({
      tenantRef: "tenant:synthetic:other",
      evidenceInventory: fixture().evidenceInventory.map((item) => ({
        ...item,
        tenantRef: "tenant:synthetic:other",
      })),
    });
    expect(registry.create(otherTenant).tenantRef).toBe("tenant:synthetic:other");
  });

  it("rejects duplicate identities, invalid source refs and unbounded collections", () => {
    const base = fixture();
    expect(() =>
      new CitationBackedCoachingRegistry(clock).create(
        fixture({ evidenceInventory: [base.evidenceInventory[0]!, base.evidenceInventory[0]!] }),
      ),
    ).toThrow("EVIDENCE_REF_DUPLICATE");
    expect(() =>
      new CitationBackedCoachingRegistry(clock).create(
        fixture({
          evidenceInventory: [
            base.evidenceInventory[0]!,
            { ...base.evidenceInventory[1]!, citationRef: citationA },
          ],
        }),
      ),
    ).toThrow("CITATION_REF_DUPLICATE");
    expect(() =>
      new CitationBackedCoachingRegistry(clock).create(
        fixture({
          evidenceInventory: [
            { ...base.evidenceInventory[0]!, sourceSegmentRefs: ["segment_not_opaque"] },
          ],
        }),
      ),
    ).toThrow("SOURCE_SEGMENT_REFS_INVALID");
    expect(() =>
      new CitationBackedCoachingRegistry(clock).create(
        fixture({ suggestions: Array.from({ length: 21 }, () => base.suggestions[0]!) }),
      ),
    ).toThrow("SUGGESTION_COUNT_INVALID");
    expect(() =>
      new CitationBackedCoachingRegistry(clock).create(
        fixture({ suggestions: [base.suggestions[0]!, base.suggestions[0]!] }),
      ),
    ).toThrow("SUGGESTION_REF_DUPLICATE");
    expect(() =>
      new CitationBackedCoachingRegistry(clock).create(
        fixture({ qualitySignals: [base.qualitySignals[0]!, base.qualitySignals[0]!] }),
      ),
    ).toThrow("QUALITY_SIGNAL_REF_DUPLICATE");
  });

  it("rejects criterion laundering in categorical quality signals", () => {
    const signal = fixture().qualitySignals[0]!;
    expect(() =>
      new CitationBackedCoachingRegistry(clock).create(
        fixture({
          qualitySignals: [{ ...signal, criterionRef: criterionB, citationRefs: [citationA] }],
        }),
      ),
    ).toThrow("QUALITY_SIGNAL_CRITERION_MISMATCH");
  });

  it("rejects missing generic refs instead of accepting string coercion", () => {
    expect(() =>
      new CitationBackedCoachingRegistry(clock).create({ ...fixture(), tenantRef: undefined } as never),
    ).toThrow("TENANT_REF_INVALID");
    expect(() =>
      new CitationBackedCoachingRegistry(clock).create({
        ...fixture(),
        auditLineageRefs: [undefined],
      } as never),
    ).toThrow("AUDIT_LINEAGE_REFS_INVALID");
  });

  it("creates an idempotent human correction review without mutating or finalizing", () => {
    const registry = new CitationBackedCoachingRegistry(clock);
    const proposal = registry.create(fixture());
    const request = correction(proposal.proposalDigest);
    const first = registry.requestCorrection(request);
    (first as { tenantRef: string }).tenantRef = "mutated";
    const second = registry.requestCorrection(request);

    expect(second.tenantRef).toBe("tenant:synthetic:alpha");
    expect(second.disposition).toBe("CORRECTION_REVIEW_REQUESTED");
    expect(second.oversightState).toBe("AI_SUGGESTED");
    expect(second.proposalMutated).toBe(false);
    expect(second.actionApplied).toBe(false);
    expect(second.finalized).toBe(false);
    expect(second.productionEligible).toBe(false);
    expect(second.correctionDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("binds correction to exact proposal digest and AI output version", () => {
    const registry = new CitationBackedCoachingRegistry(clock);
    const proposal = registry.create(fixture());
    expect(() =>
      registry.requestCorrection(correction(`sha256:${"0".repeat(64)}`)),
    ).toThrow("CORRECTION_PROPOSAL_DIGEST_MISMATCH");
    expect(() =>
      registry.requestCorrection(
        correction(proposal.proposalDigest, { aiOutputVersionRef: "ai-output:coaching:changed:v4" }),
      ),
    ).toThrow("CORRECTION_AI_OUTPUT_VERSION_MISMATCH");
    expect(() =>
      registry.requestCorrection(
        correction(proposal.proposalDigest, { tenantRef: "tenant:synthetic:other" }),
      ),
    ).toThrow("CORRECTION_PROPOSAL_NOT_FOUND");
  });

  it("rejects correction attempts that request action, finalization or semantic replay", () => {
    const registry = new CitationBackedCoachingRegistry(clock);
    const proposal = registry.create(fixture());
    const request = correction(proposal.proposalDigest);
    expect(() => registry.requestCorrection({ ...request, actionRequested: true } as never)).toThrow(
      "CORRECTION_ACTION_DISALLOWED",
    );
    expect(() => registry.requestCorrection({ ...request, finalizeRequested: true } as never)).toThrow(
      "CORRECTION_ACTION_DISALLOWED",
    );
    registry.requestCorrection(request);
    expect(() =>
      registry.requestCorrection({ ...request, correctionReasonRef: "reason:changed:v2" }),
    ).toThrow("CORRECTION_ID_CONFLICT");
  });

  it("rejects correction before proposal creation time or after proposal expiry", () => {
    let now = new Date("2026-07-13T12:00:00Z");
    const mutableClock: CoachingClock = { now: () => now };
    const registry = new CitationBackedCoachingRegistry(mutableClock);
    const proposal = registry.create(fixture());

    expect(() =>
      registry.requestCorrection(
        correction(proposal.proposalDigest, { requestedAt: "2026-07-13T10:59:59Z" }),
      ),
    ).toThrow("CORRECTION_REQUESTED_BEFORE_PROPOSAL");

    now = new Date("2026-07-14T11:00:00Z");
    expect(() =>
      registry.requestCorrection(
        correction(proposal.proposalDigest, { requestedAt: "2026-07-14T10:59:59Z" }),
      ),
    ).toThrow("PROPOSAL_EXPIRED");
  });
});
