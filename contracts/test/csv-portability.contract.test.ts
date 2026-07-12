import { describe, expect, it } from "vitest";
import {
  CSV_MAPPING_SCHEMA_VERSION,
  CSV_PORTABILITY_SCHEMA_VERSION,
  CsvPortabilityEngine,
  InMemoryCsvPortabilityStore,
  type CsvPortabilityRequestV1,
} from "../portability/csv-portability.js";

function request(overrides: Partial<CsvPortabilityRequestV1> = {}): CsvPortabilityRequestV1 {
  return {
    schemaVersion: CSV_PORTABILITY_SCHEMA_VERSION,
    synthetic: true,
    tenantRef: "tenant.synthetic",
    connectorId: "open-portability-v1",
    idempotencyKey: "tenant.synthetic:csv-import:001",
    humanApprovalRef: "approval.synthetic.csv.001",
    mapping: {
      schemaVersion: CSV_MAPPING_SCHEMA_VERSION,
      profileRef: "mapping.synthetic.v1",
      mappings: [
        { sourceHeader: "external_candidate_ref", targetField: "opaque_candidate_ref" },
        { sourceHeader: "external_interview_ref", targetField: "interview_ref" },
        { sourceHeader: "source_evidence_ref", targetField: "evidence_packet_ref" },
      ],
    },
    csvText:
      "external_candidate_ref,external_interview_ref,source_evidence_ref\r\n" +
      "candidate.synthetic.001,interview.synthetic.001,evidence.synthetic.001\r\n" +
      "candidate.synthetic.002,interview.synthetic.002,evidence.synthetic.002\r\n",
    ...overrides,
  };
}

