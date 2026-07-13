package com.ats.screening;

import java.text.Normalizer;
import java.util.Arrays;

/**
 * Deterministik metin normalizeri + ORİJİNAL-ofset eşlemesi. Adımlar (kod-noktası bazında,
 * böylece her normalize-char'ın kaynağı bilinir):
 * <ol>
 *   <li>Unicode NFKD (uyumluluk decompozisyonu) — kod-noktası bazında ( merkezî fark: bütün
 *       string'i decompose edersek ofset kaybederiz; kod-noktası bazında decompose + strip
 *       davranış olarak eşdeğerdir çünkü tüm birleşik-işaretler zaten atılır).</li>
 *   <li>Diakritik/birleşik-işaret STRIP (NON_SPACING/COMBINING/ENCLOSING mark).</li>
 *   <li>Türkçe {@code ı/İ} → {@code i} katlaması (İ decompozisyonda I + üstü-nokta; nokta strip →
 *       I → toLowerCase → i. ı(U+0131) decompozisyonsuz → açıkça i).</li>
 *   <li>Tire/alt-çizgi (DASH/CONNECTOR punctuation) → boşluk (token ayrımı).</li>
 *   <li>Kod-noktası bazlı küçük-harf (locale-bağımsız; String.toLowerCase locale genişlemesi YOK).</li>
 * </ol>
 *
 * <p><b>KRİTİK:</b> Sonuç {@link Normalized} normalize-string'i + her normalize UTF-16 char'ı için
 * kaynak kod-noktasının ORİJİNAL {@code [start,end)} UTF-16 aralığını tutar. Böylece normalize
 * düzlemdeki bir eşleşme, ÇAĞIRANIN verdiği HAM Java-string ofsetlerine geri çevrilir. Surrogate
 * çiftleri (kod-noktası iterasyonu) ve Türkçe diakritikler için doğrulanmıştır.
 */
public final class TextNormalizer {

    private TextNormalizer() {}

    /**
     * Normalize sonucu + orijinal-ofset index-map'i. {@code origStart[k]}/{@code origEnd[k]} =
     * k'ıncı normalize UTF-16 char'ının kaynak kod-noktasının orijinal UTF-16 {@code [start,end)}
     * aralığı. Bir normalize {@code [ns,ne)} span'i → orijinal {@code [origStart[ns], origEnd[ne-1])}.
     */
    public static final class Normalized {
        private final String text;
        private final int[] origStart;
        private final int[] origEnd;
        private final int originalLength;

        Normalized(String text, int[] origStart, int[] origEnd, int originalLength) {
            this.text = text;
            this.origStart = origStart;
            this.origEnd = origEnd;
            this.originalLength = originalLength;
        }

        public String text() {
            return text;
        }

        public int originalLength() {
            return originalLength;
        }

        /** Normalize yarı-açık {@code [normStart, normEnd)} → orijinal yarı-açık {@code [start,end)}. */
        public TextSpan toOriginalSpan(int normStart, int normEnd, Integer segmentIndex) {
            if (normEnd <= normStart) {
                throw new IllegalArgumentException("boş normalize span");
            }
            return new TextSpan(origStart[normStart], origEnd[normEnd - 1], segmentIndex);
        }
    }

    public static Normalized normalize(String original) {
        int n = original.length();
        StringBuilder sb = new StringBuilder(n);
        int[] starts = new int[Math.max(16, n + 4)];
        int[] ends = new int[Math.max(16, n + 4)];
        int m = 0;
        int oi = 0;
        while (oi < n) {
            int cp = original.codePointAt(oi);
            int cc = Character.charCount(cp);
            int oEnd = oi + cc;
            String decomposed = Normalizer.normalize(new String(Character.toChars(cp)), Normalizer.Form.NFKD);
            int di = 0;
            int dlen = decomposed.length();
            while (di < dlen) {
                int dcp = decomposed.codePointAt(di);
                di += Character.charCount(dcp);
                int type = Character.getType(dcp);
                if (type == Character.NON_SPACING_MARK
                        || type == Character.COMBINING_SPACING_MARK
                        || type == Character.ENCLOSING_MARK) {
                    continue; // diakritik/birleşik-işaret strip
                }
                int folded = fold(dcp);
                for (char ch : Character.toChars(folded)) {
                    if (m >= starts.length) {
                        starts = Arrays.copyOf(starts, starts.length * 2);
                        ends = Arrays.copyOf(ends, ends.length * 2);
                    }
                    sb.append(ch);
                    starts[m] = oi;
                    ends[m] = oEnd;
                    m++;
                }
            }
            oi = oEnd;
        }
        return new Normalized(sb.toString(), Arrays.copyOf(starts, m), Arrays.copyOf(ends, m), n);
    }

    private static int fold(int cp) {
        int type = Character.getType(cp);
        if (type == Character.DASH_PUNCTUATION || type == Character.CONNECTOR_PUNCTUATION) {
            return ' '; // tire/alt-çizgi → boşluk (token sınırı)
        }
        if (cp == 0x0131) { // 'ı' dotless i → i
            return 'i';
        }
        return Character.toLowerCase(cp);
    }
}
