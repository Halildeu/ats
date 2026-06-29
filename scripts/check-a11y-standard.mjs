#!/usr/bin/env node
/**
 * a11y/i18n standard drift guard (ATS-0011).
 *
 * docs/frontend/a11y-i18n-standard.md kanonik kriter kaydını doğrular:
 *  1. §1/§2 her kriter satırı: ID regex (WCAG-x.y.z | I18N-n) + tekillik +
 *     geçerli seviye (A|AA|n/a) + boş-olmayan doğrulama + geçerli status.
 *  2. WCAG 2.2 yeni kriterleri (2.4.11/2.5.8/3.2.6/3.3.7/3.3.8) silinemez
 *     (sentinel — 2.2'den 2.1'e sessiz geriye-düşüş guard'ı).
 *  3. `enforced (CI)` iddiası → doğrulama hücresinde MEVCUT repo path zorunlu
 *     (UI gelince; over-claim sessizce çürüyemez).
 *  4. Minimum kriter eşiği (regression guard).
 *
 * Bağımsız (npm dep YOK), CI job `a11y-standard-guard` koşar.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(REPO, "docs/frontend/a11y-i18n-standard.md");

const LEVELS = new Set(["A", "AA", "n/a"]);
const STATUS = new Set(["enforced (CI)", "gate-locked", "design"]);
const ID_RE = /^(WCAG-\d+\.\d+\.\d+|I18N-\d+)$/;
const SENTINELS = [
  "WCAG-2.4.11",
  "WCAG-2.5.8",
  "WCAG-3.2.6",
  "WCAG-3.3.7",
  "WCAG-3.3.8",
];

const lines = readFileSync(FILE, "utf8").split("\n");
const errors = [];
const ids = new Set();
let rows = 0;

for (const line of lines) {
  const t = line.trim();
  if (!/^\|\s*\*\*(WCAG|I18N)-/.test(t)) continue;
  rows++;
  const cells = t
    .split("|")
    .slice(1, -1)
    .map((c) => c.trim());
  // | ID | Kriter | Seviye | Doğrulama | Status |
  if (cells.length < 5) {
    errors.push(`az hücre (${cells.length}): ${t.slice(0, 50)}`);
    continue;
  }
  const id = cells[0].replace(/\*\*/g, "").trim();
  const level = cells[2];
  const verification = cells[3];
  const status = cells[4];

  if (!ID_RE.test(id)) errors.push(`geçersiz kriter ID: "${id}"`);
  if (ids.has(id)) errors.push(`tekrar eden kriter ID: ${id}`);
  ids.add(id);

  if (!LEVELS.has(level)) errors.push(`geçersiz seviye "${level}" (${id})`);
  if (!verification) errors.push(`boş doğrulama hücresi (${id})`);
  if (!STATUS.has(status)) errors.push(`geçersiz status "${status}" (${id})`);

  if (status === "enforced (CI)") {
    const paths = [...verification.matchAll(/`([^`]+)`/g)]
      .map((m) => m[1])
      .filter((tok) => tok.includes("/"));
    if (!paths.some((p) => existsSync(join(REPO, p)))) {
      errors.push(`enforced ama doğrulama'da mevcut repo path yok (${id}): "${verification}"`);
    }
  }
}

for (const s of SENTINELS) {
  if (!ids.has(s)) errors.push(`WCAG 2.2 sentinel kriter silinmiş/eksik: ${s}`);
}

if (rows < 20) errors.push(`beklenenden az kriter satırı: ${rows}`);

if (errors.length > 0) {
  console.error("a11y/i18n standard drift guard FAILED:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(
  `a11y/i18n standard OK — ${rows} kriter, ${ids.size} tekil ID, WCAG 2.2 sentinel'leri mevcut, status vocab geçerli.`,
);
