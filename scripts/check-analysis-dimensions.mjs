#!/usr/bin/env node
/**
 * Interview analysis-dimensions drift guard (ATS-0012 · Codex 019f19ce REVISE absorb).
 *
 * docs/ai-governance/interview-analysis-dimensions.md:
 *  §1 aktif: YALNIZ izinli 6 boyut (allowlist; +process_perspective_coverage ATS-0015); input ⊆ izinli-lexical (yasaklı audio/video/biometric YOK);
 *     output ⊆ izinli (score/ranking/affect/personality YOK); satırda YASAK KAVRAM-ALIAS yok
 *     (truthfulness/deception/voice/affect/personality/demographic + TR varyant).
 *  §2 excluded: equivalence∈{partial,none}; partial→safe_alternative bir aktif boyut; none→muadil-aranmaz;
 *     sentinel yasaklılar korunur + aktif edilemez.
 *  + gömülü self-test.
 *
 * Bağımsız (npm dep YOK), CI job `analysis-dimensions-guard`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(REPO, "docs/ai-governance/interview-analysis-dimensions.md");

const ACTIVE_ALLOWED = new Set(["content_consistency", "internal_contradiction", "answer_quality", "topic_coverage", "claim_citation", "process_perspective_coverage"]);
const ALLOWED_INPUT = new Set(["transcript_text", "cv_text", "rubric", "claim"]);
const FORBIDDEN_INPUT = new Set(["audio_waveform", "voice_tone", "video_pixel", "facial", "biometric_signal"]);
const ALLOWED_OUTPUT = new Set(["evidence", "citation", "finding", "coverage", "consistency_flag"]);
const FORBIDDEN_OUTPUT = new Set(["score", "ranking", "affect_label", "personality_label"]);
const SENTINEL_FORBIDDEN = ["affect_emotion", "voice_stress", "facial_microexpression", "deception_detection", "personality_inference", "demographic_inference"];
const EQUIV = new Set(["partial", "none"]);
// aktif satırda görünemeyecek yasaklı kavramlar (EN+TR); excluded §2'de geçmesi serbest
const FORBIDDEN_CONCEPT = [
  /truthful|\blie\b|deception|credibilit|honesty|\bstress\b|prosod|\bvoice\b|\btone\b|facial|microexpress|\bgaze\b|eye.?contact|body.?language|emotion|affect|personalit|temperament|demographic|\bage\b|gender|accent|native.?language|\bhealth\b|pregnan/i,
  /yalan|doğruluk|güvenilir|dürüst|duygu|ses.?ton|mimik|\bjest\b|bakış|beden.?dil|kişilik|mizaç|demografik|\byaş\b|cinsiyet|aksan|ana.?dil|sağlık|hamile/i,
];

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
    const [dim, input, output, status] = r;
    if (!ACTIVE_ALLOWED.has(dim)) errors.push(`${dim}: §1'de izinsiz aktif boyut (allowlist dışı; yeni boyut=ayrı ADR)`);
    if (status !== "active-compliant" && status !== "gate-locked") errors.push(`${dim}: §1 status active-compliant/gate-locked olmalı ("${status}")`);
    for (const i of (input || "").split(",").map((x) => x.trim()).filter(Boolean)) {
      if (FORBIDDEN_INPUT.has(i)) errors.push(`${dim}: YASAK input "${i}"`);
      else if (!ALLOWED_INPUT.has(i)) errors.push(`${dim}: bilinmeyen input "${i}"`);
    }
    for (const o of (output || "").split(",").map((x) => x.trim()).filter(Boolean)) {
      if (FORBIDDEN_OUTPUT.has(o)) errors.push(`${dim}: YASAK output "${o}"`);
      else if (!ALLOWED_OUTPUT.has(o)) errors.push(`${dim}: bilinmeyen output "${o}"`);
    }
    if (SENTINEL_FORBIDDEN.includes(dim)) errors.push(`${dim}: yasaklı boyut §1'de AKTİF olamaz`);
    // yasaklı kavram-alias taraması (tüm aktif satır)
    const joined = r.join(" ");
    for (const re of FORBIDDEN_CONCEPT) { const m = joined.match(re); if (m) errors.push(`${dim}: YASAK kavram-alias "${m[0]}" aktif satırda (excluded'a taşı)`); }
  }
  for (const id of ACTIVE_ALLOWED) if (!activeIds.has(id)) errors.push(`eksik aktif boyut: ${id}`);

  const excludedIds = new Set();
  for (const r of excluded) {
    const [dim, , safeAlt, equivalence] = r;
    excludedIds.add(dim);
    if (!EQUIV.has(equivalence)) errors.push(`${dim}: equivalence partial/none olmalı ("${equivalence}")`);
    if (equivalence === "partial") {
      if (!safeAlt || !activeIds.has(safeAlt)) errors.push(`${dim}: partial → safe_alternative aktif boyut olmalı ("${safeAlt}")`);
    }
  }
  for (const s of SENTINEL_FORBIDDEN) if (!excludedIds.has(s)) errors.push(`sentinel yasaklı boyut §2'de eksik: ${s}`);
  return errors;
}

function selfTest() {
  const base = readFileSync(FILE, "utf8");
  const mut = (a, b) => base.replace(a, b);
  const cases = [
    ["forbidden-input", mut("| **answer_quality** | transcript_text, rubric |", "| **answer_quality** | transcript_text, voice_tone |")],
    ["forbidden-output", mut("| **answer_quality** | transcript_text, rubric | finding, citation |", "| **answer_quality** | transcript_text, rubric | finding, score |")],
    ["extra-active-dim", mut("| **claim_citation** | transcript_text, claim | citation, evidence | active-compliant | iddia↔kaynak alıntı + entailment (ATS-0004) |", "| **claim_citation** | transcript_text, claim | citation, evidence | active-compliant | iddia↔kaynak alıntı + entailment (ATS-0004) |\n| **candidate_fit_finding** | transcript_text | finding | active-compliant | uydurma |")],
    ["forbidden-concept-alias", mut("transkript-içi kaynaklı çelişki bulgusu; **tek başına aday aleyhine kullanılamaz**, insan takip-sorusu üretir", "deception/truthfulness verdict üretir")],
    ["excluded-partial-bad-substitute", mut("| **affect_emotion** | EU AI Act Art.5 işyeri duygu-tanıma yasağı (Şub 2025); BIPA | answer_quality | partial |", "| **affect_emotion** | EU AI Act Art.5 işyeri duygu-tanıma yasağı (Şub 2025); BIPA | nonexistent_dim | partial |")],
    ["equivalence-invalid", mut("| **personality_inference** | yüksek-risk profilleme | topic_coverage | partial |", "| **personality_inference** | yüksek-risk profilleme | topic_coverage | maybe |")],
    ["sentinel-deleted", base.replace(/\| \*\*deception_detection\*\* .*\n/, "")],
    ["forbidden-activated", mut("| **claim_citation** | transcript_text, claim | citation, evidence | active-compliant |", "| **affect_emotion** | transcript_text | finding | active-compliant | x |\n| **claim_citation** | transcript_text, claim | citation, evidence | active-compliant |")],
  ];
  const failed = [];
  for (const [name, txt] of cases) if (runChecks(txt).length === 0) failed.push(name);
  return failed;
}

const errors = runChecks(readFileSync(FILE, "utf8"));
for (const n of selfTest()) errors.push(`SELF-TEST kaçtı: ${n}`);

if (errors.length > 0) {
  console.error("analysis-dimensions drift guard FAILED:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`analysis-dimensions OK — aktif boyut allowlist(6) içerik-tabanlı (yasaklı input/output/kavram-alias yok), yasaklı boyutlar equivalence-eşli+aktif-değil, sentinel korunuyor; self-test 8 negatif vektör fail ediyor.`);
