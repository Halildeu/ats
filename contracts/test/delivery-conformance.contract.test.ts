import { describe, expect, it } from "vitest";
import {
  DELIVERY_CONFORMANCE_SCHEMA_VERSION,
  FixedClock,
  InMemoryWebhookConformanceStore,
  SyntheticOutboxConformanceHarness,
  SyntheticWebhookVerifier,
  signSyntheticWebhook,
  type SignedSyntheticWebhookV1,
  type SyntheticOutboxMessageV1,
  type SyntheticWebhookEnvelopeV1,
} from "../delivery/delivery-conformance.js";

const KEY = "synthetic-test-key-material-32-bytes-minimum";
const NOW = new Date("2026-07-12T22:00:00.000Z");

function envelope(overrides: Partial<SyntheticWebhookEnvelopeV1> = {}): SyntheticWebhookEnvelopeV1 {
  return {
    schemaVersion: DELIVERY_CONFORMANCE_SCHEMA_VERSION,
    synthetic: true,
    tenantRef: "tenant.synthetic",
    connectorId: "open-portability-v1",
    eventId: "event.synthetic.001",
    idempotencyKey: "tenant.synthetic:webhook:001",
    nonceRef: "nonce.synthetic.001",
    occurredAt: "2026-07-12T21:59:30.000Z",
    payloadDigest: `sha256:${"a".repeat(64)}`,
    dataClasses: ["evidence_packet_ref", "audit_link"],
    ...overrides,
  };
}

function signed(
  value = envelope(),
  overrides: Partial<SignedSyntheticWebhookV1> = {},
): SignedSyntheticWebhookV1 {
  return {
    keyRef: "key.synthetic.webhook.001",
    signature: signSyntheticWebhook(value, KEY),
    envelope: value,
    ...overrides,
  };
}

function verifier(clock = new FixedClock(NOW)): SyntheticWebhookVerifier {
  return new SyntheticWebhookVerifier(clock, new InMemoryWebhookConformanceStore(), {
    replayWindowSeconds: 300,
    maxFutureSkewSeconds: 30,
  });
}

function message(overrides: Partial<SyntheticOutboxMessageV1> = {}): SyntheticOutboxMessageV1 {
  return {
    schemaVersion: DELIVERY_CONFORMANCE_SCHEMA_VERSION,
    synthetic: true,
    tenantRef: "tenant.synthetic",
    connectorId: "open-portability-v1",
    messageId: "message.synthetic.001",
    idempotencyKey: "tenant.synthetic:outbox:001",
    destinationRef: "destination.synthetic.ats",
    payloadDigest: `sha256:${"b".repeat(64)}`,
    dataClasses: ["evidence_packet_ref", "audit_link"],
    createdAt: NOW.toISOString(),
    maxAttempts: 3,
    baseDelaySeconds: 10,
    maxDelaySeconds: 15,
    humanApprovalRef: "approval.synthetic.delivery.001",
    ...overrides,
  };
}

