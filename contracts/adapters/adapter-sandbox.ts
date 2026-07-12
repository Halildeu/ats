import { createHash } from "node:crypto";

export const ADAPTER_SANDBOX_SCHEMA_VERSION = "adapter-sandbox/v1" as const;

export type AdapterKind = "OIDC_METADATA" | "SCIM" | "CALENDAR" | "EMAIL";
export type AdapterState =
  | "NOT_CONFIGURED"
  | "DISCOVERY_BLOCKED"
  | "DISCOVERED"
  | "CONFIGURED"
  | "REVOKED";

export type AdapterStandard =
  | "RFC6749"
  | "RFC7636"
  | "RFC8414"
  | "RFC9700"
  | "OIDC_DISCOVERY_1_0"
  | "RFC7643"
  | "RFC7644"
  | "RFC3339"
  | "RFC5545"
  | "RFC5322";

export type AdapterOperation =
  | "verify_sso_metadata"
  | "provision_human_approved_user"
  | "deprovision_human_approved_user"
  | "pull_availability_ref"
  | "propose_interview_slot"
  | "send_human_approved_invite"
  | "send_human_approved_notification";

export type AdapterScope =
  | "scim.user.lifecycle.write"
  | "calendar.availability.read"
  | "calendar.invite.send"
  | "mail.notification.send";

export type AdapterDataClass =
  | "identity_admin_ref"
  | "interview_ref"
  | "availability_window"
  | "audit_link";

export type AdapterAuthMode =
  | "OIDC_METADATA_ONLY"
  | "OAUTH2_CLIENT_CREDENTIAL_REFERENCE"
  | "OAUTH2_AUTHORIZATION_CODE_PKCE_REFERENCE";

export interface AdapterAuthProfileV1 {
  readonly mode: AdapterAuthMode;
  readonly pkceS256Required: boolean;
  readonly tokenTransport: "NONE" | "AUTHORIZATION_HEADER";
  readonly secretHandling: "REFERENCE_ONLY";
  readonly wildcardScopes: "DISALLOWED";
  readonly refreshTokenPersistence: "DISALLOWED";
}

export interface AdapterSandboxConfigV1 {
  readonly schemaVersion: typeof ADAPTER_SANDBOX_SCHEMA_VERSION;
  readonly synthetic: true;
  readonly tenantRef: string;
  readonly adapterId: string;
  readonly kind: AdapterKind;
  readonly providerRef: string;
  readonly standards: readonly AdapterStandard[];
  readonly operations: readonly AdapterOperation[];
  readonly allowedScopes: readonly AdapterScope[];
  readonly dataClasses: readonly AdapterDataClass[];
  readonly authProfile: AdapterAuthProfileV1;
  readonly apiVerified: false;
  readonly activationGate: "PRE_G0_CONFORMANCE_ONLY";
}

export type DiscoveryFailureReason =
  | "METADATA_MISSING"
  | "STANDARD_VERSION_UNSUPPORTED"
  | "CAPABILITY_MISMATCH"
  | "TENANT_POLICY_DENIED";

export interface AdapterDiscoveryRequestV1 {
  readonly schemaVersion: typeof ADAPTER_SANDBOX_SCHEMA_VERSION;
  readonly synthetic: true;
  readonly tenantRef: string;
  readonly adapterId: string;
  readonly metadataRef: string;
  readonly observedStandards: readonly AdapterStandard[];
  readonly discoveredAt: string;
}

export interface AdapterDiscoveryFailureV1 {
  readonly schemaVersion: typeof ADAPTER_SANDBOX_SCHEMA_VERSION;
  readonly synthetic: true;
  readonly tenantRef: string;
  readonly adapterId: string;
  readonly evidenceRef: string;
  readonly reasonCode: DiscoveryFailureReason;
  readonly occurredAt: string;
}

export interface AdapterDiscoveryReceiptV1 {
  readonly schemaVersion: typeof ADAPTER_SANDBOX_SCHEMA_VERSION;
  readonly synthetic: true;
  readonly state: "DISCOVERED";
  readonly verificationStatus: "UNVERIFIED";
  readonly apiVerified: false;
  readonly tenantRef: string;
  readonly adapterId: string;
  readonly metadataRef: string;
  readonly standardsDigest: `sha256:${string}`;
  readonly discoveredAt: string;
  readonly providerCallMade: false;
}

