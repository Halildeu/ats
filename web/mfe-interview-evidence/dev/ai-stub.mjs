#!/usr/bin/env node
/**
 * DEV AI-stub (yalnız lokal; dep'siz): ATS-0017 wire-contract'ının /v1/cite şekli —
 * claim'i AYNEN yankılar; VARSAYILAN supported+seg-0 — 'desteklenmeyen'/'yetersiz' token'lı claim'lerde unsupported/insufficient dalları (UI yollarını lokalde doğrulamak için).
 * PROD'da gerçek self-host ats-ai motoru (Faz 24) bağlanır.
 */
import { createServer } from "node:http";

const PORT = 9452;
createServer(async (req, res) => {
  if (req.url === "/v1/cite" && req.method === "POST") {
    let data = "";
    for await (const c of req) data += c;
    let claim = "";
    try {
      claim = JSON.parse(data).claim ?? "";
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }
    // dev dallari: claim icerigine gore entailment (UI'nin unsupported/insufficient
    // yollarini lokalde dogrulayabilmek icin)
    let entailment = "supported";
    let refs = ["seg-0"];
    if (claim.toLowerCase().includes("desteklenmeyen")) {
      entailment = "unsupported";
      refs = [];
    } else if (claim.toLowerCase().includes("yetersiz")) {
      entailment = "insufficient";
      refs = [];
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ claim, source_segment_refs: refs, entailment }));
    return;
  }
  res.writeHead(404);
  res.end();
}).listen(PORT, "127.0.0.1", () => console.log(`dev ai-stub: http://127.0.0.1:${PORT} (/v1/cite echo)`));
