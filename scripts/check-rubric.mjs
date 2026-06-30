#!/usr/bin/env node
/**
 * Rubric standard drift guard (ATS-0005 · Codex 019f13b1 round-2 #5).
 *
 *  1. Minimal JSON-Schema validator (no-dep, $ref/$defs/pattern; unsupported-keyword FAIL).
 *  2. PROTECTED-ATTRIBUTE registry (TR+EN): korumalı-özellik kriterleri (hamilelik/yaş/din/etnik/
 *     sendika/sağlık/cinsiyet/medeni-hal/siyasi...) hiçbir key/value'da görünemez (ayrımcılık + KVKK m.6).
 *  3. SCORING/AFFECT yasağı: score/weight/rank/rating/affect alan adları yok (assist-not-conduct).
 *  4. Her criterion job_relatedness_rationale_ref taşır (iş-ilişkililik zorunlu); criterion_type enum.
 *  5. GÖMÜLÜ self-test (durable regression).
 *
 * Bağımsız (npm dep YOK), CI job `rubric-guard`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA = JSON.parse(readFileSync(join(REPO, "contracts/schemas/rubric.schema.json"), "utf8"));
const SAMPLE = JSON.parse(readFileSync(join(REPO, "contracts/samples/rubric.sample.json"), "utf8"));

const PROTECTED_RE = [
  /hamile|gebe|pregnan/i, /\byaş\b|\bage\b|doğum.?tarih|birth.?date/i, /\bdin\b|inanç|mezhep|religio/i,
  /etnik|ethnic|\bırk\b|\brace\b|köken|milliyet|nationalit/i, /sendika|\bunion\b/i,
  /sağlık|hastalık|engelli|disabil|\bhealth\b|medical/i, /cinsel|cinsiyet|gender|\bsex\b|lgbt/i,
  /medeni.?hal|marital|\bevli\b|\bbekar\b/i, /siyasi|politik|political|\bparti\b/i,
];
const SCORING_RE = [/score|skor|puan/i, /weight|ağırlık/i, /rank|ranking|sıralama/i, /rating/i, /affect|sentiment|emotion|duygu/i];
const KNOWN_KW = new Set(["$schema", "$id", "$defs", "$ref", "title", "description", "type", "const", "enum", "required", "properties", "additionalProperties", "items", "minItems", "maxItems", "uniqueItems", "minLength", "maxLength", "pattern"]);
const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const typeOf = (n) => (Array.isArray(n) ? "array" : n === null ? "null" : typeof n);

function runChecks(schema, sample) {
  const errors = [];
  const resolveRef = (r) => r.replace("#/", "").split("/").reduce((o, k) => o?.[k], schema);
  function checkKeywords(s, path) {
    if (!s || typeof s !== "object" || Array.isArray(s)) return;
    for (const k of Object.keys(s)) if (!KNOWN_KW.has(k)) errors.push(`schema ${path}: desteklenmeyen keyword "${k}"`);
    if ("$ref" in s) for (const k of Object.keys(s)) if (!["$ref", "title", "description"].includes(k)) errors.push(`schema ${path}: $ref sibling "${k}"`);
    if (s.properties) for (const [k, v] of Object.entries(s.properties)) checkKeywords(v, `${path}.${k}`);
    if (s.items) checkKeywords(s.items, `${path}[]`);
    if (s.$defs) for (const [k, v] of Object.entries(s.$defs)) checkKeywords(v, `${path}.$defs.${k}`);
  }
  checkKeywords(schema, "$");
  function validate(node, sc, path) {
    if (sc.$ref) { validate(node, resolveRef(sc.$ref), path); return; }
    if (sc.type) { const t = typeOf(node), want = sc.type === "object" ? "object" : sc.type; if (t !== want) { errors.push(`${path}: tip "${t}"≠"${sc.type}"`); return; } }
    if ("const" in sc && !deepEqual(node, sc.const)) errors.push(`${path}: const değil`);
    if (sc.enum && !sc.enum.some((e) => deepEqual(node, e))) errors.push(`${path}: enum dışı "${node}"`);
    if (sc.minLength != null && typeof node === "string" && node.length < sc.minLength) errors.push(`${path}: minLength`);
    if (sc.pattern && typeof node === "string" && !new RegExp(sc.pattern).test(node)) errors.push(`${path}: pattern ihlali "${node}"`);
    if (sc.type === "array" && Array.isArray(node)) {
      if (sc.minItems != null && node.length < sc.minItems) errors.push(`${path}: minItems`);
      if (sc.uniqueItems && new Set(node.map((x) => JSON.stringify(x))).size !== node.length) errors.push(`${path}: uniqueItems`);
      if (sc.items) node.forEach((el, i) => validate(el, sc.items, `${path}[${i}]`));
    }
    if (sc.type === "object" && node && typeof node === "object" && !Array.isArray(node)) {
      for (const req of sc.required || []) if (!(req in node)) errors.push(`${path}: required "${req}" eksik`);
      if (sc.additionalProperties === false) for (const k of Object.keys(node)) if (!(sc.properties && k in sc.properties)) errors.push(`${path}: izinsiz property "${k}"`);
      for (const [k, sub] of Object.entries(sc.properties || {})) if (k in node) validate(node[k], sub, `${path}.${k}`);
    }
  }
  validate(sample, schema, "$");
  // protected-attribute + scoring scan (key + value, sample)
  const scan = (obj) => {
    if (!obj || typeof obj !== "object") return;
    for (const [k, v] of Object.entries(obj)) {
      for (const re of PROTECTED_RE) { if (re.test(k)) errors.push(`KORUMALI-ÖZELLIK alan adı "${k}" (ayrımcılık/KVKK m.6)`); if (typeof v === "string" && re.test(v)) errors.push(`KORUMALI-ÖZELLIK değer "${v}"`); }
      for (const re of SCORING_RE) { if (re.test(k)) errors.push(`YASAK scoring/affect alan adı "${k}" (assist-not-conduct)`); }
      if (typeof v === "object") scan(v);
    }
  };
  scan(sample);
  // her criterion job_relatedness_rationale_ref + criterion_type (şema zaten zorunlu kılar; ek güvence)
  for (const c of sample.criteria || []) {
    if (!c.job_relatedness_rationale_ref) errors.push(`criterion ${c.criterion_id}: job_relatedness_rationale_ref eksik`);
  }
  return errors;
}

function selfTest() {
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const cases = [
    ["protected-criterion-id", () => { const s = clone(SAMPLE); s.criteria[0].criterion_id = "c-hamilelik-durumu"; return [SCHEMA, s]; }],
    ["protected-age", () => { const s = clone(SAMPLE); s.criteria[0].criterion_id = "c-yaş-30plus"; return [SCHEMA, s]; }],
    ["protected-value", () => { const s = clone(SAMPLE); s.criteria[0].job_relatedness_rationale_ref = "jr-din-uygunluk"; return [SCHEMA, s]; }],
    ["scoring-field", () => { const s = clone(SAMPLE); s.criteria[0].weight = 5; return [SCHEMA, s]; }],
    ["bad-criterion-type", () => { const s = clone(SAMPLE); s.criteria[0].criterion_type = "personality"; return [SCHEMA, s]; }],
    ["free-text-rationale", () => { const s = clone(SAMPLE); s.criteria[0].job_relatedness_rationale_ref = "çünkü genç lazım"; return [SCHEMA, s]; }],
    ["missing-job-relatedness", () => { const s = clone(SAMPLE); delete s.criteria[0].job_relatedness_rationale_ref; return [SCHEMA, s]; }],
    ["unsupported-keyword", () => { const sc = clone(SCHEMA); sc.properties.rubric_version_ref = { oneOf: [{ type: "string" }] }; return [sc, SAMPLE]; }],
  ];
  const failed = [];
  for (const [name, build] of cases) { const [sc, sm] = build(); if (runChecks(sc, sm).length === 0) failed.push(name); }
  return failed;
}

const errors = runChecks(SCHEMA, SAMPLE);
for (const n of selfTest()) errors.push(`SELF-TEST kaçtı: ${n}`);

if (errors.length > 0) {
  console.error("rubric drift guard FAILED:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`rubric OK — sample schema'ya uyar; korumalı-özellik + scoring/affect alanı yok; her criterion job-related; gömülü self-test 8 negatif vektör fail ediyor.`);
