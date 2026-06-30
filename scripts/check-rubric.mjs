#!/usr/bin/env node
/**
 * Rubric standard drift guard (ATS-0005 · Codex 019f17a2 REVISE absorb).
 *
 *  1. Minimal JSON-Schema validator (no-dep, $ref/$defs/pattern/maxLength/maxItems; unsupported-kw FAIL).
 *  2. PROTECTED-ATTRIBUTE registry (TR-normalize + context-allow): korumalı-özellik (yaş/din/etnik/
 *     sendika/sağlık-durumu/cinsiyet/cinsel-yönelim/medeni-hal/ebeveyn/siyasi/felsefi/sabıka/ana-dil-aksan/
 *     dernek-vakıf/hamilelik) key+value'da reddedilir; iş-ilişkili çakışmalar (race-condition, health-domain,
 *     clinical, language-skill) ALLOW-list ile korunur (false-positive engeli).
 *  3. SCORING/AFFECT yasağı (key+value): score/weight/rank/rating/affect.
 *  4. criterion_id tekil; her criterion job_relatedness_rationale_ref.
 *  5. Schema KEY drift taraması ($defs+properties adları) — opsiyonel forbidden alan engeli.
 *  6. GÖMÜLÜ outcome-aware self-test (negatif fail + ALLOW pozitif pass; durable regression).
 *
 * NOT (No Fake Work): regex yalnız AÇIK/okunabilir token'ları yakalar; opak ref'in semantik içeriği
 * (c-x1 ile encode) regex'le garanti EDİLEMEZ → semantik review ref-registry + human/legal onay P1/gate-locked.
 *
 * Bağımsız (npm dep YOK), CI job `rubric-guard`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA = JSON.parse(readFileSync(join(REPO, "contracts/schemas/rubric.schema.json"), "utf8"));
const SAMPLE = JSON.parse(readFileSync(join(REPO, "contracts/samples/rubric.sample.json"), "utf8"));

// TR fold + diacritic strip + hyphen/underscore→space (token-context)
const norm = (s) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i").toLowerCase().replace(/[-_]+/g, " ");

const PROTECTED = [
  { re: /hamile|gebe|pregnan|maternity|dogum izin/, label: "hamilelik" },
  { re: /\byas\b|\bage\b|dogum tarih|birth date|\bdob\b|age range|30plus|yas arali/, label: "yaş" },
  { re: /\bdin\b|\bdini\b|inanc|mezhep|religio/, label: "din/inanç" },
  { re: /etnik|ethnic|\birk\b|\brace\b|koken|milliyet|nationalit|ancestry/, label: "etnik/ırk" },
  { re: /sendika|trade union|union member/, label: "sendika" },
  { re: /\bhealth\b|saglik|hastalik|engelli|disab|health status|medical condition|sick leave|chronic/, label: "sağlık/engellilik" },
  { re: /cinsel|cinsiyet|gender|\bsex\b|lgbt|\btrans\b|nonbinary|sexual orient|gender ident|gender expression/, label: "cinsiyet/yönelim" },
  { re: /medeni hal|marital|\bevli\b|\bbekar\b|\bmarried\b|parental|caregiver|family status|ebeveyn|cocuk sahibi/, label: "medeni/ebeveyn" },
  { re: /siyasi|politik|political|\bparti\b/, label: "siyasi" },
  { re: /felsefi|philosophical|world view|ideoloj/, label: "felsefi inanç" },
  { re: /criminal|sabika|adli sicil|conviction/, label: "sabıka kaydı" },
  { re: /native language|mother tongue|ana dil|native speaker|native english|\baccent\b|aksan|\bsive\b/, label: "ana-dil/aksan" },
  { re: /dernek|vakif|association member|foundation member/, label: "dernek/vakıf üyeliği" },
];
// iş-ilişkili çakışma NÖTRLEME (safe-phrase strip — global early-return DEĞİL): yalnız bu phrase'ler
// metinden ÇIKARILIR; kalan metin yine protected/scoring taranır (karışık string bypass engeli).
const ALLOW_STRIP = /race condition|data race|health domain|medical domain|health tech|healthcare domain/g;
const SCORING = [/score|skor|puan/, /weight|agirlik/, /\brank|ranking|siralama/, /rating/, /affect|sentiment|emotion|duygu/];

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
    if (sc.maxLength != null && typeof node === "string" && node.length > sc.maxLength) errors.push(`${path}: maxLength ${sc.maxLength}`);
    if (sc.pattern && typeof node === "string" && !new RegExp(sc.pattern).test(node)) errors.push(`${path}: pattern ihlali "${node}"`);
    if (sc.type === "array" && Array.isArray(node)) {
      if (sc.minItems != null && node.length < sc.minItems) errors.push(`${path}: minItems`);
      if (sc.maxItems != null && node.length > sc.maxItems) errors.push(`${path}: maxItems ${sc.maxItems}`);
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

  const flag = (str, where) => {
    const nt = norm(str).replace(ALLOW_STRIP, " "); // iş-ilişkili phrase'i çıkar, KALANI tara
    for (const p of PROTECTED) if (p.re.test(nt)) errors.push(`KORUMALI-ÖZELLIK (${p.label}) "${str}" (${where}; ayrımcılık/KVKK m.6)`);
    for (const re of SCORING) if (re.test(nt)) errors.push(`YASAK scoring/affect "${str}" (${where}; assist-not-conduct)`);
  };
  const scanSample = (obj) => {
    if (!obj || typeof obj !== "object") return;
    for (const [k, v] of Object.entries(obj)) {
      flag(k, "sample-key");
      if (typeof v === "string") flag(v, "sample-value");
      else scanSample(v);
    }
  };
  scanSample(sample);
  const scanSchemaKeys = (s) => {
    if (!s || typeof s !== "object") return;
    if (s.properties) for (const k of Object.keys(s.properties)) { flag(k, "schema-key"); scanSchemaKeys(s.properties[k]); }
    if (s.$defs) for (const k of Object.keys(s.$defs)) scanSchemaKeys(s.$defs[k]);
    if (s.items) scanSchemaKeys(s.items);
  };
  scanSchemaKeys(schema);

  const ids = (sample.criteria || []).map((c) => c.criterion_id);
  if (new Set(ids).size !== ids.length) errors.push("criterion_id tekil değil (duplicate)");
  for (const c of sample.criteria || []) if (!c.job_relatedness_rationale_ref) errors.push(`criterion ${c.criterion_id}: job_relatedness_rationale_ref eksik`);
  return errors;
}

function selfTest() {
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const setId = (id) => { const s = clone(SAMPLE); s.criteria[0].criterion_id = id; return [SCHEMA, s]; };
  const neg = [
    ["age-translit", () => setId("c-yas-30plus")],
    ["birthdate", () => setId("c-dogum-tarihi")],
    ["ethnicity-translit", () => setId("c-irk")],
    ["religion-translit", () => setId("c-inanc")],
    ["health-status", () => setId("candidate-health-status")],
    ["sexual-orientation", () => setId("c-sexual-orientation")],
    ["gender-identity", () => setId("c-gender-identity")],
    ["criminal-record", () => setId("c-criminal-record")],
    ["native-language", () => setId("c-native-language")],
    ["parental-status", () => setId("c-parental-status")],
    ["association", () => setId("c-dernek-uyeligi")],
    ["philosophical", () => setId("c-felsefi-gorus")],
    ["scoring-value", () => setId("c-score-calibration")],
    ["scoring-field", () => { const s = clone(SAMPLE); s.criteria[0].weight = 5; return [SCHEMA, s]; }],
    ["bad-criterion-type", () => { const s = clone(SAMPLE); s.criteria[0].criterion_type = "personality"; return [SCHEMA, s]; }],
    ["duplicate-criterion-id", () => { const s = clone(SAMPLE); s.criteria.push(clone(s.criteria[0])); return [SCHEMA, s]; }],
    ["missing-job-relatedness", () => { const s = clone(SAMPLE); delete s.criteria[0].job_relatedness_rationale_ref; return [SCHEMA, s]; }],
    ["schema-forbidden-field", () => { const sc = clone(SCHEMA); sc.properties.candidate_age_ref = { type: "string" }; return [sc, SAMPLE]; }],
    ["unsupported-keyword", () => { const sc = clone(SCHEMA); sc.properties.rubric_version_ref = { allOf: [{ type: "string" }] }; return [sc, SAMPLE]; }],
    ["overlong-ref", () => setId("c-" + "x".repeat(120))],
    // mixed allow+protected (early-return bypass regression — Codex 019f17a2 iter-2)
    ["english-native-speaker", () => setId("c-english-native-speaker")],
    ["english-accent", () => setId("c-english-accent")],
    ["native-english", () => setId("c-native-english")],
    ["clinical-pregnancy-status", () => setId("c-clinical-pregnancy-status")],
    ["clinical-age-risk", () => setId("c-clinical-age-risk")],
    ["health-domain-disability", () => setId("c-health-domain-disability")],
    ["healthcare-sick-leave", () => setId("c-healthcare-sick-leave")],
    ["language-skill-native-language", () => setId("c-language-skill-native-language")],
    ["race-condition-age", () => setId("c-race-condition-age")],
    ["medical-domain-pregnancy", () => setId("c-medical-domain-pregnancy")],
  ];
  const allow = [
    ["race-condition", () => setId("c-race-condition-debugging")],
    ["health-domain", () => setId("c-health-domain-knowledge")],
    ["clinical-rationale", () => { const s = clone(SAMPLE); s.criteria[0].job_relatedness_rationale_ref = "jr-clinical-knowledge"; return [SCHEMA, s]; }],
  ];
  const failed = [];
  for (const [name, build] of neg) { const [sc, sm] = build(); if (runChecks(sc, sm).length === 0) failed.push("NEG-kaçtı:" + name); }
  for (const [name, build] of allow) { const [sc, sm] = build(); const e = runChecks(sc, sm); if (e.length !== 0) failed.push("ALLOW-bloklandı:" + name + "→" + e.join(";")); }
  return failed;
}

const errors = runChecks(SCHEMA, SAMPLE);
for (const n of selfTest()) errors.push(`SELF-TEST: ${n}`);

if (errors.length > 0) {
  console.error("rubric drift guard FAILED:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`rubric OK — job-related criteria; protected-attribute (TR-normalize + safe-phrase-strip) + scoring/affect key+value+schema-key reddi; criterion tekil; self-test 31 neg + 3 allow doğrulandı.`);
