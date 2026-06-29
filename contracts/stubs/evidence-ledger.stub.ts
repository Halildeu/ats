/**
 * EvidenceLedger in-memory reference stub — append-only (Codex guardrail #2).
 * update/delete/overwrite/purge API'si VE test-helper'ı YOKTUR. Hash-zincirli.
 */
import { createHash } from "node:crypto";
import type { ActorId, EvidenceId, InterviewId, Outcome, TenantId } from "../src/types.js";
import { fail, ok } from "../src/types.js";
import type {
  EvidenceEvent,
  EvidenceLedger,
  LedgerEntry,
  LedgerListFilter,
} from "../src/evidence-ledger.js";

function hashEntry(previousHash: string | null, event: EvidenceEvent, sequence: number): string {
  const material = JSON.stringify({ previousHash, sequence, event });
  return createHash("sha256").update(material).digest("hex");
}

export class InMemoryEvidenceLedger implements EvidenceLedger {
  // append-only iç depo; dışarıya mutasyon yüzeyi açılmaz.
  readonly #entries: LedgerEntry[] = [];
  #counter = 0;

  append(event: EvidenceEvent): Outcome<LedgerEntry> {
    if (!event.tenantId || !event.idempotencyKey || !event.contentHash) {
      return fail("INVALID", "tenantId / idempotencyKey / contentHash zorunlu");
    }
    // Idempotency: aynı tenant + key varsa mevcut girdiyi döndür (replay-safe).
    const existing = this.#entries.find(
      (e) => e.tenantId === event.tenantId && e.idempotencyKey === event.idempotencyKey,
    );
    if (existing) {
      return ok(existing);
    }
    const last = this.#entries.at(-1);
    const previousHash = last ? last.entryHash : null;
    const sequence = this.#counter++;
    const entry: LedgerEntry = {
      ...event,
      evidenceId: `ev-${sequence}` as EvidenceId,
      sequence,
      previousHash,
      entryHash: hashEntry(previousHash, event, sequence),
    };
    this.#entries.push(entry);
    return ok(entry);
  }

  appendTombstoneEvent(
    tenantId: TenantId,
    actorId: ActorId,
    interviewId: InterviewId,
    targetEvidenceId: EvidenceId,
    reason: string,
  ): Outcome<LedgerEntry> {
    return this.append({
      tenantId,
      actorId,
      interviewId,
      eventType: "EVIDENCE_TOMBSTONE",
      occurredAt: "1970-01-01T00:00:00.000Z",
      idempotencyKey: `tombstone:${targetEvidenceId}`,
      contentHash: createHash("sha256").update(`${targetEvidenceId}:${reason}`).digest("hex"),
      payload: { targetEvidenceId, reason },
    });
  }

  getById(tenantId: TenantId, id: EvidenceId): Outcome<LedgerEntry> {
    const entry = this.#entries.find((e) => e.evidenceId === id);
    if (!entry || entry.tenantId !== tenantId) {
      // Başka tenant'ın girdisi sızdırılmaz (default-deny).
      return fail("NOT_FOUND", "girdi yok veya tenant kapsamı dışı");
    }
    return ok(entry);
  }

  list(tenantId: TenantId, filter?: LedgerListFilter): Outcome<readonly LedgerEntry[]> {
    const out = this.#entries.filter((e) => {
      if (e.tenantId !== tenantId) return false;
      if (filter?.interviewId && e.interviewId !== filter.interviewId) return false;
      if (filter?.eventType && e.eventType !== filter.eventType) return false;
      return true;
    });
    return ok(out);
  }
}
