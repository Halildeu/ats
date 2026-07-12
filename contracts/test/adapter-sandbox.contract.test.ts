import { describe, expect, it } from "vitest";
import {
  ADAPTER_SANDBOX_SCHEMA_VERSION,
  AdapterSandboxRegistry,
  adapterPolicy,
  type AdapterConfigurationRequestV1,
  type AdapterKind,
  type AdapterOperationRequestV1,
  type AdapterSandboxConfigV1,
} from "../adapters/adapter-sandbox.js";

const NOW = "2026-07-13T00:00:00.000Z";

function config(kind: AdapterKind, tenantRef = "tenant.synthetic"): AdapterSandboxConfigV1 {
  const policy = adapterPolicy(kind);
  return {
    schemaVersion: ADAPTER_SANDBOX_SCHEMA_VERSION,
    synthetic: true,
    tenantRef,
    adapterId: `adapter.synthetic.${kind.toLowerCase()}`,
    kind,
    providerRef: `provider.synthetic.${kind.toLowerCase()}`,
    standards: policy.standards,
    operations: policy.operations,
    allowedScopes: policy.scopes,
    dataClasses: policy.dataClasses,
    authProfile: policy.authProfile,
    apiVerified: false,
    activationGate: "PRE_G0_CONFORMANCE_ONLY",
  };
}

function discover(registry: AdapterSandboxRegistry, value: AdapterSandboxConfigV1): void {
  registry.register(value, NOW);
  registry.discover({
    schemaVersion: ADAPTER_SANDBOX_SCHEMA_VERSION,
    synthetic: true,
    tenantRef: value.tenantRef,
    adapterId: value.adapterId,
    metadataRef: `metadata.synthetic.${value.kind.toLowerCase()}`,
    observedStandards: value.standards,
    discoveredAt: NOW,
  });
}

function configuration(
  value: AdapterSandboxConfigV1,
  overrides: Partial<AdapterConfigurationRequestV1> = {},
): AdapterConfigurationRequestV1 {
  const metadataOnly = value.kind === "OIDC_METADATA";
  return {
    schemaVersion: ADAPTER_SANDBOX_SCHEMA_VERSION,
    synthetic: true,
    tenantRef: value.tenantRef,
    adapterId: value.adapterId,
    idempotencyKey: `${value.tenantRef}:configure:${value.adapterId}`,
    requestedScopes: metadataOnly ? [] : value.allowedScopes,
    ...(metadataOnly ? {} : { secretRef: `secret.synthetic.${value.kind.toLowerCase()}` }),
    humanApprovalRef: `approval.synthetic.${value.kind.toLowerCase()}`,
    configuredAt: NOW,
    ...overrides,
  };
}

function setup(kind: AdapterKind): {
  registry: AdapterSandboxRegistry;
  value: AdapterSandboxConfigV1;
} {
  const registry = new AdapterSandboxRegistry();
  const value = config(kind);
  discover(registry, value);
  registry.configure(configuration(value));
  return { registry, value };
}

function operation(
  value: AdapterSandboxConfigV1,
  overrides: Partial<AdapterOperationRequestV1> = {},
): AdapterOperationRequestV1 {
  const op = value.operations[0]!;
  const references =
    op === "verify_sso_metadata" || op.includes("user")
      ? [{ dataClass: "identity_admin_ref" as const, ref: "identity.synthetic.001" }]
      : op === "pull_availability_ref" || op === "propose_interview_slot"
        ? [
            { dataClass: "interview_ref" as const, ref: "interview.synthetic.001" },
            { dataClass: "availability_window" as const, ref: "availability.synthetic.001" },
          ]
        : op === "send_human_approved_invite"
          ? [{ dataClass: "interview_ref" as const, ref: "interview.synthetic.001" }]
          : [
              { dataClass: "interview_ref" as const, ref: "interview.synthetic.001" },
              { dataClass: "audit_link" as const, ref: "audit.synthetic.001" },
            ];
  const mutating = op !== "verify_sso_metadata" && op !== "pull_availability_ref";
  return {
    schemaVersion: ADAPTER_SANDBOX_SCHEMA_VERSION,
    synthetic: true,
    tenantRef: value.tenantRef,
    adapterId: value.adapterId,
    operation: op,
    idempotencyKey: `${value.tenantRef}:operation:${op}`,
    payloadDigest: `sha256:${"a".repeat(64)}`,
    references,
    ...(mutating ? { humanApprovalRef: "approval.synthetic.operation.001" } : {}),
    occurredAt: NOW,
    ...overrides,
  };
}

