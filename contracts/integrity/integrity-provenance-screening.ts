/**
 * Faz 25 P6.4 — integrity/provenance screening evidence.
 *
 * Epistemic boundary:
 *   - C2PA NOT_PRESENT is not evidence that an asset is fake or a deepfake.
 *   - VERIFIED_BINDING verifies a provenance binding, not truth, identity,
 *     authenticity, intent, deception, or a person.
 *   - Receipts are append-only screening evidence. They cannot reject, rank,
 *     score, label, or otherwise mutate an ATS subject or workflow.
 *   - PRE-G0 accepts synthetic, ref-only inputs only. Raw media and biometric
 *     material are outside this contract.
 */

import { createHash } from "node:crypto";

export const INTEGRITY_PROVENANCE_SCHEMA_VERSION =
  "integrity-provenance-screening/v1" as const;

export type IntegrityScreeningStatus =
  | "VERIFIED_BINDING"
  | "FAILED_BINDING"
  | "NOT_PRESENT"
  | "UNSUPPORTED"
  | "VERIFICATION_ERROR"
  | "INCONCLUSIVE";

export type IntegrityReasonCode =
  | "MANIFEST_BINDING_VERIFIED"
  | "MANIFEST_NOT_PRESENT"
  | "MANIFEST_SIGNATURE_INVALID"
  | "ASSET_DIGEST_MISMATCH"
  | "CLAIM_DIGEST_MISMATCH"
  | "UNSUPPORTED_MANIFEST_FORMAT"
  | "VERIFIER_ERROR"
  | "TRUST_LIST_STALE"
  | "DIGEST_MISMATCH_WITH_TRANSCODE_CONTEXT"
  | "DIGEST_MISMATCH_UNKNOWN"
  | "ACCESSIBILITY_TRANSCODE_OBSERVED";

export type CorrectionReason =
  | "VERIFIER_RESULT_CORRECTED"
  | "TRUST_LIST_UPDATED"
  | "POLICY_VERSION_UPDATED"
  | "ASSET_SNAPSHOT_CORRECTED"
  | "EVIDENCE_LINEAGE_CORRECTED";

export interface IntegrityCoverageRefsV1 {
  readonly falsePositive: IntegrityCoverageEvidenceV1;
  readonly falseNegative: IntegrityCoverageEvidenceV1;
  readonly uncertainty: IntegrityCoverageEvidenceV1;
  readonly deviceCodec: IntegrityCoverageEvidenceV1;
  readonly accessibility: IntegrityCoverageEvidenceV1;
}

export interface IntegrityCoverageEvidenceV1 {
  readonly measurementState: "SYNTHETIC_ONLY";
  readonly evidenceRef: string;
  readonly evidenceDigest: `sha256:${string}`;
  readonly measurementPolicyVersionRef: string;
}

export interface IntegrityReasonEvidenceBindingV1 {
  readonly reasonCode: IntegrityReasonCode;
  readonly evidenceRef: string;
  readonly evidenceDigest: `sha256:${string}`;
  readonly assetSnapshotRef: `snapshot_${string}`;
  readonly assetSnapshotDigest: `sha256:${string}`;
  readonly manifestDigest: `sha256:${string}` | null;
  readonly claimDigest: `sha256:${string}` | null;
  readonly verifierVersionRef: string;
  readonly trustListVersionRef: string;
  readonly policyVersionRef: string;
}

export interface IntegrityScopeBindingMaterialV1 {
  readonly screeningId: `screening_${string}`;
  readonly tenantRef: string;
  readonly scopeRef: string;
  readonly assetRef: `asset_${string}`;
  readonly assetSnapshotRef: `snapshot_${string}`;
  readonly assetSnapshotCapturedAt: string;
  readonly assetDigest: `sha256:${string}`;
  readonly manifestDigest: `sha256:${string}` | null;
  readonly claimDigest: `sha256:${string}` | null;
  readonly verifierVersionRef: string;
  readonly trustListVersionRef: string;
  readonly policyVersionRef: string;
}

export interface CreateIntegrityScreeningReceiptV1 {
  readonly schemaVersion: typeof INTEGRITY_PROVENANCE_SCHEMA_VERSION;
  readonly screeningId: `screening_${string}`;
  readonly synthetic: true;

  readonly tenantRef: string;
  readonly scopeRef: string;
  readonly assetRef: `asset_${string}`;
  readonly assetSnapshotRef: `snapshot_${string}`;
  readonly assetDigestAlgorithm: "SHA-256";
  readonly assetDigest: `sha256:${string}`;
  readonly assetSnapshotDigest: `sha256:${string}`;
  readonly scopeBindingAlgorithm: "SHA-256";
  readonly scopeBindingDigest: `sha256:${string}`;
  /** Claimed external attestation refs; this registry does not verify a signature. */
  readonly scopeBindingAttestationRef: string;
  readonly scopeBindingAttestationDigest: `sha256:${string}`;
  readonly scopeBindingKeyVersionRef: string;
  readonly assetSnapshotCapturedAt: string;
  readonly assetMutationObserved: false;

  readonly manifestPresence: "PRESENT" | "NOT_PRESENT" | "UNKNOWN";
  readonly manifestDigestAlgorithm: "SHA-256" | null;
  readonly manifestDigest: `sha256:${string}` | null;
  readonly claimDigestAlgorithm: "SHA-256" | null;
  readonly claimDigest: `sha256:${string}` | null;
  readonly manifestTimestamp: string | null;

  readonly verifierVersionRef: string;
  readonly trustListVersionRef: string;
  readonly trustListPublishedAt: string;
  readonly maxTrustListAgeHours: number;
  readonly policyVersionRef: string;
  readonly timestampAuthorityRef: string;
  readonly verifiedAt: string;
  readonly evidenceRefs: readonly string[];
  readonly reasonEvidenceBindings: readonly IntegrityReasonEvidenceBindingV1[];
  readonly coverageRefs: IntegrityCoverageRefsV1;

