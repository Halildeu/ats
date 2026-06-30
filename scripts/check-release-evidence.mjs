#!/usr/bin/env node
/**
 * Release-evidence manifest drift guard (ATS-0007 §6 · Codex 019f13b1 round-2 #8).
 *
 *  1. Minimal JSON-Schema validator (no-dep; $ref, $defs, pattern, minItems, minimum, integer; unsupported-kw FAIL).
 *  2. Cross-invariant: vuln_scan.critical===0 && high===0 (shippable release; çözülmemiş crit/high YASAK);
 *     image/release MOVING-TAG yasak (:latest/:main/:stable/:edge/:dev — digest-pin zorunlu).
 *  3. Gömülü self-test (durable regression).
 *
 * Gate-safe: bu bir SÖZLEŞMEdir; gerçek build evidence (cosign/SBOM/SLSA) P3/gate-locked.
 * Bağımsız (npm dep YOK), CI job `release-evidence-guard`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA = JSON.parse(readFileSync(join(REPO, "contracts/schemas/release-evidence.schema.json"), "utf8"));
const SAMPLE = JSON.parse(readFileSync(join(REPO, "contracts/samples/release-evidence.sample.json"), "utf8"));

const KNOWN_KW = new Set(["$schema", "$id", "$defs", "$ref", "title", "description", "type", "const", "enum", "required", "properties", "additionalProperties", "items", "minItems", "maxItems", "uniqueItems", "minLength", "maxLength", "pattern", "minimum", "maximum"]);
const MOVING_TAG = /:(latest|main|stable|edge|dev)\b/i;
const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const typeOf = (n) => (Array.isArray(n) ? "array" : n === null ? "null" : Number.isInteger(n) ? "integer" : typeof n);

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
    if (sc.type) { const t = typeOf(node), want = sc.type; const ok = want === "object" ? t === "object" : want === "number" ? (t === "number" || t === "integer") : t === want; if (!ok) { errors.push(`${path}: tip "${t}"≠"${want}"`); return; } }
    if ("const" in sc && !deepEqual(node, sc.const)) errors.push(`${path}: const "${JSON.stringify(sc.const)}" değil`);
    if (sc.enum && !sc.enum.some((e) => deepEqual(node, e))) errors.push(`${path}: enum dışı "${node}"`);
    if (sc.minLength != null && typeof node === "string" && node.length < sc.minLength) errors.push(`${path}: minLength`);
    if (sc.maxLength != null && typeof node === "string" && node.length > sc.maxLength) errors.push(`${path}: maxLength`);
    if (sc.pattern && typeof node === "string" && !new RegExp(sc.pattern).test(node)) errors.push(`${path}: pattern ihlali "${node}"`);
    if (sc.minimum != null && typeof node === "number" && node < sc.minimum) errors.push(`${path}: minimum`);
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

  if (sample.vuln_scan) {
    if (sample.vuln_scan.critical !== 0) errors.push(`vuln_scan.critical=${sample.vuln_scan.critical} (shippable: çözülmemiş critical YASAK)`);
    if (sample.vuln_scan.high !== 0) errors.push(`vuln_scan.high=${sample.vuln_scan.high} (shippable: çözülmemiş high YASAK)`);
  }
  if (MOVING_TAG.test(sample.release_ref || "")) errors.push(`release_ref moving-tag (digest-pin zorunlu): "${sample.release_ref}"`);
  for (const img of sample.images || []) if (MOVING_TAG.test(img.name || "")) errors.push(`image moving-tag (digest-pin zorunlu): "${img.name}"`);
  return errors;
}

function selfTest() {
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const cases = [
    ["unresolved-critical", () => { const s = clone(SAMPLE); s.vuln_scan.critical = 2; return [SCHEMA, s]; }],
    ["unresolved-high", () => { const s = clone(SAMPLE); s.vuln_scan.high = 5; return [SCHEMA, s]; }],
    ["moving-tag-release", () => { const s = clone(SAMPLE); s.release_ref = "ats-meeting-svc:latest"; return [SCHEMA, s]; }],
    ["moving-tag-image", () => { const s = clone(SAMPLE); s.images[0].name = "ghcr.io/halildeu/ats-meeting:main"; return [SCHEMA, s]; }],
    ["bad-digest", () => { const s = clone(SAMPLE); s.images[0].digest = "deadbeef"; return [SCHEMA, s]; }],
    ["verified-offline-false", () => { const s = clone(SAMPLE); s.signature.verified_offline = false; return [SCHEMA, s]; }],
    ["disposition-not-resolved", () => { const s = clone(SAMPLE); s.disposition.critical_high_resolved = false; return [SCHEMA, s]; }],
    ["missing-provenance", () => { const s = clone(SAMPLE); delete s.provenance; return [SCHEMA, s]; }],
    ["bad-slsa", () => { const s = clone(SAMPLE); s.provenance.slsa_level = "L9"; return [SCHEMA, s]; }],
    ["unsupported-keyword", () => { const sc = clone(SCHEMA); sc.properties.release_ref = { oneOf: [{ type: "string" }] }; return [sc, SAMPLE]; }],
  ];
  const failed = [];
  for (const [name, build] of cases) { const [sc, sm] = build(); if (runChecks(sc, sm).length === 0) failed.push(name); }
  return failed;
}

const errors = runChecks(SCHEMA, SAMPLE);
for (const n of selfTest()) errors.push(`SELF-TEST kaçtı: ${n}`);

if (errors.length > 0) {
  console.error("release-evidence drift guard FAILED:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`release-evidence OK — sample schema'ya uyar; digest-pin (moving-tag yasak) + vuln crit/high=0 + offline-verify + SLSA/SBOM/signature/model-hash zorunlu; self-test 10 negatif vektör fail ediyor.`);
