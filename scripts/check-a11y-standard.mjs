#!/usr/bin/env node
/**
 * a11y/i18n standard drift guard (ATS-0011 · Codex 019f1374 REVISE absorb).
 *
 * docs/frontend/a11y-i18n-standard.md kanonik kriter kaydını doğrular:
 *  1. TAM-SET: WCAG 2.2 A+AA required ID→seviye haritası (55) burada sabit; registry'de
 *     her required ID birebir + seviye eşleşmeli. Eksik / fazla-unknown / yanlış-seviye → fail.
 *     (AAA dahil değil; AAA ID görünürse "bilinmeyen" olarak reddedilir.)
 *  2. i18n required I18N-1..10 hepsi bulunmalı.
 *  3. Her satır: boş-olmayan doğrulama + geçerli status.
 *  4. `enforced (CI)` → doğrulama'da izinli impl/test path prefix'i + repo'da mevcut
 *     (yalnız standard doc'a self-referans enforced sayılmaz; over-claim guard).
 *
 * Bağımsız (npm dep YOK), CI job `a11y-standard-guard` koşar.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(REPO, "docs/frontend/a11y-i18n-standard.md");

// WCAG 2.2 Level A + AA — tam set (55). AAA + 4.1.1(obsolete) hariç.
const REQUIRED_WCAG = new Map([
  ["WCAG-1.1.1", "A"], ["WCAG-1.2.1", "A"], ["WCAG-1.2.2", "A"], ["WCAG-1.2.3", "A"],
  ["WCAG-1.2.4", "AA"], ["WCAG-1.2.5", "AA"], ["WCAG-1.3.1", "A"], ["WCAG-1.3.2", "A"],
  ["WCAG-1.3.3", "A"], ["WCAG-1.3.4", "AA"], ["WCAG-1.3.5", "AA"], ["WCAG-1.4.1", "A"],
  ["WCAG-1.4.2", "A"], ["WCAG-1.4.3", "AA"], ["WCAG-1.4.4", "AA"], ["WCAG-1.4.5", "AA"],
  ["WCAG-1.4.10", "AA"], ["WCAG-1.4.11", "AA"], ["WCAG-1.4.12", "AA"], ["WCAG-1.4.13", "AA"],
  ["WCAG-2.1.1", "A"], ["WCAG-2.1.2", "A"], ["WCAG-2.1.4", "A"], ["WCAG-2.2.1", "A"],
  ["WCAG-2.2.2", "A"], ["WCAG-2.3.1", "A"], ["WCAG-2.4.1", "A"], ["WCAG-2.4.2", "A"],
  ["WCAG-2.4.3", "A"], ["WCAG-2.4.4", "A"], ["WCAG-2.4.5", "AA"], ["WCAG-2.4.6", "AA"],
  ["WCAG-2.4.7", "AA"], ["WCAG-2.4.11", "AA"], ["WCAG-2.5.1", "A"], ["WCAG-2.5.2", "A"],
  ["WCAG-2.5.3", "A"], ["WCAG-2.5.4", "A"], ["WCAG-2.5.7", "AA"], ["WCAG-2.5.8", "AA"],
  ["WCAG-3.1.1", "A"], ["WCAG-3.1.2", "AA"], ["WCAG-3.2.1", "A"], ["WCAG-3.2.2", "A"],
  ["WCAG-3.2.3", "AA"], ["WCAG-3.2.4", "AA"], ["WCAG-3.2.6", "A"], ["WCAG-3.3.1", "A"],
  ["WCAG-3.3.2", "A"], ["WCAG-3.3.3", "AA"], ["WCAG-3.3.4", "AA"], ["WCAG-3.3.7", "A"],
  ["WCAG-3.3.8", "AA"], ["WCAG-4.1.2", "A"], ["WCAG-4.1.3", "AA"],
]);
const REQUIRED_I18N = new Set(
  Array.from({ length: 10 }, (_, i) => `I18N-${i + 1}`),
);
const STATUS = new Set(["enforced (CI)", "gate-locked", "design"]);
const ENFORCED_PATH_PREFIXES = [
  "scripts/",
  ".github/workflows/",
  "web/",
  "mobile/",
  "desktop/",
  "packages/shared/",
];

const lines = readFileSync(FILE, "utf8").split("\n");
const errors = [];
const seenWcag = new Map();
const seenI18n = new Set();

for (const line of lines) {
  const t = line.trim();
  if (!/^\|\s*\*\*(WCAG|I18N)-/.test(t)) continue;
  const cells = t.split("|").slice(1, -1).map((c) => c.trim());
  if (cells.length < 5) {
    errors.push(`az hücre (${cells.length}): ${t.slice(0, 50)}`);
    continue;
  }
  const id = cells[0].replace(/\*\*/g, "").trim();
  const level = cells[2];
  const verification = cells[3];
  const status = cells[4];

  if (!verification) errors.push(`boş doğrulama hücresi (${id})`);
  if (!STATUS.has(status)) errors.push(`geçersiz status "${status}" (${id})`);

  if (id.startsWith("WCAG-")) {
    if (seenWcag.has(id)) errors.push(`tekrar eden WCAG ID: ${id}`);
    if (!REQUIRED_WCAG.has(id)) {
      errors.push(`bilinmeyen/izinsiz WCAG ID (AAA veya hatalı?): ${id}`);
    } else if (REQUIRED_WCAG.get(id) !== level) {
      errors.push(`seviye uyuşmazlığı ${id}: registry "${level}" ≠ beklenen "${REQUIRED_WCAG.get(id)}"`);
    }
    seenWcag.set(id, level);
  } else {
    if (seenI18n.has(id)) errors.push(`tekrar eden i18n ID: ${id}`);
    if (!REQUIRED_I18N.has(id)) errors.push(`bilinmeyen i18n ID: ${id}`);
    seenI18n.add(id);
  }

  if (status === "enforced (CI)") {
    const paths = [...verification.matchAll(/`([^`]+)`/g)]
      .map((m) => m[1])
      .filter((tok) => ENFORCED_PATH_PREFIXES.some((p) => tok.startsWith(p)));
    const realImplPath = paths.some(
      (p) => p !== "docs/frontend/a11y-i18n-standard.md" && existsSync(join(REPO, p)),
    );
    if (!realImplPath) {
      errors.push(
        `enforced (CI) ama doğrulama'da izinli impl/test path yok (${id}): "${verification}"`,
      );
    }
  }
}

// Tam-set: eksik required kriterler
for (const id of REQUIRED_WCAG.keys()) {
  if (!seenWcag.has(id)) errors.push(`eksik WCAG 2.2 A+AA kriteri: ${id}`);
}
for (const id of REQUIRED_I18N) {
  if (!seenI18n.has(id)) errors.push(`eksik i18n kriteri: ${id}`);
}

if (errors.length > 0) {
  console.error("a11y/i18n standard drift guard FAILED:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(
  `a11y/i18n standard OK — WCAG 2.2 A+AA tam set (${seenWcag.size}/${REQUIRED_WCAG.size}) seviye-eşleşmeli + i18n (${seenI18n.size}/${REQUIRED_I18N.size}); status vocab geçerli.`,
);
