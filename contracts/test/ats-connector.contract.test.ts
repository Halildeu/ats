import { describe, expect, it } from "vitest";
import type { InterviewId, PacketId, TenantId } from "../src/types.js";
import { GateStubATSConnector } from "../stubs/ats-connector.stub.js";

const ctx = { tenantId: "t1" as TenantId, actorId: "a1" as never };
const packet = {
  packetId: "p1" as PacketId,
  tenantId: "t1" as TenantId,
  interviewId: "iv1" as InterviewId,
};

describe("ATSConnector contract", () => {
  const conn = new GateStubATSConnector();

  it("exportPacket gate'te UNSUPPORTED_IN_GATE (gerçek render yok)", () => {
    const r = conn.exportPacket(ctx, packet, "PDF");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("UNSUPPORTED_IN_GATE");
  });

  it("writeBack default NOT_CONFIGURED (3-koşul yok)", () => {
    const r = conn.writeBack(ctx, packet, { atsName: "demo", externalRef: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("NOT_CONFIGURED");
  });

  it("FORBIDDEN yüzey yok: candidate/job/karar yazımı", () => {
    const c = conn as unknown as Record<string, unknown>;
    const forbidden = [
      "createCandidate",
      "updateCandidate",
      "rejectCandidate",
      "advanceCandidate",
      "writeScore",
      "moveStage",
      "createJob",
    ];
    for (const m of forbidden) expect(typeof c[m]).toBe("undefined");
  });
});