export interface AdapterConfigurationRequestV1 {
  readonly schemaVersion: typeof ADAPTER_SANDBOX_SCHEMA_VERSION;
  readonly synthetic: true;
  readonly tenantRef: string;
  readonly adapterId: string;
  readonly idempotencyKey: string;
  readonly requestedScopes: readonly AdapterScope[];
  readonly secretRef?: string;
  readonly humanApprovalRef: string;
  readonly configuredAt: string;
}

export interface AdapterCredentialBindingV1 {
  readonly requestedScopes: readonly AdapterScope[];
  readonly credentialRefDigest?: `sha256:${string}`;
  readonly requestDigest: `sha256:${string}`;
  readonly humanApprovalRef: string;
  readonly configuredAt: string;
}

export interface AdapterConfigurationReceiptV1 {
  readonly schemaVersion: typeof ADAPTER_SANDBOX_SCHEMA_VERSION;
  readonly synthetic: true;
  readonly disposition: "CONFIGURED" | "REPLAYED";
  readonly state: "CONFIGURED";
  readonly verificationStatus: "UNVERIFIED";
  readonly apiVerified: false;
  readonly tenantRef: string;
  readonly adapterId: string;
  readonly requestedScopes: readonly AdapterScope[];
  readonly credentialRefDigest?: `sha256:${string}`;
  readonly configuredAt: string;
  readonly providerCallMade: false;
}

export interface AdapterReferenceV1 {
  readonly dataClass: AdapterDataClass;
  readonly ref: string;
}

export interface AdapterOperationRequestV1 {
  readonly schemaVersion: typeof ADAPTER_SANDBOX_SCHEMA_VERSION;
  readonly synthetic: true;
  readonly tenantRef: string;
  readonly adapterId: string;
  readonly operation: AdapterOperation;
  readonly idempotencyKey: string;
  readonly payloadDigest: `sha256:${string}`;
  readonly references: readonly AdapterReferenceV1[];
  readonly humanApprovalRef?: string;
  readonly occurredAt: string;
}

export interface AdapterOperationReceiptV1 {
  readonly schemaVersion: typeof ADAPTER_SANDBOX_SCHEMA_VERSION;
  readonly synthetic: true;
  readonly disposition: "SYNTHETIC_ACCEPTED" | "REPLAYED";
  readonly state: "CONFIGURED";
  readonly verificationStatus: "UNVERIFIED";
  readonly apiVerified: false;
  readonly tenantRef: string;
  readonly adapterId: string;
  readonly operation: AdapterOperation;
  readonly requestDigest: `sha256:${string}`;
  readonly payloadDigest: `sha256:${string}`;
  readonly occurredAt: string;
  readonly providerCallMade: false;
}

export interface AdapterRevocationRequestV1 {
  readonly schemaVersion: typeof ADAPTER_SANDBOX_SCHEMA_VERSION;
  readonly synthetic: true;
  readonly tenantRef: string;
  readonly adapterId: string;
  readonly humanApprovalRef: string;
  readonly reasonCode: "CREDENTIAL_ROTATION" | "TENANT_OFFBOARDING" | "SCOPE_REDUCTION";
  readonly revokedAt: string;
}

export type AdapterAuditEvent =
  | "ADAPTER_REGISTERED"
  | "DISCOVERY_BLOCKED"
  | "ADAPTER_DISCOVERED"
  | "ADAPTER_CONFIGURED"
  | "CONFIGURATION_REPLAYED"
  | "OPERATION_SYNTHETIC_ACCEPTED"
  | "OPERATION_REPLAYED"
  | "ADAPTER_REVOKED";

export interface AdapterAuditReceiptV1 {
  readonly schemaVersion: typeof ADAPTER_SANDBOX_SCHEMA_VERSION;
  readonly synthetic: true;
  readonly tenantRef: string;
  readonly adapterId: string;
  readonly event: AdapterAuditEvent;
  readonly state: AdapterState;
  readonly occurredAt: string;
  readonly evidenceDigest: `sha256:${string}`;
  readonly providerCallMade: false;
}

export interface AdapterSnapshotV1 {
  readonly config: AdapterSandboxConfigV1;
  readonly state: AdapterState;
  readonly discovery?: AdapterDiscoveryReceiptV1;
  readonly binding?: AdapterCredentialBindingV1;
  readonly revokedAt?: string;
  readonly audits: readonly AdapterAuditReceiptV1[];
}

interface KindPolicy {
  readonly standards: readonly AdapterStandard[];
  readonly operations: readonly AdapterOperation[];
  readonly scopes: readonly AdapterScope[];
  readonly dataClasses: readonly AdapterDataClass[];
  readonly authProfile: AdapterAuthProfileV1;
}

