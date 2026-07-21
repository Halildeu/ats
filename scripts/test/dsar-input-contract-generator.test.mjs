import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONTRACT_PATH,
  REPO,
  assertPublicationBoundary,
  assertPublishedArtifactUnchanged,
  buildModel,
  consumerErrors,
  findPublishedArtifact,
  parseCanonicalContract,
  renderJava,
  renderRunbookBlock,
  renderSql,
  renderTypeScript,
  replaceRunbookBlock,
} from "../generate-dsar-input-contract.mjs";

const raw = JSON.parse(readFileSync(join(REPO, CONTRACT_PATH), "utf8"));
const model = buildModel(raw);

test("application ve SQL-biçimli pattern kaynakları aynı lexical corpus'u kabul eder", () => {
  const applicationPattern = new RegExp(model.subjectRefPattern);
  const postgresDialectPattern = new RegExp(model.sqlSubjectRefPattern);
  const valid = [
    "550e8400-e29b-41d4-a716-446655440000",
    "SUBJECT:550E8400-E29B-41D4-A716-446655440000".replace("SUBJECT", "subject"),
    "subj.550e8400-e29b-41d4-b716-446655440000",
    "subj_550e8400-e29b-41d4-9716-446655440000",
    "subj:550e8400-e29b-41d4-a716-446655440000",
    "subj-550e8400-e29b-41d4-b716-446655440000",
    "subject.550e8400-e29b-41d4-8716-446655440000",
    "subject_550e8400-e29b-41d4-8716-446655440000",
    "subject:550e8400-e29b-41d4-9716-446655440000",
    "subject-550e8400-e29b-41d4-a716-446655440000",
  ];
  const invalid = [
    "candidate@example.com",
    "+905551112233",
    "550e8400-e29b-11d4-a716-446655440000",
    "550e8400-e29b-51d4-a716-446655440000",
    "550e8400-e29b-41d4-7716-446655440000",
    "subj-ref-550e8400-e29b-41d4-a716-446655440000",
    "subject/550e8400-e29b-41d4-a716-446655440000",
    " 550e8400-e29b-41d4-a716-446655440000",
    "550e8400-e29b-41d4-a716-446655440000 ",
    "550e8400-e29b-41d4-a716-446655440000\n",
    "550e8400-e29b-41d4-a716-446655440000\t",
  ];
  for (const value of valid) {
    assert.equal(applicationPattern.test(value), true, `application valid: ${value}`);
    assert.equal(postgresDialectPattern.test(value), true, `postgres valid: ${value}`);
  }
  for (const value of invalid) {
    assert.equal(applicationPattern.test(value), false, `application invalid: ${value}`);
    assert.equal(postgresDialectPattern.test(value), false, `postgres invalid: ${value}`);
  }
});

test("consumer wrapper'ları generated validator'a exact delegate olur; OR/regex bypass fail olur", () => {
  assert.deepEqual(consumerErrors(), []);

  const javaPath = join(REPO,
    "backend/retention-dsr/src/main/java/com/ats/dsr/DsarInputPolicy.java");
  const java = readFileSync(javaPath, "utf8");
  const javaBypass = java.replace(
    "return DsarInputContractGenerated.validSubjectRef(value);",
    "return value != null || DsarInputContractGenerated.validSubjectRef(value);",
  );
  assert.match(consumerErrors({ java: javaBypass }).join("\n"), /exact generated delegate/);

  const tsPath = join(REPO, "web/mfe-interview-evidence/src/dsarApi.ts");
  const ts = readFileSync(tsPath, "utf8");
  assert.match(consumerErrors({ ts: `${ts}\nconst bypass = new RegExp(".*");\n` }).join("\n"),
    /new RegExp/);
  assert.match(consumerErrors({
    ts: ts.replace(
      "if (!isValidDsarSubjectRef(subjectRef) || !isValidDsarReasonCode(reasonCode)) {",
      "if (false) {",
    ),
  }).join("\n"), /exact generated subject\/reason fail-closed guard/);
});

test("length ve closed reason code canonical primitives'ten türetilir", () => {
  assert.equal(model.subjectRefMinLength, 36);
  assert.equal(model.subjectRefMaxLength, 44);
  assert.equal(model.reasonCode, "DATA_SUBJECT_ERASURE");
  assert.equal(model.reasonCodeLength, 20);
});

