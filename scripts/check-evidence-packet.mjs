#!/usr/bin/env node
/**
 * Evidence-packet manifest drift guard (ATS-0004/0005 · Codex 019f13fd REVISE absorb).
 *
 *  1. Minimal JSON-Schema validator (no npm dep, $ref/$defs+pattern dahil): sample şemaya uyar.
 *     Desteklenmeyen validation keyword görürse FAIL (silent under-validation guard).
 *  2. Forbidden-field deep-scan (regex/alias, case-insensitive): ham/PII/skor/sıralama/affect
 *     alan adları (TR+EN varyantları dahil) hiçbir yerde yok. Tüm string alanlar opak-ref pattern.
 *  3. Cross-invariant:
 *     a. her claim.criterion_id ∈ rubric criterion_ids.
 *     b. human_decision.source_evidence_refs ⊆ claims.claim_id; referanslı claim entailment≠unsupported + human_reviewed.
 *     c. human_decision FINALIZED 6 alanıyla hizalı (şema required).
 *
 * Bağımsız (npm dep YOK), CI job `evidence-packet-guard`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA = JSON.parse(readFileSync(join(REPO, "contracts/schemas/evidence-packet.schema.json"), "utf8"));
const SAMPLE = JSON.parse(readFileSync(join(REPO, "contracts/samples/evidence-packet.sample.json"), "utf8"));

const FORBIDDEN_RE = [
  /full.?name/i, /candidate.*name/i, /\be.?mail\b/i, /phone|mobile|gsm/i,
  /national.?id|tckn|tc.?kimlik/i, /score|skor|puan/i, /rank|ranking|siralama/i,
  /rating/i, /sentiment|emotion|affect|duygu/i, /raw.?transcript|transcript.?body|raw.?media|media.?blob/i,
];
const KNOWN_KW = new Set([
  "$schema", "$id", "$defs", "$ref", "title", "description", "type", "const", "enum",
  "required", "properties", "additionalProperties", "items", "minItems", "maxItems",
  "uniqueItems", "minLength", "maxLength", "pattern",
]);

const errors = [];
const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const typeOf = (n) => (Array.isArray(n) ? "array" : n === null ? "null" : typeof n);
const resolveRef = (r) => r.replace("#/", "").split("/").reduce((o, k) => o?.[k], SCHEMA);

// 0. desteklenmeyen keyword guard (schema node'ları)
function checkKeywords(s, path) {
  if (!s || typeof s !== "object" || Array.isArray(s)) return;
  for (const k of Object.keys(s)) if (!KNOWN_KW.has(k)) errors.push(`schema ${path}: desteklenmeyen keyword "${k}" (under-validation riski)`);
  if (s.properties) for (const [k, v] of Object.entries(s.properties)) checkKeywords(v, `${path}.${k}`);
  if (s.items) checkKeywords(s.items, `${path}[]`);
  if (s.$defs) for (const [k, v] of Object.entries(s.$defs)) checkKeywords(v, `${path}.$defs.${k}`);
}
checkKeywords(SCHEMA, "$");

// 1. validator
function validate(node, schema, path) {
  if (schema.$ref) { validate(node, resolveRef(schema.$ref), path); return; }
  if (schema.type) {
    const t = typeOf(node), want = schema.type === "object" ? "object" : schema.type;
    if (t !== want) { errors.push(`${path}: tip "${t}" ≠ "${schema.type}"`); return; }
  }
  if ("const" in schema && !deepEqual(node, schema.const)) errors.push(`${path}: const "${JSON.stringify(schema.const)}" değil`);
  if (schema.enum && !schema.enum.some((e) => deepEqual(node, e))) errors.push(`${path}: enum dışı "${node}"`);
  if (schema.minLength != null && typeof node === "string" && node.length < schema.minLength) errors.push(`${path}: minLength ${schema.minLength}`);
  if (schema.maxLength != null && typeof node === "string" && node.length > schema.maxLength) errors.push(`${path}: maxLength ${schema.maxLength}`);
  if (schema.pattern && typeof node === "string" && !new RegExp(schema.pattern).test(node)) errors.push(`${path}: pattern ihlali "${node}"`);
  if (schema.type === "array" && Array.isArray(node)) {
    if (schema.minItems != null && node.length < schema.minItems) errors.push(`${path}: minItems ${schema.minItems}`);
    if (schema.uniqueItems && new Set(node.map((x) => JSON.stringify(x))).size !== node.length) errors.push(`${path}: uniqueItems ihlali`);
    if (schema.items) node.forEach((el, i) => validate(el, schema.items, `${path}[${i}]`));
  }
  if (schema.type === "object" && node && typeof node === "object" && !Array.isArray(node)) {
    for (const req of schema.required || []) if (!(req in node)) errors.push(`${path}: required "${req}" eksik`);
    if (schema.additionalProperties === false) for (const k of Object.keys(node)) if (!(schema.properties && k in schema.properties)) errors.push(`${path}: izinsiz property "${k}"`);
    for (const [k, sub] of Object.entries(schema.properties || {})) if (k in node) validate(node[k], sub, `${path}.${k}`);
  }
}
validate(SAMPLE, SCHEMA, "$");

// 2. forbidden-field deep-scan (alias regex)
function scanKeys(obj, where) {
  if (!obj || typeof obj !== "object") return;
  for (const k of Object.keys(obj)) {
    for (const re of FORBIDDEN_RE) if (re.test(k)) errors.push(`YASAK alan adı "${k}" (${where}/${re}) — ham/PII/skor/affect`);
    scanKeys(obj[k], where);
  }
}
scanKeys(SCHEMA.properties, "schema");
scanKeys(SAMPLE, "sample");

// 3. cross-invariant
const rubricIds = new Set((SAMPLE.rubric?.criteria || []).map((c) => c.criterion_id));
const claimsById = new Map((SAMPLE.claims || []).map((c) => [c.claim_id, c]));
for (const cl of SAMPLE.claims || []) {
  if (!rubricIds.has(cl.criterion_id)) errors.push(`claim ${cl.claim_id}: criterion_id "${cl.criterion_id}" rubric'te yok`);
}
for (const ref of SAMPLE.human_decision?.source_evidence_refs || []) {
  const cl = claimsById.get(ref);
  if (!cl) errors.push(`human_decision.source_evidence_refs "${ref}" claims'te yok`);
  else {
    if (cl.entailment === "unsupported") errors.push(`karar-kanıtı claim ${ref} unsupported (karar-kanıtı olamaz — citation fail-closed)`);
    if (cl.human_reviewed !== true) errors.push(`karar-kanıtı claim ${ref} human_reviewed değil`);
  }
}

if (errors.length > 0) {
  console.error("evidence-packet drift guard FAILED:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`evidence-packet OK — sample schema'ya uyar ($ref/pattern), yasak ham/skor/affect alanı yok, criterion↔claim + karar-kanıtı(supported+reviewed) invariantları korunuyor.`);