describe("P4 CSV portability conformance", () => {
  it("dry-run, atomic apply, replay and opaque-only export are deterministic", () => {
    const engine = new CsvPortabilityEngine(new InMemoryCsvPortabilityStore());
    const first = engine.dryRun(request());
    expect(first.status).toBe("READY");
    expect(first.counts).toEqual({ inputRows: 2, ready: 2, duplicate: 0, conflict: 0, rejected: 0 });

    const created = engine.apply(request());
    expect(created).toMatchObject({ disposition: "CREATED", appliedRows: 2, duplicateRows: 0 });
    expect(engine.apply(request())).toMatchObject({ disposition: "REPLAYED", appliedRows: 2 });

    const exported = engine.exportTenant("tenant.synthetic");
    expect(exported.recordCount).toBe(2);
    expect(exported.csvText).toContain("candidate.synthetic.001");
    expect(exported.csvText).not.toMatch(/@|phone|score|decision|stage|status/i);
    expect(exported.payloadDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it.each(["\r\n", "\n"])(
    "RFC 4180 quoted field containing %j parses before opaque-ref validation",
    (lineBreak) => {
    const engine = new CsvPortabilityEngine(new InMemoryCsvPortabilityStore());
    const quoted = request({
      csvText:
        'external_candidate_ref,external_interview_ref,source_evidence_ref\r\n' +
        `"candidate.synthetic.001","interview.synthetic.001","evidence.synthetic.${lineBreak}001"\r\n`,
    });
    expect(engine.dryRun(quoted)).toMatchObject({
      status: "BLOCKED",
      counts: { rejected: 1 },
      rows: [{ disposition: "REJECTED", reasonCode: "INVALID_OPAQUE_REF" }],
    });
  });

  it("trailing blank rows do not change dry-run/apply row identity", () => {
    const engine = new CsvPortabilityEngine(new InMemoryCsvPortabilityStore());
    const withBlankRows = request({ csvText: `${request().csvText}\r\n\r\n` });
    expect(engine.dryRun(withBlankRows).counts.inputRows).toBe(2);
    expect(engine.apply(withBlankRows)).toMatchObject({ disposition: "CREATED", appliedRows: 2 });
  });

  it("same entity and digest is duplicate; different digest is conflict and blocks apply", () => {
    const engine = new CsvPortabilityEngine(new InMemoryCsvPortabilityStore());
    const duplicate = request({
      csvText:
        "external_candidate_ref,external_interview_ref,source_evidence_ref\n" +
        "candidate.synthetic.001,interview.synthetic.001,evidence.synthetic.001\n" +
        "candidate.synthetic.001,interview.synthetic.001,evidence.synthetic.001\n",
    });
    expect(engine.dryRun(duplicate).counts.duplicate).toBe(1);
    expect(engine.apply(duplicate).appliedRows).toBe(1);

    const conflict = request({
      idempotencyKey: "tenant.synthetic:csv-import:002",
      csvText:
        "external_candidate_ref,external_interview_ref,source_evidence_ref\n" +
        "candidate.synthetic.009,interview.synthetic.001,evidence.synthetic.001\n" +
        "candidate.synthetic.009,interview.synthetic.999,evidence.synthetic.001\n",
    });
    expect(engine.dryRun(conflict)).toMatchObject({ status: "BLOCKED", counts: { conflict: 1 } });
    expect(() => engine.apply(conflict)).toThrow("RECONCILIATION_BLOCKED");
    expect(engine.exportTenant("tenant.synthetic").recordCount).toBe(1);
  });

  it("tenant scope isolates records and idempotency receipts", () => {
    const store = new InMemoryCsvPortabilityStore();
    const engine = new CsvPortabilityEngine(store);
    engine.apply(request());
    const other = request({
      tenantRef: "tenant.other",
      idempotencyKey: "tenant.other:csv-import:001",
      humanApprovalRef: "approval.other.csv.001",
    });
    expect(engine.dryRun(other).counts.ready).toBe(2);
    engine.apply(other);
    expect(engine.exportTenant("tenant.synthetic").recordCount).toBe(2);
    expect(engine.exportTenant("tenant.other").recordCount).toBe(2);
  });

  it.each([
    ["non-synthetic", () => request({ synthetic: false as true }), "SYNTHETIC_ONLY"],
    ["wrong connector", () => request({ connectorId: "generic-ats-v1" as "open-portability-v1" }), "CONNECTOR_NOT_ALLOWED"],
    ["global idempotency", () => request({ idempotencyKey: "global:001" }), "IDEMPOTENCY_NOT_TENANT_SCOPED"],
    ["no approval", () => {
      const value = request();
      delete (value as { humanApprovalRef?: string }).humanApprovalRef;
      return value;
    }, "HUMAN_APPROVAL_REQUIRED"],
    ["wrong approval namespace", () => request({ humanApprovalRef: "candidate.synthetic.001" }), "HUMAN_APPROVAL_REQUIRED"],
    ["raw email header", () => request({ csvText: "candidate_email,external_interview_ref,source_evidence_ref\na@example.invalid,interview.synthetic.1,evidence.synthetic.1\n" }), "CSV_HEADER_FORBIDDEN"],
    ["unmapped column", () => request({ csvText: "external_candidate_ref,external_interview_ref,source_evidence_ref,extra\ncandidate.synthetic.1,interview.synthetic.1,evidence.synthetic.1,audit.synthetic.1\n" }), "CSV_UNMAPPED_HEADER"],
    ["raw email value", () => request({ csvText: "external_candidate_ref,external_interview_ref,source_evidence_ref\nsomeone@example.invalid,interview.synthetic.1,evidence.synthetic.1\n" }), "RECONCILIATION_BLOCKED"],
    ["decision target", () => request({ mapping: { ...request().mapping, mappings: [{ sourceHeader: "external_candidate_ref", targetField: "decision" as never }] } }), "TARGET_FIELD_FORBIDDEN"],
    ["missing candidate mapping", () => request({ mapping: { ...request().mapping, mappings: [{ sourceHeader: "external_interview_ref", targetField: "interview_ref" }] } }), "CANDIDATE_REF_MAPPING_REQUIRED"],
    ["duplicate target", () => request({ mapping: { ...request().mapping, mappings: [{ sourceHeader: "candidate_a", targetField: "opaque_candidate_ref" }, { sourceHeader: "candidate_b", targetField: "opaque_candidate_ref" }] } }), "TARGET_FIELD_DUPLICATE"],
    ["duplicate header", () => request({ csvText: "external_candidate_ref,external_candidate_ref,source_evidence_ref\ncandidate.synthetic.1,candidate.synthetic.1,evidence.synthetic.1\n" }), "CSV_HEADER_DUPLICATE"],
    ["unclosed quote", () => request({ csvText: 'external_candidate_ref,external_interview_ref,source_evidence_ref\n"candidate.synthetic.1,interview.synthetic.1,evidence.synthetic.1\n' }), "CSV_UNCLOSED_QUOTE"],
    ["row width", () => request({ csvText: "external_candidate_ref,external_interview_ref,source_evidence_ref\ncandidate.synthetic.1,interview.synthetic.1\n" }), "CSV_ROW_WIDTH_MISMATCH:2"],
  ])("fails closed: %s", (_name, makeRequest, code) => {
    const engine = new CsvPortabilityEngine(new InMemoryCsvPortabilityStore());
    expect(() => engine.apply(makeRequest())).toThrow(code);
  });

  it("same tenant idempotency key with a different request digest is rejected", () => {
    const engine = new CsvPortabilityEngine(new InMemoryCsvPortabilityStore());
    engine.apply(request());
    const changed = request({
      csvText:
        "external_candidate_ref,external_interview_ref,source_evidence_ref\n" +
        "candidate.synthetic.099,interview.synthetic.099,evidence.synthetic.099\n",
    });
    expect(() => engine.apply(changed)).toThrow("IDEMPOTENCY_DIGEST_CONFLICT");
  });

  it("existing record with different digest blocks a later idempotency key", () => {
    const engine = new CsvPortabilityEngine(new InMemoryCsvPortabilityStore());
    engine.apply(request());
    const changed = request({
      idempotencyKey: "tenant.synthetic:csv-import:later",
      csvText:
        "external_candidate_ref,external_interview_ref,source_evidence_ref\n" +
        "candidate.synthetic.001,interview.synthetic.changed,evidence.synthetic.001\n",
    });
    expect(engine.dryRun(changed)).toMatchObject({ status: "BLOCKED", counts: { conflict: 1 } });
    expect(() => engine.apply(changed)).toThrow("RECONCILIATION_BLOCKED");
  });

  it.each(["candidate_name", "candidate_status", "candidate_stage", "candidate_score", "candidate_decision", "candidate_resume"])(
    "forbidden source header fails closed: %s",
    (header) => {
      const engine = new CsvPortabilityEngine(new InMemoryCsvPortabilityStore());
      const bad = request({
        mapping: {
          ...request().mapping,
          mappings: [
            { sourceHeader: header, targetField: "opaque_candidate_ref" },
            ...request().mapping.mappings.slice(1),
          ],
        },
        csvText: `${header},external_interview_ref,source_evidence_ref\nvalue,interview.synthetic.1,evidence.synthetic.1\n`,
      });
      expect(() => engine.dryRun(bad)).toThrow("SOURCE_HEADER_FORBIDDEN");
    },
  );

  it("accepts a 160-character opaque ref and rejects 161 characters", () => {
    const engine = new CsvPortabilityEngine(new InMemoryCsvPortabilityStore());
    const ref160 = `candidate.${"a".repeat(150)}`;
    const ref161 = `candidate.${"a".repeat(151)}`;
    expect(ref160).toHaveLength(160);
    expect(engine.dryRun(request({
      csvText: `external_candidate_ref,external_interview_ref,source_evidence_ref\n${ref160},interview.synthetic.1,evidence.synthetic.1\n`,
    })).status).toBe("READY");
    expect(engine.dryRun(request({
      csvText: `external_candidate_ref,external_interview_ref,source_evidence_ref\n${ref161},interview.synthetic.1,evidence.synthetic.1\n`,
    }))).toMatchObject({ status: "BLOCKED", counts: { rejected: 1 } });
  });

  it("export header order and import-export-import round trip remain deterministic", () => {
    const first = new CsvPortabilityEngine(new InMemoryCsvPortabilityStore());
    first.apply(request());
    const exported = first.exportTenant("tenant.synthetic");
    expect(exported.csvText.split("\r\n")[0]).toBe(
      "opaque_candidate_ref,interview_ref,role_ref,evidence_packet_ref,audit_link",
    );

    const second = new CsvPortabilityEngine(new InMemoryCsvPortabilityStore());
    const roundTrip = request({
      tenantRef: "tenant.roundtrip",
      idempotencyKey: "tenant.roundtrip:csv-import:001",
      humanApprovalRef: "approval.roundtrip.csv.001",
      mapping: {
        schemaVersion: CSV_MAPPING_SCHEMA_VERSION,
        profileRef: "mapping.roundtrip.v1",
        mappings: [
          { sourceHeader: "opaque_candidate_ref", targetField: "opaque_candidate_ref" },
          { sourceHeader: "interview_ref", targetField: "interview_ref" },
          { sourceHeader: "role_ref", targetField: "role_ref" },
          { sourceHeader: "evidence_packet_ref", targetField: "evidence_packet_ref" },
          { sourceHeader: "audit_link", targetField: "audit_link" },
        ],
      },
      csvText: exported.csvText,
    });
    expect(second.apply(roundTrip).appliedRows).toBe(2);
    expect(second.exportTenant("tenant.roundtrip").csvText).toBe(exported.csvText);
  });

  it("strips UTF-8 BOM from the first header", () => {
    const engine = new CsvPortabilityEngine(new InMemoryCsvPortabilityStore());
    expect(engine.dryRun(request({ csvText: `\uFEFF${request().csvText}` })).status).toBe("READY");
  });

  it("fails closed above the row and byte limits", () => {
    const engine = new CsvPortabilityEngine(new InMemoryCsvPortabilityStore());
    const header = "external_candidate_ref,external_interview_ref,source_evidence_ref\n";
    const rows = Array.from(
      { length: 10_001 },
      (_, index) => `candidate.synthetic.${index},interview.synthetic.${index},evidence.synthetic.${index}`,
    ).join("\n");
    expect(() => engine.dryRun(request({ csvText: `${header}${rows}\n` }))).toThrow("CSV_TOO_MANY_ROWS");
    expect(() => engine.dryRun(request({ csvText: `${header}${"a".repeat(1_000_001)}` }))).toThrow("CSV_TOO_LARGE");
  });
});
