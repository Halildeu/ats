import { useState } from "react";
import { Badge, Button, Input, Text } from "@ats/ui/f3";
import { executeErasure, receiveDsar, type ErasureReceipt } from "./dsarApi";
import { t } from "./i18n";

type Props = {
  token: string;
  interviewId: string;
  transcriptKey: string;
  onErased: (receipt: ErasureReceipt) => void;
};

/**
 * F10 DSAR/erasure paneli (P1 dev yüzeyi).
 * İki adım: (1) DSAR intake (subjectRef OPAK — UI PII girilmemesini açıkça
 * söyler; kimlik eşlemesi backend/operasyon tarafındadır), (2) erasure —
 * YIKICI ve geri alınamaz olduğundan İKİ-ADIMLI onay (ilk tık uyarıyı açar,
 * ikinci tık yürütür). Bu ekranın silme kapsamı DÜRÜSTÇE dar: yalnız
 * görüntülenen transkript içeriği (tam-kapsam DSAR operasyonel süreçte).
 * WORM kanıt zinciri silinmez — tombstone düşülür; receipt gösterimi App'te
 * (silme sonrası içerik yüzeyi — bu panel dahil — kaldırıldığından).
 */
export function DsarPanel({ token, interviewId, transcriptKey, onErased }: Props) {
  const [subjectRef, setSubjectRef] = useState("");
  const [reasonCode, setReasonCode] = useState("");
  const [dsarKey, setDsarKey] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(op: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await op();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error.generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label={t("dsar.panelTitle")}
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
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Badge variant="info" data-testid="dsar-key-badge">
              {t("dsar.requestReceived")}
            </Badge>
            <Text as="span" size="sm" data-testid="dsar-key">
              {dsarKey}
            </Text>
          </div>

          <Text as="p" size="sm" variant="secondary" data-testid="dsar-scope-note">
            {t("dsar.scopeNote", { key: transcriptKey })}
          </Text>
          {confirming && (
            <Text as="p" variant="warning" role="alert" data-testid="dsar-erase-warning">
              {t("dsar.eraseWarning")}
            </Text>
          )}
          <Button
            disabled={busy}
            data-testid="dsar-erase-button"
            onClick={() => {
              if (!confirming) {
                setConfirming(true);
                return;
              }
              void run(async () => {
                const r = await executeErasure(token, interviewId, dsarKey, {
                  transcriptKeys: [transcriptKey],
                  citationKeys: [],
                  exportArtifactKeys: [],
                  reviewCaseKeys: [],
                  tombstoneTargetEvidenceIds: [],
                });
                setConfirming(false);
                onErased(r);
              });
            }}
          >
            {confirming ? t("dsar.eraseConfirm") : t("dsar.erase")}
          </Button>
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
