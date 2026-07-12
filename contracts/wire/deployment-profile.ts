/** Faz 25 P5 — sovereign deployment readiness wire contract. */

export const DEPLOYMENT_PROFILE_SCHEMA_VERSION =
  "deployment-profile/v1" as const;

declare const sha256DigestBrand: unique symbol;
export type Sha256Digest = `sha256:${string}` & {
  readonly [sha256DigestBrand]: true;
};

export function parseSha256Digest(value: string): Sha256Digest {
  if (!/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new TypeError("Expected sha256: followed by exactly 64 lowercase hex characters");
  }
  return value as Sha256Digest;
}

export type DeploymentTopology =
  | "MANAGED"
  | "DEDICATED"
  | "BYO_REGION"
  | "SOVEREIGN_ON_PREM";

export type DeploymentReadinessState =
  | "NOT_CONFIGURED"
  | "CONFIGURED"
  | "VERIFIED"
  | "DRILL_PASSED"
  | "OWNER_ACCEPTED";

export type DeploymentGateKind =
  | "SUPPLY_CHAIN"
  | "PROFILE_RENDER"
  | "IDENTITY"
  | "EGRESS"
  | "SECRET_ROTATION"
  | "BACKUP_RESTORE"
  | "UPGRADE_ROLLBACK"
  | "AUDIT_EXPORT";

export type DeploymentControlOwner = "PLATFORM" | "SHARED" | "CUSTOMER";

export type DeploymentIsolationModel =
  | "LOGICAL_TENANT"
  | "DEDICATED_TENANT"
  | "DEDICATED_REGION"
  | "CUSTOMER_CONTROLLED_BOUNDARY";

export type DeploymentResidencyModel =
  | "PLATFORM_APPROVED_REGION"
  | "CUSTOMER_SELECTED_REGION"
  | "CUSTOMER_CONTROLLED_RESIDENCY";

export type DeploymentEgressModel =
  | "ALLOWLIST_ONLY"
  | "DENY_BY_DEFAULT"
  | "AIR_GAPPED_OR_CUSTOMER_ALLOWLIST";

export type DeploymentIdentityModel =
  | "PLATFORM_FEDERATED_OIDC_SAML"
  | "CUSTOMER_FEDERATED_OIDC_SAML"
  | "CUSTOMER_CONTROLLED_SSO_SCIM_METADATA";

export type DeploymentSecretModel =
  | "PLATFORM_KMS_ROTATED"
  | "CUSTOMER_KMS_BYOK"
  | "CUSTOMER_MANAGED_OFFLINE_KEYS";

export type DeploymentStorageModel =
  | "ENCRYPTED_LOGICAL_TENANT"
  | "ENCRYPTED_DEDICATED"
  | "CUSTOMER_MANAGED_ENCRYPTED";

export type DeploymentAIProviderModel =
  | "SELF_HOSTED_PRIMARY"
  | "CUSTOMER_APPROVED_PROVIDER"
  | "OFFLINE_SELF_HOSTED_ONLY";

export type DeploymentSupportModel =
  | "PLATFORM_OPERATED"
  | "SHARED_RESPONSIBILITY"
  | "CUSTOMER_OPERATED_SIGNED_BUNDLE";

export type MinimumPaidPartners = 0 | 1 | 2;

export interface DeploymentGateEvidenceV1 {
  readonly evidenceRef: string;
  readonly verifierRef: string;
  readonly verifiedAt: string;
  readonly drillEvidenceRef?: string;
  readonly measuredAt?: string;
  readonly observedRpoSeconds?: number;
  readonly observedRtoSeconds?: number;
  readonly ownerAcceptanceRef?: string;
}

export interface DeploymentReadinessGateV1 {
  readonly kind: DeploymentGateKind;
  readonly status: DeploymentReadinessState;
  readonly evidenceVerified: boolean;
  readonly drillRequired: boolean;
  readonly drillPassed: boolean;
  readonly ownerAccepted: boolean;
  readonly evidence?: DeploymentGateEvidenceV1;
}

export interface DeploymentProfileControlsV1 {
  readonly controlPlaneOwner: DeploymentControlOwner;
  readonly dataPlaneOwner: DeploymentControlOwner;
  readonly isolation: DeploymentIsolationModel;
  readonly residency: DeploymentResidencyModel;
  readonly egress: DeploymentEgressModel;
  readonly identity: DeploymentIdentityModel;
  readonly secrets: DeploymentSecretModel;
  readonly storage: DeploymentStorageModel;
  readonly aiProvider: DeploymentAIProviderModel;
  readonly support: DeploymentSupportModel;
}

export interface DeploymentActivationEvidenceV1 {
  readonly releaseReceiptRef: string;
  readonly partnerEvidenceRefs: readonly string[];
  readonly ownerAcceptanceRef: string;
  readonly acceptedAt: string;
}

export interface DeploymentRecoveryObjectivesV1 {
  readonly targetsDefined: boolean;
  readonly targetRpoSeconds?: number;
  readonly targetRtoSeconds?: number;
  readonly rollbackWindowHours: number;
  readonly immutableArtifactsRequired: true;
  readonly signedReleaseRequired: true;
  readonly approvalRequired: true;
}

export interface DeploymentProfileV1 {
  readonly profileId: string;
  readonly topology: DeploymentTopology;
  readonly synthetic: boolean;
  readonly readinessState: DeploymentReadinessState;
  readonly controls: DeploymentProfileControlsV1;
  /** Opaque link only; release-evidence/v1 remains the supply-chain authority. */
  readonly releaseEvidenceManifestRef: string;
  readonly releaseEvidenceManifestDigest: Sha256Digest;
  readonly releaseEvidenceManifestVerified: boolean;
  readonly recoveryObjectives: DeploymentRecoveryObjectivesV1;
  readonly minimumPaidPartners: MinimumPaidPartners;
  readonly paidPartnerCount: number;
  readonly partnerEvidenceVerified: boolean;
  readonly ownerAccepted: boolean;
  readonly productionEligible: boolean;
  readonly releaseAllowed: boolean;
  readonly gates: readonly DeploymentReadinessGateV1[];
  readonly activationEvidence?: DeploymentActivationEvidenceV1;
}

export interface DeploymentProfileRegistryV1 {
  readonly schemaVersion: typeof DEPLOYMENT_PROFILE_SCHEMA_VERSION;
  readonly activationGate: "PRE_G0_CONTRACT_ONLY" | "G0_ACCEPTED_RUNTIME";
  readonly profiles: readonly DeploymentProfileV1[];
}

/** Secrets, PII, customer identity and concrete network coordinates are forbidden. */
export const FORBIDDEN_DEPLOYMENT_PROFILE_FIELDS = [
  "customerId",
  "customerName",
  "tenantId",
  "candidateEmail",
  "hostname",
  "ipAddress",
  "clusterEndpoint",
  "accessToken",
  "refreshToken",
  "clientSecret",
  "privateKey",
  "password",
] as const;

export type ForbiddenDeploymentProfileField =
  (typeof FORBIDDEN_DEPLOYMENT_PROFILE_FIELDS)[number];

export type DeploymentProfileWithoutForbiddenFields = DeploymentProfileV1 & {
  readonly [K in ForbiddenDeploymentProfileField]?: never;
};
