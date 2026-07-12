import { createHash } from "node:crypto";

export const CSV_PORTABILITY_SCHEMA_VERSION = "csv-portability/v1" as const;
export const CSV_MAPPING_SCHEMA_VERSION = "csv-mapping/v1" as const;

export type CsvTargetField =
  | "opaque_candidate_ref"
  | "interview_ref"
  | "role_ref"
  | "evidence_packet_ref"
  | "audit_link";

export interface CsvFieldMappingV1 {
  readonly sourceHeader: string;
  readonly targetField: CsvTargetField;
}

export interface CsvMappingProfileV1 {
  readonly schemaVersion: typeof CSV_MAPPING_SCHEMA_VERSION;
  readonly profileRef: string;
  readonly mappings: readonly CsvFieldMappingV1[];
}

export interface CsvPortabilityRequestV1 {
  readonly schemaVersion: typeof CSV_PORTABILITY_SCHEMA_VERSION;
  readonly synthetic: true;
  readonly tenantRef: string;
  readonly connectorId: "open-portability-v1";
  readonly idempotencyKey: string;
  readonly mapping: CsvMappingProfileV1;
  readonly csvText: string;
  readonly humanApprovalRef?: string;
}

export type CsvRowDisposition =
  | "NEW"
  | "DUPLICATE"
  | "CONFLICT"
  | "REJECTED";

export type CsvReasonCode =
  | "READY"
  | "DUPLICATE_SAME_DIGEST"
  | "EXISTING_RECORD_SAME_DIGEST"
  | "DUPLICATE_DIFFERENT_DIGEST"
  | "EXISTING_RECORD_DIFFERENT_DIGEST"
  | "MISSING_REQUIRED_REF"
  | "INVALID_OPAQUE_REF";

export interface CsvRowOutcomeV1 {
  readonly rowNumber: number;
  readonly entityRef?: string;
  readonly disposition: CsvRowDisposition;
  readonly reasonCode: CsvReasonCode;
  readonly rowDigest?: `sha256:${string}`;
}

export interface CsvReconciliationCountsV1 {
  readonly inputRows: number;
  readonly ready: number;
  readonly duplicate: number;
  readonly conflict: number;
  readonly rejected: number;
}

export interface CsvDryRunReceiptV1 {
  readonly schemaVersion: typeof CSV_PORTABILITY_SCHEMA_VERSION;
  readonly synthetic: true;
  readonly mode: "DRY_RUN";
  readonly status: "READY" | "BLOCKED";
  readonly tenantRef: string;
  readonly connectorId: "open-portability-v1";
  readonly idempotencyKey: string;
  readonly inputDigest: `sha256:${string}`;
  readonly mappingDigest: `sha256:${string}`;
  readonly requestDigest: `sha256:${string}`;
  readonly counts: CsvReconciliationCountsV1;
  readonly rows: readonly CsvRowOutcomeV1[];
}

export interface CsvApplyReceiptV1 {
  readonly schemaVersion: typeof CSV_PORTABILITY_SCHEMA_VERSION;
  readonly synthetic: true;
  readonly mode: "APPLY";
  readonly disposition: "CREATED" | "REPLAYED";
  readonly tenantRef: string;
  readonly connectorId: "open-portability-v1";
  readonly idempotencyKey: string;
  readonly requestDigest: `sha256:${string}`;
  readonly reconciliationDigest: `sha256:${string}`;
  readonly appliedRows: number;
  readonly duplicateRows: number;
  readonly humanApprovalRef: string;
}

export interface CsvExportReceiptV1 {
  readonly schemaVersion: typeof CSV_PORTABILITY_SCHEMA_VERSION;
  readonly synthetic: true;
  readonly mode: "EXPORT";
  readonly tenantRef: string;
  readonly recordCount: number;
  readonly csvText: string;
  readonly payloadDigest: `sha256:${string}`;
}

type CanonicalRecord = Readonly<Partial<Record<CsvTargetField, string>>> & {
  readonly opaque_candidate_ref: string;
};

interface StoredRecord {
  readonly digest: `sha256:${string}`;
  readonly record: CanonicalRecord;
}

interface StoredApply {
  readonly requestDigest: `sha256:${string}`;
  readonly receipt: CsvApplyReceiptV1;
}

export interface CsvPortabilityStore {
  getRecord(tenantRef: string, entityRef: string): StoredRecord | undefined;
  listRecords(tenantRef: string): readonly StoredRecord[];
  getApply(tenantRef: string, idempotencyKey: string): StoredApply | undefined;
  /** Persistence adapters must commit records and the apply receipt atomically. */
  commit(
    tenantRef: string,
    records: readonly { readonly entityRef: string; readonly stored: StoredRecord }[],
    idempotencyKey: string,
    apply: StoredApply,
  ): void;
}