describe("P4.3 signed webhook conformance", () => {
  it("accepts a valid signature, replays the identical request and stores no key value", () => {
    const subject = verifier();
    expect(subject.verify(signed(), KEY)).toMatchObject({ disposition: "ACCEPTED", signatureVerified: true });
    const replay = subject.verify(signed(), KEY);
    expect(replay.disposition).toBe("REPLAYED");
    expect(JSON.stringify(replay)).not.toContain(KEY);
    expect(JSON.stringify(replay)).not.toContain(signed().signature);
  });

  it("same tenant idempotency key with a different canonical request fails closed", () => {
    const subject = verifier();
    subject.verify(signed(), KEY);
    const changed = envelope({ payloadDigest: `sha256:${"c".repeat(64)}` });
    expect(() => subject.verify(signed(changed), KEY)).toThrow("IDEMPOTENCY_DIGEST_CONFLICT");
  });

  it("same nonce under a different idempotency key is rejected", () => {
    const subject = verifier();
    subject.verify(signed(), KEY);
    const changed = envelope({
      eventId: "event.synthetic.002",
      idempotencyKey: "tenant.synthetic:webhook:002",
    });
    expect(() => subject.verify(signed(changed), KEY)).toThrow("NONCE_REPLAY");
  });

  it("binds key reference into the signed canonical request", () => {
    const original = signed();
    const swapped = { ...original, keyRef: "key.synthetic.webhook.002" };
    expect(() => verifier().verify(swapped, KEY)).toThrow("SIGNATURE_INVALID");
  });

  it.each([
    ["bad signature", () => signed(envelope(), { signature: `v1:${"0".repeat(64)}` as `v1=${string}` }), "SIGNATURE_FORMAT_INVALID"],
    ["wrong key", () => signed(), "SIGNATURE_INVALID", "different-synthetic-key-material-32-bytes"],
    ["stale", () => signed(envelope({ occurredAt: "2026-07-12T21:54:59.000Z" })), "WEBHOOK_STALE"],
    ["future", () => signed(envelope({ occurredAt: "2026-07-12T22:00:31.000Z" })), "WEBHOOK_FROM_FUTURE"],
    ["cross tenant key", () => signed(envelope({ tenantRef: "tenant.other" })), "IDEMPOTENCY_NOT_TENANT_SCOPED"],
    ["raw field", () => {
      const value = envelope() as SyntheticWebhookEnvelopeV1 & { candidate_email: string };
      value.candidate_email = "synthetic@example.invalid";
      return signed(value);
    }, "FORBIDDEN_FIELD:candidate_email"],
    ["camel case raw field", () => {
      const value = envelope() as SyntheticWebhookEnvelopeV1 & { candidateEmail: string };
      value.candidateEmail = "synthetic@example.invalid";
      return signed(value);
    }, "FORBIDDEN_FIELD:candidateEmail"],
    ["non synthetic", () => signed(envelope({ synthetic: false as true })), "SYNTHETIC_ONLY"],
    ["unknown data class", () => signed(envelope({ dataClasses: ["candidate_score" as never] })), "DATA_CLASS_FORBIDDEN"],
    ["short key", () => signed(), "HMAC_KEY_TOO_SHORT", "short"],
  ])("fails closed: %s", (_name, makeRequest, code, key = KEY) => {
    expect(() => verifier().verify(makeRequest(), key)).toThrow(code);
  });

  it("tenant-scoped stores do not collide", () => {
    const store = new InMemoryWebhookConformanceStore();
    const subject = new SyntheticWebhookVerifier(new FixedClock(NOW), store, {
      replayWindowSeconds: 300,
      maxFutureSkewSeconds: 30,
    });
    subject.verify(signed(), KEY);
    const other = envelope({
      tenantRef: "tenant.other",
      idempotencyKey: "tenant.other:webhook:001",
    });
    expect(subject.verify(signed(other), KEY).disposition).toBe("ACCEPTED");
  });

  it("reference store atomically rejects duplicate idempotency and nonce keys", () => {
    const store = new InMemoryWebhookConformanceStore();
    const subject = new SyntheticWebhookVerifier(new FixedClock(NOW), store, {
      replayWindowSeconds: 300,
      maxFutureSkewSeconds: 30,
    });
    const receipt = subject.verify(signed(), KEY);
    const accepted = {
      requestDigest: receipt.requestDigest,
      nonceRef: receipt.nonceRef,
      receipt,
    };
    expect(() => store.accept(receipt.tenantRef, receipt.idempotencyKey, accepted)).toThrow(
      "STORE_IDEMPOTENCY_CONFLICT",
    );

    const nonceStore = new InMemoryWebhookConformanceStore();
    nonceStore.accept(receipt.tenantRef, receipt.idempotencyKey, accepted);
    expect(() =>
      nonceStore.accept(receipt.tenantRef, "tenant.synthetic:webhook:other", accepted),
    ).toThrow("STORE_NONCE_CONFLICT");
  });

  it("rejects control characters in canonical idempotency fields", () => {
    const bad = envelope({ idempotencyKey: "tenant.synthetic:webhook\ninjected" });
    expect(() => verifier().verify(signed(bad), KEY)).toThrow("IDEMPOTENCY_KEY_INVALID");
  });
});

