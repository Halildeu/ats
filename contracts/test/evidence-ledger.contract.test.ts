import { describe, expect, it } from "vitest";
import type { ActorId, EvidenceId, InterviewId, TenantId } from "../src/types.js";
import type { EvidenceEvent } from "../src/evidence-ledger.js";
import { InMemoryEvidenceLedger } from "../stubs/evidence-ledger.stub.js";

function evt(over: Partial<EvidenceEvent> = {}): EvidenceEvent {
  return {
    tenantId: "t1" as TenantId,
    actorId: "a1" as ActorId,
    interviewId: "iv1" as InterviewId,
    eventType: "INTERVIEW_STARTED",
    occurredAt: "2026-06-29T00:00:00.000Z",
    idempotencyKey: "k1",
    contentHash: "h1",
    ...over,
  };
}

describe("EvidenceLedger contract (WORM append-only)", () => {
  it("append hash-zincirli girdi döner ve zincir bağlanır", () => {
    const l = new InMemoryEvidenceLedger();
    const a = l.append(evt({ idempotencyKey: "k1" }));
    const b = l.append(evt({ idempotencyKey: "k2", eventType: "EVIDENCE_ADDED" }));
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.value.previousHash).toBeNull();
      expect(b.value.previousHash).toBe(a.value.entryHash);
      expect(b.value.sequence).toBe(a.value.sequence + 1);
    }
  });

  it("idempotency: aynı tenant+key replay aynı girdiyi döner", () => {
    const l = new InMemoryEvidenceLedger();
    const a = l.append(evt({ idempotencyKey: "dup" }));
    const b = l.append(evt({ idempotencyKey: "dup" }));
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(b.value.evidenceId).toBe(a.value.evidenceId);
  });

  it("getById tenant-kapsamlı; başka tenant NOT_FOUND (sızdırmaz)", () => {
    const l = new InMemoryEvidenceLedger();
    const a = l.append(evt({ idempotencyKey: "k1" }));
    expect(a.ok).toBe(true);
    if (a.ok) {
      const leak = l.getById("t2" as TenantId, a.value.evidenceId);
      expect(leak.ok).toBe(false);
    }
  });

  it("tombstone append-only event olarak eklenir (silme değil)", () => {
    const l = new InMemoryEvidenceLedger();
    const t = l.appendTombstoneEvent(
      "t1" as TenantId,
      "a1" as ActorId,
      "iv1" as InterviewId,
      "ev-0" as EvidenceId,
      "DSR erasure",
    );
    expect(t.ok).toBe(true);
    if (t.ok) expect(t.value.eventType).toBe("EVIDENCE_TOMBSTONE");
  });

  it("FORBIDDEN yüzey yok: update/delete/overwrite/purge/replace/mutate", () => {
    const l = new InMemoryEvidenceLedger() as unknown as Record<string, unknown>;
    for (const m of ["update", "delete", "overwrite", "purge", "replace", "mutate", "remove"]) {
      expect(typeof l[m]).toBe("undefined");
    }
  });
});
