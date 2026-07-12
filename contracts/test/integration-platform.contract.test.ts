import { describe, expect, it } from "vitest";
import {
  FORBIDDEN_INTEGRATION_ENVELOPE_FIELDS,
  INTEGRATION_ENVELOPE_SCHEMA_VERSION,
  INTEGRATION_PLATFORM_SCHEMA_VERSION,
  type IntegrationConnectorCapabilityV1,
  type IntegrationEnvelopeWithoutForbiddenFields,
} from "../wire/integration-platform.js";

const mutationPolicy = {
  humanApprovalRequired: true,
  idempotencyRequired: true,
  decisionImpact: "NONE",
  destructiveOperations: "DISALLOWED",
  batchApproval: "DISALLOWED",
} as const;

describe("P4 Integration Platform contract", () => {
  it("schema versions explicit and immutable", () => {
    expect(INTEGRATION_PLATFORM_SCHEMA_VERSION).toBe("integration-platform/v1");
    expect(INTEGRATION_ENVELOPE_SCHEMA_VERSION).toBe("integration-envelope/v1");
  });

  it("mutation policy is human-approved, idempotent and decision-free", () => {
    const capability: IntegrationConnectorCapabilityV1 = {
      connectorId: "synthetic-ats-v1",
      domain: "ATS",
      providerRef: "generic-ats",
      criticalPath: true,
      direction: "BIDIRECTIONAL",
      operations: ["pull_candidate_ref", "push_evidence_ref"],
      authModel: "OAUTH2",
      dataClasses: ["opaque_candidate_ref", "evidence_packet_ref"],
      verificationStatus: "UNVERIFIED",
      apiVerified: false,
      mutationPolicy,
      transferPolicy: {
        purpose: "EVIDENCE_HANDOFF",
        piiMode: "OPAQUE_REF_ONLY",
        dsarOwner: "SHARED_DOCUMENTED",
        retentionOwner: "SHARED_DOCUMENTED",
      },
      reliability: {
        cursorModel: "OPAQUE_CURSOR",
        delivery: "AT_LEAST_ONCE",
        tenantScopedIdempotency: true,
        webhookSignatureRequired: false,
        replayWindowSeconds: 0,
      },
    };

    expect(capability.mutationPolicy).toEqual(mutationPolicy);
    expect(capability.apiVerified).toBe(false);
  });

  it("synthetic envelope carries refs and digest, never raw PII/credential/decision", () => {
    const envelope: IntegrationEnvelopeWithoutForbiddenFields = {
      schemaVersion: "integration-envelope/v1",
      synthetic: true,
      eventId: "evt.synthetic.001",
      tenantRef: "tenant.synthetic",
      connectorId: "synthetic-ats-v1",
      operation: "push_evidence_ref",
      correlationId: "corr.synthetic.001",
      idempotencyKey: "tenant.synthetic:push-evidence:001",
      payloadDigest: `sha256:${"a".repeat(64)}`,
      occurredAt: "1970-01-01T00:00:00Z",
      dataClasses: ["evidence_packet_ref"],
      humanApprovalRef: "approval.synthetic.001",
    };

    const record = envelope as unknown as Record<string, unknown>;
    for (const field of FORBIDDEN_INTEGRATION_ENVELOPE_FIELDS) {
      expect(record[field]).toBeUndefined();
    }
  });
});
