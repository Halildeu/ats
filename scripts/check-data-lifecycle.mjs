#!/usr/bin/env node
/**
 * Data-lifecycle register drift guard (ATS-0003 operationalized · Codex 019f13b1 round-2 #1).
 *
 * docs/privacy/data-lifecycle-register.md'yi doğrular (header-eşlemeli sütun parse):
 *  1. Tüm required veri-sınıfları (sentinel) mevcut + tekil.
 *  2. Sözlük geçerliliği: pii_class/plane/deletion/WORM/transfer/status.
 *  3. İnvariantlar:
 *     a. content/raw-pii sınıfı 'worm-ledger' plane'de OLAMAZ (ATS-0003: ledger meta+hash).
 *     b. worm-ledger plane → WORM=EVET + deletion=tombstone-append.
 *     c. legal_basis + retention dolu, '[DOLDUR]' YASAK (canonical).
 *     d. transfer 'none' dışı ise sözlük-tipi olmalı.
 *
 * Bağımsız (npm dep YOK), CI job `data-lifecycle-guard`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(REPO, "docs/privacy/data-lifecycle-register.md");

const PII = new Set(["none", "id-only", "pseudonymized", "raw-pii", "content", "mixed"]);
const PLANE = new Set(["worm-ledger", "primary-db", "object-store", "vector-index", "telemetry", "backup", "none"]);
const DELETION = new Set(["hard-delete", "crypto-erase", "tombstone-append", "n/a"]);
const WORM = new Set(["EVET", "HAYIR", "miras"]);
const TRANSFER = new Set(["none", "SCC", "KVKK-açık-rıza", "adequacy", "müşteri-yönlendirmeli"]);
const STATUS = new Set(["enforced (CI)", "gate-locked", "design"]);
const REQUIRED = [
  "raw_media", "transcript_raw", "transcript_redacted", "speaker_label", "candidate_pii",
  "embedding_vector", "consent_record", "worm_metadata", "model_version_log", "audit_event",
  "evidence_export_artifact", "connector_metadata", "backup_copy",
];

const lines = readFileSync(FILE, "utf8").split("\n");
const errors = [];

// header-eşlemeli kolon index
const headerLine = lines.find((l) => /\|\s*Data Class\s*\|/.test(l) && /pii_class/.test(l));
if (!headerLine) { console.error("data-lifecycle: header satırı bulunamadı"); process.exit(1); }
const cols = headerLine.split("|").slice(1, -1).map((c) => c.trim());
const idx = (name) => cols.findIndex((c) => c.toLowerCase() === name.toLowerCase());
const I = {
  cls: idx("Data Class"), pii: idx("pii_class"), plane: idx("Plane"),
  legal: idx("Legal basis"), ret: idx("Retention"), del: idx("Deletion"),
  worm: idx("WORM"), tr: idx("Transfer"), st: idx("Status"),
};
for (const [k, v] of Object.entries(I)) if (v < 0) errors.push(`header'da kolon eksik: ${k}`);

const seen = new Set();
for (const line of lines) {
  const t = line.trim();
  if (!/^\|\s*\*\*[a-z_]+\*\*\s*\|/.test(t)) continue; // **data_class** satırı
  const c = t.split("|").slice(1, -1).map((x) => x.trim());
  const cls = c[I.cls].replace(/\*\*/g, "").trim();
  seen.add(cls);
  const pii = c[I.pii], plane = c[I.plane], del = c[I.del], worm = c[I.worm], tr = c[I.tr], st = c[I.st];
  const legal = c[I.legal], ret = c[I.ret];

  if (!PII.has(pii)) errors.push(`${cls}: geçersiz pii_class "${pii}"`);
  if (!PLANE.has(plane)) errors.push(`${cls}: geçersiz plane "${plane}"`);
  if (!DELETION.has(del)) errors.push(`${cls}: geçersiz deletion "${del}"`);
  if (!WORM.has(worm)) errors.push(`${cls}: geçersiz WORM "${worm}"`);
  if (!TRANSFER.has(tr)) errors.push(`${cls}: geçersiz transfer "${tr}"`);
  if (!STATUS.has(st)) errors.push(`${cls}: geçersiz status "${st}"`);

  // invariant a: content/raw-pii worm-ledger'da olamaz
  if ((pii === "content" || pii === "raw-pii") && plane === "worm-ledger") {
    errors.push(`${cls}: İNVARIANT ihlali — ${pii} sınıfı worm-ledger plane'de TUTULAMAZ (ATS-0003)`);
  }
  // invariant b: worm-ledger → EVET + tombstone
  if (plane === "worm-ledger") {
    if (worm !== "EVET") errors.push(`${cls}: worm-ledger plane → WORM=EVET olmalı`);
    if (del !== "tombstone-append") errors.push(`${cls}: worm-ledger → deletion=tombstone-append olmalı`);
  }
  // invariant c: legal_basis + retention dolu, [DOLDUR] yok
  if (!legal || /\[DOLDUR/.test(legal)) errors.push(`${cls}: legal_basis boş/[DOLDUR]`);
  if (!ret || /\[DOLDUR/.test(ret)) errors.push(`${cls}: retention boş/[DOLDUR]`);
}

for (const r of REQUIRED) if (!seen.has(r)) errors.push(`eksik required veri-sınıfı: ${r}`);

if (errors.length > 0) {
  console.error("data-lifecycle drift guard FAILED:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`data-lifecycle OK — ${seen.size}/${REQUIRED.length} veri-sınıfı, sözlük+invariant geçerli, WORM-içerik-yasağı korunuyor.`);
