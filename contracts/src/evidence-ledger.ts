/**
 * ATS-0001 contract #2 — EvidenceLedger (audit / WORM).
 *
 * Append-only. update / delete / overwrite / purge / replace / mutate YOK
 * (ADR-0003 WORM ≠ deletion). Silme ihtiyacı ayrı bir append-only tombstone
 * event'iyle modellenir; ledger'da deletion API'si gibi görünmez.
 * Her giriş hash-zincirlidir (previousHash → entryHash).
 */
import type { ActorId, EvidenceId, InterviewId, JsonObject, Outcome, TenantId } from "./types.js";

/** Append girdisi — tüm alanlar JSON-uyumlu. occurredAt ISO-8601 string (Date değil). */
export interface EvidenceEvent {
  readonly tenantId: TenantId;
  readonly actorId: ActorId;
  readonly interviewId: InterviewId;
  readonly eventType: string;
  /** ISO-8601 UTC, ör. "2026-06-29T00:00:00.000Z". */
  readonly occurredAt: string;
  /** Idempotency natural key (replay-safe append). */
  readonly idempotencyKey: string;
  /** İçeriğin kaynak/bütünlük hash'i (ham içerik ledger'da değil). */
  readonly contentHash: string;
  /** Yalnız JSON-uyumlu (Date/Map/class/function tip seviyesinde imkânsız). */
  readonly payload?: JsonObject;
}

export interface LedgerEntry extends EvidenceEvent {
  readonly evidenceId: EvidenceId;
  readonly sequence: number;
  readonly previousHash: string | null;
  readonly entryHash: string;
}

export interface LedgerListFilter {
  readonly interviewId?: InterviewId;
  readonly eventType?: string;
}

export interface EvidenceLedger {
  /** Yeni olay ekler; hash-zincirli LedgerEntry döner. */
  append(event: EvidenceEvent): Outcome<LedgerEntry>;

  /**
   * Silme yerine append-only tombstone olayı ekler (ADR-0003: unlinkable
   * tombstone; ham içerik retention/erasure ile ayrı silinir, ledger değişmez).
   */
  appendTombstoneEvent(
    tenantId: TenantId,
    actorId: ActorId,
    interviewId: InterviewId,
    targetEvidenceId: EvidenceId,
    reason: string,
  ): Outcome<LedgerEntry>;

  /** Tenant-kapsamlı tekil okuma; başka tenant'ın girdisi NOT_FOUND/DENIED. */
  getById(tenantId: TenantId, id: EvidenceId): Outcome<LedgerEntry>;

  /** Tenant-kapsamlı listeleme. */
  list(tenantId: TenantId, filter?: LedgerListFilter): Outcome<readonly LedgerEntry[]>;
}
