import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const DELIVERY_CONFORMANCE_SCHEMA_VERSION = "delivery-conformance/v1" as const;

export interface DeterministicClock {
  now(): Date;
}

export class FixedClock implements DeterministicClock {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current.getTime());
  }

  set(value: Date): void {
    this.current = new Date(value.getTime());
  }
}

export type DeliveryDataClass =
  | "opaque_candidate_ref"
  | "interview_ref"
  | "role_ref"
  | "evidence_packet_ref"
  | "audit_link";

export interface SyntheticWebhookEnvelopeV1 {
  readonly schemaVersion: typeof DELIVERY_CONFORMANCE_SCHEMA_VERSION;
  readonly synthetic: true;
  readonly tenantRef: string;
  readonly connectorId: "open-portability-v1";
  readonly eventId: string;
  readonly idempotencyKey: string;
  readonly nonceRef: string;
  readonly occurredAt: string;
  readonly payloadDigest: `sha256:${string}`;
  readonly dataClasses: readonly DeliveryDataClass[];
}

export interface SignedSyntheticWebhookV1 {
  readonly keyRef: string;
  readonly signature: `v1=${string}`;
  readonly envelope: SyntheticWebhookEnvelopeV1;
}

export interface WebhookVerificationReceiptV1 {
  readonly schemaVersion: typeof DELIVERY_CONFORMANCE_SCHEMA_VERSION;
  readonly synthetic: true;
  readonly mode: "WEBHOOK_VERIFY";
  readonly disposition: "ACCEPTED" | "REPLAYED";
  readonly tenantRef: string;
  readonly connectorId: "open-portability-v1";
  readonly eventId: string;
  readonly idempotencyKey: string;
  readonly nonceRef: string;
  readonly payloadDigest: `sha256:${string}`;
  readonly requestDigest: `sha256:${string}`;
  readonly keyRef: string;
  readonly signatureVerified: true;
  readonly verifiedAt: string;
}

interface AcceptedWebhook {
  readonly requestDigest: `sha256:${string}`;
  readonly nonceRef: string;
  readonly receipt: WebhookVerificationReceiptV1;
}

export interface WebhookConformanceStore {
  getByIdempotency(tenantRef: string, idempotencyKey: string): AcceptedWebhook | undefined;
  getByNonce(tenantRef: string, nonceRef: string): AcceptedWebhook | undefined;
  /** Must atomically enforce unique tenant+idempotency and tenant+nonce keys. */
  accept(tenantRef: string, idempotencyKey: string, accepted: AcceptedWebhook): void;
}

export class InMemoryWebhookConformanceStore implements WebhookConformanceStore {
  private byIdempotency = new Map<string, AcceptedWebhook>();
  private byNonce = new Map<string, AcceptedWebhook>();

  getByIdempotency(tenantRef: string, idempotencyKey: string): AcceptedWebhook | undefined {
    return this.byIdempotency.get(`${tenantRef}\u0000${idempotencyKey}`);
  }

  getByNonce(tenantRef: string, nonceRef: string): AcceptedWebhook | undefined {
    return this.byNonce.get(`${tenantRef}\u0000${nonceRef}`);
  }

  accept(tenantRef: string, idempotencyKey: string, accepted: AcceptedWebhook): void {
    const idempotencyIndex = `${tenantRef}\u0000${idempotencyKey}`;
    const nonceIndex = `${tenantRef}\u0000${accepted.nonceRef}`;
    invariant(!this.byIdempotency.has(idempotencyIndex), "STORE_IDEMPOTENCY_CONFLICT");
    invariant(!this.byNonce.has(nonceIndex), "STORE_NONCE_CONFLICT");
    const nextByIdempotency = new Map(this.byIdempotency);
    const nextByNonce = new Map(this.byNonce);
    nextByIdempotency.set(idempotencyIndex, accepted);
    nextByNonce.set(nonceIndex, accepted);
    this.byIdempotency = nextByIdempotency;
    this.byNonce = nextByNonce;
  }
}

