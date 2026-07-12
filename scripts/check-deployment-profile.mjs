#!/usr/bin/env node
/**
 * Faz 25 P5 deployment-profile/v1 drift guard.
 *
 * Contract only: a green gate proves schema/sample/invariant parity. It does not
 * prove a cluster, signed release, restore, rollback, rotation or partner drill.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA = JSON.parse(
  readFileSync(
    join(REPO, "contracts/schemas/deployment-profile.schema.json"),
    "utf8",
  ),
);
const SAMPLE = JSON.parse(
  readFileSync(
    join(REPO, "contracts/samples/deployment-profile.sample.json"),
    "utf8",
  ),
);

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

const TOPOLOGIES = [
  "MANAGED",
  "DEDICATED",
  "BYO_REGION",
  "SOVEREIGN_ON_PREM",
];
const GATES = [
  "SUPPLY_CHAIN",
  "PROFILE_RENDER",
  "IDENTITY",
  "EGRESS",
  "SECRET_ROTATION",
  "BACKUP_RESTORE",
  "UPGRADE_ROLLBACK",
  "AUDIT_EXPORT",
];
const DRILL_REQUIRED = new Set([
  "EGRESS",
  "SECRET_ROTATION",
  "BACKUP_RESTORE",
  "UPGRADE_ROLLBACK",
  "AUDIT_EXPORT",
]);
const RPO_RTO_REQUIRED = new Set(["BACKUP_RESTORE", "UPGRADE_ROLLBACK"]);
const STATE_RANK = new Map([
  ["NOT_CONFIGURED", 0],
  ["CONFIGURED", 1],
  ["VERIFIED", 2],
  ["DRILL_PASSED", 3],
  ["OWNER_ACCEPTED", 4],
]);

const EXPECTED = {
  MANAGED: {
    minimum_paid_partners: 0,
    controls: {
      control_plane_owner: "PLATFORM",
      data_plane_owner: "PLATFORM",
      isolation: "LOGICAL_TENANT",
      residency: "PLATFORM_APPROVED_REGION",
      egress: "ALLOWLIST_ONLY",
      identity: "PLATFORM_FEDERATED_OIDC_SAML",
      secrets: "PLATFORM_KMS_ROTATED",
      storage: "ENCRYPTED_LOGICAL_TENANT",
      ai_provider: "SELF_HOSTED_PRIMARY",
      support: "PLATFORM_OPERATED",
    },
  },
  DEDICATED: {
    minimum_paid_partners: 1,
    controls: {
      control_plane_owner: "PLATFORM",
      data_plane_owner: "PLATFORM",
      isolation: "DEDICATED_TENANT",
      residency: "CUSTOMER_SELECTED_REGION",
      egress: "DENY_BY_DEFAULT",
      identity: "CUSTOMER_FEDERATED_OIDC_SAML",
      secrets: "PLATFORM_KMS_ROTATED",
      storage: "ENCRYPTED_DEDICATED",
      ai_provider: "SELF_HOSTED_PRIMARY",
      support: "PLATFORM_OPERATED",
    },
  },
  BYO_REGION: {
    minimum_paid_partners: 1,
    controls: {
      control_plane_owner: "SHARED",
      data_plane_owner: "CUSTOMER",
      isolation: "DEDICATED_REGION",
      residency: "CUSTOMER_SELECTED_REGION",
      egress: "DENY_BY_DEFAULT",
      identity: "CUSTOMER_FEDERATED_OIDC_SAML",
      secrets: "CUSTOMER_KMS_BYOK",
      storage: "CUSTOMER_MANAGED_ENCRYPTED",
      ai_provider: "CUSTOMER_APPROVED_PROVIDER",
      support: "SHARED_RESPONSIBILITY",
    },
  },
  SOVEREIGN_ON_PREM: {
    minimum_paid_partners: 2,
    controls: {
      control_plane_owner: "CUSTOMER",
      data_plane_owner: "CUSTOMER",
      isolation: "CUSTOMER_CONTROLLED_BOUNDARY",
      residency: "CUSTOMER_CONTROLLED_RESIDENCY",
      egress: "AIR_GAPPED_OR_CUSTOMER_ALLOWLIST",
      identity: "CUSTOMER_CONTROLLED_SSO_SCIM_METADATA",
      secrets: "CUSTOMER_MANAGED_OFFLINE_KEYS",
      storage: "CUSTOMER_MANAGED_ENCRYPTED",
      ai_provider: "OFFLINE_SELF_HOSTED_ONLY",
      support: "CUSTOMER_OPERATED_SIGNED_BUNDLE",
    },
  },
};

const FORBIDDEN_KEYS = [
  /^(customer|tenant)(_?id|_?name)$/i,
  /^candidate_?(email|phone|name)$/i,
  /^(host_?name|ip_?address|cluster_?endpoint)$/i,
  /^(access_?token|refresh_?token|client_?secret|private_?key|password)$/i,
];
const RELEASE_DETAIL_KEYS = new Set([
  "images",
  "sbom",
  "vuln_scan",
  "license_scan",
  "secret_scan",
  "provenance",
  "signature",
  "model_artifacts",
]);
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const URL = /\bhttps?:\/\//i;
const IPV4 = /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/;
const IPV6 = /(?:\[[0-9a-f:]+\]|[0-9a-f]*::[0-9a-f:]*|^(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}$)/i;
const UTC_TIMESTAMP = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?Z$/;
const ZERO_DIGEST = /^sha256:0{64}$/;

const clone = (value) => JSON.parse(JSON.stringify(value));
const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};
const deepEqual = (a, b) => canonical(a) === canonical(b);
const nodeType = (value) => {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
};

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
      if (!KNOWN_KEYWORDS.has(key)) {
        errors.push(`schema ${path}: unsupported keyword "${key}"`);
      }
    }
    if ("$ref" in node) {
      for (const key of Object.keys(node)) {
        if (!["$ref", "title", "description"].includes(key)) {
          errors.push(`schema ${path}: $ref sibling "${key}"`);
        }
      }
    }
    if (node.properties) {
      for (const [key, child] of Object.entries(node.properties)) {
        checkKeywords(child, `${path}.${key}`);
      }
    }
    if (node.items) checkKeywords(node.items, `${path}[]`);
    if (node.$defs) {
      for (const [key, child] of Object.entries(node.$defs)) {
        checkKeywords(child, `${path}.$defs.${key}`);
      }
    }
  }

  function validate(value, rule, path) {
    if (rule.$ref) {
      const resolved = resolveRef(rule.$ref);
      if (!resolved) {
        errors.push(`${path}: unresolved $ref "${rule.$ref}"`);
        return;
      }
      validate(value, resolved, path);
      return;
    }
    if (rule.type) {
      const actual = nodeType(value);
      const valid =
        rule.type === "object"
          ? actual === "object"
          : rule.type === "number"
            ? actual === "number" || actual === "integer"
            : actual === rule.type;
      if (!valid) {
        errors.push(`${path}: type "${actual}" != "${rule.type}"`);
        return;
      }
    }
    if ("const" in rule && !deepEqual(value, rule.const)) {
      errors.push(`${path}: const ${JSON.stringify(rule.const)} required`);
    }
    if (rule.enum && !rule.enum.some((item) => deepEqual(item, value))) {
      errors.push(`${path}: enum violation "${value}"`);
    }
    if (rule.minLength != null && value.length < rule.minLength) {
      errors.push(`${path}: minLength`);
    }
    if (rule.maxLength != null && value.length > rule.maxLength) {
      errors.push(`${path}: maxLength`);
    }
    if (rule.pattern && typeof value === "string") {
      if (!new RegExp(rule.pattern).test(value)) {
        errors.push(`${path}: pattern violation "${value}"`);
      }
    }
    if (rule.minimum != null && value < rule.minimum) {
      errors.push(`${path}: minimum ${rule.minimum}`);
    }
    if (rule.maximum != null && value > rule.maximum) {
      errors.push(`${path}: maximum ${rule.maximum}`);
    }
    if (rule.type === "array" && Array.isArray(value)) {
      if (rule.minItems != null && value.length < rule.minItems) {
        errors.push(`${path}: minItems ${rule.minItems}`);
      }
      if (rule.maxItems != null && value.length > rule.maxItems) {
        errors.push(`${path}: maxItems ${rule.maxItems}`);
      }
      if (rule.uniqueItems) {
        if (new Set(value.map(canonical)).size !== value.length) {
          errors.push(`${path}: uniqueItems`);
        }
      }
      if (rule.items) {
        value.forEach((item, index) => validate(item, rule.items, `${path}[${index}]`));
      }
    }
    if (
      rule.type === "object" &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      for (const required of rule.required || []) {
        if (!(required in value)) errors.push(`${path}: required "${required}" missing`);
      }
      if (rule.additionalProperties === false) {
        for (const key of Object.keys(value)) {
          if (!rule.properties || !(key in rule.properties)) {
            errors.push(`${path}: additional property "${key}"`);
          }
        }
      }
      for (const [key, child] of Object.entries(rule.properties || {})) {
        if (key in value) validate(value[key], child, `${path}.${key}`);
      }
    }
  }

  function scan(value, path = "$sample") {
    if (Array.isArray(value)) {
      value.forEach((item, index) => scan(item, `${path}[${index}]`));
      return;
    }
    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        if (FORBIDDEN_KEYS.some((pattern) => pattern.test(key))) {
          errors.push(`${path}.${key}: forbidden secret/PII/network key`);
        }
        if (RELEASE_DETAIL_KEYS.has(key)) {
          errors.push(`${path}.${key}: release-evidence/v1 detail duplicated; opaque ref only`);
        }
        scan(child, `${path}.${key}`);
      }
      return;
    }
    if (typeof value === "string") {
      if (EMAIL.test(value)) errors.push(`${path}: email-like value forbidden`);
      if (URL.test(value)) errors.push(`${path}: URL/host coordinate forbidden`);
      if (IPV4.test(value)) errors.push(`${path}: IPv4 coordinate forbidden`);
      if (!UTC_TIMESTAMP.test(value) && IPV6.test(value)) {
        errors.push(`${path}: IPv6 coordinate forbidden`);
      }
    }
  }

  checkKeywords(schema, "$schema");
  validate(sample, schema, "$sample");
  scan(sample);

  const profiles = sample.profiles || [];
  if (profiles.length === TOPOLOGIES.length) {
    const topologySet = new Set(profiles.map((profile) => profile.topology));
    const profileIdSet = new Set(profiles.map((profile) => profile.profile_id));
    for (const topology of TOPOLOGIES) {
      if (!topologySet.has(topology)) errors.push(`missing topology "${topology}"`);
    }
    if (topologySet.size !== TOPOLOGIES.length) errors.push("topologies must be unique");
    if (profileIdSet.size !== profiles.length) errors.push("profile_id must be unique");
  }

  for (const profile of profiles) {
    const expected = EXPECTED[profile.topology];
    if (expected) {
      if (profile.minimum_paid_partners !== expected.minimum_paid_partners) {
        errors.push(`${profile.topology}: minimum_paid_partners mismatch`);
      }
      if (!deepEqual(profile.controls, expected.controls)) {
        errors.push(`${profile.topology}: topology control boundary mismatch`);
      }
    }
    if (!String(profile.release_evidence_manifest_ref || "").startsWith("release-evidence:")) {
      errors.push(`${profile.topology}: release-evidence/v1 opaque ref required`);
    }
    if (
      profile.release_evidence_manifest_verified &&
      ZERO_DIGEST.test(profile.release_evidence_manifest_digest || "")
    ) {
      errors.push(`${profile.topology}: verified release manifest cannot use synthetic zero digest`);
    }
    const objectives = profile.recovery_objectives || {};
    const hasRpoTarget = Number.isInteger(objectives.target_rpo_seconds);
    const hasRtoTarget = Number.isInteger(objectives.target_rto_seconds);
    if (objectives.targets_defined !== (hasRpoTarget && hasRtoTarget)) {
      errors.push(`${profile.topology}: RPO/RTO targets must be defined together`);
    }
    if (!objectives.targets_defined && (hasRpoTarget || hasRtoTarget)) {
      errors.push(`${profile.topology}: targets forbidden while targets_defined=false`);
    }
    if (objectives.rollback_window_hours < 72) {
      errors.push(`${profile.topology}: rollback window must be at least 72 hours`);
    }

    const gates = profile.gates || [];
    const gateKinds = new Set(gates.map((gate) => gate.kind));
    for (const gateKind of GATES) {
      if (!gateKinds.has(gateKind)) errors.push(`${profile.topology}: missing gate ${gateKind}`);
    }
    if (gateKinds.size !== GATES.length) {
      errors.push(`${profile.topology}: gate kinds must be unique and complete`);
    }

    for (const gate of gates) {
      const mustDrill = DRILL_REQUIRED.has(gate.kind);
      if (gate.drill_required !== mustDrill) {
        errors.push(`${profile.topology}/${gate.kind}: drill_required mismatch`);
      }
      const evidence = gate.evidence;
      if (gate.status === "NOT_CONFIGURED" || gate.status === "CONFIGURED") {
        if (gate.evidence_verified || gate.drill_passed || gate.owner_accepted || evidence) {
          errors.push(`${profile.topology}/${gate.kind}: early state cannot carry verified evidence`);
        }
      }
      if (["VERIFIED", "DRILL_PASSED", "OWNER_ACCEPTED"].includes(gate.status)) {
        if (!gate.evidence_verified || !evidence) {
          errors.push(`${profile.topology}/${gate.kind}: verified state requires evidence receipt`);
        }
      }
      if (gate.status === "DRILL_PASSED" || (gate.status === "OWNER_ACCEPTED" && mustDrill)) {
        if (!mustDrill || !gate.drill_passed || !evidence?.drill_evidence_ref || !evidence?.measured_at) {
          errors.push(`${profile.topology}/${gate.kind}: drill state requires measured drill evidence`);
        }
        if (RPO_RTO_REQUIRED.has(gate.kind)) {
          if (!Number.isInteger(evidence?.observed_rpo_seconds)) {
            errors.push(`${profile.topology}/${gate.kind}: observed RPO required`);
          }
          if (!Number.isInteger(evidence?.observed_rto_seconds)) {
            errors.push(`${profile.topology}/${gate.kind}: observed RTO required`);
          }
          if (objectives.targets_defined) {
            if (evidence?.observed_rpo_seconds > objectives.target_rpo_seconds) {
              errors.push(`${profile.topology}/${gate.kind}: observed RPO exceeds target`);
            }
            if (evidence?.observed_rto_seconds > objectives.target_rto_seconds) {
              errors.push(`${profile.topology}/${gate.kind}: observed RTO exceeds target`);
            }
          }
        }
      } else if (gate.drill_passed) {
        errors.push(`${profile.topology}/${gate.kind}: drill_passed inconsistent with state`);
      }
      if (gate.status === "OWNER_ACCEPTED") {
        if (!gate.owner_accepted || !evidence?.owner_acceptance_ref) {
          errors.push(`${profile.topology}/${gate.kind}: owner acceptance receipt required`);
        }
      } else if (gate.owner_accepted) {
        errors.push(`${profile.topology}/${gate.kind}: owner_accepted inconsistent with state`);
      }
      if (gate.kind === "SUPPLY_CHAIN" && gate.evidence_verified) {
        if (evidence?.evidence_ref !== profile.release_evidence_manifest_ref) {
          errors.push(`${profile.topology}: supply-chain gate must bind release evidence ref`);
        }
      }
    }

    const gateRanks = gates.map((gate) => STATE_RANK.get(gate.status) ?? -1);
    const derivedRank = gateRanks.length > 0 ? Math.min(...gateRanks) : -1;
    if (STATE_RANK.get(profile.readiness_state) !== derivedRank) {
      errors.push(`${profile.topology}: readiness_state must equal least-ready gate`);
    }

    const supplyGate = gates.find((gate) => gate.kind === "SUPPLY_CHAIN");
    const allGatesOwnerAccepted = gates.every(
      (gate) => gate.status === "OWNER_ACCEPTED" && gate.owner_accepted,
    );
    if (
      profile.owner_accepted &&
      (profile.readiness_state !== "OWNER_ACCEPTED" || !allGatesOwnerAccepted)
    ) {
      errors.push(`${profile.topology}: profile owner acceptance requires every gate accepted`);
    }
    if (profile.release_evidence_manifest_verified !== Boolean(supplyGate?.evidence_verified)) {
      errors.push(`${profile.topology}: release manifest verification must match supply-chain gate`);
    }
    const partnerThresholdMet = profile.paid_partner_count >= profile.minimum_paid_partners;
    if (profile.partner_evidence_verified && !partnerThresholdMet) {
      errors.push(`${profile.topology}: partner evidence below minimum threshold`);
    }
    if (profile.production_eligible !== profile.release_allowed) {
      errors.push(`${profile.topology}: production_eligible and release_allowed must match`);
    }
    if (profile.release_allowed) {
      const partnerReady =
        profile.minimum_paid_partners === 0 || profile.partner_evidence_verified;
      if (
        sample.activation_gate !== "G0_ACCEPTED_RUNTIME" ||
        profile.synthetic ||
        profile.readiness_state !== "OWNER_ACCEPTED" ||
        !allGatesOwnerAccepted ||
        !profile.release_evidence_manifest_verified ||
        !objectives.targets_defined ||
        !partnerThresholdMet ||
        !partnerReady ||
        !profile.owner_accepted ||
        !profile.activation_evidence
      ) {
        errors.push(`${profile.topology}: release_allowed bypasses acceptance chain`);
      }
      if (
        (profile.activation_evidence?.partner_evidence_refs || []).length <
        profile.minimum_paid_partners
      ) {
        errors.push(`${profile.topology}: activation evidence lacks partner receipts`);
      }
    } else if (profile.activation_evidence) {
      errors.push(`${profile.topology}: activation evidence forbidden while release is closed`);
    }
  }

  if (sample.activation_gate === "PRE_G0_CONTRACT_ONLY") {
    for (const profile of profiles) {
      if (!profile.synthetic) errors.push(`${profile.topology}: pre-G0 profile must be synthetic`);
      if (profile.readiness_state !== "NOT_CONFIGURED") {
        errors.push(`${profile.topology}: pre-G0 readiness must be NOT_CONFIGURED`);
      }
      if (
        profile.recovery_objectives?.targets_defined ||
        profile.release_evidence_manifest_verified ||
        profile.partner_evidence_verified ||
        profile.owner_accepted ||
        profile.production_eligible ||
        profile.release_allowed ||
        profile.activation_evidence
      ) {
        errors.push(`${profile.topology}: pre-G0 activation or acceptance claim forbidden`);
      }
      for (const gate of profile.gates || []) {
        if (
          gate.status !== "NOT_CONFIGURED" ||
          gate.evidence_verified ||
          gate.drill_passed ||
          gate.owner_accepted ||
          gate.evidence
        ) {
          errors.push(`${profile.topology}/${gate.kind}: pre-G0 gate must be empty and closed`);
        }
      }
    }
  }

  return errors;
}

function makeAcceptedRuntime() {
  const sample = clone(SAMPLE);
  sample.activation_gate = "G0_ACCEPTED_RUNTIME";
  for (const profile of sample.profiles) {
    const topologyRef = profile.topology.toLowerCase().replaceAll("_", "-");
    profile.synthetic = false;
    profile.readiness_state = "OWNER_ACCEPTED";
    profile.release_evidence_manifest_digest = `sha256:${"1".repeat(64)}`;
    profile.release_evidence_manifest_verified = true;
    profile.recovery_objectives.targets_defined = true;
    profile.recovery_objectives.target_rpo_seconds = 3600;
    profile.recovery_objectives.target_rto_seconds = 7200;
    profile.paid_partner_count = profile.minimum_paid_partners;
    profile.partner_evidence_verified = profile.minimum_paid_partners > 0;
    profile.owner_accepted = true;
    profile.production_eligible = true;
    profile.release_allowed = true;
    profile.gates = profile.gates.map((gate) => {
      const gateRef = gate.kind.toLowerCase().replaceAll("_", "-");
      const evidence = {
        evidence_ref:
          gate.kind === "SUPPLY_CHAIN"
            ? profile.release_evidence_manifest_ref
            : `evidence:${topologyRef}:${gateRef}`,
        verifier_ref: "verifier:synthetic:v1",
        verified_at: "1970-01-01T00:00:00Z",
        owner_acceptance_ref: `owner-acceptance:${topologyRef}:${gateRef}`,
      };
      if (gate.drill_required) {
        evidence.drill_evidence_ref = `drill:${topologyRef}:${gateRef}`;
        evidence.measured_at = "1970-01-01T00:00:00Z";
      }
      if (RPO_RTO_REQUIRED.has(gate.kind)) {
        evidence.observed_rpo_seconds = 600;
        evidence.observed_rto_seconds = 1200;
      }
      return {
        ...gate,
        status: "OWNER_ACCEPTED",
        evidence_verified: true,
        drill_passed: gate.drill_required,
        owner_accepted: true,
        evidence,
      };
    });
    profile.activation_evidence = {
      release_receipt_ref: `release-receipt:${topologyRef}:v1`,
      partner_evidence_refs: Array.from(
        { length: profile.minimum_paid_partners },
        (_, index) => `partner-evidence:${topologyRef}:${index + 1}`,
      ),
      owner_acceptance_ref: `owner-acceptance:${topologyRef}:profile`,
      accepted_at: "1970-01-01T00:00:00Z",
    };
  }
  return sample;
}

function selfTest() {
  const cases = [
    ["bad-schema-version", (sample) => (sample.schema_version = "deployment-profile/v2")],
    ["missing-profile", (sample) => sample.profiles.pop()],
    ["duplicate-topology", (sample) => (sample.profiles[1].topology = "MANAGED")],
    ["duplicate-profile-id", (sample) => (sample.profiles[1].profile_id = sample.profiles[0].profile_id)],
    ["release-open-pre-g0", (sample) => (sample.profiles[0].release_allowed = true)],
    ["production-eligible", (sample) => (sample.profiles[0].production_eligible = true)],
    ["partner-evidence-claim", (sample) => (sample.profiles[1].partner_evidence_verified = true)],
    ["owner-accepted-claim", (sample) => (sample.profiles[0].owner_accepted = true)],
    ["manifest-verified-claim", (sample) => (sample.profiles[0].release_evidence_manifest_verified = true)],
    ["activation-evidence-claim", (sample) => {
      sample.profiles[0].activation_evidence = {
        release_receipt_ref: "receipt:synthetic:v1",
        partner_evidence_refs: [],
        owner_acceptance_ref: "owner:synthetic:v1",
        accepted_at: "1970-01-01T00:00:00Z",
      };
    }],
    ["gate-verified-without-evidence", (sample) => (sample.profiles[0].gates[0].status = "VERIFIED")],
    ["gate-evidence-flag", (sample) => (sample.profiles[0].gates[0].evidence_verified = true)],
    ["gate-drill-passed", (sample) => (sample.profiles[0].gates[3].drill_passed = true)],
    ["gate-owner-accepted", (sample) => (sample.profiles[0].gates[0].owner_accepted = true)],
    ["missing-gate", (sample) => sample.profiles[0].gates.pop()],
    ["duplicate-gate", (sample) => (sample.profiles[0].gates[1].kind = "SUPPLY_CHAIN")],
    ["wrong-drill-policy", (sample) => (sample.profiles[0].gates[3].drill_required = false)],
    ["wrong-partner-minimum", (sample) => (sample.profiles[3].minimum_paid_partners = 1)],
    ["wrong-control-boundary", (sample) => (sample.profiles[3].controls.control_plane_owner = "PLATFORM")],
    ["raw-secret-key", (sample) => (sample.profiles[0].client_secret = "synthetic")],
    ["raw-customer-key", (sample) => (sample.profiles[0].customer_id = "synthetic")],
    ["email-value", (sample) => (sample.profiles[0].profile_id = "user@example.com")],
    ["ip-value", (sample) => (sample.profiles[0].profile_id = "10.10.10.10")],
    ["url-value", (sample) => (sample.profiles[0].release_evidence_manifest_ref = "https://example.com/evidence")],
    ["release-detail-duplication", (sample) => (sample.profiles[0].sbom = { format: "spdx" })],
    ["wrong-manifest-ref", (sample) => (sample.profiles[0].release_evidence_manifest_ref = "artifact:synthetic:v1")],
    ["bad-manifest-digest", (sample) => (sample.profiles[0].release_evidence_manifest_digest = "sha256:bad")],
    ["short-rollback-window", (sample) => (sample.profiles[0].recovery_objectives.rollback_window_hours = 71)],
    ["unsigned-release-policy", (sample) => (sample.profiles[0].recovery_objectives.signed_release_required = false)],
    ["pre-g0-target-claim", (sample) => {
      sample.profiles[0].recovery_objectives.targets_defined = true;
      sample.profiles[0].recovery_objectives.target_rpo_seconds = 3600;
      sample.profiles[0].recovery_objectives.target_rto_seconds = 7200;
    }],
    ["lone-rpo-with-targets-disabled", (sample) => {
      sample.profiles[0].recovery_objectives.target_rpo_seconds = 3600;
    }],
    ["ipv6-coordinate", (sample) => {
      sample.profiles[0].profile_id = "profile:[2001:db8::1]";
    }],
    ["g0-owner-without-gates", (sample) => {
      sample.activation_gate = "G0_ACCEPTED_RUNTIME";
      sample.profiles[0].owner_accepted = true;
    }],
    ["non-synthetic", (sample) => (sample.profiles[0].synthetic = false)],
    ["pre-g0-configured", (sample) => (sample.profiles[0].readiness_state = "CONFIGURED")],
    ["unsupported-schema-keyword", (_sample, schema) => (schema.properties.profiles.oneOf = [])],
    ["maximum-isolated", (_sample, schema) => {
      schema.properties.profiles.maxItems = 3;
    }],
    ["runtime-zero-digest", (sample) => {
      sample.profiles[0].release_evidence_manifest_digest = `sha256:${"0".repeat(64)}`;
    }, "runtime"],
    ["runtime-target-missing", (sample) => {
      delete sample.profiles[0].recovery_objectives.target_rto_seconds;
    }, "runtime"],
    ["runtime-rpo-exceeds-target", (sample) => {
      const gate = sample.profiles[0].gates.find((item) => item.kind === "BACKUP_RESTORE");
      gate.evidence.observed_rpo_seconds = 3601;
    }, "runtime"],
    ["runtime-observed-rpo-over-maximum", (sample) => {
      const gate = sample.profiles[0].gates.find((item) => item.kind === "BACKUP_RESTORE");
      gate.evidence.observed_rpo_seconds = 31536001;
    }, "runtime"],
    ["runtime-partner-shortfall", (sample) => {
      sample.profiles[1].paid_partner_count = 0;
      sample.profiles[1].partner_evidence_verified = false;
    }, "runtime"],
    ["runtime-supply-ref-mismatch", (sample) => {
      const gate = sample.profiles[0].gates.find((item) => item.kind === "SUPPLY_CHAIN");
      gate.evidence.evidence_ref = "release-evidence:other:v1";
    }, "runtime"],
    ["runtime-owner-receipt-missing", (sample) => {
      delete sample.profiles[0].gates[0].evidence.owner_acceptance_ref;
    }, "runtime"],
    ["runtime-gate-lowered", (sample) => {
      sample.profiles[0].gates[0].status = "VERIFIED";
      sample.profiles[0].gates[0].owner_accepted = false;
      delete sample.profiles[0].gates[0].evidence.owner_acceptance_ref;
    }, "runtime"],
  ];

  const escaped = [];
  const positiveRuntimeErrors = runChecks(SCHEMA, makeAcceptedRuntime());
  for (const [name, mutate, fixture = "pre-g0"] of cases) {
    const sample = fixture === "runtime" ? makeAcceptedRuntime() : clone(SAMPLE);
    const schema = clone(SCHEMA);
    mutate(sample, schema);
    if (runChecks(schema, sample).length === 0) escaped.push(name);
  }
  return { escaped, total: cases.length, positiveRuntimeErrors };
}

const errors = runChecks(SCHEMA, SAMPLE);
const selfTestResult = selfTest();
for (const name of selfTestResult.escaped) {
  errors.push(`SELF-TEST escaped: ${name}`);
}
for (const error of selfTestResult.positiveRuntimeErrors) {
  errors.push(`RUNTIME POSITIVE fixture rejected: ${error}`);
}

if (errors.length > 0) {
  console.error("deployment-profile/v1 guard FAILED:");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(
  `deployment-profile/v1 OK — ${SAMPLE.profiles.length} isolated topology profiles, ${GATES.length} independent gates each, ${selfTestResult.total} negative vectors fail-closed; runtime/partner evidence not claimed`,
);