const KIND_POLICY: Readonly<Record<AdapterKind, KindPolicy>> = {
  OIDC_METADATA: {
    standards: ["RFC6749", "RFC7636", "RFC8414", "RFC9700", "OIDC_DISCOVERY_1_0"],
    operations: ["verify_sso_metadata"],
    scopes: [],
    dataClasses: ["identity_admin_ref"],
    authProfile: {
      mode: "OIDC_METADATA_ONLY",
      pkceS256Required: true,
      tokenTransport: "NONE",
      secretHandling: "REFERENCE_ONLY",
      wildcardScopes: "DISALLOWED",
      refreshTokenPersistence: "DISALLOWED",
    },
  },
  SCIM: {
    standards: ["RFC6749", "RFC9700", "RFC7643", "RFC7644"],
    operations: ["provision_human_approved_user", "deprovision_human_approved_user"],
    scopes: ["scim.user.lifecycle.write"],
    dataClasses: ["identity_admin_ref"],
    authProfile: {
      mode: "OAUTH2_CLIENT_CREDENTIAL_REFERENCE",
      pkceS256Required: false,
      tokenTransport: "AUTHORIZATION_HEADER",
      secretHandling: "REFERENCE_ONLY",
      wildcardScopes: "DISALLOWED",
      refreshTokenPersistence: "DISALLOWED",
    },
  },
  CALENDAR: {
    standards: ["RFC6749", "RFC7636", "RFC9700", "RFC3339", "RFC5545"],
    operations: [
      "pull_availability_ref",
      "propose_interview_slot",
      "send_human_approved_invite",
    ],
    scopes: ["calendar.availability.read", "calendar.invite.send"],
    dataClasses: ["interview_ref", "availability_window"],
    authProfile: {
      mode: "OAUTH2_AUTHORIZATION_CODE_PKCE_REFERENCE",
      pkceS256Required: true,
      tokenTransport: "AUTHORIZATION_HEADER",
      secretHandling: "REFERENCE_ONLY",
      wildcardScopes: "DISALLOWED",
      refreshTokenPersistence: "DISALLOWED",
    },
  },
  EMAIL: {
    standards: ["RFC6749", "RFC7636", "RFC9700", "RFC5322"],
    operations: ["send_human_approved_notification"],
    scopes: ["mail.notification.send"],
    dataClasses: ["interview_ref", "audit_link"],
    authProfile: {
      mode: "OAUTH2_AUTHORIZATION_CODE_PKCE_REFERENCE",
      pkceS256Required: true,
      tokenTransport: "AUTHORIZATION_HEADER",
      secretHandling: "REFERENCE_ONLY",
      wildcardScopes: "DISALLOWED",
      refreshTokenPersistence: "DISALLOWED",
    },
  },
};

const REQUIRED_SCOPE: Readonly<Partial<Record<AdapterOperation, AdapterScope>>> = {
  provision_human_approved_user: "scim.user.lifecycle.write",
  deprovision_human_approved_user: "scim.user.lifecycle.write",
  pull_availability_ref: "calendar.availability.read",
  // Proposal is an internal, human-approved draft; it does not send a
  // provider-side invite. Availability read scope is therefore sufficient.
  propose_interview_slot: "calendar.availability.read",
  send_human_approved_invite: "calendar.invite.send",
  send_human_approved_notification: "mail.notification.send",
};

const OPERATION_DATA_CLASSES: Readonly<Record<AdapterOperation, readonly AdapterDataClass[]>> = {
  verify_sso_metadata: ["identity_admin_ref"],
  provision_human_approved_user: ["identity_admin_ref"],
  deprovision_human_approved_user: ["identity_admin_ref"],
  pull_availability_ref: ["interview_ref", "availability_window"],
  propose_interview_slot: ["interview_ref", "availability_window"],
  send_human_approved_invite: ["interview_ref"],
  send_human_approved_notification: ["interview_ref", "audit_link"],
};

const MUTATING_OPERATIONS = new Set<AdapterOperation>([
  "provision_human_approved_user",
  "deprovision_human_approved_user",
  "propose_interview_slot",
  "send_human_approved_invite",
  "send_human_approved_notification",
]);

const REF = /^[A-Za-z][A-Za-z0-9._:/-]{2,159}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const REF_PREFIX: Readonly<Record<AdapterDataClass, string>> = {
  identity_admin_ref: "identity.",
  interview_ref: "interview.",
  availability_window: "availability.",
  audit_link: "audit.",
};