describe("P4.4 adapter sandbox profiles", () => {
  it.each(["OIDC_METADATA", "SCIM", "CALENDAR", "EMAIL"] as const)(
    "%s registers, discovers and configures without VERIFIED or provider call",
    (kind) => {
      const registry = new AdapterSandboxRegistry();
      const value = config(kind);
      const registered = registry.register(value, NOW);
      expect(registered.state).toBe("NOT_CONFIGURED");

      const receipt = registry.discover({
        schemaVersion: ADAPTER_SANDBOX_SCHEMA_VERSION,
        synthetic: true,
        tenantRef: value.tenantRef,
        adapterId: value.adapterId,
        metadataRef: `metadata.synthetic.${kind.toLowerCase()}`,
        observedStandards: value.standards,
        discoveredAt: NOW,
      });
      expect(receipt).toMatchObject({
        state: "DISCOVERED",
        verificationStatus: "UNVERIFIED",
        apiVerified: false,
        providerCallMade: false,
      });

      const configured = registry.configure(configuration(value));
      expect(configured).toMatchObject({
        disposition: "CONFIGURED",
        verificationStatus: "UNVERIFIED",
        apiVerified: false,
        providerCallMade: false,
      });
      expect(JSON.stringify(registry.get(value.tenantRef, value.adapterId))).not.toContain(
        `secret.synthetic.${kind.toLowerCase()}`,
      );
    },
  );

  it("records an explicit discovery failure and supports a later synthetic retry", () => {
    const registry = new AdapterSandboxRegistry();
    const value = config("SCIM");
    registry.register(value, NOW);
    expect(
      registry.recordDiscoveryFailure({
        schemaVersion: ADAPTER_SANDBOX_SCHEMA_VERSION,
        synthetic: true,
        tenantRef: value.tenantRef,
        adapterId: value.adapterId,
        evidenceRef: "evidence.synthetic.discovery.001",
        reasonCode: "METADATA_MISSING",
        occurredAt: NOW,
      }).state,
    ).toBe("DISCOVERY_BLOCKED");
    expect(
      registry.discover({
        schemaVersion: ADAPTER_SANDBOX_SCHEMA_VERSION,
        synthetic: true,
        tenantRef: value.tenantRef,
        adapterId: value.adapterId,
        metadataRef: "metadata.synthetic.scim",
        observedStandards: value.standards,
        discoveredAt: NOW,
      }).state,
    ).toBe("DISCOVERED");
  });

  it.each([
    ["standards widened", () => ({ ...config("SCIM"), standards: [...config("SCIM").standards, "RFC5545"] }), "STANDARD_PROFILE_MISMATCH"],
    ["operations widened", () => ({ ...config("SCIM"), operations: [...config("SCIM").operations, "send_human_approved_notification"] }), "OPERATION_PROFILE_MISMATCH"],
    ["scopes widened", () => ({ ...config("SCIM"), allowedScopes: [...config("SCIM").allowedScopes, "mail.notification.send"] }), "SCOPE_PROFILE_MISMATCH"],
    ["data widened", () => ({ ...config("SCIM"), dataClasses: [...config("SCIM").dataClasses, "interview_ref"] }), "DATA_CLASS_PROFILE_MISMATCH"],
    ["api verified", () => ({ ...config("SCIM"), apiVerified: true }), "API_VERIFIED_PRE_G0_FORBIDDEN"],
    ["raw secret", () => ({ ...config("SCIM"), clientSecret: "not-a-real-secret" }), "FORBIDDEN_FIELD:clientSecret"],
    ["decision field", () => ({ ...config("SCIM"), rankingScore: 90 }), "FORBIDDEN_FIELD:rankingScore"],
    ["unknown field", () => ({ ...config("SCIM"), endpointUrl: "https://example.invalid" }), "CONFIG_UNKNOWN_FIELD:endpointUrl"],
  ])("config fails closed: %s", (_name, makeConfig, code) => {
    expect(() => new AdapterSandboxRegistry().register(makeConfig() as AdapterSandboxConfigV1, NOW)).toThrow(code);
  });

  it("enforces metadata-only OIDC and secret-reference-only credential adapters", () => {
    const oidc = new AdapterSandboxRegistry();
    const oidcConfig = config("OIDC_METADATA");
    discover(oidc, oidcConfig);
    expect(() =>
      oidc.configure(configuration(oidcConfig, { secretRef: "secret.synthetic.oidc" })),
    ).toThrow("SECRET_REF_NOT_ALLOWED");

    const scim = new AdapterSandboxRegistry();
    const scimConfig = config("SCIM");
    discover(scim, scimConfig);
    const withoutSecret = configuration(scimConfig) as AdapterConfigurationRequestV1 & {
      secretRef?: string;
    };
    delete withoutSecret.secretRef;
    expect(() => scim.configure(withoutSecret)).toThrow("SECRET_REFERENCE_REQUIRED");
  });

  it("supports least-privilege calendar read while denying invite without send scope", () => {
    const registry = new AdapterSandboxRegistry();
    const value = config("CALENDAR");
    discover(registry, value);
    registry.configure(
      configuration(value, { requestedScopes: ["calendar.availability.read"] }),
    );
    expect(
      registry.execute(
        operation(value, { operation: "pull_availability_ref" }),
      ).disposition,
    ).toBe("SYNTHETIC_ACCEPTED");
    expect(() =>
      registry.execute(
        operation(value, {
          operation: "send_human_approved_invite",
          idempotencyKey: "tenant.synthetic:operation:invite",
          references: [
            { dataClass: "interview_ref", ref: "interview.synthetic.001" },
          ],
          humanApprovalRef: "approval.synthetic.invite.001",
        }),
      ),
    ).toThrow("REQUIRED_SCOPE_MISSING");
  });

  it("replays identical configuration with an audit receipt", () => {
    const registry = new AdapterSandboxRegistry();
    const value = config("SCIM");
    discover(registry, value);
    const request = configuration(value);
    expect(registry.configure(request).disposition).toBe("CONFIGURED");
    expect(registry.configure(request).disposition).toBe("REPLAYED");
    expect(
      registry.get(value.tenantRef, value.adapterId)?.audits.map((item) => item.event),
    ).toContain("CONFIGURATION_REPLAYED");
  });

  it("rejects wildcard scope before generic subset validation", () => {
    const registry = new AdapterSandboxRegistry();
    const value = config("SCIM");
    discover(registry, value);
    expect(() =>
      registry.configure(
        configuration(value, {
          requestedScopes: ["*" as never],
        }),
      ),
    ).toThrow("WILDCARD_SCOPE_FORBIDDEN");
  });

  it("defensively clones registered config and returned snapshots", () => {
    const registry = new AdapterSandboxRegistry();
    const value = config("SCIM");
    const registered = registry.register(value, NOW);
    (value.operations as AdapterSandboxConfigV1["operations"] & string[]).push(
      "send_human_approved_notification",
    );
    (registered.config.operations as AdapterSandboxConfigV1["operations"] & string[]).push(
      "send_human_approved_notification",
    );
    expect(registry.get("tenant.synthetic", "adapter.synthetic.scim")?.config.operations).toEqual([
      "provision_human_approved_user",
      "deprovision_human_approved_user",
    ]);
  });

  it("returns isolated adapter policy copies", () => {
    const first = adapterPolicy("SCIM");
    (first.scopes as typeof first.scopes & string[]).push("mail.notification.send");
    expect(adapterPolicy("SCIM").scopes).toEqual(["scim.user.lifecycle.write"]);
  });

  it("rejects configuration before discovery", () => {
    const registry = new AdapterSandboxRegistry();
    const value = config("SCIM");
    registry.register(value, NOW);
    expect(() => registry.configure(configuration(value))).toThrow(
      "CONFIGURATION_STATE_INVALID",
    );
  });

  it("rejects rediscovery after configuration", () => {
    const { registry, value } = setup("SCIM");
    expect(() =>
      registry.discover({
        schemaVersion: ADAPTER_SANDBOX_SCHEMA_VERSION,
        synthetic: true,
        tenantRef: value.tenantRef,
        adapterId: value.adapterId,
        metadataRef: "metadata.synthetic.scim.again",
        observedStandards: value.standards,
        discoveredAt: NOW,
      }),
    ).toThrow("DISCOVERY_STATE_INVALID");
  });

  it("rejects a different config under the same tenant and adapter id", () => {
    const registry = new AdapterSandboxRegistry();
    const value = config("SCIM");
    registry.register(value, NOW);
    expect(() =>
      registry.register({ ...value, providerRef: "provider.synthetic.changed" }, NOW),
    ).toThrow("ADAPTER_CONFIG_CONFLICT");
  });
});

