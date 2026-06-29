package com.ats.contracts;

import com.ats.kernel.Outcome;
import java.util.List;

/**
 * ATS-0001 #3 AIProvider (TS mirror) — Faz 24 motoru (STT/diar/citation).
 * YASAK yüzey (ADR-0005): score/rank/fit/recommend/compare/sentiment/emotion/
 * affect/reject/autoDecision — bu interface'te HİÇBİRİ yok.
 */
public interface AIProvider {

    record TranscriptSegment(String speaker, long startMs, long endMs, String text) {}

    record TranscriptResult(String language, List<TranscriptSegment> segments) {}

    /** Üç-değerli entailment; belirsizse INSUFFICIENT (fail-closed). */
    enum Entailment { SUPPORTED, NOT_SUPPORTED, INSUFFICIENT }

    record CitationResult(String claim, List<String> sourceSegmentRefs, Entailment entailment) {}

    /** STT + diarization. Gate'te stub UNSUPPORTED_IN_GATE. */
    Outcome<TranscriptResult> transcribe(String audioRef);

    /** Claim → kaynak alıntı entailment (karar/puan DEĞİL). Gate'te UNSUPPORTED_IN_GATE. */
    Outcome<CitationResult> cite(String claim, String transcriptRef);
}
