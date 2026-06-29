#!/usr/bin/env node
/**
 * Evidence-packet manifest drift guard (ATS-0004/0005 · Codex 019f13b1 round-2 #4).
 *
 *  1. Minimal JSON-Schema validator (no npm dep): sample contracts/samples/evidence-packet.sample.json
 *     schema contracts/schemas/evidence-packet.schema.json'a uyar (type/const/enum/required/
 *     additionalProperties:false/properties/items/minItems/uniqueItems/minLength).
 *  2. Forbidden-field deep-scan (schema + sample): ham içerik / PII / skor / sıralama / affect
 *     alan adları HİÇBİR yerde görünemez (ATS-0003 raw yok, ATS-0005 score/affect yok).
 *  3. Sözleşme invariantı: her claim source_segment_refs≥1 + entailment; unsupported policy = flag-and-exclude.
 *
 * Bağımsız (npm dep YOK), CI job `evidence-packet-guard`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA = JSON.parse(readFileSync(join(REPO, "contracts/schemas/evidence-packet.schema.json"), "utf8"));
const SAMPLE = JSON.parse(readFileSync(join(REPO, "contracts/samples/evidence-packet.sample.json"), "utf8"));

const FORBIDDEN_KEYS = [
  "raw_transcript", "transcript_body", "raw_media", "media_blob", "audio_blob", "video_blob",
  "candidate_email", "candidate_phone", "candidate_name", "email", "phone", "tckn",
  "score", "scores", "ranking", "rank", "rating", "affect", "sentiment", "emotion",
];

const errors = [];
const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const typeOf = (n) => (Array.isArray(n) ? "array" : n === null ? "null" : typeof n);

// 1. minimal JSON-Schema validator
function validate(node, schema, path) {
  if (schema.type) {
    const t = typeOf(node);
    const want = schema.type === "object" ? "object" : schema.type;
    if (t !== want) { errors.push(`${path}: tip "${t}" ≠ beklenen "${schema.type}"`); return; }
  }
  if ("const" in schema && !deepEqual(node, schema.const)) errors.push(`${path}: const "${JSON.stringify(schema.const)}" değil`);
  if (schema.enum && !schema.enum.some((e) => deepEqual(node, e))) errors.push(`${path}: enum dışı "${node}"`);
  if (schema.minLength != null && typeof node === "string" && node.length < schema.minLength) errors.push(`${path}: minLength ${schema.minLength}`);
  if (schema.type === "array" && Array.isArray(node)) {
    if (schema.minItems != null && node.length < schema.minItems) errors.push(`${path}: minItems ${schema.minItems}`);
    if (schema.uniqueItems && new Set(node.map((x) => JSON.stringify(x))).size !== node.length) errors.push(`${path}: uniqueItems ihlali`);
    if (schema.items) node.forEach((el, i) => validate(el, schema.items, `${path}[${i}]`));
  }
  if (schema.type === "object" && node && typeof node === "object" && !Array.isArray(node)) {
    for (const req of schema.required || []) if (!(req in node)) errors.push(`${path}: required "${req}" eksik`);
    if (schema.additionalProperties === false) {
      for (const k of Object.keys(node)) if (!(schema.properties && k in schema.properties)) errors.push(`${path}: izinsiz property "${k}" (additionalProperties:false)`);
    }
    for (const [k, sub] of Object.entries(schema.properties || {})) if (k in node) validate(node[k], sub, `${path}.${k}`);
  }
}
validate(SAMPLE, SCHEMA, "$");

// 2. forbidden-field deep-scan
function scanKeys(obj, where) {
  if (!obj || typeof obj !== "object") return;
  for (const k of Object.keys(obj)) {
    if (FORBIDDEN_KEYS.includes(k)) errors.push(`YASAK alan adı "${k}" (${where}) — ham içerik/PII/skor/affect (ATS-0003/0005)`);
    scanKeys(obj[k], where);
  }
}
scanKeys(SCHEMA.properties, "schema");
scanKeys(SAMPLE, "sample");

// 3. claim invariant (sample)
for (const cl of SAMPLE.claims || []) {
  if (!Array.isArray(cl.source_segment_refs) || cl.source_segment_refs.length < 1) errors.push(`claim ${cl.claim_id}: source_segment_refs≥1 zorunlu (citation fail-closed)`);
  if (!["supported", "partially_supported", "unsupported"].includes(cl.entailment)) errors.push(`claim ${cl.claim_id}: geçersiz entailment`);
}
if (SAMPLE.unsupported_claim_policy !== "flag-and-exclude-from-decision") errors.push("unsupported_claim_policy flag-and-exclude-from-decision olmalı");

if (errors.length > 0) {
  console.error("evidence-packet drift guard FAILED:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`evidence-packet OK — sample schema'ya uyar (additionalProperties:false), yasak ham/skor/affect alanı yok, claim'ler source_segment+entailment taşır.`);