const REF = /^[A-Za-z][A-Za-z0-9._:/-]{2,159}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const SIGNATURE = /^v1=([a-f0-9]{64})$/;
const REASON_CODE = /^[A-Z][A-Z0-9_]{2,63}$/;
const ALLOWED_DATA_CLASSES = new Set<DeliveryDataClass>([
  "opaque_candidate_ref",
  "interview_ref",
  "role_ref",
  "evidence_packet_ref",
  "audit_link",
]);
const FORBIDDEN_KEY = /(^|_)(name|email|phone|address|birth|gender|religion|ethnic|health|union|politic|pregnan|cv|resume|decision|status|stage|score|rank|affect|emotion|deception|password|secret|token|credential)($|_)/i;

function invariant(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function digest(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function scanForbiddenKeys(value: unknown): void {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .replace(/[-\s]+/g, "_")
      .toLowerCase();
    invariant(!FORBIDDEN_KEY.test(normalizedKey), `FORBIDDEN_FIELD:${key}`);
    scanForbiddenKeys(child);
  }
}

function canonicalEnvelope(envelope: SyntheticWebhookEnvelopeV1): string {
  return [
    envelope.schemaVersion,
    String(envelope.synthetic),
    envelope.tenantRef,
    envelope.connectorId,
    envelope.eventId,
    envelope.idempotencyKey,
    envelope.nonceRef,
    envelope.occurredAt,
    envelope.payloadDigest,
    [...envelope.dataClasses].sort().join(","),
  ].join("\n");
}

function canonicalWebhook(keyRef: string, envelope: SyntheticWebhookEnvelopeV1): string {
  return `${keyRef}\n${canonicalEnvelope(envelope)}`;
}

/** Synthetic helper. The key value is an argument only and never enters a receipt or store. */
export function signSyntheticWebhook(
  envelope: SyntheticWebhookEnvelopeV1,
  keyValue: string,
  keyRef = "key.synthetic.webhook.001",
): `v1=${string}` {
  invariant(Buffer.byteLength(keyValue, "utf8") >= 32, "HMAC_KEY_TOO_SHORT");
  invariant(keyRef.startsWith("key.") && REF.test(keyRef), "KEY_REF_INVALID");
  return `v1=${createHmac("sha256", keyValue).update(canonicalWebhook(keyRef, envelope), "utf8").digest("hex")}`;
}

export interface WebhookVerifierOptions {
  readonly replayWindowSeconds: number;
  readonly maxFutureSkewSeconds: number;
}

export class SyntheticWebhookVerifier {
  constructor(
    private readonly clock: DeterministicClock,
    private readonly store: WebhookConformanceStore,
    private readonly options: WebhookVerifierOptions,
  ) {
    invariant(options.replayWindowSeconds > 0 && options.replayWindowSeconds <= 86_400, "REPLAY_WINDOW_INVALID");
    invariant(options.maxFutureSkewSeconds >= 0 && options.maxFutureSkewSeconds <= 300, "FUTURE_SKEW_INVALID");
  }

  verify(request: SignedSyntheticWebhookV1, keyValue: string): WebhookVerificationReceiptV1 {
    scanForbiddenKeys(request);
    const envelope = request.envelope;
    invariant(envelope.schemaVersion === DELIVERY_CONFORMANCE_SCHEMA_VERSION, "SCHEMA_VERSION_UNSUPPORTED");
    invariant(envelope.synthetic === true, "SYNTHETIC_ONLY");
    invariant(envelope.connectorId === "open-portability-v1", "CONNECTOR_NOT_ALLOWED");
    for (const value of [envelope.tenantRef, envelope.eventId, envelope.nonceRef, request.keyRef]) {
      invariant(REF.test(value), "REF_INVALID");
    }
    invariant(request.keyRef.startsWith("key."), "KEY_REF_INVALID");
    invariant(envelope.idempotencyKey.startsWith(`${envelope.tenantRef}:`), "IDEMPOTENCY_NOT_TENANT_SCOPED");
    invariant(REF.test(envelope.idempotencyKey), "IDEMPOTENCY_KEY_INVALID");
    invariant(DIGEST.test(envelope.payloadDigest), "PAYLOAD_DIGEST_INVALID");
    invariant(envelope.dataClasses.length > 0, "DATA_CLASS_REQUIRED");
    invariant(new Set(envelope.dataClasses).size === envelope.dataClasses.length, "DATA_CLASS_DUPLICATE");
    invariant(envelope.dataClasses.every((item) => ALLOWED_DATA_CLASSES.has(item)), "DATA_CLASS_FORBIDDEN");

    const occurredAtMs = Date.parse(envelope.occurredAt);
    invariant(Number.isFinite(occurredAtMs) && envelope.occurredAt.endsWith("Z"), "OCCURRED_AT_INVALID");
    const ageMs = this.clock.now().getTime() - occurredAtMs;
    invariant(ageMs <= this.options.replayWindowSeconds * 1_000, "WEBHOOK_STALE");
    invariant(ageMs >= -this.options.maxFutureSkewSeconds * 1_000, "WEBHOOK_FROM_FUTURE");

    const match = SIGNATURE.exec(request.signature);
    invariant(match, "SIGNATURE_FORMAT_INVALID");
    invariant(Buffer.byteLength(keyValue, "utf8") >= 32, "HMAC_KEY_TOO_SHORT");
    const expected = signSyntheticWebhook(envelope, keyValue, request.keyRef).slice(3);
    const actualBytes = Buffer.from(match[1]!, "hex");
    const expectedBytes = Buffer.from(expected, "hex");
    invariant(actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes), "SIGNATURE_INVALID");

    const requestDigest = digest(canonicalWebhook(request.keyRef, envelope));
    const prior = this.store.getByIdempotency(envelope.tenantRef, envelope.idempotencyKey);
    if (prior) {
      invariant(prior.requestDigest === requestDigest, "IDEMPOTENCY_DIGEST_CONFLICT");
      return { ...prior.receipt, disposition: "REPLAYED", verifiedAt: this.clock.now().toISOString() };
    }
    invariant(!this.store.getByNonce(envelope.tenantRef, envelope.nonceRef), "NONCE_REPLAY");

    const receipt: WebhookVerificationReceiptV1 = {
      schemaVersion: DELIVERY_CONFORMANCE_SCHEMA_VERSION,
      synthetic: true,
      mode: "WEBHOOK_VERIFY",
      disposition: "ACCEPTED",
      tenantRef: envelope.tenantRef,
      connectorId: envelope.connectorId,
      eventId: envelope.eventId,
      idempotencyKey: envelope.idempotencyKey,
      nonceRef: envelope.nonceRef,
      payloadDigest: envelope.payloadDigest,
      requestDigest,
      keyRef: request.keyRef,
      signatureVerified: true,
      verifiedAt: this.clock.now().toISOString(),
    };
    this.store.accept(envelope.tenantRef, envelope.idempotencyKey, {
      requestDigest,
      nonceRef: envelope.nonceRef,
      receipt,
    });
    return receipt;
  }
}

