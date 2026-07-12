#!/usr/bin/env node
/** P4 integration-platform/v1 schema, synthetic fixture and fail-closed invariant guard. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA = JSON.parse(
  readFileSync(
    join(REPO, "contracts/schemas/integration-platform.schema.json"),
    "utf8",
  ),
);
const SAMPLE = JSON.parse(
  readFileSync(
    join(REPO, "contracts/samples/integration-platform.sample.json"),
    "utf8",
  ),
);

const REQUIRED_DOMAINS = [
  "ATS",
  "HRIS",
  "CALENDAR_EMAIL",
  "SSO_SCIM",
  "PORTABILITY",
];
const READ_ONLY_OPERATIONS = new Set([
  "pull_candidate_ref",
  "pull_interview_ref",
  "pull_role_ref",
  "pull_worker_ref",
  "pull_availability_ref",
  "open_api_read",
]);
const FORBIDDEN_KEYS = [
  /candidate_?(email|phone|name)/i,
  /(^|_)(access_?token|refresh_?token|client_?secret|password|cookie|bearer)($|_)/i,
  /(^|_)(ranking_?score|candidate_?rank|auto_?reject|auto_?hire)($|_)/i,
  /^(raw_)?payload$/i,
];
const KNOWN_KEYWORDS = new Set([
  "$schema",
  "$id",
  "$defs",
  "$ref",
  "title",
  "description",
  "type",
  "const",
  "enum",
  "required",
  "properties",
  "additionalProperties",
  "items",
  "minItems",
  "maxItems",
  "uniqueItems",
  "minLength",
  "maxLength",
  "pattern",
  "minimum",
  "maximum",
]);

const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const canonical = (value) =>
  Array.isArray(value)
    ? `[${value.map(canonical).join(",")}]`
    : value && typeof value === "object"
      ? `{${Object.keys(value)
          .sort()
          .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
          .join(",")}}`
      : JSON.stringify(value);
const typeOf = (value) =>
  Array.isArray(value) ? "array" : value === null ? "null" : typeof value;

function runChecks(schema, sample) {
  const errors = [];
  const resolveRef = (ref) =>
    ref
      .replace("#/", "")
      .split("/")
      .reduce((node, key) => node?.[key], schema);

  function checkKeywords(node, path) {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    for (const key of Object.keys(node)) {
      if (!KNOWN_KEYWORDS.has(key))
        errors.push(`schema ${path}: unsupported keyword "${key}"`);
    }
    if ("$ref" in node) {
      for (const key of Object.keys(node)) {
        if (!["$ref", "title", "description"].includes(key)) {
          errors.push(`schema ${path}: $ref sibling "${key}"`);
        }
      }
    }
    if (node.properties) {
      for (const [key, value] of Object.entries(node.properties)) {
        checkKeywords(value, `${path}.${key}`);
      }
    }
    if (node.items) checkKeywords(node.items, `${path}[]`);
    if (node.$defs) {
      for (const [key, value] of Object.entries(node.$defs)) {
        checkKeywords(value, `${path}.$defs.${key}`);
      }
    }
  }

  function validate(value, rule, path) {
    if (rule.$ref) {
      const resolved = resolveRef(rule.$ref);
      if (!resolved) errors.push(`${path}: unresolved $ref ${rule.$ref}`);
      else validate(value, resolved, path);
      return;
    }
    if (rule.type) {
      const actual = typeOf(value);
      const matches =
        rule.type === "integer"
          ? actual === "number" && Number.isInteger(value)
          : actual === rule.type;
      if (!matches) {
        errors.push(`${path}: type ${actual} != ${rule.type}`);
        return;
      }
    }
    if ("const" in rule && !deepEqual(value, rule.const))
      errors.push(`${path}: const mismatch`);
    if (rule.enum && !rule.enum.some((item) => deepEqual(item, value))) {
      errors.push(`${path}: enum dışı ${JSON.stringify(value)}`);
    }
    if (typeof value === "string") {
      if (rule.minLength != null && value.length < rule.minLength)
        errors.push(`${path}: minLength`);
      if (rule.maxLength != null && value.length > rule.maxLength)
        errors.push(`${path}: maxLength`);
      if (rule.pattern && !new RegExp(rule.pattern).test(value))
        errors.push(`${path}: pattern`);
    }
    if (typeof value === "number") {
      if (rule.minimum != null && value < rule.minimum)
        errors.push(`${path}: minimum`);
      if (rule.maximum != null && value > rule.maximum)
        errors.push(`${path}: maximum`);
    }
    if (Array.isArray(value)) {
      if (rule.minItems != null && value.length < rule.minItems)
        errors.push(`${path}: minItems`);
      if (rule.maxItems != null && value.length > rule.maxItems)
        errors.push(`${path}: maxItems`);
      if (
        rule.uniqueItems &&
        new Set(value.map(canonical)).size !== value.length
      ) {
        errors.push(`${path}: uniqueItems`);
      }
      if (rule.items)
        value.forEach((item, index) =>
          validate(item, rule.items, `${path}[${index}]`),
        );
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const required of rule.required || []) {
        if (!(required in value))
          errors.push(`${path}: required "${required}" eksik`);
      }
      if (rule.additionalProperties === false) {
        for (const key of Object.keys(value)) {
          if (!(rule.properties && key in rule.properties))
            errors.push(`${path}: izinsiz property "${key}"`);
        }
      }
      for (const [key, childRule] of Object.entries(rule.properties || {})) {
        if (key in value) validate(value[key], childRule, `${path}.${key}`);
      }
    }
  }

  checkKeywords(schema, "$");
  validate(sample, schema, "$");

  const scanForbiddenKeys = (value, path) => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      for (const pattern of FORBIDDEN_KEYS) {
        if (pattern.test(key)) errors.push(`${path}: forbidden field "${key}"`);
      }
      scanForbiddenKeys(child, `${path}.${key}`);
    }
  };
  scanForbiddenKeys(sample, "sample");

  if (sample.activation_gate !== "PRE_G0_CONTRACT_ONLY") {
    errors.push("activation_gate PRE_G0_CONTRACT_ONLY olmalı");
  }

  const connectors = sample.connectors || [];
  const ids = connectors.map((connector) => connector.connector_id);
  if (new Set(ids).size !== ids.length) errors.push("connector_id tekil değil");
  const domains = new Set(connectors.map((connector) => connector.domain));
  for (const domain of REQUIRED_DOMAINS) {
    if (!domains.has(domain)) errors.push(`required domain eksik: ${domain}`);
  }

  for (const connector of connectors) {
    const prefix = connector.connector_id || "unknown-connector";
    if (connector.api_verified !== false)
      errors.push(`${prefix}: pre-G0 api_verified=false olmalı`);
    if (connector.verification_status === "VERIFIED")
      errors.push(`${prefix}: pre-G0 VERIFIED yasak`);
    if (connector.activation_evidence)
      errors.push(`${prefix}: pre-G0 activation_evidence yasak`);
    if (connector.mutation_policy?.human_approval_required !== true) {
      errors.push(`${prefix}: human approval required olmalı`);
    }
    if (connector.mutation_policy?.idempotency_required !== true) {
      errors.push(`${prefix}: idempotency required olmalı`);
    }
    if (connector.mutation_policy?.decision_impact !== "NONE") {
      errors.push(`${prefix}: automated decision impact yasak`);
    }
    if (connector.mutation_policy?.destructive_operations !== "DISALLOWED") {
      errors.push(`${prefix}: destructive operations yasak`);
    }
    if (connector.mutation_policy?.batch_approval !== "DISALLOWED") {
      errors.push(`${prefix}: batch approval yasak`);
    }
    if (connector.transfer_policy?.pii_mode !== "OPAQUE_REF_ONLY") {
      errors.push(`${prefix}: raw PII transfer yasak`);
    }
    if (connector.reliability?.tenant_scoped_idempotency !== true) {
      errors.push(`${prefix}: tenant-scoped idempotency zorunlu`);
    }
    if ((connector.operations || []).includes("subscribe_signed_webhook")) {
      if (connector.reliability?.webhook_signature_required !== true) {
        errors.push(`${prefix}: signed webhook signature required`);
      }
      if (!(connector.reliability?.replay_window_seconds > 0)) {
        errors.push(`${prefix}: signed webhook replay window required`);
      }
    }
    if (connector.domain === "SSO_SCIM") {
      if (
        (connector.data_classes || []).some(
          (item) => item !== "identity_admin_ref",
        )
      ) {
        errors.push(`${prefix}: SCIM yalnız identity_admin_ref taşıyabilir`);
      }
    }
    if (connector.provider_ref === "kariyer-net-optional") {
      if (connector.critical_path !== false)
        errors.push(`${prefix}: Kariyer.net critical-path olamaz`);
      if (connector.verification_status !== "NOT_CONFIGURED") {
        errors.push(`${prefix}: Kariyer.net pre-G0 NOT_CONFIGURED olmalı`);
      }
    }
  }

  const connectorById = new Map(
    connectors.map((connector) => [connector.connector_id, connector]),
  );
  const envelopeIds = new Set();
  for (const envelope of sample.synthetic_envelopes || []) {
    const prefix = envelope.event_id || "unknown-envelope";
    if (envelopeIds.has(prefix)) errors.push(`${prefix}: event_id duplicate`);
    envelopeIds.add(prefix);
    if (envelope.synthetic !== true)
      errors.push(`${prefix}: only synthetic fixture allowed`);
    const connector = connectorById.get(envelope.connector_id);
    if (!connector) {
      errors.push(`${prefix}: unknown connector_id`);
      continue;
    }
    if (!(connector.operations || []).includes(envelope.operation)) {
      errors.push(`${prefix}: operation connector capability listesinde yok`);
    }
    for (const dataClass of envelope.data_classes || []) {
      if (!(connector.data_classes || []).includes(dataClass)) {
        errors.push(
          `${prefix}: data_class connector declaration dışında: ${dataClass}`,
        );
      }
    }
    if (
      !READ_ONLY_OPERATIONS.has(envelope.operation) &&
      !envelope.human_approval_ref
    ) {
      errors.push(
        `${prefix}: mutating operation human_approval_ref gerektirir`,
      );
    }
    if (
      !String(envelope.idempotency_key || "").startsWith(
        `${envelope.tenant_ref}:`,
      )
    ) {
      errors.push(`${prefix}: idempotency_key tenant-scoped prefix taşımıyor`);
    }
  }

  return errors;
}

function selfTest() {
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const cases = [
    ["api-verified-pre-g0", (s) => (s.connectors[0].api_verified = true)],
    [
      "verified-pre-g0",
      (s) => (s.connectors[0].verification_status = "VERIFIED"),
    ],
    [
      "activation-evidence-pre-g0",
      (s) =>
        (s.connectors[0].activation_evidence = {
          sandbox_receipt_ref: "r",
          contract_version: "v1",
          verified_at: "2026-01-01T00:00:00Z",
          verifier_ref: "v",
        }),
    ],
    [
      "missing-domain",
      (s) => (s.connectors = s.connectors.filter((c) => c.domain !== "HRIS")),
    ],
    [
      "duplicate-id",
      (s) => (s.connectors[1].connector_id = s.connectors[0].connector_id),
    ],
    [
      "raw-email",
      (s) =>
        (s.synthetic_envelopes[0].candidate_email =
          "synthetic@example.invalid"),
    ],
    [
      "secret-field",
      (s) => (s.connectors[0].client_secret = "not-a-secret-fixture"),
    ],
    [
      "decision-impact",
      (s) => (s.connectors[0].mutation_policy.decision_impact = "AUTO_REJECT"),
    ],
    [
      "human-approval-off",
      (s) => (s.connectors[0].mutation_policy.human_approval_required = false),
    ],
    [
      "idempotency-off",
      (s) => (s.connectors[0].mutation_policy.idempotency_required = false),
    ],
    [
      "destructive-enabled",
      (s) =>
        (s.connectors[0].mutation_policy.destructive_operations = "ALLOWED"),
    ],
    [
      "batch-approval",
      (s) => (s.connectors[0].mutation_policy.batch_approval = "ALLOWED"),
    ],
    [
      "raw-pii-mode",
      (s) => (s.connectors[0].transfer_policy.pii_mode = "RAW_PII"),
    ],
    [
      "webhook-unsigned",
      (s) => (s.connectors[4].reliability.webhook_signature_required = false),
    ],
    [
      "webhook-no-window",
      (s) => (s.connectors[4].reliability.replay_window_seconds = 0),
    ],
    ["kariyer-critical", (s) => (s.connectors[5].critical_path = true)],
    [
      "unknown-connector",
      (s) => (s.synthetic_envelopes[0].connector_id = "missing-connector"),
    ],
    [
      "unsupported-operation",
      (s) =>
        (s.synthetic_envelopes[0].operation = "provision_human_approved_user"),
    ],
    [
      "undeclared-data-class",
      (s) => (s.synthetic_envelopes[0].data_classes = ["identity_admin_ref"]),
    ],
    [
      "approval-missing",
      (s) => delete s.synthetic_envelopes[0].human_approval_ref,
    ],
    [
      "idempotency-not-tenant",
      (s) => (s.synthetic_envelopes[0].idempotency_key = "global:001"),
    ],
    [
      "scim-wrong-data",
      (s) => s.connectors[3].data_classes.push("opaque_candidate_ref"),
    ],
    ["non-synthetic", (s) => (s.synthetic_envelopes[0].synthetic = false)],
    [
      "unsupported-schema-keyword",
      (_s, schema) => (schema.properties.connectors.oneOf = []),
    ],
  ];
  const escaped = [];
  for (const [name, mutate] of cases) {
    const sample = clone(SAMPLE);
    const schema = clone(SCHEMA);
    mutate(sample, schema);
    if (runChecks(schema, sample).length === 0) escaped.push(name);
  }
  return { escaped, total: cases.length };
}

const errors = runChecks(SCHEMA, SAMPLE);
const selfTestResult = selfTest();
for (const name of selfTestResult.escaped) {
  errors.push(`SELF-TEST escaped: ${name}`);
}

if (errors.length > 0) {
  console.error("integration-platform guard FAILED:");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(
  `integration-platform/v1 OK — ${SAMPLE.connectors.length} connectors, ${SAMPLE.synthetic_envelopes.length} synthetic envelopes, ${selfTestResult.total} negative vectors fail-closed`,
);
