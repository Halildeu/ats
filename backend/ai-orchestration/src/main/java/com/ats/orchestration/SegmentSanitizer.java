package com.ats.orchestration;

import com.ats.contracts.AIProvider.TranscriptSegment;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * ATS-0012 `transcript_text` lexical-only SANITIZATION GATE'i + ATS-0013 takma-ad
 * normalizasyonu (Codex 019f2168 slice-2 REVISE ile genişletildi):
 * 1) Paralinguistik anotasyon biçimleri METİNDEN ÇIKARILIR: köşeli/parantez/süslü/açılı
 *    ve tam-genişlik blokları, *yıldız* ve _alt-çizgi_ aksiyon blokları, satır-başı
 *    "gülerek:/laughs:-" tarzı inline önekler, emoji/Unicode sembol işaretleri.
 * 2) Temizlik sonrası anotasyon-benzeri KALINTI taşıyan segment (eşleşmemiş marker
 *    karakteri) FAIL-CLOSED düşürülür — affect/voice-stress proxy'si sızamaz.
 * 3) Sağlayıcı konuşmacı anahtarları ilk-görülme sırasıyla S1..Sn TAKMA-ADLARINA
 *    çevrilir — sağlayıcıdan kimlik/biyometrik etiket alınmaz.
 */
public final class SegmentSanitizer {

    // blok anotasyonlar: [..] (..) {..} <..> ve tam-genişlik/CJK varyantları
    private static final Pattern BLOCK_ANNOTATION = Pattern.compile(
            "\\[[^\\]]*\\]|\\([^)]*\\)|\\{[^}]*\\}|<[^>]*>|（[^）]*）|【[^】]*】|〔[^〕]*〕");
    // *aksiyon* / _aksiyon_ blokları
    private static final Pattern STARRED_ANNOTATION = Pattern.compile("\\*[^*]{1,80}\\*|_[^_]{1,80}_");
    // satır-başı paralinguistik önek: "gülerek: merhaba", "laughs - hello", "iç çekerek: ..."
    private static final Pattern INLINE_PREFIX = Pattern.compile(
            "^(?:g[üu]l[üu]şmeler?|g[üu]lerek|kahkaha(?:lar)?|alkış(?:lar)?|iç çek(?:er(?:ek)?|iş)|"
                    + "laughs?|laughter|sighs?|coughs?|applause|crosstalk)\\s*[:\\-–—]\\s*",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
    // emoji / sembol işaretleri (duygu-proxy'si)
    private static final Pattern EMOJI_SYMBOL = Pattern.compile(
            "[\\p{So}\\p{Sk}\\x{1F000}-\\x{1FAFF}\\x{2190}-\\x{27BF}\\x{FE00}-\\x{FE0F}\\x{200D}]");
    // temizlik sonrası anotasyon-benzeri KALINTI göstergesi (eşleşmemiş marker karakterleri)
    private static final Pattern RESIDUE_MARKER = Pattern.compile("[\\[\\](){}<>*_（）【】〔〕]");
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
            String text = seg.text() == null ? "" : seg.text();

            int before = text.length();
            text = BLOCK_ANNOTATION.matcher(text).replaceAll(" ");
            text = STARRED_ANNOTATION.matcher(text).replaceAll(" ");
            text = INLINE_PREFIX.matcher(text.strip()).replaceFirst("");
            text = EMOJI_SYMBOL.matcher(text).replaceAll("");
            if (text.length() != before) {
                stripped++;
            }

            String lexical = WHITESPACE.matcher(text).replaceAll(" ").trim();
            if (lexical.isEmpty()) {
                continue; // yalnız anotasyondan oluşan segment lexical düzlemde YOK sayılır
            }
            if (RESIDUE_MARKER.matcher(lexical).find()) {
                stripped++;
                continue; // fail-closed: anotasyon-benzeri kalıntı taşıyan segment düşer
            }
            out.add(new Transcript.Segment(index++, alias, seg.startMs(), seg.endMs(), lexical));
        }
        return new Sanitized(List.copyOf(out), stripped);
    }
}
