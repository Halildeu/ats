#!/usr/bin/env node
/**
 * Speaker-attribution drift guard (ATS-0013 · Codex 019f1fd2 REVISE absorb).
 *
 * docs/ai-governance/speaker-attribution-standard.md:
 *  §1 aktif attribution yöntemi = YALNIZ biyometrisiz allowlist (4, DUPLICATE YASAK, strict satır
 *     formatı — bold-id dışı tablo veri satırı fail); biometric=no; §1 GÖVDESİNİN TAMAMI yasak
 *     biyometrik-kavram taramasına tabi (prose-contradiction dahil; TR/EN alias: voiceprint, ses izi/
 *     imzası/biyometrisi, şablon, enrollment, embedding, cross-session, speaker recognition, voice
 *     biometrics, konuşmacı tanıma); lexical_self_introduction + human_labeling satırında "insan onayı"
 *     tokeni ZORUNLU (otomatik kimlik iddiası yasak).
 *  §2 sentinel voiceprint_enrollment: excluded-biometric olarak DURMALI + aktif edilemez + koşulu
 *     ayrı-ADR/açık-rıza/owner-risk-kabul içermeli.
 *  §0 diarization embedding invariant cümlesi literal-pinli (silinemez/yumuşatılamaz).
 *  Bölüm yapısı allowlist: HER H2 yalnız §0–§4 (ara "## 1a." VE rakamsız "## Ek ..." kaçağı → fail).
 *  Cross-doc binding: event-taxonomy'de evidence.speaker.attributed + ledger_entry_ref + target_ref;
 *  data-lifecycle-register'da speaker_attribution_map.
 *  + gömülü self-test (16 negatif vektör).
 *
 * Bağımsız (npm dep YOK), CI job `speaker-attribution-guard`. Regex ≠ runtime: attribution runtime P1.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(REPO, "docs/ai-governance/speaker-attribution-standard.md");
const TAXONOMY = join(REPO, "docs/observability/event-taxonomy.md");
const LIFECYCLE = join(REPO, "docs/privacy/data-lifecycle-register.md");

const ACTIVE_ALLOWED = new Set(["device_metadata", "lexical_self_introduction", "per_participant_device", "human_labeling"]);
const HUMAN_CONFIRM_REQUIRED = new Set(["lexical_self_introduction", "human_labeling"]);
const SENTINEL = "voiceprint_enrollment";
const SECTION_ALLOWED = new Set(["0.", "1.", "2.", "3.", "4."]);
// §1 gövdesinde görünemeyecek biyometrik kavramlar (EN+TR alias); §0/§2'de geçmesi serbest
const FORBIDDEN_CONCEPT = /voiceprint|voice.?print|şablon|enrollment|embedding|cross.?session|biyometrik|biometric_signal|speaker.?identif|speaker.?recogni|voice.?biometri|ses.?izi|ses.?imzas|ses.?biyometri|konuşmacı.?tanıma/i;
// §0 embedding invariant literal pin (invariant 5: silinemez/yumuşatılamaz)
const EMBED_INVARIANT = "diarization embedding'leri **session-scoped**'tır; **persist edilmez**, **export edilmez**, **cross-session karşılaştırılmaz**";

function section(text, reHead) {
  const lines = text.split("\n"); let inSec = false; const out = [];
  for (const l of lines) { if (/^##\s/.test(l)) { if (inSec) break; if (reHead.test(l)) inSec = true; continue; } if (inSec) out.push(l); }
  return out;
}
const rows = (lines) => lines.filter((l) => /^\|\s*\*\*[a-z]/.test(l.trim())).map((l) => l.trim().split("|").slice(1, -1).map((x) => x.replace(/\*\*/g, "").trim()));

