import { useEffect, useState } from "react";
import { Badge, Button, Input, Text } from "@ats/ui/f3";
import { fetchTranscript, listTranscripts, type TranscriptDto, type TranscriptSummary } from "./api";
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
  const [summaries, setSummaries] = useState<TranscriptSummary[] | null>(null);
  // yüklü içeriğin BAĞLAMI input'lardan AYRI tutulur: render/inceleme/DSAR daima
  // yüklendiği andaki interview+key ile çalışır — input sonradan değişse bile
  // yıkıcı aksiyon (erasure) asla "o anki input"a gitmez (Codex #78 blocker)
  const [loaded, setLoaded] = useState<{ interviewId: string; transcriptKey: string } | null>(null);

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

  async function loadByKey(key: string) {
    setLoading(true);
    setError(null);
    setTranscript(null);
    setLoaded(null);
    setErasedReceipt(null);
    const iv = interviewId.trim();
    try {
      setTranscript(await fetchTranscript(token.trim(), iv, key));
      setLoaded({ interviewId: iv, transcriptKey: key });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error.generic"));
    } finally {
      setLoading(false);
    }
  }

  async function onList() {
    setLoading(true);
    setError(null);
    setSummaries(null);
    // yeni liste = yeni bağlam: eski içerik yüzeyi ve makbuz kapanır
    setTranscript(null);
    setLoaded(null);
    setErasedReceipt(null);
    try {
      setSummaries(await listTranscripts(token.trim(), interviewId.trim()));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error.generic"));
    } finally {
      setLoading(false);
    }
  }

  /** interviewId değişimi = bağlam değişimi — içerik yüzeyi ve liste kapanır. */
  function onInterviewIdChange(value: string) {
    setInterviewId(value);
    setSummaries(null);
    setTranscript(null);
    setLoaded(null);
    setErasedReceipt(null);
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
          onChange={(e) => onInterviewIdChange(e.target.value)}
          data-testid="interview-input"
        />
        <Button
          onClick={onList}
          disabled={loading || !token || !interviewId}
          data-testid="list-button"
        >
          {loading ? t("common.loading") : t("transcript.listButton")}
        </Button>

        {summaries && summaries.length === 0 && (
          <Text as="p" variant="secondary" data-testid="transcript-list-empty">
            {t("transcript.listEmpty")}
          </Text>
        )}
        {summaries && summaries.length > 0 && (
          <ul data-testid="transcript-list" style={{ display: "grid", gap: 6, listStyle: "none", padding: 0, margin: 0 }}>
            {summaries.map((s) => (
              <li key={s.transcriptKey} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Button
                  data-testid="transcript-row"
                  onClick={() => {
                    setTranscriptKey(s.transcriptKey);
                    void loadByKey(s.transcriptKey);
                  }}
                  disabled={loading}
                >
                  {t("transcript.rowLabel", { key: s.transcriptKey, lang: s.language, count: s.segmentCount })}
                </Button>
              </li>
            ))}
          </ul>
        )}

        {/* elle anahtar girişi (geriye-uyumlu yardımcı yol; ürün akışı liste-önce) */}
        <Input
          label={t("transcript.keyLabel")}
          value={transcriptKey}
          onChange={(e) => setTranscriptKey(e.target.value)}
          data-testid="key-input"
        />
        <Button
          onClick={() => void loadByKey(transcriptKey.trim())}
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
        <ConsentRecordingPanel
          token={token}
          interviewId={interviewId.trim()}
          onTranscribed={(key) => {
            setTranscriptKey(key);
            void loadByKey(key);
          }}
        />
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
              issued: erasedReceipt.objectDeleteIssuedCount,
            })}
          </Text>
          {erasedReceipt.caseTransitioned && (
            <Text as="p" size="sm" variant="secondary" data-testid="dsar-case-transitioned">
              {t("dsar.caseTransitioned")}
            </Text>
          )}
        </div>
      )}

      {transcript && loaded && (
        <section aria-label={t("transcript.title")} data-testid="transcript-section">
          <Text as="h2" size="lg" weight="medium">
            {t("transcript.segmentsHeading", { count: transcript.segments.length })}
          </Text>
          <SegmentView segments={transcript.segments} />
          <ReviewWorkspace token={token} interviewId={loaded.interviewId}
              transcriptKey={loaded.transcriptKey} />
          <DsarPanel
            token={token}
            interviewId={loaded.interviewId}
            onErased={(receipt) => {
              // Dürüst state: server-authoritative mülakat içeriği silindi;
              // segment/inceleme yüzeyi artık stale veri göstermemeli.
              setTranscript(null);
              setLoaded(null);
              setErasedReceipt(receipt);
            }}
          />
        </section>
      )}
    </main>
  );
}
