import { useState } from "react";
import { Button, Input, Text } from "@ats/ui/f3";
import { fetchTranscript, type TranscriptDto } from "./api";
import { SegmentView } from "./SegmentView";
import { t } from "./i18n";

/**
 * F3 segment-view uygulaması (P1 dev yüzeyi).
 * DÜRÜST SINIR: kimlik girişi dev-token yapıştırmasıyla (gerçek OIDC
 * login-flow AYRI kimlik dilimi); tenant/actor JWT içindedir — UI taşır,
 * asla üretmez/değiştirmez.
 */
export default function App() {
  const [token, setToken] = useState("");
  const [interviewId, setInterviewId] = useState("");
  const [transcriptKey, setTranscriptKey] = useState("");
  const [transcript, setTranscript] = useState<TranscriptDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onLoad() {
    setLoading(true);
    setError(null);
    setTranscript(null);
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
        <Input
          label={t("transcript.tokenLabel")}
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          data-testid="token-input"
        />
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

      {transcript && (
        <section aria-label={t("transcript.title")} data-testid="transcript-section">
          <Text as="h2" size="lg" weight="medium">
            {t("transcript.segmentsHeading", { count: transcript.segments.length })}
          </Text>
          <SegmentView segments={transcript.segments} />
        </section>
      )}
    </main>
  );
}
