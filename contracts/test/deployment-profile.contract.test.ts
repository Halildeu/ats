import { describe, expect, it } from "vitest";
import {
  DEPLOYMENT_PROFILE_SCHEMA_VERSION,
  FORBIDDEN_DEPLOYMENT_PROFILE_FIELDS,
  parseSha256Digest,
  type DeploymentProfileWithoutForbiddenFields,
  type DeploymentReadinessGateV1,
  type DeploymentTopology,
} from "../wire/deployment-profile.js";

const notConfiguredGate = (
  kind: DeploymentReadinessGateV1["kind"],
  drillRequired: boolean,
): DeploymentReadinessGateV1 => ({
  kind,
  status: "NOT_CONFIGURED",
  evidenceVerified: false,
  drillRequired,
  drillPassed: false,
  ownerAccepted: false,
});

describe("P5 Deployment Profile contract", () => {
  it("pins a versioned deployment-profile wire surface", () => {
    expect(DEPLOYMENT_PROFILE_SCHEMA_VERSION).toBe("deployment-profile/v1");
  });

  it("brands only exact lowercase SHA-256 digests", () => {
    expect(parseSha256Digest(`sha256:${"a".repeat(64)}`)).toHaveLength(71);
    expect(() => parseSha256Digest("sha256:abc")).toThrow(TypeError);
    expect(() => parseSha256Digest(`sha256:${"A".repeat(64)}`)).toThrow(TypeError);
  });

  it("keeps the four deployment topologies explicit", () => {
    const topologies: readonly DeploymentTopology[] = [
      "MANAGED",
      "DEDICATED",
      "BYO_REGION",
      "SOVEREIGN_ON_PREM",
    ];

    expect(new Set(topologies).size).toBe(4);
  });

  it("represents pre-G0 readiness without evidence or activation claims", () => {
    const profile: DeploymentProfileWithoutForbiddenFields = {
      profileId: "profile:managed:synthetic",
      topology: "MANAGED",
      synthetic: true,
      readinessState: "NOT_CONFIGURED",
      controls: {
        controlPlaneOwner: "PLATFORM",
        dataPlaneOwner: "PLATFORM",
        isolation: "LOGICAL_TENANT",
        residency: "PLATFORM_APPROVED_REGION",
        egress: "ALLOWLIST_ONLY",
        identity: "PLATFORM_FEDERATED_OIDC_SAML",
        secrets: "PLATFORM_KMS_ROTATED",
        storage: "ENCRYPTED_LOGICAL_TENANT",
        aiProvider: "SELF_HOSTED_PRIMARY",
        support: "PLATFORM_OPERATED",
      },
      releaseEvidenceManifestRef: "release-evidence:synthetic:v1",
      releaseEvidenceManifestDigest: parseSha256Digest(`sha256:${"0".repeat(64)}`),
      releaseEvidenceManifestVerified: false,
      recoveryObjectives: {
        targetsDefined: false,
        rollbackWindowHours: 72,
        immutableArtifactsRequired: true,
        signedReleaseRequired: true,
        approvalRequired: true,
      },
      minimumPaidPartners: 0,
      paidPartnerCount: 0,
      partnerEvidenceVerified: false,
      ownerAccepted: false,
      productionEligible: false,
      releaseAllowed: false,
      gates: [
        notConfiguredGate("SUPPLY_CHAIN", false),
        notConfiguredGate("PROFILE_RENDER", false),
        notConfiguredGate("IDENTITY", false),
        notConfiguredGate("EGRESS", true),
        notConfiguredGate("SECRET_ROTATION", true),
        notConfiguredGate("BACKUP_RESTORE", true),
        notConfiguredGate("UPGRADE_ROLLBACK", true),
        notConfiguredGate("AUDIT_EXPORT", true),
      ],
    };

    expect(profile.releaseAllowed).toBe(false);
    expect(profile.gates.every((gate) => !gate.evidenceVerified)).toBe(true);
    expect(profile.activationEvidence).toBeUndefined();

    const record = profile as unknown as Record<string, unknown>;
    for (const field of FORBIDDEN_DEPLOYMENT_PROFILE_FIELDS) {
      expect(record[field]).toBeUndefined();
    }
  });

  it("keeps supply-chain details in release-evidence/v1 by opaque reference", () => {
    const ref = "release-evidence:synthetic:v1";
    expect(ref.startsWith("release-evidence:")).toBe(true);
    expect(ref).not.toContain("sha256:");
    expect(ref).not.toContain("cosign");
    expect(ref).not.toContain("sbom");
  });
});
