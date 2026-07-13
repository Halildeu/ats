#!/usr/bin/env node
/**
 * Faz 25 P6 intelligence-evaluation/v1 drift guard.
 *
 * A green result proves contract/invariant parity only. It does not prove a real
 * cohort, fairness conclusion, legal review, owner acceptance or live action.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA = JSON.parse(
  readFileSync(
    join(REPO, "contracts/schemas/intelligence-evaluation.schema.json"),
    "utf8",
  ),
);
const SAMPLE = JSON.parse(
  readFileSync(
    join(REPO, "contracts/samples/intelligence-evaluation.sample.json"),
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

const CAPABILITY_KINDS = [
  "QOH",
  "FAIRNESS",
  "COACHING",
  "SKILLS_ONTOLOGY",
  "DEEPFAKE_PROVENANCE",
  "INTERNAL_MOBILITY",
  "AGENTIC_PROPOSAL",
];
const GATE_KINDS = ["EVIDENCE", "LEGAL", "INDEPENDENT_AUDIT", "OWNER"];
const PROPOSAL_KINDS = new Set([
  "COACHING",
  "SKILLS_ONTOLOGY",
  "INTERNAL_MOBILITY",
  "AGENTIC_PROPOSAL",
]);
const HUMAN_ACTION_KINDS = new Set([
  "COACHING",
  "SKILLS_ONTOLOGY",
  "INTERNAL_MOBILITY",
]);
const SCREENING_ONLY_KINDS = new Set(["FAIRNESS", "DEEPFAKE_PROVENANCE"]);
const EXPECTED_ACTION = {
  COACHING: "COACHING_DRAFT",
  SKILLS_ONTOLOGY: "SKILL_SUGGESTION",
  DEEPFAKE_PROVENANCE: "RISK_REVIEW_REQUEST",
  INTERNAL_MOBILITY: "MOBILITY_REVIEW_SUGGESTION",
  AGENTIC_PROPOSAL: "NO_ACTION",
};

const POLICY_BANS = {
  human_review_required: true,
  appeal_required: true,
  rollback_required: true,
  produces_decision: false,
  numeric_scoring: "DISALLOWED",
  ranking: "DISALLOWED",
  automated_employment_decision: "DISALLOWED",
  affect_emotion_inference: "DISALLOWED",
  personality_inference: "DISALLOWED",
  deception_inference: "DISALLOWED",
  protected_attribute_optimization: "DISALLOWED",
  provenance_sole_adverse_action: "DISALLOWED",
  autonomous_mutation: "DISALLOWED",
  batch_approval: "DISALLOWED",
};
const HARD_BANS = {
  numeric_scoring: "DISALLOWED",
  ranking: "DISALLOWED",
  automated_employment_decision: "DISALLOWED",
  affect_emotion_inference: "DISALLOWED",
  personality_inference: "DISALLOWED",
  deception_inference: "DISALLOWED",
  protected_attribute_optimization: "DISALLOWED",
  provenance_sole_adverse_action: "DISALLOWED",
  autonomous_mutation: "DISALLOWED",
  batch_approval: "DISALLOWED",
};

const EXPECTED_RESULT_ROLE = {
  QOH: ["DESCRIPTIVE_ASSOCIATION", false],
  FAIRNESS: ["SCREENING_INDICATOR", true],
  COACHING: ["EVIDENCE_METRIC", false],
  SKILLS_ONTOLOGY: ["EVIDENCE_METRIC", false],
  DEEPFAKE_PROVENANCE: ["SCREENING_INDICATOR", true],
  INTERNAL_MOBILITY: ["EVIDENCE_METRIC", false],
  AGENTIC_PROPOSAL: ["EVIDENCE_METRIC", false],
};

const EXPECTED = {
  QOH: {
    lifecycle: "RESEARCH_ONLY",
    metricKind: "OUTCOME_ASSOCIATION",
    policy: {
      output_mode: "AGGREGATE_EVIDENCE",
      individual_action_scope: "NO_INDIVIDUAL_ACTION",
      human_screening_only: false,
      four_fifths_indicator_role: "NOT_APPLICABLE",
      deepfake_signal_role: "NOT_APPLICABLE",
      citation_required: false,
      ontology_provenance_required: false,
    },
  },
  FAIRNESS: {
    lifecycle: "EVIDENCE_REQUIRED",
    metricKind: "SELECTION_RATE_SCREENING",
    policy: {
      output_mode: "SCREENING_INDICATOR",
      individual_action_scope: "NO_INDIVIDUAL_ACTION",
      human_screening_only: true,
      four_fifths_indicator_role: "SCREENING_ONLY",
      deepfake_signal_role: "NOT_APPLICABLE",
      citation_required: false,
      ontology_provenance_required: false,
    },
  },
  COACHING: {
    lifecycle: "PROPOSAL_ONLY",
    metricKind: "CITATION_COVERAGE",
    policy: {
      output_mode: "CITATION_BACKED_PROPOSAL",
      individual_action_scope: "HUMAN_REVIEWED_PROPOSAL",
      human_screening_only: false,
      four_fifths_indicator_role: "NOT_APPLICABLE",
      deepfake_signal_role: "NOT_APPLICABLE",
      citation_required: true,
      ontology_provenance_required: false,
    },
  },
  SKILLS_ONTOLOGY: {
    lifecycle: "PROPOSAL_ONLY",
    metricKind: "ONTOLOGY_PROVENANCE_COVERAGE",
    policy: {
      output_mode: "PROVENANCE_BACKED_PROPOSAL",
      individual_action_scope: "HUMAN_REVIEWED_PROPOSAL",
      human_screening_only: false,
      four_fifths_indicator_role: "NOT_APPLICABLE",
      deepfake_signal_role: "NOT_APPLICABLE",
      citation_required: false,
      ontology_provenance_required: true,
    },
  },
  DEEPFAKE_PROVENANCE: {
    lifecycle: "EVIDENCE_REQUIRED",
    metricKind: "PROVENANCE_RISK_SIGNAL",
    policy: {
      output_mode: "SCREENING_INDICATOR",
      individual_action_scope: "NO_INDIVIDUAL_ACTION",
      human_screening_only: true,
      four_fifths_indicator_role: "NOT_APPLICABLE",
      deepfake_signal_role: "SCREENING_ONLY",
      citation_required: false,
      ontology_provenance_required: false,
    },
  },
  INTERNAL_MOBILITY: {
    lifecycle: "BLOCKED",
    metricKind: "HUMAN_REVIEWED_SKILL_MATCH",
    policy: {
      output_mode: "PROVENANCE_BACKED_PROPOSAL",
      individual_action_scope: "HUMAN_REVIEWED_PROPOSAL",
      human_screening_only: false,
      four_fifths_indicator_role: "NOT_APPLICABLE",
      deepfake_signal_role: "NOT_APPLICABLE",
      citation_required: false,
      ontology_provenance_required: true,
    },
  },
  AGENTIC_PROPOSAL: {
    lifecycle: "DISALLOWED",
    metricKind: "PROPOSAL_SAFETY",
    policy: {
      output_mode: "NO_OUTPUT",
      individual_action_scope: "NO_INDIVIDUAL_ACTION",
      human_screening_only: false,
      four_fifths_indicator_role: "NOT_APPLICABLE",
      deepfake_signal_role: "NOT_APPLICABLE",
      citation_required: false,
      ontology_provenance_required: false,
    },
  },
};

const RAW_KEY_PATTERNS = [
  /^(candidate|employee|person)(_?id|_?name)$/i,
  /^(email|phone|protected_?(attribute|group))$/i,
  /^(raw_?metric_?value|numeric_?score|ranking_?score|candidate_?rank)$/i,
  /^(affect|emotion|personality|deception)_?label$/i,
  /^(auto_?decision|access_?token|client_?secret|password)$/i,
];
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

  function checkKeywords(rule, path) {
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) return;
    for (const key of Object.keys(rule)) {
      if (!KNOWN_KEYWORDS.has(key)) errors.push(`schema ${path}: unsupported keyword "${key}"`);
    }
    if ("$ref" in rule) {
      for (const key of Object.keys(rule)) {
        if (!["$ref", "title", "description"].includes(key)) {
          errors.push(`schema ${path}: $ref sibling "${key}"`);
        }
      }
    }
    for (const [key, child] of Object.entries(rule.properties || {})) {
      checkKeywords(child, `${path}.${key}`);
    }
    if (rule.items) checkKeywords(rule.items, `${path}[]`);
    for (const [key, child] of Object.entries(rule.$defs || {})) {
      checkKeywords(child, `${path}.$defs.${key}`);
    }
  }

  function validate(value, rule, path) {
    if (rule.$ref) {
      const resolved = resolveRef(rule.$ref);
      if (!resolved) errors.push(`${path}: unresolved $ref "${rule.$ref}"`);
      else validate(value, resolved, path);
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
    if (rule.minLength != null && value.length < rule.minLength) errors.push(`${path}: minLength`);
    if (rule.maxLength != null && value.length > rule.maxLength) errors.push(`${path}: maxLength`);
    if (rule.pattern && typeof value === "string" && !new RegExp(rule.pattern).test(value)) {
      errors.push(`${path}: pattern violation "${value}"`);
    }
    if (rule.minimum != null && value < rule.minimum) errors.push(`${path}: minimum ${rule.minimum}`);
    if (rule.maximum != null && value > rule.maximum) errors.push(`${path}: maximum ${rule.maximum}`);
    if (rule.type === "array" && Array.isArray(value)) {
      if (rule.minItems != null && value.length < rule.minItems) errors.push(`${path}: minItems ${rule.minItems}`);
      if (rule.maxItems != null && value.length > rule.maxItems) errors.push(`${path}: maxItems ${rule.maxItems}`);
      if (rule.uniqueItems && new Set(value.map(canonical)).size !== value.length) {
        errors.push(`${path}: uniqueItems`);
      }
      if (rule.items) value.forEach((item, index) => validate(item, rule.items, `${path}[${index}]`));
    }
    if (rule.type === "object" && value && typeof value === "object" && !Array.isArray(value)) {
      for (const required of rule.required || []) {
        if (!(required in value)) errors.push(`${path}: required "${required}" missing`);
      }
      if (rule.additionalProperties === false) {
        for (const key of Object.keys(value)) {
          if (!rule.properties || !(key in rule.properties)) errors.push(`${path}: additional property "${key}"`);
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
        if (RAW_KEY_PATTERNS.some((pattern) => pattern.test(key))) {
          errors.push(`${path}.${key}: raw PII/protected/decision/secret field forbidden`);
        }
        scan(child, `${path}.${key}`);
      }
      return;
    }
    if (typeof value === "string") {
      if (EMAIL.test(value)) errors.push(`${path}: email-like value forbidden`);
      if (URL.test(value)) errors.push(`${path}: URL forbidden; opaque ref only`);
      if (IPV4.test(value)) errors.push(`${path}: IPv4 coordinate forbidden`);
      if (!UTC_TIMESTAMP.test(value) && IPV6.test(value)) errors.push(`${path}: IPv6 coordinate forbidden`);
    }
  }

  checkKeywords(schema, "$schema");
  validate(sample, schema, "$sample");
  scan(sample);

  if (!deepEqual(sample.hard_bans, HARD_BANS)) errors.push("root hard-bans drift");
  const capabilities = sample.capabilities || [];
  const kindSet = new Set(capabilities.map((capability) => capability.kind));
  const idSet = new Set(capabilities.map((capability) => capability.capability_id));
  for (const kind of CAPABILITY_KINDS) {
    if (!kindSet.has(kind)) errors.push(`missing capability kind ${kind}`);
  }
  if (kindSet.size !== CAPABILITY_KINDS.length) errors.push("capability kinds must be unique");
  if (idSet.size !== capabilities.length) errors.push("capability_id must be unique");

  const capabilityById = new Map(
    capabilities.map((capability) => [capability.capability_id, capability]),
  );

  for (const capability of capabilities) {
    const expected = EXPECTED[capability.kind];
    if (!expected) continue;
    if (capability.metric_protocol.metric_kind !== expected.metricKind) {
      errors.push(`${capability.kind}: metric_kind mismatch`);
    }
    const runtimeAgentic =
      capability.kind === "AGENTIC_PROPOSAL" && capability.lifecycle === "PROPOSAL_ONLY";
    const expectedPolicy = runtimeAgentic
      ? {
          ...expected.policy,
          output_mode: "CITATION_BACKED_PROPOSAL",
          individual_action_scope: "HUMAN_REVIEWED_PROPOSAL",
          citation_required: true,
        }
      : expected.policy;
    for (const [key, value] of Object.entries({ ...expectedPolicy, ...POLICY_BANS })) {
      if (!deepEqual(capability.policy[key], value)) {
        errors.push(`${capability.kind}: policy.${key} mismatch`);
      }
    }

    const gates = capability.gates || [];
    const gateKinds = new Set(gates.map((gate) => gate.kind));
    for (const kind of GATE_KINDS) if (!gateKinds.has(kind)) errors.push(`${capability.kind}: missing gate ${kind}`);
    if (gateKinds.size !== GATE_KINDS.length) errors.push(`${capability.kind}: gates must be unique`);
    const gateByKind = new Map(gates.map((gate) => [gate.kind, gate]));
    for (const gate of gates) {
      const hasReceipt = gate.evidence_ref && gate.verifier_ref && gate.verified_at;
      if (gate.status === "NOT_MET" && (gate.evidence_ref || gate.verifier_ref || gate.verified_at)) {
        errors.push(`${capability.kind}/${gate.kind}: NOT_MET cannot carry receipt`);
      }
      if (gate.status === "EVIDENCE_SUBMITTED") {
        if (!gate.evidence_ref || gate.verifier_ref || gate.verified_at) {
          errors.push(`${capability.kind}/${gate.kind}: submitted evidence requires ref but no verification claim`);
        }
      }
      if (["VERIFIED", "OWNER_ACCEPTED"].includes(gate.status) && !hasReceipt) {
        errors.push(`${capability.kind}/${gate.kind}: verified status requires receipt`);
      }
      if (gate.status === "OWNER_ACCEPTED" && gate.kind !== "OWNER") {
        errors.push(`${capability.kind}/${gate.kind}: only OWNER gate may be OWNER_ACCEPTED`);
      }
    }
    const evidenceVerified = gateByKind.get("EVIDENCE")?.status === "VERIFIED";
    const legalVerified = gateByKind.get("LEGAL")?.status === "VERIFIED";
    const auditVerified = gateByKind.get("INDEPENDENT_AUDIT")?.status === "VERIFIED";
    const ownerAccepted = gateByKind.get("OWNER")?.status === "OWNER_ACCEPTED";
    if (capability.evidence_verified !== evidenceVerified) errors.push(`${capability.kind}: evidence flag/gate mismatch`);
    if (capability.legal_review_verified !== legalVerified) errors.push(`${capability.kind}: legal flag/gate mismatch`);
    if (capability.independent_audit_verified !== auditVerified) errors.push(`${capability.kind}: audit flag/gate mismatch`);
    if (capability.owner_accepted !== ownerAccepted) errors.push(`${capability.kind}: owner flag/gate mismatch`);
    if (ownerAccepted && !(evidenceVerified && legalVerified && auditVerified)) {
      errors.push(`${capability.kind}: owner gate requires evidence/legal/audit verified`);
    }

    const metric = capability.metric_protocol;
    const hasMinimum = Number.isInteger(metric.minimum_sample_size);
    if (metric.minimum_sample_size_defined !== hasMinimum) {
      errors.push(`${capability.kind}: minimum sample definition mismatch`);
    }
    if (capability.kind === "FAIRNESS") {
      if (metric.protected_attribute_access !== "AUDIT_ONLY_AGGREGATED") {
        errors.push("FAIRNESS: protected attributes may be audit-only aggregated");
      }
    } else if (metric.protected_attribute_access !== "NONE") {
      errors.push(`${capability.kind}: protected attribute access forbidden`);
    }
    if (metric.state === "DESIGNED") {
      if (
        metric.observed_sample_size !== 0 ||
        metric.ground_truth_owner !== "UNASSIGNED" ||
        metric.uncertainty_method !== "NOT_DEFINED" ||
        metric.result
      ) {
        errors.push(`${capability.kind}: DESIGNED metric cannot claim measurement`);
      }
    }
    if (["MEASURED", "INDEPENDENTLY_REVIEWED", "OWNER_ACCEPTED"].includes(metric.state)) {
      if (
        !hasMinimum ||
        metric.observed_sample_size < metric.minimum_sample_size ||
        metric.ground_truth_owner === "UNASSIGNED" ||
        metric.uncertainty_method === "NOT_DEFINED" ||
        !metric.result
      ) {
        errors.push(`${capability.kind}: measured state lacks cohort/ground-truth/uncertainty/result`);
      }
    }
    if (metric.result) {
      const [expectedRole, expectedScreeningOnly] = EXPECTED_RESULT_ROLE[capability.kind] ?? [];
      const legacyResult = !("result_role" in metric.result);
      if (legacyResult) {
        if (metric.result.screening_indicator_only !== true) {
          errors.push(`${capability.kind}: legacy metric result requires screening_indicator_only=true`);
        }
      } else {
        if (metric.result.result_role !== expectedRole) {
          errors.push(`${capability.kind}: metric result_role mismatch`);
        }
        if (metric.result.screening_indicator_only !== expectedScreeningOnly) {
          errors.push(`${capability.kind}: metric screening_indicator_only mismatch`);
        }
      }
    }
    if (metric.state === "INDEPENDENTLY_REVIEWED" && !auditVerified) {
      errors.push(`${capability.kind}: independent metric state requires audit gate`);
    }
    if (metric.state === "OWNER_ACCEPTED" && !(ownerAccepted && auditVerified)) {
      errors.push(`${capability.kind}: owner metric state requires audit + owner gates`);
    }

    const allAccepted = evidenceVerified && legalVerified && auditVerified && ownerAccepted;
    const productionReady =
      sample.activation_gate === "GATED_RUNTIME" &&
      !capability.synthetic &&
      metric.state === "OWNER_ACCEPTED" &&
      allAccepted;
    if (
      capability.full_ats_accepted &&
      (!capability.full_ats_acceptance_ref || !allAccepted)
    ) {
      errors.push(`${capability.kind}: full-ATS acceptance requires receipt and accepted gates`);
    }
    if (!capability.full_ats_accepted && capability.full_ats_acceptance_ref) {
      errors.push(`${capability.kind}: full-ATS receipt forbidden without acceptance`);
    }
    if (capability.production_eligible !== productionReady) {
      errors.push(`${capability.kind}: production eligibility bypass/mismatch`);
    }
    if (capability.proposal_generation_allowed) {
      if (
        !PROPOSAL_KINDS.has(capability.kind) ||
        capability.lifecycle !== "PROPOSAL_ONLY" ||
        !productionReady ||
        ((capability.kind === "INTERNAL_MOBILITY" || capability.kind === "AGENTIC_PROPOSAL") &&
          !capability.full_ats_accepted)
      ) {
        errors.push(`${capability.kind}: proposal generation bypasses lifecycle/gates/full-ATS`);
      }
    }
    if (capability.human_action_allowed) {
      if (
        !HUMAN_ACTION_KINDS.has(capability.kind) ||
        !capability.proposal_generation_allowed ||
        !productionReady
      ) {
        errors.push(`${capability.kind}: human action bypasses governed proposal chain`);
      }
    }
    if (capability.kind === "AGENTIC_PROPOSAL" && capability.human_action_allowed) {
      errors.push("AGENTIC_PROPOSAL: action remains disallowed; proposal ceiling only");
    }
    if (productionReady) {
      const expectedLifecycle = PROPOSAL_KINDS.has(capability.kind)
        ? "PROPOSAL_ONLY"
        : "GOVERNED_ACTIVE";
      if (capability.lifecycle !== expectedLifecycle) {
        errors.push(`${capability.kind}: accepted runtime lifecycle mismatch`);
      }
    }
  }

  if ((sample.proposals || []).length > sample.max_pending_proposals) {
    errors.push("proposal count exceeds max_pending_proposals");
  }
  const proposalIds = new Set();
  for (const proposal of sample.proposals || []) {
    if (proposalIds.has(proposal.proposal_id)) errors.push(`duplicate proposal_id ${proposal.proposal_id}`);
    proposalIds.add(proposal.proposal_id);
    const capability = capabilityById.get(proposal.capability_id);
    if (!capability) {
      errors.push(`${proposal.proposal_id}: unknown capability_id`);
      continue;
    }
    const expectedAction = EXPECTED_ACTION[capability.kind];
    if (!expectedAction || proposal.action_type !== expectedAction) {
      errors.push(`${proposal.proposal_id}: action_type not allowed for ${capability.kind}`);
    }
    if (proposal.human_oversight_standard_ref !== sample.human_oversight_standard_ref) {
      errors.push(`${proposal.proposal_id}: human-oversight authority mismatch`);
    }
    const created = Date.parse(proposal.created_at);
    const expires = Date.parse(proposal.expires_at);
    const ttlHours = (expires - created) / 3_600_000;
    if (!Number.isFinite(ttlHours) || ttlHours <= 0 || ttlHours > sample.proposal_ttl_hours) {
      errors.push(`${proposal.proposal_id}: proposal TTL invalid`);
    }
    if (proposal.synthetic) {
      if (
        sample.activation_gate !== "PRE_G0_CONTRACT_ONLY" ||
        proposal.oversight_state !== "AI_SUGGESTED" ||
        proposal.action_allowed ||
        proposal.approval_receipt
      ) {
        errors.push(`${proposal.proposal_id}: synthetic preview must remain AI_SUGGESTED and closed`);
      }
    } else {
      if (!capability.proposal_generation_allowed) {
        errors.push(`${proposal.proposal_id}: runtime proposal without capability permission`);
      }
      if (ZERO_DIGEST.test(proposal.content_digest)) {
        errors.push(`${proposal.proposal_id}: runtime proposal cannot use synthetic zero digest`);
      }
    }
    if (capability.policy.citation_required && proposal.citation_refs.length === 0) {
      errors.push(`${proposal.proposal_id}: citation-backed capability requires citation`);
    }
    if (proposal.oversight_state === "AI_SUGGESTED") {
      if (proposal.action_allowed || proposal.approval_receipt) {
        errors.push(`${proposal.proposal_id}: AI_SUGGESTED cannot action/finalize`);
      }
    }
    const receipt = proposal.approval_receipt;
    const receiptRequired = ["FINALIZED", "EXPORTED"].includes(
      proposal.oversight_state,
    );
    if (receiptRequired && !receipt) {
      errors.push(`${proposal.proposal_id}: ${proposal.oversight_state} requires human receipt`);
    }
    if (proposal.oversight_state === "FINALIZED") {
      if (proposal.action_allowed !== capability.human_action_allowed) {
        errors.push(`${proposal.proposal_id}: action_allowed must match capability human-action gate`);
      }
    } else if (proposal.action_allowed) {
      errors.push(`${proposal.proposal_id}: only FINALIZED may carry action permission`);
    }
    if (
      receipt &&
      !["FINALIZED", "EXPORTED", "WITHDRAWN"].includes(proposal.oversight_state)
    ) {
      errors.push(`${proposal.proposal_id}: receipt not allowed in ${proposal.oversight_state}`);
    }
    if (receipt) {
      if (receipt.ai_output_version_ref !== proposal.ai_output_version_ref) {
        errors.push(`${proposal.proposal_id}: approval receipt AI version mismatch`);
      }
      const receiptEvidence = new Set(receipt.source_evidence_refs);
      for (const ref of proposal.source_evidence_refs) {
        if (!receiptEvidence.has(ref)) {
          errors.push(`${proposal.proposal_id}: approval receipt misses source evidence`);
        }
      }
    }
    if (
      (SCREENING_ONLY_KINDS.has(capability.kind) || capability.kind === "AGENTIC_PROPOSAL") &&
      proposal.action_allowed
    ) {
      errors.push(`${proposal.proposal_id}: screening/agentic output cannot become individual action`);
    }
  }

  if (sample.activation_gate === "PRE_G0_CONTRACT_ONLY") {
    for (const capability of capabilities) {
      const expected = EXPECTED[capability.kind];
      if (!capability.synthetic) errors.push(`${capability.kind}: pre-G0 capability must be synthetic`);
      if (capability.lifecycle !== expected?.lifecycle) errors.push(`${capability.kind}: pre-G0 lifecycle drift`);
      if (capability.metric_protocol.state !== "DESIGNED") errors.push(`${capability.kind}: pre-G0 metric must be DESIGNED`);
      if (capability.metric_protocol.cohort_origin !== "SYNTHETIC") errors.push(`${capability.kind}: pre-G0 cohort must be synthetic`);
      if (
        capability.evidence_verified ||
        capability.legal_review_verified ||
        capability.independent_audit_verified ||
        capability.owner_accepted ||
        capability.full_ats_accepted ||
        capability.proposal_generation_allowed ||
        capability.human_action_allowed ||
        capability.production_eligible
      ) {
        errors.push(`${capability.kind}: pre-G0 acceptance/action claim forbidden`);
      }
      for (const gate of capability.gates || []) {
        if (gate.status !== "NOT_MET" || gate.evidence_ref || gate.verifier_ref || gate.verified_at) {
          errors.push(`${capability.kind}/${gate.kind}: pre-G0 gate must be closed`);
        }
      }
    }
  }

  return errors;
}

function makeAcceptedRuntime() {
  const sample = clone(SAMPLE);
  sample.activation_gate = "GATED_RUNTIME";
  for (const capability of sample.capabilities) {
    const kindRef = capability.kind.toLowerCase().replaceAll("_", "-");
    capability.synthetic = false;
    capability.metric_protocol.state = "OWNER_ACCEPTED";
    capability.metric_protocol.cohort_origin = "AGGREGATED_RUNTIME";
    capability.metric_protocol.minimum_sample_size_defined = true;
    capability.metric_protocol.minimum_sample_size = 30;
    capability.metric_protocol.observed_sample_size = 100;
    capability.metric_protocol.ground_truth_owner = "SHARED_DOCUMENTED";
    capability.metric_protocol.uncertainty_method = "BOOTSTRAP_CI";
    capability.metric_protocol.result = {
      metric_result_ref: `metric-result:${kindRef}:v1`,
      confidence_interval_ref: `confidence-interval:${kindRef}:v1`,
      evidence_ref: `metric-evidence:${kindRef}:v1`,
      result_role: EXPECTED_RESULT_ROLE[capability.kind][0],
      screening_indicator_only: EXPECTED_RESULT_ROLE[capability.kind][1],
      verdict: "NONE",
    };
    capability.gates = capability.gates.map((gate) => ({
      ...gate,
      status: gate.kind === "OWNER" ? "OWNER_ACCEPTED" : "VERIFIED",
      evidence_ref: `gate-evidence:${kindRef}:${gate.kind.toLowerCase().replaceAll("_", "-")}`,
      verifier_ref: "verifier:synthetic:v1",
      verified_at: "1970-01-01T00:00:00Z",
    }));
    capability.evidence_verified = true;
    capability.legal_review_verified = true;
    capability.independent_audit_verified = true;
    capability.owner_accepted = true;
    capability.full_ats_accepted = true;
    capability.full_ats_acceptance_ref = `full-ats-acceptance:${kindRef}:v1`;
    capability.production_eligible = true;
    if (PROPOSAL_KINDS.has(capability.kind)) {
      capability.lifecycle = "PROPOSAL_ONLY";
      capability.proposal_generation_allowed = true;
      capability.human_action_allowed = HUMAN_ACTION_KINDS.has(capability.kind);
    } else {
      capability.lifecycle = "GOVERNED_ACTIVE";
    }
    if (capability.kind === "AGENTIC_PROPOSAL") {
      capability.policy.output_mode = "CITATION_BACKED_PROPOSAL";
      capability.policy.individual_action_scope = "HUMAN_REVIEWED_PROPOSAL";
      capability.policy.citation_required = true;
      capability.human_action_allowed = false;
    }
  }

  const coaching = sample.capabilities.find((capability) => capability.kind === "COACHING");
  const agentic = sample.capabilities.find((capability) => capability.kind === "AGENTIC_PROPOSAL");
  sample.proposals = [
    {
      proposal_id: "proposal:coaching:runtime",
      capability_id: coaching.capability_id,
      synthetic: false,
      scope_ref: "scope:interview:runtime",
      action_type: "COACHING_DRAFT",
      oversight_state: "FINALIZED",
      human_oversight_standard_ref: sample.human_oversight_standard_ref,
      source_evidence_refs: ["evidence:coaching:runtime"],
      citation_refs: ["citation:coaching:runtime"],
      ai_output_version_ref: "ai-output:coaching:runtime",
      content_digest: `sha256:${"1".repeat(64)}`,
      created_at: "1970-01-01T00:00:00Z",
      expires_at: "1970-01-02T00:00:00Z",
      human_review_required: true,
      human_rationale_required: true,
      auto_execute: false,
      batch_approval: false,
      mutation_allowed: false,
      action_allowed: true,
      appeal_path_ref: "appeal:coaching:runtime",
      rollback_plan_ref: "rollback:coaching:runtime",
      approval_receipt: {
        human_actor_ref: "human:reviewer:runtime",
        oversight_role_ref: "oversight:reviewer:runtime",
        human_authored_rationale_ref: "rationale:coaching:runtime",
        source_evidence_refs: ["evidence:coaching:runtime"],
        ai_output_version_ref: "ai-output:coaching:runtime",
        decision_outcome_ref: "outcome:coaching:runtime",
        audit_receipt_ref: "audit:coaching:runtime",
        finalized_at: "1970-01-01T01:00:00Z",
      },
    },
    {
      proposal_id: "proposal:agentic:runtime",
      capability_id: agentic.capability_id,
      synthetic: false,
      scope_ref: "scope:proposal:runtime",
      action_type: "NO_ACTION",
      oversight_state: "AI_SUGGESTED",
      human_oversight_standard_ref: sample.human_oversight_standard_ref,
      source_evidence_refs: ["evidence:agentic:runtime"],
      citation_refs: ["citation:agentic:runtime"],
      ai_output_version_ref: "ai-output:agentic:runtime",
      content_digest: `sha256:${"2".repeat(64)}`,
      created_at: "1970-01-01T00:00:00Z",
      expires_at: "1970-01-02T00:00:00Z",
      human_review_required: true,
      human_rationale_required: true,
      auto_execute: false,
      batch_approval: false,
      mutation_allowed: false,
      action_allowed: false,
      appeal_path_ref: "appeal:agentic:runtime",
      rollback_plan_ref: "rollback:agentic:runtime",
    },
  ];
  return sample;
}

function selfTest() {
  const cases = [
    ["bad-schema-version", (sample) => (sample.schema_version = "intelligence-evaluation/v2")],
    ["wrong-oversight-authority", (sample) => (sample.human_oversight_standard_ref = "other:state-machine:v1")],
    ["scoring-enabled", (sample) => (sample.hard_bans.numeric_scoring = "ALLOWED")],
    ["ranking-enabled", (sample) => (sample.hard_bans.ranking = "ALLOWED")],
    ["auto-decision-enabled", (sample) => (sample.hard_bans.automated_employment_decision = "ALLOWED")],
    ["affect-enabled", (sample) => (sample.hard_bans.affect_emotion_inference = "ALLOWED")],
    ["personality-enabled", (sample) => (sample.hard_bans.personality_inference = "ALLOWED")],
    ["deception-enabled", (sample) => (sample.hard_bans.deception_inference = "ALLOWED")],
    ["protected-optimization", (sample) => (sample.hard_bans.protected_attribute_optimization = "ALLOWED")],
    ["provenance-adverse-action", (sample) => (sample.hard_bans.provenance_sole_adverse_action = "ALLOWED")],
    ["autonomous-mutation", (sample) => (sample.hard_bans.autonomous_mutation = "ALLOWED")],
    ["batch-approval", (sample) => (sample.hard_bans.batch_approval = "ALLOWED")],
    ["missing-capability", (sample) => sample.capabilities.pop()],
    ["duplicate-capability-kind", (sample) => (sample.capabilities[1].kind = "QOH")],
    ["duplicate-capability-id", (sample) => (sample.capabilities[1].capability_id = sample.capabilities[0].capability_id)],
    ["fairness-output-drift", (sample) => (sample.capabilities[1].policy.output_mode = "AGGREGATE_EVIDENCE")],
    ["fairness-verdict-role", (sample) => (sample.capabilities[1].policy.four_fifths_indicator_role = "NOT_APPLICABLE")],
    ["deepfake-sole-action", (sample) => (sample.capabilities[4].policy.provenance_sole_adverse_action = "ALLOWED")],
    ["coaching-no-citation-policy", (sample) => (sample.capabilities[2].policy.citation_required = false)],
    ["skills-no-provenance", (sample) => (sample.capabilities[3].policy.ontology_provenance_required = false)],
    ["minimum-lone", (sample) => (sample.capabilities[0].metric_protocol.minimum_sample_size = 30)],
    ["designed-observed", (sample) => (sample.capabilities[0].metric_protocol.observed_sample_size = 1)],
    ["designed-ground-truth", (sample) => (sample.capabilities[0].metric_protocol.ground_truth_owner = "CUSTOMER_HUMAN")],
    ["designed-uncertainty", (sample) => (sample.capabilities[0].metric_protocol.uncertainty_method = "BOOTSTRAP_CI")],
    ["designed-result", (sample) => {
      sample.capabilities[0].metric_protocol.result = {
        metric_result_ref: "metric-result:qoh:v1",
        confidence_interval_ref: "confidence:qoh:v1",
        evidence_ref: "evidence:qoh:v1",
        result_role: "DESCRIPTIVE_ASSOCIATION",
        screening_indicator_only: false,
        verdict: "NONE",
      };
    }],
    ["raw-pii-flag", (sample) => (sample.capabilities[0].metric_protocol.contains_raw_pii = true)],
    ["raw-protected-flag", (sample) => (sample.capabilities[1].metric_protocol.contains_raw_protected_attributes = true)],
    ["fairness-protected-access-missing", (sample) => (sample.capabilities[1].metric_protocol.protected_attribute_access = "NONE")],
    ["nonfair-protected-access", (sample) => (sample.capabilities[0].metric_protocol.protected_attribute_access = "AUDIT_ONLY_AGGREGATED")],
    ["missing-confounder", (sample) => (sample.capabilities[0].metric_protocol.confounder_plan_refs = [])],
    ["missing-gate", (sample) => sample.capabilities[0].gates.pop()],
    ["duplicate-gate", (sample) => (sample.capabilities[0].gates[1].kind = "EVIDENCE")],
    ["submitted-gate-without-ref", (sample) => (sample.capabilities[0].gates[0].status = "EVIDENCE_SUBMITTED")],
    ["pre-g0-evidence-claim", (sample) => (sample.capabilities[0].evidence_verified = true)],
    ["pre-g0-owner-claim", (sample) => (sample.capabilities[0].owner_accepted = true)],
    ["pre-g0-full-ats-claim", (sample) => (sample.capabilities[5].full_ats_accepted = true)],
    ["pre-g0-full-ats-receipt", (sample) => (sample.capabilities[5].full_ats_acceptance_ref = "full-ats-acceptance:synthetic:v1")],
    ["pre-g0-proposal-permission", (sample) => (sample.capabilities[2].proposal_generation_allowed = true)],
    ["pre-g0-human-action", (sample) => (sample.capabilities[2].human_action_allowed = true)],
    ["proposal-auto-execute", (sample) => (sample.proposals[0].auto_execute = true)],
    ["proposal-batch-approve", (sample) => (sample.proposals[0].batch_approval = true)],
    ["proposal-mutation", (sample) => (sample.proposals[0].mutation_allowed = true)],
    ["ai-suggested-action", (sample) => (sample.proposals[0].action_allowed = true)],
    ["synthetic-approval-receipt", (sample) => (sample.proposals[0].approval_receipt = {
      human_actor_ref: "human:synthetic:v1",
      oversight_role_ref: "role:synthetic:v1",
      human_authored_rationale_ref: "rationale:synthetic:v1",
      source_evidence_refs: ["evidence:coaching:synthetic"],
      ai_output_version_ref: "ai-output:coaching:synthetic",
      decision_outcome_ref: "outcome:synthetic:v1",
      audit_receipt_ref: "audit:synthetic:v1",
      finalized_at: "1970-01-01T01:00:00Z",
    })],
    ["proposal-ttl-too-long", (sample) => (sample.proposals[0].expires_at = "1970-01-09T00:00:00Z")],
    ["proposal-dynamic-cap", (sample) => {
      sample.max_pending_proposals = 1;
      sample.proposals.push({ ...clone(sample.proposals[0]), proposal_id: "proposal:coaching:second" });
    }],
    ["proposal-unknown-capability", (sample) => (sample.proposals[0].capability_id = "capability:missing:v1")],
    ["proposal-action-mismatch", (sample) => (sample.proposals[0].action_type = "SKILL_SUGGESTION")],
    ["coaching-citation-missing", (sample) => (sample.proposals[0].citation_refs = [])],
    ["raw-candidate-key", (sample) => (sample.proposals[0].candidate_id = "synthetic")],
    ["email-value", (sample) => (sample.proposals[0].scope_ref = "person@example.com")],
    ["ip-value", (sample) => (sample.proposals[0].scope_ref = "10.0.0.1")],
    ["unsupported-schema-keyword", (_sample, schema) => (schema.properties.capabilities.oneOf = [])],
    ["runtime-gate-lowered", (sample) => {
      const capability = sample.capabilities[0];
      capability.gates.find((gate) => gate.kind === "EVIDENCE").status = "NOT_MET";
      capability.evidence_verified = false;
    }, "runtime"],
    ["runtime-owner-before-audit", (sample) => {
      const capability = sample.capabilities[0];
      capability.gates.find((gate) => gate.kind === "INDEPENDENT_AUDIT").status = "NOT_MET";
      capability.independent_audit_verified = false;
    }, "runtime"],
    ["runtime-result-missing", (sample) => delete sample.capabilities[0].metric_protocol.result, "runtime"],
    ["runtime-qoh-screening-role", (sample) => {
      sample.capabilities[0].metric_protocol.result.result_role = "SCREENING_INDICATOR";
      sample.capabilities[0].metric_protocol.result.screening_indicator_only = true;
    }, "runtime"],
    ["runtime-fairness-descriptive-role", (sample) => {
      sample.capabilities[1].metric_protocol.result.result_role = "DESCRIPTIVE_ASSOCIATION";
      sample.capabilities[1].metric_protocol.result.screening_indicator_only = false;
    }, "runtime"],
    ["runtime-invalid-legacy-screening", (sample) => {
      delete sample.capabilities[0].metric_protocol.result.result_role;
      sample.capabilities[0].metric_protocol.result.screening_indicator_only = false;
    }, "runtime"],
    ["runtime-below-minimum", (sample) => (sample.capabilities[0].metric_protocol.observed_sample_size = 29), "runtime"],
    ["runtime-internal-full-ats-missing", (sample) => (sample.capabilities[5].full_ats_accepted = false), "runtime"],
    ["runtime-full-ats-receipt-missing", (sample) => delete sample.capabilities[5].full_ats_acceptance_ref, "runtime"],
    ["runtime-agentic-human-action", (sample) => (sample.capabilities[6].human_action_allowed = true), "runtime"],
    ["runtime-zero-digest", (sample) => (sample.proposals[0].content_digest = `sha256:${"0".repeat(64)}`), "runtime"],
    ["runtime-finalized-receipt-missing", (sample) => delete sample.proposals[0].approval_receipt, "runtime"],
    ["runtime-exported-receipt-missing", (sample) => {
      sample.proposals[0].oversight_state = "EXPORTED";
      sample.proposals[0].action_allowed = false;
      delete sample.proposals[0].approval_receipt;
    }, "runtime"],
    ["runtime-receipt-ai-version-mismatch", (sample) => (sample.proposals[0].approval_receipt.ai_output_version_ref = "ai-output:other:v1"), "runtime"],
    ["runtime-receipt-evidence-missing", (sample) => (sample.proposals[0].approval_receipt.source_evidence_refs = ["evidence:other:v1"]), "runtime"],
    ["runtime-agentic-action", (sample) => (sample.proposals[1].action_allowed = true), "runtime"],
  ];

  const escaped = [];
  const positiveRuntimeErrors = runChecks(SCHEMA, makeAcceptedRuntime());
  const legacyRuntime = makeAcceptedRuntime();
  delete legacyRuntime.capabilities[0].metric_protocol.result.result_role;
  legacyRuntime.capabilities[0].metric_protocol.result.screening_indicator_only = true;
  const positiveLegacyRuntimeErrors = runChecks(SCHEMA, legacyRuntime);
  for (const [name, mutate, fixture = "pre-g0"] of cases) {
    const sample = fixture === "runtime" ? makeAcceptedRuntime() : clone(SAMPLE);
    const schema = clone(SCHEMA);
    mutate(sample, schema);
    if (runChecks(schema, sample).length === 0) escaped.push(name);
  }
  return {
    escaped,
    total: cases.length,
    positiveRuntimeErrors,
    positiveLegacyRuntimeErrors,
  };
}

const errors = runChecks(SCHEMA, SAMPLE);
const selfTestResult = selfTest();
for (const name of selfTestResult.escaped) errors.push(`SELF-TEST escaped: ${name}`);
for (const error of selfTestResult.positiveRuntimeErrors) {
  errors.push(`RUNTIME POSITIVE fixture rejected: ${error}`);
}
for (const error of selfTestResult.positiveLegacyRuntimeErrors) {
  errors.push(`LEGACY RUNTIME POSITIVE fixture rejected: ${error}`);
}

if (errors.length > 0) {
  console.error("intelligence-evaluation/v1 guard FAILED:");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(
  `intelligence-evaluation/v1 OK — ${SAMPLE.capabilities.length} governed capabilities, ${SAMPLE.proposals.length} synthetic proposal preview, ${selfTestResult.total} negative vectors fail-closed; canonical and controlled-legacy gated-runtime fixtures accepted; no live cohort/action claimed`,
);