const FORBIDDEN_KEYS = new Set([
  "candidate_name",
  "candidate_email",
  "candidate_phone",
  "display_name",
  "user_name",
  "email_address",
  "phone_number",
  "access_token",
  "refresh_token",
  "client_secret",
  "secret_value",
  "password",
  "cookie",
  "authorization_code",
  "authorization_header",
  "decision",
  "candidate_status",
  "stage",
  "score",
  "ranking_score",
  "candidate_rank",
  "affect",
  "emotion",
  "deception",
]);

function invariant(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function digest(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[-\s]+/g, "_")
    .toLowerCase();
}

function scanForbiddenKeys(value: unknown): void {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    invariant(!FORBIDDEN_KEYS.has(normalizeKey(key)), `FORBIDDEN_FIELD:${key}`);
    scanForbiddenKeys(child);
  }
}

function assertOnlyKeys(value: object, allowed: readonly string[], code: string): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) invariant(allowedSet.has(key), `${code}:${key}`);
}

function sameSet<T extends string>(actual: readonly T[], expected: readonly T[]): boolean {
  return actual.length === expected.length &&
    new Set(actual).size === actual.length &&
    new Set(expected).size === expected.length &&
    actual.every((item) => expected.includes(item));
}

function sameAuthProfile(
  actual: AdapterAuthProfileV1,
  expected: AdapterAuthProfileV1,
): boolean {
  return actual.mode === expected.mode &&
    actual.pkceS256Required === expected.pkceS256Required &&
    actual.tokenTransport === expected.tokenTransport &&
    actual.secretHandling === expected.secretHandling &&
    actual.wildcardScopes === expected.wildcardScopes &&
    actual.refreshTokenPersistence === expected.refreshTokenPersistence;
}

function iso(value: string, code: string): void {
  invariant(Number.isFinite(Date.parse(value)) && value.endsWith("Z"), code);
}

function canonicalConfig(config: AdapterSandboxConfigV1): string {
  return [
    config.schemaVersion,
    String(config.synthetic),
    config.tenantRef,
    config.adapterId,
    config.kind,
    config.providerRef,
    [...config.standards].sort().join(","),
    [...config.operations].sort().join(","),
    [...config.allowedScopes].sort().join(","),
    [...config.dataClasses].sort().join(","),
    JSON.stringify(config.authProfile),
    String(config.apiVerified),
    config.activationGate,
  ].join("\n");
}

function canonicalConfiguration(request: AdapterConfigurationRequestV1): string {
  return [
    request.schemaVersion,
    String(request.synthetic),
    request.tenantRef,
    request.adapterId,
    request.idempotencyKey,
    [...request.requestedScopes].sort().join(","),
    request.secretRef ?? "NONE",
    request.humanApprovalRef,
    request.configuredAt,
  ].join("\n");
}

function canonicalOperation(request: AdapterOperationRequestV1): string {
  const refs = [...request.references]
    .sort((left, right) => left.dataClass.localeCompare(right.dataClass))
    .map((item) => `${item.dataClass}=${item.ref}`)
    .join(",");
  return [
    request.schemaVersion,
    String(request.synthetic),
    request.tenantRef,
    request.adapterId,
    request.operation,
    request.idempotencyKey,
    request.payloadDigest,
    refs,
    request.humanApprovalRef ?? "NONE",
    request.occurredAt,
  ].join("\n");
}

