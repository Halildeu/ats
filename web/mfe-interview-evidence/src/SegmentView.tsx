import { Badge, Text } from "@ats/ui/f3";
import type { Segment } from "./api";
import { t } from "./i18n";

function fmtMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * F3: zaman-damgalı segment görünümü — konuşmacılar DAİMA takma-ad (S1..Sn;
 * ATS-0013 diarization sözleşmesi: sağlayıcıdan kimlik alınmaz, UI da üretmez).
 */
export function SegmentView({ segments }: { segments: Segment[] }) {
  if (segments.length === 0) {
    return <Text as="p">{t("transcript.empty")}</Text>;
  }
  return (
    <ol data-testid="segment-list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {segments.map((seg) => (
        <li
          key={seg.index}
          data-testid={`segment-${seg.index}`}
          style={{
            display: "flex",
            gap: "12px",
            alignItems: "baseline",
            padding: "8px 4px",
            borderBottom: "1px solid var(--border-muted, #E5E5E5)",
          }}
        >
          <Badge variant="default">{seg.speakerLabel}</Badge>
          <Text as="span" size="sm" variant="secondary">
            {fmtMs(seg.startMs)}–{fmtMs(seg.endMs)}
          </Text>
          <Text as="span">{seg.text}</Text>
        </li>
      ))}
    </ol>
  );
}
