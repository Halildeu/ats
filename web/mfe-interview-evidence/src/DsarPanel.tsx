import { useEffect, useRef, useState } from "react";
import { Badge, Button, Input, Text } from "@ats/ui/f3";
import {
  ErasureInProgressError,
  executeErasure,
  receiveDsar,
  reconcileErasure,
  type ErasureReceipt,
} from "./dsarApi";
import { t } from "./i18n";

type Props = {
  token: string;
  interviewId: string;
  onErased: (receipt: ErasureReceipt) => void;
};

/**
 * F10 DSAR/erasure paneli (P1 dev yüzeyi).
 * İki adım: (1) DSAR intake (subjectRef OPAK — UI PII girilmemesini açıkça
 * söyler; kimlik eşlemesi backend/operasyon tarafındadır), (2) erasure —
 * YIKICI ve geri alınamaz olduğundan İKİ-ADIMLI onay (ilk tık uyarıyı açar,
 * ikinci tık yürütür). Ekran silme hedefi/scope üretmez; server ilgili mülakatın
 * object, screening, transcript, citation, export, açık review ve WORM hedeflerini
 * kendi truth'undan çözer. Receipt gösterimi App'te (silme sonrası içerik yüzeyi —
 * bu panel dahil — kaldırıldığından).
 */
export function DsarPanel({ token, interviewId, onErased }: Props) {
  const [subjectRef, setSubjectRef] = useState("");
  const [reasonCode, setReasonCode] = useState("");
  const [dsarKey, setDsarKey] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    completed: number;
    total: number;
    retryAfterSeconds: number;
  } | null>(null);
  const inFlightRef = useRef(false);
  const warningRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (confirming) {
      warningRef.current?.focus();
    }
  }, [confirming]);

  useEffect(() => {
    if (!progress || progress.retryAfterSeconds <= 0) {
      return;
    }
    const timer = window.setTimeout(() => {
      setProgress((current) => current
        ? { ...current, retryAfterSeconds: Math.max(0, current.retryAfterSeconds - 1) }
        : current);
    }, 1_000);
    return () => window.clearTimeout(timer);
  }, [progress]);

  async function run(op: () => Promise<void>) {
    // React disabled render'ından önce aynı tick'te gelen çift click/Enter'ı kes.
    if (inFlightRef.current) {
      return;
    }
    inFlightRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await op();
    } catch (e) {
      setConfirming(false);
      if (e instanceof ErasureInProgressError) {
        setProgress({
          completed: e.completedStepCount,
          total: e.totalStepCount,
          retryAfterSeconds: e.retryAfterSeconds,
        });
      } else {
        setProgress(null);
        setError(e instanceof Error ? e.message : t("error.generic"));
      }
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  }

  return (
    <section
      aria-label={t("dsar.panelTitle")}
      aria-busy={busy}
      data-testid="dsar-panel"
      style={{ marginTop: 32, borderTop: "1px solid #e5e7eb", paddingTop: 16, display: "grid", gap: 12 }}
    >
      <Text as="h2" size="lg" weight="medium">
        {t("dsar.panelTitle")}
      </Text>

      {!dsarKey && (
        <div style={{ display: "grid", gap: 8, maxWidth: 560 }}>
          <Input
            label={t("dsar.subjectRefLabel")}
            value={subjectRef}
            onChange={(e) => setSubjectRef(e.target.value)}
            data-testid="dsar-subject-input"
          />
          <Text as="p" size="sm" variant="secondary">
            {t("dsar.subjectRefHelp")}
          </Text>
          <Input
            label={t("dsar.reasonCodeLabel")}
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value)}
            data-testid="dsar-reason-input"
          />
          <Button
            disabled={busy || !subjectRef.trim() || !reasonCode.trim()}
            data-testid="dsar-receive-button"
            onClick={() =>
              void run(async () => {
                const key = await receiveDsar(token, interviewId, subjectRef.trim(), reasonCode.trim());
                setDsarKey(key);
              })
            }
          >
            {t("dsar.receive")}
          </Button>
        </div>
      )}

      {dsarKey && (
        <div style={{ display: "grid", gap: 8, maxWidth: 560 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Badge variant="info" data-testid="dsar-key-badge">
              {t("dsar.requestReceived")}
            </Badge>
            <Text as="span" size="sm" data-testid="dsar-key" style={{ overflowWrap: "anywhere" }}>
              {dsarKey}
            </Text>
          </div>

          <Text as="p" size="sm" variant="secondary" data-testid="dsar-scope-note">
            {t("dsar.scopeNote")}
          </Text>
          {confirming && (
            <Text
              as="p"
              id="dsar-erase-warning"
              ref={warningRef}
              tabIndex={-1}
              variant="warning"
              role="alert"
              data-testid="dsar-erase-warning"
            >
              {t("dsar.eraseWarning")}
            </Text>
          )}
          <Button
            disabled={busy || progress !== null}
            aria-describedby={confirming ? "dsar-erase-warning" : undefined}
            data-testid="dsar-erase-button"
            onClick={() => {
              if (!confirming) {
                setProgress(null);
                setConfirming(true);
                return;
              }
              void run(async () => {
                const r = await executeErasure(token, interviewId, dsarKey);
                setConfirming(false);
                setProgress(null);
                onErased(r);
              });
            }}
          >
            {confirming ? t("dsar.eraseConfirm") : t("dsar.erase")}
          </Button>

          {progress && (
            <div
              role="status"
              aria-live="polite"
              data-testid="dsar-progress"
              style={{ display: "grid", gap: 8 }}
            >
              <Text as="p" size="sm">
                {t("dsar.inProgress", {
                  completed: progress.completed,
                  total: progress.total,
                  seconds: progress.retryAfterSeconds,
                })}
              </Text>
              <Button
                disabled={busy || progress.retryAfterSeconds > 0}
                data-testid="dsar-reconcile-button"
                onClick={() =>
                  void run(async () => {
                    const receipt = await reconcileErasure(token, interviewId, dsarKey);
                    setProgress(null);
                    onErased(receipt);
                  })
                }
              >
                {busy
                  ? t("common.loading")
                  : progress.retryAfterSeconds > 0
                    ? t("dsar.checkStatusWait", { seconds: progress.retryAfterSeconds })
                    : t("dsar.checkStatus")}
              </Button>
            </div>
          )}
        </div>
      )}

      {error && (
        <Text as="p" variant="error" role="alert" data-testid="dsar-error">
          {error}
        </Text>
      )}
    </section>
  );
}
