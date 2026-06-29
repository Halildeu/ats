#!/usr/bin/env node
/**
 * Human-oversight state-machine drift guard (ATS-0004/0005 · Codex 019f13b1 round-2 #3).
 *
 * docs/governance/human-oversight-standard.md:
 *  §1 state tablosu + §2 transition tablosu parse; §3 invariant 1-6:
 *   1. FINALIZED'e tek geçiş + kaynağı HUMAN_RATIONALE_RECORDED.
 *   2. ai-tipi state'ten FINALIZED'e doğrudan geçiş YOK.
 *   3. FINALIZED required-on-entry = human_actor_ref + human_authored_rationale_ref + source_evidence_refs.
 *   4. YASAK state token'ları (AUTO_FINALIZED/AI_APPROVED_FINAL/AUTO_DECISION/AI_FINAL/MODEL_DECIDES) yok.
 *   5. Tüm geçiş uçları tanımlı state.
 *   6. Sentinel state'ler (FINALIZED/HUMAN_RATIONALE_RECORDED/AI_SUGGESTION_REJECTED) mevcut.
 *
 * Bağımsız (npm dep YOK), CI job `human-oversight-guard`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(REPO, "docs/governance/human-oversight-standard.md");

const FORBIDDEN = ["AUTO_FINALIZED", "AI_APPROVED_FINAL", "AUTO_DECISION", "AI_FINAL", "MODEL_DECIDES"];
const SENTINELS = ["FINALIZED", "HUMAN_RATIONALE_RECORDED", "AI_SUGGESTION_REJECTED"];
const FINAL_REQ = ["human_actor_ref", "human_authored_rationale_ref", "source_evidence_refs"];
const TYPES = new Set(["ai", "human", "terminal"]);

const lines = readFileSync(FILE, "utf8").split("\n");
const errors = [];

// §1 states: | **STATE** | anlam | tür | required-on-entry |
const states = new Map();
let section = "";
for (const line of lines) {
  const t = line.trim();
  if (/^##\s/.test(t)) { section = t; continue; }
  if (/^\|\s*\*\*[A-Z_]+\*\*\s*\|/.test(t) && /^##\s*1\./.test(section)) {
    const c = t.split("|").slice(1, -1).map((x) => x.trim());
    if (c.length < 4) { errors.push(`§1 az hücre: ${t.slice(0, 40)}`); continue; }
    const id = c[0].replace(/\*\*/g, "").trim();
    const type = c[2];
    const req = c[3].split(",").map((x) => x.trim()).filter(Boolean);
    if (!TYPES.has(type)) errors.push(`${id}: geçersiz tür "${type}"`);
    states.set(id, { type, req });
  }
}

// §2 transitions: | From | To | koşul |
const transitions = [];
section = "";
for (const line of lines) {
  const t = line.trim();
  if (/^##\s/.test(t)) { section = t; continue; }
  if (!/^##\s*2\./.test(section)) continue;
  if (!/^\|\s*[A-Z_]+\s*\|/.test(t)) continue;
  const c = t.split("|").slice(1, -1).map((x) => x.trim());
  if (c.length < 3) continue;
  if (c[0] === "From") continue; // header
  transitions.push({ from: c[0], to: c[1] });
}

// inv 4: forbidden token taraması (tüm doküman; §0 YASAK-tanım satırı hariç)
lines.forEach((l, i) => {
  if (/YASAK state token/.test(l)) return;
  for (const f of FORBIDDEN) if (l.includes(f)) errors.push(`YASAK state token "${f}" satır ${i + 1}`);
});

// inv 5: geçiş uçları tanımlı
for (const tr of transitions) {
  if (!states.has(tr.from)) errors.push(`tanımsız From state: ${tr.from}`);
  if (!states.has(tr.to)) errors.push(`tanımsız To state: ${tr.to}`);
}

// inv 1: FINALIZED'e tek geçiş + kaynak HUMAN_RATIONALE_RECORDED
const intoFinal = transitions.filter((tr) => tr.to === "FINALIZED");
if (intoFinal.length !== 1) errors.push(`FINALIZED'e tam 1 geçiş olmalı (bulundu ${intoFinal.length})`);
else if (intoFinal[0].from !== "HUMAN_RATIONALE_RECORDED") {
  errors.push(`FINALIZED kaynağı HUMAN_RATIONALE_RECORDED olmalı (bulundu ${intoFinal[0].from})`);
}

// inv 2: ai-tipi → FINALIZED doğrudan yok
for (const tr of intoFinal) {
  if (states.get(tr.from)?.type === "ai") errors.push(`ai-tipi ${tr.from}→FINALIZED doğrudan YASAK`);
}

// inv 3: FINALIZED required-on-entry üç alan
const fin = states.get("FINALIZED");
if (!fin) errors.push("FINALIZED state yok");
else for (const r of FINAL_REQ) if (!fin.req.includes(r)) errors.push(`FINALIZED required-on-entry eksik: ${r}`);

// inv 6: sentinel state'ler
for (const s of SENTINELS) if (!states.has(s)) errors.push(`sentinel state eksik: ${s}`);

if (states.size < 6) errors.push(`beklenenden az state: ${states.size}`);

if (errors.length > 0) {
  console.error("human-oversight drift guard FAILED:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`human-oversight OK — ${states.size} state, ${transitions.length} geçiş; FINALIZED yalnız insan-gerekçesinden + 3 hesap-verebilirlik alanı; otomatik-karar yok.`);