function validateConfig(config: AdapterSandboxConfigV1): void {
  scanForbiddenKeys(config);
  assertOnlyKeys(
    config,
    [
      "schemaVersion",
      "synthetic",
      "tenantRef",
      "adapterId",
      "kind",
      "providerRef",
      "standards",
      "operations",
      "allowedScopes",
      "dataClasses",
      "authProfile",
      "apiVerified",
      "activationGate",
    ],
    "CONFIG_UNKNOWN_FIELD",
  );
  assertOnlyKeys(
    config.authProfile,
    [
      "mode",
      "pkceS256Required",
      "tokenTransport",
      "secretHandling",
      "wildcardScopes",
      "refreshTokenPersistence",
    ],
    "AUTH_PROFILE_UNKNOWN_FIELD",
  );
  invariant(config.schemaVersion === ADAPTER_SANDBOX_SCHEMA_VERSION, "SCHEMA_VERSION_UNSUPPORTED");
  invariant(config.synthetic === true, "SYNTHETIC_ONLY");
  invariant(REF.test(config.tenantRef) && REF.test(config.adapterId) && REF.test(config.providerRef), "REF_INVALID");
  invariant(config.apiVerified === false, "API_VERIFIED_PRE_G0_FORBIDDEN");
  invariant(config.activationGate === "PRE_G0_CONFORMANCE_ONLY", "ACTIVATION_GATE_INVALID");
  const policy = KIND_POLICY[config.kind];
  invariant(policy, "ADAPTER_KIND_INVALID");
  invariant(sameSet(config.standards, policy.standards), "STANDARD_PROFILE_MISMATCH");
  invariant(sameSet(config.operations, policy.operations), "OPERATION_PROFILE_MISMATCH");
  invariant(sameSet(config.allowedScopes, policy.scopes), "SCOPE_PROFILE_MISMATCH");
  invariant(sameSet(config.dataClasses, policy.dataClasses), "DATA_CLASS_PROFILE_MISMATCH");
  invariant(sameAuthProfile(config.authProfile, policy.authProfile), "AUTH_PROFILE_MISMATCH");
}

export class AdapterSandboxRegistry {
  private snapshots = new Map<string, AdapterSnapshotV1>();
  private configurationReceipts = new Map<string, AdapterConfigurationReceiptV1>();
  private operationReceipts = new Map<string, AdapterOperationReceiptV1>();
  private credentialRefs = new Map<string, string>();

  register(config: AdapterSandboxConfigV1, occurredAt: string): AdapterSnapshotV1 {
    validateConfig(config);
    iso(occurredAt, "OCCURRED_AT_INVALID");
    const key = this.key(config.tenantRef, config.adapterId);
    const existing = this.snapshots.get(key);
    if (existing) {
      invariant(digest(canonicalConfig(existing.config)) === digest(canonicalConfig(config)), "ADAPTER_CONFIG_CONFLICT");
      return clone(existing);
    }
    const storedConfig = clone(config);
    const initial: AdapterSnapshotV1 = {
      config: storedConfig,
      state: "NOT_CONFIGURED",
      audits: [],
    };
    const snapshot = this.withAudit(
      initial,
      "ADAPTER_REGISTERED",
      occurredAt,
      digest(canonicalConfig(storedConfig)),
    );
    this.snapshots.set(key, snapshot);
    return clone(snapshot);
  }

  recordDiscoveryFailure(request: AdapterDiscoveryFailureV1): AdapterSnapshotV1 {
    scanForbiddenKeys(request);
    assertOnlyKeys(
      request,
      ["schemaVersion", "synthetic", "tenantRef", "adapterId", "evidenceRef", "reasonCode", "occurredAt"],
      "DISCOVERY_FAILURE_UNKNOWN_FIELD",
    );
    this.validateBase(request);
    invariant(REF.test(request.evidenceRef) && request.evidenceRef.startsWith("evidence."), "EVIDENCE_REF_INVALID");
    invariant(
      [
        "METADATA_MISSING",
        "STANDARD_VERSION_UNSUPPORTED",
        "CAPABILITY_MISMATCH",
        "TENANT_POLICY_DENIED",
      ].includes(request.reasonCode),
      "DISCOVERY_REASON_INVALID",
    );
    iso(request.occurredAt, "OCCURRED_AT_INVALID");
    const key = this.key(request.tenantRef, request.adapterId);
    const current = this.required(key);
    invariant(current.state === "NOT_CONFIGURED" || current.state === "DISCOVERY_BLOCKED", "DISCOVERY_STATE_INVALID");
    const blocked: AdapterSnapshotV1 = { ...current, state: "DISCOVERY_BLOCKED" };
    const next = this.withAudit(
      blocked,
      "DISCOVERY_BLOCKED",
      request.occurredAt,
      digest(`${request.reasonCode}\n${request.evidenceRef}`),
    );
    this.snapshots.set(key, next);
    return clone(next);
  }

