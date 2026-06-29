#!/usr/bin/env node
/**
 * Event-taxonomy drift guard (ATS-0010).
 *
 * docs/observability/event-taxonomy.md kanonik registry'sini doğrular:
 *  1. Zarf (§0) kanonik 7 ZORUNLU alanı eksiksiz listeler.
 *  2. Her event satırı: ID regex + tekillik + geçerli category/severity/pii_class/status.
 *  3. Yasak pii_class (raw-pii / content / secret) HİÇBİR satırda görünemez (fail-closed redaction).
 *  4. Minimum satır eşiği (regression guard).
 *
 * Bağımsız (npm dep YOK), CI job `event-taxonomy-guard` koşar.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(REPO, "docs/observability/event-taxonomy.md");

const ENVELOPE_REQUIRED = [
  "event",
  "category",
  "severity",
  "occurred_at",
  "tenant_id",
  "correlation_id",
  "outcome",
];
const CATEGORIES = new Set([
  "auth",
  "authz",
  "evidence",
  "ai_pipeline",
  "connector",
  "admin",
  "security",
  "consent",
  "system",
]);
const SEVERITIES = new Set(["debug", "info", "notice", "warning", "error", "critical"]);
const PII_ALLOWED = new Set(["none", "id-only", "pseudonymized"]);
const PII_FORBIDDEN = new Set(["raw-pii", "content", "secret"]);
const STATUS = new Set(["enforced (CI)", "enforced (repo-test)", "gate-locked", "design"]);
const ID_RE = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/;

const text = readFileSync(FILE, "utf8");
const errors = [];

// 1. Zarf zorunlu alanları
for (const f of ENVELOPE_REQUIRED) {
  if (!new RegExp(`\`${f}\``).test(text)) {
    errors.push(`zarf §0'da zorunlu alan eksik: ${f}`);
  }
}

// 2. Event satırları
const ids = new Set();
let rows = 0;
for (const line of text.split("\n")) {
  const t = line.trim();
  if (!/^\|\s*\*\*[a-z]/.test(t)) continue; // sadece **event.id** ile başlayan satırlar
  rows++;
  const cells = t
    .split("|")
    .slice(1, -1)
    .map((c) => c.trim());
  if (cells.length < 6) {
    errors.push(`az hücre (${cells.length}): ${t.slice(0, 50)}`);
    continue;
  }
  const id = cells[0].replace(/\*\*/g, "").trim();
  const [, category, severity, pii] = cells;
  const status = cells[5];

  if (!ID_RE.test(id)) errors.push(`geçersiz event ID: "${id}"`);
  if (ids.has(id)) errors.push(`tekrar eden event ID: ${id}`);
  ids.add(id);

  if (!CATEGORIES.has(category)) errors.push(`geçersiz category "${category}" (${id})`);
  if (!SEVERITIES.has(severity)) errors.push(`geçersiz severity "${severity}" (${id})`);

  if (PII_FORBIDDEN.has(pii)) {
    errors.push(`YASAK pii_class "${pii}" event satırında (${id}) — fail-closed redaction ihlali`);
  } else if (!PII_ALLOWED.has(pii)) {
    errors.push(`geçersiz pii_class "${pii}" (${id})`);
  }

  for (const seg of status.split("/").map((s) => s.trim())) {
    if (!STATUS.has(seg)) errors.push(`geçersiz status "${seg}" (${id})`);
  }
}

if (rows < 15) errors.push(`beklenenden az event satırı: ${rows}`);

if (errors.length > 0) {
  console.error("event-taxonomy drift guard FAILED:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(
  `event-taxonomy OK — ${rows} event, ${ids.size} tekil ID, zarf tam, yasak pii_class yok.`,
);
