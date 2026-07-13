import { describe, expect, it } from "vitest";
import {
  SKILLS_ONTOLOGY_SCHEMA_VERSION,
  VersionedSkillsOntologyRegistry,
  type CreateSkillMappingProposalV1,
  type CreateTalentRediscoveryProposalV1,
  type OntologyClock,
  type OntologyReleaseV1,
  type SkillMappingCorrectionRequestV1,
  type SkillMappingDeletionRequestV1,
  type SkillMappingProposalReceiptV1,
} from "../skills/versioned-skills-ontology.js";

const releaseRef = "release_1111111111111111" as const;
const conceptA = "concept_aaaaaaaaaaaaaaaa" as const;
const conceptB = "concept_bbbbbbbbbbbbbbbb" as const;
const deprecatedConcept = "concept_cccccccccccccccc" as const;
const subjectRef = "subject_1111111111111111" as const;
const proposalId = "proposal_2222222222222222" as const;
const evidenceA = "evidence_aaaaaaaaaaaaaaaa" as const;
const citationA = "citation_aaaaaaaaaaaaaaaa" as const;

const clock: OntologyClock = {
  now: () => new Date("2026-07-13T12:00:00Z"),
};

type ReleaseInput = Omit<OntologyReleaseV1, "releaseDigest">;

function releaseFixture(overrides: Partial<ReleaseInput> = {}): ReleaseInput {
  return {
    schemaVersion: SKILLS_ONTOLOGY_SCHEMA_VERSION,
    releaseRef,
    releaseVersion: "ontology:skills:v1",
    sourceKind: "ESCO",
    sourceUri: "https://data.europa.eu/esco",
    sourceVersion: "esco:1.2.0",
    licenseKind: "CC_BY_4_0",
    licenseRef: "license:cc-by-4.0",
    provenanceChainRef: "provenance:ontology:esco:1.2.0",
    supersedesReleaseRef: null,
    supersedesReleaseDigest: null,
    concepts: [
      {
        conceptRef: conceptA,
        labelRef: "label:esco:concept-a",
        labelLocale: "tr-TR",
        sourceKind: "ESCO",
        sourceUri: "https://data.europa.eu/esco",
        sourceVersion: "esco:1.2.0",
        deprecated: false,
      },
      {
        conceptRef: conceptB,
        labelRef: "label:esco:concept-b",
        labelLocale: "tr-TR",
        sourceKind: "ESCO",
        sourceUri: "https://data.europa.eu/esco",
        sourceVersion: "esco:1.2.0",
        deprecated: false,
      },
      {
        conceptRef: deprecatedConcept,
        labelRef: "label:esco:deprecated",
        labelLocale: "tr-TR",
        sourceKind: "ESCO",
        sourceUri: "https://data.europa.eu/esco",
        sourceVersion: "esco:1.2.0",
        deprecated: true,
      },
    ],
    edges: [
      {
        edgeRef: "edge_aaaaaaaaaaaaaaaa",
        sourceConceptRef: conceptA,
        targetConceptRef: conceptB,
        kind: "BROADER",
      },
    ],
    createdAt: "2026-07-13T10:00:00Z",
    immutable: true,
    digestAlgorithm: "SHA-256",
    ...overrides,
  };
}