  readonly status: IntegrityScreeningStatus;
  readonly reasonCodes: readonly IntegrityReasonCode[];
  readonly screeningOnly: true;
  readonly containsRawMedia: false;
  readonly containsBiometricData: false;
  readonly containsRawPii: false;
  readonly deepfakeConclusion: "NONE";
  readonly authenticityConclusion: "NONE";
  readonly identityConclusion: "NONE";
  readonly deceptionConclusion: "NONE";
  readonly emotionConclusion: "NONE";
  readonly personRiskScoreAllowed: false;
  readonly actionAllowed: false;
  readonly adverseActionAllowed: false;
  readonly automaticRejectionAllowed: false;
  readonly mutationAllowed: false;
  readonly verdict: "NONE";

  readonly humanReviewRequired: true;
  readonly humanReviewPathRef: string;
  readonly appealPathRef: string;
  readonly correctionPathRef: string;
  readonly humanOversightStandardRef: "human-oversight:canonical:v1";
  readonly auditLineageRefs: readonly string[];

  readonly retentionPolicyRef: string;
  readonly retentionExpiresAt: string;
  readonly deletionMechanism: "HARD_DELETE" | "CRYPTO_SHRED";
  readonly legalGate: "NOT_MET";
  readonly ownerGate: "NOT_MET";
  readonly productionEligible: false;
  readonly immutable: true;

  readonly supersedesScreeningId: `screening_${string}` | null;
  readonly supersedesRecordDigest: `sha256:${string}` | null;
  readonly correctionReason: CorrectionReason | null;
}

export type IntegrityScreeningReceiptV1 =
  CreateIntegrityScreeningReceiptV1 & {
    readonly recordDigest: `sha256:${string}`;
  };

export interface IntegrityClock {
  now(): Date;
}

const SYSTEM_CLOCK: IntegrityClock = { now: () => new Date() };
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const OPAQUE_REF_PATTERN = /^[a-z][a-z0-9_-]*(?::[a-z0-9._-]+)+$/;
const ID_PATTERN = /^(screening|asset|snapshot)_[a-f0-9]{16,64}$/;
const MAX_TRUST_LIST_AGE_HOURS = 720;
const PINNED_TRUST_LIST_AGE_HOURS = 48;
const MAX_RETENTION_HOURS = 24 * 30;
const MAX_SNAPSHOT_TO_VERIFY_MINUTES = 15;
const MAX_VERIFY_TO_RECORD_HOURS = 1;
const MAX_EVIDENCE_REFS = 32;

const ROOT_KEYS = new Set([
  "schemaVersion", "screeningId", "synthetic", "tenantRef", "scopeRef",
  "assetRef", "assetSnapshotRef", "assetDigestAlgorithm", "assetDigest",
  "assetSnapshotDigest", "scopeBindingAlgorithm", "scopeBindingDigest",
  "scopeBindingAttestationRef", "scopeBindingAttestationDigest",
  "scopeBindingKeyVersionRef", "assetSnapshotCapturedAt",
  "assetMutationObserved", "manifestPresence",
  "manifestDigestAlgorithm", "manifestDigest", "claimDigestAlgorithm",
  "claimDigest", "manifestTimestamp", "verifierVersionRef",
  "trustListVersionRef", "trustListPublishedAt", "maxTrustListAgeHours",
  "policyVersionRef", "timestampAuthorityRef", "verifiedAt", "evidenceRefs",
  "reasonEvidenceBindings", "coverageRefs", "status",
  "reasonCodes", "screeningOnly", "containsRawMedia", "containsBiometricData",
  "containsRawPii", "deepfakeConclusion", "authenticityConclusion",
  "identityConclusion", "deceptionConclusion", "emotionConclusion",
  "personRiskScoreAllowed", "actionAllowed", "adverseActionAllowed",
  "automaticRejectionAllowed", "mutationAllowed", "verdict",
  "humanReviewRequired", "humanReviewPathRef", "appealPathRef", "correctionPathRef",
  "humanOversightStandardRef", "auditLineageRefs", "retentionPolicyRef",
  "retentionExpiresAt", "deletionMechanism", "legalGate", "ownerGate",
  "productionEligible", "immutable", "supersedesScreeningId",
  "supersedesRecordDigest", "correctionReason",
]);

const COVERAGE_KEYS = new Set([
  "falsePositive", "falseNegative", "uncertainty", "deviceCodec",
  "accessibility",
]);

const COVERAGE_EVIDENCE_KEYS = new Set([
  "measurementState", "evidenceRef", "evidenceDigest",
  "measurementPolicyVersionRef",
]);

const REASON_BINDING_KEYS = new Set([
  "reasonCode", "evidenceRef", "evidenceDigest", "assetSnapshotRef",
  "assetSnapshotDigest", "manifestDigest", "claimDigest", "verifierVersionRef",
  "trustListVersionRef", "policyVersionRef",
]);

const STATUSES = new Set<IntegrityScreeningStatus>([
  "VERIFIED_BINDING", "FAILED_BINDING", "NOT_PRESENT", "UNSUPPORTED",
  "VERIFICATION_ERROR", "INCONCLUSIVE",
]);

const REASONS = new Set<IntegrityReasonCode>([
  "MANIFEST_BINDING_VERIFIED", "MANIFEST_NOT_PRESENT",
  "MANIFEST_SIGNATURE_INVALID", "ASSET_DIGEST_MISMATCH",
  "CLAIM_DIGEST_MISMATCH", "UNSUPPORTED_MANIFEST_FORMAT", "VERIFIER_ERROR",
  "TRUST_LIST_STALE", "DIGEST_MISMATCH_WITH_TRANSCODE_CONTEXT",
  "DIGEST_MISMATCH_UNKNOWN", "ACCESSIBILITY_TRANSCODE_OBSERVED",
]);

