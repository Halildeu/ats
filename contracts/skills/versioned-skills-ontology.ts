/**
 * Faz 25 P6.3 — versioned skills ontology and governed talent rediscovery.
 *
 * Contract boundary:
 *   - Ontology releases are immutable, versioned, digest-sealed.
 *   - Skill mapping proposals are synthetic, ref-only, evidence-bound.
 *   - Every mapping cites existing lexical evidence and exact ontology concept/version.
 *   - Talent rediscovery emits unordered human-review proposals only.
 *   - Deletion is terminal (tombstone); no revive.
 *   - P2 owns rubric/workspace; P6.2 coaching is separate; real activation/browser is separate.
 *
 * Standard boundary notes (no parity/compliance claims):
 *   - ESCO: European Skills, Competences, Qualifications and Occupations taxonomy.
 *   - O*NET: US Occupational Information Network.
 *   - HR-Open: HR Open Standards Consortium data exchange schemas.
 *   These are acknowledged reference standards. This contract does NOT claim
 *   parity, certification, conformance, or compliance with any of them.
 *   Concept URIs from these standards may appear as external source references
 *   in ontology releases, subject to their respective licenses.
 */

import { createHash } from "node:crypto";

/* ------------------------------------------------------------------ */
/*  Schema version                                                     */
/* ------------------------------------------------------------------ */

export const SKILLS_ONTOLOGY_SCHEMA_VERSION =
  "versioned-skills-ontology/v1" as const;

/* ------------------------------------------------------------------ */
/*  Branded types                                                      */
/* ------------------------------------------------------------------ */

declare const ontologyDigestBrand: unique symbol;
export type OntologyDigest = `sha256:${string}` & {
  readonly [ontologyDigestBrand]: true;
};

/* ------------------------------------------------------------------ */
/*  Enums / union types                                                */
/* ------------------------------------------------------------------ */

export type OntologySourceKind =
  | "ESCO"
  | "ONET"
  | "HR_OPEN"
  | "CUSTOM"
  | "DERIVED";

export type OntologyLicenseKind =
  | "CC_BY_4_0"
  | "PUBLIC_DOMAIN"
  | "PROPRIETARY"
  | "CUSTOM_LICENSE";

export type OntologyEdgeKind =
  | "BROADER"
  | "NARROWER"
  | "RELATED"
  | "EQUIVALENT";

export type MappingEvidenceType =
  | "interview_response"
  | "work_sample"
  | "portfolio"
  | "reference_check";

export type MappingEntailment =
  | "SUPPORTED"
  | "NOT_SUPPORTED"
  | "INSUFFICIENT";

export type MappingProposalDisposition =
  | "HUMAN_REVIEW_REQUIRED"
  | "CORRECTION_REVIEW_REQUESTED";

export type TombstoneReason =
  | "OWNER_REQUESTED"
  | "DATA_SUBJECT_DELETION"
  | "LEGAL_OBLIGATION"
  | "ONTOLOGY_VERSION_RETIRED";

/* ------------------------------------------------------------------ */
/*  Ontology release types (immutable)                                 */
/* ------------------------------------------------------------------ */

export interface OntologyConceptV1 {
  readonly conceptRef: `concept_${string}`;
  readonly labelRef: string;
  readonly labelLocale: string;
  readonly sourceKind: OntologySourceKind;
  readonly sourceUri: string;
  readonly sourceVersion: string;
  readonly deprecated: boolean;
}

export interface OntologyEdgeV1 {
  readonly edgeRef: `edge_${string}`;
  readonly sourceConceptRef: `concept_${string}`;
  readonly targetConceptRef: `concept_${string}`;
  readonly kind: OntologyEdgeKind;
}

export interface OntologyReleaseV1 {
  readonly schemaVersion: typeof SKILLS_ONTOLOGY_SCHEMA_VERSION;
  readonly releaseRef: `release_${string}`;
  readonly releaseVersion: string;
  readonly sourceKind: OntologySourceKind;
  readonly sourceUri: string;
  readonly sourceVersion: string;
  readonly licenseKind: OntologyLicenseKind;
  readonly licenseRef: string;
  readonly provenanceChainRef: string;
  readonly supersedesReleaseRef: `release_${string}` | null;
  readonly supersedesReleaseDigest: `sha256:${string}` | null;
  readonly concepts: readonly OntologyConceptV1[];
  readonly edges: readonly OntologyEdgeV1[];
  readonly createdAt: string;
  readonly immutable: true;
  readonly digestAlgorithm: "SHA-256";
  readonly releaseDigest: `sha256:${string}`;
}

/* ------------------------------------------------------------------ */
/*  Skill mapping proposal types (evidence-bound, ref-only)            */
/* ------------------------------------------------------------------ */

export interface SkillMappingEvidenceV1 {
  readonly tenantRef: string;
  readonly subjectRef: `subject_${string}`;
  readonly evidenceRef: `evidence_${string}`;
  readonly citationRef: `citation_${string}`;
  readonly conceptRef: `concept_${string}`;
  readonly ontologyReleaseRef: `release_${string}`;
  readonly ontologyReleaseVersion: string;
  readonly ontologyReleaseDigest: `sha256:${string}`;
  readonly evidenceType: MappingEvidenceType;
  readonly entailment: MappingEntailment;
  readonly sourceSegmentRefs: readonly `segment_${string}`[];
  readonly provenanceRef: string;
  readonly lexicalOnly: true;
}

