#!/usr/bin/env node
/**
 * Web foundation drift guard (ATS-0011 operationalized · Codex 019f18f6 REVISE absorb).
 *
 *  1. design-tokens: kind∈{text,ui}; min_ratio FINITE + ≥ WCAG min (text 4.5 / ui 3.0); WCAG
 *     kontrast oranı HESAPLANIR (sRGB→luminance→ratio) ≥ min_ratio. target≥24 (2.5.8); focus-visible.
 *  2. i18n tr-TR: locale=tr-TR; key dot.case; boş-değer-yok; ICU brace dengeli.
 *  3. component-contracts: forbidden raw-PII/score/affect alias (camel+snake; yorum hariç) YOK;
 *     serbest-metin prop YOK (`: string` yasak → MessageKey/OpaqueRef zorunlu); sentinel'ler.
 *  4. web/ PATH-scan: çalışan-UI YOK — .tsx/.jsx/.stories yasak; .ts/.js içinde react/react-dom/
 *     createRoot/render(/@testing-library/storybook/axe runtime pattern YASAK (no-runtime iddiası enforce).
 *  5. Gömülü self-test (durable regression).
 *
 * Gate-safe: token+i18n+tip-sözleşmesi; runtime/JSX YOK. CI job `web-foundation-guard`.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = join(REPO, "web");
const TOKENS = JSON.parse(readFileSync(join(WEB, "design-system/tokens.json"), "utf8"));
const I18N = JSON.parse(readFileSync(join(WEB, "i18n/tr-TR.json"), "utf8"));
const CONTRACTS = readFileSync(join(WEB, "src/contracts/component-contracts.ts"), "utf8");

const FORBIDDEN_FIELD = [
  /candidate[_]?(full|display)?[_]?name/i, /\bfull[_]?name\b/i, /display[_]?name/i,
  /e[-_]?mail|email[_]?address|email[_]?hash/i, /phone[_]?number|\bgsm\b|\bmobile\b/i,
  /tckn|national[_]?id|tc[_]?kimlik/i, /\bscore\b|skor|puan/i, /\brank(ing)?\b|siralama/i,
  /rating/i, /affect|sentiment|emotion|duygu/i, /raw[_]?transcript|transcript[_]?body|raw[_]?media|media[_]?blob/i,
];
const RUNTIME_PAT = [/from\s+["']react(-dom)?["']/, /require\(\s*["']react/, /import\(\s*["']react/, /createRoot|ReactDOM\b/, /@testing-library/, /storybook/i, /jest-axe|axe-core/, /\brender\s*\(/];

const lum = (hex) => {
  const m = hex.replace("#", "");
  const ch = [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
};
const ratio = (fg, bg) => { const a = lum(fg), b = lum(bg); const [hi, lo] = a >= b ? [a, b] : [b, a]; return (hi + 0.05) / (lo + 0.05); };

function runChecks(tokens, i18n, contracts) {
  const errors = [];
  // 1. tokens
  if (!Array.isArray(tokens.color_pairs) || tokens.color_pairs.length < 5) errors.push("tokens: color_pairs < 5");
  for (const p of tokens.color_pairs || []) {
    if (!/^#[0-9A-Fa-f]{6}$/.test(p.fg || "") || !/^#[0-9A-Fa-f]{6}$/.test(p.bg || "")) { errors.push(`token ${p.id}: geçersiz hex`); continue; }
    if (p.kind !== "text" && p.kind !== "ui") { errors.push(`token ${p.id}: kind text|ui olmalı ("${p.kind}")`); continue; }
    if (!Number.isFinite(p.min_ratio)) { errors.push(`token ${p.id}: min_ratio sayısal değil`); continue; }
    const need = p.kind === "ui" ? 3.0 : 4.5;
    if (p.min_ratio < need) errors.push(`token ${p.id}: min_ratio ${p.min_ratio} < WCAG ${need} (${p.kind})`);
    const r = ratio(p.fg, p.bg);
    if (r < p.min_ratio) errors.push(`token ${p.id}: HESAPLANAN kontrast ${r.toFixed(2)} < min ${p.min_ratio} (${p.fg}/${p.bg})`);
  }
  if (!(tokens.target_size_px?.min >= 24)) errors.push("tokens: target_size_px.min ≥ 24 (WCAG 2.5.8)");
  if (!tokens.focus_visible) errors.push("tokens: focus_visible eksik (WCAG 2.4.7)");

  // 2. i18n
  if (i18n.locale !== "tr-TR") errors.push(`i18n: locale tr-TR olmalı ("${i18n.locale}")`);
  const msgs = i18n.messages || {};
  if (Object.keys(msgs).length < 10) errors.push("i18n: < 10 mesaj");
  for (const [k, v] of Object.entries(msgs)) {
    if (!/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)+$/.test(k)) errors.push(`i18n key dot.case değil: "${k}"`);
    if (typeof v !== "string" || v.trim() === "") errors.push(`i18n boş değer: "${k}"`);
    if (typeof v === "string" && v.split("{").length !== v.split("}").length) errors.push(`i18n ICU brace dengesiz: "${k}"`);
  }

  // 3. contracts (yorum strip)
  const code = contracts.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const re of FORBIDDEN_FIELD) if (re.test(code)) errors.push(`contracts: YASAK alan deseni ${re}`);
  if (/:\s*string\b/.test(code) || /:\s*string\[\]/.test(code)) errors.push("contracts: serbest-metin prop (`: string`) YASAK → MessageKey/OpaqueRef kullan");
  for (const re of RUNTIME_PAT) if (re.test(code)) errors.push(`contracts: runtime pattern ${re} YASAK`);
  for (const must of ["MessageKey", "OpaqueRef", "EvidenceBadgeContract", "ConsentBannerContract", "ReviewPanelContract"]) if (!contracts.includes(must)) errors.push(`contracts: sentinel "${must}" eksik`);
  if (!/unsupported/.test(contracts)) errors.push("contracts: entailment unsupported notice eksik");
  return errors;
}

// 4. web/ PATH-scan (dosya-sistemi; çalışan UI yok iddiası)
function pathScan() {
  const errors = [];
  let files;
  try { files = readdirSync(WEB, { recursive: true }); } catch { return ["web/ okunamadı"]; }
  for (const f of files) {
    const rel = String(f);
    if (/\.(tsx|jsx)$/.test(rel)) errors.push(`web/${rel}: .tsx/.jsx YASAK (çalışan-UI; runtime gate-locked)`);
    if (/\.stories\./.test(rel)) errors.push(`web/${rel}: story dosyası YASAK (runtime gate-locked)`);
    if (/\.(ts|js|mjs|cjs)$/.test(rel)) {
      let body = ""; try { body = readFileSync(join(WEB, rel), "utf8"); } catch { continue; }
      const clean = body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      for (const re of RUNTIME_PAT) if (re.test(clean)) errors.push(`web/${rel}: runtime pattern ${re} YASAK`);
    }
  }
  return errors;
}

function selfTest() {
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const cases = [
    ["low-contrast", () => { const t = clone(TOKENS); t.color_pairs[0] = { id: "bad", fg: "#AAAAAA", bg: "#FFFFFF", kind: "text", min_ratio: 4.5 }; return [t, I18N, CONTRACTS]; }],
    ["declared-below-wcag", () => { const t = clone(TOKENS); t.color_pairs[0].min_ratio = 2.0; return [t, I18N, CONTRACTS]; }],
    ["missing-min-ratio", () => { const t = clone(TOKENS); delete t.color_pairs[0].min_ratio; return [t, I18N, CONTRACTS]; }],
    ["nan-min-ratio", () => { const t = clone(TOKENS); t.color_pairs[0].min_ratio = "abc"; return [t, I18N, CONTRACTS]; }],
    ["invalid-kind", () => { const t = clone(TOKENS); t.color_pairs[0].kind = "decorative"; return [t, I18N, CONTRACTS]; }],
    ["target-below-24", () => { const t = clone(TOKENS); t.target_size_px.min = 16; return [t, I18N, CONTRACTS]; }],
    ["wrong-locale", () => { const i = clone(I18N); i.locale = "en-US"; return [TOKENS, i, CONTRACTS]; }],
    ["empty-message", () => { const i = clone(I18N); i.messages["common.save"] = ""; return [TOKENS, i, CONTRACTS]; }],
    ["icu-unbalanced", () => { const i = clone(I18N); i.messages["evidence.citationCount"] = "{count, plural, one {# alıntı"; return [TOKENS, i, CONTRACTS]; }],
    ["forbidden-field-camel", () => [TOKENS, I18N, CONTRACTS + "\nexport interface Bad { readonly candidateEmail: OpaqueRef }\n"]],
    ["free-text-prop", () => [TOKENS, I18N, CONTRACTS + "\nexport interface Bad2 { readonly title: string }\n"]],
    ["react-import", () => [TOKENS, I18N, "import React from 'react'\n" + CONTRACTS]],
  ];
  const failed = [];
  for (const [name, build] of cases) { const [t, i, c] = build(); if (runChecks(t, i, c).length === 0) failed.push(name); }
  return failed;
}

const errors = [...runChecks(TOKENS, I18N, CONTRACTS), ...pathScan()];
for (const n of selfTest()) errors.push(`SELF-TEST kaçtı: ${n}`);

if (errors.length > 0) {
  console.error("web-foundation drift guard FAILED:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`web-foundation OK — ${TOKENS.color_pairs.length} token (kontrast HESAPLANDI ≥WCAG), ${Object.keys(I18N.messages).length} tr-TR mesaj, contracts forbidden/free-text/runtime temiz, web/ path-scan çalışan-UI yok; self-test 12 negatif vektör fail ediyor.`);
