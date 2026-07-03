import { useEffect, useState } from "react";
import { Badge, Button, Input, Text } from "@ats/ui/f3";
import { fetchTranscript, type TranscriptDto } from "./api";
import { ConsentRecordingPanel } from "./ConsentRecordingPanel";
import { DsarPanel } from "./DsarPanel";
import type { ErasureReceipt } from "./dsarApi";
import { ReviewWorkspace } from "./ReviewWorkspace";
import { SegmentView } from "./SegmentView";
import { t } from "./i18n";
import { handleCallback, oidcConfigFromEnv, startLogin } from "./oidc";

const OIDC = oidcConfigFromEnv();

/**
 * F3 segment-view uygulaması (P1 dev yüzeyi).
 * Kimlik: OIDC Authorization-Code+PKCE (VITE_OIDC_ISSUER set ise) — token
 * YALNIZ bellekte; config yoksa dev-paste fallback görünür (yalnız lokal).
 * tenant/actor JWT içindedir — UI taşır, asla üretmez/değiştirmez.
 */
export default function App() {
  const [token, setToken] = useState("");
  const [interviewId, setInterviewId] = useState("");
  const [transcriptKey, setTranscriptKey] = useState("");
  const [transcript, setTranscript] = useState<TranscriptDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [erasedReceipt, setErasedReceipt] = useState<ErasureReceipt | null>(null);

  // OIDC callback: sayfa code+state ile döndüyse token'ı değiş (yalnız bellekte tut)
  useEffect(() => {
    if (!OIDC) {
      return;
    }
    handleCallback(OIDC)
        .then((r) => {
          if (r) {
            setToken(r.accessToken);
          }
        })
        .catch((e) => setError(e instanceof Error ? e.message : t("error.generic")));
  }, []);

  async function onLoad() {
    setLoading(true);
    setError(null);
    setTranscript(null);
    setErasedReceipt(null);
    try {
      setTranscript(await fetchTranscript(token.trim(), interviewId.trim(), transcriptKey.trim()));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error.generic"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <Text as="h1" size="2xl" weight="semibold">
        {t("transcript.title")}
      </Text>
      <Text as="p" variant="secondary">
        {t("consent.aiAssistanceDisclosure")}
      </Text>

      <section
        aria-label={t("transcript.loadFormLabel")}
        style={{ display: "grid", gap: 12, margin: "20px 0", maxWidth: 560 }}
      >
        {OIDC ? (
          token ? (
            <Text as="p" data-testid="auth-status">{t("auth.loggedIn")}</Text>
          ) : (
            <Button onClick={() => void startLogin(OIDC)} data-testid="login-button">
              {t("auth.login")}
            </Button>
          )
        ) : (
          <Input
            label={t("transcript.tokenLabel")}
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            data-testid="token-input"
          />
        )}
        <Input
          label={t("transcript.interviewIdLabel")}
          value={interviewId}
          onChange={(e) => setInterviewId(e.target.value)}
          data-testid="interview-input"
        />
        <Input
          label={t("transcript.keyLabel")}
          value={transcriptKey}
          onChange={(e) => setTranscriptKey(e.target.value)}
          data-testid="key-input"
        />
        <Button
          onClick={onLoad}
          disabled={loading || !token || !interviewId || !transcriptKey}
          data-testid="load-button"
        >
          {loading ? t("common.loading") : t("transcript.loadButton")}
        </Button>
      </section>

      {error && (
        <Text as="p" variant="error" data-testid="error-text" role="alert">
          {error}
        </Text>
      )}

      {token && interviewId.trim() && (
        <ConsentRecordingPanel token={token} interviewId={interviewId.trim()} />
      )}

      {erasedReceipt && (
        <div data-testid="erased-info" style={{ display: "grid", gap: 4, margin: "12px 0" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Badge variant="success">{t("dsar.eraseDone")}</Badge>
            <Text as="span" size="sm">{erasedReceipt.dsarKey}</Text>
          </div>
          <Text as="p" variant="warning" role="status">
            {t("dsar.erasedInfo")}
          </Text>
          <Text as="p" size="sm" data-testid="dsar-receipt-summary">
            {t("dsar.receiptSummary", {
              tombstones: erasedReceipt.tombstoneCount,
              deleted: erasedReceipt.deletedContentCount,
            })}
          </Text>
          {erasedReceipt.caseTransitioned && (
            <Text as="p" size="sm" variant="secondary" data-testid="dsar-case-transitioned">
              {t("dsar.caseTransitioned")}
            </Text>
          )}
        </div>
      )}

      {transcript && (
        <section aria-label={t("transcript.title")} data-testid="transcript-section">
          <Text as="h2" size="lg" weight="medium">
            {t("transcript.segmentsHeading", { count: transcript.segments.length })}
          </Text>
          <SegmentView segments={transcript.segments} />
          <ReviewWorkspace token={token} interviewId={interviewId.trim()}
              transcriptKey={transcriptKey.trim()} />
          <DsarPanel
            token={token}
            interviewId={interviewId.trim()}
            transcriptKey={transcriptKey.trim()}
            onErased={(receipt) => {
              // dürüst state: içerik silindi — segment/inceleme yüzeyi kaldırılır
              setTranscript(null);
              setErasedReceipt(receipt);
            }}
          />
        </section>
      )}
    </main>
  );
}
