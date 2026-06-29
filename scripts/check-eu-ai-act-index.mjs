#!/usr/bin/env node
/**
 * EU AI Act technical-file index drift guard (ATS-0005 · Codex 019f13b1 round-2 #2).
 *
 * docs/ai-governance/eu-ai-act-technical-file-index.md'yi doğrular:
 *  1. Required AB AI Act maddeleri (Art.9..72 + 26) hepsi mevcut + tekil.
 *  2. Statü sözlük-geçerli (design/gate-locked/p1-evidence-required/owner-evidence-required).
 *  3. YASAK overclaim kelimeleri (compliant/certified/conformity achieved/fully meets/
 *     guaranteed/uygundur) indekste görünemez — readiness ≠ uygunluk beyanı (No Fake Work).
 *  4. Her satırın Mapped-artefakt hücresi: mevcut public repo path VEYA [[ATS-XXXX]] (docs/adr'de)
 *     VEYA 'PRIVATE' marker (ölü-link/boş reddedilir → readiness iddiası kanıta bağlı).
 *
 * Bağımsız (npm dep YOK), CI job `eu-ai-act-guard`.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(REPO, "docs/ai-governance/eu-ai-act-technical-file-index.md");

const STATUS = new Set(["design", "gate-locked", "p1-evidence-required", "owner-evidence-required"]);
const FORBIDDEN = /\b(compliant|certified|conformity achieved|fully meets|guaranteed|uygundur)\b/i;
const REQUIRED = ["Art.9", "Art.10", "Art.11", "Art.12", "Art.13", "Art.14", "Art.15", "Art.50", "Art.72", "Art.26"];

const adrDir = join(REPO, "docs/adr");
const adrFiles = existsSync(adrDir) ? readdirSync(adrDir) : [];
const adrExists = (id) => adrFiles.some((f) => f.startsWith(id));

const text = readFileSync(FILE, "utf8");
const lines = text.split("\n");
const errors = [];

// 3. overclaim taraması (tablo + prose; YASAK kelime bölümü hariç değil — hiç kullanılmamalı)
lines.forEach((l, i) => {
  // sözlük tanım satırı 'YASAK kelimeler' listesini tanımlıyor → o satırı atla
  if (/YASAK kelimeler/.test(l)) return;
  if (FORBIDDEN.test(l)) errors.push(`overclaim kelimesi satır ${i + 1}: "${l.trim().slice(0, 60)}"`);
});

const seen = new Set();
for (const line of lines) {
  const t = line.trim();
  if (!/^\|\s*\*\*Art\.\d+\*\*\s*\|/.test(t)) continue;
  const c = t.split("|").slice(1, -1).map((x) => x.trim());
  if (c.length < 5) { errors.push(`az hücre: ${t.slice(0, 40)}`); continue; }
  const art = c[0].replace(/\*\*/g, "").trim();
  const mapped = c[2];
  const status = c[3];
  if (seen.has(art)) errors.push(`duplicate madde: ${art}`);
  seen.add(art);
  if (!STATUS.has(status)) errors.push(`${art}: geçersiz statü "${status}"`);

  // mapped artefakt çözünürlüğü
  const pathRefs = [...mapped.matchAll(/\(([^)]+\/[^)]+)\)/g)].map((m) => m[1].replace(/^\.\.\//, "docs/").replace(/^\.\//, ""));
  const adrRefs = [...mapped.matchAll(/\[\[(ATS-\d+)\]\]/g)].map((m) => m[1]);
  const hasPrivate = /PRIVATE/.test(mapped);
  const pathOk = pathRefs.some((p) => existsSync(join(REPO, p.replace(/^docs\/\.\.\//, ""))) || existsSync(join(REPO, p)));
  const adrOk = adrRefs.some((id) => adrExists(id));
  if (!pathOk && !adrOk && !hasPrivate) {
    errors.push(`${art}: Mapped-artefakt çözülemiyor (mevcut path / [[ATS-XXXX]] / PRIVATE yok): "${mapped}"`);
  }
}

for (const r of REQUIRED) if (!seen.has(r)) errors.push(`eksik AB AI Act maddesi: ${r}`);

if (errors.length > 0) {
  console.error("eu-ai-act-index drift guard FAILED:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`eu-ai-act-index OK — ${seen.size}/${REQUIRED.length} madde, statü+overclaim-yasağı geçerli, mapped-artefaktlar çözülüyor.`);