  discover(request: AdapterDiscoveryRequestV1): AdapterDiscoveryReceiptV1 {
    scanForbiddenKeys(request);
    assertOnlyKeys(
      request,
      ["schemaVersion", "synthetic", "tenantRef", "adapterId", "metadataRef", "observedStandards", "discoveredAt"],
      "DISCOVERY_UNKNOWN_FIELD",
    );
    this.validateBase(request);
    invariant(REF.test(request.metadataRef) && request.metadataRef.startsWith("metadata."), "METADATA_REF_INVALID");
    iso(request.discoveredAt, "DISCOVERED_AT_INVALID");
    const key = this.key(request.tenantRef, request.adapterId);
    const current = this.required(key);
    invariant(current.state === "NOT_CONFIGURED" || current.state === "DISCOVERY_BLOCKED", "DISCOVERY_STATE_INVALID");
    invariant(sameSet(request.observedStandards, current.config.standards), "STANDARD_DISCOVERY_MISMATCH");
    const receipt: AdapterDiscoveryReceiptV1 = {
      schemaVersion: ADAPTER_SANDBOX_SCHEMA_VERSION,
      synthetic: true,
      state: "DISCOVERED",
      verificationStatus: "UNVERIFIED",
      apiVerified: false,
      tenantRef: request.tenantRef,
      adapterId: request.adapterId,
      metadataRef: request.metadataRef,
      standardsDigest: digest([...request.observedStandards].sort().join(",")),
      discoveredAt: request.discoveredAt,
      providerCallMade: false,
    };
    const discovered: AdapterSnapshotV1 = { ...current, state: "DISCOVERED", discovery: receipt };
    const next = this.withAudit(
      discovered,
      "ADAPTER_DISCOVERED",
      request.discoveredAt,
      receipt.standardsDigest,
    );
    this.snapshots.set(key, next);
    return clone(receipt);
  }

  configure(request: AdapterConfigurationRequestV1): AdapterConfigurationReceiptV1 {
    scanForbiddenKeys(request);
    assertOnlyKeys(
      request,
      [
        "schemaVersion",
        "synthetic",
        "tenantRef",
        "adapterId",
        "idempotencyKey",
        "requestedScopes",
        "secretRef",
        "humanApprovalRef",
        "configuredAt",
      ],
      "CONFIGURATION_UNKNOWN_FIELD",
    );
    this.validateBase(request);
    invariant(REF.test(request.idempotencyKey), "IDEMPOTENCY_KEY_INVALID");
    invariant(request.idempotencyKey.startsWith(`${request.tenantRef}:`), "IDEMPOTENCY_NOT_TENANT_SCOPED");
    invariant(
      REF.test(request.humanApprovalRef) && request.humanApprovalRef.startsWith("approval."),
      "HUMAN_APPROVAL_REQUIRED",
    );
    iso(request.configuredAt, "CONFIGURED_AT_INVALID");

    const key = this.key(request.tenantRef, request.adapterId);
    const current = this.required(key);
    const requestDigest = digest(canonicalConfiguration(request));
    const receiptKey = `${key}\u0000${request.idempotencyKey}`;
    const prior = this.configurationReceipts.get(receiptKey);
    if (prior) {
      invariant(current.state === "CONFIGURED", current.state === "REVOKED" ? "ADAPTER_REVOKED" : "CONFIGURATION_STATE_INVALID");
      invariant(current.binding?.requestDigest === requestDigest, "IDEMPOTENCY_DIGEST_CONFLICT");
      const replayed = this.withAudit(
        current,
        "CONFIGURATION_REPLAYED",
        request.configuredAt,
        requestDigest,
      );
      this.snapshots.set(key, replayed);
      return clone({ ...prior, disposition: "REPLAYED" });
    }
    invariant(current.state === "DISCOVERED", "CONFIGURATION_STATE_INVALID");
    invariant(
      !request.requestedScopes.some((scope) => String(scope).includes("*")),
      "WILDCARD_SCOPE_FORBIDDEN",
    );
    invariant(
      new Set(request.requestedScopes).size === request.requestedScopes.length &&
        request.requestedScopes.every((scope) => current.config.allowedScopes.includes(scope)),
      "SCOPE_NOT_LEAST_PRIVILEGE",
    );

    const metadataOnly = current.config.authProfile.mode === "OIDC_METADATA_ONLY";
    if (metadataOnly) {
      invariant(request.secretRef === undefined, "SECRET_REF_NOT_ALLOWED");
      invariant(request.requestedScopes.length === 0, "SCOPE_NOT_ALLOWED");
    } else {
      invariant(
        typeof request.secretRef === "string" &&
          REF.test(request.secretRef) &&
          request.secretRef.startsWith("secret.synthetic."),
        "SECRET_REFERENCE_REQUIRED",
      );
      invariant(request.requestedScopes.length > 0, "SCOPE_REQUIRED");
      this.credentialRefs.set(key, request.secretRef);
    }

    const credentialRefDigest = request.secretRef ? digest(request.secretRef) : undefined;
    const binding: AdapterCredentialBindingV1 = {
      requestedScopes: [...request.requestedScopes].sort(),
      ...(credentialRefDigest ? { credentialRefDigest } : {}),
      requestDigest,
      humanApprovalRef: request.humanApprovalRef,
      configuredAt: request.configuredAt,
    };
    const receipt: AdapterConfigurationReceiptV1 = {
      schemaVersion: ADAPTER_SANDBOX_SCHEMA_VERSION,
      synthetic: true,
      disposition: "CONFIGURED",
      state: "CONFIGURED",
      verificationStatus: "UNVERIFIED",
      apiVerified: false,
      tenantRef: request.tenantRef,
      adapterId: request.adapterId,
      requestedScopes: binding.requestedScopes,
      ...(credentialRefDigest ? { credentialRefDigest } : {}),
      configuredAt: request.configuredAt,
      providerCallMade: false,
    };
    const configured: AdapterSnapshotV1 = { ...current, state: "CONFIGURED", binding };
    const next = this.withAudit(
      configured,
      "ADAPTER_CONFIGURED",
      request.configuredAt,
      requestDigest,
    );
    this.snapshots.set(key, next);
    this.configurationReceipts.set(receiptKey, clone(receipt));
    return clone(receipt);
  }

