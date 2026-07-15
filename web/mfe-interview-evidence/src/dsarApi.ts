/**
 * F10 DSAR/erasure istemcisi — DsrService invariant'ları backend'de fail-closed;
 * UI yalnız DSAR kimliğini taşır: subjectRef OPAK referanstır (PII değil),
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
type ErasureExecutionBody = ErasureReceiptBody & { replayed?: boolean };

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

export async function receiveDsar(
  token: string,
  interviewId: string,
  subjectRef: string,
  // backend sözleşmesi (DsrService): reason_code ZORUNLU — UI da zorunlu taşır
  reasonCode: string,
): Promise<string> {
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
  const body = (await resp.json()) as { dsarKey: string };
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
  const receipt = (await resp.json()) as ErasureExecutionBody;
  return { ...receipt, replayed: replayFlag(receipt, resp) };
}

function replayFlag(body: ErasureExecutionBody, resp: Response): boolean {
  const bodyFlag = typeof body.replayed === "boolean" ? body.replayed : null;
  const header = resp.headers.get("X-ATS-Replay");
  const headerFlag = header === "true" ? true : header === "false" ? false : null;
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
  return (await resp.json()) as ErasureStatus;
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
    if (reconcileError instanceof ErasureInProgressError) {
      throw reconcileError;
    }
    throw originalError instanceof Error ? originalError : new Error(String(originalError));
  }
}