// tablo veri satırı strict format: header/separator dışındaki her | satırı bold-id ile başlamalı
function strictRows(lines, secName, errors) {
  for (const l of lines) {
    const t = l.trim();
    if (!t.startsWith("|")) continue;
    if (/^\|[\s:|-]+\|?$/.test(t)) continue; // separator
    if (/^\|\s*(method|dimension|Data Class)\s*\|/i.test(t)) continue; // header
    if (!/^\|\s*\*\*[a-z_]+\*\*\s*\|/.test(t)) errors.push(`${secName}: format-dışı tablo satırı (bold-id zorunlu; alias-kaçağı yasak): "${t.slice(0, 60)}"`);
  }
}

function runChecks(text, taxText, lifeText) {
  const errors = [];

  // bölüm yapısı allowlist — HER H2 §0–§4 setinde olmalı ("## 1a." VE rakamsız "## Ek ..." kaçağı yasak)
  for (const l of text.split("\n")) {
    const m = l.match(/^##\s+(\S+)/);
    if (m && !SECTION_ALLOWED.has(m[1])) errors.push(`izinsiz bölüm başlığı: "## ${m[1]}" (yalnız §0–§4; ara/rakamsız H2 yasak)`);
  }

  const sec1 = section(text, /^##\s*1\./);
  const sec2 = section(text, /^##\s*2\./);
  const active = rows(sec1);
  const excluded = rows(sec2);
  strictRows(sec1, "§1", errors);
  strictRows(sec2, "§2", errors);

  // §1 gövdesinin TAMAMI (prose dahil) yasak-kavram taraması
  for (const l of sec1) {
    const m = l.match(FORBIDDEN_CONCEPT);
    if (m) errors.push(`§1 gövdesinde YASAK biyometrik kavram "${m[0]}": "${l.trim().slice(0, 60)}"`);
  }

  const seenActive = new Set();
  for (const r of active) {
    const [method, , biometric, status] = r;
    if (seenActive.has(method)) errors.push(`${method}: §1'de DUPLICATE aktif satır`);
    seenActive.add(method);
    if (!ACTIVE_ALLOWED.has(method)) errors.push(`${method}: §1'de izinsiz aktif yöntem (allowlist dışı; yeni yöntem=ayrı ADR)`);
    if (method === SENTINEL) errors.push(`${method}: sentinel yöntem §1'de AKTİF olamaz`);
    if (biometric !== "no") errors.push(`${method}: biometric kolonu "no" olmalı ("${biometric}")`);
    if (status !== "active-compliant") errors.push(`${method}: §1 status active-compliant olmalı ("${status}")`);
    if (HUMAN_CONFIRM_REQUIRED.has(method) && !/insan onayı/i.test(r.join(" "))) errors.push(`${method}: "insan onayı" tokeni zorunlu (otomatik kimlik iddiası yasak)`);
  }
  for (const id of ACTIVE_ALLOWED) if (!seenActive.has(id)) errors.push(`eksik aktif yöntem: ${id}`);

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

  // cross-doc binding (invariant 6)
  const taxRow = taxText.split("\n").find((l) => l.includes("**evidence.speaker.attributed**"));
  if (!taxRow) errors.push("event-taxonomy: evidence.speaker.attributed satırı eksik");
  else if (!/ledger_entry_ref/.test(taxRow) || !/target_ref/.test(taxRow)) errors.push("event-taxonomy: evidence.speaker.attributed required-extra ledger_entry_ref + target_ref içermeli (two-plane)");
  if (!lifeText.includes("**speaker_attribution_map**")) errors.push("data-lifecycle-register: speaker_attribution_map veri-sınıfı eksik");

  return errors;
}

function selfTest() {
  const base = readFileSync(FILE, "utf8");
  const tax = readFileSync(TAXONOMY, "utf8");
  const life = readFileSync(LIFECYCLE, "utf8");
  const mut = (a, b) => base.replace(a, b);
  const cases = [
    ["forbidden-concept-active", mut("yalnız ÖNERİ üretir — **insan onayı zorunlu**", "voiceprint eşlemesi otomatik atar"), tax, life],
    ["biometric-yes-active", mut("| oturum/hesap/cihaz katılım metadata'sı | no |", "| oturum/hesap/cihaz katılım metadata'sı | yes |"), tax, life],
    ["extra-active-method", mut("\n\n## 2.", "\n| **auto_cluster_match** | akustik küme benzerliği | no | active-compliant | otomatik |\n\n## 2."), tax, life],
    ["human-confirm-removed", mut("yalnız ÖNERİ üretir — **insan onayı zorunlu**", "otomatik atanır"), tax, life],
    ["sentinel-deleted", base.replace(/\| \*\*voiceprint_enrollment\*\* .*\n/, ""), tax, life],
    ["sentinel-activated", mut("\n\n## 2.", "\n| **voiceprint_enrollment** | ses karakteristigi | no | active-compliant | x |\n\n## 2."), tax, life],
    ["embed-invariant-weakened", mut("**persist edilmez**, **export edilmez**", "gerektiğinde persist edilebilir"), tax, life],
    ["excluded-status-invalid", mut("| excluded-biometric |", "| optional |"), tax, life],
    ["duplicate-active-row", mut("\n\n## 2.", "\n| **device_metadata** | ikinci kopya | no | active-compliant | dup |\n\n## 2."), tax, life],
    ["non-bold-alias-row", mut("\n\n## 2.", "\n| voice_map | akustik eşleme | no | active-compliant | alias |\n\n## 2."), tax, life],
    ["section-1a-escape", mut("\n\n## 2.", "\n\n## 1a. Ek aktif yöntemler\n\n| **auto_voice** | akustik | no | active-compliant | kaçak |\n\n## 2."), tax, life],
    ["non-number-h2-hidden-active", mut("\n\n## 2.", "\n\n## Ek aktif yöntemler\n\n| **speaker_identification** | akustik embedding | no | active-compliant | otomatik |\n\n## 2."), tax, life],
    ["prose-contradiction-sec1", mut("\n\n## 2.", "\n\nGerekirse konuşmacı tanıma ile otomatik eşleme yapılabilir.\n\n## 2."), tax, life],
    ["turkish-alias-active", mut("küme kısa-kesit inceleme UI", "küme ses izi eşlemesi"), tax, life],
    ["crossdoc-event-ref-missing", base, tax.replace("| **evidence.speaker.attributed** | evidence | notice | id-only | actor_ref, ledger_entry_ref, target_ref | gate-locked |", "| **evidence.speaker.attributed** | evidence | notice | id-only | actor_ref | gate-locked |"), life],
    ["crossdoc-lifecycle-missing", base, tax, life.replace(/\| \*\*speaker_attribution_map\*\* .*\n/, "")],
  ];
  const failed = [];
  for (const [name, txt, t, l] of cases) if (runChecks(txt, t, l).length === 0) failed.push(name);
  return failed;
}

const errors = runChecks(readFileSync(FILE, "utf8"), readFileSync(TAXONOMY, "utf8"), readFileSync(LIFECYCLE, "utf8"));
for (const n of selfTest()) errors.push(`SELF-TEST kaçtı: ${n}`);

if (errors.length > 0) {
  console.error("speaker-attribution drift guard FAILED:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("speaker-attribution OK — aktif yöntem allowlist(4) biyometrisiz (biometric=no, duplicate/format-dışı satır yasak, §1 tam-gövde yasak-kavram taraması TR/EN alias'lı, insan-onay tokeni), sentinel voiceprint_enrollment excluded+aktif-değil+ADR/rıza/risk-kabul koşullu, embedding invariantı pinli, H2 bölüm-yapısı allowlist (rakamsız dahil), cross-doc (taxonomy ledger_entry_ref+target_ref, lifecycle speaker_attribution_map); self-test 16 negatif vektör fail ediyor.");