describe("P4.3 transactional outbox conformance", () => {
  it("enqueues idempotently and rejects a different digest", () => {
    const harness = new SyntheticOutboxConformanceHarness(new FixedClock(NOW));
    expect(harness.enqueue(message()).disposition).toBe("CREATED");
    expect(harness.enqueue(message()).disposition).toBe("REPLAYED");
    expect(() => harness.enqueue(message({ payloadDigest: `sha256:${"c".repeat(64)}` }))).toThrow(
      "IDEMPOTENCY_DIGEST_CONFLICT",
    );
  });

  it("uses bounded exponential retry and dead-letters after max attempts", () => {
    const clock = new FixedClock(NOW);
    const harness = new SyntheticOutboxConformanceHarness(clock);
    harness.enqueue(message());
    harness.claim("tenant.synthetic", "message.synthetic.001", "worker.synthetic.001");
    let snapshot = harness.recordAttempt("tenant.synthetic", "message.synthetic.001", {
      kind: "TRANSIENT_FAILURE",
      reasonCode: "REMOTE_TIMEOUT",
    });
    expect(snapshot).toMatchObject({ state: "RETRY_SCHEDULED", attemptInCycle: 1, nextAttemptAt: "2026-07-12T22:00:10.000Z" });
    expect(() => harness.claim("tenant.synthetic", "message.synthetic.001", "worker.synthetic.001")).toThrow(
      "OUTBOX_NOT_DUE",
    );

    clock.set(new Date("2026-07-12T22:00:10.000Z"));
    harness.claim("tenant.synthetic", "message.synthetic.001", "worker.synthetic.001");
    snapshot = harness.recordAttempt("tenant.synthetic", "message.synthetic.001", {
      kind: "TRANSIENT_FAILURE",
      reasonCode: "REMOTE_503",
    });
    expect(snapshot.nextAttemptAt).toBe("2026-07-12T22:00:25.000Z");

    clock.set(new Date("2026-07-12T22:00:25.000Z"));
    harness.claim("tenant.synthetic", "message.synthetic.001", "worker.synthetic.001");
    snapshot = harness.recordAttempt("tenant.synthetic", "message.synthetic.001", {
      kind: "TRANSIENT_FAILURE",
      reasonCode: "REMOTE_503",
    });
    expect(snapshot).toMatchObject({ state: "DEAD_LETTER", attemptInCycle: 3, totalAttempts: 3 });
  });

  it("permanent failure dead-letters immediately", () => {
    const harness = new SyntheticOutboxConformanceHarness(new FixedClock(NOW));
    harness.enqueue(message());
    harness.claim("tenant.synthetic", "message.synthetic.001", "worker.synthetic.001");
    expect(
      harness.recordAttempt("tenant.synthetic", "message.synthetic.001", {
        kind: "PERMANENT_FAILURE",
        reasonCode: "REMOTE_4XX",
      }).state,
    ).toBe("DEAD_LETTER");
  });

  it("human-approved redrive resets cycle attempts but retains total attempts and audit lineage", () => {
    const harness = new SyntheticOutboxConformanceHarness(new FixedClock(NOW));
    harness.enqueue(message({ maxAttempts: 1 }));
    harness.claim("tenant.synthetic", "message.synthetic.001", "worker.synthetic.001");
    harness.recordAttempt("tenant.synthetic", "message.synthetic.001", {
      kind: "TRANSIENT_FAILURE",
      reasonCode: "REMOTE_TIMEOUT",
    });
    expect(() => harness.redrive("tenant.synthetic", "message.synthetic.001", "bad", "actor.synthetic.001")).toThrow(
      "HUMAN_APPROVAL_REQUIRED",
    );
    let snapshot = harness.redrive(
      "tenant.synthetic",
      "message.synthetic.001",
      "approval.synthetic.redrive.001",
      "actor.synthetic.001",
    );
    expect(snapshot).toMatchObject({ state: "REDRIVE_PENDING", attemptInCycle: 0, totalAttempts: 1, redriveCount: 1 });
    harness.claim("tenant.synthetic", "message.synthetic.001", "worker.synthetic.001");
    snapshot = harness.recordAttempt("tenant.synthetic", "message.synthetic.001", {
      kind: "SUCCESS",
      receiptRef: "delivery.synthetic.001",
    });
    expect(snapshot).toMatchObject({ state: "DELIVERED", totalAttempts: 2, redriveCount: 1 });
    expect(snapshot.receipts.map((item) => item.event)).toContain("DELIVERY_REDRIVE_APPROVED");
    expect(snapshot.receipts.at(-1)).toMatchObject({ evidenceRef: "delivery.synthetic.001" });
    expect(JSON.stringify(snapshot.receipts)).not.toMatch(/@|candidate_name|secret|token/i);
  });

  it("forbids illegal terminal transitions and cross-tenant reads", () => {
    const harness = new SyntheticOutboxConformanceHarness(new FixedClock(NOW));
    harness.enqueue(message());
    expect(harness.get("tenant.other", "message.synthetic.001")).toBeUndefined();
    expect(() =>
      harness.recordAttempt("tenant.synthetic", "message.synthetic.001", {
        kind: "SUCCESS",
        receiptRef: "delivery.synthetic.001",
      }),
    ).toThrow("OUTBOX_NOT_IN_FLIGHT");
    expect(() =>
      harness.redrive(
        "tenant.synthetic",
        "message.synthetic.001",
        "approval.synthetic.redrive.001",
        "actor.synthetic.001",
      ),
    ).toThrow("OUTBOX_NOT_DEAD_LETTER");

    harness.claim("tenant.synthetic", "message.synthetic.001", "worker.synthetic.001");
    harness.recordAttempt("tenant.synthetic", "message.synthetic.001", {
      kind: "SUCCESS",
      receiptRef: "delivery.synthetic.terminal",
    });
    expect(() =>
      harness.claim("tenant.synthetic", "message.synthetic.001", "worker.synthetic.001"),
    ).toThrow("OUTBOX_NOT_CLAIMABLE");
    expect(() =>
      harness.recordAttempt("tenant.synthetic", "message.synthetic.001", {
        kind: "SUCCESS",
        receiptRef: "delivery.synthetic.again",
      }),
    ).toThrow("OUTBOX_NOT_IN_FLIGHT");
  });

  it.each([
    ["no approval", () => message({ humanApprovalRef: "candidate.synthetic.001" }), "HUMAN_APPROVAL_REQUIRED"],
    ["network URL", () => message({ destinationRef: "https://example.invalid/hook" }), "DESTINATION_REF_INVALID"],
    ["global key", () => message({ idempotencyKey: "global:001" }), "IDEMPOTENCY_NOT_TENANT_SCOPED"],
    ["control character key", () => message({ idempotencyKey: "tenant.synthetic:outbox\ninjected" }), "IDEMPOTENCY_KEY_INVALID"],
    ["too many attempts", () => message({ maxAttempts: 11 }), "MAX_ATTEMPTS_INVALID"],
    ["bad delay", () => message({ baseDelaySeconds: 20, maxDelaySeconds: 10 }), "MAX_DELAY_INVALID"],
    ["decision field", () => {
      const value = message() as SyntheticOutboxMessageV1 & { decision: string };
      value.decision = "reject";
      return value;
    }, "FORBIDDEN_FIELD:decision"],
    ["camel case score field", () => {
      const value = message() as SyntheticOutboxMessageV1 & { rankingScore: number };
      value.rankingScore = 99;
      return value;
    }, "FORBIDDEN_FIELD:rankingScore"],
    ["unknown data class", () => message({ dataClasses: ["candidate_score" as never] }), "DATA_CLASS_FORBIDDEN"],
  ])("enqueue fails closed: %s", (_name, makeMessage, code) => {
    expect(() => new SyntheticOutboxConformanceHarness(new FixedClock(NOW)).enqueue(makeMessage())).toThrow(code);
  });

  it("rejects free-form failure text from audit receipts", () => {
    const harness = new SyntheticOutboxConformanceHarness(new FixedClock(NOW));
    harness.enqueue(message());
    harness.claim("tenant.synthetic", "message.synthetic.001", "worker.synthetic.001");
    expect(() =>
      harness.recordAttempt("tenant.synthetic", "message.synthetic.001", {
        kind: "TRANSIENT_FAILURE",
        reasonCode: "remote said synthetic@example.invalid",
      }),
    ).toThrow("REASON_CODE_INVALID");
  });

  it("allows three approved redrives and rejects the fourth", () => {
    const harness = new SyntheticOutboxConformanceHarness(new FixedClock(NOW));
    harness.enqueue(message({ maxAttempts: 1 }));
    harness.claim("tenant.synthetic", "message.synthetic.001", "worker.synthetic.001");
    harness.recordAttempt("tenant.synthetic", "message.synthetic.001", {
      kind: "TRANSIENT_FAILURE",
      reasonCode: "REMOTE_TIMEOUT",
    });

    for (let cycle = 1; cycle <= 3; cycle += 1) {
      harness.redrive(
        "tenant.synthetic",
        "message.synthetic.001",
        `approval.synthetic.redrive.${cycle}`,
        "actor.synthetic.001",
      );
      harness.claim("tenant.synthetic", "message.synthetic.001", "worker.synthetic.001");
      harness.recordAttempt("tenant.synthetic", "message.synthetic.001", {
        kind: "TRANSIENT_FAILURE",
        reasonCode: "REMOTE_TIMEOUT",
      });
    }

    expect(harness.get("tenant.synthetic", "message.synthetic.001")).toMatchObject({
      state: "DEAD_LETTER",
      redriveCount: 3,
      totalAttempts: 4,
    });
    expect(() =>
      harness.redrive(
        "tenant.synthetic",
        "message.synthetic.001",
        "approval.synthetic.redrive.004",
        "actor.synthetic.001",
      ),
    ).toThrow("REDRIVE_LIMIT_EXHAUSTED");
  });
});
