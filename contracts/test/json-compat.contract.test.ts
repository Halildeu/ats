import { describe, expect, it } from "vitest";
import type { ActorId, InterviewId, TenantId } from "../src/types.js";
import type { EvidenceEvent } from "../src/evidence-ledger.js";
import { InMemoryEvidenceLedger } from "../stubs/evidence-ledger.stub.js";

/**
 * Codex guardrail #3: contract DTO'ları JSON-uyumlu olmalı (Date/Map/class yok)
 * → ileride Java/Python binding üretilebilir. Round-trip eşitliği bunu kanıtlar.
 */
describe("contract DTO JSON-uyumluluğu", () => {
  it("LedgerEntry JSON round-trip eşittir (Date/Map/class yok)", () => {
    const l = new InMemoryEvidenceLedger();
    const event: EvidenceEvent = {
      tenantId: "t1" as TenantId,
      actorId: "a1" as ActorId,
      interviewId: "iv1" as InterviewId,
      eventType: "INTERVIEW_STARTED",
      occurredAt: "2026-06-29T00:00:00.000Z",
      idempotencyKey: "k1",
      contentHash: "h1",
      payload: { note: "n", nested: { a: 1, b: [2, 3] } },
    };
    const r = l.append(event);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const roundTrip = JSON.parse(JSON.stringify(r.value));
      expect(roundTrip).toEqual(r.value);
    }
  });
});
