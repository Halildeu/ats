import { describe, expect, it } from "vitest";
import { InMemoryIdentityTenant } from "../stubs/identity-tenant.stub.js";
import { InMemoryEvidenceLedger } from "../stubs/evidence-ledger.stub.js";
import { GateStubAIProvider } from "../stubs/ai-provider.stub.js";
import { GateStubATSConnector } from "../stubs/ats-connector.stub.js";

/**
 * ATS-0001 parity (TS kanonik tarafı) — PARITY.md kanonik yüzeyini kilitler.
 * Java mirror (backend ParityTest) AYNI yüzeyi doğrular → drift tek tarafta bile
 * olsa test kırmızı (Codex WS-3 SoT-drift guard).
 */
function methodsOf(instance: object): string[] {
  const proto = Object.getPrototypeOf(instance);
  return Object.getOwnPropertyNames(proto)
    .filter((n) => n !== "constructor" && typeof (instance as Record<string, unknown>)[n] === "function")
    .sort();
}

const CANONICAL: Record<string, string[]> = {
  IdentityTenant: ["assertTenantScope", "resolveTenant"],
  EvidenceLedger: ["append", "appendTombstoneEvent", "getById", "list"],
  AIProvider: ["cite", "transcribe"],
  ATSConnector: ["exportPacket", "writeBack"],
};

describe("ATS-0001 contract parity (TS ↔ PARITY.md)", () => {
  it("IdentityTenant yüzeyi kanonik", () => {
    expect(methodsOf(new InMemoryIdentityTenant())).toEqual(CANONICAL.IdentityTenant);
  });
  it("EvidenceLedger yüzeyi kanonik", () => {
    expect(methodsOf(new InMemoryEvidenceLedger())).toEqual(CANONICAL.EvidenceLedger);
  });
  it("AIProvider yüzeyi kanonik", () => {
    expect(methodsOf(new GateStubAIProvider())).toEqual(CANONICAL.AIProvider);
  });
  it("ATSConnector yüzeyi kanonik", () => {
    expect(methodsOf(new GateStubATSConnector())).toEqual(CANONICAL.ATSConnector);
  });
});
