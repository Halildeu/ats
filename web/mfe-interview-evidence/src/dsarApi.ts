/**
 * F10 DSAR/erasure istemcisi — DsrService invariant'ları backend'de fail-closed;
 * UI yalnız DSAR kimliğini taşır: subjectRef prefixed OPAK referans/UUIDv4'tür (PII değil),
 * erasure YIKICI ve geri alınamaz content işlemidir. Silme hedeflerini tarayıcı
 * üretmez; backend server truth'undan çözer, WORM'u silmez ve kaynak kanıtları
 * append-only tombstone ile bağlar.
 */
import type { ApiError } from "./api";

export type ErasureReceipt = {
  dsarKey: string;
  tombstoneCount: number;
  /** Ana veri düzlemlerinde doğrulanmış silme etkisi; object-store çağrısı dahil değildir. */
  deletedContentCount: number;
  /** Object-store delete çağrısı işlendi; kalıcı/crypto-erasure kanıtı değildir. */
  objectDeleteIssuedCount: number;
  caseTransitioned: boolean;
  /** Aynı terminal receipt yan etkisiz recovery/replay yolundan döndüyse true. */
  replayed: boolean;
};

type ErasureReceiptBody = Omit<ErasureReceipt, "replayed">;
type ErasureExecutionBody = ErasureReceiptBody & { replayed: boolean };

type JsonObject = Record<string, unknown>;

const RECEIPT_KEYS = [
  "dsarKey",
  "tombstoneCount",
  "deletedContentCount",
  "objectDeleteIssuedCount",
  "caseTransitioned",
] as const;
const EXECUTION_KEYS = [...RECEIPT_KEYS, "replayed"] as const;
const RUNNING_STATUS_KEYS = [
  "dsarKey",
  "state",
  "completedStepCount",
  "totalStepCount",
  "retryAfterSeconds",
] as const;
const FULFILLED_STATUS_KEYS = [...RUNNING_STATUS_KEYS, "receipt"] as const;
// DsrService.WORKER_LEASE ile aynı canonical transport sınırı; daha büyük değer
// ürün reconcile butonunu saldırgan/bozuk response ile süresiz kilitleyemez.
const ERASURE_WORKER_LEASE_SECONDS = 30;
const DSAR_SUBJECT_REF = /^(?:(?:subj|subject)[._:-])?[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-4[0-9A-Fa-f]{3}-[89AaBb][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}$/;
export const DSAR_SUBJECT_REF_MIN_LENGTH = 36;
export const DSAR_SUBJECT_REF_MAX_LENGTH = 44;
export const DATA_SUBJECT_ERASURE_REASON = "DATA_SUBJECT_ERASURE";

/** UX guard; backend domain + PostgreSQL constraint otoriterdir. */
export function isValidDsarSubjectRef(value: string): boolean {
  return value.length >= DSAR_SUBJECT_REF_MIN_LENGTH
    && value.length <= DSAR_SUBJECT_REF_MAX_LENGTH
    && DSAR_SUBJECT_REF.test(value);
}

/** Serbest hukuki açıklama değil; bu akışın tek desteklediği kapalı operasyon kodu. */
export function isValidDsarReasonCode(value: string): boolean {
  return value === DATA_SUBJECT_ERASURE_REASON;
}

export type ErasureStatus = {
  dsarKey: string;
  state: "RUNNING" | "FULFILLED";
  completedStepCount: number;
  totalStepCount: number;
  retryAfterSeconds: number;
  receipt?: ErasureReceiptBody;
};

export class ErasureInProgressError extends Error {
  constructor(
    readonly completedStepCount: number,
    readonly totalStepCount: number,
    readonly retryAfterSeconds: number,
  ) {
    super("erasure execution server-side sürüyor");
    this.name = "ErasureInProgressError";
  }
}

async function errorFromResponse(resp: Response): Promise<Error> {
  let reason = String(resp.status);
  try {
    const body = (await resp.json()) as ApiError;
    reason = body.reason ?? reason;
  } catch {
    // gövde JSON değilse durum kodu yeter
  }
  return new Error(reason);
}

async function failWithReason(resp: Response): Promise<never> {
  throw await errorFromResponse(resp);
}

class DsarContractError extends Error {
  constructor(reason: string) {
    super(`DSAR/erasure response sözleşmesi geçersiz: ${reason} (fail-closed)`);
    this.name = "DsarContractError";
  }
}

function contractError(reason: string): DsarContractError {
  return new DsarContractError(reason);
}

function objectBody(value: unknown, label: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw contractError(`${label} object olmalı`);
  }
  return value as JsonObject;
}

function hasExactKeys(
  body: JsonObject,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const keys = Object.keys(body);
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(body, key))
    && keys.every((key) => allowed.has(key));
}

function nonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw contractError(`${field} non-negative safe integer olmalı`);
  }
  return value;
}

async function jsonBody(resp: Response, label: string): Promise<unknown> {
  try {
    return await resp.json();
  } catch {
    throw contractError(`${label} geçerli JSON olmalı`);
  }
}

function parseReceiptBody(value: unknown, expectedDsarKey: string): ErasureReceiptBody {
  const body = objectBody(value, "receipt");
  if (!hasExactKeys(body, RECEIPT_KEYS)) {
    throw contractError("receipt alanları eksik veya canonical sözleşme dışında");
  }
  if (body.dsarKey !== expectedDsarKey) {
    throw contractError("receipt dsarKey istek ile eşleşmiyor");
  }
  if (typeof body.caseTransitioned !== "boolean") {
    throw contractError("caseTransitioned boolean olmalı");
  }
  return {
    dsarKey: expectedDsarKey,
    tombstoneCount: nonNegativeInteger(body.tombstoneCount, "tombstoneCount"),
    deletedContentCount: nonNegativeInteger(body.deletedContentCount, "deletedContentCount"),
    objectDeleteIssuedCount: nonNegativeInteger(
      body.objectDeleteIssuedCount,
      "objectDeleteIssuedCount",
    ),
    caseTransitioned: body.caseTransitioned,
  };
}

function parseExecutionBody(value: unknown, expectedDsarKey: string): ErasureExecutionBody {
  const body = objectBody(value, "execution receipt");
  if (!hasExactKeys(body, EXECUTION_KEYS)) {
    throw contractError("execution receipt alanları eksik veya canonical sözleşme dışında");
  }
  if (typeof body.replayed !== "boolean") {
    throw contractError("replayed boolean olmalı");
  }
  const receipt = parseReceiptBody(
    Object.fromEntries(RECEIPT_KEYS.map((key) => [key, body[key]])),
    expectedDsarKey,
  );
  return { ...receipt, replayed: body.replayed };
}

function bindRetryAfter(resp: Response, retryAfterSeconds: number): void {
  const raw = resp.headers.get("Retry-After");
  if (raw !== null && !/^(0|[1-9][0-9]*)$/.test(raw)) {
    throw contractError("Retry-After header tam sayı saniye olmalı");
  }
  const headerSeconds = raw === null ? null : Number(raw);
  if (headerSeconds !== null && headerSeconds !== retryAfterSeconds) {
    throw contractError("Retry-After body/header arasında tutarsız");
  }
  if (retryAfterSeconds > 0 && headerSeconds === null) {
    throw contractError("pozitif retryAfterSeconds için Retry-After header eksik");
  }
}

function parseStatusBody(
  value: unknown,
  expectedDsarKey: string,
  resp: Response,
): ErasureStatus {
  const body = objectBody(value, "erasure status");
  if (body.state !== "RUNNING" && body.state !== "FULFILLED") {
    throw contractError("state RUNNING veya FULFILLED olmalı");
  }
  const requiredKeys = body.state === "RUNNING"
    ? RUNNING_STATUS_KEYS
    : FULFILLED_STATUS_KEYS;
  if (!hasExactKeys(body, requiredKeys)) {
    throw contractError("status alanları eksik veya canonical sözleşme dışında");
  }
  if (body.dsarKey !== expectedDsarKey) {
    throw contractError("status dsarKey istek ile eşleşmiyor");
  }
  const completedStepCount = nonNegativeInteger(
    body.completedStepCount,
    "completedStepCount",
  );
  const totalStepCount = nonNegativeInteger(body.totalStepCount, "totalStepCount");
  const retryAfterSeconds = nonNegativeInteger(
    body.retryAfterSeconds,
    "retryAfterSeconds",
  );
  if (retryAfterSeconds > ERASURE_WORKER_LEASE_SECONDS) {
    throw contractError("retryAfterSeconds server worker lease üst sınırını aşıyor");
  }
  if (totalStepCount < 1 || completedStepCount > totalStepCount) {
    throw contractError("status adım sayaçları tutarsız");
  }
  bindRetryAfter(resp, retryAfterSeconds);

  if (body.state === "RUNNING") {
    return {
      dsarKey: expectedDsarKey,
      state: "RUNNING",
      completedStepCount,
      totalStepCount,
      retryAfterSeconds,
    };
  }
  if (completedStepCount !== totalStepCount || retryAfterSeconds !== 0) {
    throw contractError("FULFILLED status tam adım ve retryAfterSeconds=0 gerektirir");
  }
  return {
    dsarKey: expectedDsarKey,
    state: "FULFILLED",
    completedStepCount,
    totalStepCount,
    retryAfterSeconds,
    receipt: parseReceiptBody(body.receipt, expectedDsarKey),
  };
}

