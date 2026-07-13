package com.ats.screening;

/**
 * ORİJİNAL girdi string'inin (Java UTF-16) yarı-açık aralığı {@code [startInclusive, endExclusive)}
 * + varsa {@code segmentIndex}. Ofset'ler NORMALIZE-string'in değil, ÇAĞIRANIN verdiği HAM
 * string'in indeksleridir (normalizer index-map ile geri eşler). {@code segmentIndex} null =
 * segment bağlamı yok (tek string tarandı).
 *
 * <p>Bilinçli olarak SALT-KONUM taşır: hiçbir score/confidence/severity alanı YOKTUR (yapısal yasak).
 */
public record TextSpan(int startInclusive, int endExclusive, Integer segmentIndex) {

    public TextSpan {
        if (startInclusive < 0) {
            throw new IllegalArgumentException("startInclusive < 0: " + startInclusive);
        }
        if (endExclusive <= startInclusive) {
            throw new IllegalArgumentException(
                    "endExclusive <= startInclusive (boş/negatif span): [" + startInclusive + "," + endExclusive + ")");
        }
        if (segmentIndex != null && segmentIndex < 0) {
            throw new IllegalArgumentException("segmentIndex < 0: " + segmentIndex);
        }
    }

    /** Segment bağlamı olmayan span (tek string tarandı). */
    public static TextSpan of(int startInclusive, int endExclusive) {
        return new TextSpan(startInclusive, endExclusive, null);
    }
}
