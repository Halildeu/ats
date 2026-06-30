#!/usr/bin/env node
/**
 * Product flow-map drift guard (Codex 019f18ea round-3 #1).
 *
 * docs/product/interview-evidence-flow.md §1 akış tablosu:
 *  - her adım backing en az bir çözülür ref (mevcut repo path / [[ATS-XXXX]]); forbidden+p1_residual dolu.
 *  - sentinel adımlar silinemez.
 *  - hizalama: bahsedilen human-oversight state'leri ilgili doc'ta; event'ler event-taxonomy'de mevcut.
 *  - gömülü self-test.
 *
 * Bağımsız (npm dep YOK), CI job `product-flow-guard`.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(REPO, "docs/product/interview-evidence-flow.md");
const HUMAN_OVERSIGHT = join(REPO, "docs/governance/human-oversight-standard.md");
const EVENT_TAX = join(REPO, "docs/observability/event-taxonomy.md");

const SENTINELS = ["CONSENT_RECORDED", "AI_SUGGESTED_EVIDENCE", "HUMAN_RATIONALE_RECORDED", "FINALIZED", "WITHDRAWN_OR_DSAR"];
const REQ_STATES = ["HUMAN_REVIEWING", "HUMAN_RATIONALE_RECORDED", "FINALIZED"];
const REQ_EVENTS = ["consent.recorded", "evidence.human_decision.finalized", "privacy.dsar.received", "evidence.recording.blocked_no_consent"];

const adrDir = join(REPO, "docs/adr");
const adrFiles = existsSync(adrDir) ? readdirSync(adrDir) : [];
const adrExists = (id) => adrFiles.some((f) => f.startsWith(id));

function parseRows(text) {
  const rows = []; let header = null; let inSec = false;
  for (const line of text.split("\n")) {
    if (/^##\s/.test(line)) { inSec = /^##\s*1\.\s/.test(line); continue; }
    if (!inSec) continue;
    const t = line.trim();
    if (!t.startsWith("|") || /^\|[\s:|-]+\|?$/.test(t)) continue;
    const c = t.split("|").slice(1, -1).map((x) => x.trim());
    if (c[0] === "step") { header = c; continue; }
    rows.push(c.map((x) => x.replace(/\*\*/g, "").trim()));
  }
  return { header, rows };
}

function runChecks(text, humanDoc, eventDoc) {
  const errors = [];
  const { header, rows } = parseRows(text);
  if (!header || header[0] !== "step") errors.push("§1 flow header bulunamadı");
  const seen = new Set();
  for (const r of rows) {
    if (r.length < 5) { errors.push(`az hücre: ${r[0]}`); continue; }
    const [step, , backing, forbidden, p1] = r;
    seen.add(step);
    // backing çözülür ref
    const paths = [...backing.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]).filter((p) => /^(\.\.?\/)/.test(p));
    const adrRefs = [...backing.matchAll(/\[\[(ATS-\d+)\]\]/g)].map((m) => m[1]);
    for (const id of adrRefs) if (!adrExists(id)) errors.push(`${step}: kopuk ADR ref [[${id}]]`);
    const pathOk = paths.some((p) => existsSync(join(REPO, "docs/product", p)));
    if (!pathOk && !adrRefs.some(adrExists)) errors.push(`${step}: backing çözülür ref yok ("${backing}")`);
    if (!forbidden) errors.push(`${step}: forbidden boş`);
    if (!p1) errors.push(`${step}: p1_residual boş`);
  }
  for (const s of SENTINELS) if (!seen.has(s)) errors.push(`sentinel adım eksik: ${s}`);
  // hizalama
  for (const st of REQ_STATES) if (!humanDoc.includes(st)) errors.push(`human-oversight state yok: ${st}`);
  for (const ev of REQ_EVENTS) if (!eventDoc.includes(ev)) errors.push(`event-taxonomy event yok: ${ev}`);
  return errors;
}

function selfTest() {
  const base = readFileSync(FILE, "utf8");
  const human = readFileSync(HUMAN_OVERSIGHT, "utf8");
  const ev = readFileSync(EVENT_TAX, "utf8");
  const mut = (a, b) => base.replace(a, b);
  const cases = [
    ["sentinel-delete", base.replace(/\| \*\*FINALIZED\*\* .*\n/, "")],
    ["empty-forbidden", mut("| otomatik karar / skor / sıralama | gerçek STT/diarization/LLM/citation runtime |", "|  | gerçek STT/diarization/LLM/citation runtime |")],
    ["empty-p1", mut("gerekçe persist (primary-db) |", " |")],
    ["broken-backing", mut("[[ATS-0004]] + [ai-provider](../../contracts/src/ai-provider.ts)", "[[ATS-9999]]")],
  ];
  const failed = [];
  for (const [name, txt] of cases) if (runChecks(txt, human, ev).length === 0) failed.push(name);
  // alignment negatifleri
  if (runChecks(base, "", ev).length === 0) failed.push("missing-human-state");
  if (runChecks(base, human, "").length === 0) failed.push("missing-event");
  return failed;
}

const errors = runChecks(readFileSync(FILE, "utf8"), readFileSync(HUMAN_OVERSIGHT, "utf8"), readFileSync(EVENT_TAX, "utf8"));
for (const n of selfTest()) errors.push(`SELF-TEST kaçtı: ${n}`);

if (errors.length > 0) {
  console.error("product-flow drift guard FAILED:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`product-flow OK — ${SENTINELS.length} sentinel adım; backing çözülür + forbidden/p1 dolu; human-oversight + event-taxonomy hizalı; self-test 6 negatif vektör fail ediyor.`);
