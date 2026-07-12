package com.ats.contracts;

import com.ats.kernel.Outcome;
import java.util.List;
import java.util.regex.Pattern;

/**
 * ATS-0001 #3 AIProvider (TS mirror) — Faz 24 motoru (STT/diar/citation).
 * YASAK yüzey (ADR-0005): score/rank/fit/recommend/compare/sentiment/emotion/
 * affect/reject/autoDecision — bu interface'te HİÇBİRİ yok.
 */
public interface AIProvider {

    record TranscriptSegment(String speaker, long startMs, long endMs, String text) {}

    /**
     * Sağlayıcının RAPORLADIĞI (untrusted) model kimliği — provider-BEYANI, kripto/
     * attestation DEĞİL (ad bilinçli {@code ReportedModelIdentity}, "Attestation" değil).
     * gov1-1b: yalnız ZARF (envelope) — enforcement (resolve/matchesReported/reject)
     * gov1-1c'dedir; bu tip TEK BAŞINA hiçbir onay kararı vermez.
     *
     * <p>Her iki alan da {@code null} olabilir: sağlayıcı ilgili alanı raporlamadıysa null
     * → "raporlanmadı" açıkça temsil edilir (missing → null). Nesnenin KENDİSİ
     * {@link TranscriptResult}/{@link CitationResult} içinde non-null'dır (zarf her zaman var).
     *
     * <p>Untrusted-değer disiplini — {@code ApprovedModelSpec} doğrulama pattern'i referans
     * alındı ({@code [A-Za-z0-9._:@/-]}, ≤128, {@code ://} reddi): null-OLMAYAN bir alan bu
     * kurallara UYMAK zorundadır, aksi halde kurulum fail-closed atar (tip HİÇBİR zaman
     * bozuk/ham değer taşıyamaz — savunma-derinliği). Sağlayıcıdan gelen ham değerler
     * {@link #fromProvider} ile taşınır: geçersiz/eksik/malformed → güvenli temsil (null'a
     * indirilir), asla exception ya da ham-değer log/WORM'a yazımı.
     */
    record ReportedModelIdentity(String reportedModelId, String reportedModelVersion) {

        private static final int MAX_LEN = 128;
        private static final Pattern VALUE = Pattern.compile("[A-Za-z0-9._:@/-]{1,128}");

        public ReportedModelIdentity {
            requireValidOrNull(reportedModelId, "reportedModelId");
            requireValidOrNull(reportedModelVersion, "reportedModelVersion");
        }

        /** Sağlayıcı hiç raporlamadı: iki alan da null (açık "yok" temsili). */
        public static ReportedModelIdentity notReported() {
            return new ReportedModelIdentity(null, null);
        }

        /**
         * Untrusted sağlayıcı-raporu ham değerlerinden GÜVENLİ kimlik: her alan doğrulanır;
         * eksik/blank/≤128-dışı/allowlist-dışı/{@code ://} içeren → null'a indirilir (güvenli
         * temsil — provider result'ı DÜŞÜRMEZ; zarf-yalnız). Ham değer LOG'lanmaz/WORM'a gitmez.
         */
        public static ReportedModelIdentity fromProvider(String rawModelId, String rawModelVersion) {
            return new ReportedModelIdentity(sanitizeOrNull(rawModelId), sanitizeOrNull(rawModelVersion));
        }

        private static void requireValidOrNull(String v, String field) {
            if (v != null && !isValid(v)) {
                // ham değeri mesaja KOYMA (secret/PII sızıntı guard'ı — ApprovedModelSpec ile aynı disiplin)
                throw new IllegalArgumentException(field
                        + " geçersiz raporlanmış model kimliği (≤" + MAX_LEN
                        + " + [A-Za-z0-9._:@/-], '://' yok; fail-closed)");
            }
        }

        private static String sanitizeOrNull(String v) {
            return isValid(v) ? v : null;
        }

        private static boolean isValid(String v) {
            return v != null && VALUE.matcher(v).matches() && !v.contains("://");
        }
    }

    record TranscriptResult(String language, List<TranscriptSegment> segments,
                            ReportedModelIdentity modelIdentity) {}

    /** Üç-değerli entailment; belirsizse INSUFFICIENT (fail-closed). */
    enum Entailment { SUPPORTED, NOT_SUPPORTED, INSUFFICIENT }

    record CitationResult(String claim, List<String> sourceSegmentRefs, Entailment entailment,
                          ReportedModelIdentity modelIdentity) {}

    /**
     * STT (+ sağlayıcı sunuyorsa diarization; live-stt v0.1.0 SUNMAZ → tek-akış
     * sentinel, bkz. ATS-0017 amendment). Gate'te stub UNSUPPORTED_IN_GATE.
     */
    Outcome<TranscriptResult> transcribe(String audioRef);

    /** Claim → kaynak alıntı entailment (karar/puan DEĞİL). Gate'te UNSUPPORTED_IN_GATE. */
    Outcome<CitationResult> cite(String claim, String transcriptRef);
}