const CORRECTION_REASONS = new Set<CorrectionReason>([
  "VERIFIER_RESULT_CORRECTED", "TRUST_LIST_UPDATED", "POLICY_VERSION_UPDATED",
  "ASSET_SNAPSHOT_CORRECTED", "EVIDENCE_LINEAGE_CORRECTED",
]);

function fail(code: string): never {
  throw new Error(code);
}

function assertObject(value: unknown, code: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(code);
}

function assertOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>, code: string): void {
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(`${code}:${key}`);
}

function assertRef(value: unknown, code: string): asserts value is string {
  if (typeof value !== "string" || !OPAQUE_REF_PATTERN.test(value) || value.length > 160) fail(code);
}

function assertOpaqueId(value: unknown, prefix: string, code: string): asserts value is string {
  if (typeof value !== "string" ||
      !new RegExp(`^${prefix}_[a-f0-9]{16,64}$`).test(value)) fail(code);
}

function assertId(value: unknown, prefix: "screening" | "asset" | "snapshot", code: string): void {
  if (typeof value !== "string" || !value.startsWith(`${prefix}_`) || !ID_PATTERN.test(value)) fail(code);
}

function assertDigest(value: unknown, code: string): asserts value is `sha256:${string}` {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) fail(code);
}

function parseTime(value: unknown, code: string): number {
  if (typeof value !== "string") fail(code);
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value) fail(code);
  return time;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

function digest(value: unknown): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex")}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function computeIntegrityScopeBindingDigest(
  material: IntegrityScopeBindingMaterialV1,
): `sha256:${string}` {
  return digest(material);
}

function assertOpaqueRefList(
  value: unknown,
  prefix: string,
  code: string,
): asserts value is readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_EVIDENCE_REFS) fail(code);
  const seen = new Set<string>();
  for (const item of value) {
    assertOpaqueId(item, prefix, code);
    if (seen.has(item)) fail(`${code}_DUPLICATE`);
    seen.add(item);
  }
  if ([...seen].join("\u0000") !== [...seen].sort().join("\u0000")) fail(`${code}_NOT_CANONICAL`);
}

function validateCoverage(value: unknown): asserts value is IntegrityCoverageRefsV1 {
  assertObject(value, "COVERAGE_INVALID");
  assertOnlyKeys(value, COVERAGE_KEYS, "COVERAGE_UNKNOWN_FIELD");
  const refs = new Set<string>();
  for (const key of COVERAGE_KEYS) {
    const evidence = value[key];
    assertObject(evidence, `COVERAGE_EVIDENCE_INVALID:${key}`);
    assertOnlyKeys(evidence, COVERAGE_EVIDENCE_KEYS, `COVERAGE_EVIDENCE_UNKNOWN_FIELD:${key}`);
    if (evidence.measurementState !== "SYNTHETIC_ONLY") fail(`COVERAGE_STATE_INVALID:${key}`);
    assertOpaqueId(evidence.evidenceRef, "coverage", `COVERAGE_REF_INVALID:${key}`);
    if (refs.has(evidence.evidenceRef)) fail("COVERAGE_REF_DUPLICATE");
    refs.add(evidence.evidenceRef);
    assertDigest(evidence.evidenceDigest, `COVERAGE_DIGEST_INVALID:${key}`);
    assertRef(evidence.measurementPolicyVersionRef, `COVERAGE_POLICY_REF_INVALID:${key}`);
  }
}

function validateReasonEvidenceBindings(input: CreateIntegrityScreeningReceiptV1): void {
  if (!Array.isArray(input.reasonEvidenceBindings) ||
      input.reasonEvidenceBindings.length !== input.reasonCodes.length) {
    fail("REASON_EVIDENCE_BINDING_COVERAGE_INVALID");
  }
  const reasons = new Set<string>();
  const evidence = new Set<string>();
  for (const binding of input.reasonEvidenceBindings) {
    assertObject(binding, "REASON_EVIDENCE_BINDING_INVALID");
    assertOnlyKeys(binding, REASON_BINDING_KEYS, "REASON_EVIDENCE_BINDING_UNKNOWN_FIELD");
    if (!REASONS.has(binding.reasonCode as IntegrityReasonCode)) fail("REASON_EVIDENCE_CODE_INVALID");
    if (reasons.has(binding.reasonCode as string)) fail("REASON_EVIDENCE_CODE_DUPLICATE");
    reasons.add(binding.reasonCode as string);
    assertOpaqueId(binding.evidenceRef, "evidence", "REASON_EVIDENCE_REF_INVALID");
    if (evidence.has(binding.evidenceRef)) fail("REASON_EVIDENCE_REF_DUPLICATE");
    evidence.add(binding.evidenceRef);
    assertDigest(binding.evidenceDigest, "REASON_EVIDENCE_DIGEST_INVALID");
    if (binding.assetSnapshotRef !== input.assetSnapshotRef ||
        binding.assetSnapshotDigest !== input.assetSnapshotDigest) {
      fail("REASON_EVIDENCE_SNAPSHOT_MISMATCH");
    }
    if (binding.manifestDigest !== input.manifestDigest || binding.claimDigest !== input.claimDigest) {
      fail("REASON_EVIDENCE_MANIFEST_MISMATCH");
    }
    if (binding.verifierVersionRef !== input.verifierVersionRef) fail("REASON_EVIDENCE_VERIFIER_MISMATCH");
    if (binding.trustListVersionRef !== input.trustListVersionRef) fail("REASON_EVIDENCE_TRUST_LIST_MISMATCH");
    if (binding.policyVersionRef !== input.policyVersionRef) fail("REASON_EVIDENCE_POLICY_MISMATCH");
  }
  if (input.reasonCodes.some((reason) => !reasons.has(reason)) || reasons.size !== input.reasonCodes.length) {
    fail("REASON_EVIDENCE_ORPHAN");
  }
  if (input.evidenceRefs.some((ref) => !evidence.has(ref)) || evidence.size !== input.evidenceRefs.length) {
    fail("EVIDENCE_INVENTORY_ORPHAN");
  }
  const bindingOrder = input.reasonEvidenceBindings.map((binding) => binding.reasonCode);
  if (bindingOrder.join("\u0000") !== [...bindingOrder].sort().join("\u0000")) {
    fail("REASON_EVIDENCE_BINDINGS_NOT_CANONICAL");
  }
}