export interface CreateSkillMappingProposalV1 {
  readonly schemaVersion: typeof SKILLS_ONTOLOGY_SCHEMA_VERSION;
  readonly synthetic: true;
  readonly tenantRef: string;
  readonly subjectRef: `subject_${string}`;
  readonly proposalId: `proposal_${string}`;
  readonly ontologyReleaseRef: `release_${string}`;
  readonly ontologyReleaseVersion: string;
  readonly ontologyReleaseDigest: `sha256:${string}`;
  readonly conceptRefs: readonly `concept_${string}`[];
  readonly aiOutputVersionRef: string;
  readonly humanOversightStandardRef: "human-oversight:canonical:v1";
  readonly provenanceChainRef: string;
  readonly containsRawPii: false;
  readonly containsRawProtectedAttributes: false;
  readonly silentInferenceAllowed: false;
  readonly evidenceInventory: readonly SkillMappingEvidenceV1[];
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

export type SkillMappingProposalReceiptV1 =
  CreateSkillMappingProposalV1 & {
    readonly proposalDigest: `sha256:${string}`;
  };

/* ------------------------------------------------------------------ */
/*  Correction request (non-mutating)                                  */
/* ------------------------------------------------------------------ */

export interface SkillMappingCorrectionRequestV1 {
  readonly correctionId: `correction_${string}`;
  readonly tenantRef: string;
  readonly subjectRef: `subject_${string}`;
  readonly proposalId: `proposal_${string}`;
  readonly proposalDigest: `sha256:${string}`;
  readonly aiOutputVersionRef: string;
  readonly humanRequesterRef: string;
  readonly authorizationReceiptRef: string;
  readonly correctionReasonRef: string;
  readonly requestedAt: string;
  readonly requestedTransition: "CORRECTION_REVIEW_ONLY";
  readonly actionRequested: false;
  readonly finalizeRequested: false;
}

export interface SkillMappingCorrectionReceiptV1 {
  readonly schemaVersion: typeof SKILLS_ONTOLOGY_SCHEMA_VERSION;
  readonly correctionId: `correction_${string}`;
  readonly tenantRef: string;
  readonly subjectRef: `subject_${string}`;
  readonly proposalId: `proposal_${string}`;
  readonly proposalDigest: `sha256:${string}`;
  readonly aiOutputVersionRef: string;
  readonly humanRequesterRef: string;
  readonly authorizationReceiptRef: string;
  readonly correctionReasonRef: string;
  readonly requestedAt: string;
  readonly disposition: MappingProposalDisposition;
  readonly oversightState: "AI_SUGGESTED";
  readonly proposalMutated: false;
  readonly actionApplied: false;
  readonly finalized: false;
  readonly productionEligible: false;
  readonly correctionDigest: `sha256:${string}`;
}

/* ------------------------------------------------------------------ */
/*  Deletion / tombstone (terminal, no revive)                         */
/* ------------------------------------------------------------------ */

export interface SkillMappingDeletionRequestV1 {
  readonly deletionId: `deletion_${string}`;
  readonly tenantRef: string;
  readonly subjectRef: `subject_${string}`;
  readonly proposalId: `proposal_${string}`;
  readonly proposalDigest: `sha256:${string}`;
  readonly humanRequesterRef: string;
  readonly authorizationReceiptRef: string;
  readonly deletionReasonRef: string;
  readonly tombstoneReason: TombstoneReason;
  readonly requestedAt: string;
}

export interface SkillMappingTombstoneReceiptV1 {
  readonly schemaVersion: typeof SKILLS_ONTOLOGY_SCHEMA_VERSION;
  readonly deletionId: `deletion_${string}`;
  readonly tenantRef: string;
  readonly subjectRef: `subject_${string}`;
  readonly proposalId: `proposal_${string}`;
  readonly proposalDigest: `sha256:${string}`;
  readonly humanRequesterRef: string;
  readonly authorizationReceiptRef: string;
  readonly deletionReasonRef: string;
  readonly tombstoneReason: TombstoneReason;
  readonly requestedAt: string;
  readonly terminal: true;
  readonly revivable: false;
  readonly actionApplied: false;
  readonly productionEligible: false;
  readonly tombstoneDigest: `sha256:${string}`;
}

/* ------------------------------------------------------------------ */
/*  Talent rediscovery types (unordered, proposal-only)                */
/* ------------------------------------------------------------------ */

export interface RediscoveryMatchV1 {
  readonly matchRef: `match_${string}`;
  readonly subjectRef: `subject_${string}`;
  readonly sourceProposalId: `proposal_${string}`;
  readonly sourceProposalDigest: `sha256:${string}`;
  readonly conceptRef: `concept_${string}`;
  readonly ontologyReleaseRef: `release_${string}`;
  readonly ontologyReleaseVersion: string;
  readonly ontologyReleaseDigest: `sha256:${string}`;
  readonly evidenceRefs: readonly `evidence_${string}`[];
  readonly citationRefs: readonly `citation_${string}`[];
  readonly evidenceEntailment: "SUPPORTED";
}

export interface CreateTalentRediscoveryProposalV1 {
  readonly schemaVersion: typeof SKILLS_ONTOLOGY_SCHEMA_VERSION;
  readonly synthetic: true;
  readonly tenantRef: string;
  readonly rediscoveryId: `rediscovery_${string}`;
  readonly ontologyReleaseRef: `release_${string}`;
  readonly ontologyReleaseVersion: string;
  readonly ontologyReleaseDigest: `sha256:${string}`;
  readonly targetConceptRefs: readonly `concept_${string}`[];
  readonly matches: readonly RediscoveryMatchV1[];
  readonly aiOutputVersionRef: string;
  readonly humanOversightStandardRef: "human-oversight:canonical:v1";
  readonly provenanceChainRef: string;
  readonly consentReceiptRef: string;
  readonly processingPurposeRef: string;
  readonly optOutCheckedAt: string;
  readonly optedOut: false;
  readonly containsRawPii: false;
  readonly containsRawProtectedAttributes: false;
  readonly silentInferenceAllowed: false;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly unordered: true;
  readonly displayOrder: "UNSPECIFIED";
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
  readonly realSubjectAccepted: false;
  readonly realRediscoveryActivated: false;
  readonly fullAtsAccepted: false;
}

export type TalentRediscoveryProposalReceiptV1 =
  CreateTalentRediscoveryProposalV1 & {
    readonly proposalDigest: `sha256:${string}`;
  };

export interface TalentRediscoveryTraceStatusV1 {
  readonly tenantRef: string;
  readonly rediscoveryId: `rediscovery_${string}`;
  readonly proposalDigest: `sha256:${string}`;
  readonly status: "TRACE_CURRENT" | "TRACE_INVALIDATED_BY_TOMBSTONE";
  readonly invalidatedSourceProposalIds: readonly `proposal_${string}`[];
}

/* ------------------------------------------------------------------ */
/*  Clock interface                                                    */
/* ------------------------------------------------------------------ */

export interface OntologyClock {
  now(): Date;
}

/* ------------------------------------------------------------------ */
/*  Validation constants                                               */
/* ------------------------------------------------------------------ */

const REF = /^[A-Za-z][A-Za-z0-9._:/-]{2,199}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const LOCALE = /^[a-z]{2,3}(?:-[A-Z]{2})?$/;
const OPAQUE = {
  release: /^release_[a-f0-9]{16}$/,
  concept: /^concept_[a-f0-9]{16}$/,
  edge: /^edge_[a-f0-9]{16}$/,
  subject: /^subject_[a-f0-9]{16}$/,
  proposal: /^proposal_[a-f0-9]{16}$/,
  evidence: /^evidence_[a-f0-9]{16}$/,
  citation: /^citation_[a-f0-9]{16}$/,
  segment: /^segment_[a-f0-9]{16}$/,
  correction: /^correction_[a-f0-9]{16}$/,
  deletion: /^deletion_[a-f0-9]{16}$/,
  match: /^match_[a-f0-9]{16}$/,
  rediscovery: /^rediscovery_[a-f0-9]{16}$/,
} as const;

const MAX_CONCEPTS = 500;
const MAX_EDGES = 1000;
const MAX_EVIDENCE = 50;
const MAX_CONCEPT_REFS = 50;
const MAX_CITATIONS_PER_ITEM = 10;
const MAX_SOURCE_SEGMENTS = 10;
const MAX_MATCHES = 100;
const MAX_TTL_MS = 168 * 60 * 60 * 1000; // 7 days
const MAX_OPT_OUT_STALENESS_MS = 24 * 60 * 60 * 1000;

const SOURCE_KINDS = new Set<OntologySourceKind>([
  "ESCO", "ONET", "HR_OPEN", "CUSTOM", "DERIVED",
]);
const LICENSE_KINDS = new Set<OntologyLicenseKind>([
  "CC_BY_4_0", "PUBLIC_DOMAIN", "PROPRIETARY", "CUSTOM_LICENSE",
]);
const EDGE_KINDS = new Set<OntologyEdgeKind>([
  "BROADER", "NARROWER", "RELATED", "EQUIVALENT",
]);
const EVIDENCE_TYPES = new Set<MappingEvidenceType>([
  "interview_response", "work_sample", "portfolio", "reference_check",
]);
const ENTAILMENTS = new Set<MappingEntailment>([
  "SUPPORTED", "NOT_SUPPORTED", "INSUFFICIENT",
]);
const TOMBSTONE_REASONS = new Set<TombstoneReason>([
  "OWNER_REQUESTED", "DATA_SUBJECT_DELETION",
  "LEGAL_OBLIGATION", "ONTOLOGY_VERSION_RETIRED",
]);

const FORBIDDEN_KEYS = new Set([
  "candidateId",
  "employeeId",
  "personName",
  "personId",
  "email",
  "phone",
  "freeText",
  "text",
  "content",
  "message",
  "description",
  "summary",
  "feedback",
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
  "protectedGroup",
  "affect",
  "emotion",
  "personality",
  "deception",
  "numericScore",
  "score",
  "rating",
  "ranking",
  "candidateRank",
  "hireDecision",
  "rejectDecision",
  "approvalReceipt",
  "automatedDecision",
  "silentInference",
]);

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

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

function assertAcyclicEdges(
  edges: readonly OntologyEdgeV1[],
  kind: "BROADER" | "NARROWER",
): void {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.kind !== kind) continue;
    const targets = adjacency.get(edge.sourceConceptRef) ?? [];
    targets.push(edge.targetConceptRef);
    adjacency.set(edge.sourceConceptRef, targets);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (conceptRef: string): void => {
    invariant(!visiting.has(conceptRef), `ONTOLOGY_${kind}_CYCLE`);
    if (visited.has(conceptRef)) return;
    visiting.add(conceptRef);
    for (const target of adjacency.get(conceptRef) ?? []) visit(target);
    visiting.delete(conceptRef);
    visited.add(conceptRef);
  };
  for (const conceptRef of adjacency.keys()) visit(conceptRef);
}

