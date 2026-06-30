#!/usr/bin/env node
/**
 * Web foundation drift guard (ATS-0011 operationalized · owner ürün-yüzeyi direktifi 2026-06-29).
 *
 *  1. design-tokens: her color_pair WCAG kontrast oranı HESAPLANIR (sRGB→luminance→ratio) ve
 *     deklare min_ratio (text 4.5 / ui 3.0) ile karşılaştırılır — sadece beyan değil, fiili kontrol.
 *     target_size_px.min ≥ 24 (WCAG 2.5.8); focus_visible mevcut.
 *  2. i18n tr-TR catalog: locale=tr-TR (I18N-1); mesajlar boş değil; key dot.case; ICU brace dengeli.
 *  3. component-contracts: forbidden raw-PII/score/affect alan adı YOK (ATS-0003/0005); serbest-metin
 *     prop YOK (metin alanları MessageKey).
 *  4. Gömülü self-test (durable regression).
 *
 * Gate-safe: tasarım-token + i18n + tip sözleşmesi; runtime/JSX YOK. CI job `web-foundation-guard`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const TOKENS = JSON.parse(readFileSync(join(REPO, "web/design-system/tokens.json"), "utf8"));
const I18N = JSON.parse(readFileSync(join(REPO, "web/i18n/tr-TR.json"), "utf8"));
const CONTRACTS = readFileSync(join(REPO, "web/src/contracts/component-contracts.ts"), "utf8");

const FORBIDDEN_FIELD = [/candidate_?name/i, /full_?name/i, /\be_?mail\b/i, /phone|gsm/i, /tckn|national_?id/i, /\bscore\b|skor|puan/i, /\brank/i, /rating/i, /affect|sentiment|emotion|duygu/i, /raw_?transcript|raw_?media/i];

// WCAG relative luminance + contrast ratio
function lum(hex) {
  const m = hex.replace("#", "");
  const ch = [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
function ratio(fg, bg) {
  const a = lum(fg), b = lum(bg);
  const [hi, lo] = a >= b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

function runChecks(tokens, i18n, contracts) {
  const errors = [];
  // 1. tokens
  if (!Array.isArray(tokens.color_pairs) || tokens.color_pairs.length < 5) errors.push("tokens: color_pairs < 5");
  for (const p of tokens.color_pairs || []) {
    if (!/^#[0-9A-Fa-f]{6}$/.test(p.fg || "") || !/^#[0-9A-Fa-f]{6}$/.test(p.bg || "")) { errors.push(`token ${p.id}: geçersiz hex`); continue; }
    const r = ratio(p.fg, p.bg);
    const need = p.kind === "ui" ? 3.0 : 4.5;
    if (p.min_ratio < need) errors.push(`token ${p.id}: min_ratio ${p.min_ratio} < WCAG ${need} (${p.kind})`);
    if (r < p.min_ratio) errors.push(`token ${p.id}: HESAPLANAN kontrast ${r.toFixed(2)} < min ${p.min_ratio} (fg ${p.fg}/bg ${p.bg})`);
  }
  if (!(tokens.target_size_px?.min >= 24)) errors.push(`tokens: target_size_px.min ≥ 24 olmalı (WCAG 2.5.8)`);
  if (!tokens.focus_visible) errors.push("tokens: focus_visible eksik (WCAG 2.4.7)");

  // 2. i18n
  if (i18n.locale !== "tr-TR") errors.push(`i18n: locale tr-TR olmalı (I18N-1) "${i18n.locale}"`);
  const msgs = i18n.messages || {};
  if (Object.keys(msgs).length < 10) errors.push("i18n: < 10 mesaj");
  for (const [k, v] of Object.entries(msgs)) {
    if (!/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)+$/.test(k)) errors.push(`i18n key dot.case değil: "${k}"`);
    if (typeof v !== "string" || v.trim() === "") errors.push(`i18n boş değer: "${k}"`);
    if (typeof v === "string" && (v.split("{").length !== v.split("}").length)) errors.push(`i18n ICU brace dengesiz: "${k}"`);
  }

  // 3. contracts — forbidden scan yalnız KOD'da (yorumlar hariç; "score/affect YOK" açıklaması serbest)
  const code = contracts.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const re of FORBIDDEN_FIELD) if (re.test(code)) errors.push(`contracts: YASAK alan deseni ${re} (ham-PII/score/affect)`);
  if (/import\s+.*from\s+["']react["']/.test(code)) errors.push("contracts: React runtime import YASAK (gate-safe tip sözleşmesi)");
  for (const must of ["MessageKey", "OpaqueRef", "EvidenceBadgeContract", "ConsentBannerContract", "ReviewPanelContract"]) {
    if (!contracts.includes(must)) errors.push(`contracts: sentinel "${must}" eksik`);
  }
  // entailment unsupported sözleşmede olmalı (karar-kanıtı uyarısı)
  if (!/unsupported/.test(contracts)) errors.push("contracts: entailment unsupported notice eksik");
  return errors;
}

function selfTest() {
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const cases = [
    ["low-contrast", () => { const t = clone(TOKENS); t.color_pairs[0] = { id: "bad", fg: "#AAAAAA", bg: "#FFFFFF", kind: "text", min_ratio: 4.5 }; return [t, I18N, CONTRACTS]; }],
    ["declared-below-wcag", () => { const t = clone(TOKENS); t.color_pairs[0].min_ratio = 2.0; return [t, I18N, CONTRACTS]; }],
    ["target-below-24", () => { const t = clone(TOKENS); t.target_size_px.min = 16; return [t, I18N, CONTRACTS]; }],
    ["wrong-locale", () => { const i = clone(I18N); i.locale = "en-US"; return [TOKENS, i, CONTRACTS]; }],
    ["empty-message", () => { const i = clone(I18N); i.messages["common.save"] = ""; return [TOKENS, i, CONTRACTS]; }],
    ["icu-unbalanced", () => { const i = clone(I18N); i.messages["evidence.citationCount"] = "{count, plural, one {# alıntı"; return [TOKENS, i, CONTRACTS]; }],
    ["forbidden-field", () => [TOKENS, I18N, CONTRACTS + "\nexport interface Bad { candidate_name: string }\n"]],
    ["react-import", () => [TOKENS, I18N, "import React from 'react'\n" + CONTRACTS]],
  ];
  const failed = [];
  for (const [name, build] of cases) { const [t, i, c] = build(); if (runChecks(t, i, c).length === 0) failed.push(name); }
  return failed;
}

const errors = runChecks(TOKENS, I18N, CONTRACTS);
for (const n of selfTest()) errors.push(`SELF-TEST kaçtı: ${n}`);

if (errors.length > 0) {
  console.error("web-foundation drift guard FAILED:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`web-foundation OK — ${TOKENS.color_pairs.length} token (kontrast HESAPLANDI ≥WCAG), ${Object.keys(I18N.messages).length} tr-TR mesaj, component-contracts forbidden-field temiz; gömülü self-test 8 negatif vektör fail ediyor.`);
