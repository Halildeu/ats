#!/usr/bin/env node
/**
 * Event-taxonomy drift guard (ATS-0010 · Codex 019f1354 REVISE absorb — dişli sürüm).
 *
 * docs/observability/event-taxonomy.md kanonik registry'sini doğrular:
 *  1. §0 zarf bölümünde (YALNIZ o section) kanonik ZORUNLU alanlar eksiksiz.
 *  2. §2 Event kaydı section'ındaki HER data satırı (bold-bağımsız) valide edilir:
 *     event_type regex + tekillik + geçerli category/severity/pii_class/status;
 *     Required-extra hücresi yalnız izinli opsiyonel alan içerir.
 *  3. Yasak pii_class (raw-pii/content/secret) §2 EVENT satırının pii_class hücresinde
 *     görünemez (fail-closed). §1 tanım tablosu serbest (false-positive yok).
 *  4. Sentinel kritik event ID'leri silinemez (deletion guard).
 *  5. Minimum satır eşiği (regression guard).
 *
 * Bağımsız (npm dep YOK), CI job `event-taxonomy-guard` koşar.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(REPO, "docs/observability/event-taxonomy.md");

const ENVELOPE_REQUIRED = [
  "schema_version",
  "event_type",
  "event_id",
  "category",
  "severity",
  "occurred_at",
  "tenant_id",
  "correlation_id",
  "trace_id",
  "source",
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
  "privacy",
  "system",
]);
const SEVERITIES = new Set(["debug", "info", "notice", "warning", "error", "critical"]);
const PII_ALLOWED = new Set(["none", "id-only", "pseudonymized"]);
const PII_FORBIDDEN = new Set(["raw-pii", "content", "secret"]);
const STATUS = new Set(["enforced (CI)", "enforced (repo-test)", "gate-locked", "design"]);
const EXTRA_ALLOWED = new Set([
  "actor_ref",
  "reason_code",
  "ledger_entry_ref",
  "target_ref",
  "source",
  "—",
  "-",
]);
const ID_RE = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/;
const SENTINELS = [
  "authz.tenant_boundary.violation",
  "admin.breakglass.invoked",
  "evidence.tombstone.appended",
  "privacy.erasure.executed",
  "ai_pipeline.prompt_injection.blocked",
];

const text = readFileSync(FILE, "utf8");
const lines = text.split("\n");
const errors = [];

/** Bir markdown başlığından sonraki section gövdesini döndürür (sonraki `## ` / `# ` 'e kadar). */
function section(headingRe) {
  let inSec = false;
  const out = [];
  for (const line of lines) {
    if (/^#{1,3}\s/.test(line)) {
      if (inSec) break; // bir sonraki başlık → section bitti
      if (headingRe.test(line)) {
        inSec = true;
        continue;
      }
    } else if (inSec) {
      out.push(line);
    }
  }
  return out.join("\n");
}

// 1. §0 zarf — YALNIZ o section'da zorunlu alanlar
const envelope = section(/^##\s*0\./);
if (!envelope.trim()) {
  errors.push("§0 zarf bölümü bulunamadı");
} else {
  for (const f of ENVELOPE_REQUIRED) {
    if (!new RegExp("`" + f + "`").test(envelope)) {
      errors.push(`§0 zarf'ta zorunlu alan eksik: ${f}`);
    }
  }
}

// 2. §2 Event kaydı — HER data satırı (bold-bağımsız)
const eventsSec = section(/^##\s*2\./);
if (!eventsSec.trim()) errors.push("§2 Event kaydı bölümü bulunamadı");
const ids = new Set();
let rows = 0;
for (const line of eventsSec.split("\n")) {
  const t = line.trim();
  if (!t.startsWith("|")) continue;
  // ayraç satırı (|---|---|) atla
  if (/^\|[\s:|-]+\|?$/.test(t)) continue;
  const cells = t
    .split("|")
    .slice(1, -1)
    .map((c) => c.trim());
  if (cells.length < 6) {
    errors.push(`az hücre (${cells.length}): ${t.slice(0, 50)}`);
    continue;
  }
  const id = cells[0].replace(/\*\*/g, "").trim();
  // başlık satırı atla
  if (id === "Event Type ID" || cells[1] === "Category") continue;
  rows++;
  const [, category, severity, pii, extra] = cells;
  const status = cells[5];

  if (!ID_RE.test(id)) errors.push(`geçersiz event_type ID: "${id}"`);
  if (ids.has(id)) errors.push(`tekrar eden event_type ID: ${id}`);
  ids.add(id);

  if (!CATEGORIES.has(category)) errors.push(`geçersiz category "${category}" (${id})`);
  if (!SEVERITIES.has(severity)) errors.push(`geçersiz severity "${severity}" (${id})`);

  if (PII_FORBIDDEN.has(pii)) {
    errors.push(`YASAK pii_class "${pii}" event satırında (${id}) — fail-closed redaction ihlali`);
  } else if (!PII_ALLOWED.has(pii)) {
    errors.push(`geçersiz pii_class "${pii}" (${id})`);
  }

  for (const e of extra.split(",").map((s) => s.trim()).filter(Boolean)) {
    if (!EXTRA_ALLOWED.has(e)) {
      errors.push(`izinsiz Required-extra alanı "${e}" (${id}) — yalnız opsiyonel zarf alanı olabilir`);
    }
  }

  for (const seg of status.split("/").map((s) => s.trim())) {
    if (!STATUS.has(seg)) errors.push(`geçersiz status "${seg}" (${id})`);
  }
}

// 3. Sentinel deletion guard
for (const s of SENTINELS) {
  if (!ids.has(s)) errors.push(`sentinel kritik event silinmiş/eksik: ${s}`);
}

if (rows < 25) errors.push(`beklenenden az event satırı: ${rows}`);

if (errors.length > 0) {
  console.error("event-taxonomy drift guard FAILED:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(
  `event-taxonomy OK — ${rows} event, ${ids.size} tekil ID, §0 zarf tam, §2 event satırlarında yasak pii_class yok, sentinel'ler mevcut.`,
);
