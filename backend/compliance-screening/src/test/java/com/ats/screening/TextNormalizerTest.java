package com.ats.screening;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

/** Normalizer + orijinal-ofset eşlemesi: Türkçe katlama, diakritik strip, surrogate, tire/alt-çizgi. */
class TextNormalizerTest {

    @Test
    void turkish_dotless_and_dotted_i_fold_to_ascii_i() {
        assertEquals("yas", TextNormalizer.normalize("YAŞ").text());
        assertEquals("ii", TextNormalizer.normalize("Iı").text());   // dotless-cap I + dotless i → i i
        assertEquals("ii", TextNormalizer.normalize("İi").text());   // dotted-cap İ + i → i i
        assertEquals("isik", TextNormalizer.normalize("IŞIK").text());
    }

    @Test
    void diacritics_are_stripped() {
        assertEquals("cogus", TextNormalizer.normalize("çÖĞüş").text());
        assertEquals("dogum tarihi", TextNormalizer.normalize("Doğum Tarihi").text());
    }

    @Test
    void dash_and_underscore_become_space() {
        assertEquals("a b c", TextNormalizer.normalize("a-b_c").text());
        assertEquals("dogum tarihi", TextNormalizer.normalize("dogum-tarihi").text());
    }

    @Test
    void precomposed_diacritic_preserves_following_offset() {
        // "é!" precomposed: normalized "e!" — takip eden '!' orijinal index 1'e eşlenir.
        TextNormalizer.Normalized n = TextNormalizer.normalize("é!");
        assertEquals("e!", n.text());
        assertEquals(new TextSpan(1, 2, null), n.toOriginalSpan(1, 2, null)); // '!' orijinal [1,2)
        assertEquals(new TextSpan(0, 1, null), n.toOriginalSpan(0, 1, null)); // 'e' orijinal [0,1)
    }

    @Test
    void surrogate_pair_shifts_original_offsets_correctly() {
        // 😀 (U+1F600) = 2 UTF-16 birim. Sonraki 'A' orijinal index 2'de; normalize düzlemde index 2.
        TextNormalizer.Normalized n = TextNormalizer.normalize("😀A");
        assertEquals("😀a", n.text());
        // normalize 'a' index'i 2 (emoji 0-1) → orijinal [2,3), NORMALIZE [ .. ] değil.
        assertEquals(new TextSpan(2, 3, null), n.toOriginalSpan(2, 3, null));
    }

    @Test
    void turkish_diacritic_span_maps_to_original_precomposed_index() {
        // "kaç yaşında" — precomposed tek-char diakritikler → 1:1 uzunluk; "yaşında" [4,11)
        TextNormalizer.Normalized n = TextNormalizer.normalize("kaç yaşında");
        assertEquals("kac yasinda", n.text());
        assertEquals(new TextSpan(4, 11, null), n.toOriginalSpan(4, 11, null)); // "yaşında"
    }

    @Test
    void compatibility_decomposition_maps_ligature_span_to_single_original_char() {
        // 'ﬁ' (U+FB01) NFKD → "fi"; iki normalize-char tek orijinal char'a eşlenir.
        TextNormalizer.Normalized n = TextNormalizer.normalize("ﬁx");
        assertEquals("fix", n.text());
        assertTrue(n.text().startsWith("fi"));
        // "fi" span'i (normalize [0,2)) → orijinal tek char [0,1)
        assertEquals(new TextSpan(0, 1, null), n.toOriginalSpan(0, 2, null));
        // 'x' → orijinal [1,2)
        assertEquals(new TextSpan(1, 2, null), n.toOriginalSpan(2, 3, null));
    }
}
