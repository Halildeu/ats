#!/usr/bin/env node
/**
 * Data-lifecycle register drift guard (ATS-0003 operationalized · Codex 019f13be REVISE absorb).
 *
 * docs/privacy/data-lifecycle-register.md (header-eşlemeli sütun parse):
 *  1. 25 required veri-sınıfı (sentinel) mevcut + TEKİL (duplicate fail).
 *  2. Sözlük: sensitivity/plane/deletion/WORM/identity-binding/transfer/status.
 *  3. İnvariantlar:
 *     1) content/raw-pii/secret 'worm-ledger'de OLAMAZ.
 *     2) worm-ledger → WORM=EVET + deletion=tombstone-append + identity-binding∈{HMAC-destroyable,no-subject}.
 *     3) content/raw-pii/secret → deletion∈{hard-delete,crypto-erase,transient} (silinebilir; KVKK).
 *     4) kms-vault → sensitivity=secret.
 *     5) ai_provider_payload → transfer∈{self-host-only,no-train-DPA,SCC,KVKK-açık-rıza} (düz none yasak).
 *     6) legal_basis + retention dolu, [DOLDUR] yok.
 *
 * Bağımsız (npm dep YOK), CI job `data-lifecycle-guard`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(REPO, "docs/privacy/data-lifecycle-register.md");

const SENS = new Set(["none", "id-only", "pseudonymized", "raw-pii", "content", "secret", "mixed"]);
const PLANE = new Set(["worm-ledger", "primary-db", "object-store", "vector-index", "telemetry", "backup", "kms-vault", "none"]);
const DEL = new Set(["hard-delete", "crypto-erase", "tombstone-append", "transient", "n/a"]);
const WORM = new Set(["EVET", "HAYIR", "miras"]);
const IDB = new Set(["HMAC-destroyable", "no-subject", "n/a"]);
const TRANSFER = new Set(["none", "self-host-only", "no-train-DPA", "SCC", "KVKK-açık-rıza", "adequacy", "müşteri-yönlendirmeli"]);
const STATUS = new Set(["gate-locked", "design"]);
const DELETABLE = new Set(["hard-delete", "crypto-erase", "transient"]);
const PROVIDER_TRANSFER = new Set(["self-host-only", "no-train-DPA", "SCC", "KVKK-açık-rıza"]);
const REQUIRED = [
  "raw_media", "transcript_raw", "transcript_redacted", "speaker_label", "candidate_pii",
  "participant_pii", "embedding_vector", "redaction_map", "pseudonymization_map", "erasure_key_material",
  "recording_permission_state", "consent_record", "worm_metadata", "model_version_log",
  "human_decision_rationale", "claim_citation_ref", "evidence_packet", "dsar_request_log",
  "dsar_response_artifact", "retention_policy", "retention_timer_state", "audit_event",
  "connector_metadata", "ai_provider_payload", "backup_copy",
];

const lines = readFileSync(FILE, "utf8").split("\n");
const errors = [];

const headerLine = lines.find((l) => /\|\s*Data Class\s*\|/.test(l) && /sensitivity/.test(l));
if (!headerLine) { console.error("data-lifecycle: header bulunamadı"); process.exit(1); }
const cols = headerLine.split("|").slice(1, -1).map((c) => c.trim());
const idx = (n) => cols.findIndex((c) => c.toLowerCase() === n.toLowerCase());
const I = {
  cls: idx("Data Class"), sens: idx("sensitivity"), plane: idx("Plane"), legal: idx("Legal basis"),
  ret: idx("Retention"), del: idx("Deletion"), worm: idx("WORM"), idb: idx("Identity-binding"),
  tr: idx("Transfer"), st: idx("Status"),
};
for (const [k, v] of Object.entries(I)) if (v < 0) errors.push(`header'da kolon eksik: ${k}`);

const seen = new Set();
for (const line of lines) {
  const t = line.trim();
  if (!/^\|\s*\*\*[a-z_]+\*\*\s*\|/.test(t)) continue;
  const c = t.split("|").slice(1, -1).map((x) => x.trim());
  const cls = c[I.cls].replace(/\*\*/g, "").trim();
  if (seen.has(cls)) errors.push(`duplicate veri-sınıfı: ${cls}`);
  seen.add(cls);
  const sens = c[I.sens], plane = c[I.plane], del = c[I.del], worm = c[I.worm];
  const idb = c[I.idb], tr = c[I.tr], st = c[I.st], legal = c[I.legal], ret = c[I.ret];

  if (!SENS.has(sens)) errors.push(`${cls}: geçersiz sensitivity "${sens}"`);
  if (!PLANE.has(plane)) errors.push(`${cls}: geçersiz plane "${plane}"`);
  if (!DEL.has(del)) errors.push(`${cls}: geçersiz deletion "${del}"`);
  if (!WORM.has(worm)) errors.push(`${cls}: geçersiz WORM "${worm}"`);
  if (!IDB.has(idb)) errors.push(`${cls}: geçersiz identity-binding "${idb}"`);
  if (!TRANSFER.has(tr)) errors.push(`${cls}: geçersiz transfer "${tr}"`);
  if (!STATUS.has(st)) errors.push(`${cls}: geçersiz status "${st}"`);

  const sensitive = sens === "content" || sens === "raw-pii" || sens === "secret";
  // inv 1
  if (sensitive && plane === "worm-ledger") errors.push(`${cls}: İNV1 — ${sens} worm-ledger'de TUTULAMAZ (ATS-0003)`);
  // inv 2
  if (plane === "worm-ledger") {
    if (worm !== "EVET") errors.push(`${cls}: İNV2 — worm-ledger→WORM=EVET`);
    if (del !== "tombstone-append") errors.push(`${cls}: İNV2 — worm-ledger→deletion=tombstone-append`);
    if (idb !== "HMAC-destroyable" && idb !== "no-subject") errors.push(`${cls}: İNV2 — worm-ledger identity-binding HMAC-destroyable/no-subject olmalı (statik hash yasak)`);
  }
  // inv 3
  if (sensitive && !DELETABLE.has(del)) errors.push(`${cls}: İNV3 — ${sens} silinebilir olmalı (hard-delete/crypto-erase/transient; tombstone/n-a yasak)`);
  // inv 4
  if (plane === "kms-vault" && sens !== "secret") errors.push(`${cls}: İNV4 — kms-vault→sensitivity=secret`);
  // inv 5
  if (cls === "ai_provider_payload" && !PROVIDER_TRANSFER.has(tr)) {
    errors.push(`${cls}: İNV5 — provider payload transfer ${[...PROVIDER_TRANSFER].join("/")} olmalı (düz none yasak; T-I5)`);
  }
  // inv 6
  if (!legal || /\[DOLDUR/.test(legal)) errors.push(`${cls}: İNV6 — legal_basis boş/[DOLDUR]`);
  if (!ret || /\[DOLDUR/.test(ret)) errors.push(`${cls}: İNV6 — retention boş/[DOLDUR]`);
}

for (const r of REQUIRED) if (!seen.has(r)) errors.push(`eksik required veri-sınıfı: ${r}`);

if (errors.length > 0) {
  console.error("data-lifecycle drift guard FAILED:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`data-lifecycle OK — ${seen.size}/${REQUIRED.length} veri-sınıfı (tekil), sözlük+6 invariant geçerli, WORM-içerik-yasağı + subject-binding + provider-transfer korunuyor.`);