describe("P4.4 adapter operation and revocation invariants", () => {
  it.each(["OIDC_METADATA", "SCIM", "CALENDAR", "EMAIL"] as const)(
    "%s accepts only synthetic operation and replays identical idempotency",
    (kind) => {
      const { registry, value } = setup(kind);
      const request = operation(value);
      const first = registry.execute(request);
      expect(first).toMatchObject({
        disposition: "SYNTHETIC_ACCEPTED",
        verificationStatus: "UNVERIFIED",
        apiVerified: false,
        providerCallMade: false,
      });
      expect(registry.execute(request).disposition).toBe("REPLAYED");
      expect(
        registry
          .get(value.tenantRef, value.adapterId)
          ?.audits.map((item) => item.event),
      ).toContain("OPERATION_REPLAYED");
      expect(() =>
        registry.execute({
          ...request,
          payloadDigest: `sha256:${"b".repeat(64)}`,
        }),
      ).toThrow("IDEMPOTENCY_DIGEST_CONFLICT");
    },
  );

  it("requires human approval for mutations and forbids it on reads", () => {
    const scim = setup("SCIM");
    const mutation = operation(scim.value);
    const withoutApproval = { ...mutation } as AdapterOperationRequestV1 & {
      humanApprovalRef?: string;
    };
    delete withoutApproval.humanApprovalRef;
    expect(() => scim.registry.execute(withoutApproval)).toThrow("HUMAN_APPROVAL_REQUIRED");

    const oidc = setup("OIDC_METADATA");
    expect(() =>
      oidc.registry.execute(
        operation(oidc.value, { humanApprovalRef: "approval.synthetic.unexpected" }),
      ),
    ).toThrow("UNEXPECTED_HUMAN_APPROVAL");
  });

  it("revocation deletes the credential reference and hard-denies later execution", () => {
    const { registry, value } = setup("EMAIL");
    expect(registry.hasCredentialReference(value.tenantRef, value.adapterId)).toBe(true);
    const revocation = {
      schemaVersion: ADAPTER_SANDBOX_SCHEMA_VERSION,
      synthetic: true as const,
      tenantRef: value.tenantRef,
      adapterId: value.adapterId,
      humanApprovalRef: "approval.synthetic.revoke.001",
      reasonCode: "CREDENTIAL_ROTATION" as const,
      revokedAt: "2026-07-13T00:01:00.000Z",
    };
    expect(registry.revoke(revocation).state).toBe("REVOKED");
    expect(registry.hasCredentialReference(value.tenantRef, value.adapterId)).toBe(false);
    expect(() => registry.execute(operation(value))).toThrow("ADAPTER_REVOKED");
    expect(() => registry.configure(configuration(value))).toThrow("ADAPTER_REVOKED");
    expect(() => registry.revoke(revocation)).toThrow("REVOCATION_STATE_INVALID");
    expect(registry.register(value, NOW).state).toBe("REVOKED");
    expect(() =>
      registry.discover({
        schemaVersion: ADAPTER_SANDBOX_SCHEMA_VERSION,
        synthetic: true,
        tenantRef: value.tenantRef,
        adapterId: value.adapterId,
        metadataRef: "metadata.synthetic.reactivate",
        observedStandards: value.standards,
        discoveredAt: NOW,
      }),
    ).toThrow("DISCOVERY_STATE_INVALID");
  });

  it("rejects arbitrary runtime revocation reasons", () => {
    const { registry, value } = setup("SCIM");
    expect(() =>
      registry.revoke({
        schemaVersion: ADAPTER_SANDBOX_SCHEMA_VERSION,
        synthetic: true,
        tenantRef: value.tenantRef,
        adapterId: value.adapterId,
        humanApprovalRef: "approval.synthetic.revoke.002",
        reasonCode: "ARBITRARY_REASON" as never,
        revokedAt: "2026-07-13T00:01:00.000Z",
      }),
    ).toThrow("REVOCATION_REASON_INVALID");
  });

  it("tenant isolation prevents cross-tenant lookup and execution", () => {
    const { registry, value } = setup("SCIM");
    expect(registry.get("tenant.other", value.adapterId)).toBeUndefined();
    expect(() =>
      registry.execute(
        operation(value, {
          tenantRef: "tenant.other",
          idempotencyKey: "tenant.other:operation:scim",
        }),
      ),
    ).toThrow("ADAPTER_NOT_FOUND");
  });

  it.each([
    ["raw PII", { candidateEmail: "synthetic@example.invalid" }, "FORBIDDEN_FIELD:candidateEmail"],
    ["decision score", { rankingScore: 100 }, "FORBIDDEN_FIELD:rankingScore"],
    ["unmapped field", { rawPayload: "x" }, "OPERATION_UNKNOWN_FIELD:rawPayload"],
    ["global idempotency", { idempotencyKey: "global:001" }, "IDEMPOTENCY_NOT_TENANT_SCOPED"],
    ["bad ref", { references: [{ dataClass: "identity_admin_ref", ref: "person@example.invalid" }] }, "OPAQUE_REFERENCE_INVALID"],
    ["wrong data class", { references: [{ dataClass: "interview_ref", ref: "interview.synthetic.001" }] }, "REFERENCE_PROFILE_MISMATCH"],
    ["non synthetic", { synthetic: false }, "SYNTHETIC_ONLY"],
  ])("operation fails closed: %s", (_name, overrides, code) => {
    const { registry, value } = setup("SCIM");
    expect(() =>
      registry.execute({ ...operation(value), ...overrides } as AdapterOperationRequestV1),
    ).toThrow(code);
  });

  it("audit and receipts carry refs/digests only, never credential value or VERIFIED", () => {
    const { registry, value } = setup("SCIM");
    registry.execute(operation(value));
    const serialized = JSON.stringify(registry.get(value.tenantRef, value.adapterId));
    expect(serialized).not.toContain("secret.synthetic.scim");
    expect(serialized).not.toContain('"VERIFIED"');
    expect(serialized).not.toMatch(/"(accessToken|refreshToken|clientSecret)"\s*:|@/);
    expect(serialized).toContain('"providerCallMade":false');
  });
});
