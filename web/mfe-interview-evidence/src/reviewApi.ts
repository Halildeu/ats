/** Review-workspace API istemcisi — hepsi JWT'li; hata {error,reason} fail-closed. */
import type { ApiError } from "./api";

async function post<T>(token: string, path: string, body: unknown): Promise<T> {
  const resp = await fetch(path, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    let reason = String(resp.status);
    try {
      reason = ((await resp.json()) as ApiError).reason ?? reason;
    } catch { /* durum kodu yeter */ }
    throw new Error(reason);
  }
  return (await resp.json().catch(() => ({}))) as T;
}

export type CitationReceipt = {
  citationKey: string;
  evidenceId: string;
  entailment: "SUPPORTED" | "NOT_SUPPORTED" | "INSUFFICIENT";
  resolvedRefCount: number;
};

export function createCitation(token: string, interviewId: string, transcriptKey: string, claim: string) {
  return post<CitationReceipt>(token,
      `/api/v1/interviews/${encodeURIComponent(interviewId)}/citations`, { transcriptKey, claim });
}

export function openCase(token: string, interviewId: string, citationKey: string) {
  return post<{ caseKey: string }>(token,
      `/api/v1/interviews/${encodeURIComponent(interviewId)}/review-cases`,
      { sourceEvidenceRefs: [citationKey], aiOutputVersionRef: "ai-stub-v1" });
}

export async function transition(token: string, interviewId: string, caseKey: string,
    action: "START" | "REVIEWED_NO_CHANGE" | "RATIONALE", ref?: string, oversightRoleRef?: string) {
  const resp = await fetch(`/api/v1/interviews/${encodeURIComponent(interviewId)}/review-case/transition`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ caseKey, action, ref, oversightRoleRef }),
  });
  if (!resp.ok) {
    let reason = String(resp.status);
    try {
      reason = ((await resp.json()) as ApiError).reason ?? reason;
    } catch { /* durum kodu yeter */ }
    throw new Error(reason);
  }
}

export function finalizeCase(token: string, interviewId: string, caseKey: string, decisionOutcomeRef: string) {
  return post<{ caseKey: string; evidenceId: string }>(token,
      `/api/v1/interviews/${encodeURIComponent(interviewId)}/review-case/finalize`,
      { caseKey, decisionOutcomeRef });
}

export async function getCaseState(token: string, interviewId: string, caseKey: string): Promise<string> {
  const resp = await fetch(
      `/api/v1/interviews/${encodeURIComponent(interviewId)}/review-case?case=${encodeURIComponent(caseKey)}`,
      { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) {
    throw new Error(String(resp.status));
  }
  return ((await resp.json()) as { state: string }).state;
}
