/**
 * F1/F2 istemcisi — consent kaydı + kayıt yükleme. UI yalnız taşır:
 * subjectRef OPAK referanstır (PII değil), consent state'i backend'de
 * WORM kanıtıyla birlikte yazılır (GRANTED=ledger-önce fail-closed),
 * upload consent-kapılıdır (GRANTED yoksa backend reddeder — UI bypass
 * edemez). Content-Type kapalı allowlist backend'dedir; buradaki ACCEPT
 * yalnız dosya-seçici yönlendirmesidir (doğrulama değil).
 */
import type { ApiError } from "./api";

export type ConsentState = "GRANTED" | "DENIED" | "WITHDRAWN";

export type IngestReceipt = {
  objectKey: string;
  evidenceId: string;
  ledgerSequence: number;
};

/** Backend consumes allowlist'inin birebir aynası (dosya-seçici yönlendirmesi). */
export const RECORDING_ACCEPT = "audio/wav,audio/mpeg,audio/mp4,audio/webm,video/mp4,video/webm";

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

export async function putRecordingConsent(
  token: string,
  interviewId: string,
  subjectRef: string,
  state: ConsentState,
  // retry-güvenliği: aynı beyanın tekrarı aynı key ile idempotent; YENİ beyan yeni key
  idempotencyKey: string,
): Promise<void> {
  const resp = await fetch(
    `/api/v1/interviews/${encodeURIComponent(interviewId)}/recording-consent`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-ATS-Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ subjectRef, state }),
    },
  );
  if (!resp.ok) {
    await failWithReason(resp);
  }
}

export async function uploadRecording(
  token: string,
  interviewId: string,
  file: File,
): Promise<IngestReceipt> {
  const resp = await fetch(
    `/api/v1/interviews/${encodeURIComponent(interviewId)}/recordings`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": file.type,
        "X-ATS-Filename": file.name,
      },
      body: file,
    },
  );
  if (!resp.ok) {
    await failWithReason(resp);
  }
  return (await resp.json()) as IngestReceipt;
}