function normalizeReleaseInput(
  input: Omit<OntologyReleaseV1, "releaseDigest">,
): Omit<OntologyReleaseV1, "releaseDigest"> {
  return clone({
    ...input,
    concepts: [...input.concepts].sort((left, right) =>
      left.conceptRef.localeCompare(right.conceptRef),
    ),
    edges: [...input.edges].sort((left, right) => left.edgeRef.localeCompare(right.edgeRef)),
  });
}

function normalizeRediscoveryInput(
  input: CreateTalentRediscoveryProposalV1,
): CreateTalentRediscoveryProposalV1 {
  return clone({
    ...input,
    targetConceptRefs: [...input.targetConceptRefs].sort(),
    matches: input.matches
      .map((match) => {
        const evidenceCitationPairs = match.evidenceRefs
          .map((evidenceRef, index) => ({
            evidenceRef,
            citationRef: match.citationRefs[index]!,
          }))
          .sort((left, right) =>
            `${left.evidenceRef}:${left.citationRef}`.localeCompare(
              `${right.evidenceRef}:${right.citationRef}`,
            ),
          );
        return {
          ...match,
          evidenceRefs: evidenceCitationPairs.map((pair) => pair.evidenceRef),
          citationRefs: evidenceCitationPairs.map((pair) => pair.citationRef),
        };
      })
      .sort((left, right) =>
        `${left.subjectRef}:${left.conceptRef}:${left.sourceProposalId}:${left.matchRef}`.localeCompare(
          `${right.subjectRef}:${right.conceptRef}:${right.sourceProposalId}:${right.matchRef}`,
        ),
      ),
  });
}

function refValid(value: unknown): value is string {
  return typeof value === "string" && REF.test(value);
}

function assertRefs(values: readonly string[], code: string, max: number): void {
  invariant(values.length > 0 && values.length <= max, code);
  invariant(unique(values) && values.every(refValid), code);
}

/* ------------------------------------------------------------------ */
/*  Ontology release validation + registry                             */
/* ------------------------------------------------------------------ */

const RELEASE_KEYS = [
  "schemaVersion", "releaseRef", "releaseVersion", "sourceKind",
  "sourceUri", "sourceVersion", "licenseKind", "licenseRef",
  "provenanceChainRef", "supersedesReleaseRef", "supersedesReleaseDigest",
  "concepts", "edges", "createdAt", "immutable", "digestAlgorithm",
] as const;

function validateRelease(
  input: Omit<OntologyReleaseV1, "releaseDigest">,
  clock: OntologyClock,
): void {
  assertNoForbiddenKeys(input);
  assertOnlyKeys(input, [...RELEASE_KEYS], "RELEASE_UNKNOWN_FIELD");
  invariant(input.schemaVersion === SKILLS_ONTOLOGY_SCHEMA_VERSION, "SCHEMA_VERSION_UNSUPPORTED");
  invariant(OPAQUE.release.test(input.releaseRef), "RELEASE_REF_NOT_OPAQUE");
  invariant(refValid(input.releaseVersion), "RELEASE_VERSION_INVALID");
  invariant(SOURCE_KINDS.has(input.sourceKind), "SOURCE_KIND_INVALID");
  invariant(refValid(input.sourceUri), "SOURCE_URI_INVALID");
  invariant(refValid(input.sourceVersion), "SOURCE_VERSION_INVALID");
  invariant(LICENSE_KINDS.has(input.licenseKind), "LICENSE_KIND_INVALID");
  invariant(refValid(input.licenseRef), "LICENSE_REF_INVALID");
  invariant(refValid(input.provenanceChainRef), "PROVENANCE_CHAIN_REF_INVALID");
  invariant(input.immutable === true, "IMMUTABLE_REQUIRED");
  invariant(input.digestAlgorithm === "SHA-256", "DIGEST_ALGORITHM_INVALID");
  if (input.supersedesReleaseRef === null) {
    invariant(input.supersedesReleaseDigest === null, "RELEASE_LINEAGE_DIGEST_UNEXPECTED");
  } else {
    invariant(OPAQUE.release.test(input.supersedesReleaseRef), "SUPERSEDES_RELEASE_REF_NOT_OPAQUE");
    invariant(input.supersedesReleaseRef !== input.releaseRef, "RELEASE_LINEAGE_SELF_REFERENCE");
    invariant(
      typeof input.supersedesReleaseDigest === "string" && DIGEST.test(input.supersedesReleaseDigest),
      "SUPERSEDES_RELEASE_DIGEST_INVALID",
    );
  }

  invariant(
    input.concepts.length > 0 && input.concepts.length <= MAX_CONCEPTS,
    "CONCEPT_COUNT_INVALID",
  );
  const conceptIds = new Set<string>();
  for (const concept of input.concepts) {
    assertOnlyKeys(
      concept,
      ["conceptRef", "labelRef", "labelLocale", "sourceKind", "sourceUri", "sourceVersion", "deprecated"],
      "CONCEPT_UNKNOWN_FIELD",
    );
    invariant(OPAQUE.concept.test(concept.conceptRef), "CONCEPT_REF_NOT_OPAQUE");
    invariant(refValid(concept.labelRef), "CONCEPT_LABEL_REF_INVALID");
    invariant(LOCALE.test(concept.labelLocale), "CONCEPT_LABEL_LOCALE_INVALID");
    invariant(SOURCE_KINDS.has(concept.sourceKind), "CONCEPT_SOURCE_KIND_INVALID");
    invariant(refValid(concept.sourceUri), "CONCEPT_SOURCE_URI_INVALID");
    invariant(refValid(concept.sourceVersion), "CONCEPT_SOURCE_VERSION_INVALID");
    invariant(concept.sourceKind === input.sourceKind, "CONCEPT_SOURCE_KIND_MISMATCH");
    invariant(concept.sourceUri === input.sourceUri, "CONCEPT_SOURCE_URI_MISMATCH");
    invariant(concept.sourceVersion === input.sourceVersion, "CONCEPT_SOURCE_VERSION_MISMATCH");
    invariant(typeof concept.deprecated === "boolean", "CONCEPT_DEPRECATED_INVALID");
    invariant(!conceptIds.has(concept.conceptRef), "CONCEPT_REF_DUPLICATE");
    conceptIds.add(concept.conceptRef);
  }

  invariant(input.edges.length <= MAX_EDGES, "EDGE_COUNT_INVALID");
  const edgeIds = new Set<string>();
  const semanticEdges = new Set<string>();
  for (const edge of input.edges) {
    assertOnlyKeys(
      edge,
      ["edgeRef", "sourceConceptRef", "targetConceptRef", "kind"],
      "EDGE_UNKNOWN_FIELD",
    );
    invariant(OPAQUE.edge.test(edge.edgeRef), "EDGE_REF_NOT_OPAQUE");
    invariant(OPAQUE.concept.test(edge.sourceConceptRef), "EDGE_SOURCE_CONCEPT_NOT_OPAQUE");
    invariant(OPAQUE.concept.test(edge.targetConceptRef), "EDGE_TARGET_CONCEPT_NOT_OPAQUE");
    invariant(conceptIds.has(edge.sourceConceptRef), "EDGE_SOURCE_CONCEPT_UNKNOWN");
    invariant(conceptIds.has(edge.targetConceptRef), "EDGE_TARGET_CONCEPT_UNKNOWN");
    invariant(edge.sourceConceptRef !== edge.targetConceptRef, "EDGE_SELF_LOOP");
    invariant(EDGE_KINDS.has(edge.kind), "EDGE_KIND_INVALID");
    invariant(!edgeIds.has(edge.edgeRef), "EDGE_REF_DUPLICATE");
    const endpoints =
      edge.kind === "RELATED" || edge.kind === "EQUIVALENT"
        ? [edge.sourceConceptRef, edge.targetConceptRef].sort().join(":")
        : `${edge.sourceConceptRef}:${edge.targetConceptRef}`;
    const semanticKey = `${edge.kind}:${endpoints}`;
    invariant(!semanticEdges.has(semanticKey), "EDGE_SEMANTIC_DUPLICATE");
    if (edge.kind === "BROADER" || edge.kind === "NARROWER") {
      const inverseKind = edge.kind === "BROADER" ? "NARROWER" : "BROADER";
      const inverseKey = `${inverseKind}:${edge.targetConceptRef}:${edge.sourceConceptRef}`;
      invariant(!semanticEdges.has(inverseKey), "EDGE_INVERSE_DUPLICATE");
    }
    edgeIds.add(edge.edgeRef);
    semanticEdges.add(semanticKey);
  }
  assertAcyclicEdges(input.edges, "BROADER");
  assertAcyclicEdges(input.edges, "NARROWER");

  const createdAt = parseIso(input.createdAt, "CREATED_AT_INVALID");
  invariant(createdAt <= clock.now().getTime(), "CREATED_AT_IN_FUTURE");
}

