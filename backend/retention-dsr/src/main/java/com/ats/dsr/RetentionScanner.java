package com.ats.dsr;

import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import java.util.List;

/**
 * ATS-0018 slice-8c — retention taraması portu (data-lifecycle `retention_timer_state`).
 * Cutoff'u ÇAĞIRAN verir (tenant retention-politikası config/owner düzlemi; saat enjeksiyonu
 * bu katmanda yok — timer tetikleyicisi composition/scheduler işi). Tarayıcı yalnız
 * cutoff'tan ESKİ content-plane anahtarlarını interview-gruplu döner.
 */
public interface RetentionScanner {

    /** Süresi dolan content-plane anahtarları (yalnız SİLİNEBİLİR düzlem; WORM/state dahil değil). */
    record ExpiredContent(
            InterviewId interviewId,
            List<String> transcriptKeys,
            List<String> citationKeys,
            List<String> exportArtifactKeys) {

        public ExpiredContent {
            transcriptKeys = List.copyOf(transcriptKeys);
            citationKeys = List.copyOf(citationKeys);
            exportArtifactKeys = List.copyOf(exportArtifactKeys);
        }

        public boolean empty() {
            return transcriptKeys.isEmpty() && citationKeys.isEmpty() && exportArtifactKeys.isEmpty();
        }
    }

    Outcome<List<ExpiredContent>> scanExpired(TenantId tenantId, String cutoffIso);
}
