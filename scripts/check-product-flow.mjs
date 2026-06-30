#!/usr/bin/env node
/**
 * Product flow-map drift guard (Codex 019f1918 REVISE absorb).
 *
 * docs/product/interview-evidence-flow.md §1:
 *  - backing'deki TÜM markdown-link path + [[ATS-XXXX]] ref MEVCUT (tek ölü-link fail); ≥1 anchor.
 *  - forbidden + p1_residual dolu; adım tekil; sentinel adımlar silinemez.
 *  - token hizalama: `ns.x` event token'ı event-taxonomy §2'de **token** olarak; (STATE) token'ı
 *    human-oversight §1'de **STATE** olarak BİREBİR (typo yakalanır).
 *  - gömülü self-test.
 *
 * Bağımsız (npm dep YOK), CI job `product-flow-guard`.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(REPO, "docs/product/interview-evidence-flow.md");
const HUMAN = join(REPO, "docs/governance/human-oversight-standard.md");
const EVENTS = join(REPO, "docs/observability/event-taxonomy.md");

const SENTINELS = ["AI_ASSISTANCE_DISCLOSED", "CONSENT_RECORDED", "AI_CITED_CLAIMS", "HUMAN_RATIONALE_RECORDED", "FINALIZED", "ERASURE_EXECUTED", "DSAR_RECEIVED", "RETENTION_PURGED"];
const EVENT_NS = /^(consent|evidence|privacy|security|ai_pipeline|auth|authz|admin|connector|system)\.[a-z0-9_]+(\.[a-z0-9_]+)*$/;
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
    if (seen.has(step)) errors.push(`duplicate adım: ${step}`);
    seen.add(step);
    // TÜM markdown-link path mevcut
    const paths = [...backing.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]).filter((p) => /^(\.\.?\/)/.test(p));
    for (const p of paths) if (!existsSync(join(REPO, "docs/product", p))) errors.push(`${step}: ölü backing link "${p}"`);
    const adrRefs = [...backing.matchAll(/\[\[(ATS-\d+)\]\]/g)].map((m) => m[1]);
    for (const id of adrRefs) if (!adrExists(id)) errors.push(`${step}: kopuk ADR ref [[${id}]]`);
    if (paths.length === 0 && adrRefs.length === 0) errors.push(`${step}: çözülür anchor yok`);
    if (!forbidden) errors.push(`${step}: forbidden boş`);
    if (!p1) errors.push(`${step}: p1_residual boş`);
    // event token'ları taksonomide
    for (const m of backing.matchAll(/`([^`]+)`/g)) {
      const tok = m[1];
      if (EVENT_NS.test(tok) && !eventDoc.includes(`**${tok}**`)) errors.push(`${step}: event "${tok}" event-taxonomy §2'de yok (typo?)`);
    }
    // state token'ları human-oversight'ta
    for (const m of backing.matchAll(/\(([A-Z][A-Z_]{3,})\)/g)) {
      const st = m[1];
      if (!humanDoc.includes(`**${st}**`)) errors.push(`${step}: state "${st}" human-oversight §1'de yok (typo?)`);
    }
  }
  for (const s of SENTINELS) if (!seen.has(s)) errors.push(`sentinel adım eksik: ${s}`);
  return errors;
}

function selfTest() {
  const base = readFileSync(FILE, "utf8");
  const human = readFileSync(HUMAN, "utf8");
  const ev = readFileSync(EVENTS, "utf8");
  const mut = (a, b) => base.replace(a, b);
  const cases = [
    ["sentinel-delete", base.replace(/\| \*\*FINALIZED\*\* .*\n/, "")],
    ["empty-forbidden", mut("| otomatik karar / skor / sıralama | LLM citation/entailment runtime |", "|  | LLM citation/entailment runtime |")],
    ["empty-p1", mut("gerekçe persist (primary-db) |", " |")],
    ["broken-adr", mut("| **AI_CITED_CLAIMS** | sistem | [[ATS-0004]]", "| **AI_CITED_CLAIMS** | sistem | [[ATS-9999]]")],
    ["dead-path-alongside-valid", mut("[human-oversight](../governance/human-oversight-standard.md) (FINALIZED)", "[human-oversight](../governance/human-oversight-standard.md) [x](../nope/zzz.md) (FINALIZED)")],
    ["typo-event", mut("event `consent.recorded`", "event `consent.recroded`")],
    ["typo-state", mut("(HUMAN_REVIEWING)", "(HUMAN_REVIEWINGX)")],
    ["duplicate-step", mut("| **RETENTION_PURGED**", "| **FINALIZED** | x | [[ATS-0004]] | x | x |\n| **RETENTION_PURGED**")],
  ];
  const failed = [];
  for (const [name, txt] of cases) if (runChecks(txt, human, ev).length === 0) failed.push(name);
  return failed;
}

const errors = runChecks(readFileSync(FILE, "utf8"), readFileSync(HUMAN, "utf8"), readFileSync(EVENTS, "utf8"));
for (const n of selfTest()) errors.push(`SELF-TEST kaçtı: ${n}`);

if (errors.length > 0) {
  console.error("product-flow drift guard FAILED:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`product-flow OK — ${SENTINELS.length} sentinel; tüm backing-link mevcut + event/state token taksonomi/state-machine'de birebir; self-test 8 negatif vektör fail ediyor.`);
