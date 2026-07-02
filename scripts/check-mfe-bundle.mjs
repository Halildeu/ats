#!/usr/bin/env node
/**
 * F3 MFE bundle minimal-yüzey guard'ı (Codex #68 blocker-1): vite build ÇIKTISININ
 * uygulama+ui chunk'ında (vendor-* HARİÇ — react-dom'un element tabloları taranmaz)
 * governance-riskli sözcük sınıfları ve medya/depolama API kullanımı OLAMAZ.
 * F3 = yalnız segment listesi / S1..Sn / transcript-read; bundle bunu aşarsa
 * dar-yüzey (@ats/ui/f3) delinmiş demektir.
 *
 * Not: token'lar KULLANIM desenidir — ör. tailwind-merge'ün `aspect-video` class-adı
 * medya kullanımı DEĞİLDİR ve yakalanmaz; <video / getUserMedia / MediaRecorder yakalanır.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = join(REPO, "web/mfe-interview-evidence/dist/assets");

const FORBIDDEN = [
  /\bscor(?:e|es|ing)\b/i, /\brating\b/i, /\branking\b/i, /\bconfidence\b/i,
  /\baffect(?:ive)?\b/i, /\bsentiment\b/i, /\bcandidate\b/i, /\be-?mail\b/i,
  /\blocalStorage\b/, /\bsessionStorage\b/, /ag-grid/i, /@mfe\//,
  /<video\b/i, /<audio\b/i, /getUserMedia/, /MediaRecorder/,
];

export function scan(files) {
  const errors = [];
  for (const f of files) {
    for (const re of FORBIDDEN) {
      const m = f.content.match(re);
      if (m) errors.push(`YASAK bundle tokeni "${m[0]}" (${f.name}) — F3 dar-yüzeyi delinmiş`);
    }
  }
  return errors;
}

function selfTest() {
  const failed = [];
  const bad = [
    ["score", 'const s = { score: 1 };'],
    ["localStorage", 'localStorage.setItem("x","y");'],
    ["media-api", "navigator.mediaDevices.getUserMedia({});"],
    ["video-element", '<video src="x">'],
    ["mfe-pkg", 'import x from "@mfe/shared-types";'],
  ];
  for (const [name, content] of bad) {
    if (scan([{ name: "t.js", content }]).length === 0) failed.push(name);
  }
  // benign vektör: tailwind aspect-video class-adı YAKALANMAMALI
  if (scan([{ name: "t.js", content: 'aspect:["auto","square","video"]' }]).length !== 0) {
    failed.push("tailwind-benign-false-positive");
  }
  return failed;
}

if (!existsSync(ASSETS)) {
  console.error("mfe-bundle guard: dist/assets yok — önce `vite build` koşmalı (fail-closed)");
  process.exit(1);
}
const files = readdirSync(ASSETS)
  .filter((n) => n.endsWith(".js") && !n.startsWith("vendor-"))
  .map((n) => ({ name: n, content: readFileSync(join(ASSETS, n), "utf8") }));
if (files.length === 0) {
  console.error("mfe-bundle guard: taranacak uygulama chunk'ı yok (yalnız vendor?) — fail-closed");
  process.exit(1);
}
const errors = scan(files);
for (const n of selfTest()) errors.push(`SELF-TEST kaçtı: ${n}`);
if (errors.length > 0) {
  console.error("mfe-bundle guard FAILED:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`mfe-bundle OK — ${files.length} uygulama-chunk'ı: governance-riskli token / depolama / medya-API yok (vendor-chunk hariç); self-test 5 negatif + 1 benign vektör doğru.`);
