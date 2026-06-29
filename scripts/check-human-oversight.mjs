#!/usr/bin/env node
/**
 * Human-oversight state-machine drift guard (ATS-0004/0005 · Codex 019f13ed REVISE absorb).
 *
 * docs/governance/human-oversight-standard.md §1 state + §2 transition; §3 invariant 1-8:
 *  1. FINALIZED tek geçiş + kaynak HUMAN_RATIONALE_RECORDED.
 *  2. ai-tipi→FINALIZED doğrudan yok (mermaid/prose gizli geçiş dahil).
 *  3. FINALIZED required 6 alan (actor/role/rationale/evidence/ai-version/outcome).
 *  4. YASAK token (case-insensitive) yok.
 *  5. geçiş uçları tanımlı + bilinmeyen state yasak + state tekil.
 *  6. sentinel state'ler mevcut.
 *  7. terminal çıkışsız; locked yalnız terminal'e (re-open yasak).
 *  8. mermaid/flow + '→ FINALIZED' gizli-geçiş yasak.
 *
 * Bağımsız (npm dep YOK), CI job `human-oversight-guard`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(REPO, "docs/governance/human-oversight-standard.md");

const FORBIDDEN = ["AUTO_FINALIZED", "AI_APPROVED_FINAL", "AUTO_DECISION", "AI_FINAL", "MODEL_DECIDES", "AUTO_APPROVED"];
const SENTINELS = ["FINALIZED", "HUMAN_RATIONALE_RECORDED", "AI_SUGGESTION_REJECTED", "HUMAN_REVIEWED_NO_CHANGE"];
const FINAL_REQ = ["human_actor_ref", "oversight_role_ref", "human_authored_rationale_ref", "source_evidence_refs", "ai_output_version_ref", "decision_outcome_ref"];
const TYPES = new Set(["ai", "human", "locked", "terminal"]);

const text = readFileSync(FILE, "utf8");
const lines = text.split("\n");
const errors = [];

// inv 8: mermaid/flow + gizli FINALIZED geçişi (arrow VE tablo-satırı biçimi)
let finalTableRows = 0;
lines.forEach((l, i) => {
  if (/-->/.test(l)) errors.push(`mermaid geçiş (-->) YASAK satır ${i + 1}`);
  if (/[{}]/.test(l)) errors.push(`flow-style ({}) YASAK satır ${i + 1}`);
  if (/(->|→|-->)\s*FINALIZED/.test(l)) errors.push(`gizli FINALIZED geçişi (arrow) satır ${i + 1}: "${l.trim().slice(0,50)}"`);
  // tablo-satırı biçimi: | STATE | FINALIZED | ... | (doküman-geneli; yalnız §2'deki 1 tane meşru)
  if (/^\|\s*[A-Z_]+\s*\|\s*FINALIZED\s*\|/.test(l.trim())) finalTableRows++;
});
if (finalTableRows !== 1) errors.push(`FINALIZED'e giden tablo-satırı tam 1 olmalı (bulundu ${finalTableRows} — §2 dışı gizli transition?)`);

// inv 4: forbidden token (case-insensitive; yalnız §0 tanım satırı skip)
lines.forEach((l, i) => {
  if (/YASAK state token/.test(l)) return;
  const up = l.toUpperCase();
  for (const f of FORBIDDEN) if (up.includes(f)) errors.push(`YASAK state token "${f}" satır ${i + 1}`);
});

// §1 states
const states = new Map();
let section = "";
for (const line of lines) {
  const t = line.trim();
  if (/^##\s/.test(t)) { section = t; continue; }
  if (/^\|\s*\*\*[A-Z_]+\*\*\s*\|/.test(t) && /^##\s*1\./.test(section)) {
    const c = t.split("|").slice(1, -1).map((x) => x.trim());
    if (c.length < 4) { errors.push(`§1 az hücre: ${t.slice(0, 40)}`); continue; }
    const id = c[0].replace(/\*\*/g, "").trim();
    if (states.has(id)) errors.push(`duplicate state: ${id}`);
    const type = c[2];
    if (!TYPES.has(type)) errors.push(`${id}: geçersiz tür "${type}"`);
    states.set(id, { type, req: c[3].split(",").map((x) => x.trim()).filter(Boolean) });
  }
}

// §2 transitions
const transitions = [];
const trSeen = new Set();
section = "";
for (const line of lines) {
  const t = line.trim();
  if (/^##\s/.test(t)) { section = t; continue; }
  if (!/^##\s*2\./.test(section)) continue;
  if (!/^\|\s*[A-Z_]+\s*\|/.test(t)) continue;
  const c = t.split("|").slice(1, -1).map((x) => x.trim());
  if (c.length < 3 || c[0] === "From") continue;
  const key = `${c[0]}->${c[1]}`;
  if (trSeen.has(key)) errors.push(`duplicate geçiş: ${key}`);
  trSeen.add(key);
  transitions.push({ from: c[0], to: c[1] });
}

// inv 5: uçlar tanımlı
for (const tr of transitions) {
  if (!states.has(tr.from)) errors.push(`tanımsız From state: ${tr.from}`);
  if (!states.has(tr.to)) errors.push(`tanımsız To state: ${tr.to}`);
}

// inv 1
const intoFinal = transitions.filter((tr) => tr.to === "FINALIZED");
if (intoFinal.length !== 1) errors.push(`FINALIZED'e tam 1 geçiş olmalı (bulundu ${intoFinal.length})`);
else if (intoFinal[0].from !== "HUMAN_RATIONALE_RECORDED") errors.push(`FINALIZED kaynağı HUMAN_RATIONALE_RECORDED olmalı (bulundu ${intoFinal[0].from})`);

// inv 2
for (const tr of intoFinal) if (states.get(tr.from)?.type === "ai") errors.push(`ai-tipi ${tr.from}→FINALIZED doğrudan YASAK`);

// inv 3
const fin = states.get("FINALIZED");
if (!fin) errors.push("FINALIZED state yok");
else {
  for (const r of FINAL_REQ) if (!fin.req.includes(r)) errors.push(`FINALIZED required-on-entry eksik: ${r}`);
  if (fin.type !== "locked") errors.push(`FINALIZED tür 'locked' olmalı (bulundu ${fin.type})`);
}

// inv 6
for (const s of SENTINELS) if (!states.has(s)) errors.push(`sentinel state eksik: ${s}`);

// inv 7: terminal çıkışsız; locked yalnız terminal'e
for (const tr of transitions) {
  const ft = states.get(tr.from)?.type, tt = states.get(tr.to)?.type;
  if (ft === "terminal") errors.push(`terminal state çıkış veremez: ${tr.from}→${tr.to}`);
  if (ft === "locked" && tt !== "terminal") errors.push(`locked ${tr.from} yalnız terminal'e geçebilir (re-open yasak): →${tr.to}`);
}

if (states.size < 8) errors.push(`beklenenden az state: ${states.size}`);

if (errors.length > 0) {
  console.error("human-oversight drift guard FAILED:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`human-oversight OK — ${states.size} state, ${transitions.length} geçiş; canonical'de ai→FINALIZED doğrudan geçiş yok, FINALIZED 6 hesap-verebilirlik alanı + re-open yasak (runtime enforcement P1).`);