function validateStoredRelease(release: OntologyReleaseV1): void {
  const { releaseDigest, ...unsigned } = release;
  invariant(DIGEST.test(releaseDigest), "RELEASE_DIGEST_INVALID");
  invariant(sha256(unsigned) === releaseDigest, "RELEASE_TAMPERED");
}

/* ------------------------------------------------------------------ */
/*  Skill mapping proposal validation                                  */
/* ------------------------------------------------------------------ */

const PROPOSAL_KEYS = [
  "schemaVersion", "synthetic", "tenantRef", "subjectRef", "proposalId",
  "ontologyReleaseRef", "ontologyReleaseVersion", "ontologyReleaseDigest",
  "conceptRefs", "aiOutputVersionRef", "humanOversightStandardRef",
  "provenanceChainRef", "containsRawPii", "containsRawProtectedAttributes",
  "silentInferenceAllowed",
  "evidenceInventory", "createdAt", "expiresAt", "oversightState",
  "proposalOnly", "humanReviewRequired", "humanRationaleRequired",
  "appealPathRef", "correctionPathRef", "auditLineageRefs",
  "actionAllowed", "individualDecisionAllowed", "autoExecute",
  "batchApproval", "mutationAllowed", "verdict", "evidenceGate",
  "legalGate", "independentAuditGate", "ownerGate", "productionEligible",
] as const;

function validateProposal(
  input: CreateSkillMappingProposalV1,
  release: OntologyReleaseV1,
  clock: OntologyClock,
): void {
  assertNoForbiddenKeys(input);
  assertOnlyKeys(input, [...PROPOSAL_KEYS], "PROPOSAL_UNKNOWN_FIELD");
  invariant(input.schemaVersion === SKILLS_ONTOLOGY_SCHEMA_VERSION, "SCHEMA_VERSION_UNSUPPORTED");
  invariant(input.synthetic === true, "SYNTHETIC_ONLY");
  invariant(refValid(input.tenantRef), "TENANT_REF_INVALID");
  invariant(OPAQUE.subject.test(input.subjectRef), "SUBJECT_REF_NOT_OPAQUE");
  invariant(OPAQUE.proposal.test(input.proposalId), "PROPOSAL_ID_NOT_OPAQUE");

  // Ontology release binding
  invariant(OPAQUE.release.test(input.ontologyReleaseRef), "ONTOLOGY_RELEASE_REF_NOT_OPAQUE");
  invariant(input.ontologyReleaseRef === release.releaseRef, "ONTOLOGY_RELEASE_REF_MISMATCH");
  invariant(refValid(input.ontologyReleaseVersion), "ONTOLOGY_RELEASE_VERSION_INVALID");
  invariant(input.ontologyReleaseVersion === release.releaseVersion, "ONTOLOGY_RELEASE_VERSION_MISMATCH");
  invariant(DIGEST.test(input.ontologyReleaseDigest), "ONTOLOGY_RELEASE_DIGEST_INVALID");
  invariant(input.ontologyReleaseDigest === release.releaseDigest, "ONTOLOGY_RELEASE_DIGEST_MISMATCH");

  const releaseConceptIds = new Set(release.concepts.map((c) => c.conceptRef));
  invariant(
    input.conceptRefs.length > 0 &&
      input.conceptRefs.length <= MAX_CONCEPT_REFS &&
      unique(input.conceptRefs) &&
      input.conceptRefs.every((ref) => OPAQUE.concept.test(ref)),
    "CONCEPT_REFS_INVALID",
  );
  for (const ref of input.conceptRefs) {
    const concept = release.concepts.find((item) => item.conceptRef === ref);
    invariant(concept, "CONCEPT_NOT_IN_RELEASE");
    invariant(!concept.deprecated, "CONCEPT_DEPRECATED");
  }

  invariant(refValid(input.aiOutputVersionRef), "AI_OUTPUT_VERSION_REF_INVALID");
  invariant(input.humanOversightStandardRef === "human-oversight:canonical:v1", "HUMAN_OVERSIGHT_STANDARD_INVALID");
  invariant(refValid(input.provenanceChainRef), "PROVENANCE_CHAIN_REF_INVALID");
  invariant(input.containsRawPii === false, "RAW_PII_DISALLOWED");
  invariant(input.containsRawProtectedAttributes === false, "RAW_PROTECTED_ATTRIBUTES_DISALLOWED");
  invariant(input.silentInferenceAllowed === false, "SILENT_INFERENCE_DISALLOWED");

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
  invariant(
    input.autoExecute === false && input.batchApproval === false && input.mutationAllowed === false,
    "AUTOMATION_DISALLOWED",
  );
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

  // Evidence inventory validation
  invariant(
    input.evidenceInventory.length > 0 && input.evidenceInventory.length <= MAX_EVIDENCE,
    "EVIDENCE_COUNT_INVALID",
  );
  for (const evidence of input.evidenceInventory) {
    assertOnlyKeys(
      evidence,
      [
        "tenantRef", "subjectRef", "evidenceRef", "citationRef",
        "conceptRef", "ontologyReleaseRef", "ontologyReleaseVersion",
        "ontologyReleaseDigest", "evidenceType", "entailment",
        "sourceSegmentRefs", "provenanceRef", "lexicalOnly",
      ],
      "EVIDENCE_UNKNOWN_FIELD",
    );
    invariant(evidence.tenantRef === input.tenantRef, "EVIDENCE_TENANT_SCOPE_MISMATCH");
    invariant(evidence.subjectRef === input.subjectRef, "EVIDENCE_SUBJECT_SCOPE_MISMATCH");
    invariant(OPAQUE.evidence.test(evidence.evidenceRef), "EVIDENCE_REF_NOT_OPAQUE");
    invariant(OPAQUE.citation.test(evidence.citationRef), "CITATION_REF_NOT_OPAQUE");
    invariant(OPAQUE.concept.test(evidence.conceptRef), "EVIDENCE_CONCEPT_NOT_OPAQUE");
    invariant(input.conceptRefs.includes(evidence.conceptRef), "EVIDENCE_CONCEPT_UNKNOWN");
    invariant(releaseConceptIds.has(evidence.conceptRef), "EVIDENCE_CONCEPT_NOT_IN_RELEASE");

    // Evidence must bind to exact ontology release
    invariant(evidence.ontologyReleaseRef === input.ontologyReleaseRef, "EVIDENCE_RELEASE_REF_MISMATCH");
    invariant(evidence.ontologyReleaseVersion === input.ontologyReleaseVersion, "EVIDENCE_RELEASE_VERSION_MISMATCH");
    invariant(evidence.ontologyReleaseDigest === input.ontologyReleaseDigest, "EVIDENCE_RELEASE_DIGEST_MISMATCH");

    invariant(EVIDENCE_TYPES.has(evidence.evidenceType), "EVIDENCE_TYPE_INVALID");
    invariant(ENTAILMENTS.has(evidence.entailment), "ENTAILMENT_INVALID");
    invariant(
      evidence.sourceSegmentRefs.length > 0 &&
        evidence.sourceSegmentRefs.length <= MAX_SOURCE_SEGMENTS &&
        unique(evidence.sourceSegmentRefs) &&
        evidence.sourceSegmentRefs.every((s) => OPAQUE.segment.test(s)),
      "SOURCE_SEGMENT_REFS_INVALID",
    );
    invariant(refValid(evidence.provenanceRef), "PROVENANCE_REF_INVALID");
    invariant(evidence.lexicalOnly === true, "LEXICAL_ONLY_REQUIRED");
  }
  invariant(unique(input.evidenceInventory.map((e) => e.evidenceRef)), "EVIDENCE_REF_DUPLICATE");
  invariant(unique(input.evidenceInventory.map((e) => e.citationRef)), "CITATION_REF_DUPLICATE");

  // Every conceptRef must have at least one SUPPORTED evidence
  for (const conceptRef of input.conceptRefs) {
    const conceptEvidence = input.evidenceInventory.filter(
      (e) => e.conceptRef === conceptRef && e.entailment === "SUPPORTED",
    );
    invariant(conceptEvidence.length > 0, "CONCEPT_UNSUPPORTED_BY_EVIDENCE");
  }
}

