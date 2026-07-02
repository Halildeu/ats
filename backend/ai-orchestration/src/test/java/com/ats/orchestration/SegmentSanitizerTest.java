package com.ats.orchestration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.contracts.AIProvider.TranscriptSegment;
import java.util.List;
import org.junit.jupiter.api.Test;

class SegmentSanitizerTest {

    private final SegmentSanitizer sanitizer = new SegmentSanitizer();

    private List<Transcript.Segment> sanitize(String... texts) {
        List<TranscriptSegment> raw = new java.util.ArrayList<>();
        long t = 0;
        for (String s : texts) {
            raw.add(new TranscriptSegment("spk", t, t + 100, s));
            t += 100;
        }
        return sanitizer.sanitize(raw).segments();
    }

    @Test
    void strips_bracket_paren_curly_angle_and_fullwidth_blocks() {
        List<Transcript.Segment> out = sanitize(
                "Merhaba [gülüşme] nasılsınız",
                "(iç çeker) devam edelim",
                "plan {gergin} hazır",
                "sonuç <duraksama> iyi",
                "rapor （笑） tamam",
                "veri 【ünlem】 net");
        assertEquals(6, out.size());
        for (Transcript.Segment s : out) {
            assertTrue(s.text().matches("[^\\[\\](){}<>（）【】〔〕]*"), "blok anotasyon sızdı: " + s.text());
        }
        assertEquals("Merhaba nasılsınız", out.get(0).text());
    }

    @Test
    void strips_star_underscore_action_blocks_and_inline_prefixes() {
        List<Transcript.Segment> out = sanitize(
                "*gülüşme* proje bitti",
                "_iç çeker_ bütçe hazır",
                "gülerek: merhaba efendim",
                "Laughs - hello there",
                "iç çekerek: yorgunum ama buradayım");
        assertEquals(5, out.size());
        assertEquals("proje bitti", out.get(0).text());
        assertEquals("bütçe hazır", out.get(1).text());
        assertEquals("merhaba efendim", out.get(2).text());
        assertEquals("hello there", out.get(3).text());
        assertEquals("yorgunum ama buradayım", out.get(4).text());
    }

    @Test
    void strips_emoji_and_symbol_affect_markers() {
        List<Transcript.Segment> out = sanitize("Sonuç çok iyi 😂 bence ✅ tamam");
        assertEquals(1, out.size());
        assertEquals("Sonuç çok iyi bence tamam", out.get(0).text());
    }

    @Test
    void annotation_only_and_residue_segments_dropped_fail_closed() {
        List<Transcript.Segment> out = sanitize(
                "[alkış]",
                "normal cümle",
                "yarım kalmış *anotasyon işareti",
                "tek ] kalıntı");
        assertEquals(1, out.size(), "yalnız-anotasyon + kalıntılı segmentler düşmeli (fail-closed)");
        assertEquals("normal cümle", out.get(0).text());
    }

    @Test
    void speaker_keys_pseudonymized_in_first_seen_order() {
        var raw = List.of(
                new TranscriptSegment("SPEAKER_B", 0, 100, "birinci"),
                new TranscriptSegment("SPEAKER_A", 100, 200, "ikinci"),
                new TranscriptSegment("SPEAKER_B", 200, 300, "üçüncü"));
        var out = sanitizer.sanitize(raw).segments();
        assertEquals("S1", out.get(0).speakerLabel());
        assertEquals("S2", out.get(1).speakerLabel());
        assertEquals("S1", out.get(2).speakerLabel());
    }
}