  execute(request: AdapterOperationRequestV1): AdapterOperationReceiptV1 {
    scanForbiddenKeys(request);
    assertOnlyKeys(
      request,
      [
        "schemaVersion",
        "synthetic",
        "tenantRef",
        "adapterId",
        "operation",
        "idempotencyKey",
        "payloadDigest",
        "references",
        "humanApprovalRef",
        "occurredAt",
      ],
      "OPERATION_UNKNOWN_FIELD",
    );
    for (const reference of request.references) {
      assertOnlyKeys(reference, ["dataClass", "ref"], "REFERENCE_UNKNOWN_FIELD");
    }
    this.validateBase(request);
    invariant(REF.test(request.idempotencyKey), "IDEMPOTENCY_KEY_INVALID");
    invariant(request.idempotencyKey.startsWith(`${request.tenantRef}:`), "IDEMPOTENCY_NOT_TENANT_SCOPED");
    invariant(DIGEST.test(request.payloadDigest), "PAYLOAD_DIGEST_INVALID");
    iso(request.occurredAt, "OCCURRED_AT_INVALID");

    const key = this.key(request.tenantRef, request.adapterId);
    const current = this.required(key);
    invariant(current.state === "CONFIGURED", current.state === "REVOKED" ? "ADAPTER_REVOKED" : "ADAPTER_NOT_CONFIGURED");
    invariant(current.config.operations.includes(request.operation), "OPERATION_NOT_ALLOWED");

    const expectedClasses = OPERATION_DATA_CLASSES[request.operation];
    invariant(
      sameSet(
        request.references.map((item) => item.dataClass),
        expectedClasses,
      ),
      "REFERENCE_PROFILE_MISMATCH",
    );
    for (const reference of request.references) {
      invariant(
        REF.test(reference.ref) && reference.ref.startsWith(REF_PREFIX[reference.dataClass]),
        "OPAQUE_REFERENCE_INVALID",
      );
    }

    const scope = REQUIRED_SCOPE[request.operation];
    if (scope) invariant(current.binding?.requestedScopes.includes(scope), "REQUIRED_SCOPE_MISSING");
    if (MUTATING_OPERATIONS.has(request.operation)) {
      invariant(
        typeof request.humanApprovalRef === "string" &&
          REF.test(request.humanApprovalRef) &&
          request.humanApprovalRef.startsWith("approval."),
        "HUMAN_APPROVAL_REQUIRED",
      );
    } else {
      invariant(request.humanApprovalRef === undefined, "UNEXPECTED_HUMAN_APPROVAL");
    }

    const requestDigest = digest(canonicalOperation(request));
    const receiptKey = `${key}\u0000${request.idempotencyKey}`;
    const prior = this.operationReceipts.get(receiptKey);
    if (prior) {
      invariant(prior.requestDigest === requestDigest, "IDEMPOTENCY_DIGEST_CONFLICT");
      const replayed = this.withAudit(
        current,
        "OPERATION_REPLAYED",
        request.occurredAt,
        requestDigest,
      );
      this.snapshots.set(key, replayed);
      return clone({ ...prior, disposition: "REPLAYED" });
    }

    const receipt: AdapterOperationReceiptV1 = {
      schemaVersion: ADAPTER_SANDBOX_SCHEMA_VERSION,
      synthetic: true,
      disposition: "SYNTHETIC_ACCEPTED",
      state: "CONFIGURED",
      verificationStatus: "UNVERIFIED",
      apiVerified: false,
      tenantRef: request.tenantRef,
      adapterId: request.adapterId,
      operation: request.operation,
      requestDigest,
      payloadDigest: request.payloadDigest,
      occurredAt: request.occurredAt,
      providerCallMade: false,
    };
    const next = this.withAudit(
      current,
      "OPERATION_SYNTHETIC_ACCEPTED",
      request.occurredAt,
      requestDigest,
    );
    this.snapshots.set(key, next);
    this.operationReceipts.set(receiptKey, clone(receipt));
    return clone(receipt);
  }