function validateStoredProposal(receipt: SkillMappingProposalReceiptV1): void {
  const { proposalDigest, ...unsigned } = receipt;
  invariant(DIGEST.test(proposalDigest), "PROPOSAL_DIGEST_INVALID");
  invariant(sha256(unsigned) === proposalDigest, "PROPOSAL_TAMPERED");
}

/* ------------------------------------------------------------------ */
/*  Talent rediscovery validation                                      */
/* ------------------------------------------------------------------ */

const REDISCOVERY_KEYS = [
  "schemaVersion", "synthetic", "tenantRef", "rediscoveryId",
  "ontologyReleaseRef", "ontologyReleaseVersion", "ontologyReleaseDigest",
  "targetConceptRefs", "matches", "aiOutputVersionRef",
  "humanOversightStandardRef", "provenanceChainRef",
  "consentReceiptRef", "processingPurposeRef", "optOutCheckedAt", "optedOut",
  "containsRawPii", "containsRawProtectedAttributes",
  "silentInferenceAllowed", "createdAt", "expiresAt", "unordered",
  "displayOrder", "oversightState",
  "proposalOnly", "humanReviewRequired", "humanRationaleRequired",
  "appealPathRef", "correctionPathRef", "auditLineageRefs",
  "actionAllowed", "individualDecisionAllowed", "autoExecute",
  "batchApproval", "mutationAllowed", "verdict", "evidenceGate",
  "legalGate", "independentAuditGate", "ownerGate", "productionEligible",
  "realSubjectAccepted", "realRediscoveryActivated", "fullAtsAccepted",
] as const;

