package com.ats.orchestration;

import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import java.util.List;

/**
 * Transkript domain kaydı (CONTENT düzlemi — data-lifecycle `transcript_raw`).
 * Konuşmacı etiketleri DAİMA takma-ad S1..Sn (ATS-0013: sağlayıcıdan kimlik alınmaz);
 * metin lexical-only (ATS-0012 sanitization-gate'ten geçmiş).
 */
public record Transcript(
        TenantId tenantId,
        InterviewId interviewId,
        String sourceObjectKey,
        String language,
        List<Segment> segments) {

    public Transcript {
        segments = List.copyOf(segments);
    }

    public record Segment(int index, String speakerLabel, long startMs, long endMs, String text) {}
}