function validateManifestConsistency(input: CreateIntegrityScreeningReceiptV1): void {
  if (input.manifestPresence === "PRESENT") {
    if (input.manifestDigestAlgorithm !== "SHA-256" || input.claimDigestAlgorithm !== "SHA-256") {
      fail("MANIFEST_DIGEST_ALGORITHM_REQUIRED");
    }
    assertDigest(input.manifestDigest, "MANIFEST_DIGEST_INVALID");
    assertDigest(input.claimDigest, "CLAIM_DIGEST_INVALID");
  } else if (
    input.manifestDigestAlgorithm !== null || input.manifestDigest !== null ||
    input.claimDigestAlgorithm !== null || input.claimDigest !== null ||
    input.manifestTimestamp !== null
  ) {
    fail("MANIFEST_ABSENT_FIELDS_MUST_BE_NULL");
  }

  const reasons = new Set(input.reasonCodes);
  const exactReasons = (allowed: readonly IntegrityReasonCode[], code: string): void => {
    if (reasons.size !== allowed.length || allowed.some((reason) => !reasons.has(reason))) fail(code);
  };
  if (input.status === "VERIFIED_BINDING") {
    if (input.manifestPresence !== "PRESENT" || !reasons.has("MANIFEST_BINDING_VERIFIED")) {
      fail("VERIFIED_BINDING_SEMANTICS_INVALID");
    }
    exactReasons(["MANIFEST_BINDING_VERIFIED"], "VERIFIED_BINDING_REASON_CONFLICT");
  }
  if (input.status === "NOT_PRESENT") {
    if (input.manifestPresence !== "NOT_PRESENT" || !reasons.has("MANIFEST_NOT_PRESENT")) {
      fail("NOT_PRESENT_SEMANTICS_INVALID");
    }
    exactReasons(["MANIFEST_NOT_PRESENT"], "NOT_PRESENT_REASON_CONFLICT");
  }
  if (reasons.has("MANIFEST_NOT_PRESENT") && input.status !== "NOT_PRESENT") {
    fail("NOT_PRESENT_REASON_STATUS_MISMATCH");
  }
  if (
    (reasons.has("ASSET_DIGEST_MISMATCH") || reasons.has("CLAIM_DIGEST_MISMATCH") ||
      reasons.has("DIGEST_MISMATCH_WITH_TRANSCODE_CONTEXT") ||
      reasons.has("DIGEST_MISMATCH_UNKNOWN")) &&
    input.status !== "FAILED_BINDING"
  ) {
    fail("DIGEST_MISMATCH_STATUS_INVALID");
  }
  if (input.status === "FAILED_BINDING") {
    const failureReasons: readonly IntegrityReasonCode[] = [
      "MANIFEST_SIGNATURE_INVALID", "ASSET_DIGEST_MISMATCH",
      "CLAIM_DIGEST_MISMATCH", "DIGEST_MISMATCH_WITH_TRANSCODE_CONTEXT",
      "DIGEST_MISMATCH_UNKNOWN",
    ];
    if (input.manifestPresence !== "PRESENT" || !failureReasons.some((reason) => reasons.has(reason))) {
      fail("FAILED_BINDING_SEMANTICS_INVALID");
    }
    const allowedFailureReasons = new Set<IntegrityReasonCode>([
      ...failureReasons,
      "ACCESSIBILITY_TRANSCODE_OBSERVED",
    ]);
    if ([...reasons].some((reason) => !allowedFailureReasons.has(reason))) {
      fail("FAILED_BINDING_REASON_CONFLICT");
    }
    if (reasons.has("MANIFEST_BINDING_VERIFIED") || reasons.has("MANIFEST_NOT_PRESENT")) {
      fail("FAILED_BINDING_REASON_CONFLICT");
    }
    if (reasons.has("ACCESSIBILITY_TRANSCODE_OBSERVED") &&
        !reasons.has("DIGEST_MISMATCH_WITH_TRANSCODE_CONTEXT")) {
      fail("ACCESSIBILITY_TRANSCODE_REASON_UNBOUND");
    }
    if (reasons.has("DIGEST_MISMATCH_WITH_TRANSCODE_CONTEXT") &&
        !reasons.has("ACCESSIBILITY_TRANSCODE_OBSERVED")) {
      fail("TRANSCODE_CONTEXT_EVIDENCE_MISSING");
    }
  }
  if (input.status === "UNSUPPORTED") {
    if (input.manifestPresence !== "PRESENT") fail("UNSUPPORTED_MANIFEST_PRESENCE_INVALID");
    exactReasons(["UNSUPPORTED_MANIFEST_FORMAT"], "UNSUPPORTED_REASON_INVALID");
  }
  if (input.status === "VERIFICATION_ERROR") {
    if (input.manifestPresence !== "UNKNOWN") fail("VERIFICATION_ERROR_PRESENCE_INVALID");
    exactReasons(["VERIFIER_ERROR"], "VERIFICATION_ERROR_REASON_INVALID");
  }
  if (input.status === "INCONCLUSIVE") {
    if (input.manifestPresence === "NOT_PRESENT") fail("INCONCLUSIVE_MANIFEST_PRESENCE_INVALID");
    exactReasons(["TRUST_LIST_STALE"], "INCONCLUSIVE_REASON_INVALID");
  }
}

