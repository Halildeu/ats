#!/usr/bin/env node
/**
 * Speaker-attribution drift guard (ATS-0013).
 *
 * docs/ai-governance/speaker-attribution-standard.md:
 *  §1 aktif attribution yöntemi = YALNIZ biyometrisiz allowlist (4); biometric=no; satırda yasak
 *     biyometrik kavram (voiceprint/şablon/enrollment/embedding/cross-session) YOK; lexical_self_introduction
 *     + human_labeling satırında "insan onayı" tokeni ZORUNLU (otomatik kimlik iddiası yasak).
 *  §2 sentinel voiceprint_enrollment: excluded-biometric olarak DURMALI + aktif edilemez + koşulu
 *     ayrı-ADR/açık-rıza/owner-risk-kabul içermeli.
 *  §0 diarization embedding invariant cümlesi (session-scoped/persist-yok/export-yok/cross-session-yok)
 *     silinemez/yumuşatılamaz (literal pin).
 *  + gömülü self-test.
 *
 * Bağımsız (npm dep YOK), CI job `speaker-attribution-guard`. Regex ≠ runtime: attribution runtime P1.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(REPO, "docs/ai-governance/speaker-attribution-standard.md");

const ACTIVE_ALLOWED = new Set(["device_metadata", "lexical_self_introduction", "per_participant_device", "human_labeling"]);
const HUMAN_CONFIRM_REQUIRED = new Set(["lexical_self_introduction", "human_labeling"]);
const SENTINEL = "voiceprint_enrollment";
// aktif satırda görünemeyecek biyometrik kavramlar (EN+TR); §2 excluded satırında geçmesi serbest
const FORBIDDEN_CONCEPT = /voiceprint|voice.?print|şablon|enrollment|embedding|cross.?session|biyometrik|biometric_signal|speaker.?identif/i;
// §0 embedding invariant literal pin (invariant 5: silinemez/yumuşatılamaz)
const EMBED_INVARIANT = "diarization embedding'leri **session-scoped**'tır; **persist edilmez**, **export edilmez**, **cross-session karşılaştırılmaz**";

function section(text, reHead) {
  const lines = text.split("\n"); let inSec = false; const out = [];
  for (const l of lines) { if (/^##\s/.test(l)) { if (inSec) break; if (reHead.test(l)) inSec = true; continue; } if (inSec) out.push(l); }
  return out;
}
const rows = (lines) => lines.filter((l) => /^\|\s*\*\*[a-z]/.test(l.trim())).map((l) => l.trim().split("|").slice(1, -1).map((x) => x.replace(/\*\*/g, "").trim()));

function runChecks(text) {
  const errors = [];
  const active = rows(section(text, /^##\s*1\./));
  const excluded = rows(section(text, /^##\s*2\./));

  const activeIds = new Set(active.map((r) => r[0]));
  for (const r of active) {
    const [method, , biometric, status] = r;
    if (!ACTIVE_ALLOWED.has(method)) errors.push(`${method}: §1'de izinsiz aktif yöntem (allowlist dışı; yeni yöntem=ayrı ADR)`);
    if (method === SENTINEL) errors.push(`${method}: sentinel yöntem §1'de AKTİF olamaz`);
    if (biometric !== "no") errors.push(`${method}: biometric kolonu "no" olmalı ("${biometric}")`);
    if (status !== "active-compliant") errors.push(`${method}: §1 status active-compliant olmalı ("${status}")`);
    const joined = r.join(" ");
    const m = joined.match(FORBIDDEN_CONCEPT);
    if (m) errors.push(`${method}: YASAK biyometrik kavram "${m[0]}" aktif satırda`);
    if (HUMAN_CONFIRM_REQUIRED.has(method) && !/insan onayı/i.test(joined)) errors.push(`${method}: "insan onayı" tokeni zorunlu (otomatik kimlik iddiası yasak)`);
  }
  for (const id of ACTIVE_ALLOWED) if (!activeIds.has(id)) errors.push(`eksik aktif yöntem: ${id}`);

  const sentinelRow = excluded.find((r) => r[0] === SENTINEL);
  if (!sentinelRow) errors.push(`sentinel ${SENTINEL} §2'de eksik (silinemez)`);
  else {
    const [, , kosul, status] = sentinelRow;
    if (status !== "excluded-biometric") errors.push(`${SENTINEL}: status excluded-biometric olmalı ("${status}")`);
    if (!/ayrı ADR/i.test(kosul) || !/açık.?rıza/i.test(kosul) || !/risk-kabul/i.test(kosul)) {
      errors.push(`${SENTINEL}: koşul satırı ayrı-ADR + açık-rıza + owner-risk-kabul içermeli`);
    }
  }

  if (!text.includes(EMBED_INVARIANT)) errors.push(`§0 embedding invariant cümlesi eksik/yumuşatılmış (literal pin): "${EMBED_INVARIANT.slice(0, 60)}..."`);
  return errors;
}

function selfTest() {
  const base = readFileSync(FILE, "utf8");
  const mut = (a, b) => base.replace(a, b);
  const cases = [
    ["forbidden-concept-active", mut("yalnız ÖNERİ üretir — **insan onayı zorunlu**", "voiceprint eşlemesi otomatik atar")],
    ["biometric-yes-active", mut("| oturum/hesap/cihaz katılım metadata'sı | no |", "| oturum/hesap/cihaz katılım metadata'sı | yes |")],
    ["extra-active-method", mut("\n\n## 2.", "\n| **auto_cluster_match** | akustik küme benzerliği | no | active-compliant | otomatik |\n\n## 2.")],
    ["human-confirm-removed", mut("yalnız ÖNERİ üretir — **insan onayı zorunlu**", "otomatik atanır")],
    ["sentinel-deleted", base.replace(/\| \*\*voiceprint_enrollment\*\* .*\n/, "")],
    ["sentinel-activated", mut("\n\n## 2.", "\n| **voiceprint_enrollment** | ses karakteristigi | no | active-compliant | x |\n\n## 2.")],
    ["embed-invariant-weakened", mut("**persist edilmez**, **export edilmez**", "gerektiğinde persist edilebilir")],
    ["excluded-status-invalid", mut("| excluded-biometric |", "| optional |")],
  ];
  const failed = [];
  for (const [name, txt] of cases) if (runChecks(txt).length === 0) failed.push(name);
  return failed;
}

const errors = runChecks(readFileSync(FILE, "utf8"));
for (const n of selfTest()) errors.push(`SELF-TEST kaçtı: ${n}`);

if (errors.length > 0) {
  console.error("speaker-attribution drift guard FAILED:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("speaker-attribution OK — aktif yöntem allowlist(4) biyometrisiz (biometric=no, yasak-kavram yok, insan-onay tokeni), sentinel voiceprint_enrollment excluded+aktif-değil+ADR/rıza/risk-kabul koşullu, embedding invariantı pinli; self-test 8 negatif vektör fail ediyor.");
