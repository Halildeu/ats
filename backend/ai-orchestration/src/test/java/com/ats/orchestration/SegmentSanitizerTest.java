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
    void metadata_style_paralinguistic_residuals_dropped_fail_closed() {
        List<Transcript.Segment> out = sanitize(
                "diarization_confidence=0.91",
                "prosody: tense",
                "tone=angry merhaba",
                "voice-stress: high",
                "pause_duration_ms=1200",
                "duraklama: 3sn",
                "stres=yüksek devam",
                "normal cümle devam ediyor");
        assertEquals(1, out.size(), "metadata-biçimli paralinguistik kalıntılar düşmeli (fail-closed)");
        assertEquals("normal cümle devam ediyor", out.get(0).text());
    }

    @Test
    void metadata_scan_does_not_false_positive_on_normal_lexical_speech() {
        List<Transcript.Segment> out = sanitize(
                "stres yönetimi konusunda deneyimliyim",
                "projede güven ilişkisi kurduk",
                "duraklama olmadan devam ettik");
        assertEquals(3, out.size(), "normal lexical konuşma (key[:=]value şekli olmadan) düşmemeli");
    }

    @Test
    void wide_unicode_annotation_wrappers_stripped() {
        List<Transcript.Segment> out = sanitize(
                "「gülüş」 merhaba",
                "《duraklama》 devam edelim",
                "«aside» konuya dönelim",
                "『笑』 rapor hazır");
        assertEquals(4, out.size());
        assertEquals("merhaba", out.get(0).text());
        assertEquals("devam edelim", out.get(1).text());
        assertEquals("konuya dönelim", out.get(2).text());
        assertEquals("rapor hazır", out.get(3).text());
    }

    @Test
    void chained_inline_prefixes_fully_removed() {
        List<Transcript.Segment> out = sanitize("laughs: sighs: hello there");
        assertEquals(1, out.size());
        assertEquals("hello there", out.get(0).text());
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
