import { useState } from "react";
import { Badge, Button, Input, Text } from "@ats/ui/f3";
import { createCitation, exportPacket, finalizeCase, getCaseState, openCase, transition,
  type CitationReceipt, type ExportReceipt } from "./reviewApi";
import { t } from "./i18n";

/**
 * F4/F5 inceleme çalışma-alanı (P1): standart §2'nin ÜÇ insan-yolu da UI'da —
 * NO_CHANGE / EDIT (değişiklik-özeti-ref) / REJECT (gerekçe-ref) → RATIONALE →
 * FINALIZE → F7 export düğmesi. Karar DAİMA insanın: otomatik-finalize yok.
 *
 * KANIT-KAPISI (Codex #74 blocker): insan-karar yolu YALNIZ
 * SUPPORTED + kaynaklı citation için açılır — NOT_SUPPORTED karar-kanıtı
 * OLAMAZ ve INSUFFICIENT export'a GİREMEZ (F7 invariant'ları); UI bu
 * durumda akışı açmaz ve nedenini açıkça söyler (dead-end üretmez).
 */
export function ReviewWorkspace({ token, interviewId, transcriptKey }: {
  token: string;
  interviewId: string;
  transcriptKey: string;
}) {
  const [claim, setClaim] = useState("");
  const [citation, setCitation] = useState<CitationReceipt | null>(null);
  const [caseKey, setCaseKey] = useState<string | null>(null);
  const [caseState, setCaseState] = useState<string | null>(null);
  const [rationaleRef, setRationaleRef] = useState("");
  const [decisionRef, setDecisionRef] = useState("");
  const [editSummaryRef, setEditSummaryRef] = useState("");
  const [rejectRef, setRejectRef] = useState("");
  const [criterionId, setCriterionId] = useState("c-teknik-yetkinlik");
  const [jobRelRef, setJobRelRef] = useState("");
  const [exportReceipt, setExportReceipt] = useState<ExportReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(step: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await step();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error.generic"));
    } finally {
      setBusy(false);
    }
  }

  const refreshState = async (key: string) => setCaseState(await getCaseState(token, interviewId, key));

  return (
    <section aria-label={t("review.workspaceTitle")} data-testid="review-workspace"
        style={{ marginTop: 28, borderTop: "2px solid var(--border-muted, #E5E5E5)", paddingTop: 16 }}>
      <Text as="h2" size="lg" weight="medium">{t("review.workspaceTitle")}</Text>

      <div style={{ display: "grid", gap: 10, maxWidth: 560, marginTop: 8 }}>
        <Input label={t("review.claimLabel")} value={claim}
            onChange={(e) => setClaim(e.target.value)} data-testid="claim-input" />
        <Button disabled={busy || !claim.trim()} data-testid="cite-button"
            onClick={() => void run(async () => {
              setCitation(await createCitation(token, interviewId, transcriptKey, claim.trim()));
              setCaseKey(null);
              setCaseState(null);
            })}>
          {t("review.createCitation")}
        </Button>

        {citation && (
          <div data-testid="citation-result" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Badge variant={citation.entailment === "SUPPORTED" ? "success" : "warning"}>
              {t(citation.entailment === "SUPPORTED" ? "entailment.supported"
                  : citation.entailment === "NOT_SUPPORTED" ? "entailment.notSupported"
                  : "entailment.insufficient")}
            </Badge>
            <Text as="span" size="sm" variant="secondary">
              {t("review.refCount", { count: citation.resolvedRefCount })}
            </Text>
          </div>
        )}

        {citation && citation.entailment !== "SUPPORTED" && (
          <Text as="p" variant="warning" data-testid="not-decision-evidence">
            {t("review.notDecisionEvidence")}
          </Text>
        )}

        {citation && citation.entailment === "SUPPORTED" && citation.resolvedRefCount > 0 && !caseKey && (
          <Button disabled={busy} data-testid="open-case-button"
              onClick={() => void run(async () => {
                const opened = await openCase(token, interviewId, citation.citationKey);
                await transition(token, interviewId, opened.caseKey, "START", undefined, "role-hiring-panel");
                setCaseKey(opened.caseKey);
                await refreshState(opened.caseKey);
              })}>
            {t("review.openCase")}
          </Button>
        )}

        {caseKey && caseState && (
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Text as="span" size="sm" variant="secondary">{t("review.caseState")}</Text>
              <Badge variant={caseState === "FINALIZED" ? "success" : "default"}>
                <span data-testid="case-state">{caseState}</span>
              </Badge>
            </div>

            {caseState === "HUMAN_REVIEWING" && (
              <>
                <Button disabled={busy} data-testid="no-change-button"
                    onClick={() => void run(async () => {
                      await transition(token, interviewId, caseKey, "REVIEWED_NO_CHANGE");
                      await refreshState(caseKey);
                    })}>
                  {t("review.markNoChange")}
                </Button>
                <Input label={t("review.editSummaryLabel")} value={editSummaryRef}
                    onChange={(e) => setEditSummaryRef(e.target.value)} data-testid="edit-input" />
                <Button disabled={busy || !editSummaryRef.trim()} data-testid="edit-button"
                    onClick={() => void run(async () => {
                      await transition(token, interviewId, caseKey, "EDIT", editSummaryRef.trim());
                      await refreshState(caseKey);
                    })}>
                  {t("review.markEdited")}
                </Button>
                <Input label={t("review.rejectRefLabel")} value={rejectRef}
                    onChange={(e) => setRejectRef(e.target.value)} data-testid="reject-input" />
                <Button disabled={busy || !rejectRef.trim()} data-testid="reject-button"
                    onClick={() => void run(async () => {
                      await transition(token, interviewId, caseKey, "REJECT", rejectRef.trim());
                      await refreshState(caseKey);
                    })}>
                  {t("review.rejectAi")}
                </Button>
              </>
            )}

            {(caseState === "HUMAN_REVIEWED_NO_CHANGE" || caseState === "HUMAN_EDITED"
                || caseState === "AI_SUGGESTION_REJECTED") && (
              <>
                <Input label={t("review.rationaleLabel")} value={rationaleRef}
                    onChange={(e) => setRationaleRef(e.target.value)} data-testid="rationale-input" />
                <Button disabled={busy || !rationaleRef.trim()} data-testid="rationale-button"
                    onClick={() => void run(async () => {
                      await transition(token, interviewId, caseKey, "RATIONALE", rationaleRef.trim());
                      await refreshState(caseKey);
                    })}>
                  {t("review.recordRationale")}
                </Button>
              </>
            )}

            {caseState === "HUMAN_RATIONALE_RECORDED" && (
              <>
                <Input label={t("review.decisionRefLabel")} value={decisionRef}
                    onChange={(e) => setDecisionRef(e.target.value)} data-testid="decision-input" />
                <Button disabled={busy || !decisionRef.trim()} data-testid="finalize-button"
                    onClick={() => void run(async () => {
                      await finalizeCase(token, interviewId, caseKey, decisionRef.trim());
                      await refreshState(caseKey);
                    })}>
                  {t("review.finalize")}
                </Button>
              </>
            )}

            {caseState === "FINALIZED" && citation && !exportReceipt && (
              <>
                <Input label={t("export.criterionLabel")} value={criterionId}
                    onChange={(e) => setCriterionId(e.target.value)} data-testid="criterion-input" />
                <Input label={t("export.jobRelLabel")} value={jobRelRef}
                    onChange={(e) => setJobRelRef(e.target.value)} data-testid="jobrel-input" />
                <Button disabled={busy || !criterionId.trim() || !jobRelRef.trim()}
                    data-testid="export-button"
                    onClick={() => void run(async () => {
                      setExportReceipt(await exportPacket(token, interviewId, caseKey,
                          citation.citationKey, criterionId.trim(), jobRelRef.trim()));
                      await refreshState(caseKey);
                    })}>
                  {t("export.create")}
                </Button>
              </>
            )}

            {exportReceipt && (
              <div data-testid="export-result" style={{ display: "grid", gap: 4 }}>
                <Badge variant="success">{t("export.done")}</Badge>
                <Text as="p" size="sm" variant="secondary">
                  {t("export.digestLabel")} <code>{exportReceipt.packetDigest.slice(0, 16)}…</code>
                  {" · "}{t("export.claimCount", { count: exportReceipt.claimCount })}
                </Text>
              </div>
            )}
          </div>
        )}

        {error && (
          <Text as="p" variant="error" role="alert" data-testid="review-error">{error}</Text>
        )}
      </div>
    </section>
  );
}