export type OutboxState =
  | "PENDING"
  | "IN_FLIGHT"
  | "RETRY_SCHEDULED"
  | "DELIVERED"
  | "DEAD_LETTER"
  | "REDRIVE_PENDING";

export interface SyntheticOutboxMessageV1 {
  readonly schemaVersion: typeof DELIVERY_CONFORMANCE_SCHEMA_VERSION;
  readonly synthetic: true;
  readonly tenantRef: string;
  readonly connectorId: "open-portability-v1";
  readonly messageId: string;
  readonly idempotencyKey: string;
  readonly destinationRef: string;
  readonly payloadDigest: `sha256:${string}`;
  readonly dataClasses: readonly DeliveryDataClass[];
  readonly createdAt: string;
  readonly maxAttempts: number;
  readonly baseDelaySeconds: number;
  readonly maxDelaySeconds: number;
  /** Explicit approval for the initial outbound delivery, separate from redrive approval. */
  readonly humanApprovalRef: string;
}

export type DeliveryAuditEvent =
  | "OUTBOX_ENQUEUED"
  | "OUTBOX_REPLAYED"
  | "DELIVERY_CLAIMED"
  | "DELIVERY_RETRY_SCHEDULED"
  | "DELIVERY_SUCCEEDED"
  | "DELIVERY_DEAD_LETTERED"
  | "DELIVERY_REDRIVE_APPROVED";