  revoke(request: AdapterRevocationRequestV1): AdapterSnapshotV1 {
    scanForbiddenKeys(request);
    assertOnlyKeys(
      request,
      [
        "schemaVersion",
        "synthetic",
        "tenantRef",
        "adapterId",
        "humanApprovalRef",
        "reasonCode",
        "revokedAt",
      ],
      "REVOCATION_UNKNOWN_FIELD",
    );
    this.validateBase(request);
    invariant(
      REF.test(request.humanApprovalRef) && request.humanApprovalRef.startsWith("approval."),
      "HUMAN_APPROVAL_REQUIRED",
    );
    invariant(
      ["CREDENTIAL_ROTATION", "TENANT_OFFBOARDING", "SCOPE_REDUCTION"].includes(
        request.reasonCode,
      ),
      "REVOCATION_REASON_INVALID",
    );
    iso(request.revokedAt, "REVOKED_AT_INVALID");
    const key = this.key(request.tenantRef, request.adapterId);
    const current = this.required(key);
    invariant(current.state === "CONFIGURED", "REVOCATION_STATE_INVALID");
    this.credentialRefs.delete(key);
    const revoked: AdapterSnapshotV1 = {
      ...current,
      state: "REVOKED",
      revokedAt: request.revokedAt,
    };
    const next = this.withAudit(
      revoked,
      "ADAPTER_REVOKED",
      request.revokedAt,
      digest(request.reasonCode),
    );
    this.snapshots.set(key, next);
    return clone(next);
  }

  get(tenantRef: string, adapterId: string): AdapterSnapshotV1 | undefined {
    const snapshot = this.snapshots.get(this.key(tenantRef, adapterId));
    return snapshot ? clone(snapshot) : undefined;
  }

  hasCredentialReference(tenantRef: string, adapterId: string): boolean {
    return this.credentialRefs.has(this.key(tenantRef, adapterId));
  }

  private validateBase(request: {
    readonly schemaVersion: string;
    readonly synthetic: boolean;
    readonly tenantRef: string;
    readonly adapterId: string;
  }): void {
    invariant(request.schemaVersion === ADAPTER_SANDBOX_SCHEMA_VERSION, "SCHEMA_VERSION_UNSUPPORTED");
    invariant(request.synthetic === true, "SYNTHETIC_ONLY");
    invariant(REF.test(request.tenantRef) && REF.test(request.adapterId), "REF_INVALID");
  }

  private key(tenantRef: string, adapterId: string): string {
    invariant(REF.test(tenantRef) && REF.test(adapterId), "REF_INVALID");
    return `${tenantRef}\u0000${adapterId}`;
  }

  private required(key: string): AdapterSnapshotV1 {
    const snapshot = this.snapshots.get(key);
    invariant(snapshot, "ADAPTER_NOT_FOUND");
    return snapshot;
  }

  private withAudit(
    snapshot: AdapterSnapshotV1,
    event: AdapterAuditEvent,
    occurredAt: string,
    evidenceDigest: `sha256:${string}`,
  ): AdapterSnapshotV1 {
    const audit: AdapterAuditReceiptV1 = {
      schemaVersion: ADAPTER_SANDBOX_SCHEMA_VERSION,
      synthetic: true,
      tenantRef: snapshot.config.tenantRef,
      adapterId: snapshot.config.adapterId,
      event,
      state: snapshot.state,
      occurredAt,
      evidenceDigest,
      providerCallMade: false,
    };
    return { ...snapshot, audits: [...snapshot.audits, audit] };
  }
}

export function adapterPolicy(kind: AdapterKind): KindPolicy {
  return JSON.parse(JSON.stringify(KIND_POLICY[kind])) as KindPolicy;
}