function validateRediscovery(
  input: CreateTalentRediscoveryProposalV1,
  release: OntologyReleaseV1,
  proposalReceipts: ReadonlyMap<string, SkillMappingProposalReceiptV1>,
  tombstones: ReadonlyMap<string, SkillMappingTombstoneReceiptV1>,
  terminalSubjectTombstones: ReadonlySet<string>,
  clock: OntologyClock,
): void {
  assertNoForbiddenKeys(input);
  assertOnlyKeys(input, [...REDISCOVERY_KEYS], "REDISCOVERY_UNKNOWN_FIELD");
  invariant(input.schemaVersion === SKILLS_ONTOLOGY_SCHEMA_VERSION, "SCHEMA_VERSION_UNSUPPORTED");
  invariant(input.synthetic === true, "SYNTHETIC_ONLY");
  invariant(refValid(input.tenantRef), "TENANT_REF_INVALID");
  invariant(OPAQUE.rediscovery.test(input.rediscoveryId), "REDISCOVERY_ID_NOT_OPAQUE");

  invariant(OPAQUE.release.test(input.ontologyReleaseRef), "ONTOLOGY_RELEASE_REF_NOT_OPAQUE");
  invariant(input.ontologyReleaseRef === release.releaseRef, "ONTOLOGY_RELEASE_REF_MISMATCH");
  invariant(refValid(input.ontologyReleaseVersion), "ONTOLOGY_RELEASE_VERSION_INVALID");
  invariant(input.ontologyReleaseVersion === release.releaseVersion, "ONTOLOGY_RELEASE_VERSION_MISMATCH");
  invariant(DIGEST.test(input.ontologyReleaseDigest), "ONTOLOGY_RELEASE_DIGEST_INVALID");
  invariant(input.ontologyReleaseDigest === release.releaseDigest, "ONTOLOGY_RELEASE_DIGEST_MISMATCH");

  const releaseConceptIds = new Set(release.concepts.map((c) => c.conceptRef));
  invariant(
    input.targetConceptRefs.length > 0 &&
      input.targetConceptRefs.length <= MAX_CONCEPT_REFS &&
      unique(input.targetConceptRefs) &&
      input.targetConceptRefs.every((ref) => OPAQUE.concept.test(ref)),
    "TARGET_CONCEPT_REFS_INVALID",
  );
  for (const ref of input.targetConceptRefs) {
    const concept = release.concepts.find((item) => item.conceptRef === ref);
    invariant(concept, "TARGET_CONCEPT_NOT_IN_RELEASE");
    invariant(!concept.deprecated, "TARGET_CONCEPT_DEPRECATED");
  }

  invariant(refValid(input.aiOutputVersionRef), "AI_OUTPUT_VERSION_REF_INVALID");
  invariant(input.humanOversightStandardRef === "human-oversight:canonical:v1", "HUMAN_OVERSIGHT_STANDARD_INVALID");
  invariant(refValid(input.provenanceChainRef), "PROVENANCE_CHAIN_REF_INVALID");
  invariant(refValid(input.consentReceiptRef), "CONSENT_RECEIPT_REF_REQUIRED");
  invariant(refValid(input.processingPurposeRef), "PROCESSING_PURPOSE_REF_REQUIRED");
  invariant(input.containsRawPii === false, "RAW_PII_DISALLOWED");
  invariant(input.containsRawProtectedAttributes === false, "RAW_PROTECTED_ATTRIBUTES_DISALLOWED");
  invariant(input.silentInferenceAllowed === false, "SILENT_INFERENCE_DISALLOWED");
  const optOutCheckedAt = parseIso(input.optOutCheckedAt, "OPT_OUT_CHECKED_AT_INVALID");
  invariant(optOutCheckedAt <= clock.now().getTime(), "OPT_OUT_CHECKED_AT_IN_FUTURE");
  invariant(
    clock.now().getTime() - optOutCheckedAt <= MAX_OPT_OUT_STALENESS_MS,
    "OPT_OUT_CHECK_STALE",
  );
  invariant(input.optedOut === false, "REDISCOVERY_OPTED_OUT");

  const createdAt = parseIso(input.createdAt, "CREATED_AT_INVALID");
  const expiresAt = parseIso(input.expiresAt, "EXPIRES_AT_INVALID");
  const now = clock.now().getTime();
  invariant(createdAt <= now, "CREATED_AT_IN_FUTURE");
  invariant(expiresAt > now, "REDISCOVERY_EXPIRED");
  invariant(expiresAt > createdAt && expiresAt - createdAt <= MAX_TTL_MS, "REDISCOVERY_TTL_INVALID");

  invariant(input.unordered === true, "UNORDERED_REQUIRED");
  invariant(input.displayOrder === "UNSPECIFIED", "DISPLAY_ORDER_MUST_BE_UNSPECIFIED");
  invariant(input.oversightState === "AI_SUGGESTED", "OVERSIGHT_STATE_INVALID");
  invariant(input.proposalOnly === true, "PROPOSAL_ONLY_REQUIRED");
  invariant(input.humanReviewRequired === true && input.humanRationaleRequired === true, "HUMAN_REVIEW_REQUIRED");
  invariant(input.actionAllowed === false && input.individualDecisionAllowed === false, "ACTION_DISALLOWED");
  invariant(
    input.autoExecute === false && input.batchApproval === false && input.mutationAllowed === false,
    "AUTOMATION_DISALLOWED",
  );
  invariant(input.verdict === "NONE", "VERDICT_DISALLOWED");
  invariant(input.evidenceGate === "SYNTHETIC_EVIDENCE_ONLY", "EVIDENCE_GATE_INVALID");
  invariant(
    input.legalGate === "NOT_MET" &&
      input.independentAuditGate === "NOT_MET" &&
      input.ownerGate === "NOT_MET",
    "ACCEPTANCE_GATE_INVALID",
  );
  invariant(input.productionEligible === false, "PRODUCTION_ELIGIBILITY_DISALLOWED");
  invariant(
    input.realSubjectAccepted === false &&
      input.realRediscoveryActivated === false &&
      input.fullAtsAccepted === false,
    "REAL_ACTIVATION_DISALLOWED",
  );
  invariant(refValid(input.appealPathRef), "APPEAL_PATH_REF_REQUIRED");
  invariant(refValid(input.correctionPathRef), "CORRECTION_PATH_REF_REQUIRED");
  assertRefs(input.auditLineageRefs, "AUDIT_LINEAGE_REFS_INVALID", 10);

  // Matches validation
  invariant(
    input.matches.length > 0 && input.matches.length <= MAX_MATCHES,
    "MATCH_COUNT_INVALID",
  );
  for (const match of input.matches) {
    assertOnlyKeys(
      match,
      [
        "matchRef", "subjectRef", "sourceProposalId", "sourceProposalDigest",
        "conceptRef", "ontologyReleaseRef", "ontologyReleaseVersion",
        "ontologyReleaseDigest", "evidenceRefs", "citationRefs",
        "evidenceEntailment",
      ],
      "MATCH_UNKNOWN_FIELD",
    );
    invariant(OPAQUE.match.test(match.matchRef), "MATCH_REF_NOT_OPAQUE");
    invariant(OPAQUE.subject.test(match.subjectRef), "MATCH_SUBJECT_NOT_OPAQUE");
    invariant(
      !terminalSubjectTombstones.has(`${input.tenantRef}:${match.subjectRef}`),
      "MATCH_SUBJECT_TOMBSTONED",
    );
    invariant(OPAQUE.proposal.test(match.sourceProposalId), "MATCH_SOURCE_PROPOSAL_ID_NOT_OPAQUE");
    invariant(DIGEST.test(match.sourceProposalDigest), "MATCH_SOURCE_PROPOSAL_DIGEST_INVALID");
    invariant(OPAQUE.concept.test(match.conceptRef), "MATCH_CONCEPT_NOT_OPAQUE");
    invariant(releaseConceptIds.has(match.conceptRef), "MATCH_CONCEPT_NOT_IN_RELEASE");
    invariant(input.targetConceptRefs.includes(match.conceptRef), "MATCH_CONCEPT_NOT_IN_TARGET");
    invariant(match.ontologyReleaseRef === input.ontologyReleaseRef, "MATCH_RELEASE_REF_MISMATCH");
    invariant(match.ontologyReleaseVersion === input.ontologyReleaseVersion, "MATCH_RELEASE_VERSION_MISMATCH");
    invariant(match.ontologyReleaseDigest === input.ontologyReleaseDigest, "MATCH_RELEASE_DIGEST_MISMATCH");
    invariant(match.evidenceEntailment === "SUPPORTED", "MATCH_ENTAILMENT_NOT_SUPPORTED");
    invariant(
      match.evidenceRefs.length > 0 &&
        match.evidenceRefs.length <= MAX_CITATIONS_PER_ITEM &&
        unique(match.evidenceRefs) &&
        match.evidenceRefs.every((ref) => OPAQUE.evidence.test(ref)),
      "MATCH_EVIDENCE_REFS_INVALID",
    );
    invariant(
      match.citationRefs.length > 0 &&
        match.citationRefs.length <= MAX_CITATIONS_PER_ITEM &&
        unique(match.citationRefs) &&
        match.citationRefs.every((ref) => OPAQUE.citation.test(ref)),
      "MATCH_CITATIONS_INVALID",
    );
    invariant(match.evidenceRefs.length === match.citationRefs.length, "MATCH_EVIDENCE_CITATION_COUNT_MISMATCH");

    // Exact source proposal + evidence + concept + release binding. Broad scans
    // would permit citation laundering across proposals or ontology versions.
    const sourceProposalKey = `${input.tenantRef}:${match.subjectRef}:${match.sourceProposalId}`;
    invariant(!tombstones.has(sourceProposalKey), "MATCH_SOURCE_PROPOSAL_TOMBSTONED");
    const sourceProposal = proposalReceipts.get(sourceProposalKey);
    invariant(sourceProposal, "MATCH_SOURCE_PROPOSAL_NOT_FOUND");
    validateStoredProposal(sourceProposal);
    invariant(sourceProposal.proposalDigest === match.sourceProposalDigest, "MATCH_SOURCE_PROPOSAL_DIGEST_MISMATCH");
    invariant(sourceProposal.ontologyReleaseRef === match.ontologyReleaseRef, "MATCH_SOURCE_RELEASE_REF_MISMATCH");
    invariant(sourceProposal.ontologyReleaseVersion === match.ontologyReleaseVersion, "MATCH_SOURCE_RELEASE_VERSION_MISMATCH");
    invariant(sourceProposal.ontologyReleaseDigest === match.ontologyReleaseDigest, "MATCH_SOURCE_RELEASE_DIGEST_MISMATCH");
    invariant(sourceProposal.conceptRefs.includes(match.conceptRef), "MATCH_SOURCE_CONCEPT_MISMATCH");
    invariant(now < Date.parse(sourceProposal.expiresAt), "MATCH_SOURCE_PROPOSAL_EXPIRED");

    for (let index = 0; index < match.citationRefs.length; index += 1) {
      const citationRef = match.citationRefs[index];
      const evidenceRef = match.evidenceRefs[index];
      invariant(
        sourceProposal.evidenceInventory.some(
          (evidence) =>
            evidence.evidenceRef === evidenceRef &&
            evidence.citationRef === citationRef &&
            evidence.conceptRef === match.conceptRef &&
            evidence.ontologyReleaseRef === match.ontologyReleaseRef &&
            evidence.ontologyReleaseVersion === match.ontologyReleaseVersion &&
            evidence.ontologyReleaseDigest === match.ontologyReleaseDigest &&
            evidence.entailment === "SUPPORTED",
        ),
        "MATCH_EVIDENCE_NOT_TRACEABLE",
      );
    }
  }
  invariant(unique(input.matches.map((m) => m.matchRef)), "MATCH_REF_DUPLICATE");
  invariant(
    unique(input.matches.map((m) => `${m.subjectRef}:${m.conceptRef}:${m.sourceProposalId}`)),
    "MATCH_SUBJECT_CONCEPT_DUPLICATE",
  );
}

/* ------------------------------------------------------------------ */
/*  Registry (ontology releases + skill mapping + rediscovery)         */
/* ------------------------------------------------------------------ */

export class VersionedSkillsOntologyRegistry {
  private readonly releases = new Map<string, OntologyReleaseV1>();
  private readonly proposals = new Map<string, SkillMappingProposalReceiptV1>();
  private readonly corrections = new Map<string, { requestDigest: string; value: SkillMappingCorrectionReceiptV1 }>();
  private readonly tombstones = new Map<string, SkillMappingTombstoneReceiptV1>();
  private readonly terminalSubjectTombstones = new Set<string>();
  private readonly tombstonedLineageRefs = new Set<string>();
  private readonly successorByReleaseRef = new Map<string, string>();
  private readonly retiredReleaseRefs = new Set<string>();
  private readonly rediscoveries = new Map<string, TalentRediscoveryProposalReceiptV1>();

  constructor(private readonly clock: OntologyClock) {}