function validateInput(
  input: unknown,
  clock: IntegrityClock,
  expectedMaxTrustListAgeHours: number,
): asserts input is CreateIntegrityScreeningReceiptV1 {
  assertObject(input, "SCREENING_INVALID");
  assertOnlyKeys(input, ROOT_KEYS, "SCREENING_UNKNOWN_FIELD");
  if (input.schemaVersion !== INTEGRITY_PROVENANCE_SCHEMA_VERSION) fail("SCHEMA_VERSION_INVALID");
  assertId(input.screeningId, "screening", "SCREENING_ID_INVALID");
  if (input.synthetic !== true) fail("SYNTHETIC_REQUIRED");
  assertOpaqueId(input.tenantRef, "tenant", "TENANT_REF_INVALID");
  assertOpaqueId(input.scopeRef, "scope", "SCOPE_REF_INVALID");
  assertId(input.assetRef, "asset", "ASSET_REF_INVALID");
  assertId(input.assetSnapshotRef, "snapshot", "SNAPSHOT_REF_INVALID");
  if (input.assetDigestAlgorithm !== "SHA-256" || input.scopeBindingAlgorithm !== "SHA-256") {
    fail("DIGEST_ALGORITHM_INVALID");
  }
  assertDigest(input.assetDigest, "ASSET_DIGEST_INVALID");
  assertDigest(input.assetSnapshotDigest, "SNAPSHOT_DIGEST_INVALID");
  assertDigest(input.scopeBindingDigest, "SCOPE_BINDING_DIGEST_INVALID");
  assertOpaqueId(input.scopeBindingAttestationRef, "attestation", "SCOPE_BINDING_ATTESTATION_REF_INVALID");
  assertDigest(input.scopeBindingAttestationDigest, "SCOPE_BINDING_ATTESTATION_DIGEST_INVALID");
  assertRef(input.scopeBindingKeyVersionRef, "SCOPE_BINDING_KEY_VERSION_REF_INVALID");
  if (input.assetSnapshotDigest !== input.assetDigest) fail("ASSET_SNAPSHOT_DIGEST_MISMATCH");
  const bindingMaterial: IntegrityScopeBindingMaterialV1 = {
    screeningId: input.screeningId as `screening_${string}`,
    tenantRef: input.tenantRef,
    scopeRef: input.scopeRef,
    assetRef: input.assetRef as `asset_${string}`,
    assetSnapshotRef: input.assetSnapshotRef as `snapshot_${string}`,
    assetSnapshotCapturedAt: input.assetSnapshotCapturedAt as string,
    assetDigest: input.assetDigest,
    manifestDigest: input.manifestDigest as `sha256:${string}` | null,
    claimDigest: input.claimDigest as `sha256:${string}` | null,
    verifierVersionRef: input.verifierVersionRef as string,
    trustListVersionRef: input.trustListVersionRef as string,
    policyVersionRef: input.policyVersionRef as string,
  };
  if (input.scopeBindingDigest !== computeIntegrityScopeBindingDigest(bindingMaterial)) {
    fail("SCOPE_BINDING_DIGEST_MISMATCH");
  }
  if (input.scopeBindingAttestationDigest !== input.scopeBindingDigest) {
    fail("SCOPE_BINDING_ATTESTATION_MISMATCH");
  }
  if (input.assetMutationObserved !== false) fail("ASSET_MUTATION_NOT_ALLOWED");

  if (!STATUSES.has(input.status as IntegrityScreeningStatus)) fail("STATUS_INVALID");
  if (input.manifestPresence !== "PRESENT" && input.manifestPresence !== "NOT_PRESENT" && input.manifestPresence !== "UNKNOWN") {
    fail("MANIFEST_PRESENCE_INVALID");
  }
  if (!Array.isArray(input.reasonCodes) || input.reasonCodes.length === 0) fail("REASON_CODES_REQUIRED");
  const reasonSet = new Set<string>();
  for (const reason of input.reasonCodes) {
    if (!REASONS.has(reason as IntegrityReasonCode)) fail("REASON_CODE_INVALID");
    if (reasonSet.has(reason as string)) fail("REASON_CODE_DUPLICATE");
    reasonSet.add(reason as string);
  }
  if ([...reasonSet].join("\u0000") !== [...reasonSet].sort().join("\u0000")) fail("REASON_CODES_NOT_CANONICAL");

  assertRef(input.verifierVersionRef, "VERIFIER_VERSION_REF_INVALID");
  assertRef(input.trustListVersionRef, "TRUST_LIST_VERSION_REF_INVALID");
  assertRef(input.policyVersionRef, "POLICY_VERSION_REF_INVALID");
  assertRef(input.timestampAuthorityRef, "TIMESTAMP_AUTHORITY_REF_INVALID");
  assertOpaqueRefList(input.evidenceRefs, "evidence", "EVIDENCE_REFS_INVALID");
  validateCoverage(input.coverageRefs);
  assertOpaqueRefList(input.auditLineageRefs, "audit", "AUDIT_LINEAGE_REFS_INVALID");
  assertOpaqueId(input.appealPathRef, "route", "APPEAL_PATH_REF_INVALID");
  assertOpaqueId(input.humanReviewPathRef, "route", "HUMAN_REVIEW_PATH_REF_INVALID");
  assertOpaqueId(input.correctionPathRef, "route", "CORRECTION_PATH_REF_INVALID");
  assertRef(input.retentionPolicyRef, "RETENTION_POLICY_REF_INVALID");

  const now = clock.now().getTime();
  const snapshotAt = parseTime(input.assetSnapshotCapturedAt, "SNAPSHOT_TIME_INVALID");
  const verifiedAt = parseTime(input.verifiedAt, "VERIFIED_TIME_INVALID");
  const trustPublishedAt = parseTime(input.trustListPublishedAt, "TRUST_LIST_TIME_INVALID");
  const retentionExpiresAt = parseTime(input.retentionExpiresAt, "RETENTION_EXPIRY_INVALID");
  const manifestAt = input.manifestTimestamp === null
    ? null
    : parseTime(input.manifestTimestamp, "MANIFEST_TIME_INVALID");
  if (verifiedAt > now || snapshotAt > verifiedAt || trustPublishedAt > verifiedAt) fail("TIME_ORDER_INVALID");
  if (manifestAt !== null && manifestAt > verifiedAt) fail("MANIFEST_TIME_AFTER_VERIFICATION");
  if (now - verifiedAt > MAX_VERIFY_TO_RECORD_HOURS * 60 * 60 * 1000) fail("VERIFICATION_TOO_OLD_TO_RECORD");
  if (verifiedAt - snapshotAt > MAX_SNAPSHOT_TO_VERIFY_MINUTES * 60 * 1000) fail("SNAPSHOT_STALE_FOR_VERIFICATION");
  if (retentionExpiresAt <= now || retentionExpiresAt - verifiedAt > MAX_RETENTION_HOURS * 60 * 60 * 1000) {
    fail("RETENTION_WINDOW_INVALID");
  }
  if (
    typeof input.maxTrustListAgeHours !== "number" ||
    !Number.isInteger(input.maxTrustListAgeHours) ||
    input.maxTrustListAgeHours < 1 ||
    input.maxTrustListAgeHours > MAX_TRUST_LIST_AGE_HOURS
  ) {
    fail("TRUST_LIST_MAX_AGE_INVALID");
  }
  if (input.maxTrustListAgeHours !== expectedMaxTrustListAgeHours) fail("TRUST_LIST_THRESHOLD_POLICY_MISMATCH");
  const trustStale = verifiedAt - trustPublishedAt > input.maxTrustListAgeHours * 60 * 60 * 1000;
  if (trustStale && (input.status !== "INCONCLUSIVE" || !reasonSet.has("TRUST_LIST_STALE"))) {
    fail("STALE_TRUST_MUST_BE_INCONCLUSIVE");
  }
  if (!trustStale && reasonSet.has("TRUST_LIST_STALE")) fail("TRUST_LIST_STALE_REASON_INVALID");

  const literalGuards: readonly [unknown, unknown, string][] = [
    [input.screeningOnly, true, "SCREENING_ONLY_REQUIRED"],
    [input.containsRawMedia, false, "RAW_MEDIA_NOT_ALLOWED"],
    [input.containsBiometricData, false, "BIOMETRIC_DATA_NOT_ALLOWED"],
    [input.containsRawPii, false, "RAW_PII_NOT_ALLOWED"],
    [input.deepfakeConclusion, "NONE", "DEEPFAKE_CONCLUSION_NOT_ALLOWED"],
    [input.authenticityConclusion, "NONE", "AUTHENTICITY_CONCLUSION_NOT_ALLOWED"],
    [input.identityConclusion, "NONE", "IDENTITY_CONCLUSION_NOT_ALLOWED"],
    [input.deceptionConclusion, "NONE", "DECEPTION_CONCLUSION_NOT_ALLOWED"],
    [input.emotionConclusion, "NONE", "EMOTION_CONCLUSION_NOT_ALLOWED"],
    [input.personRiskScoreAllowed, false, "PERSON_RISK_SCORE_NOT_ALLOWED"],
    [input.actionAllowed, false, "ACTION_NOT_ALLOWED"],
    [input.adverseActionAllowed, false, "ADVERSE_ACTION_NOT_ALLOWED"],
    [input.automaticRejectionAllowed, false, "AUTOMATIC_REJECTION_NOT_ALLOWED"],
    [input.mutationAllowed, false, "MUTATION_NOT_ALLOWED"],
    [input.verdict, "NONE", "VERDICT_NOT_ALLOWED"],
    [input.humanReviewRequired, true, "HUMAN_REVIEW_REQUIRED"],
    [input.humanOversightStandardRef, "human-oversight:canonical:v1", "HUMAN_OVERSIGHT_STANDARD_INVALID"],
    [input.legalGate, "NOT_MET", "LEGAL_GATE_NOT_MET_REQUIRED"],
    [input.ownerGate, "NOT_MET", "OWNER_GATE_NOT_MET_REQUIRED"],
    [input.productionEligible, false, "PRODUCTION_NOT_ALLOWED"],
    [input.immutable, true, "IMMUTABLE_REQUIRED"],
  ];
  for (const [actual, expected, code] of literalGuards) if (actual !== expected) fail(code);
  if (input.deletionMechanism !== "HARD_DELETE" && input.deletionMechanism !== "CRYPTO_SHRED") fail("DELETION_MECHANISM_INVALID");

  const correctionFields = [input.supersedesScreeningId, input.supersedesRecordDigest, input.correctionReason];
  const isCorrection = correctionFields.some((value) => value !== null);
  if (isCorrection && correctionFields.some((value) => value === null)) fail("CORRECTION_LINEAGE_INCOMPLETE");
  if (!isCorrection) {
    if (input.supersedesScreeningId !== null || input.supersedesRecordDigest !== null || input.correctionReason !== null) {
      fail("CORRECTION_LINEAGE_INVALID");
    }
  } else {
    assertId(input.supersedesScreeningId, "screening", "SUPERSEDES_ID_INVALID");
    assertDigest(input.supersedesRecordDigest, "SUPERSEDES_DIGEST_INVALID");
    if (!CORRECTION_REASONS.has(input.correctionReason as CorrectionReason)) fail("CORRECTION_REASON_INVALID");
    if (input.supersedesScreeningId === input.screeningId) fail("CORRECTION_SELF_REFERENCE");
  }

  const typedInput = input as unknown as CreateIntegrityScreeningReceiptV1;
  validateManifestConsistency(typedInput);
  validateReasonEvidenceBindings(typedInput);
}