export async function receiveDsar(
  token: string,
  interviewId: string,
  subjectRef: string,
  // backend sözleşmesi (DsrService): reason_code ZORUNLU — UI da zorunlu taşır
  reasonCode: string,
): Promise<string> {
  if (!isValidDsarSubjectRef(subjectRef) || !isValidDsarReasonCode(reasonCode)) {
    throw contractError("DSAR intake opak subjectRef + bounded reasonCode gerektirir");
  }
  const resp = await fetch(
    `/api/v1/interviews/${encodeURIComponent(interviewId)}/dsar`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ subjectRef, reasonCode }),
    },
  );
  if (!resp.ok) {
    await failWithReason(resp);
  }
  const body = objectBody(await jsonBody(resp, "DSAR intake response"), "DSAR intake response");
  if (!hasExactKeys(body, ["dsarKey"])
      || typeof body.dsarKey !== "string" || body.dsarKey.trim() === "") {
    throw contractError("DSAR intake yalnız non-empty dsarKey taşımalı");
  }
  return body.dsarKey;
}

export async function executeErasure(
  token: string,
  interviewId: string,
  dsarKey: string,
): Promise<ErasureReceipt> {
  let resp: Response;
  try {
    resp = await fetch(
      `/api/v1/interviews/${encodeURIComponent(interviewId)}/dsar/erasure`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        // Strict server-authoritative envelope: caller scope/target göndermez.
        body: JSON.stringify({ dsarKey }),
      },
    );
  } catch (error) {
    // Bağlantı düştüğünde POST'un server'da tamamlanıp tamamlanmadığı bilinemez.
    // Yeni yıkıcı POST üretmeden salt-okunur durable receipt/status ile reconcile et.
    return reconcileAfterUncertainFailure(token, interviewId, dsarKey, error);
  }
  if (!resp.ok) {
    const error = await errorFromResponse(resp);
    if (resp.status === 409 && resp.headers.has("Retry-After")) {
      return reconcileAfterUncertainFailure(token, interviewId, dsarKey, error);
    }
    throw error;
  }
  const receipt = parseExecutionBody(
    await jsonBody(resp, "execution receipt"),
    dsarKey,
  );
  return { ...receipt, replayed: replayFlag(receipt, resp) };
}

function replayFlag(body: ErasureExecutionBody, resp: Response): boolean {
  const bodyFlag = typeof body.replayed === "boolean" ? body.replayed : null;
  const header = resp.headers.get("X-ATS-Replay");
  const headerFlag = header === "true" ? true : header === "false" ? false : null;
  if (header !== null && headerFlag === null) {
    throw contractError("X-ATS-Replay header true veya false olmalı");
  }
  if (bodyFlag !== null && headerFlag !== null && bodyFlag !== headerFlag) {
    throw new Error("erasure replay kanıtı body/header arasında tutarsız (fail-closed)");
  }
  if (bodyFlag !== null) {
    return bodyFlag;
  }
  if (headerFlag !== null) {
    return headerFlag;
  }
  throw new Error("erasure replay kanıtı eksik (fail-closed)");
}

export async function fetchErasureStatus(
  token: string,
  interviewId: string,
  dsarKey: string,
): Promise<ErasureStatus> {
  const resp = await fetch(
    `/api/v1/interviews/${encodeURIComponent(interviewId)}/dsar/erasure/receipt`
      + `?dsarKey=${encodeURIComponent(dsarKey)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!resp.ok) {
    await failWithReason(resp);
  }
  return parseStatusBody(
    await jsonBody(resp, "erasure status"),
    dsarKey,
    resp,
  );
}

/** Salt-okunur recovery: RUNNING ise typed progress, terminalse replay receipt döndürür. */
export async function reconcileErasure(
  token: string,
  interviewId: string,
  dsarKey: string,
): Promise<ErasureReceipt> {
  const status = await fetchErasureStatus(token, interviewId, dsarKey);
  if (status.state === "FULFILLED" && status.receipt) {
    return { ...status.receipt, replayed: true };
  }
  if (status.state === "RUNNING") {
    throw new ErasureInProgressError(
      status.completedStepCount,
      status.totalStepCount,
      status.retryAfterSeconds,
    );
  }
  throw new Error("erasure status terminal receipt içermiyor (fail-closed)");
}

async function reconcileAfterUncertainFailure(
  token: string,
  interviewId: string,
  dsarKey: string,
  originalError: unknown,
): Promise<ErasureReceipt> {
  try {
    return await reconcileErasure(token, interviewId, dsarKey);
  } catch (reconcileError) {
    if (reconcileError instanceof ErasureInProgressError
        || reconcileError instanceof DsarContractError) {
      throw reconcileError;
    }
    throw originalError instanceof Error ? originalError : new Error(String(originalError));
  }
}