export interface DeliveryAuditReceiptV1 {
  readonly schemaVersion: typeof DELIVERY_CONFORMANCE_SCHEMA_VERSION;
  readonly synthetic: true;
  readonly event: DeliveryAuditEvent;
  readonly tenantRef: string;
  readonly messageId: string;
  readonly payloadDigest: `sha256:${string}`;
  readonly state: OutboxState;
  readonly attemptInCycle: number;
  readonly totalAttempts: number;
  readonly redriveCount: number;
  readonly occurredAt: string;
  readonly reasonCode: string;
  readonly actorRef?: string;
  readonly evidenceRef?: string;
}

export interface OutboxSnapshotV1 {
  readonly message: SyntheticOutboxMessageV1;
  readonly state: OutboxState;
  readonly attemptInCycle: number;
  readonly totalAttempts: number;
  readonly redriveCount: number;
  readonly nextAttemptAt: string;
  readonly requestDigest: `sha256:${string}`;
  readonly receipts: readonly DeliveryAuditReceiptV1[];
}

export interface EnqueueReceiptV1 {
  readonly disposition: "CREATED" | "REPLAYED";
  readonly snapshot: OutboxSnapshotV1;
}

export type DeliveryAttemptOutcome =
  | { readonly kind: "SUCCESS"; readonly receiptRef: string }
  | { readonly kind: "TRANSIENT_FAILURE"; readonly reasonCode: string }
  | { readonly kind: "PERMANENT_FAILURE"; readonly reasonCode: string };

function canonicalOutbox(message: SyntheticOutboxMessageV1): string {
  return [
    message.schemaVersion,
    String(message.synthetic),
    message.tenantRef,
    message.connectorId,
    message.messageId,
    message.idempotencyKey,
    message.destinationRef,
    message.payloadDigest,
    [...message.dataClasses].sort().join(","),
    message.createdAt,
    String(message.maxAttempts),
    String(message.baseDelaySeconds),
    String(message.maxDelaySeconds),
    message.humanApprovalRef,
  ].join("\n");
}

function validateOutboxMessage(message: SyntheticOutboxMessageV1): void {
  scanForbiddenKeys(message);
  invariant(message.schemaVersion === DELIVERY_CONFORMANCE_SCHEMA_VERSION, "SCHEMA_VERSION_UNSUPPORTED");
  invariant(message.synthetic === true, "SYNTHETIC_ONLY");
  invariant(message.connectorId === "open-portability-v1", "CONNECTOR_NOT_ALLOWED");
  for (const value of [message.tenantRef, message.messageId, message.destinationRef, message.humanApprovalRef]) {
    invariant(REF.test(value), "REF_INVALID");
  }
  invariant(message.destinationRef.startsWith("destination."), "DESTINATION_REF_INVALID");
  invariant(message.humanApprovalRef.startsWith("approval."), "HUMAN_APPROVAL_REQUIRED");
  invariant(message.idempotencyKey.startsWith(`${message.tenantRef}:`), "IDEMPOTENCY_NOT_TENANT_SCOPED");
  invariant(REF.test(message.idempotencyKey), "IDEMPOTENCY_KEY_INVALID");
  invariant(DIGEST.test(message.payloadDigest), "PAYLOAD_DIGEST_INVALID");
  invariant(message.dataClasses.length > 0, "DATA_CLASS_REQUIRED");
  invariant(new Set(message.dataClasses).size === message.dataClasses.length, "DATA_CLASS_DUPLICATE");
  invariant(message.dataClasses.every((item) => ALLOWED_DATA_CLASSES.has(item)), "DATA_CLASS_FORBIDDEN");
  invariant(Number.isInteger(message.maxAttempts) && message.maxAttempts >= 1 && message.maxAttempts <= 10, "MAX_ATTEMPTS_INVALID");
  invariant(Number.isInteger(message.baseDelaySeconds) && message.baseDelaySeconds >= 1, "BASE_DELAY_INVALID");
  invariant(Number.isInteger(message.maxDelaySeconds) && message.maxDelaySeconds >= message.baseDelaySeconds && message.maxDelaySeconds <= 86_400, "MAX_DELAY_INVALID");
  invariant(Number.isFinite(Date.parse(message.createdAt)) && message.createdAt.endsWith("Z"), "CREATED_AT_INVALID");
}

