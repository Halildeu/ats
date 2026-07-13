import { describe, expect, it } from "vitest";
import {
  INTEGRITY_PROVENANCE_SCHEMA_VERSION,
  IntegrityProvenanceScreeningRegistry,
  computeIntegrityScopeBindingDigest,
  type CreateIntegrityScreeningReceiptV1,
  type IntegrityClock,
} from "../integrity/integrity-provenance-screening.js";

const assetDigest = `sha256:${"a".repeat(64)}` as const;
const manifestDigest = `sha256:${"b".repeat(64)}` as const;
const claimDigest = `sha256:${"c".repeat(64)}` as const;
const tenantRef = "tenant_aaaaaaaaaaaaaaaa";
const scopeRef = "scope_bbbbbbbbbbbbbbbb";

const clock: IntegrityClock = {
  now: () => new Date("2026-07-13T12:00:00.000Z"),
};

function fixture(
  overrides: Partial<CreateIntegrityScreeningReceiptV1> = {},
): CreateIntegrityScreeningReceiptV1 {
  const base: CreateIntegrityScreeningReceiptV1 = {
    schemaVersion: INTEGRITY_PROVENANCE_SCHEMA_VERSION,
    screeningId: "screening_1111111111111111",
    synthetic: true,
    tenantRef,
    scopeRef,
    assetRef: "asset_1111111111111111",
    assetSnapshotRef: "snapshot_1111111111111111",
    assetDigestAlgorithm: "SHA-256",
    assetDigest,
    assetSnapshotDigest: assetDigest,
    scopeBindingAlgorithm: "SHA-256",
    scopeBindingDigest: `sha256:${"0".repeat(64)}`,
    scopeBindingAttestationRef: "attestation_1111111111111111",
    scopeBindingAttestationDigest: `sha256:${"0".repeat(64)}`,
    scopeBindingKeyVersionRef: "key:scope-binding:synthetic-v1",
    assetSnapshotCapturedAt: "2026-07-13T11:45:00.000Z",
    assetMutationObserved: false,
    manifestPresence: "PRESENT",
    manifestDigestAlgorithm: "SHA-256",
    manifestDigest,
    claimDigestAlgorithm: "SHA-256",
    claimDigest,
    manifestTimestamp: "2026-07-13T11:40:00.000Z",
    verifierVersionRef: "verifier:c2pa:synthetic-v1",
    trustListVersionRef: "trust-list:c2pa:2026-07-12",
    trustListPublishedAt: "2026-07-12T12:00:00.000Z",
    maxTrustListAgeHours: 48,
    policyVersionRef: "policy:integrity:synthetic-v1",
    timestampAuthorityRef: "timestamp:server:synthetic-v1",
    verifiedAt: "2026-07-13T11:50:00.000Z",
    evidenceRefs: ["evidence_1111111111111100"],
    reasonEvidenceBindings: [],
    coverageRefs: {
      falsePositive: {
        measurementState: "SYNTHETIC_ONLY",
        evidenceRef: "coverage_1111111111111111",
        evidenceDigest: `sha256:${"1".repeat(64)}`,
        measurementPolicyVersionRef: "coverage-policy:false-positive:synthetic-v1",
      },
      falseNegative: {
        measurementState: "SYNTHETIC_ONLY",
        evidenceRef: "coverage_2222222222222222",
        evidenceDigest: `sha256:${"2".repeat(64)}`,
        measurementPolicyVersionRef: "coverage-policy:false-negative:synthetic-v1",
      },
      uncertainty: {
        measurementState: "SYNTHETIC_ONLY",
        evidenceRef: "coverage_3333333333333333",
        evidenceDigest: `sha256:${"3".repeat(64)}`,
        measurementPolicyVersionRef: "coverage-policy:uncertainty:synthetic-v1",
      },
      deviceCodec: {
        measurementState: "SYNTHETIC_ONLY",
        evidenceRef: "coverage_4444444444444444",
        evidenceDigest: `sha256:${"4".repeat(64)}`,
        measurementPolicyVersionRef: "coverage-policy:device-codec:synthetic-v1",
      },
      accessibility: {
        measurementState: "SYNTHETIC_ONLY",
        evidenceRef: "coverage_5555555555555555",
        evidenceDigest: `sha256:${"5".repeat(64)}`,
        measurementPolicyVersionRef: "coverage-policy:accessibility:synthetic-v1",
      },
    },
    status: "VERIFIED_BINDING",
    reasonCodes: ["MANIFEST_BINDING_VERIFIED"],
    screeningOnly: true,
    containsRawMedia: false,
    containsBiometricData: false,
    containsRawPii: false,
    deepfakeConclusion: "NONE",
    authenticityConclusion: "NONE",
    identityConclusion: "NONE",
    deceptionConclusion: "NONE",
    emotionConclusion: "NONE",
    personRiskScoreAllowed: false,
    actionAllowed: false,
    adverseActionAllowed: false,
    automaticRejectionAllowed: false,
    mutationAllowed: false,
    verdict: "NONE",
    humanReviewRequired: true,
    humanReviewPathRef: "route_1111111111111111",
    appealPathRef: "route_2222222222222222",
    correctionPathRef: "route_3333333333333333",
    humanOversightStandardRef: "human-oversight:canonical:v1",
    auditLineageRefs: ["audit_1111111111111111"],
    retentionPolicyRef: "retention:integrity:synthetic-v1",
    retentionExpiresAt: "2026-07-20T11:50:00.000Z",
    deletionMechanism: "CRYPTO_SHRED",
    legalGate: "NOT_MET",
    ownerGate: "NOT_MET",
    productionEligible: false,
    immutable: true,
    supersedesScreeningId: null,
    supersedesRecordDigest: null,
    correctionReason: null,
  };
  const merged = { ...base, ...overrides };
  const reasonCodes = merged.reasonCodes;
  const screeningSuffix = merged.screeningId.slice("screening_".length);
  const evidenceRefs = overrides.evidenceRefs ?? reasonCodes.map(
    (_reason, index) => `evidence_${screeningSuffix.slice(0, 62)}${index.toString(16).padStart(2, "0")}`,
  );
  const bindingMaterial = {
    screeningId: merged.screeningId,
    tenantRef: merged.tenantRef,
    scopeRef: merged.scopeRef,
    assetRef: merged.assetRef,
    assetSnapshotRef: merged.assetSnapshotRef,
    assetSnapshotCapturedAt: merged.assetSnapshotCapturedAt,
    assetDigest: merged.assetDigest,
    manifestDigest: merged.manifestDigest,
    claimDigest: merged.claimDigest,
    verifierVersionRef: merged.verifierVersionRef,
    trustListVersionRef: merged.trustListVersionRef,
    policyVersionRef: merged.policyVersionRef,
  };
  const computedBinding = computeIntegrityScopeBindingDigest(bindingMaterial);
  const evidenceDigestSeed = screeningSuffix.repeat(4).slice(0, 63);
  const reasonEvidenceBindings = overrides.reasonEvidenceBindings ?? reasonCodes.map(
    (reasonCode, index) => ({
      reasonCode,
      evidenceRef: evidenceRefs[index] ?? `evidence_${String(index + 1).repeat(16)}`,
      evidenceDigest: `sha256:${evidenceDigestSeed}${index.toString(16)}` as `sha256:${string}`,
      assetSnapshotRef: merged.assetSnapshotRef,
      assetSnapshotDigest: merged.assetSnapshotDigest,
      manifestDigest: merged.manifestDigest,
      claimDigest: merged.claimDigest,
      verifierVersionRef: merged.verifierVersionRef,
      trustListVersionRef: merged.trustListVersionRef,
      policyVersionRef: merged.policyVersionRef,
    }),
  );
  return {
    ...merged,
    evidenceRefs,
    reasonEvidenceBindings,
    scopeBindingDigest: overrides.scopeBindingDigest ?? computedBinding,
    scopeBindingAttestationDigest:
      overrides.scopeBindingAttestationDigest ?? overrides.scopeBindingDigest ?? computedBinding,
    scopeBindingAttestationRef:
      overrides.scopeBindingAttestationRef ?? `attestation_${screeningSuffix}`,
    auditLineageRefs:
      overrides.auditLineageRefs ?? [`audit_${screeningSuffix}`],
  };
}