function proposalFixture(
  release: OntologyReleaseV1,
  overrides: Partial<CreateSkillMappingProposalV1> = {},
): CreateSkillMappingProposalV1 {
  return {
    schemaVersion: SKILLS_ONTOLOGY_SCHEMA_VERSION,
    synthetic: true,
    tenantRef: "tenant:synthetic:alpha",
    subjectRef,
    proposalId,
    ontologyReleaseRef: release.releaseRef,
    ontologyReleaseVersion: release.releaseVersion,
    ontologyReleaseDigest: release.releaseDigest,
    conceptRefs: [conceptA],
    aiOutputVersionRef: "ai-output:skills:synthetic:v1",
    humanOversightStandardRef: "human-oversight:canonical:v1",
    provenanceChainRef: "provenance:skills:synthetic:v1",
    containsRawPii: false,
    containsRawProtectedAttributes: false,
    silentInferenceAllowed: false,
    evidenceInventory: [
      {
        tenantRef: "tenant:synthetic:alpha",
        subjectRef,
        evidenceRef: evidenceA,
        citationRef: citationA,
        conceptRef: conceptA,
        ontologyReleaseRef: release.releaseRef,
        ontologyReleaseVersion: release.releaseVersion,
        ontologyReleaseDigest: release.releaseDigest,
        evidenceType: "interview_response",
        entailment: "SUPPORTED",
        sourceSegmentRefs: ["segment_aaaaaaaaaaaaaaaa"],
        provenanceRef: "provenance:skills:evidence:a",
        lexicalOnly: true,
      },
    ],
    createdAt: "2026-07-13T11:00:00Z",
    expiresAt: "2026-07-14T11:00:00Z",
    oversightState: "AI_SUGGESTED",
    proposalOnly: true,
    humanReviewRequired: true,
    humanRationaleRequired: true,
    appealPathRef: "appeal:skills:synthetic:v1",
    correctionPathRef: "correction-path:skills:synthetic:v1",
    auditLineageRefs: ["audit:skills:synthetic:v1"],
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

function rediscoveryFixture(
  release: OntologyReleaseV1,
  proposal: SkillMappingProposalReceiptV1,
  overrides: Partial<CreateTalentRediscoveryProposalV1> = {},
): CreateTalentRediscoveryProposalV1 {
  return {
    schemaVersion: SKILLS_ONTOLOGY_SCHEMA_VERSION,
    synthetic: true,
    tenantRef: "tenant:synthetic:alpha",
    rediscoveryId: "rediscovery_3333333333333333",
    ontologyReleaseRef: release.releaseRef,
    ontologyReleaseVersion: release.releaseVersion,
    ontologyReleaseDigest: release.releaseDigest,
    targetConceptRefs: [conceptA],
    matches: [
      {
        matchRef: "match_4444444444444444",
        subjectRef,
        sourceProposalId: proposal.proposalId,
        sourceProposalDigest: proposal.proposalDigest,
        conceptRef: conceptA,
        ontologyReleaseRef: release.releaseRef,
        ontologyReleaseVersion: release.releaseVersion,
        ontologyReleaseDigest: release.releaseDigest,
        evidenceRefs: [evidenceA],
        citationRefs: [citationA],
        evidenceEntailment: "SUPPORTED",
      },
    ],
    aiOutputVersionRef: "ai-output:rediscovery:synthetic:v1",
    humanOversightStandardRef: "human-oversight:canonical:v1",
    provenanceChainRef: "provenance:rediscovery:synthetic:v1",
    consentReceiptRef: "consent:rediscovery:synthetic:v1",
    processingPurposeRef: "purpose:rediscovery:synthetic:v1",
    optOutCheckedAt: "2026-07-13T11:20:00Z",
    optedOut: false,
    containsRawPii: false,
    containsRawProtectedAttributes: false,
    silentInferenceAllowed: false,
    createdAt: "2026-07-13T11:30:00Z",
    expiresAt: "2026-07-14T11:30:00Z",
    unordered: true,
    displayOrder: "UNSPECIFIED",
    oversightState: "AI_SUGGESTED",
    proposalOnly: true,
    humanReviewRequired: true,
    humanRationaleRequired: true,
    appealPathRef: "appeal:rediscovery:synthetic:v1",
    correctionPathRef: "correction-path:rediscovery:synthetic:v1",
    auditLineageRefs: ["audit:rediscovery:synthetic:v1"],
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
    realSubjectAccepted: false,
    realRediscoveryActivated: false,
    fullAtsAccepted: false,
    ...overrides,
  };
}

function deletionFixture(
  proposal: SkillMappingProposalReceiptV1,
  overrides: Partial<SkillMappingDeletionRequestV1> = {},
): SkillMappingDeletionRequestV1 {
  return {
    deletionId: "deletion_5555555555555555",
    tenantRef: proposal.tenantRef,
    subjectRef: proposal.subjectRef,
    proposalId: proposal.proposalId,
    proposalDigest: proposal.proposalDigest,
    humanRequesterRef: "human:owner:synthetic:001",
    authorizationReceiptRef: "authorization:deletion:synthetic:001",
    deletionReasonRef: "reason:data-subject-request:synthetic:v1",
    tombstoneReason: "DATA_SUBJECT_DELETION",
    requestedAt: "2026-07-13T11:45:00Z",
    ...overrides,
  };
}

function correctionFixture(
  proposal: SkillMappingProposalReceiptV1,
  overrides: Partial<SkillMappingCorrectionRequestV1> = {},
): SkillMappingCorrectionRequestV1 {
  return {
    correctionId: "correction_6666666666666666",
    tenantRef: proposal.tenantRef,
    subjectRef: proposal.subjectRef,
    proposalId: proposal.proposalId,
    proposalDigest: proposal.proposalDigest,
    aiOutputVersionRef: proposal.aiOutputVersionRef,
    humanRequesterRef: "human:reviewer:synthetic:001",
    authorizationReceiptRef: "authorization:correction:synthetic:001",
    correctionReasonRef: "reason:skills-mapping-review:synthetic:v1",
    requestedAt: "2026-07-13T11:40:00Z",
    requestedTransition: "CORRECTION_REVIEW_ONLY",
    actionRequested: false,
    finalizeRequested: false,
    ...overrides,
  };
}

function seededRegistry(): {
  registry: VersionedSkillsOntologyRegistry;
  release: OntologyReleaseV1;
  proposal: SkillMappingProposalReceiptV1;
} {
  const registry = new VersionedSkillsOntologyRegistry(clock);
  const release = registry.registerRelease(releaseFixture());
  const proposal = registry.createProposal(proposalFixture(release));
  return { registry, release, proposal };
}

function successorReleaseFixture(
  previous: OntologyReleaseV1,
  overrides: Partial<ReleaseInput> = {},
): ReleaseInput {
  return releaseFixture({
    releaseRef: "release_2222222222222222",
    releaseVersion: "ontology:skills:v2",
    sourceVersion: "esco:1.2.1",
    provenanceChainRef: "provenance:ontology:esco:1.2.1",
    supersedesReleaseRef: previous.releaseRef,
    supersedesReleaseDigest: previous.releaseDigest,
    concepts: releaseFixture().concepts.map((concept) => ({
      ...concept,
      sourceVersion: "esco:1.2.1",
    })),
    createdAt: "2026-07-13T11:00:00Z",
    ...overrides,
  });
}

describe("P6.3 versioned skills ontology contract", () => {
  it("registers a ref-only immutable release and evidence-bound proposal", () => {
    const { release, proposal } = seededRegistry();

    expect(release.releaseDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(release.digestAlgorithm).toBe("SHA-256");
    expect(release.concepts[0]?.labelRef).toBe("label:esco:concept-a");
    expect("label" in release.concepts[0]!).toBe(false);
    expect(proposal.silentInferenceAllowed).toBe(false);
    expect(proposal.proposalOnly).toBe(true);
    expect(proposal.actionAllowed).toBe(false);
    expect(proposal.productionEligible).toBe(false);
  });

  it("fails closed on release root and concept unknown/free-text fields", () => {
    const registry = new VersionedSkillsOntologyRegistry(clock);
    expect(() =>
      registry.registerRelease({ ...releaseFixture(), productionEligible: true } as never),
    ).toThrow("RELEASE_UNKNOWN_FIELD:productionEligible");
    expect(() =>
      registry.registerRelease({
        ...releaseFixture(),
        concepts: [{ ...releaseFixture().concepts[0]!, label: "person@example.com" }],
      } as never),
    ).toThrow("CONCEPT_UNKNOWN_FIELD:label");
    expect(() =>
      registry.registerRelease({
        ...releaseFixture(),
        concepts: [{ ...releaseFixture().concepts[0]!, labelLocale: "turkish" }],
      }),
    ).toThrow("CONCEPT_LABEL_LOCALE_INVALID");
  });

  it("pins concept source provenance to the release manifest", () => {
    const concept = releaseFixture().concepts[0]!;
    expect(() =>
      new VersionedSkillsOntologyRegistry(clock).registerRelease({
        ...releaseFixture(),
        concepts: [{ ...concept, sourceKind: "CUSTOM" }],
      }),
    ).toThrow("CONCEPT_SOURCE_KIND_MISMATCH");
    expect(() =>
      new VersionedSkillsOntologyRegistry(clock).registerRelease({
        ...releaseFixture(),
        concepts: [{ ...concept, sourceVersion: "custom:v9" }],
      }),
    ).toThrow("CONCEPT_SOURCE_VERSION_MISMATCH");
  });

  it("requires exact supersedes ref and digest lineage", () => {
    const registry = new VersionedSkillsOntologyRegistry(clock);
    const first = registry.registerRelease(releaseFixture());
    const secondInput = successorReleaseFixture(first);
    const second = registry.registerRelease(secondInput);
    expect(second.supersedesReleaseDigest).toBe(first.releaseDigest);

    expect(() =>
      registry.registerRelease({
        ...secondInput,
        releaseRef: "release_3333333333333333",
        supersedesReleaseDigest: `sha256:${"0".repeat(64)}`,
      }),
    ).toThrow("SUPERSEDED_RELEASE_DIGEST_MISMATCH");
  });

  it("rejects two successors that fork the same release lineage", () => {
    const registry = new VersionedSkillsOntologyRegistry(clock);
    const first = registry.registerRelease(releaseFixture());
    registry.registerRelease(successorReleaseFixture(first));
    expect(() =>
      registry.registerRelease(
        successorReleaseFixture(first, {
          releaseRef: "release_3333333333333333",
          releaseVersion: "ontology:skills:v2-fork",
          provenanceChainRef: "provenance:ontology:esco:1.2.1-fork",
        }),
      ),
    ).toThrow("RELEASE_LINEAGE_FORK");
  });

  it("rejects a self-referential release lineage", () => {
    expect(() =>
      new VersionedSkillsOntologyRegistry(clock).registerRelease(
        releaseFixture({
          supersedesReleaseRef: releaseRef,
          supersedesReleaseDigest: `sha256:${"0".repeat(64)}`,
        }),
      ),
    ).toThrow("RELEASE_LINEAGE_SELF_REFERENCE");
  });

  it("rejects semantic duplicate and cyclic hierarchy edges", () => {
    const base = releaseFixture();
    expect(() =>
      new VersionedSkillsOntologyRegistry(clock).registerRelease({
        ...base,
        edges: [
          base.edges[0]!,
          { ...base.edges[0]!, edgeRef: "edge_bbbbbbbbbbbbbbbb" },
        ],
      }),
    ).toThrow("EDGE_SEMANTIC_DUPLICATE");
    expect(() =>
      new VersionedSkillsOntologyRegistry(clock).registerRelease({
        ...base,
        edges: [
          base.edges[0]!,
          {
            edgeRef: "edge_bbbbbbbbbbbbbbbb",
            sourceConceptRef: conceptB,
            targetConceptRef: conceptA,
            kind: "BROADER",
          },
        ],
      }),
    ).toThrow("ONTOLOGY_BROADER_CYCLE");
    expect(() =>
      new VersionedSkillsOntologyRegistry(clock).registerRelease({
        ...base,
        edges: [
          base.edges[0]!,
          {
            edgeRef: "edge_bbbbbbbbbbbbbbbb",
            sourceConceptRef: conceptB,
            targetConceptRef: conceptA,
            kind: "NARROWER",
          },
        ],
      }),
    ).toThrow("EDGE_INVERSE_DUPLICATE");
  });

  it("canonicalizes release concept and edge ordering before digesting", () => {
    const firstRegistry = new VersionedSkillsOntologyRegistry(clock);
    const secondRegistry = new VersionedSkillsOntologyRegistry(clock);
    const input = releaseFixture();
    const first = firstRegistry.registerRelease(input);
    const second = secondRegistry.registerRelease({
      ...input,
      concepts: [...input.concepts].reverse(),
      edges: [...input.edges].reverse(),
    });
    expect(second.releaseDigest).toBe(first.releaseDigest);
    expect(second.concepts).toEqual(first.concepts);
  });

  it("rejects deprecated concepts, unsupported evidence and silent inference", () => {
    const registry = new VersionedSkillsOntologyRegistry(clock);
    const release = registry.registerRelease(releaseFixture());
    expect(() =>
      registry.createProposal(
        proposalFixture(release, {
          conceptRefs: [deprecatedConcept],
          evidenceInventory: [
            {
              ...proposalFixture(release).evidenceInventory[0]!,
              conceptRef: deprecatedConcept,
            },
          ],
        }),
      ),
    ).toThrow("CONCEPT_DEPRECATED");
    expect(() =>
      registry.createProposal({ ...proposalFixture(release), silentInferenceAllowed: true } as never),
    ).toThrow("SILENT_INFERENCE_DISALLOWED");
    expect(() =>
      registry.createProposal({
        ...proposalFixture(release),
        evidenceInventory: [
          { ...proposalFixture(release).evidenceInventory[0]!, entailment: "INSUFFICIENT" },
        ],
      }),
    ).toThrow("CONCEPT_UNSUPPORTED_BY_EVIDENCE");
  });

  it("creates a proposal-only rediscovery with exact trace closure", () => {
    const { registry, release, proposal } = seededRegistry();
    const receipt = registry.createRediscovery(rediscoveryFixture(release, proposal));

    expect(receipt.matches[0]).toMatchObject({
      sourceProposalId: proposal.proposalId,
      sourceProposalDigest: proposal.proposalDigest,
      conceptRef: conceptA,
      evidenceRefs: [evidenceA],
      citationRefs: [citationA],
      evidenceEntailment: "SUPPORTED",
    });
    expect(receipt.displayOrder).toBe("UNSPECIFIED");
    expect(receipt.realRediscoveryActivated).toBe(false);
    expect(receipt.fullAtsAccepted).toBe(false);
    expect(registry.getRediscoveryTraceStatus(receipt.tenantRef, receipt.rediscoveryId)?.status).toBe(
      "TRACE_CURRENT",
    );
  });

  it("rejects source proposal, digest, concept and evidence laundering", () => {
    const { registry, release, proposal } = seededRegistry();
    const base = rediscoveryFixture(release, proposal);
    const match = base.matches[0]!;
    expect(() =>
      registry.createRediscovery({
        ...base,
        matches: [{ ...match, sourceProposalId: "proposal_9999999999999999" }],
      }),
    ).toThrow("MATCH_SOURCE_PROPOSAL_NOT_FOUND");
    expect(() =>
      registry.createRediscovery({
        ...base,
        matches: [{ ...match, sourceProposalDigest: `sha256:${"0".repeat(64)}` }],
      }),
    ).toThrow("MATCH_SOURCE_PROPOSAL_DIGEST_MISMATCH");
    expect(() =>
      registry.createRediscovery({
        ...base,
        targetConceptRefs: [conceptB],
        matches: [{ ...match, conceptRef: conceptB }],
      }),
    ).toThrow("MATCH_SOURCE_CONCEPT_MISMATCH");
    expect(() =>
      registry.createRediscovery({
        ...base,
        matches: [{ ...match, evidenceRefs: ["evidence_bbbbbbbbbbbbbbbb"] }],
      }),
    ).toThrow("MATCH_EVIDENCE_NOT_TRACEABLE");
  });

  it("rejects cross-release rediscovery evidence laundering", () => {
    const registry = new VersionedSkillsOntologyRegistry(clock);
    const firstRelease = registry.registerRelease(releaseFixture());
    const firstProposal = registry.createProposal(proposalFixture(firstRelease));
    const secondRelease = registry.registerRelease(successorReleaseFixture(firstRelease));
    const input = rediscoveryFixture(secondRelease, firstProposal);
    expect(() => registry.createRediscovery(input)).toThrow("MATCH_SOURCE_RELEASE_REF_MISMATCH");
  });

  it("rejects an expired source proposal during rediscovery", () => {
    let now = new Date("2026-07-13T11:00:00Z");
    const advancingClock: OntologyClock = { now: () => now };
    const registry = new VersionedSkillsOntologyRegistry(advancingClock);
    const release = registry.registerRelease(releaseFixture());
    const proposal = registry.createProposal(
      proposalFixture(release, {
        createdAt: "2026-07-13T10:30:00Z",
        expiresAt: "2026-07-13T11:30:00Z",
      }),
    );
    now = new Date("2026-07-13T12:00:00Z");
    expect(() => registry.createRediscovery(rediscoveryFixture(release, proposal))).toThrow(
      "MATCH_SOURCE_PROPOSAL_EXPIRED",
    );
  });

  it("pins rediscovery entailment, opt-out, order and PRE-G0 gates", () => {
    const { registry, release, proposal } = seededRegistry();
    const base = rediscoveryFixture(release, proposal);
    expect(() =>
      registry.createRediscovery({
        ...base,
        matches: [{ ...base.matches[0]!, evidenceEntailment: "INSUFFICIENT" }],
      } as never),
    ).toThrow("MATCH_ENTAILMENT_NOT_SUPPORTED");
    expect(() => registry.createRediscovery({ ...base, optedOut: true } as never)).toThrow(
      "REDISCOVERY_OPTED_OUT",
    );
    expect(() =>
      registry.createRediscovery({
        ...base,
        optOutCheckedAt: "2026-07-12T11:59:59Z",
      }),
    ).toThrow("OPT_OUT_CHECK_STALE");
    expect(() => registry.createRediscovery({ ...base, displayOrder: "SCORE_DESC" } as never)).toThrow(
      "DISPLAY_ORDER_MUST_BE_UNSPECIFIED",
    );
    expect(() =>
      registry.createRediscovery({ ...base, realRediscoveryActivated: true } as never),
    ).toThrow("REAL_ACTIVATION_DISALLOWED");
  });

  it("rejects duplicate semantic matches even with different match refs", () => {
    const { registry, release, proposal } = seededRegistry();
    const base = rediscoveryFixture(release, proposal);
    expect(() =>
      registry.createRediscovery({
        ...base,
        matches: [
          base.matches[0]!,
          { ...base.matches[0]!, matchRef: "match_5555555555555555" },
        ],
      }),
    ).toThrow("MATCH_SUBJECT_CONCEPT_DUPLICATE");
  });

  it("canonicalizes unordered rediscovery target and evidence ordering", () => {
    const registry = new VersionedSkillsOntologyRegistry(clock);
    const release = registry.registerRelease(releaseFixture());
    const proposal = registry.createProposal(
      proposalFixture(release, {
        evidenceInventory: [
          proposalFixture(release).evidenceInventory[0]!,
          {
            ...proposalFixture(release).evidenceInventory[0]!,
            evidenceRef: "evidence_bbbbbbbbbbbbbbbb",
            citationRef: "citation_bbbbbbbbbbbbbbbb",
            sourceSegmentRefs: ["segment_bbbbbbbbbbbbbbbb"],
            provenanceRef: "provenance:skills:evidence:b",
          },
        ],
      }),
    );
    const base = rediscoveryFixture(release, proposal);
    const forward = registry.createRediscovery({
      ...base,
      matches: [{
        ...base.matches[0]!,
        evidenceRefs: [evidenceA, "evidence_bbbbbbbbbbbbbbbb"],
        citationRefs: [citationA, "citation_bbbbbbbbbbbbbbbb"],
      }],
    });
    const reverse = registry.createRediscovery({
      ...base,
      matches: [{
        ...base.matches[0]!,
        evidenceRefs: ["evidence_bbbbbbbbbbbbbbbb", evidenceA],
        citationRefs: ["citation_bbbbbbbbbbbbbbbb", citationA],
      }],
    });
    expect(reverse.proposalDigest).toBe(forward.proposalDigest);
    expect(reverse.matches).toEqual(forward.matches);
  });

  it("makes deletion terminal for exact lineage and data-subject scope", () => {
    const { registry, release, proposal } = seededRegistry();
    const rediscovery = registry.createRediscovery(rediscoveryFixture(release, proposal));
    const tombstone = registry.requestDeletion(deletionFixture(proposal));
    expect(tombstone.terminal).toBe(true);
    expect(tombstone.revivable).toBe(false);
    expect(
      registry.getRediscoveryTraceStatus(rediscovery.tenantRef, rediscovery.rediscoveryId),
    ).toMatchObject({
      status: "TRACE_INVALIDATED_BY_TOMBSTONE",
      invalidatedSourceProposalIds: [proposal.proposalId],
    });
    expect(() => registry.createRediscovery(rediscoveryFixture(release, proposal))).toThrow(
      "MATCH_SUBJECT_TOMBSTONED",
    );
    expect(() =>
      registry.createProposal(
        proposalFixture(release, { proposalId: "proposal_7777777777777777" }),
      ),
    ).toThrow("SUBJECT_TOMBSTONED");
  });

  it("blocks exact evidence lineage reuse after proposal-scoped tombstone", () => {
    const { registry, release, proposal } = seededRegistry();
    registry.requestDeletion(
      deletionFixture(proposal, { tombstoneReason: "OWNER_REQUESTED" }),
    );
    expect(() =>
      registry.createProposal(
        proposalFixture(release, { proposalId: "proposal_7777777777777777" }),
      ),
    ).toThrow("EVIDENCE_LINEAGE_TOMBSTONED");
  });

  it("rejects rediscovery from an owner-requested proposal tombstone", () => {
    const { registry, release, proposal } = seededRegistry();
    registry.requestDeletion(
      deletionFixture(proposal, { tombstoneReason: "OWNER_REQUESTED" }),
    );
    expect(() => registry.createRediscovery(rediscoveryFixture(release, proposal))).toThrow(
      "MATCH_SOURCE_PROPOSAL_TOMBSTONED",
    );
  });

  it("makes legal-obligation deletion terminal at subject scope", () => {
    const { registry, release, proposal } = seededRegistry();
    registry.requestDeletion(
      deletionFixture(proposal, { tombstoneReason: "LEGAL_OBLIGATION" }),
    );
    expect(() =>
      registry.createProposal(
        proposalFixture(release, {
          proposalId: "proposal_7777777777777777",
          evidenceInventory: [
            {
              ...proposalFixture(release).evidenceInventory[0]!,
              evidenceRef: "evidence_7777777777777777",
              citationRef: "citation_7777777777777777",
              sourceSegmentRefs: ["segment_7777777777777777"],
              provenanceRef: "provenance:skills:evidence:new",
            },
          ],
        }),
      ),
    ).toThrow("SUBJECT_TOMBSTONED");
  });

  it("retires an ontology release for all new mapping and rediscovery proposals", () => {
    const { registry, release, proposal } = seededRegistry();
    registry.requestDeletion(
      deletionFixture(proposal, { tombstoneReason: "ONTOLOGY_VERSION_RETIRED" }),
    );
    expect(() =>
      registry.createProposal(
        proposalFixture(release, {
          subjectRef: "subject_7777777777777777",
          proposalId: "proposal_7777777777777777",
          evidenceInventory: [
            {
              ...proposalFixture(release).evidenceInventory[0]!,
              subjectRef: "subject_7777777777777777",
              evidenceRef: "evidence_7777777777777777",
              citationRef: "citation_7777777777777777",
              sourceSegmentRefs: ["segment_7777777777777777"],
              provenanceRef: "provenance:skills:evidence:new",
            },
          ],
        }),
      ),
    ).toThrow("ONTOLOGY_RELEASE_RETIRED");
    expect(() => registry.createRediscovery(rediscoveryFixture(release, proposal))).toThrow(
      "ONTOLOGY_RELEASE_RETIRED",
    );
  });

  it("requires authorization and valid time for correction and deletion", () => {
    const { registry, proposal } = seededRegistry();
    expect(() =>
      registry.requestCorrection({ ...correctionFixture(proposal), authorizationReceiptRef: "x" }),
    ).toThrow("CORRECTION_AUTHORIZATION_RECEIPT_REF_REQUIRED");
    expect(() =>
      registry.requestCorrection({
        ...correctionFixture(proposal),
        requestedAt: "2026-07-13T10:59:59Z",
      }),
    ).toThrow("CORRECTION_REQUESTED_BEFORE_PROPOSAL");
    expect(() =>
      registry.requestDeletion({
        ...deletionFixture(proposal),
        requestedAt: "2026-07-13T12:00:01Z",
      }),
    ).toThrow("DELETION_REQUESTED_AT_IN_FUTURE");
    expect(() =>
      registry.requestDeletion({
        ...deletionFixture(proposal),
        requestedAt: "2026-07-13T10:59:59Z",
      }),
    ).toThrow("DELETION_REQUESTED_BEFORE_PROPOSAL");
  });

  it("keeps correction review-only, idempotent and non-mutating", () => {
    const { registry, proposal } = seededRegistry();
    const request = correctionFixture(proposal);
    const first = registry.requestCorrection(request);
    const replay = registry.requestCorrection(request);
    expect(replay).toEqual(first);
    expect(first.proposalMutated).toBe(false);
    expect(first.actionApplied).toBe(false);
    expect(first.finalized).toBe(false);
    expect(() =>
      registry.requestCorrection({ ...request, actionRequested: true } as never),
    ).toThrow("CORRECTION_ACTION_DISALLOWED");
  });

  it("deep-clones stored release and idempotent receipts", () => {
    const registry = new VersionedSkillsOntologyRegistry(clock);
    const release = registry.registerRelease(releaseFixture());
    (release.concepts as unknown as Array<{ labelRef: string }>)[0]!.labelRef = "label:tampered";
    expect(registry.getRelease(releaseRef)?.concepts[0]?.labelRef).toBe("label:esco:concept-a");

    const storedRelease = registry.getRelease(releaseRef)!;
    const first = registry.createProposal(proposalFixture(storedRelease));
    const replay = registry.createProposal(proposalFixture(storedRelease));
    expect(replay).toEqual(first);
    expect(replay).not.toBe(first);
  });
});