function sameField(
  original: CreateIntegrityScreeningReceiptV1,
  successor: CreateIntegrityScreeningReceiptV1,
  field: keyof CreateIntegrityScreeningReceiptV1,
): boolean {
  return JSON.stringify(original[field]) === JSON.stringify(successor[field]);
}

function assertCorrectionSemantics(
  original: IntegrityScreeningReceiptV1,
  successor: CreateIntegrityScreeningReceiptV1,
): void {
  if (Date.parse(successor.verifiedAt) <= Date.parse(original.verifiedAt)) fail("CORRECTION_TIME_NOT_MONOTONIC");
  if (successor.auditLineageRefs.some((ref) => original.auditLineageRefs.includes(ref))) {
    fail("CORRECTION_AUDIT_LINEAGE_REUSED");
  }
  if (successor.evidenceRefs.some((ref) => original.evidenceRefs.includes(ref))) {
    fail("CORRECTION_EVIDENCE_REUSED");
  }

  const stable = (...fields: readonly (keyof CreateIntegrityScreeningReceiptV1)[]): void => {
    for (const field of fields) if (!sameField(original, successor, field)) fail(`CORRECTION_FIELD_NOT_ALLOWED:${field}`);
  };
  const globallyAllowedChanges = new Set<keyof CreateIntegrityScreeningReceiptV1>([
    "screeningId", "scopeBindingDigest", "scopeBindingAttestationRef",
    "scopeBindingAttestationDigest", "verifiedAt", "evidenceRefs",
    "reasonEvidenceBindings", "status", "reasonCodes", "auditLineageRefs",
    "supersedesScreeningId", "supersedesRecordDigest", "correctionReason",
  ]);
  const reasonAllowedChanges = new Map<CorrectionReason, ReadonlySet<keyof CreateIntegrityScreeningReceiptV1>>([
    ["VERIFIER_RESULT_CORRECTED", new Set(["verifierVersionRef"])],
    ["TRUST_LIST_UPDATED", new Set(["trustListVersionRef", "trustListPublishedAt", "maxTrustListAgeHours"])],
    ["POLICY_VERSION_UPDATED", new Set(["policyVersionRef"])],
    ["ASSET_SNAPSHOT_CORRECTED", new Set(["assetSnapshotRef", "assetSnapshotCapturedAt"])],
    ["EVIDENCE_LINEAGE_CORRECTED", new Set([])],
  ]);
  const specificAllowed = successor.correctionReason === null
    ? new Set<keyof CreateIntegrityScreeningReceiptV1>()
    : reasonAllowedChanges.get(successor.correctionReason);
  if (!specificAllowed) fail("CORRECTION_REASON_INVALID");
  for (const field of ROOT_KEYS as ReadonlySet<keyof CreateIntegrityScreeningReceiptV1>) {
    if (!sameField(original, successor, field) &&
        !globallyAllowedChanges.has(field) &&
        !specificAllowed.has(field)) {
      fail(`CORRECTION_FIELD_NOT_ALLOWED:${field}`);
    }
  }
  const manifestFields = [
    "manifestPresence", "manifestDigestAlgorithm", "manifestDigest",
    "claimDigestAlgorithm", "claimDigest", "manifestTimestamp",
  ] as const;
  const trustFields = ["trustListVersionRef", "trustListPublishedAt", "maxTrustListAgeHours"] as const;
  const snapshotFields = [
    "assetRef", "assetDigestAlgorithm", "assetDigest", "assetSnapshotRef",
    "assetSnapshotDigest", "assetSnapshotCapturedAt",
  ] as const;
  const governanceFields = [
    "synthetic", "screeningOnly", "containsRawMedia", "containsBiometricData",
    "containsRawPii", "deepfakeConclusion", "authenticityConclusion",
    "identityConclusion", "deceptionConclusion", "emotionConclusion",
    "personRiskScoreAllowed", "actionAllowed", "adverseActionAllowed",
    "automaticRejectionAllowed", "mutationAllowed", "verdict",
    "humanReviewRequired", "humanReviewPathRef", "appealPathRef",
    "correctionPathRef", "humanOversightStandardRef", "retentionPolicyRef",
    "deletionMechanism", "legalGate", "ownerGate", "productionEligible",
    "immutable", "timestampAuthorityRef",
  ] as const;
  stable(...governanceFields);

  switch (successor.correctionReason) {
    case "VERIFIER_RESULT_CORRECTED":
      if (successor.verifierVersionRef === original.verifierVersionRef) fail("CORRECTION_REQUIRED_DIFF_MISSING:verifierVersionRef");
      stable(...trustFields, "policyVersionRef", ...manifestFields, ...snapshotFields, "coverageRefs");
      break;
    case "TRUST_LIST_UPDATED":
      if (trustFields.every((field) => sameField(original, successor, field))) fail("CORRECTION_REQUIRED_DIFF_MISSING:trustList");
      stable("verifierVersionRef", "policyVersionRef", ...manifestFields, ...snapshotFields, "coverageRefs");
      break;
    case "POLICY_VERSION_UPDATED":
      if (successor.policyVersionRef === original.policyVersionRef) fail("CORRECTION_REQUIRED_DIFF_MISSING:policyVersionRef");
      stable("verifierVersionRef", ...trustFields, ...manifestFields, ...snapshotFields, "coverageRefs");
      break;
    case "ASSET_SNAPSHOT_CORRECTED":
      if (successor.assetSnapshotRef === original.assetSnapshotRef &&
          successor.assetSnapshotCapturedAt === original.assetSnapshotCapturedAt) {
        fail("CORRECTION_REQUIRED_DIFF_MISSING:assetSnapshotMetadata");
      }
      stable("verifierVersionRef", ...trustFields, "policyVersionRef", ...manifestFields,
        "assetRef", "assetDigestAlgorithm", "assetDigest", "assetSnapshotDigest", "coverageRefs");
      break;
    case "EVIDENCE_LINEAGE_CORRECTED":
      if (sameField(original, successor, "evidenceRefs") &&
          sameField(original, successor, "reasonEvidenceBindings")) {
        fail("CORRECTION_REQUIRED_DIFF_MISSING:evidenceLineage");
      }
      stable("verifierVersionRef", ...trustFields, "policyVersionRef", ...manifestFields, ...snapshotFields);
      break;
    default:
      fail("CORRECTION_REASON_INVALID");
  }
}

