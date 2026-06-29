#!/usr/bin/env node
/**
 * EU AI Act technical-file index drift guard (ATS-0005 · Codex 019f13d5 REVISE absorb).
 *
 * docs/ai-governance/eu-ai-act-technical-file-index.md:
 *  1. Required 19 madde (Art.9..73) hepsi mevcut + tekil.
 *  2. Statü sözlük-geçerli; YASAK overclaim ifadeleri (EN+TR) görünemez (readiness≠uygunluk).
 *  3. Mapped-artefakt: HER markdown-link path mevcut olmalı (ölü-link reddi) + satır en az bir
 *     çözülür anchor (path / [[ATS-XXXX]] / PRIVATE:<path>) taşımalı.
 *  4. Evidence-binding: p1-evidence-required→residual'da 'P1'; owner-evidence-required→'owner'/'operatör'.
 *
 * Bağımsız (npm dep YOK), CI job `eu-ai-act-guard`.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(REPO, "docs/ai-governance/eu-ai-act-technical-file-index.md");

const STATUS = new Set(["design", "gate-locked", "p1-evidence-required", "owner-evidence-required"]);
const FORBIDDEN = /\b(compliant|in compliance|conformant|conformity achieved|certified|fully meets|meets requirements|guaranteed|ai act ready|market-ready|lawful|uygundur|uyumlu(?:dur)?|gereklilikleri karşılar|tam karşılar)\b/i;
const REQUIRED = [
  "Art.9", "Art.10", "Art.11", "Art.12", "Art.13", "Art.14", "Art.15", "Art.16", "Art.17",
  "Art.18", "Art.19", "Art.20", "Art.26", "Art.43", "Art.47", "Art.49", "Art.50", "Art.72", "Art.73",
];

const adrDir = join(REPO, "docs/adr");
const adrFiles = existsSync(adrDir) ? readdirSync(adrDir) : [];
const adrExists = (id) => adrFiles.some((f) => f.startsWith(id));
const resolveRepoPath = (p) => {
  // markdown-link relative (../x) docs/ai-governance göreli → repo köküne çevir
  let rp = p.trim();
  if (rp.startsWith("../")) rp = "docs/" + rp.replace(/^(\.\.\/)+/, "");
  else if (rp.startsWith("./")) rp = rp.slice(2);
  return rp;
};

const lines = readFileSync(FILE, "utf8").split("\n");
const errors = [];

// 2. overclaim taraması — yalnız §0 YASAK-tanım satırı atlanır (genel bypass değil)
lines.forEach((l, i) => {
  if (/^>\s*\*\*YASAK ifadeler\*\*/.test(l.trim())) return; // tanım satırı
  if (FORBIDDEN.test(l)) errors.push(`overclaim ifadesi satır ${i + 1}: "${l.trim().slice(0, 70)}"`);
});

const seen = new Set();
for (const line of lines) {
  const t = line.trim();
  if (!/^\|\s*\*\*Art\.\d+\*\*\s*\|/.test(t)) continue;
  const c = t.split("|").slice(1, -1).map((x) => x.trim());
  if (c.length < 5) { errors.push(`az hücre: ${t.slice(0, 40)}`); continue; }
  const art = c[0].replace(/\*\*/g, "").trim();
  const mapped = c[2], status = c[3], residual = c[4];
  if (seen.has(art)) errors.push(`duplicate madde: ${art}`);
  seen.add(art);
  if (!STATUS.has(status)) errors.push(`${art}: geçersiz statü "${status}"`);

  // ölü markdown-link reddi: yalnız [text](path) link target'ları (prose parantez değil)
  const linkPaths = [...mapped.matchAll(/\]\(([^)]+)\)/g)]
    .map((m) => m[1])
    .filter((p) => /^(\.\.?\/|docs\/|scripts\/)/.test(p));
  for (const lp of linkPaths) {
    if (!existsSync(join(REPO, resolveRepoPath(lp)))) errors.push(`${art}: ölü mapped-link "${lp}"`);
  }
  // en az bir çözülür anchor
  const adrRefs = [...mapped.matchAll(/\[\[(ATS-\d+)\]\]/g)].map((m) => m[1]);
  const privateRef = /PRIVATE:\S+\/\S+/.test(mapped); // PRIVATE:<path-like> (bare PRIVATE bypass değil)
  const anchorOk = linkPaths.length > 0 || adrRefs.some(adrExists) || privateRef;
  if (!anchorOk) errors.push(`${art}: çözülür anchor yok (path/[[ATS-XXXX]]/PRIVATE:<path>): "${mapped}"`);

  // evidence-binding
  if (status === "p1-evidence-required" && !/\bP1\b/.test(residual)) {
    errors.push(`${art}: p1-evidence-required ama residual'da 'P1' yok`);
  }
  if (status === "owner-evidence-required" && !/\b(owner|operatör)\b/i.test(residual)) {
    errors.push(`${art}: owner-evidence-required ama residual'da 'owner/operatör' yok`);
  }
}

for (const r of REQUIRED) if (!seen.has(r)) errors.push(`eksik AB AI Act maddesi: ${r}`);

if (errors.length > 0) {
  console.error("eu-ai-act-index drift guard FAILED:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`eu-ai-act-index OK — ${seen.size}/${REQUIRED.length} madde, statü+overclaim-yasağı+evidence-binding geçerli, mapped-link'ler mevcut.`);