function registry(): IntegrityProvenanceScreeningRegistry {
  return new IntegrityProvenanceScreeningRegistry(clock);
}

describe("integrity-provenance-screening/v1", () => {
  it("records immutable VERIFIED_BINDING screening evidence without a truth verdict", () => {
    const receipt = registry().record(fixture());
    expect(receipt.status).toBe("VERIFIED_BINDING");
    expect(receipt.authenticityConclusion).toBe("NONE");
    expect(receipt.identityConclusion).toBe("NONE");
    expect(receipt.deepfakeConclusion).toBe("NONE");
    expect(receipt.recordDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("accepts NOT_PRESENT only as manifest absence, never a deepfake conclusion", () => {
    const receipt = registry().record(
      fixture({
        manifestPresence: "NOT_PRESENT",
        manifestDigestAlgorithm: null,
        manifestDigest: null,
        claimDigestAlgorithm: null,
        claimDigest: null,
        manifestTimestamp: null,
        status: "NOT_PRESENT",
        reasonCodes: ["MANIFEST_NOT_PRESENT"],
      }),
    );
    expect(receipt.status).toBe("NOT_PRESENT");
    expect(receipt.deepfakeConclusion).toBe("NONE");
    expect(receipt.actionAllowed).toBe(false);
  });

  it("rejects cross-scope replay when the claimed binding cannot be re-derived", () => {
    const original = fixture();
    expect(() => registry().record(fixture({
      scopeRef: "scope_cccccccccccccccc",
      scopeBindingDigest: original.scopeBindingDigest,
      scopeBindingAttestationDigest: original.scopeBindingAttestationDigest,
    }))).toThrow(
      "SCOPE_BINDING_DIGEST_MISMATCH",
    );
  });

  it("rejects cross-scope replay even when a public checksum is recomputed", () => {
    const subject = registry();
    subject.record(fixture());
    expect(() => subject.record(fixture({
      tenantRef: "tenant_dddddddddddddddd",
      scopeRef: "scope_eeeeeeeeeeeeeeee",
    }))).toThrow("SCREENING_ID_CROSS_SCOPE_REPLAY");
  });

  it("rejects attestation-ref and evidence-ref replay under new screening identities", () => {
    const subject = registry();
    const original = subject.record(fixture());
    expect(() => subject.record(fixture({
      screeningId: "screening_2222222222222222",
      tenantRef: "tenant_dddddddddddddddd",
      scopeRef: "scope_eeeeeeeeeeeeeeee",
      scopeBindingAttestationRef: original.scopeBindingAttestationRef,
    }))).toThrow("SCOPE_ATTESTATION_REPLAY");
    expect(() => subject.record(fixture({
      screeningId: "screening_3333333333333333",
      tenantRef: "tenant_dddddddddddddddd",
      scopeRef: "scope_eeeeeeeeeeeeeeee",
      evidenceRefs: original.evidenceRefs,
    }))).toThrow("EVIDENCE_REF_REPLAY");
    expect(() => subject.record(fixture({
      screeningId: "screening_4444444444444444",
      tenantRef: "tenant_dddddddddddddddd",
      scopeRef: "scope_eeeeeeeeeeeeeeee",
      auditLineageRefs: original.auditLineageRefs,
    }))).toThrow("AUDIT_LINEAGE_REPLAY");
  });

  it("rejects evidence artifact replay after the ref is renamed", () => {
    const subject = registry();
    const original = subject.record(fixture());
    const renamed = fixture({ screeningId: "screening_2222222222222222" });
    expect(() => subject.record(fixture({
      screeningId: renamed.screeningId,
      reasonEvidenceBindings: [{
        ...renamed.reasonEvidenceBindings[0]!,
        evidenceDigest: original.reasonEvidenceBindings[0]!.evidenceDigest,
      }],
    }))).toThrow("EVIDENCE_DIGEST_REPLAY");
  });

  it("pins all supported digest algorithms to SHA-256", () => {
    expect(() => registry().record(fixture({ assetDigestAlgorithm: "SHA-1" as "SHA-256" }))).toThrow(
      "DIGEST_ALGORITHM_INVALID",
    );
    expect(() => registry().record(fixture({ manifestDigestAlgorithm: "SHA-1" as "SHA-256" }))).toThrow(
      "MANIFEST_DIGEST_ALGORITHM_REQUIRED",
    );
  });

  it("rejects asset mutation and snapshot digest TOCTOU mismatches", () => {
    expect(() => registry().record(fixture({ assetMutationObserved: true as false }))).toThrow(
      "ASSET_MUTATION_NOT_ALLOWED",
    );
    expect(() =>
      registry().record(fixture({ assetSnapshotDigest: `sha256:${"d".repeat(64)}` })),
    ).toThrow("ASSET_SNAPSHOT_DIGEST_MISMATCH");
  });

  it("rejects stale asset snapshots before verification", () => {
    expect(() =>
      registry().record(fixture({ assetSnapshotCapturedAt: "2026-07-13T11:00:00.000Z" })),
    ).toThrow("SNAPSHOT_STALE_FOR_VERIFICATION");
  });

  it("rejects old or already-expired evidence at record time", () => {
    expect(() =>
      registry().record(
        fixture({
          assetSnapshotCapturedAt: "2026-07-13T09:45:00.000Z",
          verifiedAt: "2026-07-13T09:50:00.000Z",
          manifestTimestamp: "2026-07-13T09:40:00.000Z",
        }),
      ),
    ).toThrow("VERIFICATION_TOO_OLD_TO_RECORD");
    expect(() =>
      registry().record(fixture({ retentionExpiresAt: "2026-07-13T11:55:00.000Z" })),
    ).toThrow("RETENTION_WINDOW_INVALID");
  });

  it("forces a stale trust list to INCONCLUSIVE", () => {
    expect(() =>
      registry().record(
        fixture({
          trustListPublishedAt: "2026-07-01T11:50:00.000Z",
          maxTrustListAgeHours: 48,
        }),
      ),
    ).toThrow("STALE_TRUST_MUST_BE_INCONCLUSIVE");

    const receipt = registry().record(
      fixture({
        trustListPublishedAt: "2026-07-01T11:50:00.000Z",
        maxTrustListAgeHours: 48,
        status: "INCONCLUSIVE",
        reasonCodes: ["TRUST_LIST_STALE"],
      }),
    );
    expect(receipt.status).toBe("INCONCLUSIVE");
  });

  it("rejects stale-trust claims when the trust list is fresh", () => {
    expect(() =>
      registry().record(fixture({ status: "INCONCLUSIVE", reasonCodes: ["TRUST_LIST_STALE"] })),
    ).toThrow("TRUST_LIST_STALE_REASON_INVALID");
  });

  it("rejects caller attempts to relax the registry trust-list policy", () => {
    expect(() => registry().record(fixture({ maxTrustListAgeHours: 720 }))).toThrow(
      "TRUST_LIST_THRESHOLD_POLICY_MISMATCH",
    );
  });

  it("does not allow NOT_PRESENT to carry a digest-mismatch reason", () => {
    expect(() =>
      registry().record(
        fixture({
          manifestPresence: "NOT_PRESENT",
          manifestDigestAlgorithm: null,
          manifestDigest: null,
          claimDigestAlgorithm: null,
          claimDigest: null,
          manifestTimestamp: null,
          status: "NOT_PRESENT",
          reasonCodes: ["DIGEST_MISMATCH_UNKNOWN", "MANIFEST_NOT_PRESENT"],
        }),
      ),
    ).toThrow("NOT_PRESENT_REASON_CONFLICT");
  });

  it("rejects contradictory VERIFIED_BINDING reasons", () => {
    expect(() =>
      registry().record(
        fixture({ reasonCodes: ["MANIFEST_BINDING_VERIFIED", "MANIFEST_SIGNATURE_INVALID"] }),
      ),
    ).toThrow("VERIFIED_BINDING_REASON_CONFLICT");
  });

  it("constrains UNSUPPORTED and VERIFICATION_ERROR to exact semantics", () => {
    const unsupported = registry().record(
      fixture({ status: "UNSUPPORTED", reasonCodes: ["UNSUPPORTED_MANIFEST_FORMAT"] }),
    );
    expect(unsupported.status).toBe("UNSUPPORTED");

    const errorReceipt = registry().record(
      fixture({
        screeningId: "screening_2222222222222222",
        manifestPresence: "UNKNOWN",
        manifestDigestAlgorithm: null,
        manifestDigest: null,
        claimDigestAlgorithm: null,
        claimDigest: null,
        manifestTimestamp: null,
        status: "VERIFICATION_ERROR",
        reasonCodes: ["VERIFIER_ERROR"],
      }),
    );
    expect(errorReceipt.manifestPresence).toBe("UNKNOWN");

    expect(() =>
      registry().record(
        fixture({ status: "VERIFICATION_ERROR", reasonCodes: ["VERIFIER_ERROR"] }),
      ),
    ).toThrow("VERIFICATION_ERROR_PRESENCE_INVALID");
  });

  it("records FAILED_BINDING only with cryptographic failure evidence", () => {
    const receipt = registry().record(fixture({
      status: "FAILED_BINDING",
      reasonCodes: ["ASSET_DIGEST_MISMATCH", "MANIFEST_SIGNATURE_INVALID"],
    }));
    expect(receipt.status).toBe("FAILED_BINDING");
    expect(receipt.verdict).toBe("NONE");
    expect(receipt.adverseActionAllowed).toBe(false);
  });

  it("rejects unsupported and verifier-error outcomes laundered into FAILED_BINDING", () => {
    expect(() => registry().record(fixture({
      status: "FAILED_BINDING",
      reasonCodes: ["ASSET_DIGEST_MISMATCH", "UNSUPPORTED_MANIFEST_FORMAT"],
    }))).toThrow("FAILED_BINDING_REASON_CONFLICT");
    expect(() => registry().record(fixture({
      status: "FAILED_BINDING",
      reasonCodes: ["ASSET_DIGEST_MISMATCH", "VERIFIER_ERROR"],
    }))).toThrow("FAILED_BINDING_REASON_CONFLICT");
  });

  it("requires accessibility transcode context to accompany a digest mismatch", () => {
    expect(() => registry().record(fixture({
      status: "FAILED_BINDING",
      reasonCodes: ["ACCESSIBILITY_TRANSCODE_OBSERVED", "MANIFEST_SIGNATURE_INVALID"],
    }))).toThrow("ACCESSIBILITY_TRANSCODE_REASON_UNBOUND");
    expect(registry().record(fixture({
      status: "FAILED_BINDING",
      reasonCodes: [
        "ACCESSIBILITY_TRANSCODE_OBSERVED",
        "ASSET_DIGEST_MISMATCH",
        "DIGEST_MISMATCH_WITH_TRANSCODE_CONTEXT",
      ],
    })).status).toBe("FAILED_BINDING");
    expect(() => registry().record(fixture({
      status: "FAILED_BINDING",
      reasonCodes: ["ASSET_DIGEST_MISMATCH", "DIGEST_MISMATCH_WITH_TRANSCODE_CONTEXT"],
    }))).toThrow("TRANSCODE_CONTEXT_EVIDENCE_MISSING");
  });

  it("rejects stale-trust INCONCLUSIVE paired with NOT_PRESENT", () => {
    expect(() => registry().record(fixture({
      manifestPresence: "NOT_PRESENT",
      manifestDigestAlgorithm: null,
      manifestDigest: null,
      claimDigestAlgorithm: null,
      claimDigest: null,
      manifestTimestamp: null,
      trustListPublishedAt: "2026-07-01T11:50:00.000Z",
      status: "INCONCLUSIVE",
      reasonCodes: ["TRUST_LIST_STALE"],
    }))).toThrow("INCONCLUSIVE_MANIFEST_PRESENCE_INVALID");
  });

  it("rejects a manifest timestamp after verification", () => {
    expect(() =>
      registry().record(fixture({ manifestTimestamp: "2026-07-13T11:55:00.000Z" })),
    ).toThrow("MANIFEST_TIME_AFTER_VERIFICATION");
  });

  it("rejects raw media, biometric and raw PII expansion", () => {
    expect(() => registry().record(fixture({ containsRawMedia: true as false }))).toThrow(
      "RAW_MEDIA_NOT_ALLOWED",
    );
    expect(() => registry().record(fixture({ containsBiometricData: true as false }))).toThrow(
      "BIOMETRIC_DATA_NOT_ALLOWED",
    );
    expect(() => registry().record(fixture({ containsRawPii: true as false }))).toThrow(
      "RAW_PII_NOT_ALLOWED",
    );
  });

  it("rejects semantic conclusions, scores, adverse action and production activation", () => {
    expect(() =>
      registry().record(fixture({ authenticityConclusion: "AUTHENTIC" as "NONE" })),
    ).toThrow("AUTHENTICITY_CONCLUSION_NOT_ALLOWED");
    expect(() => registry().record(fixture({ personRiskScoreAllowed: true as false }))).toThrow(
      "PERSON_RISK_SCORE_NOT_ALLOWED",
    );
    expect(() => registry().record(fixture({ adverseActionAllowed: true as false }))).toThrow(
      "ADVERSE_ACTION_NOT_ALLOWED",
    );
    expect(() => registry().record(fixture({ productionEligible: true as false }))).toThrow(
      "PRODUCTION_NOT_ALLOWED",
    );
  });

  it("rejects person scores and hidden payloads as unknown fields", () => {
    expect(() =>
      registry().record({ ...fixture(), personScore: 0.9 } as unknown as CreateIntegrityScreeningReceiptV1),
    ).toThrow("SCREENING_UNKNOWN_FIELD:personScore");
    expect(() =>
      registry().record({ ...fixture(), rawMedia: "base64" } as unknown as CreateIntegrityScreeningReceiptV1),
    ).toThrow("SCREENING_UNKNOWN_FIELD:rawMedia");
  });

  it("rejects PII-shaped tenant, scope, evidence and screening identifiers", () => {
    expect(() => registry().record(fixture({ tenantRef: "email:john.doe" }))).toThrow(
      "TENANT_REF_INVALID",
    );
    expect(() => registry().record(fixture({ scopeRef: "candidate:john" }))).toThrow(
      "SCOPE_REF_INVALID",
    );
    expect(() => registry().record(fixture({ evidenceRefs: ["candidate:john.doe"] }))).toThrow(
      "EVIDENCE_REFS_INVALID",
    );
    expect(() => registry().record(fixture({
      screeningId: "screening_johndoe11111111",
    }))).toThrow("SCREENING_ID_INVALID");
  });

  it("rejects unknown nested coverage fields", () => {
    expect(() =>
      registry().record(
        fixture({
          coverageRefs: {
            ...fixture().coverageRefs,
            personConfidenceRef: "score:person:forbidden",
          } as unknown as CreateIntegrityScreeningReceiptV1["coverageRefs"],
        }),
      ),
    ).toThrow("COVERAGE_UNKNOWN_FIELD:personConfidenceRef");
  });

  it("requires digest-bound synthetic-only coverage receipts", () => {
    const valid = fixture();
    expect(() => registry().record(fixture({
      coverageRefs: {
        ...valid.coverageRefs,
        uncertainty: {
          ...valid.coverageRefs.uncertainty,
          measurementState: "INDEPENDENTLY_REVIEWED" as "SYNTHETIC_ONLY",
        },
      },
    }))).toThrow("COVERAGE_STATE_INVALID:uncertainty");
    expect(() => registry().record(fixture({
      coverageRefs: {
        ...valid.coverageRefs,
        accessibility: {
          ...valid.coverageRefs.accessibility,
          evidenceDigest: "sha256:weak" as `sha256:${string}`,
        },
      },
    }))).toThrow("COVERAGE_DIGEST_INVALID:accessibility");
  });

  it("binds every reason to the exact snapshot, manifest and verifier lineage", () => {
    const valid = fixture();
    const binding = valid.reasonEvidenceBindings[0]!;
    expect(() => registry().record(fixture({
      reasonEvidenceBindings: [{
        ...binding,
        assetSnapshotDigest: `sha256:${"f".repeat(64)}`,
      }],
    }))).toThrow("REASON_EVIDENCE_SNAPSHOT_MISMATCH");
    expect(() => registry().record(fixture({
      reasonEvidenceBindings: [{ ...binding, manifestDigest: `sha256:${"f".repeat(64)}` }],
    }))).toThrow("REASON_EVIDENCE_MANIFEST_MISMATCH");
    expect(() => registry().record(fixture({
      reasonEvidenceBindings: [{ ...binding, verifierVersionRef: "verifier:c2pa:other-v1" }],
    }))).toThrow("REASON_EVIDENCE_VERIFIER_MISMATCH");
    expect(() => registry().record(fixture({
      reasonEvidenceBindings: [{ ...binding, trustListVersionRef: "trust-list:c2pa:other" }],
    }))).toThrow("REASON_EVIDENCE_TRUST_LIST_MISMATCH");
    expect(() => registry().record(fixture({
      reasonEvidenceBindings: [{ ...binding, policyVersionRef: "policy:integrity:other" }],
    }))).toThrow("REASON_EVIDENCE_POLICY_MISMATCH");
  });

  it("rejects missing, orphan and unknown reason-evidence bindings", () => {
    const valid = fixture();
    expect(() => registry().record(fixture({ reasonEvidenceBindings: [] }))).toThrow(
      "REASON_EVIDENCE_BINDING_COVERAGE_INVALID",
    );
    expect(() => registry().record(fixture({
      evidenceRefs: [...valid.evidenceRefs, "evidence_ffffffffffffffff"],
      reasonEvidenceBindings: valid.reasonEvidenceBindings,
    }))).toThrow("EVIDENCE_INVENTORY_ORPHAN");
    expect(() => registry().record(fixture({
      reasonEvidenceBindings: [{
        ...valid.reasonEvidenceBindings[0]!,
        riskScore: 0.8,
      } as unknown as CreateIntegrityScreeningReceiptV1["reasonEvidenceBindings"][number]],
    }))).toThrow("REASON_EVIDENCE_BINDING_UNKNOWN_FIELD:riskScore");
  });

  it("rejects unknown manifest-presence enum values", () => {
    expect(() => registry().record(fixture({
      manifestPresence: "POTATO" as "PRESENT",
    }))).toThrow("MANIFEST_PRESENCE_INVALID");
  });

  it("requires exact manifest digest fields whenever a manifest is present", () => {
    expect(() => registry().record(fixture({ claimDigest: null }))).toThrow("CLAIM_DIGEST_INVALID");
    expect(() =>
      registry().record(
        fixture({
          manifestPresence: "NOT_PRESENT",
          status: "NOT_PRESENT",
          reasonCodes: ["MANIFEST_NOT_PRESENT"],
        }),
      ),
    ).toThrow("MANIFEST_ABSENT_FIELDS_MUST_BE_NULL");
  });

  it("requires bounded retention and an explicit deletion mechanism", () => {
    expect(() =>
      registry().record(fixture({ retentionExpiresAt: "2027-07-13T11:50:00.000Z" })),
    ).toThrow("RETENTION_WINDOW_INVALID");
    expect(() =>
      registry().record(fixture({ deletionMechanism: "NONE" as "HARD_DELETE" })),
    ).toThrow("DELETION_MECHANISM_INVALID");
  });

  it("requires canonical, unique reason and evidence arrays", () => {
    expect(() =>
      registry().record(
        fixture({
          status: "FAILED_BINDING",
          reasonCodes: ["MANIFEST_SIGNATURE_INVALID", "ASSET_DIGEST_MISMATCH"],
        }),
      ),
    ).toThrow("REASON_CODES_NOT_CANONICAL");
    expect(() =>
      registry().record(
        fixture({ evidenceRefs: ["evidence_ffffffffffffffff", "evidence_aaaaaaaaaaaaaaaa"] }),
      ),
    ).toThrow("EVIDENCE_REFS_INVALID_NOT_CANONICAL");
  });

  it("is idempotent for exact replay and rejects same-id divergence", () => {
    const subject = registry();
    const first = subject.record(fixture());
    expect(subject.record(fixture())).toEqual(first);
    expect(() => subject.record(fixture({ policyVersionRef: "policy:integrity:synthetic-v2" }))).toThrow(
      "SCREENING_IDEMPOTENCY_CONFLICT",
    );
  });

  it("returns deep clones so callers cannot mutate stored receipts", () => {
    const subject = registry();
    const receipt = subject.record(fixture());
    (receipt.evidenceRefs as string[])[0] = "evidence:mutated:v1";
    expect(subject.get(tenantRef, scopeRef, "screening_1111111111111111")?.evidenceRefs).toEqual([
      "evidence_111111111111111100",
    ]);
  });

  it("records correction as an append-only exact-digest successor", () => {
    const subject = registry();
    const original = subject.record(fixture());
    const corrected = subject.record(
      fixture({
        screeningId: "screening_2222222222222222",
        verifierVersionRef: "verifier:c2pa:synthetic-v2",
        verifiedAt: "2026-07-13T11:55:00.000Z",
        supersedesScreeningId: original.screeningId,
        supersedesRecordDigest: original.recordDigest,
        correctionReason: "VERIFIER_RESULT_CORRECTED",
      }),
    );
    expect(corrected.supersedesRecordDigest).toBe(original.recordDigest);
    expect(subject.get(tenantRef, scopeRef, original.screeningId)).toEqual(original);
  });

  it("rejects correction digest laundering and cross-asset lineage", () => {
    const subject = registry();
    const original = subject.record(fixture());
    expect(() =>
      subject.record(
        fixture({
          screeningId: "screening_2222222222222222",
          supersedesScreeningId: original.screeningId,
          supersedesRecordDigest: `sha256:${"f".repeat(64)}`,
          correctionReason: "EVIDENCE_LINEAGE_CORRECTED",
        }),
      ),
    ).toThrow("SUPERSEDED_DIGEST_MISMATCH");

    const differentDigest = `sha256:${"f".repeat(64)}` as const;
    expect(() =>
      subject.record(
        fixture({
          screeningId: "screening_3333333333333333",
          assetDigest: differentDigest,
          assetSnapshotDigest: differentDigest,
          supersedesScreeningId: original.screeningId,
          supersedesRecordDigest: original.recordDigest,
          correctionReason: "ASSET_SNAPSHOT_CORRECTED",
        }),
      ),
    ).toThrow("CORRECTION_ASSET_LINEAGE_MISMATCH");
  });

  it("rejects a correction that supersedes itself", () => {
    const subject = registry();
    const original = subject.record(fixture());
    expect(() =>
      subject.record(
        fixture({
          supersedesScreeningId: original.screeningId,
          supersedesRecordDigest: original.recordDigest,
          correctionReason: "VERIFIER_RESULT_CORRECTED",
        }),
      ),
    ).toThrow("CORRECTION_SELF_REFERENCE");
  });

  it("rejects correction-reason laundering, no-op and non-monotonic time", () => {
    const subject = registry();
    const original = subject.record(fixture());
    expect(() => subject.record(fixture({
      screeningId: "screening_2222222222222222",
      verifiedAt: "2026-07-13T11:55:00.000Z",
      supersedesScreeningId: original.screeningId,
      supersedesRecordDigest: original.recordDigest,
      correctionReason: "TRUST_LIST_UPDATED",
    }))).toThrow("CORRECTION_REQUIRED_DIFF_MISSING:trustList");

    expect(() => subject.record(fixture({
      screeningId: "screening_3333333333333333",
      trustListVersionRef: "trust-list:c2pa:2026-07-13",
      trustListPublishedAt: "2026-07-13T11:49:00.000Z",
      policyVersionRef: "policy:integrity:forbidden-change",
      verifiedAt: "2026-07-13T11:55:00.000Z",
      supersedesScreeningId: original.screeningId,
      supersedesRecordDigest: original.recordDigest,
      correctionReason: "TRUST_LIST_UPDATED",
    }))).toThrow("CORRECTION_FIELD_NOT_ALLOWED:policyVersionRef");

    expect(() => subject.record(fixture({
      screeningId: "screening_4444444444444444",
      verifierVersionRef: "verifier:c2pa:synthetic-v2",
      supersedesScreeningId: original.screeningId,
      supersedesRecordDigest: original.recordDigest,
      correctionReason: "VERIFIER_RESULT_CORRECTED",
    }))).toThrow("CORRECTION_TIME_NOT_MONOTONIC");
  });

  it("requires fresh evidence and audit lineage for every correction", () => {
    const subject = registry();
    const original = subject.record(fixture());
    expect(() => subject.record(fixture({
      screeningId: "screening_2222222222222222",
      verifierVersionRef: "verifier:c2pa:synthetic-v2",
      verifiedAt: "2026-07-13T11:55:00.000Z",
      evidenceRefs: original.evidenceRefs,
      supersedesScreeningId: original.screeningId,
      supersedesRecordDigest: original.recordDigest,
      correctionReason: "VERIFIER_RESULT_CORRECTED",
    }))).toThrow("EVIDENCE_REF_REPLAY");

    expect(() => subject.record(fixture({
      screeningId: "screening_3333333333333333",
      verifierVersionRef: "verifier:c2pa:synthetic-v2",
      verifiedAt: "2026-07-13T11:55:00.000Z",
      auditLineageRefs: original.auditLineageRefs,
      supersedesScreeningId: original.screeningId,
      supersedesRecordDigest: original.recordDigest,
      correctionReason: "VERIFIER_RESULT_CORRECTED",
    }))).toThrow("AUDIT_LINEAGE_REPLAY");
  });

  it("rejects renamed correction evidence with a reused artifact digest", () => {
    const subject = registry();
    const original = subject.record(fixture());
    const successor = fixture({
      screeningId: "screening_2222222222222222",
      verifierVersionRef: "verifier:c2pa:synthetic-v2",
      verifiedAt: "2026-07-13T11:55:00.000Z",
    });
    expect(() => subject.record(fixture({
      ...successor,
      reasonEvidenceBindings: [{
        ...successor.reasonEvidenceBindings[0]!,
        evidenceDigest: original.reasonEvidenceBindings[0]!.evidenceDigest,
      }],
      supersedesScreeningId: original.screeningId,
      supersedesRecordDigest: original.recordDigest,
      correctionReason: "VERIFIER_RESULT_CORRECTED",
    }))).toThrow("EVIDENCE_DIGEST_REPLAY");
  });

  it("default-denies correction changes outside the reason allowlist", () => {
    const subject = registry();
    const original = subject.record(fixture());
    expect(() => subject.record(fixture({
      screeningId: "screening_2222222222222222",
      trustListVersionRef: "trust-list:c2pa:2026-07-13",
      trustListPublishedAt: "2026-07-13T11:50:00.000Z",
      scopeBindingKeyVersionRef: "key:scope-binding:synthetic-v2",
      verifiedAt: "2026-07-13T11:55:00.000Z",
      supersedesScreeningId: original.screeningId,
      supersedesRecordDigest: original.recordDigest,
      correctionReason: "TRUST_LIST_UPDATED",
    }))).toThrow("CORRECTION_FIELD_NOT_ALLOWED:scopeBindingKeyVersionRef");
    expect(() => subject.record(fixture({
      screeningId: "screening_3333333333333333",
      policyVersionRef: "policy:integrity:synthetic-v2",
      retentionExpiresAt: "2026-07-21T11:50:00.000Z",
      verifiedAt: "2026-07-13T11:55:00.000Z",
      supersedesScreeningId: original.screeningId,
      supersedesRecordDigest: original.recordDigest,
      correctionReason: "POLICY_VERSION_UPDATED",
    }))).toThrow("CORRECTION_FIELD_NOT_ALLOWED:retentionExpiresAt");
  });

  it("prevents correction forks from rewriting history", () => {
    const subject = registry();
    const original = subject.record(fixture());
    subject.record(
      fixture({
        screeningId: "screening_2222222222222222",
        trustListVersionRef: "trust-list:c2pa:2026-07-13",
        trustListPublishedAt: "2026-07-13T11:50:00.000Z",
        verifiedAt: "2026-07-13T11:55:00.000Z",
        supersedesScreeningId: original.screeningId,
        supersedesRecordDigest: original.recordDigest,
        correctionReason: "TRUST_LIST_UPDATED",
      }),
    );
    expect(() =>
      subject.record(
        fixture({
          screeningId: "screening_3333333333333333",
          policyVersionRef: "policy:integrity:synthetic-v2",
          verifiedAt: "2026-07-13T11:56:00.000Z",
          supersedesScreeningId: original.screeningId,
          supersedesRecordDigest: original.recordDigest,
          correctionReason: "POLICY_VERSION_UPDATED",
        }),
      ),
    ).toThrow("CORRECTION_FORK_NOT_ALLOWED");
  });

  it("keeps tenant and scope retrieval isolated", () => {
    const subject = registry();
    subject.record(fixture());
    expect(subject.get("tenant_dddddddddddddddd", scopeRef, "screening_1111111111111111")).toBeNull();
    expect(subject.get(tenantRef, "scope_eeeeeeeeeeeeeeee", "screening_1111111111111111")).toBeNull();
  });
});
