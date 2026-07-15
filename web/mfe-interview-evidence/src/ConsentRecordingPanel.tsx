import { useRef, useState } from "react";
import { Badge, Button, Input, Text } from "@ats/ui/f3";
import {
  putRecordingConsent,
  RECORDING_ACCEPT,
  transcribeRecording,
  uploadRecording,
  type ConsentState,
  type IngestReceipt,
} from "./ingestApi";
import { t } from "./i18n";

type Props = {
  token: string;
  interviewId: string;
  /** Transkript üretildiğinde çağrılır — App dönen key'le transkripti yükler. */
  onTranscribed: (transcriptKey: string) => void;
};

const CONSENT_STATES: ConsentState[] = ["GRANTED", "DENIED", "WITHDRAWN"];

/** Statik i18n anahtarları (grep'lenebilir; dinamik anahtar üretimi yok). */
const STATE_LABEL_KEY: Record<ConsentState, string> = {
  GRANTED: "consent.stateGranted",
  DENIED: "consent.stateDenied",
  WITHDRAWN: "consent.stateWithdrawn",
};

/**
 * F1/F2 ürün yüzeyi: rıza kaydı + kayıt yükleme (transkriptten BAĞIMSIZ —
 * ürün akışında transcript'ten ÖNCE gelir; transkript üretimi ayrı süreçtir,
 * bu panel üretmez — dürüst sınır).
 * - subjectRef OPAK (UI "PII girmeyin" der; DSAR paneliyle aynı hijyen).
 * - state kapalı sözlük (GRANTED/DENIED/WITHDRAWN); her state'in SONUCU
 *   ekranda açık: GRANTED değilse yükleme backend'de reddedilir (fail-closed;
 *   UI bypass edemez). Idempotency-key UI'da üretilir; başarılı beyandan
 *   sonra YENİLENİR (yeni beyan = yeni kanıt; retry = aynı key).
 * - upload: Content-Type dosyadan; kapalı allowlist + boyut sınırı backend'de,
 *   UI reddi yalnız gösterir. Makbuz pointer-only (objectKey/evidenceId/seq).
 */