/**
 * Deterministic state-machine harness. An actual persistence adapter must wrap
 * each public mutation in one transaction; this class does no network I/O.
 */
export class SyntheticOutboxConformanceHarness {
  private snapshots = new Map<string, OutboxSnapshotV1>();
  private idempotency = new Map<string, string>();

  constructor(private readonly clock: DeterministicClock) {}

  enqueue(message: SyntheticOutboxMessageV1): EnqueueReceiptV1 {
    validateOutboxMessage(message);
    const requestDigest = digest(canonicalOutbox(message));
    const idempotencyIndex = `${message.tenantRef}\u0000${message.idempotencyKey}`;
    const priorKey = this.idempotency.get(idempotencyIndex);
    if (priorKey) {
      const prior = this.snapshots.get(priorKey)!;
      invariant(prior.requestDigest === requestDigest, "IDEMPOTENCY_DIGEST_CONFLICT");
      const replayReceipt = this.receipt(prior, "OUTBOX_REPLAYED", "SAME_REQUEST_DIGEST");
      const replayed = { ...prior, receipts: [...prior.receipts, replayReceipt] };
      this.snapshots.set(priorKey, replayed);
      return { disposition: "REPLAYED", snapshot: replayed };
    }

    const key = this.key(message.tenantRef, message.messageId);
    invariant(!this.snapshots.has(key), "MESSAGE_ID_CONFLICT");
    const initial: OutboxSnapshotV1 = {
      message,
      state: "PENDING",
      attemptInCycle: 0,
      totalAttempts: 0,
      redriveCount: 0,
      nextAttemptAt: message.createdAt,
      requestDigest,
      receipts: [],
    };
    const snapshot = {
      ...initial,
      receipts: [this.receipt(initial, "OUTBOX_ENQUEUED", "CREATED")],
    };
    this.snapshots.set(key, snapshot);
    this.idempotency.set(idempotencyIndex, key);
    return { disposition: "CREATED", snapshot };
  }

  claim(tenantRef: string, messageId: string, workerRef: string): OutboxSnapshotV1 {
    invariant(workerRef.startsWith("worker.") && REF.test(workerRef), "WORKER_REF_INVALID");
    const key = this.key(tenantRef, messageId);
    const current = this.required(key);
    invariant(["PENDING", "RETRY_SCHEDULED", "REDRIVE_PENDING"].includes(current.state), "OUTBOX_NOT_CLAIMABLE");
    invariant(this.clock.now().getTime() >= Date.parse(current.nextAttemptAt), "OUTBOX_NOT_DUE");
    const claimed: OutboxSnapshotV1 = { ...current, state: "IN_FLIGHT" };
    const next = {
      ...claimed,
      receipts: [...current.receipts, this.receipt(claimed, "DELIVERY_CLAIMED", "DUE", workerRef)],
    };
    this.snapshots.set(key, next);
    return next;
  }

  recordAttempt(tenantRef: string, messageId: string, outcome: DeliveryAttemptOutcome): OutboxSnapshotV1 {
    scanForbiddenKeys(outcome);
    const key = this.key(tenantRef, messageId);
    const current = this.required(key);
    invariant(current.state === "IN_FLIGHT", "OUTBOX_NOT_IN_FLIGHT");
    const attemptInCycle = current.attemptInCycle + 1;
    const totalAttempts = current.totalAttempts + 1;

    if (outcome.kind === "SUCCESS") {
      invariant(REF.test(outcome.receiptRef) && outcome.receiptRef.startsWith("delivery."), "DELIVERY_RECEIPT_REF_INVALID");
      const delivered: OutboxSnapshotV1 = {
        ...current,
        state: "DELIVERED",
        attemptInCycle,
        totalAttempts,
      };
      return this.save(
        key,
        delivered,
        "DELIVERY_SUCCEEDED",
        "REMOTE_ACCEPTED",
        undefined,
        outcome.receiptRef,
      );
    }

    invariant(REASON_CODE.test(outcome.reasonCode), "REASON_CODE_INVALID");
    const exhausted = attemptInCycle >= current.message.maxAttempts;
    if (outcome.kind === "PERMANENT_FAILURE" || exhausted) {
      const dead: OutboxSnapshotV1 = {
        ...current,
        state: "DEAD_LETTER",
        attemptInCycle,
        totalAttempts,
      };
      return this.save(
        key,
        dead,
        "DELIVERY_DEAD_LETTERED",
        outcome.kind === "PERMANENT_FAILURE" ? outcome.reasonCode : "MAX_ATTEMPTS_EXHAUSTED",
      );
    }

    const delaySeconds = Math.min(
      current.message.baseDelaySeconds * 2 ** (attemptInCycle - 1),
      current.message.maxDelaySeconds,
    );
    const retry: OutboxSnapshotV1 = {
      ...current,
      state: "RETRY_SCHEDULED",
      attemptInCycle,
      totalAttempts,
      nextAttemptAt: new Date(this.clock.now().getTime() + delaySeconds * 1_000).toISOString(),
    };
    return this.save(key, retry, "DELIVERY_RETRY_SCHEDULED", outcome.reasonCode);
  }

