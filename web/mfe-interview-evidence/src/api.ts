/** app-boot REST istemcisi — tenant/kimlik DAİMA JWT'de; UI yalnız taşır. */
export type Segment = {
  index: number;
  speakerLabel: string;
  startMs: number;
  endMs: number;
  text: string;
};

export type TranscriptDto = {
  interviewId: string;
  language: string;
  segments: Segment[];
};

export type ApiError = { error: string; reason: string };

/** Pointer-only liste girdisi — content (segment metni) taşımaz. */
export type TranscriptSummary = {
  transcriptKey: string;
  language: string;
  segmentCount: number;
};

export async function listTranscripts(
  token: string,
  interviewId: string,
): Promise<TranscriptSummary[]> {
  const resp = await fetch(
    `/api/v1/interviews/${encodeURIComponent(interviewId)}/transcripts`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!resp.ok) {
    let reason = String(resp.status);
    try {
      const body = (await resp.json()) as ApiError;
      reason = body.reason ?? reason;
    } catch {
      // gövde JSON değilse durum kodu yeter
    }
    throw new Error(reason);
  }
  return (await resp.json()) as TranscriptSummary[];
}

export async function fetchTranscript(
  token: string,
  interviewId: string,
  transcriptKey: string,
): Promise<TranscriptDto> {
  const resp = await fetch(
    `/api/v1/interviews/${encodeURIComponent(interviewId)}/transcript?key=${encodeURIComponent(transcriptKey)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!resp.ok) {
    let reason = String(resp.status);
    try {
      const body = (await resp.json()) as ApiError;
      reason = body.reason ?? reason;
    } catch {
      // gövde JSON değilse durum kodu yeter
    }
    throw new Error(reason);
  }
  return (await resp.json()) as TranscriptDto;
}
