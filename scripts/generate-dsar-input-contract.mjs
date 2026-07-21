#!/usr/bin/env node
/**
 * ATS #169 DSAR input contract generator/drift guard.
 *
 * Tek semantic kaynak `contracts/policies/dsar-input-contract.v1.json`'dır. Java,
 * TypeScript, PostgreSQL/Flyway ve operator preflight aynı modelden üretilir. Böylece
 * UUIDv4/prefix/reason sözleşmesi katmanlar arasında elle kopyalanmaz.
 *
 * Kullanım:
 *   node scripts/generate-dsar-input-contract.mjs --check  # CI/default
 *   node scripts/generate-dsar-input-contract.mjs --write  # bilinçli regeneration
 */
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
export const CONTRACT_PATH = "contracts/policies/dsar-input-contract.v1.json";
export const JAVA_PATH =
  "backend/retention-dsr/src/main/java/com/ats/dsr/DsarInputContractGenerated.java";
export const TS_PATH =
  "web/mfe-interview-evidence/src/generated/dsarInputContract.ts";
export const SQL_PATH =
  "backend/persistence-postgres/src/main/resources/db/migration/V8__dsar_input_contract.sql";
export const RUNBOOK_PATH = "docs/runbooks/RB-dsar-v8-input-contract-migration.md";

const RUNBOOK_BEGIN = "<!-- BEGIN GENERATED: DSAR_INPUT_CONTRACT_PREFLIGHT -->";
const RUNBOOK_END = "<!-- END GENERATED: DSAR_INPUT_CONTRACT_PREFLIGHT -->";
const DEFAULT_PUBLISHED_REFS = Object.freeze(["origin/main", "main"]);

function assert(condition, message) {
  if (!condition) throw new Error(`DSAR contract geçersiz: ${message}`);
}

