#!/usr/bin/env node
/**
 * Connector-capability registry drift guard (ATS-0001/0005 · Codex 019f13b1 round-2 #9).
 *
 *  1. Minimal JSON-Schema validator (no-dep, $ref/$defs/pattern; unsupported-kw FAIL).
 *  2. FORBIDDEN write-back deep-scan: candidate/job/stage/score/reject/advance/hire alanları
 *     (key+value) hiçbir yerde görünemez (ATS-0001 boundary + ATS-0005 assist-not-conduct).
 *  3. Cross-invariant:
 *     - narrow_writeback → writeback_fields(≥1) + status=p1-evidence-required + p1_evidence(ats_name+api_verified+loi).
 *     - export → writeback_fields YOK (yalnız write-back modunda).
 *     - connector_id tekil.
 *  4. Gömülü self-test (durable regression).
 *
 * Gate-safe: SÖZLEŞME; runtime connector P1/gate-locked.
 * Bağımsız (npm dep YOK), CI job `connector-capability-guard`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA = JSON.parse(readFileSync(join(REPO, "contracts/schemas/connector-capability.schema.json"), "utf8"));
const SAMPLE = JSON.parse(readFileSync(join(REPO, "contracts/samples/connector-capability.sample.json"), "utf8"));

const FORBIDDEN_WB = [/candidate/i, /\baday\b/i, /\bjob\b/i, /\bstage\b/i, /reject/i, /advance/i, /\bhire\b/i, /score|skor|puan/i, /rating|ranking/i, /disposition_decision/i];
const KNOWN_KW = new Set(["$schema", "$id", "$defs", "$ref", "title", "description", "type", "const", "enum", "required", "properties", "additionalProperties", "items", "minItems", "maxItems", "uniqueItems", "minLength", "maxLength", "pattern"]);
const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const typeOf = (n) => (Array.isArray(n) ? "array" : n === null ? "null" : typeof n);
const canon = (v) => Array.isArray(v) ? "[" + v.map(canon).join(",") + "]" : v && typeof v === "object" ? "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}" : JSON.stringify(v);

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
    if (sc.maxLength != null && typeof node === "string" && node.length > sc.maxLength) errors.push(`${path}: maxLength`);
    if (sc.pattern && typeof node === "string" && !new RegExp(sc.pattern).test(node)) errors.push(`${path}: pattern "${node}"`);
    if (sc.type === "array" && Array.isArray(node)) {
      if (sc.minItems != null && node.length < sc.minItems) errors.push(`${path}: minItems`);
      if (sc.uniqueItems && new Set(node.map(canon)).size !== node.length) errors.push(`${path}: uniqueItems`);
      if (sc.items) node.forEach((el, i) => validate(el, sc.items, `${path}[${i}]`));
    }
    if (sc.type === "object" && node && typeof node === "object" && !Array.isArray(node)) {
      for (const req of sc.required || []) if (!(req in node)) errors.push(`${path}: required "${req}" eksik`);
      if (sc.additionalProperties === false) for (const k of Object.keys(node)) if (!(sc.properties && k in sc.properties)) errors.push(`${path}: izinsiz property "${k}"`);
      for (const [k, sub] of Object.entries(sc.properties || {})) if (k in node) validate(node[k], sub, `${path}.${k}`);
    }
  }
  validate(sample, schema, "$");

  // forbidden write-back deep-scan (schema property adları + sample key/value)
  const scan = (obj, where) => {
    if (!obj || typeof obj !== "object") return;
    for (const [k, v] of Object.entries(obj)) {
      for (const re of FORBIDDEN_WB) { if (re.test(k)) errors.push(`YASAK write-back alanı "${k}" (${where}; ATS-0001/0005)`); if (typeof v === "string" && re.test(v)) errors.push(`YASAK write-back değer "${v}" (${where})`); }
      if (typeof v === "object") scan(v, where);
    }
  };
  scan(schema.properties, "schema");
  scan(sample, "sample");

  // cross-invariant
  const ids = (sample.connectors || []).map((c) => c.connector_id);
  if (new Set(ids).size !== ids.length) errors.push("connector_id tekil değil");
  for (const c of sample.connectors || []) {
    if (c.mode === "narrow_writeback") {
      if (!(c.writeback_fields && c.writeback_fields.length >= 1)) errors.push(`${c.connector_id}: narrow_writeback writeback_fields(≥1) gerek`);
      if (c.status !== "p1-evidence-required") errors.push(`${c.connector_id}: narrow_writeback status=p1-evidence-required olmalı`);
      if (!c.p1_evidence || !c.p1_evidence.ats_name || c.p1_evidence.api_verified == null || !c.p1_evidence.loi_condition) errors.push(`${c.connector_id}: narrow_writeback p1_evidence(ats_name+api_verified+loi) gerek`);
    }
    if (c.mode === "export" && c.writeback_fields && c.writeback_fields.length > 0) errors.push(`${c.connector_id}: export modunda writeback_fields YASAK`);
  }
  return errors;
}

function selfTest() {
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const cases = [
    ["forbidden-writeback-enum", () => { const s = clone(SAMPLE); s.connectors[1].writeback_fields = ["candidate_status"]; return [SCHEMA, s]; }],
    ["forbidden-key-deep", () => { const s = clone(SAMPLE); s.connectors[0].candidate_id_field = "x"; return [SCHEMA, s]; }],
    ["forbidden-value-score", () => { const s = clone(SAMPLE); s.connectors[0].ats_ref = "ats-score-sync"; return [SCHEMA, s]; }],
    ["writeback-without-p1", () => { const s = clone(SAMPLE); delete s.connectors[1].p1_evidence; return [SCHEMA, s]; }],
    ["writeback-wrong-status", () => { const s = clone(SAMPLE); s.connectors[1].status = "gate-locked"; return [SCHEMA, s]; }],
    ["export-with-writeback", () => { const s = clone(SAMPLE); s.connectors[0].writeback_fields = ["dossier_url"]; return [SCHEMA, s]; }],
    ["duplicate-connector-id", () => { const s = clone(SAMPLE); s.connectors.push(clone(s.connectors[0])); return [SCHEMA, s]; }],
    ["bad-mode", () => { const s = clone(SAMPLE); s.connectors[0].mode = "full_sync"; return [SCHEMA, s]; }],
    ["bad-auth", () => { const s = clone(SAMPLE); s.connectors[0].auth_model = "ldap"; return [SCHEMA, s]; }],
    ["unsupported-keyword", () => { const sc = clone(SCHEMA); sc.properties.connectors.items.properties.mode = { oneOf: [{ type: "string" }] }; return [sc, SAMPLE]; }],
  ];
  const failed = [];
  for (const [name, build] of cases) { const [sc, sm] = build(); if (runChecks(sc, sm).length === 0) failed.push(name); }
  return failed;
}

const errors = runChecks(SCHEMA, SAMPLE);
for (const n of selfTest()) errors.push(`SELF-TEST kaçtı: ${n}`);

if (errors.length > 0) {
  console.error("connector-capability drift guard FAILED:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`connector-capability OK — ${SAMPLE.connectors.length} connector; write-back dar (candidate/score/stage YASAK); narrow_writeback p1-evidence-gated; self-test 10 negatif vektör fail ediyor.`);
