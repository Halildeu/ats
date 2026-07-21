package com.ats.application;

import com.ats.application.ResumeImportService.ProposalDraft;
import com.ats.kernel.Outcome;
import java.util.List;

/** Untrusted PDF parser port. Implementations must not log or retain bytes/text. */
public interface ResumeDocumentParser {

    record ParseResult(
            List<ProposalDraft> proposals,
            int pageCount,
            int protectedSuppressed,
            int unsupportedOutput,
            String parserVersion) {
        public ParseResult {
            proposals = proposals == null ? List.of() : List.copyOf(proposals);
        }
    }

    Outcome<ParseResult> parse(byte[] pdfBytes, int maxPages);
}