export function ConsentRecordingPanel({ token, interviewId, onTranscribed }: Props) {
  const [subjectRef, setSubjectRef] = useState("");
  // açık-rıza UX'i: ÖN-SEÇİLİ state YOK — kullanıcı aktif seçim yapmadan
  // beyan kaydedilemez (Codex #77 blocker-1)
  const [state, setState] = useState<ConsentState | "">("");
  const idempotencyKey = useRef<string>(crypto.randomUUID());
  const [savedState, setSavedState] = useState<ConsentState | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [receipt, setReceipt] = useState<IngestReceipt | null>(null);
  // aynı kayda ikinci transcribe İSTEĞİNİ UI'da kilitle (sunucu idempotency'si ayrı katman)
  const [transcribedKey, setTranscribedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // bağlam değişimi (interviewId) = panel state'i sıfırlanır — eski makbuz/beyan
  // yeni mülakatın sahnesinde kalamaz (slice-22 stale-context disiplini)
  const [boundInterviewId, setBoundInterviewId] = useState(interviewId);
  if (boundInterviewId !== interviewId) {
    setBoundInterviewId(interviewId);
    setSubjectRef("");
    setState("");
    setSavedState(null);
    setFile(null);
    setReceipt(null);
    setTranscribedKey(null);
    setError(null);
  }

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
      aria-label={t("consent.panelTitle")}
      data-testid="consent-recording-panel"
      style={{ marginTop: 24, borderTop: "1px solid #e5e7eb", paddingTop: 16, display: "grid", gap: 12, maxWidth: 560 }}
    >
      <Text as="h2" size="lg" weight="medium">
        {t("consent.panelTitle")}
      </Text>

      {/* Aydınlatma + bu ekranın niteliği — beyan kaydından ÖNCE görünür (K5) */}
      <div data-testid="consent-disclosure" style={{ display: "grid", gap: 4 }}>
        <Text as="h3" size="lg" weight="medium">
          {t("consent.disclosure.title")}
        </Text>
        <Text as="p" size="sm">
          {t("consent.disclosure.body")}
        </Text>
        <Text as="p" size="sm" variant="secondary">
          {t("consent.operatorNote")}
        </Text>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <Input
          label={t("consent.subjectRefLabel")}
          value={subjectRef}
          onChange={(e) => setSubjectRef(e.target.value)}
          data-testid="consent-subject-input"
        />
        <Text as="p" size="sm" variant="secondary">
          {t("consent.subjectRefHelp")}
        </Text>

        <label style={{ display: "grid", gap: 4, fontSize: 14 }}>
          {t("consent.stateLabel")}
          <select
            value={state}
            onChange={(e) => setState(e.target.value as ConsentState | "")}
            data-testid="consent-state-select"
            style={{ padding: 6, fontSize: 14 }}
          >
            <option value="" disabled>
              {t("consent.statePlaceholder")}
            </option>
            {CONSENT_STATES.map((s) => (
              <option key={s} value={s}>
                {t(STATE_LABEL_KEY[s])}
              </option>
            ))}
          </select>
        </label>
        <Text as="p" size="sm" variant="secondary" data-testid="consent-gate-note">
          {t("consent.gateNote")}
        </Text>

        <Button
          disabled={busy || !subjectRef.trim() || !state}
          data-testid="consent-save-button"
          onClick={() =>
            void run(async () => {
              if (!state) {
                return;
              }
              await putRecordingConsent(
                token, interviewId, subjectRef.trim(), state, idempotencyKey.current);
              setSavedState(state);
              // başarılı beyan mühürlendi — sıradaki beyan YENİ kanıt olsun
              idempotencyKey.current = crypto.randomUUID();
            })
          }
        >
          {t("consent.save")}
        </Button>

        {savedState && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }} data-testid="consent-saved">
            <Badge variant={savedState === "GRANTED" ? "success" : "warning"}>
              {t("consent.saved")}
            </Badge>
            <Text as="span" size="sm">
              {t(STATE_LABEL_KEY[savedState])}
            </Text>
          </div>
        )}
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <Text as="h3" size="lg" weight="medium">
          {t("upload.heading")}
        </Text>
        <label style={{ display: "grid", gap: 4, fontSize: 14 }}>
          {t("upload.fileLabel")}
          <input
            type="file"
            accept={RECORDING_ACCEPT}
            data-testid="upload-file-input"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setReceipt(null);
              setTranscribedKey(null);
            }}
          />
        </label>
        {file && (
          <Text as="p" size="sm" data-testid="upload-file-info">
            {t("upload.fileInfo", { name: file.name, bytes: file.size })}
          </Text>
        )}
        <Button
          disabled={busy || !file}
          data-testid="upload-button"
          onClick={() =>
            void run(async () => {
              if (!file) {
                return;
              }
              setReceipt(await uploadRecording(token, interviewId, file));
            })
          }
        >
          {t("upload.submit")}
        </Button>

        {receipt && (
          <div data-testid="upload-receipt" style={{ display: "grid", gap: 4 }}>
            <Badge variant="success">{t("upload.done")}</Badge>
            <Text as="p" size="sm">
              {t("upload.receiptSummary", {
                evidenceId: receipt.evidenceId,
                seq: receipt.ledgerSequence,
              })}
            </Text>
            <Text as="p" size="sm" variant="secondary" data-testid="upload-next-note">
              {t("upload.transcriptionNote")}
            </Text>
            {!transcribedKey && (
              <Button
                disabled={busy}
                data-testid="transcribe-button"
                onClick={() =>
                  void run(async () => {
                    const r = await transcribeRecording(token, interviewId, receipt.objectKey);
                    setTranscribedKey(r.transcriptKey);
                    onTranscribed(r.transcriptKey);
                  })
                }
              >
                {t("upload.transcribe")}
              </Button>
            )}
            {transcribedKey && (
              <Badge variant="success" data-testid="transcribed-badge">
                {t("upload.transcribed")}
              </Badge>
            )}
          </div>
        )}
      </div>

      {error && (
        <Text as="p" variant="error" role="alert" data-testid="ingest-error">
          {error}
        </Text>
      )}
    </section>
  );
}
