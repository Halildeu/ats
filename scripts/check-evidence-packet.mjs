#!/usr/bin/env node
/**
 * Evidence-packet manifest drift guard (ATS-0004/0005 · Codex 019f13fd REVISE/PARTIAL absorb).
 *
 *  1. Minimal JSON-Schema validator (no npm dep, $ref/$defs+pattern dahil); desteklenmeyen
 *     validation keyword görürse FAIL (silent under-validation guard).
 *  2. Forbidden-field deep-scan (regex/alias, TR+EN); tüm string alanlar opak-ref pattern.
 *  3. Cross-invariant: claim_id+criterion_id TEKİL; claim.criterion_id ∈ rubric; human_decision.
 *     source_evidence_refs ⊆ claims (entailment≠unsupported + human_reviewed).
 *  4. GÖMÜLÜ self-test: pozitif sample yanında negatif vektörlerin fail ettiği CI'da doğrulanır
 *     (durable regression — Codex 019f13fd PARTIAL).
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
const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const typeOf = (n) => (Array.isArray(n) ? "array" : n === null ? "null" : typeof n);

/** Tüm kontrolleri (schema, sample) için koşar; errors[] döner (saf — global yok). */
function runChecks(schema, sample) {
  const errors = [];
  const resolveRef = (r) => r.replace("#/", "").split("/").reduce((o, k) => o?.[k], schema);

  function checkKeywords(s, path) {
    if (!s || typeof s !== "object" || Array.isArray(s)) return;
    for (const k of Object.keys(s)) if (!KNOWN_KW.has(k)) errors.push(`schema ${path}: desteklenmeyen keyword "${k}"`);
    // $ref fail-closed: yanında title/description dışında sibling keyword olamaz (sessiz under-validation)
    if ("$ref" in s) for (const k of Object.keys(s)) if (!["$ref", "title", "description"].includes(k)) errors.push(`schema ${path}: $ref yanında sibling keyword "${k}" (under-validation; ayrı node kullan)`);
    if (s.properties) for (const [k, v] of Object.entries(s.properties)) checkKeywords(v, `${path}.${k}`);
    if (s.items) checkKeywords(s.items, `${path}[]`);
    if (s.$defs) for (const [k, v] of Object.entries(s.$defs)) checkKeywords(v, `${path}.$defs.${k}`);
  }
  checkKeywords(schema, "$");

  function validate(node, sc, path) {
    if (sc.$ref) { validate(node, resolveRef(sc.$ref), path); return; }
    if (sc.type) {
      const t = typeOf(node), want = sc.type === "object" ? "object" : sc.type;
      if (t !== want) { errors.push(`${path}: tip "${t}" ≠ "${sc.type}"`); return; }
    }
    if ("const" in sc && !deepEqual(node, sc.const)) errors.push(`${path}: const değil`);
    if (sc.enum && !sc.enum.some((e) => deepEqual(node, e))) errors.push(`${path}: enum dışı "${node}"`);
    if (sc.minLength != null && typeof node === "string" && node.length < sc.minLength) errors.push(`${path}: minLength`);
    if (sc.maxLength != null && typeof node === "string" && node.length > sc.maxLength) errors.push(`${path}: maxLength`);
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

  // anahtar tarama (schema+sample) — forbidden alan ADLARI
  const scanKeys = (obj, where) => {
    if (!obj || typeof obj !== "object") return;
    for (const k of Object.keys(obj)) {
      for (const re of FORBIDDEN_RE) if (re.test(k)) errors.push(`YASAK alan adı "${k}" (${where})`);
      scanKeys(obj[k], where);
    }
  };
  scanKeys(schema, "schema"); // $defs dahil tüm şema (key-only tarama; description değerleri güvenli)
  scanKeys(sample, "sample");
  // DEĞER tarama (yalnız sample — schema description'ları forbidden-kelime içerir, hariç):
  // forbidden-keyword içeren string değerler (tckn/skor/email...) reddedilir. Not: keyfi tek-token
  // ad (AhmetYilmaz) regex'le yakalanamaz → tam semantik opaklık runtime ref-registry (P1).
  const scanValues = (obj) => {
    if (!obj || typeof obj !== "object") return;
    for (const v of Object.values(obj)) {
      if (typeof v === "string") {
        for (const re of FORBIDDEN_RE) if (re.test(v)) errors.push(`YASAK değer "${v}" (sample) — forbidden-keyword`);
      } else {
        scanValues(v);
      }
    }
  };
  scanValues(sample);

  // cross-invariant
  const critList = (sample.rubric?.criteria || []).map((c) => c.criterion_id);
  if (new Set(critList).size !== critList.length) errors.push("rubric criterion_id tekil değil (duplicate)");
  const rubricIds = new Set(critList);
  const claimIds = (sample.claims || []).map((c) => c.claim_id);
  if (new Set(claimIds).size !== claimIds.length) errors.push("claim_id tekil değil (duplicate)");
  const claimsById = new Map((sample.claims || []).map((c) => [c.claim_id, c]));
  for (const cl of sample.claims || []) if (!rubricIds.has(cl.criterion_id)) errors.push(`claim ${cl.claim_id}: criterion_id "${cl.criterion_id}" rubric'te yok`);
  for (const ref of sample.human_decision?.source_evidence_refs || []) {
    const cl = claimsById.get(ref);
    if (!cl) errors.push(`source_evidence_refs "${ref}" claims'te yok`);
    else {
      if (cl.entailment === "unsupported") errors.push(`karar-kanıtı claim ${ref} unsupported (olamaz)`);
      if (cl.human_reviewed !== true) errors.push(`karar-kanıtı claim ${ref} human_reviewed değil`);
    }
  }
  return errors;
}

// GÖMÜLÜ self-test: negatif vektörlerin fail ETTİĞİ doğrulanır (durable regression)
function selfTest() {
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const cases = [
    ["unsupported-decision-evidence", () => { const s = clone(SAMPLE); s.human_decision.source_evidence_refs = ["cl-02"]; return [SCHEMA, s]; }],
    ["unknown-criterion", () => { const s = clone(SAMPLE); s.claims[0].criterion_id = "c-x"; return [SCHEMA, s]; }],
    ["pii-free-text", () => { const s = clone(SAMPLE); s.claims[0].statement_ref = "Ahmet Yilmaz dedi"; return [SCHEMA, s]; }],
    ["forbidden-alias", () => { const s = clone(SAMPLE); s.claims[0].puan = 9; return [SCHEMA, s]; }],
    ["duplicate-claim-id", () => { const s = clone(SAMPLE); s.claims.push(clone(s.claims[0])); return [SCHEMA, s]; }],
    ["unsupported-keyword", () => { const sc = clone(SCHEMA); sc.properties.packet_id = { oneOf: [{ type: "string" }] }; return [sc, SAMPLE]; }],
    ["raw-content-included", () => { const s = clone(SAMPLE); s.excluded_raw_content = false; return [SCHEMA, s]; }],
    ["forbidden-value", () => { const s = clone(SAMPLE); s.claims[0].statement_ref = "skor-90"; return [SCHEMA, s]; }],
    ["ref-sibling-under-validation", () => { const sc = clone(SCHEMA); sc.properties.packet_id = { $ref: "#/$defs/ref", maxLength: 3 }; return [sc, SAMPLE]; }],
    ["forbidden-schema-def-field", () => { const sc = clone(SCHEMA); sc.$defs.bad = { type: "object", additionalProperties: false, properties: { score: { type: "string" } } }; sc.properties.optional_bad_ref = { $ref: "#/$defs/bad" }; return [sc, SAMPLE]; }],
  ];
  const failed = [];
  for (const [name, build] of cases) {
    const [sc, sm] = build();
    if (runChecks(sc, sm).length === 0) failed.push(name);
  }
  return failed;
}

const errors = runChecks(SCHEMA, SAMPLE);
const selfFailed = selfTest();
for (const n of selfFailed) errors.push(`SELF-TEST kaçtı (negatif vektör fail etmedi): ${n}`);

if (errors.length > 0) {
  console.error("evidence-packet drift guard FAILED:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`evidence-packet OK — sample schema'ya uyar ($ref/pattern+sibling-fail-closed), forbidden key+value scan, criterion↔claim + karar-kanıtı + tekillik; gömülü self-test 10 negatif vektör fail ediyor.`);
