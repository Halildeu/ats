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
    action: "START" | "EDIT" | "REVIEWED_NO_CHANGE" | "REJECT" | "RATIONALE", ref?: string, oversightRoleRef?: string) {
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

export type ExportReceipt = {
  artifactKey: string;
  evidenceId: string;
  packetDigest: string;
  claimCount: number;
};

/**
 * F7 export — kriter-bağlama (iş-ilişkililik) KULLANICIDAN alınır (anlamlı
 * uygunluk girdisi); generator/redaction/retention ref'leri P1'de belgeli
 * dev-placeholder'lardır (deploy-config görevi; ExportContext alanları OPAK
 * pointer sözleşmesi — packet'e içerik girmez).
 */
export function exportPacket(token: string, interviewId: string, caseKey: string,
    citationKey: string, criterionId: string, jobRelatednessRef: string) {
  return post<ExportReceipt>(token,
      `/api/v1/interviews/${encodeURIComponent(interviewId)}/export`, {
        caseKey,
        citationKeys: [citationKey],
        context: {
          generatorVersionRef: "mfe-p1-dev",
          locale: "tr-TR",
          timezone: "Europe/Istanbul",
          aiAssistanceDisclosureRef: "disclosure-ai-assist-tr-v1",
          consentRefs: ["consent-recorded-worm"],
          rubricVersionRef: "rubric-v1",
          criteria: [{ criterionId, jobRelatednessRationaleRef: jobRelatednessRef }],
          citationCriterion: { [citationKey]: criterionId },
          wormChainRefs: ["worm-chain-head"],
          redactionPolicyRef: "redaction-policy-p1",
          redactionRunRef: "redaction-run-p1",
          retentionPolicyRef: "retention-policy-p1",
          schemaDigest: "0".repeat(64),
          signatureRef: "sig-p1-dev",
        },
      });
}
