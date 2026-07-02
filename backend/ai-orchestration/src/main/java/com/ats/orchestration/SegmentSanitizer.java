package com.ats.orchestration;

import com.ats.contracts.AIProvider.TranscriptSegment;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * ATS-0012 `transcript_text` lexical-only SANITIZATION GATE'i + ATS-0013 takma-ad
 * normalizasyonu:
 * 1) Paralinguistik/anotasyon işaretleri (`[gülme]`, `(iç çeker)` vb. köşeli/parantez
 *    blokları) METİNDEN ÇIKARILIR — affect/voice-stress proxy'si geri sızamaz.
 * 2) Sağlayıcı konuşmacı anahtarları (spk_0, SPEAKER_A...) ilk-görülme sırasıyla
 *    S1..Sn TAKMA-ADLARINA çevrilir — sağlayıcıdan kimlik/biyometrik etiket alınmaz.
 */
public final class SegmentSanitizer {

    private static final Pattern ANNOTATION = Pattern.compile("\\[[^\\]]*\\]|\\([^)]*\\)");
    private static final Pattern WHITESPACE = Pattern.compile("\\s{2,}");

    public record Sanitized(List<Transcript.Segment> segments, int strippedAnnotationCount) {}

    public Sanitized sanitize(List<TranscriptSegment> raw) {
        Map<String, String> speakerAlias = new LinkedHashMap<>();
        List<Transcript.Segment> out = new ArrayList<>();
        int stripped = 0;
        int index = 0;
        for (TranscriptSegment seg : raw) {
            String alias = speakerAlias.computeIfAbsent(
                    seg.speaker() == null ? "?" : seg.speaker(),
                    k -> "S" + (speakerAlias.size() + 1));
            var matcher = ANNOTATION.matcher(seg.text() == null ? "" : seg.text());
            int count = 0;
            while (matcher.find()) {
                count++;
            }
            stripped += count;
            String lexical = WHITESPACE.matcher(matcher.replaceAll(" ")).replaceAll(" ").trim();
            if (lexical.isEmpty()) {
                continue; // yalnız anotasyondan oluşan segment lexical düzlemde YOK sayılır
            }
            out.add(new Transcript.Segment(index++, alias, seg.startMs(), seg.endMs(), lexical));
        }
        return new Sanitized(List.copyOf(out), stripped);
    }
}