/**
 * Deterministic PRE-G0 store for contract and failure testing only. It is not a
 * persistence or production connector claim.
 */
export class InMemoryCsvPortabilityStore implements CsvPortabilityStore {
  private records = new Map<string, StoredRecord>();
  private applies = new Map<string, StoredApply>();

  getRecord(tenantRef: string, entityRef: string): StoredRecord | undefined {
    return this.records.get(`${tenantRef}\u0000${entityRef}`);
  }

  listRecords(tenantRef: string): readonly StoredRecord[] {
    const prefix = `${tenantRef}\u0000`;
    return [...this.records.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, value]) => value);
  }

  getApply(tenantRef: string, idempotencyKey: string): StoredApply | undefined {
    return this.applies.get(`${tenantRef}\u0000${idempotencyKey}`);
  }

  commit(
    tenantRef: string,
    records: readonly { readonly entityRef: string; readonly stored: StoredRecord }[],
    idempotencyKey: string,
    apply: StoredApply,
  ): void {
    const nextRecords = new Map(this.records);
    const nextApplies = new Map(this.applies);
    for (const item of records) {
      nextRecords.set(`${tenantRef}\u0000${item.entityRef}`, item.stored);
    }
    nextApplies.set(`${tenantRef}\u0000${idempotencyKey}`, apply);
    this.records = nextRecords;
    this.applies = nextApplies;
  }
}

const TARGET_FIELDS: readonly CsvTargetField[] = [
  "opaque_candidate_ref",
  "interview_ref",
  "role_ref",
  "evidence_packet_ref",
  "audit_link",
];

const EXPECTED_REF_PREFIX: Readonly<Record<CsvTargetField, string>> = {
  opaque_candidate_ref: "candidate.",
  interview_ref: "interview.",
  role_ref: "role.",
  evidence_packet_ref: "evidence.",
  audit_link: "audit.",
};

const FORBIDDEN_HEADER =
  /(^|[_\s-])(name|full.?name|email|phone|telephone|mobile|address|birth|age|gender|religion|ethnic|health|union|politic|pregnan|cv|resume|decision|status|stage|score|rank|affect|emotion|deception|password|secret|token|credential)([_\s-]|$)/i;
const REF = /^[A-Za-z][A-Za-z0-9._:/-]{2,159}$/;
const MAX_BYTES = 1_000_000;
const MAX_ROWS = 10_000;