function assertExactKeys(value, keys, path) {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${path} object olmalı`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  assert(JSON.stringify(actual) === JSON.stringify(expected),
    `${path} exact keys ${expected.join(",")} olmalı; gelen=${actual.join(",")}`);
}

function unique(values) {
  return new Set(values).size === values.length;
}

function classBody(chars) {
  // '-' karakterini sınıfın sonunda tutarak Java/JS/PostgreSQL regex dialect'lerinde
  // aynı literal anlamı korur; ']', '\\' ve '^' contract validation'da yasaktır.
  return chars.filter((value) => value !== "-").join("") + (chars.includes("-") ? "-" : "");
}

export function parseCanonicalContract(source) {
  let raw;
  try {
    raw = JSON.parse(source);
  } catch (error) {
    assert(false, `canonical JSON parse edilemiyor: ${error.message}`);
  }
  const canonical = `${JSON.stringify(raw, null, 2)}\n`;
  assert(source === canonical,
    "canonical JSON iki-space formatında ve duplicate-key içermeden serialize edilebilmeli");
  return raw;
}

export function buildModel(raw) {
  assertExactKeys(raw, ["schemaVersion", "subjectRef", "reasonCodes"], "root");
  assert(raw.schemaVersion === "dsar-input-contract/v1", "schemaVersion v1 olmalı");
  assertExactKeys(raw.subjectRef,
    ["prefixes", "separators", "uuidVersion", "hexClass", "variantHexClass"],
    "subjectRef");

  const { prefixes, separators, uuidVersion, hexClass, variantHexClass } = raw.subjectRef;
  assert(Array.isArray(prefixes) && prefixes.length > 0 && unique(prefixes),
    "subjectRef.prefixes boş olmayan tekil array olmalı");
  assert(prefixes.every((value) => typeof value === "string" && /^[a-z][a-z0-9]*$/.test(value)),
    "subjectRef.prefixes lowercase güvenli token olmalı");
  assert(Array.isArray(separators) && separators.length > 0 && unique(separators),
    "subjectRef.separators boş olmayan tekil array olmalı");
  assert(separators.every((value) => typeof value === "string"
    && value.length === 1 && /^[._:-]$/.test(value)),
    "subjectRef.separators yalnız . _ : - olabilir");
  assert(uuidVersion === 4, "yalnız UUIDv4 desteklenir");
  assert(hexClass === "0-9A-Fa-f", "v1 hexClass exact 0-9A-Fa-f olmalı");
  assert(variantHexClass === "89AaBb", "v1 UUID variant class exact 89AaBb olmalı");

  assert(Array.isArray(raw.reasonCodes) && raw.reasonCodes.length === 1,
    "v1 tam bir kapalı reasonCode taşımalı; yeni kategori yeni contract/migration ister");
  const reasonCode = raw.reasonCodes[0];
  assert(typeof reasonCode === "string" && /^[A-Z][A-Z0-9_]{2,63}$/.test(reasonCode),
    "reasonCode kapalı uppercase token olmalı");
  assert(reasonCode === "DATA_SUBJECT_ERASURE",
    "v1 reasonCode exact DATA_SUBJECT_ERASURE olmalı; yeni semantik v2 ister");

  const prefixAlternation = prefixes.join("|");
  const separatorClass = classBody(separators);
  const uuidV4Pattern = `[${hexClass}]{8}-[${hexClass}]{4}-${uuidVersion}[${hexClass}]{3}`
    + `-[${variantHexClass}][${hexClass}]{3}-[${hexClass}]{12}`;
  const subjectRefPattern = `^(?:(?:${prefixAlternation})[${separatorClass}])?${uuidV4Pattern}$`;
  const sqlSubjectRefPattern = `^((${prefixAlternation})[${separatorClass}])?${uuidV4Pattern}$`;
  const uuidLength = 36;
  const subjectRefMinLength = uuidLength;
  const subjectRefMaxLength = uuidLength + Math.max(...prefixes.map((value) => value.length)) + 1;

  return Object.freeze({
    schemaVersion: raw.schemaVersion,
    reasonCode,
    reasonCodeLength: reasonCode.length,
    reasonCodePattern: `^${reasonCode}$`,
    subjectRefMinLength,
    subjectRefMaxLength,
    uuidV4Pattern,
    subjectRefPattern,
    sqlSubjectRefPattern,
  });
}

const quoted = (value) => JSON.stringify(value);
const sqlQuoted = (value) => `'${value.replaceAll("'", "''")}'`;

export function renderJava(model) {
  return `package com.ats.dsr;

import java.util.regex.Pattern;

/**
 * GENERATED from ${CONTRACT_PATH} by scripts/generate-dsar-input-contract.mjs.
 * DO NOT EDIT — ilk yayından önce contract+generator; sonrasında v2+forward migration değişir.
 */
public final class DsarInputContractGenerated {

    public static final int SUBJECT_REF_MIN_LENGTH = ${model.subjectRefMinLength};
    public static final int SUBJECT_REF_MAX_LENGTH = ${model.subjectRefMaxLength};
    public static final int REASON_CODE_LENGTH = ${model.reasonCodeLength};
    public static final String DATA_SUBJECT_ERASURE_REASON = ${quoted(model.reasonCode)};
    public static final String UUID_V4_PATTERN = ${quoted(model.uuidV4Pattern)};
    public static final String SUBJECT_REF_PATTERN = ${quoted(model.subjectRefPattern)};
    public static final String REASON_CODE_PATTERN = ${quoted(model.reasonCodePattern)};

    private static final Pattern SUBJECT_REF = Pattern.compile(SUBJECT_REF_PATTERN);

    private DsarInputContractGenerated() {}

    public static boolean validSubjectRef(String value) {
        return value != null
                && value.length() >= SUBJECT_REF_MIN_LENGTH
                && value.length() <= SUBJECT_REF_MAX_LENGTH
                && SUBJECT_REF.matcher(value).matches();
    }

    public static boolean validReasonCode(String value) {
        return value != null
                && value.length() == REASON_CODE_LENGTH
                && DATA_SUBJECT_ERASURE_REASON.equals(value);
    }
}
`;
}

export function renderTypeScript(model) {
  return `/**
 * GENERATED from ${CONTRACT_PATH} by scripts/generate-dsar-input-contract.mjs.
 * DO NOT EDIT — ilk yayından önce contract+generator; sonrasında v2+forward migration değişir.
 */
export const DSAR_SUBJECT_REF_PATTERN_SOURCE = ${quoted(model.subjectRefPattern)};
export const DSAR_SUBJECT_REF_PATTERN = new RegExp(DSAR_SUBJECT_REF_PATTERN_SOURCE);
export const DSAR_SUBJECT_REF_MIN_LENGTH = ${model.subjectRefMinLength};
export const DSAR_SUBJECT_REF_MAX_LENGTH = ${model.subjectRefMaxLength};
export const DATA_SUBJECT_ERASURE_REASON = ${quoted(model.reasonCode)} as const;

export function isValidDsarSubjectRef(value: string): boolean {
  return value.length >= DSAR_SUBJECT_REF_MIN_LENGTH
    && value.length <= DSAR_SUBJECT_REF_MAX_LENGTH
    && DSAR_SUBJECT_REF_PATTERN.test(value);
}

export function isValidDsarReasonCode(value: string): boolean {
  return value === DATA_SUBJECT_ERASURE_REASON;
}
`;
}

export function renderSql(model) {
  return `-- GENERATED from ${CONTRACT_PATH} by scripts/generate-dsar-input-contract.mjs.
-- DO NOT EDIT: ilk yayından önce canonical contract+generator; sonrasında v2+V9+ değişir.
-- ATS #169: DSAR state/log düzlemine yaygın PII biçimleri veya serbest gerekçe metni yazılmasını kes.
-- Eski uygunsuz satırı sessizce sertifikalandırıp yarım-çalışır runtime açılmaz: yalnız violation
-- SAYISI raporlanır (ham değer yok), Flyway transaction durur ve operatör runbook'a yönlendirilir.
DO $$
DECLARE
    violation_count BIGINT;
BEGIN
    SELECT count(*) INTO violation_count
    FROM dsar_request
    WHERE NOT (
        char_length(subject_ref) BETWEEN ${model.subjectRefMinLength} AND ${model.subjectRefMaxLength}
        AND subject_ref ~ ${sqlQuoted(model.sqlSubjectRefPattern)}
        AND reason_code = ${sqlQuoted(model.reasonCode)}
    );
    IF violation_count > 0 THEN
        RAISE EXCEPTION
            'V8 DSAR input contract: % uygunsuz eski satır; migration durduruldu. docs/runbooks/RB-dsar-v8-input-contract-migration.md runbook''unu uygulayın',
            violation_count;
    END IF;
END $$;

ALTER TABLE dsar_request
    ADD CONSTRAINT dsar_request_subject_ref_contract_ck CHECK (
        char_length(subject_ref) BETWEEN ${model.subjectRefMinLength} AND ${model.subjectRefMaxLength}
        AND subject_ref ~ ${sqlQuoted(model.sqlSubjectRefPattern)}
    ),
    ADD CONSTRAINT dsar_request_reason_code_contract_ck CHECK (
        reason_code = ${sqlQuoted(model.reasonCode)}
    );
`;
}

export function renderRunbookBlock(model) {
  return `${RUNBOOK_BEGIN}
<!-- GENERATED from ${CONTRACT_PATH}; DO NOT EDIT THIS BLOCK. -->
\`\`\`sql
SELECT count(*) AS invalid_row_count
FROM dsar_request
WHERE NOT (
    char_length(subject_ref) BETWEEN ${model.subjectRefMinLength} AND ${model.subjectRefMaxLength}
    AND subject_ref ~ ${sqlQuoted(model.sqlSubjectRefPattern)}
    AND reason_code = ${sqlQuoted(model.reasonCode)}
);
\`\`\`
${RUNBOOK_END}`;
}

export function replaceRunbookBlock(source, block) {
  const beginCount = source.split(RUNBOOK_BEGIN).length - 1;
  const endCount = source.split(RUNBOOK_END).length - 1;
  assert(beginCount === 1 && endCount === 1,
    `${RUNBOOK_PATH} exact bir BEGIN ve bir END marker taşımalı; `
    + `gelen BEGIN=${beginCount} END=${endCount}`);
  const start = source.indexOf(RUNBOOK_BEGIN);
  const end = source.indexOf(RUNBOOK_END);
  assert(start >= 0 && end > start, `${RUNBOOK_PATH} generated marker'ları eksik/bozuk`);
  return source.slice(0, start) + block + source.slice(end + RUNBOOK_END.length);
}

function read(relativePath) {
  return readFileSync(join(REPO, relativePath), "utf8");
}

function write(relativePath, value) {
  const target = join(REPO, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, value, "utf8");
}

function git(runner, args, repositoryRoot) {
  const result = runner("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  return result;
}

/**
 * CI `DSAR_CONTRACT_BASE_REF` ile exact PR-base/push-before commit'ini zorunlu
 * baseline yapar. Lokal çalışmada origin/main, sonra main denenir. Böylece v1 ilk
 * kez eklenirken serbesttir; yayımlandıktan sonra branch'te contract+V8 birlikte
 * değiştirilerek Flyway checksum geçmişi yeniden yazılamaz.
 */
export function findPublishedArtifact({
  repositoryRoot = REPO,
  artifactPath = CONTRACT_PATH,
  baseRef = process.env.DSAR_CONTRACT_BASE_REF?.trim() || "",
  runner = spawnSync,
} = {}) {
  const refs = baseRef ? [baseRef] : DEFAULT_PUBLISHED_REFS;
  for (const ref of refs) {
    const commit = git(runner, ["cat-file", "-e", `${ref}^{commit}`], repositoryRoot);
    if (commit.status !== 0) {
      assert(!baseRef,
        `zorunlu immutable baseline ref erişilemiyor: ${ref}; CI checkout history'sini doğrulayın`);
      continue;
    }

    const pathExists = git(runner, ["cat-file", "-e", `${ref}:${artifactPath}`], repositoryRoot);
    // Commit var ama exact path yoksa bu artifact'ın ilk yayınıdır.
    if (pathExists.status !== 0) continue;
    const file = git(runner, ["show", `${ref}:${artifactPath}`], repositoryRoot);
    assert(file.status === 0,
      `${ref}:${artifactPath} var ama okunamadı (git status=${file.status})`);
    return Object.freeze({ ref, content: file.stdout });
  }
  return null;
}

export function assertPublicationBoundary(mode, currentSource, published) {
  if (published === null) return;
  assert(currentSource === published.content,
    `${CONTRACT_PATH} ${published.ref} üzerinde yayımlanmış ve immutable; `
    + "v1/V8 değiştirilemez, v2 contract + V9 veya sonraki forward migration oluşturun");
  assert(mode !== "--write",
    `${CONTRACT_PATH} ${published.ref} üzerinde yayımlanmış; --write yasak. `
    + "Yeni semantik için v2 contract + V9 veya sonraki forward migration oluşturun");
}

export function assertPublishedArtifactUnchanged(artifactPath, currentSource, published) {
  if (published === null) return;
  assert(currentSource === published.content,
    `${artifactPath} ${published.ref} üzerinde yayımlanmış ve immutable; `
    + "eski Flyway migration yeniden yazılamaz, V9 veya sonraki forward migration oluşturun");
}

function javaMethodBody(source, methodName) {
  const signature = `public static boolean ${methodName}(String value)`;
  const signatureAt = source.indexOf(signature);
  if (signatureAt < 0) return null;
  const openAt = source.indexOf("{", signatureAt + signature.length);
  if (openAt < 0) return null;
  let depth = 0;
  for (let index = openAt; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(openAt + 1, index);
    }
  }
  return null;
}

function normalizedStatement(value) {
  return value?.replace(/\s+/g, " ").trim() ?? null;
}

export function consumerErrors({
  java = read("backend/retention-dsr/src/main/java/com/ats/dsr/DsarInputPolicy.java"),
  ts = read("web/mfe-interview-evidence/src/dsarApi.ts"),
} = {}) {
  const errors = [];
  const javaBindings = [
    "DsarInputContractGenerated.SUBJECT_REF_MIN_LENGTH",
    "DsarInputContractGenerated.SUBJECT_REF_MAX_LENGTH",
    "DsarInputContractGenerated.REASON_CODE_LENGTH",
    "DsarInputContractGenerated.DATA_SUBJECT_ERASURE_REASON",
    "DsarInputContractGenerated.UUID_V4_PATTERN",
    "DsarInputContractGenerated.SUBJECT_REF_PATTERN",
    "DsarInputContractGenerated.REASON_CODE_PATTERN",
    "DsarInputContractGenerated.validSubjectRef(value)",
    "DsarInputContractGenerated.validReasonCode(value)",
  ];
  for (const binding of javaBindings) {
    if (!java.includes(binding)) {
      errors.push(`DsarInputPolicy generated Java binding/validator eksik: ${binding}`);
    }
  }
  if (/\[0-9A-Fa-f\]\{8\}/.test(java)) {
    errors.push("DsarInputPolicy içinde ikinci inline UUID regex'i bulundu");
  }
  if (/Pattern\.compile\s*\(/.test(java)) {
    errors.push("DsarInputPolicy generated validator dışında Pattern.compile tanımlıyor");
  }
  const exactJavaDelegates = new Map([
    ["validSubjectRef", "return DsarInputContractGenerated.validSubjectRef(value);"],
    ["validReasonCode", "return DsarInputContractGenerated.validReasonCode(value);"],
  ]);
  for (const [method, expected] of exactJavaDelegates) {
    const actual = normalizedStatement(javaMethodBody(java, method));
    if (actual !== expected) {
      errors.push(`DsarInputPolicy.${method} exact generated delegate olmalı; extra OR/fallback yasak`);
    }
  }
  const tsBindings = [
    './generated/dsarInputContract',
    "isValidDsarSubjectRef",
    "isValidDsarReasonCode",
  ];
  for (const binding of tsBindings) {
    if (!ts.includes(binding)) {
      errors.push(`dsarApi generated TypeScript binding/validator eksik: ${binding}`);
    }
  }
  if (/\[0-9A-Fa-f\]\{8\}/.test(ts)) {
    errors.push("dsarApi içinde ikinci inline UUID regex'i bulundu");
  }
  if (/new\s+RegExp\s*\(/.test(ts)) {
    errors.push("dsarApi generated validator dışında new RegExp tanımlıyor");
  }
  if (/export function isValidDsar(?:SubjectRef|ReasonCode)/.test(ts)) {
    errors.push("dsarApi generated TypeScript validator yerine lokal validator tanımlıyor");
  }
  if (!ts.includes("if (!isValidDsarSubjectRef(subjectRef) || !isValidDsarReasonCode(reasonCode)) {")) {
    errors.push("dsarApi receiveDsar exact generated subject/reason fail-closed guard'ını çağırmıyor");
  }
  return errors;
}

export function run(mode = "--check") {
  assert(mode === "--check" || mode === "--write", "mode --check veya --write olmalı");
  const contractSource = read(CONTRACT_PATH);
  const publishedContract = findPublishedArtifact();
  assertPublicationBoundary(mode, contractSource, publishedContract);
  const publishedSql = findPublishedArtifact({ artifactPath: SQL_PATH });
  if (publishedSql !== null) {
    assertPublishedArtifactUnchanged(SQL_PATH, read(SQL_PATH), publishedSql);
  }
  const raw = parseCanonicalContract(contractSource);
  const model = buildModel(raw);
  const runbookSource = read(RUNBOOK_PATH);
  const outputs = new Map([
    [JAVA_PATH, renderJava(model)],
    [TS_PATH, renderTypeScript(model)],
    [SQL_PATH, renderSql(model)],
    [RUNBOOK_PATH, replaceRunbookBlock(runbookSource, renderRunbookBlock(model))],
  ]);

  if (mode === "--write") {
    for (const [path, value] of outputs) write(path, value);
    console.log(`DSAR input contract generated — ${outputs.size} consumer; source=${CONTRACT_PATH}`);
    return;
  }

  const errors = [];
  for (const [path, expected] of outputs) {
    let actual;
    try {
      actual = read(path);
    } catch {
      errors.push(`${path}: generated dosya eksik`);
      continue;
    }
    if (actual !== expected) errors.push(`${path}: canonical contract'tan generated drift`);
  }
  errors.push(...consumerErrors());
  if (errors.length > 0) {
    console.error("DSAR input contract guard FAILED:");
    for (const error of errors) console.error(`  - ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`DSAR input contract OK — Java/TypeScript/PostgreSQL/runbook tek canonical source; min=${model.subjectRefMinLength} max=${model.subjectRefMaxLength} reason=${model.reasonCode}`);
}

const invokedDirectly = process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) run(process.argv[2] ?? "--check");