  /* -- Ontology release -------------------------------------------- */

  registerRelease(
    input: Omit<OntologyReleaseV1, "releaseDigest">,
  ): OntologyReleaseV1 {
    const normalized = normalizeReleaseInput(input);
    validateRelease(normalized, this.clock);
    if (normalized.supersedesReleaseRef !== null) {
      const previous = this.releases.get(normalized.supersedesReleaseRef);
      invariant(previous, "SUPERSEDED_RELEASE_NOT_FOUND");
      validateStoredRelease(previous);
      invariant(previous.releaseDigest === normalized.supersedesReleaseDigest, "SUPERSEDED_RELEASE_DIGEST_MISMATCH");
      invariant(previous.sourceKind === normalized.sourceKind, "RELEASE_LINEAGE_SOURCE_KIND_MISMATCH");
      invariant(Date.parse(previous.createdAt) < Date.parse(normalized.createdAt), "RELEASE_LINEAGE_TIME_INVALID");
      const registeredSuccessor = this.successorByReleaseRef.get(normalized.supersedesReleaseRef);
      invariant(
        registeredSuccessor === undefined || registeredSuccessor === normalized.releaseRef,
        "RELEASE_LINEAGE_FORK",
      );
    }
    const key = normalized.releaseRef;
    const releaseDigest = sha256(normalized);
    const existing = this.releases.get(key);
    if (existing) {
      invariant(existing.releaseDigest === releaseDigest, "RELEASE_REF_CONFLICT");
      return clone(existing);
    }
    const value: OntologyReleaseV1 = clone({ ...normalized, releaseDigest } as OntologyReleaseV1);
    this.releases.set(key, value);
    if (normalized.supersedesReleaseRef !== null) {
      this.successorByReleaseRef.set(normalized.supersedesReleaseRef, normalized.releaseRef);
    }
    return clone(value);
  }

  getRelease(releaseRef: string): OntologyReleaseV1 | undefined {
    const release = this.releases.get(releaseRef);
    if (!release) return undefined;
    validateStoredRelease(release);
    return clone(release);
  }

  /* -- Skill mapping proposal -------------------------------------- */

  createProposal(
    input: CreateSkillMappingProposalV1,
  ): SkillMappingProposalReceiptV1 {
    const release = this.releases.get(input.ontologyReleaseRef);
    invariant(release, "ONTOLOGY_RELEASE_NOT_FOUND");
    invariant(!this.retiredReleaseRefs.has(input.ontologyReleaseRef), "ONTOLOGY_RELEASE_RETIRED");
    validateStoredRelease(release);
    validateProposal(input, release, this.clock);

    const key = `${input.tenantRef}:${input.subjectRef}:${input.proposalId}`;
    invariant(
      !this.terminalSubjectTombstones.has(`${input.tenantRef}:${input.subjectRef}`),
      "SUBJECT_TOMBSTONED",
    );
    for (const evidence of input.evidenceInventory) {
      const lineageRefs = [
        evidence.evidenceRef,
        evidence.citationRef,
        evidence.provenanceRef,
        ...evidence.sourceSegmentRefs,
      ];
      invariant(
        lineageRefs.every((ref) => !this.tombstonedLineageRefs.has(ref)),
        "EVIDENCE_LINEAGE_TOMBSTONED",
      );
    }
    invariant(!this.tombstones.has(key), "PROPOSAL_TOMBSTONED");
    const proposalDigest = sha256(input);
    const existing = this.proposals.get(key);
    if (existing) {
      invariant(existing.proposalDigest === proposalDigest, "PROPOSAL_ID_CONFLICT");
      return clone(existing);
    }
    const value: SkillMappingProposalReceiptV1 = clone({ ...input, proposalDigest });
    this.proposals.set(key, value);
    return clone(value);
  }

  /* -- Correction -------------------------------------------------- */

  requestCorrection(
    request: SkillMappingCorrectionRequestV1,
  ): SkillMappingCorrectionReceiptV1 {
    assertNoForbiddenKeys(request);
    assertOnlyKeys(
      request,
      [
        "correctionId", "tenantRef", "subjectRef", "proposalId",
        "proposalDigest", "aiOutputVersionRef", "humanRequesterRef",
        "authorizationReceiptRef",
        "correctionReasonRef", "requestedAt", "requestedTransition",
        "actionRequested", "finalizeRequested",
      ],
      "CORRECTION_UNKNOWN_FIELD",
    );
    invariant(OPAQUE.correction.test(request.correctionId), "CORRECTION_ID_NOT_OPAQUE");
    invariant(refValid(request.tenantRef), "CORRECTION_TENANT_REF_INVALID");
    invariant(OPAQUE.subject.test(request.subjectRef), "CORRECTION_SUBJECT_NOT_OPAQUE");
    invariant(OPAQUE.proposal.test(request.proposalId), "CORRECTION_PROPOSAL_ID_NOT_OPAQUE");
    invariant(DIGEST.test(request.proposalDigest), "CORRECTION_PROPOSAL_DIGEST_INVALID");
    invariant(refValid(request.aiOutputVersionRef), "CORRECTION_AI_OUTPUT_VERSION_REF_INVALID");
    invariant(refValid(request.humanRequesterRef), "HUMAN_REQUESTER_REF_REQUIRED");
    invariant(refValid(request.authorizationReceiptRef), "CORRECTION_AUTHORIZATION_RECEIPT_REF_REQUIRED");
    invariant(refValid(request.correctionReasonRef), "CORRECTION_REASON_REF_REQUIRED");
    const requestedAt = parseIso(request.requestedAt, "CORRECTION_REQUESTED_AT_INVALID");
    invariant(requestedAt <= this.clock.now().getTime(), "CORRECTION_REQUESTED_AT_IN_FUTURE");
    invariant(request.requestedTransition === "CORRECTION_REVIEW_ONLY", "CORRECTION_TRANSITION_INVALID");
    invariant(
      request.actionRequested === false && request.finalizeRequested === false,
      "CORRECTION_ACTION_DISALLOWED",
    );

    const proposalKey = `${request.tenantRef}:${request.subjectRef}:${request.proposalId}`;
    invariant(!this.tombstones.has(proposalKey), "PROPOSAL_TOMBSTONED");
    const proposal = this.proposals.get(proposalKey);
    invariant(proposal, "CORRECTION_PROPOSAL_NOT_FOUND");
    validateStoredProposal(proposal);
    invariant(this.clock.now().getTime() < Date.parse(proposal.expiresAt), "PROPOSAL_EXPIRED");
    invariant(requestedAt >= Date.parse(proposal.createdAt), "CORRECTION_REQUESTED_BEFORE_PROPOSAL");
    invariant(request.proposalDigest === proposal.proposalDigest, "CORRECTION_PROPOSAL_DIGEST_MISMATCH");
    invariant(request.aiOutputVersionRef === proposal.aiOutputVersionRef, "CORRECTION_AI_OUTPUT_VERSION_MISMATCH");

    const correctionKey = `${request.tenantRef}:${request.subjectRef}:${request.correctionId}`;
    const requestDigest = sha256(request);
    const existing = this.corrections.get(correctionKey);
    if (existing) {
      invariant(existing.requestDigest === requestDigest, "CORRECTION_ID_CONFLICT");
      return clone(existing.value);
    }
    const unsigned = {
      schemaVersion: SKILLS_ONTOLOGY_SCHEMA_VERSION,
      correctionId: request.correctionId,
      tenantRef: request.tenantRef,
      subjectRef: request.subjectRef,
      proposalId: request.proposalId,
      proposalDigest: request.proposalDigest,
      aiOutputVersionRef: request.aiOutputVersionRef,
      humanRequesterRef: request.humanRequesterRef,
      authorizationReceiptRef: request.authorizationReceiptRef,
      correctionReasonRef: request.correctionReasonRef,
      requestedAt: request.requestedAt,
      disposition: "CORRECTION_REVIEW_REQUESTED" as const,
      oversightState: "AI_SUGGESTED" as const,
      proposalMutated: false as const,
      actionApplied: false as const,
      finalized: false as const,
      productionEligible: false as const,
    };
    const value: SkillMappingCorrectionReceiptV1 = clone({
      ...unsigned,
      correctionDigest: sha256(unsigned),
    });
    this.corrections.set(correctionKey, { requestDigest, value });
    return clone(value);
  }

