#!/usr/bin/env node
/**
 * Rubric standard drift guard (ATS-0005 · Codex 019f17a2 + 019f57cb REVISE absorb).
 *
 *  1. Minimal JSON-Schema validator (no-dep, $ref/$defs/pattern/maxLength/maxItems; unsupported-kw FAIL).
 *  2. PROTECTED-ATTRIBUTE taraması TEK KANONİK registry'den TÜREVLİDİR (term-düzeyi single-source):
 *     `scripts/lib/protected-screening-policy.mjs` kanonik `protected-attribute-screening-policy.v1.json`'dan
 *     protected-term + safe-phrase üretir; bu script İKİNCİ bir regex/term registry'si TUTMAZ. Böylece
 *     policy'ye eklenen/çıkarılan bir TERİM (yalnız kategori-ADI değil) otomatik yansır — Java kernel +
 *     Node-corpus + bu guard aynı fiziksel terim kümesini tüketir (iki-bağımsız-vokabüler drift'i imkânsız).
 *  3. SCORING/AFFECT yasağı (key+value): score/weight/rank/rating/affect — bu, korumalı-özellik
 *     policy'sinin KONUSU DEĞİLDİR; rubric-özel AYRI kural olarak burada tutulur (protected-policy'ye karışmaz).
 *  4. criterion_id tekil; her criterion job_relatedness_rationale_ref.
 *  5. Schema KEY drift taraması ($defs+properties adları) — opsiyonel forbidden alan engeli.
 *  6. GÖMÜLÜ self-test (negatif fail + ALLOW pozitif pass) + term-single-source drift kanıtı (durable regression).
 *
 * NOT (No Fake Work): leksik motor yalnız AÇIK/okunabilir token'ları yakalar; opak ref'in semantik içeriği
 * (c-x1 ile encode) garanti EDİLEMEZ → semantik review ref-registry + human/legal onay P1/gate-locked.
 *
 * NOT (taksonomi): korumalı-kategori kümesi TAMAMEN KVKK m.6 değildir — m.6 ile geniş işe-alım-ayrımcılık
 * ekseninin BİLEŞİK (composite) taksonomisidir.
 *
 * Bağımsız (npm dep YOK), CI job `rubric-guard`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPolicy, scanProtectedCategories } from "./lib/protected-screening-policy.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA = JSON.parse(readFileSync(join(REPO, "contracts/schemas/rubric.schema.json"), "utf8"));
const SAMPLE = JSON.parse(readFileSync(join(REPO, "contracts/samples/rubric.sample.json"), "utf8"));

// TR fold + diacritic strip + hyphen/underscore→space (token-context) — YALNIZ scoring/affect için;
// protected-özellik taraması artık kanonik motordan (scanProtectedCategories) gelir.
const norm = (s) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i").toLowerCase().replace(/[-_]+/g, " ");

// SCORING/affect regex'leri protected-policy'nin konusu DEĞİL → rubric-özel ayrı kural (single-source
// dışında bilinçli tutulur; assist-not-conduct sınırı).
const SCORING = [/score|skor|puan/, /weight|agirlik/, /\brank|ranking|siralama/, /rating/, /affect|sentiment|emotion|duygu/];

// Korumalı-özellik taraması: TEK kanonik policy'den türevli (ikinci registry YOK).
const CANONICAL_POLICY = join(REPO, "backend/compliance-screening/src/main/resources/screening/protected-attribute-screening-policy.v1.json");
const POLICY = loadPolicy(CANONICAL_POLICY);

// Kategori kodu → okunur TR etiketi (YALNIZ mesaj/gösterim; eşleşme mantığı %100 policy'den gelir,
// bu harita eşleşmeye KATILMAZ — o yüzden "ikinci registry" değildir). Bilinmeyen kod → kodun kendisi.
const CODE_TO_LABEL = {
  AGE: "yaş",
  RELIGION_BELIEF: "din/inanç",
  ETHNICITY_RACE: "etnik/ırk",
  TRADE_UNION: "sendika",
  HEALTH_DISABILITY: "sağlık/engellilik",
  SEX_GENDER_ORIENTATION: "cinsiyet/yönelim",
  MARITAL_PARENTAL_STATUS: "medeni/ebeveyn",
  POLITICAL_OPINION: "siyasi",
  PHILOSOPHICAL_BELIEF: "felsefi inanç",
  CRIMINAL_RECORD: "sabıka kaydı",
  NATIVE_LANGUAGE_ACCENT: "ana-dil/aksan",
  ASSOCIATION_MEMBERSHIP: "dernek/vakıf üyeliği",
  PREGNANCY_MATERNITY: "hamilelik",
};

/**
 * TERM-SINGLE-SOURCE drift kanıtı: protected tarama kanonik policy'den beslendiği için, policy'deki
 * HER kategori, o kategorinin İLK terimiyle yeniden-üretilen bir örnek metinde yakalanmalı. Bir
 * kategori/terim policy'den düşer (veya ikinci bir registry'ye kaçırılırsa) burası kırmızı olur.
 */
function protectedSingleSourceSelfTest() {
  const failed = [];
  for (const cat of POLICY.categories) {
    const term = cat.terms[0];
    const stemPad = term.kind === "STEM" ? "a".repeat(Math.max(0, term.minLen - term.tokens[0].length)) : "";
    const probe = "c " + term.tokens.join(" ") + stemPad;
    if (!scanProtectedCategories(POLICY, probe).includes(cat.code)) {
      failed.push(`kategori ${cat.code} policy-türevli örnekte yakalanmadı (term-single-source kopması): "${probe}"`);
    }
    if (!(cat.code in CODE_TO_LABEL)) failed.push(`etiket haritası kanonik kategoriyi kapsamıyor: ${cat.code}`);
  }
  return failed;
}

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
    // Korumalı-özellik: kanonik motor (safe-phrase neutralize DAHİL) → eşleşen kategori kodları.
    for (const code of scanProtectedCategories(POLICY, str)) {
      errors.push(`KORUMALI-ÖZELLIK (${CODE_TO_LABEL[code] ?? code}) "${str}" (${where}; ayrımcılık/işe-alım-uyumu, KVKK m.6 + geniş işe-alım ekseni)`);
    }
    // Scoring/affect: protected-policy'nin konusu değil → rubric-özel ayrı kural (norm üstünde).
    const nt = norm(str);
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
for (const e of protectedSingleSourceSelfTest()) errors.push(`SINGLE-SOURCE: ${e}`);

if (errors.length > 0) {
  console.error("rubric drift guard FAILED:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`rubric OK — job-related criteria; protected-attribute (kanonik policy'den TÜREVLİ, term-single-source) + scoring/affect (rubric-özel ayrı kural) key+value+schema-key reddi; criterion tekil; self-test 30 neg + 3 allow doğrulandı; korumalı-özellik ${POLICY.categories.length}/13 kategori TEK kanonik registry'nin TERİMLERİYLE bağlı (ikinci regex-registry YOK).`);
