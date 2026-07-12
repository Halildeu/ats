/** Faz 25 P4 — versioned wire contract; ATS-0001 stable-interface parity'sinden ayrıdır. */

export const INTEGRATION_PLATFORM_SCHEMA_VERSION =
  "integration-platform/v1" as const;
export const INTEGRATION_ENVELOPE_SCHEMA_VERSION =
  "integration-envelope/v1" as const;

export type IntegrationDomain =
  | "ATS"
  | "HRIS"
  | "CALENDAR_EMAIL"
  | "SSO_SCIM"
  | "PORTABILITY"
  | "DISTRIBUTION";

export type IntegrationDirection = "PULL" | "PUSH" | "BIDIRECTIONAL";
export type IntegrationVerificationStatus =
  | "UNVERIFIED"
  | "VERIFIED"
  | "BLOCKED"
  | "NOT_CONFIGURED";

export type IntegrationOperation =
  | "pull_candidate_ref"
  | "pull_interview_ref"
  | "pull_role_ref"
  | "push_evidence_ref"
  | "pull_worker_ref"
  | "push_hire_handoff_ref"
  | "pull_availability_ref"
  | "propose_interview_slot"
  | "send_human_approved_invite"
  | "send_human_approved_notification"
  | "verify_sso_metadata"
  | "provision_human_approved_user"
  | "deprovision_human_approved_user"
  | "import_csv_ref"
  | "export_csv_ref"
  | "open_api_read"
  | "subscribe_signed_webhook"
  | "export_tenant_archive"
  | "request_tenant_erasure"
  | "publish_human_approved_job_ref";

export type IntegrationDataClass =
  | "opaque_candidate_ref"
  | "interview_ref"
  | "role_ref"
  | "evidence_packet_ref"
  | "audit_link"
  | "worker_ref"
  | "availability_window"
  | "identity_admin_ref"
  | "dossier_metadata"
  | "job_ref"
  | "tenant_archive_ref";

export interface IntegrationActivationEvidence {
  readonly sandboxReceiptRef: string;
  readonly contractVersion: string;
  readonly verifiedAt: string;
  readonly verifierRef: string;
}

export interface IntegrationMutationPolicy {
  readonly humanApprovalRequired: true;
  readonly idempotencyRequired: true;
  readonly decisionImpact: "NONE";
  readonly destructiveOperations: "DISALLOWED";
  readonly batchApproval: "DISALLOWED";
}

export interface IntegrationTransferPolicy {
  readonly purpose:
    | "EVIDENCE_HANDOFF"
    | "POST_HIRE_HANDOFF"
    | "INTERVIEW_COORDINATION"
    | "IDENTITY_ADMINISTRATION"
    | "TENANT_PORTABILITY"
    | "HUMAN_APPROVED_DISTRIBUTION";
  readonly piiMode: "OPAQUE_REF_ONLY";
  readonly dsarOwner: "ATS_PLATFORM" | "SOURCE_SYSTEM" | "SHARED_DOCUMENTED";
  readonly retentionOwner:
    | "ATS_PLATFORM"
    | "SOURCE_SYSTEM"
    | "SHARED_DOCUMENTED";
}

export interface IntegrationReliabilityContract {
  readonly cursorModel: "NONE" | "OPAQUE_CURSOR";
  readonly delivery: "AT_LEAST_ONCE" | "REQUEST_RESPONSE";
  readonly tenantScopedIdempotency: true;
  readonly webhookSignatureRequired: boolean;
  readonly replayWindowSeconds: number;
}

export interface IntegrationConnectorCapabilityV1 {
  readonly connectorId: string;
  readonly domain: IntegrationDomain;
  readonly providerRef: string;
  readonly criticalPath: boolean;
  readonly direction: IntegrationDirection;
  readonly operations: readonly IntegrationOperation[];
  readonly authModel:
    | "OAUTH2"
    | "OIDC_SAML_METADATA"
    | "SERVICE_ACCOUNT"
    | "SIGNED_WEBHOOK"
    | "NONE";
  readonly dataClasses: readonly IntegrationDataClass[];
  readonly verificationStatus: IntegrationVerificationStatus;
  readonly apiVerified: boolean;
  readonly activationEvidence?: IntegrationActivationEvidence;
  readonly mutationPolicy: IntegrationMutationPolicy;
  readonly transferPolicy: IntegrationTransferPolicy;
  readonly reliability: IntegrationReliabilityContract;
}

export interface IntegrationEnvelopeV1 {
  readonly schemaVersion: typeof INTEGRATION_ENVELOPE_SCHEMA_VERSION;
  readonly synthetic: true;
  readonly eventId: string;
  readonly tenantRef: string;
  readonly connectorId: string;
  readonly operation: IntegrationOperation;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly payloadDigest: `sha256:${string}`;
  readonly occurredAt: string;
  readonly dataClasses: readonly IntegrationDataClass[];
  readonly cursorRef?: string;
  readonly humanApprovalRef?: string;
}

export interface IntegrationPlatformRegistryV1 {
  readonly schemaVersion: typeof INTEGRATION_PLATFORM_SCHEMA_VERSION;
  readonly activationGate: "PRE_G0_CONTRACT_ONLY";
  readonly connectors: readonly IntegrationConnectorCapabilityV1[];
  readonly syntheticEnvelopes: readonly IntegrationEnvelopeV1[];
}

/** Raw PII, credentials and automated employment decisions cannot enter an envelope. */
export const FORBIDDEN_INTEGRATION_ENVELOPE_FIELDS = [
  "candidateEmail",
  "candidatePhone",
  "candidateName",
  "accessToken",
  "refreshToken",
  "clientSecret",
  "password",
  "decision",
  "rankingScore",
  "candidateRank",
] as const;

export type ForbiddenIntegrationEnvelopeField =
  (typeof FORBIDDEN_INTEGRATION_ENVELOPE_FIELDS)[number];

export type IntegrationEnvelopeWithoutForbiddenFields =
  IntegrationEnvelopeV1 & {
    readonly [K in ForbiddenIntegrationEnvelopeField]?: never;
  };