function digest(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function invariant(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function canonicalRecord(record: CanonicalRecord): string {
  return TARGET_FIELDS.filter((field) => record[field] !== undefined)
    .map((field) => `${field}=${record[field]}`)
    .join("\n");
}

function canonicalMapping(mapping: CsvMappingProfileV1): string {
  return [...mapping.mappings]
    .sort((left, right) => left.targetField.localeCompare(right.targetField))
    .map((item) => `${item.sourceHeader}->${item.targetField}`)
    .join("\n");
}

function parseCsv(csvText: string): readonly string[][] {
  invariant(Buffer.byteLength(csvText, "utf8") <= MAX_BYTES, "CSV_TOO_LARGE");
  const text = csvText.charCodeAt(0) === 0xfeff ? csvText.slice(1) : csvText;
  invariant(text.length > 0, "CSV_EMPTY");

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let afterQuote = false;

  const finishField = () => {
    row.push(field);
    field = "";
    afterQuote = false;
  };
  const finishRow = () => {
    finishField();
    rows.push(row);
    row = [];
    invariant(rows.length <= MAX_ROWS + 1, "CSV_TOO_MANY_ROWS");
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
          afterQuote = true;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (afterQuote && character !== "," && character !== "\r" && character !== "\n") {
      throw new Error("CSV_CHAR_AFTER_QUOTE");
    }
    if (character === '"') {
      invariant(field.length === 0, "CSV_QUOTE_IN_UNQUOTED_FIELD");
      quoted = true;
    } else if (character === ",") {
      finishField();
    } else if (character === "\r" || character === "\n") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      finishRow();
    } else {
      field += character;
    }
  }

  invariant(!quoted, "CSV_UNCLOSED_QUOTE");
  if (field.length > 0 || row.length > 0 || !/[\r\n]$/.test(text)) finishRow();
  while (rows.length > 0 && rows.at(-1)?.every((value) => value === "")) rows.pop();
  invariant(rows.length >= 2, "CSV_DATA_ROW_REQUIRED");
  return rows;
}

function escapeCsv(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function validateRequest(request: CsvPortabilityRequestV1): void {
  invariant(request.schemaVersion === CSV_PORTABILITY_SCHEMA_VERSION, "SCHEMA_VERSION_UNSUPPORTED");
  invariant(request.synthetic === true, "SYNTHETIC_ONLY");
  invariant(request.connectorId === "open-portability-v1", "CONNECTOR_NOT_ALLOWED");
  invariant(REF.test(request.tenantRef), "TENANT_REF_INVALID");
  invariant(
    request.idempotencyKey.startsWith(`${request.tenantRef}:`),
    "IDEMPOTENCY_NOT_TENANT_SCOPED",
  );
  invariant(request.mapping.schemaVersion === CSV_MAPPING_SCHEMA_VERSION, "MAPPING_VERSION_UNSUPPORTED");
  invariant(REF.test(request.mapping.profileRef), "MAPPING_PROFILE_REF_INVALID");
  invariant(request.mapping.mappings.length > 0, "MAPPING_EMPTY");

  const sourceHeaders = new Set<string>();
  const targetFields = new Set<CsvTargetField>();
  for (const item of request.mapping.mappings) {
    invariant(REF.test(item.sourceHeader), "SOURCE_HEADER_INVALID");
    invariant(!FORBIDDEN_HEADER.test(item.sourceHeader), "SOURCE_HEADER_FORBIDDEN");
    invariant(TARGET_FIELDS.includes(item.targetField), "TARGET_FIELD_FORBIDDEN");
    invariant(!sourceHeaders.has(item.sourceHeader), "SOURCE_HEADER_DUPLICATE");
    invariant(!targetFields.has(item.targetField), "TARGET_FIELD_DUPLICATE");
    sourceHeaders.add(item.sourceHeader);
    targetFields.add(item.targetField);
  }
  invariant(targetFields.has("opaque_candidate_ref"), "CANDIDATE_REF_MAPPING_REQUIRED");
}

interface EvaluatedRow {
  readonly outcome: CsvRowOutcomeV1;
  readonly record?: CanonicalRecord;
}

export class CsvPortabilityEngine {
  constructor(private readonly store: CsvPortabilityStore) {}

  dryRun(request: CsvPortabilityRequestV1): CsvDryRunReceiptV1 {
    return this.evaluate(request).receipt;
  }

  private evaluate(request: CsvPortabilityRequestV1): {
    readonly receipt: CsvDryRunReceiptV1;
    readonly evaluated: readonly EvaluatedRow[];
  } {
    validateRequest(request);
    const parsed = parseCsv(request.csvText);
    const headers = parsed[0]!;
    invariant(new Set(headers).size === headers.length, "CSV_HEADER_DUPLICATE");
    invariant(headers.every((header) => !FORBIDDEN_HEADER.test(header)), "CSV_HEADER_FORBIDDEN");

    const mappedSources = new Set(request.mapping.mappings.map((item) => item.sourceHeader));
    invariant(headers.every((header) => mappedSources.has(header)), "CSV_UNMAPPED_HEADER");
    invariant(request.mapping.mappings.every((item) => headers.includes(item.sourceHeader)), "CSV_MAPPING_SOURCE_MISSING");

    const headerIndex = new Map(headers.map((header, index) => [header, index]));
    const seen = new Map<string, `sha256:${string}`>();
    const evaluated: EvaluatedRow[] = [];

    for (const [offset, values] of parsed.slice(1).entries()) {
      const rowNumber = offset + 2;
      invariant(values.length === headers.length, `CSV_ROW_WIDTH_MISMATCH:${rowNumber}`);
      const mutable: Partial<Record<CsvTargetField, string>> = {};
      let invalid = false;
      for (const item of request.mapping.mappings) {
        const value = values[headerIndex.get(item.sourceHeader)!]!.trim();
        if (value === "") continue;
        if (!REF.test(value) || !value.startsWith(EXPECTED_REF_PREFIX[item.targetField])) invalid = true;
        mutable[item.targetField] = value;
      }

      const entityRef = mutable.opaque_candidate_ref;
      if (!entityRef) {
        evaluated.push({ outcome: { rowNumber, disposition: "REJECTED", reasonCode: "MISSING_REQUIRED_REF" } });
        continue;
      }
      if (invalid) {
        evaluated.push({ outcome: { rowNumber, entityRef, disposition: "REJECTED", reasonCode: "INVALID_OPAQUE_REF" } });
        continue;
      }

      const record = mutable as CanonicalRecord;
      const rowDigest = digest(canonicalRecord(record));
      const priorInBatch = seen.get(entityRef);
      if (priorInBatch) {
        evaluated.push({
          outcome: {
            rowNumber,
            entityRef,
            rowDigest,
            disposition: priorInBatch === rowDigest ? "DUPLICATE" : "CONFLICT",
            reasonCode: priorInBatch === rowDigest ? "DUPLICATE_SAME_DIGEST" : "DUPLICATE_DIFFERENT_DIGEST",
          },
        });
        continue;
      }
      seen.set(entityRef, rowDigest);

      const stored = this.store.getRecord(request.tenantRef, entityRef);
      if (stored) {
        evaluated.push({
          outcome: {
            rowNumber,
            entityRef,
            rowDigest,
            disposition: stored.digest === rowDigest ? "DUPLICATE" : "CONFLICT",
            reasonCode: stored.digest === rowDigest ? "EXISTING_RECORD_SAME_DIGEST" : "EXISTING_RECORD_DIFFERENT_DIGEST",
          },
        });
      } else {
        evaluated.push({ outcome: { rowNumber, entityRef, rowDigest, disposition: "NEW", reasonCode: "READY" }, record });
      }
    }

    const rows = evaluated.map((item) => item.outcome);
    const counts: CsvReconciliationCountsV1 = {
      inputRows: rows.length,
      ready: rows.filter((row) => row.disposition === "NEW").length,
      duplicate: rows.filter((row) => row.disposition === "DUPLICATE").length,
      conflict: rows.filter((row) => row.disposition === "CONFLICT").length,
      rejected: rows.filter((row) => row.disposition === "REJECTED").length,
    };
    const inputDigest = digest(request.csvText);
    const mappingDigest = digest(canonicalMapping(request.mapping));
    const requestDigest = digest(
      `${request.schemaVersion}\n${request.tenantRef}\n${request.connectorId}\n${request.idempotencyKey}\n${mappingDigest}\n${inputDigest}`,
    );

    return {
      receipt: {
        schemaVersion: CSV_PORTABILITY_SCHEMA_VERSION,
        synthetic: true,
        mode: "DRY_RUN",
        status: counts.conflict === 0 && counts.rejected === 0 ? "READY" : "BLOCKED",
        tenantRef: request.tenantRef,
        connectorId: request.connectorId,
        idempotencyKey: request.idempotencyKey,
        inputDigest,
        mappingDigest,
        requestDigest,
        counts,
        rows,
      },
      evaluated,
    };
  }

  apply(request: CsvPortabilityRequestV1): CsvApplyReceiptV1 {
    const evaluation = this.evaluate(request);
    const dryRun = evaluation.receipt;
    const humanApprovalRef = request.humanApprovalRef;
    invariant(typeof humanApprovalRef === "string", "HUMAN_APPROVAL_REQUIRED");
    invariant(
      humanApprovalRef.startsWith("approval.") && REF.test(humanApprovalRef),
      "HUMAN_APPROVAL_REQUIRED",
    );
    const prior = this.store.getApply(request.tenantRef, request.idempotencyKey);
    if (prior) {
      invariant(prior.requestDigest === dryRun.requestDigest, "IDEMPOTENCY_DIGEST_CONFLICT");
      return { ...prior.receipt, disposition: "REPLAYED" };
    }
    invariant(dryRun.status === "READY", "RECONCILIATION_BLOCKED");

    const newRows = evaluation.evaluated.filter(
      (item): item is EvaluatedRow & { readonly record: CanonicalRecord } =>
        item.outcome.disposition === "NEW" && item.record !== undefined,
    );

    const reconciliationDigest = digest(JSON.stringify(dryRun.rows));
    const receipt: CsvApplyReceiptV1 = {
      schemaVersion: CSV_PORTABILITY_SCHEMA_VERSION,
      synthetic: true,
      mode: "APPLY",
      disposition: "CREATED",
      tenantRef: request.tenantRef,
      connectorId: request.connectorId,
      idempotencyKey: request.idempotencyKey,
      requestDigest: dryRun.requestDigest,
      reconciliationDigest,
      appliedRows: newRows.length,
      duplicateRows: dryRun.counts.duplicate,
      humanApprovalRef,
    };
    this.store.commit(
      request.tenantRef,
      newRows.map((item) => ({
        entityRef: item.record.opaque_candidate_ref,
        stored: { digest: item.outcome.rowDigest!, record: item.record },
      })),
      request.idempotencyKey,
      { requestDigest: dryRun.requestDigest, receipt },
    );
    return receipt;
  }

  exportTenant(tenantRef: string): CsvExportReceiptV1 {
    invariant(REF.test(tenantRef), "TENANT_REF_INVALID");
    const records = this.store.listRecords(tenantRef).map((item) => item.record);
    const header = TARGET_FIELDS.join(",");
    const body = records.map((record) =>
      TARGET_FIELDS.map((field) => escapeCsv(record[field] ?? "")).join(","),
    );
    const csvText = `${[header, ...body].join("\r\n")}\r\n`;
    return {
      schemaVersion: CSV_PORTABILITY_SCHEMA_VERSION,
      synthetic: true,
      mode: "EXPORT",
      tenantRef,
      recordCount: records.length,
      csvText,
      payloadDigest: digest(csvText),
    };
  }
}
