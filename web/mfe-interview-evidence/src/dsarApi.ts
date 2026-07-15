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
  deletedContentCount: number;
  caseTransitioned: boolean;
};

async function failWithReason(resp: Response): Promise<never> {
  let reason = String(resp.status);
  try {
    const body = (await resp.json()) as ApiError;
    reason = body.reason ?? reason;
  } catch {
    // gövde JSON değilse durum kodu yeter
  }
  throw new Error(reason);
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
  const resp = await fetch(
    `/api/v1/interviews/${encodeURIComponent(interviewId)}/dsar/erasure`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      // Strict server-authoritative envelope: caller scope/target göndermez.
      body: JSON.stringify({ dsarKey }),
    },
  );
  if (!resp.ok) {
    await failWithReason(resp);
  }
  return (await resp.json()) as ErasureReceipt;
}