  redrive(
    tenantRef: string,
    messageId: string,
    approvalRef: string,
    actorRef: string,
  ): OutboxSnapshotV1 {
    invariant(approvalRef.startsWith("approval.") && REF.test(approvalRef), "HUMAN_APPROVAL_REQUIRED");
    invariant(actorRef.startsWith("actor.") && REF.test(actorRef), "ACTOR_REF_INVALID");
    const key = this.key(tenantRef, messageId);
    const current = this.required(key);
    invariant(current.state === "DEAD_LETTER", "OUTBOX_NOT_DEAD_LETTER");
    invariant(current.redriveCount < 3, "REDRIVE_LIMIT_EXHAUSTED");
    const redrive: OutboxSnapshotV1 = {
      ...current,
      state: "REDRIVE_PENDING",
      attemptInCycle: 0,
      redriveCount: current.redriveCount + 1,
      nextAttemptAt: this.clock.now().toISOString(),
    };
    return this.save(
      key,
      redrive,
      "DELIVERY_REDRIVE_APPROVED",
      "HUMAN_APPROVAL_RECORDED",
      actorRef,
      approvalRef,
    );
  }

  get(tenantRef: string, messageId: string): OutboxSnapshotV1 | undefined {
    return this.snapshots.get(this.key(tenantRef, messageId));
  }

  private key(tenantRef: string, messageId: string): string {
    invariant(REF.test(tenantRef) && REF.test(messageId), "REF_INVALID");
    return `${tenantRef}\u0000${messageId}`;
  }

  private required(key: string): OutboxSnapshotV1 {
    const current = this.snapshots.get(key);
    invariant(current, "OUTBOX_MESSAGE_NOT_FOUND");
    return current;
  }

  private save(
    key: string,
    snapshot: OutboxSnapshotV1,
    event: DeliveryAuditEvent,
    reasonCode: string,
    actorRef?: string,
    evidenceRef?: string,
  ): OutboxSnapshotV1 {
    const next = {
      ...snapshot,
      receipts: [
        ...snapshot.receipts,
        this.receipt(snapshot, event, reasonCode, actorRef, evidenceRef),
      ],
    };
    this.snapshots.set(key, next);
    return next;
  }

  private receipt(
    snapshot: OutboxSnapshotV1,
    event: DeliveryAuditEvent,
    reasonCode: string,
    actorRef?: string,
    evidenceRef?: string,
  ): DeliveryAuditReceiptV1 {
    return {
      schemaVersion: DELIVERY_CONFORMANCE_SCHEMA_VERSION,
      synthetic: true,
      event,
      tenantRef: snapshot.message.tenantRef,
      messageId: snapshot.message.messageId,
      payloadDigest: snapshot.message.payloadDigest,
      state: snapshot.state,
      attemptInCycle: snapshot.attemptInCycle,
      totalAttempts: snapshot.totalAttempts,
      redriveCount: snapshot.redriveCount,
      occurredAt: this.clock.now().toISOString(),
      reasonCode,
      ...(actorRef ? { actorRef } : {}),
      ...(evidenceRef ? { evidenceRef } : {}),
    };
  }
}
