#!/usr/bin/env node
/**
 * Threat-register drift guard (Codex 019f1335 REVISE — 6-ay dayanıklılık).
 *
 * docs/security/threat-register.md'yi doğrular:
 *  1. Her tehdit satırı ID (T-* / P-*) + status + verification taşır.
 *  2. status vocabulary geçerli: enforced (CI) | enforced (repo-test) | gate-locked | design | accepted-risk
 *     (bir hücre '/' ile birden çok segment içerebilir; her segment geçerli olmalı).
 *  3. ID'ler tekil (retired ID'ler '## Retired' bölümünde listeli kalır, asla geri-kullanılmaz).
 *  4. status 'enforced ...' içeren her satırın verification hücresi repo'da MEVCUT bir `path`
 *     içermeli → enforced iddiası kod kanıtına bağlanır (over-claim sessizce çürüyemez).
 *
 * Bağımsız (npm dep YOK), CI job `threat-register-guard` koşar.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(REPO, "docs/security/threat-register.md");

const STATUS_SEGMENT =
  /^(enforced \((CI|repo-test)\)|gate-locked( \(.+\))?|design|accepted-risk( .+)?)$/;

const errors = [];
const ids = new Set();

const lines = readFileSync(FILE, "utf8").split("\n");
let rows = 0;

for (const line of lines) {
  const t = line.trim();
  // tehdit satırı: | **T-..** | ... | <verification> | <status> |
  if (!/^\|\s*\*\*(T|P)-/.test(t)) continue;
  rows++;
  const cells = t
    .split("|")
    .slice(1, -1) // baş/son boş hücreleri at
    .map((c) => c.trim());
  if (cells.length < 4) {
    errors.push(`az hücre (${cells.length}): ${t.slice(0, 60)}`);
    continue;
  }
  const id = cells[0].replace(/\*\*/g, "").trim();
  const status = cells[cells.length - 1];
  const verification = cells[cells.length - 2];

  if (ids.has(id)) errors.push(`tekrar eden ID: ${id}`);
  ids.add(id);

  // status segment doğrulaması
  for (const seg of status.split("/").map((s) => s.trim())) {
    if (!STATUS_SEGMENT.test(seg)) {
      errors.push(`geçersiz status segment "${seg}" (ID ${id})`);
    }
  }

  // enforced → verification'da mevcut path zorunlu
  if (/\benforced\b/.test(status)) {
    const tokens = [...verification.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    const paths = tokens.filter((tok) => tok.includes("/"));
    const exists = paths.some((p) => existsSync(join(REPO, p)));
    if (!exists) {
      errors.push(
        `enforced ama verification'da mevcut repo path yok (ID ${id}): "${verification}"`,
      );
    }
  }
}

if (rows < 15) errors.push(`beklenenden az tehdit satırı: ${rows}`);

if (errors.length > 0) {
  console.error("threat-register drift guard FAILED:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`threat-register OK — ${rows} tehdit, ${ids.size} tekil ID, enforced satırları path-bağlı.`);
