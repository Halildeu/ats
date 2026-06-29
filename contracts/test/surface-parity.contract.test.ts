/**
 * ATS-0001 contract-surface drift guard (TS canonical tarafı).
 *
 * `tools/extract-surface.ts` TS sözleşme kaynağından tam yüzeyi (metot param/return
 * tipleri + DTO alan tipleri + enum üyeleri) çıkarır. Bu test re-extract edip
 * committed `contract-surface.json` ile **deep-equal** karşılaştırır:
 *   - TS kaynağında herhangi bir tip/DTO/enum değişikliği → snapshot eşleşmez → KIRMIZI
 *     (bilinçli `npm run surface:gen` ile güncelleme zorunlu).
 *   - Aynı `contract-surface.json` Java tarafında `SurfaceParityTest` ile de
 *     karşılaştırılır → iki dilin yüzeyi tek kaynağa kilitlenir (codegen-grade parity).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { extractSurface, surfaceToTokens, type Surface } from "../tools/extract-surface.js";

const canonicalPath = fileURLToPath(new URL("../contract-surface.json", import.meta.url));
const canonical = JSON.parse(readFileSync(canonicalPath, "utf8")) as Surface;
const tokensPath = fileURLToPath(new URL("../contract-surface.tokens.txt", import.meta.url));
const committedTokens = readFileSync(tokensPath, "utf8").trim().split("\n");

describe("contract-surface parity (TS canonical)", () => {
  it("extracted surface deep-equals committed contract-surface.json", () => {
    const actual = extractSurface();
    expect(actual).toEqual(canonical);
  });

  it("locks the 4 contracts, 10 DTOs and 2 named enums", () => {
    expect(Object.keys(canonical.contracts).sort()).toEqual([
      "AIProvider",
      "ATSConnector",
      "EvidenceLedger",
      "IdentityTenant",
    ]);
    expect(Object.keys(canonical.dtos).length).toBe(10);
    expect(Object.keys(canonical.enums).sort()).toEqual(["ExportTarget", "OutcomeCode"]);
  });

  it("committed token projection matches regenerated (cross-language source of truth)", () => {
    expect(committedTokens).toEqual(surfaceToTokens(extractSurface()));
  });

  it("WORM/forbidden surface stays absent from the snapshot (defense-in-depth)", () => {
    const forbidden = /score|rank|fit|recommend|compare|sentiment|emotion|affect|reject|autoDecision|autoReject|update|delete|overwrite|purge|replace|remove/i;
    const methodNames = Object.values(canonical.contracts)
      .flat()
      .map((m) => m.name);
    for (const name of methodNames) {
      expect(name).not.toMatch(forbidden);
    }
  });
});