  /* -- Deletion / tombstone ---------------------------------------- */

  requestDeletion(
    request: SkillMappingDeletionRequestV1,
  ): SkillMappingTombstoneReceiptV1 {
    assertNoForbiddenKeys(request);
    assertOnlyKeys(
      request,
      [
        "deletionId", "tenantRef", "subjectRef", "proposalId",
        "proposalDigest", "humanRequesterRef", "deletionReasonRef",
        "authorizationReceiptRef",
        "tombstoneReason", "requestedAt",
      ],
      "DELETION_UNKNOWN_FIELD",
    );
    invariant(OPAQUE.deletion.test(request.deletionId), "DELETION_ID_NOT_OPAQUE");
    invariant(refValid(request.tenantRef), "DELETION_TENANT_REF_INVALID");
    invariant(OPAQUE.subject.test(request.subjectRef), "DELETION_SUBJECT_NOT_OPAQUE");
    invariant(OPAQUE.proposal.test(request.proposalId), "DELETION_PROPOSAL_ID_NOT_OPAQUE");
    invariant(DIGEST.test(request.proposalDigest), "DELETION_PROPOSAL_DIGEST_INVALID");
    invariant(refValid(request.humanRequesterRef), "DELETION_HUMAN_REQUESTER_REF_REQUIRED");
    invariant(refValid(request.authorizationReceiptRef), "DELETION_AUTHORIZATION_RECEIPT_REF_REQUIRED");
    invariant(refValid(request.deletionReasonRef), "DELETION_REASON_REF_REQUIRED");
    invariant(TOMBSTONE_REASONS.has(request.tombstoneReason), "TOMBSTONE_REASON_INVALID");
    const requestedAt = parseIso(request.requestedAt, "DELETION_REQUESTED_AT_INVALID");
    invariant(requestedAt <= this.clock.now().getTime(), "DELETION_REQUESTED_AT_IN_FUTURE");

    const proposalKey = `${request.tenantRef}:${request.subjectRef}:${request.proposalId}`;

    // Idempotent: if already tombstoned with same content, return existing
    const existingTombstone = this.tombstones.get(proposalKey);
    if (existingTombstone) {
      const requestDigest = sha256(request);
      const existingRequestDigest = sha256({
        deletionId: existingTombstone.deletionId,
        tenantRef: existingTombstone.tenantRef,
        subjectRef: existingTombstone.subjectRef,
        proposalId: existingTombstone.proposalId,
        proposalDigest: existingTombstone.proposalDigest,
        humanRequesterRef: existingTombstone.humanRequesterRef,
        authorizationReceiptRef: existingTombstone.authorizationReceiptRef,
        deletionReasonRef: existingTombstone.deletionReasonRef,
        tombstoneReason: existingTombstone.tombstoneReason,
        requestedAt: existingTombstone.requestedAt,
      });
      invariant(requestDigest === existingRequestDigest, "PROPOSAL_ALREADY_TOMBSTONED");
      return clone(existingTombstone);
    }

    const proposal = this.proposals.get(proposalKey);
    invariant(proposal, "DELETION_PROPOSAL_NOT_FOUND");
    validateStoredProposal(proposal);
    invariant(requestedAt >= Date.parse(proposal.createdAt), "DELETION_REQUESTED_BEFORE_PROPOSAL");
    invariant(request.proposalDigest === proposal.proposalDigest, "DELETION_PROPOSAL_DIGEST_MISMATCH");

    const unsigned = {
      schemaVersion: SKILLS_ONTOLOGY_SCHEMA_VERSION,
      deletionId: request.deletionId,
      tenantRef: request.tenantRef,
      subjectRef: request.subjectRef,
      proposalId: request.proposalId,
      proposalDigest: request.proposalDigest,
      humanRequesterRef: request.humanRequesterRef,
      authorizationReceiptRef: request.authorizationReceiptRef,
      deletionReasonRef: request.deletionReasonRef,
      tombstoneReason: request.tombstoneReason,
      requestedAt: request.requestedAt,
      terminal: true as const,
      revivable: false as const,
      actionApplied: false as const,
      productionEligible: false as const,
    };
    const value: SkillMappingTombstoneReceiptV1 = clone({
      ...unsigned,
      tombstoneDigest: sha256(unsigned),
    });
    this.tombstones.set(proposalKey, value);
    for (const evidence of proposal.evidenceInventory) {
      this.tombstonedLineageRefs.add(evidence.evidenceRef);
      this.tombstonedLineageRefs.add(evidence.citationRef);
      this.tombstonedLineageRefs.add(evidence.provenanceRef);
      for (const segmentRef of evidence.sourceSegmentRefs) {
        this.tombstonedLineageRefs.add(segmentRef);
      }
    }
    if (
      request.tombstoneReason === "DATA_SUBJECT_DELETION" ||
      request.tombstoneReason === "LEGAL_OBLIGATION"
    ) {
      this.terminalSubjectTombstones.add(`${request.tenantRef}:${request.subjectRef}`);
    }
    if (request.tombstoneReason === "ONTOLOGY_VERSION_RETIRED") {
      this.retiredReleaseRefs.add(proposal.ontologyReleaseRef);
    }
    return clone(value);
  }

  /* -- Talent rediscovery ------------------------------------------ */

  createRediscovery(
    input: CreateTalentRediscoveryProposalV1,
  ): TalentRediscoveryProposalReceiptV1 {
    const release = this.releases.get(input.ontologyReleaseRef);
    invariant(release, "ONTOLOGY_RELEASE_NOT_FOUND");
    invariant(!this.retiredReleaseRefs.has(input.ontologyReleaseRef), "ONTOLOGY_RELEASE_RETIRED");
    validateStoredRelease(release);
    validateRediscovery(
      input,
      release,
      this.proposals,
      this.tombstones,
      this.terminalSubjectTombstones,
      this.clock,
    );

    const normalized = normalizeRediscoveryInput(input);
    const key = `${normalized.tenantRef}:${normalized.rediscoveryId}`;
    const proposalDigest = sha256(normalized);
    const existing = this.rediscoveries.get(key);
    if (existing) {
      invariant(existing.proposalDigest === proposalDigest, "REDISCOVERY_ID_CONFLICT");
      return clone(existing);
    }
    const value: TalentRediscoveryProposalReceiptV1 = clone({ ...normalized, proposalDigest });
    this.rediscoveries.set(key, value);
    return clone(value);
  }

  getRediscoveryTraceStatus(
    tenantRef: string,
    rediscoveryId: `rediscovery_${string}`,
  ): TalentRediscoveryTraceStatusV1 | undefined {
    invariant(refValid(tenantRef), "TENANT_REF_INVALID");
    invariant(OPAQUE.rediscovery.test(rediscoveryId), "REDISCOVERY_ID_NOT_OPAQUE");
    const receipt = this.rediscoveries.get(`${tenantRef}:${rediscoveryId}`);
    if (!receipt) return undefined;
    const invalidatedSourceProposalIds = receipt.matches
      .filter((match) => {
        const proposalKey = `${tenantRef}:${match.subjectRef}:${match.sourceProposalId}`;
        return (
          this.tombstones.has(proposalKey) ||
          this.terminalSubjectTombstones.has(`${tenantRef}:${match.subjectRef}`)
        );
      })
      .map((match) => match.sourceProposalId)
      .filter((proposalId, index, values) => values.indexOf(proposalId) === index)
      .sort();
    return clone({
      tenantRef,
      rediscoveryId,
      proposalDigest: receipt.proposalDigest,
      status:
        invalidatedSourceProposalIds.length === 0
          ? "TRACE_CURRENT"
          : "TRACE_INVALIDATED_BY_TOMBSTONE",
      invalidatedSourceProposalIds,
    });
  }
}
