#!/usr/bin/env node
/**
 * Interview analysis-dimensions drift guard (ATS-0012 · owner kararı 2026-06-29).
 *
 * docs/ai-governance/interview-analysis-dimensions.md:
 *  §1 aktif boyutlar (active-compliant): input ⊆ izinli-metin (yasaklı input YOK);
 *     output ⊆ izinli (score/ranking/affect/personality YOK).
 *  §2 yasaklı boyutlar (excluded-legal): substitute dolu + bir aktif boyuta işaret eder;
 *     sentinel yasaklılar (affect/voice-stress/facial/deception/personality/demographic)
 *     §2'de excluded olarak durmalı ve §1'de AKTİF olamaz.
 *  + gömülü self-test.
 *
 * Bağımsız (npm dep YOK), CI job `analysis-dimensions-guard`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(REPO, "docs/ai-governance/interview-analysis-dimensions.md");

const ALLOWED_INPUT = new Set(["transcript_text", "cv_text", "rubric", "claim"]);
const FORBIDDEN_INPUT = new Set(["audio_waveform", "voice_tone", "video_pixel", "facial", "biometric_signal"]);
const ALLOWED_OUTPUT = new Set(["evidence", "citation", "finding", "coverage", "consistency_flag"]);
const FORBIDDEN_OUTPUT = new Set(["score", "ranking", "affect_label", "personality_label"]);
const SENTINEL_FORBIDDEN = ["affect_emotion", "voice_stress", "facial_microexpression", "deception_detection", "personality_inference", "demographic_inference"];

function section(text, reHead) {
  const lines = text.split("\n");
  let inSec = false; const out = [];
  for (const l of lines) {
    if (/^##\s/.test(l)) { if (inSec) break; if (reHead.test(l)) inSec = true; continue; }
    if (inSec) out.push(l);
  }
  return out;
}
function rows(lines) {
  const r = [];
  for (const l of lines) {
    const t = l.trim();
    if (!/^\|\s*\*\*[a-z]/.test(t)) continue;
    r.push(t.split("|").slice(1, -1).map((x) => x.replace(/\*\*/g, "").trim()));
  }
  return r;
}

function runChecks(text) {
  const errors = [];
  const active = rows(section(text, /^##\s*1\./));   // dimension | input | output | status | not
  const excluded = rows(section(text, /^##\s*2\./)); // dimension | sebep | substitute
  const activeIds = new Set(active.map((r) => r[0]));

  for (const r of active) {
    const [dim, input, output, status] = r;
    if (status !== "active-compliant" && status !== "gate-locked") errors.push(`${dim}: §1 status active-compliant/gate-locked olmalı ("${status}")`);
    for (const i of input.split(",").map((x) => x.trim()).filter(Boolean)) {
      if (FORBIDDEN_INPUT.has(i)) errors.push(`${dim}: YASAK input "${i}" (biyometrik/ses/video — EU duygu yasağı)`);
      else if (!ALLOWED_INPUT.has(i)) errors.push(`${dim}: bilinmeyen input "${i}"`);
    }
    for (const o of output.split(",").map((x) => x.trim()).filter(Boolean)) {
      if (FORBIDDEN_OUTPUT.has(o)) errors.push(`${dim}: YASAK output "${o}" (score/ranking/affect — ATS-0005)`);
      else if (!ALLOWED_OUTPUT.has(o)) errors.push(`${dim}: bilinmeyen output "${o}"`);
    }
    if (SENTINEL_FORBIDDEN.includes(dim)) errors.push(`${dim}: yasaklı boyut §1'de AKTİF olamaz (excluded-legal olmalı)`);
  }

  const excludedIds = new Set();
  for (const r of excluded) {
    const [dim, , substitute] = r;
    excludedIds.add(dim);
    if (!substitute) errors.push(`${dim}: excluded substitute (muadil) boş`);
    else if (!activeIds.has(substitute)) errors.push(`${dim}: substitute "${substitute}" §1 aktif boyutta yok`);
  }
  for (const s of SENTINEL_FORBIDDEN) if (!excludedIds.has(s)) errors.push(`sentinel yasaklı boyut §2'de eksik (sessizce silinemez): ${s}`);
  if (active.length < 4) errors.push(`beklenenden az aktif boyut: ${active.length}`);
  return errors;
}

function selfTest() {
  const base = readFileSync(FILE, "utf8");
  const mut = (a, b) => base.replace(a, b);
  const cases = [
    ["active-forbidden-input", mut("| **answer_quality** | transcript_text, rubric |", "| **answer_quality** | transcript_text, voice_tone |")],
    ["active-forbidden-output", mut("| **answer_quality** | transcript_text, rubric | finding, citation |", "| **answer_quality** | transcript_text, rubric | finding, score |")],
    ["excluded-no-substitute", mut("| **deception_detection** | yüksek-risk + bilimsel-çürük + biyometrik | internal_contradiction |", "| **deception_detection** | yüksek-risk + bilimsel-çürük + biyometrik |  |")],
    ["excluded-bad-substitute", mut("| **affect_emotion** | EU işyeri duygu-tanıma yasağı (Şub 2025); BIPA | answer_quality |", "| **affect_emotion** | EU işyeri duygu-tanıma yasağı (Şub 2025); BIPA | emotion_scoring |")],
    ["sentinel-deleted", base.replace(/\| \*\*deception_detection\*\* .*\n/, "")],
    ["forbidden-activated", mut("| **claim_citation** | transcript_text, claim | citation, evidence | active-compliant |", "| **claim_citation** | transcript_text, claim | citation, evidence | active-compliant |\n| **affect_emotion** | voice_tone | affect_label | active-compliant | x |")],
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
console.log(`analysis-dimensions OK — aktif boyutlar içerik-tabanlı (yasaklı input/output yok), yasaklı boyutlar muadile-eşli + aktif-değil, sentinel'ler korunuyor; self-test 6 negatif vektör fail ediyor.`);
