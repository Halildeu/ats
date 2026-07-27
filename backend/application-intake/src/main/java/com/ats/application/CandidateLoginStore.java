package com.ats.application;

import com.ats.kernel.Outcome;
import java.util.List;

/**
 * #235: e-posta + tek kullanımlık kod girişinin kalıcılık portu. Düz metin kod
 * veya oturum anahtarı bu sınırı ASLA geçmez — çağıran digest'ler, port digest
 * saklar (ats_application.candidate_access_digest sözleşmesinin aynısı).
 */
public interface CandidateLoginStore {

    /**
     * Pencere içinde bu adrese üretilmiş kod sayısı. İstek sıklığı sınırı DB'de
     * sayılır; süreç-içi sayaç replica restart'ında sıfırlanır ve mail-bombing
     * penceresini yeniden açardı.
     */
    Outcome<Integer> countChallengesSince(String emailNormalized, String sinceIso);

    /** Bu adresin (silinmemiş) en az bir başvurusu var mı — kod yalnız o zaman gönderilir. */
    Outcome<Boolean> hasApplications(String emailNormalized);

    Outcome<Void> insertChallenge(
            String emailNormalized, String codeDigest, String createdAtIso, String expiresAtIso);

    enum VerifyState {
        VERIFIED,
        /** Kod yanlış, süresi geçmiş veya hiç istenmemiş — çağırana tek tip. */
        INVALID,
        /** Deneme bütçesi tükendi; bu challenge artık doğrulanamaz. */
        LOCKED
    }

    /**
     * Atomik doğrulama: adresin EN YENİ aktif (tüketilmemiş, süresi geçmemiş)
     * challenge'ı satır kilidiyle okunur, deneme sayacı HER durumda artar,
     * digest eşleşirse tüketilir. Sayaç artışı ile karşılaştırma tek
     * transaction'da — aksi halde paralel denemeler bütçeyi aşabilir.
     */
    Outcome<VerifyState> verifyChallenge(
            String emailNormalized, String codeDigest, String nowIso, int maxAttempts);

    Outcome<Void> insertSession(
            String tokenDigest, String emailNormalized, String createdAtIso, String expiresAtIso);

    /** Süresi geçmemiş oturumun e-postasını döner; yoksa NOT_FOUND. */
    Outcome<String> findSessionEmail(String tokenDigest, String nowIso);

    /** Aday-güvenli satır: aktör, iç gerekçe, değerlendirme bilerek yok. */
    record CandidateApplicationRow(
            String publicRef,
            String jobSlug,
            String jobTitle,
            ApplicationStatus status,
            String createdAt,
            String updatedAt) {}

    /**
     * Adresin tüm (silinmemiş) başvuruları, yeniden eskiye. Eşleşme
     * lower(btrim()) normalize e-posta — #229 İK görünürlüğüyle aynı kural.
     */
    Outcome<List<CandidateApplicationRow>> listApplicationsByEmail(String emailNormalized);
}