/** In-memory reference validator/registry; production storage is out of scope. */
export class IntegrityProvenanceScreeningRegistry {
  readonly #clock: IntegrityClock;
  readonly #records = new Map<string, IntegrityScreeningReceiptV1>();
  readonly #successors = new Map<string, string>();
  readonly #globalScreeningIds = new Map<string, string>();
  readonly #evidenceOwners = new Map<string, string>();
  readonly #evidenceDigestOwners = new Map<string, string>();
  readonly #auditOwners = new Map<string, string>();
  readonly #attestationOwners = new Map<string, string>();

  constructor(clock: IntegrityClock = SYSTEM_CLOCK) {
    this.#clock = clock;
  }

  record(input: CreateIntegrityScreeningReceiptV1): IntegrityScreeningReceiptV1 {
    validateInput(input, this.#clock, PINNED_TRUST_LIST_AGE_HOURS);
    const key = this.#key(input.tenantRef, input.scopeRef, input.screeningId);
    const receipt: IntegrityScreeningReceiptV1 = {
      ...clone(input),
      recordDigest: digest(input),
    };
    const existing = this.#records.get(key);
    if (existing) {
      if (existing.recordDigest !== receipt.recordDigest) fail("SCREENING_IDEMPOTENCY_CONFLICT");
      return clone(existing);
    }

    const screeningOwner = this.#globalScreeningIds.get(input.screeningId);
    if (screeningOwner && screeningOwner !== key) fail("SCREENING_ID_CROSS_SCOPE_REPLAY");
    const attestationOwner = this.#attestationOwners.get(input.scopeBindingAttestationRef);
    if (attestationOwner && attestationOwner !== key) fail("SCOPE_ATTESTATION_REPLAY");
    for (const evidenceRef of input.evidenceRefs) {
      const evidenceOwner = this.#evidenceOwners.get(evidenceRef);
      if (evidenceOwner && evidenceOwner !== key) fail("EVIDENCE_REF_REPLAY");
    }
    for (const binding of input.reasonEvidenceBindings) {
      const digestOwner = this.#evidenceDigestOwners.get(binding.evidenceDigest);
      if (digestOwner && digestOwner !== key) fail("EVIDENCE_DIGEST_REPLAY");
    }
    for (const auditRef of input.auditLineageRefs) {
      const auditOwner = this.#auditOwners.get(auditRef);
      if (auditOwner && auditOwner !== key) fail("AUDIT_LINEAGE_REPLAY");
    }

    if (input.supersedesScreeningId !== null && input.supersedesRecordDigest !== null) {
      const originalKey = this.#key(input.tenantRef, input.scopeRef, input.supersedesScreeningId);
      const original = this.#records.get(originalKey);
      if (!original) fail("SUPERSEDED_RECORD_NOT_FOUND");
      if (original.recordDigest !== input.supersedesRecordDigest) fail("SUPERSEDED_DIGEST_MISMATCH");
      if (original.assetRef !== input.assetRef || original.assetDigest !== input.assetDigest) fail("CORRECTION_ASSET_LINEAGE_MISMATCH");
      assertCorrectionSemantics(original, input);
      if (this.#successors.has(originalKey)) fail("CORRECTION_FORK_NOT_ALLOWED");
      this.#successors.set(originalKey, key);
    }

    this.#records.set(key, clone(receipt));
    this.#globalScreeningIds.set(input.screeningId, key);
    this.#attestationOwners.set(input.scopeBindingAttestationRef, key);
    for (const evidenceRef of input.evidenceRefs) this.#evidenceOwners.set(evidenceRef, key);
    for (const binding of input.reasonEvidenceBindings) {
      this.#evidenceDigestOwners.set(binding.evidenceDigest, key);
    }
    for (const auditRef of input.auditLineageRefs) this.#auditOwners.set(auditRef, key);
    return clone(receipt);
  }

  get(tenantRef: string, scopeRef: string, screeningId: `screening_${string}`): IntegrityScreeningReceiptV1 | null {
    const value = this.#records.get(this.#key(tenantRef, scopeRef, screeningId));
    return value ? clone(value) : null;
  }

  #key(tenantRef: string, scopeRef: string, screeningId: string): string {
    return `${tenantRef}\u0000${scopeRef}\u0000${screeningId}`;
  }
}
