import { describe, expect, it } from "vitest";
import { GateStubAIProvider } from "../stubs/ai-provider.stub.js";

describe("AIProvider contract (Faz 24 motoru)", () => {
  const ai = new GateStubAIProvider();

  it("transcribe gate'te fail-closed UNSUPPORTED_IN_GATE (gerçek çıktı üretmez)", () => {
    const r = ai.transcribe("audio://ref");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("UNSUPPORTED_IN_GATE");
  });

  it("cite gate'te fail-closed UNSUPPORTED_IN_GATE", () => {
    const r = ai.cite("aday X dedi", "transcript://ref");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("UNSUPPORTED_IN_GATE");
  });

  it("FORBIDDEN yüzey yok: scoring/affect/auto-decision (ADR-0005)", () => {
    const a = ai as unknown as Record<string, unknown>;
    const forbidden = [
      "score",
      "rank",
      "fit",
      "recommend",
      "compare",
      "sentiment",
      "emotion",
      "affect",
      "reject",
      "autoDecision",
      "autoReject",
    ];
    for (const m of forbidden) expect(typeof a[m]).toBe("undefined");
  });
});