test("unknown key, UUID version drift ve ikinci reason code fail-closed reddedilir", () => {
  assert.throws(() => buildModel({ ...raw, extra: true }), /exact keys/);
  assert.throws(() => buildModel({
    ...raw,
    subjectRef: { ...raw.subjectRef, uuidVersion: 5 },
  }), /yalnız UUIDv4/);
  assert.throws(() => buildModel({
    ...raw,
    reasonCodes: [...raw.reasonCodes, "ACCESS_REQUEST"],
  }), /tam bir kapalı reasonCode/);
  assert.throws(() => buildModel({
    ...raw,
    reasonCodes: ["ACCESS_REQUEST"],
  }), /exact DATA_SUBJECT_ERASURE/);
});

test("canonical source duplicate JSON key ve belirsiz serialization'ı reddeder", () => {
  const source = readFileSync(join(REPO, CONTRACT_PATH), "utf8");
  assert.deepEqual(parseCanonicalContract(source), raw);
  assert.throws(
    () => parseCanonicalContract(source.replace(
      '"schemaVersion": "dsar-input-contract/v1",',
      '"schemaVersion": "dsar-input-contract/v1",\n  "schemaVersion": "dsar-input-contract/v1",',
    )),
    /duplicate-key/,
  );
  assert.throws(() => parseCanonicalContract(source.trim()), /iki-space formatında/);
});

test("generated consumer'lar kaynak ve no-edit provenance taşır", () => {
  for (const output of [renderJava(model), renderTypeScript(model), renderSql(model), renderRunbookBlock(model)]) {
    assert.match(output, /dsar-input-contract\.v1\.json/);
    assert.match(output, /DO NOT EDIT/);
  }
});

test("runbook generated block duplicate veya dengesiz marker kabul etmez", () => {
  const block = renderRunbookBlock(model);
  assert.throws(() => replaceRunbookBlock(`${block}\n${block}`, block), /exact bir BEGIN/);
  assert.throws(() => replaceRunbookBlock(block.replace("END GENERATED", "END-BOZUK"), block),
    /exact bir BEGIN/);
});

test("published v1 değiştirilemez ve yeniden üretilemez; yalnız forward version açılır", () => {
  const published = { ref: "base-sha", content: JSON.stringify(raw) };
  assert.doesNotThrow(() => assertPublicationBoundary("--check", published.content, published));
  assert.throws(
    () => assertPublicationBoundary("--check", `${published.content}\n`, published),
    /v2 contract \+ V9/,
  );
  assert.throws(
    () => assertPublicationBoundary("--write", published.content, published),
    /--write yasak.*v2 contract \+ V9/s,
  );
  assert.doesNotThrow(() => assertPublicationBoundary("--write", published.content, null));
  assert.throws(
    () => assertPublishedArtifactUnchanged("V8.sql", "changed", published),
    /eski Flyway migration yeniden yazılamaz/,
  );
  assert.doesNotThrow(
    () => assertPublishedArtifactUnchanged("V8.sql", published.content, published),
  );
});

test("CI exact base ref'i fail-closed çözer ve ilk-yayın path yokluğunu ayırır", () => {
  const calls = [];
  const runnerWithPublishedV1 = (_command, args) => {
    calls.push(args);
    if (args[0] === "cat-file") return { status: 0, stdout: "", stderr: "" };
    return { status: 0, stdout: "published-v1\n", stderr: "" };
  };
  assert.deepEqual(findPublishedArtifact({
    repositoryRoot: "/repo",
    baseRef: "exact-base-sha",
    runner: runnerWithPublishedV1,
  }), { ref: "exact-base-sha", content: "published-v1\n" });
  assert.deepEqual(calls, [
    ["cat-file", "-e", "exact-base-sha^{commit}"],
    ["cat-file", "-e", `exact-base-sha:${CONTRACT_PATH}`],
    ["show", `exact-base-sha:${CONTRACT_PATH}`],
  ]);

  const runnerWithoutPath = (_command, args) => args[0] === "cat-file"
    && args[2].endsWith("^{commit}")
    ? { status: 0, stdout: "", stderr: "" }
    : { status: 128, stdout: "", stderr: "path missing" };
  assert.equal(findPublishedArtifact({
    repositoryRoot: "/repo",
    baseRef: "first-publication-base",
    runner: runnerWithoutPath,
  }), null);

  const inaccessibleBase = () => ({ status: 128, stdout: "", stderr: "missing ref" });
  assert.throws(() => findPublishedArtifact({
    repositoryRoot: "/repo",
    baseRef: "missing-base",
    runner: inaccessibleBase,
  }), /zorunlu immutable baseline ref erişilemiyor/);
});
