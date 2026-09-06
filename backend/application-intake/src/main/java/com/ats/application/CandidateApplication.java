package com.ats.application;

import com.ats.kernel.Ids.TenantId;
import java.util.List;

/**
 * Silinebilir kişisel-veri düzlemindeki başvuru. Bu kayıt WORM/evidence değildir;
 * retention/DSAR uygulaması içeriği ileride silebilir, durum geçmişi ayrı tabloda kalır.
 */
public record CandidateApplication(
        TenantId tenantId,
        String applicationId,
        String publicRef,
        String jobId,
        String jobSlug,
        String jobTitle,
        String fullName,
        String email,
        String phone,
        String city,
        String linkedIn,
        String portfolio,
        String summary,
        String experience,
        String education,
        /**
         * #215 C: yapısal girdiler artık OKUMA yolunda da var. Aday #215 B'den beri
         * bunları gönderiyor ve V17 kolonlarına yazılıyordu, ama hiç geri
         * okunmuyordu — İK tek parça metin görüyordu. Eski tek-string alanlar
         * KALDI: girdisiz gönderilmiş eski başvurular ve türetilmiş metne bakan
         * export/DSAR yüzeyleri bozulmasın.
         */
        List<ApplicationIntakeService.ExperienceEntry> experienceEntries,
        List<ApplicationIntakeService.EducationEntry> educationEntries,
        String languages,
        String certifications,
        List<String> skills,
        String note,
        ApplicationStatus status,
        int version,
        String noticeVersion,
        String noticeAcceptedAt,
        String accuracyConfirmedAt,
        String createdAt,
        String updatedAt,
        /**
         * #240 C: adayın ilan sorularına cevapları ve cevap ANINDAKİ soru anlık görüntüsü
         * artık okuma yolunda. B yalnız yazıyordu; İK cevabı hiç göremiyordu. Cevap
         * {@code questionId}/{@code optionId} ile bağlıdır, metinle değil; soru metni ve
         * sırası {@code questionsSnapshot}'tan okunur (İK soruyu sonradan düzenlese de aday
         * ne gördüyse o). {@code jobVersion} başvuru anındaki ilan CAS sürümüdür; V24
         * öncesi satırlarda NULL. Üçü de {@code ats_application} satırında olduğu için
         * {@code personal_data_erased_at} silmesini miras alır: silinen başvuru okuma
         * yolunda NOT_FOUND'dur, cevaba hiç ulaşılmaz.
         */
        List<ApplicationIntakeService.Answer> answers,
        Integer jobVersion,
        List<ApplicationQuestion> questionsSnapshot) {

    public CandidateApplication {
        skills = skills == null ? List.of() : List.copyOf(skills);
        experienceEntries = experienceEntries == null ? List.of() : List.copyOf(experienceEntries);
        educationEntries = educationEntries == null ? List.of() : List.copyOf(educationEntries);
        answers = answers == null ? List.of() : List.copyOf(answers);
        questionsSnapshot = questionsSnapshot == null ? List.of() : List.copyOf(questionsSnapshot);
    }

    /** Geriye uyumlu kurucu (#240 C öncesi çağrı yerleri): cevapsız, anlık görüntüsüz, sürümsüz. */
    public CandidateApplication(
            TenantId tenantId, String applicationId, String publicRef, String jobId, String jobSlug,
            String jobTitle, String fullName, String email, String phone, String city, String linkedIn,
            String portfolio, String summary, String experience, String education,
            List<ApplicationIntakeService.ExperienceEntry> experienceEntries,
            List<ApplicationIntakeService.EducationEntry> educationEntries,
            String languages, String certifications, List<String> skills, String note,
            ApplicationStatus status, int version, String noticeVersion, String noticeAcceptedAt,
            String accuracyConfirmedAt, String createdAt, String updatedAt) {
        this(tenantId, applicationId, publicRef, jobId, jobSlug, jobTitle, fullName, email, phone,
                city, linkedIn, portfolio, summary, experience, education, experienceEntries,
                educationEntries, languages, certifications, skills, note, status, version,
                noticeVersion, noticeAcceptedAt, accuracyConfirmedAt, createdAt, updatedAt,
                List.of(), null, List.of());
    }
}
