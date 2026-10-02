package com.ats.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.application.ApplicationStore.ApplicationPage;
import com.ats.application.ApplicationStore.CandidateStatusView;
import com.ats.application.ApplicationStore.EvaluationCommand;
import com.ats.application.ApplicationStore.EvaluationResult;
import com.ats.application.ApplicationStore.EvaluationState;
import com.ats.application.ApplicationStore.RecruiterApplicationDetail;
import com.ats.application.ApplicationStore.SubmitCommand;
import com.ats.application.ApplicationStore.SubmitResult;
import com.ats.application.ApplicationStore.SubmitState;
import com.ats.application.ApplicationStore.TransitionCommand;
import com.ats.application.ApplicationStore.TransitionResult;
import com.ats.application.ApplicationStore.TransitionState;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;

class ApplicationIntakeServiceTest {

    private static final Instant NOW = Instant.parse("2026-07-16T12:00:00Z");
    private static final String CANDIDATE_ACCESS = "A".repeat(43);

    @Test
    void policy_projection_and_versioned_receipts_do_not_relax_data_validation() {
        assertTrue(ApplicationIntakeService.noticeMatchesJob("kvkk-application-v1", "kvkk-application-v2"));
        assertFalse(ApplicationIntakeService.noticeMatchesJob("future-terms", "kvkk-application-v2"));
        assertFalse(ApplicationIntakeService.noticeMatchesJob("kvkk-application-v1", "future-terms"));
        for (boolean realAllowed : List.of(false, true)) {
            for (String version : List.of(ApplicationIntakeService.NOTICE_VERSION,
                    ApplicationIntakeService.POLICY_NOTICE_VERSION, "unknown")) {
                for (String email : List.of("candidate@example.test", "candidate@example.com")) {
                    CapturingStore store = new CapturingStore();
                    var service = new ApplicationIntakeService(store, new TenantId("test-tenant"),
                            Clock.fixed(NOW, ZoneOffset.UTC), new SecureRandom(), realAllowed);
                    assertEquals(realAllowed ? "real-allowed" : "synthetic-only",
                            service.candidateDataMode());
                    var value = new ApplicationIntakeService.Submission(
                            "Synthetic Candidate", email, "+905550000000", "Istanbul", null, null,
                            "Synthetic product experience", "Five years", "Degree", List.of("Product"),
                            null, version, NOW.toString(), NOW.toString());
                    boolean expected = !version.equals("unknown")
                            && (realAllowed || email.endsWith(".test"));
                    assertEquals(expected, service.submit("urun-yoneticisi", "idem-key-12345678",
                            CANDIDATE_ACCESS, value).isOk());
                    if (expected) assertEquals(version, store.command.submission().noticeVersion());
                    else assertEquals(null, store.command);
                }
            }
        }
    }

    @Test
    void submit_normalizes_and_never_accepts_caller_tenant_or_status() {
        CapturingStore store = new CapturingStore();
        var service = service(store);
        var out = service.submit(
                "urun-yoneticisi", "idem-key-12345678", CANDIDATE_ACCESS, submission());
        assertTrue(out.isOk());
        var receipt = out.asOptional().orElseThrow();
        assertTrue(receipt.publicRef().startsWith("app_"));
        assertEquals(CANDIDATE_ACCESS, receipt.candidateAccessToken());
        assertEquals(ApplicationStatus.SUBMITTED, receipt.status());
        assertEquals("test-tenant", store.command.publicTenantId().value());
        assertEquals(null, store.command.publicHandle());
        assertEquals("deniz@example.test", store.command.submission().email());
        assertEquals(64, store.command.candidateAccessDigest().length());
        assertFalse(store.command.candidateAccessDigest().equals(receipt.candidateAccessToken()));
    }

    /**
     * #250 (sahip şartı 4): istek özeti bugün TÜREV TEXT'i içeriyor. Modern form
     * {@code experience}/{@code education} metnini hiç göndermiyor — backend'in girdilerden
     * türettiği metin özete giriyor. Türetme 6. adımda kesilince eski formül bütün modern
     * gönderimler için aynı boş metni hash'ler. v2 özeti sürüm öneki taşır, adayın kendi
     * yazdığı ham metni ve yapısal girdileri AYRI AYRI kapsar; böylece türetme kalkınca
     * özet değişmez. Eski özet komutta yan yana durur.
     */
    @Test
    void the_request_digest_is_versioned_and_covers_the_structured_entries() {
        SubmitCommand base = capture(withEntries("Kıdemli Ürün Uzmanı", "2019-01"));
        String v2 = base.requestDigest();

        assertFalse(v2.equals(base.legacyRequestDigest()),
                "v2 formülü eski formülden ayrılmalı; aksi hâlde geçiş yapılmamış demektir");
        // Sürüm hash'in ÇIKTISINA eklenemez: şemada request_digest CHAR(64) ve
        // CHECK (request_digest ~ '^[0-9a-f]{64}$') var.
        assertTrue(v2.matches("[0-9a-f]{64}"),
                "özet şemanın 64 haneli onaltılık biçimini korumalı: " + v2);

        assertFalse(v2.equals(capture(withEntries("Ürün Uzmanı", "2019-01")).requestDigest()),
                "yalnız girdi unvanı değişse bile özet değişmeli");
        assertFalse(v2.equals(capture(withEntries("Kıdemli Ürün Uzmanı", "2020-01")).requestDigest()),
                "yalnız girdi tarihi değişse bile özet değişmeli");
        assertEquals(v2, capture(withEntries("Kıdemli Ürün Uzmanı", "2019-01")).requestDigest(),
                "aynı gövde aynı özeti vermeli");
    }

    /**
     * #250: dil ve sertifika alanları eski formülde HİÇ kapsanmıyordu — yalnız onların
     * değiştiği iki gövde aynı özeti üretiyor ve ikincisi sessizce replay sayılıyordu.
     * Özet sürümlenirken bu boşluk da kapanır.
     */
    @Test
    void the_request_digest_covers_languages_and_certifications() {
        assertFalse(capture(withLanguages("İngilizce (ileri)")).requestDigest()
                        .equals(capture(withLanguages("Almanca (orta)")).requestDigest()),
                "yalnız diller değişse bile özet değişmeli");
    }

    private static SubmitCommand capture(ApplicationIntakeService.Submission submission) {
        CapturingStore store = new CapturingStore();
        assertTrue(service(store).submit("urun-yoneticisi", "idem-key-12345678",
                CANDIDATE_ACCESS, submission).isOk(), "gönderim doğrulamadan geçmeli");
        return store.command;
    }

    /** Modern form: TEXT yok, yalnız yapısal girdi. */
    private static ApplicationIntakeService.Submission withEntries(String title, String start) {
        return modern(List.of(new ApplicationIntakeService.ExperienceEntry(
                title, "Örnek Teknoloji", start, "2023-01", false, "Sentetik")), null);
    }

    private static ApplicationIntakeService.Submission withLanguages(String languages) {
        return modern(List.of(new ApplicationIntakeService.ExperienceEntry(
                "Ürün Uzmanı", "Örnek Teknoloji", "2019-01", "2023-01", false, "Sentetik")),
                languages);
    }

    private static ApplicationIntakeService.Submission modern(
            List<ApplicationIntakeService.ExperienceEntry> experience, String languages) {
        return new ApplicationIntakeService.Submission(
                "Deniz", "deniz@example.test", "+905550000000", "İstanbul", null, null,
                "Ürün alanında deneyimli sentetik aday", null, null, List.of("Ürün"), null,
                ApplicationIntakeService.NOTICE_VERSION, NOW.toString(), NOW.toString(),
                null, null, experience,
                List.of(new ApplicationIntakeService.EducationEntry(
                        "Örnek Üniversitesi", "Lisans", "YBS", "2015", "2019", false, "")),
                languages, null, List.of());
    }

    /**
     * #250 6. adım: TEXT alanı artık TÜREV taşımaz, yalnız adayın kendi yazdığı metni.
     * Modern form bu alanı hiç göndermediği için sözleşmede boş kalır; İK'nın gördüğü
     * tek dizeli görünümü kalıcılık katmanı eski kolon uyumluluğu için türetir.
     */
    @Test
    void the_validated_submission_keeps_the_text_the_candidate_actually_wrote() {
        // Doğrulamadan geçen gövde: türev metin ARTIK buraya yazılmıyor.
        ApplicationIntakeService.Submission modern = withEntries("Kıdemli Ürün Uzmanı", "2019-01");
        assertNull(modern.experience(), "modern form metin göndermiyor");
        assertTrue(modern.effectiveExperience().contains("Kıdemli Ürün Uzmanı"),
                "tek dizeli görünüm girdilerden üretilebilmeli");

        // Depoya giden KOPYA eski kolonları besler; depo türetme yapmaz, bu yüzden
        // türevi servis katmanı taşır (#215'teki katman ayrımı korunuyor).
        SubmitCommand command = capture(modern);
        assertNotNull(command.submission().experience(),
                "eski kolonu besleyen kopya boş olmamalı");
        assertTrue(command.submission().experience().contains("Kıdemli Ürün Uzmanı"),
                "kopya girdilerden türetilmeli: " + command.submission().experience());
        assertNotNull(command.submission().education(), "eski eğitim kolonu da beslenmeli");
        assertEquals(1, command.submission().experienceEntries().size(),
                "yapısal girdi tek gerçek kaynak olarak duruyor");
    }

    /**
     * #250 6. adım: deneyim/eğitim bilgisi ZORUNLU kalır — kuralın dayanağı türev
     * metnin uzunluğu değil, yapısal girdinin varlığıdır. Eski istemci metin
     * gönderiyorsa geçiş penceresinde o da kabul edilir.
     */
    @Test
    void experience_stays_required_but_the_entries_now_carry_it() {
        assertFalse(service(new CapturingStore()).submit("urun-yoneticisi", "idem-key-12345678",
                        CANDIDATE_ACCESS, modern(List.of(), null)).isOk(),
                "ne girdi ne metin varsa başvuru kabul edilmemeli");
        assertTrue(service(new CapturingStore()).submit("urun-yoneticisi", "idem-key-12345678",
                        CANDIDATE_ACCESS, withEntries("Ürün Uzmanı", "2019-01")).isOk(),
                "girdi varken metin istenmemeli");
    }

    @Test
    void idempotency_conflict_and_stale_notice_fail_closed() {
        CapturingStore store = new CapturingStore();
        store.submitState = SubmitState.IDEMPOTENCY_CONFLICT;
        var conflict = service(store).submit(
                "urun-yoneticisi", "idem-key-12345678", CANDIDATE_ACCESS, submission());
        assertTrue(conflict instanceof Outcome.Fail<?> fail
                && fail.code() == OutcomeCode.INVALID && fail.reason().contains("IDEMPOTENCY_CONFLICT"));

        var old = new ApplicationIntakeService.Submission(
                "Deniz", "deniz@example.test", "+905550000000", "İstanbul", null, null,
                "Ürün alanında deneyimli aday", "Beş yıl deneyim", "Lisans", List.of("Ürün"), null,
                ApplicationIntakeService.NOTICE_VERSION, "2026-07-14T12:00:00Z", NOW.toString());
        assertFalse(service(new CapturingStore()).submit(
                "urun-yoneticisi", "idem-key-12345678", CANDIDATE_ACCESS, old).isOk());
    }

    @Test
    void g0_rejects_real_candidate_email_until_application_erasure_is_ready() {
        var realData = new ApplicationIntakeService.Submission(
                "Deniz", "deniz@example.com", "+905550000000", "İstanbul", null, null,
                "Ürün alanında deneyimli aday", "Beş yıl deneyim", "Lisans", List.of("Ürün"), null,
                ApplicationIntakeService.NOTICE_VERSION, NOW.toString(), NOW.toString());

        var out = service(new CapturingStore()).submit(
                "urun-yoneticisi", "idem-key-12345678", CANDIDATE_ACCESS, realData);

        assertTrue(out instanceof Outcome.Fail<?> fail
                && fail.reason().contains("yalnız sentetik .test"));
    }

    @Test
    void missing_notice_timestamp_is_validation_failure_not_server_exception() {
        var missingTimestamp = new ApplicationIntakeService.Submission(
                "Deniz", "deniz@example.test", "+905550000000", "İstanbul", null, null,
                "Ürün alanında deneyimli aday", "Beş yıl deneyim", "Lisans", List.of("Ürün"), null,
                ApplicationIntakeService.NOTICE_VERSION, null, NOW.toString());

        var out = service(new CapturingStore()).submit(
                "urun-yoneticisi", "idem-key-12345678", CANDIDATE_ACCESS, missingTimestamp);

        assertTrue(out instanceof Outcome.Fail<?> fail
                && fail.code() == OutcomeCode.INVALID
                && fail.reason().contains("noticeAcceptedAt ISO-8601"));
    }

    @Test
    void missing_accuracy_confirmation_timestamp_fails_closed() {
        var missingConfirmation = new ApplicationIntakeService.Submission(
                "Deniz", "deniz@example.test", "+905550000000", "İstanbul", null, null,
                "Ürün alanında deneyimli aday", "Beş yıl deneyim", "Lisans", List.of("Ürün"), null,
                ApplicationIntakeService.NOTICE_VERSION, NOW.toString(), null);

        var out = service(new CapturingStore()).submit(
                "urun-yoneticisi", "idem-key-12345678", CANDIDATE_ACCESS, missingConfirmation);

        assertTrue(out instanceof Outcome.Fail<?> fail
                && fail.code() == OutcomeCode.INVALID
                && fail.reason().contains("accuracyConfirmedAt ISO-8601"));
    }

    @Test
    void status_machine_allows_only_forward_human_steps() {
        assertTrue(ApplicationIntakeService.isAllowedTransition(
                ApplicationStatus.SUBMITTED, ApplicationStatus.UNDER_REVIEW));
        assertTrue(ApplicationIntakeService.isAllowedTransition(
                ApplicationStatus.UNDER_REVIEW, ApplicationStatus.INTERVIEW_PENDING));
        assertFalse(ApplicationIntakeService.isAllowedTransition(
                ApplicationStatus.INTERVIEW_PENDING, ApplicationStatus.SUBMITTED));
        assertTrue(ApplicationIntakeService.isAllowedTransition(
                ApplicationStatus.UNDER_REVIEW, ApplicationStatus.REJECTED));
        assertTrue(ApplicationIntakeService.isAllowedTransition(
                ApplicationStatus.INTERVIEW_PENDING, ApplicationStatus.WITHDRAWN));
        assertFalse(ApplicationIntakeService.isAllowedTransition(
                ApplicationStatus.REJECTED, ApplicationStatus.UNDER_REVIEW));
        assertFalse(ApplicationIntakeService.isAllowedTransition(
                ApplicationStatus.INTERVIEW_PENDING, ApplicationStatus.OFFER_PENDING),
                "teklif aşaması yalnız offer domain transaction'ıyla ilerler");
        assertFalse(ApplicationIntakeService.isAllowedTransition(
                ApplicationStatus.OFFER_ACCEPTED, ApplicationStatus.HIRED),
                "işe alım sonucu yalnız insan kontrollü offer domain komutuyla ilerler");
        assertEquals("REVIEW_OFFER",
                ApplicationIntakeService.candidateNextAction(ApplicationStatus.OFFER_PENDING));
        assertEquals("WAIT_FOR_HIRE_CONFIRMATION",
                ApplicationIntakeService.candidateNextAction(ApplicationStatus.OFFER_ACCEPTED));
        assertEquals("NONE",
                ApplicationIntakeService.candidateNextAction(ApplicationStatus.HIRED));
        assertTrue(ApplicationIntakeService.candidateWithdrawalAllowed(ApplicationStatus.SUBMITTED));
        assertTrue(ApplicationIntakeService.candidateWithdrawalAllowed(ApplicationStatus.UNDER_REVIEW));
        assertTrue(ApplicationIntakeService.candidateWithdrawalAllowed(ApplicationStatus.INTERVIEW_PENDING));
        assertFalse(ApplicationIntakeService.candidateWithdrawalAllowed(ApplicationStatus.OFFER_PENDING));
        assertFalse(ApplicationIntakeService.candidateWithdrawalAllowed(ApplicationStatus.OFFER_ACCEPTED));
        assertFalse(ApplicationIntakeService.candidateWithdrawalAllowed(ApplicationStatus.OFFER_DECLINED));
        assertFalse(ApplicationIntakeService.candidateWithdrawalAllowed(ApplicationStatus.OFFER_WITHDRAWN));
        assertFalse(ApplicationIntakeService.candidateWithdrawalAllowed(ApplicationStatus.HIRED));
        assertFalse(ApplicationIntakeService.candidateWithdrawalAllowed(ApplicationStatus.REJECTED));
        assertFalse(ApplicationIntakeService.candidateWithdrawalAllowed(ApplicationStatus.WITHDRAWN));
    }

    @Test
    void structured_human_evaluation_is_normalized_but_never_advances_status() {
        CapturingStore store = new CapturingStore();
        var submission = new ApplicationIntakeService.EvaluationSubmission(
                ApplicationIntakeService.EVALUATION_POLICY_VERSION, true,
                ApplicationEvaluation.Recommendation.ADVANCE,
                List.of(new ApplicationEvaluation.Criterion(
                        "role_clarity", " Rol netliği ", 4,
                        " Aday ürün problemi ve kullanıcı sonucunu somut örnekle açıkladı. ")),
                " İnsan değerlendirmesi tamamlandı; aşama ayrı bir eylemle değiştirilecek. ",
                null);

        Outcome<EvaluationResult> out = service(store).submitEvaluation(
                new TenantId("test-tenant"), new ActorId("recruiter-1"),
                "app_abcdefghijklmnopqrstuvwx", "eval-idem-key-1234", submission);

        assertTrue(out.isOk());
        assertNotNull(store.evaluationCommand);
        assertEquals("Rol netliği", store.evaluationCommand.criteria().getFirst().label());
        assertEquals(4, store.evaluationCommand.criteria().getFirst().rating());
        assertEquals(64, store.evaluationCommand.requestDigest().length());
        assertEquals(ApplicationIntakeService.EVALUATION_POLICY_VERSION,
                store.evaluationCommand.policyVersion());
        assertTrue(store.evaluationCommand.jobRelatednessConfirmed());
        assertTrue(store.evaluationCommand.evaluationId().startsWith("eval_"));
        assertEquals(null, store.transitionCommand,
                "evaluation submit otomatik application transition üretmemeli");
    }

    @Test
    void evaluation_rejects_duplicate_criteria_and_candidate_withdraw_is_credential_bound() {
        CapturingStore store = new CapturingStore();
        var duplicate = new ApplicationIntakeService.EvaluationSubmission(
                ApplicationIntakeService.EVALUATION_POLICY_VERSION, true,
                ApplicationEvaluation.Recommendation.HOLD,
                List.of(
                        new ApplicationEvaluation.Criterion(
                                "communication", "İletişim", 2, "İş örneği yeterince açık değildi."),
                        new ApplicationEvaluation.Criterion(
                                "communication", "İletişim", 3, "İkinci kanıt aynı anahtarı kullanıyor.")),
                "İnsan değerlendirmesi özeti yeterli uzunluktadır.", null);
        assertFalse(service(store).submitEvaluation(
                new TenantId("test-tenant"), new ActorId("recruiter-1"),
                "app_abcdefghijklmnopqrstuvwx", "eval-idem-key-1234", duplicate).isOk());

        var unconfirmed = new ApplicationIntakeService.EvaluationSubmission(
                ApplicationIntakeService.EVALUATION_POLICY_VERSION, false,
                ApplicationEvaluation.Recommendation.HOLD,
                List.of(new ApplicationEvaluation.Criterion(
                        "communication", "İletişim", 3,
                        "Değerlendirme yalnız işle ilgili kanıt içermelidir.")),
                "İş ilişkisi onayı olmadan değerlendirme kaydedilemez.", null);
        assertFalse(service(store).submitEvaluation(
                new TenantId("test-tenant"), new ActorId("recruiter-1"),
                "app_abcdefghijklmnopqrstuvwx", "eval-idem-key-5678", unconfirmed).isOk());

        service(store).withdraw("app_abcdefghijklmnopqrstuvwx", CANDIDATE_ACCESS);
        assertEquals("app_abcdefghijklmnopqrstuvwx", store.withdrawPublicRef);
        assertNotNull(store.withdrawDigest);
        assertEquals(64, store.withdrawDigest.length());
        assertFalse(store.withdrawDigest.equals(CANDIDATE_ACCESS));
    }

    @Test
    void canonical_career_handle_resolves_server_side_and_is_bound_to_submission() {
        CapturingStore store = new CapturingStore();

        var out = service(store).submit(
                "acik", "urun-yoneticisi", "idem-key-12345678",
                CANDIDATE_ACCESS, submission());

        assertTrue(out.isOk());
        assertEquals("career-tenant", store.command.publicTenantId().value());
        assertEquals("acik", store.command.publicHandle());
    }

    @Test
    void non_production_policy_accepts_real_candidate_email() {
        CapturingStore store = new CapturingStore();
        var out = serviceAllowingRealData(store).submit(
                "acik", "urun-yoneticisi", "idem-key-12345678", CANDIDATE_ACCESS,
                new ApplicationIntakeService.Submission(
                        " Deniz ", "Deniz@Sirket.COM", "+905550000000", "İstanbul", null, null,
                        "Ürün alanında deneyimli aday", "Beş yıl deneyim", "Lisans",
                        List.of("Ürün"), null, ApplicationIntakeService.NOTICE_VERSION,
                        NOW.toString(), NOW.toString()));

        assertTrue(out.isOk(),
                "test/dev ortam politikasında gerçek e-posta ile başvuru kabul edilir");
        assertEquals("deniz@sirket.com", store.command.submission().email(),
                "gerçek e-posta da normalize edilir; yalnız sentetik kısıtı kalkar");
    }

    // --- #240 B: cevapların gövde-içi şekli (ilan uyumu store'da doğrulanır) ---------------

    private static final String Q1 = "q_" + "A".repeat(16);
    private static final String Q2 = "q_" + "B".repeat(16);

    private static ApplicationIntakeService.Submission withAnswers(
            List<ApplicationIntakeService.Answer> answers) {
        var s = submission();
        return new ApplicationIntakeService.Submission(
                s.fullName(), s.email(), s.phone(), s.city(), s.linkedIn(), s.portfolio(),
                s.summary(), s.experience(), s.education(), s.skills(), s.note(),
                s.noticeVersion(), s.noticeAcceptedAt(), s.accuracyConfirmedAt(),
                s.resumeImportId(), s.resumeDraftVersion(), s.experienceEntries(),
                s.educationEntries(), s.languages(), s.certifications(), answers);
    }

    @Test
    void answers_are_validated_for_shape_only_and_carried_to_the_store() {
        CapturingStore store = new CapturingStore();
        var out = service(store).submit("urun-yoneticisi", "idem-key-12345678", CANDIDATE_ACCESS,
                withAnswers(List.of(
                        new ApplicationIntakeService.Answer(Q1, "  Uzaktan çalışabilirim ", null, null),
                        new ApplicationIntakeService.Answer(Q2, null, true, null))));
        assertTrue(out.isOk(), out instanceof Outcome.Fail<?> f ? f.reason() : "");
        var carried = store.command.submission().answers();
        assertEquals(2, carried.size());
        assertEquals("Uzaktan çalışabilirim", carried.get(0).text(), "metin trim edilir");
        assertEquals(Boolean.TRUE, carried.get(1).yes());
    }

    @Test
    void answers_reject_duplicate_question_bad_ids_and_ambiguous_values() {
        assertTrue(submitReason(withAnswers(List.of(
                new ApplicationIntakeService.Answer(Q1, "a", null, null),
                new ApplicationIntakeService.Answer(Q1, "b", null, null))))
                .contains("aynı soruya iki cevap"));
        assertTrue(submitReason(withAnswers(List.of(
                new ApplicationIntakeService.Answer("q_kisa", "a", null, null))))
                .contains("questionId biçimi"));
        assertTrue(submitReason(withAnswers(List.of(
                new ApplicationIntakeService.Answer(Q1, "a", true, null))))
                .contains("tam bir değer alanı"), "iki değer alanı birden geçersiz");
        assertTrue(submitReason(withAnswers(List.of(
                new ApplicationIntakeService.Answer(Q1, "   ", null, null))))
                .contains("tam bir değer alanı"), "boş metin cevap değildir");
        assertTrue(submitReason(withAnswers(List.of(
                new ApplicationIntakeService.Answer(Q1, null, null, "qo_x"))))
                .contains("optionId biçimi"));
        assertTrue(submitReason(withAnswers(List.of(
                new ApplicationIntakeService.Answer(Q1, "x".repeat(2001), null, null))))
                .contains("en fazla 2000"));
    }

    @Test
    void more_than_ten_answers_are_rejected() {
        List<ApplicationIntakeService.Answer> eleven = new java.util.ArrayList<>();
        for (int i = 0; i < 11; i++) {
            eleven.add(new ApplicationIntakeService.Answer(
                    "q_" + String.valueOf((char) ('A' + i)).repeat(16), "cevap", null, null));
        }
        assertTrue(submitReason(withAnswers(eleven)).contains("en fazla 10"));
    }

    @Test
    void answers_change_the_idempotency_request_digest() {
        CapturingStore plain = new CapturingStore();
        service(plain).submit("urun-yoneticisi", "idem-key-12345678", CANDIDATE_ACCESS, submission());
        CapturingStore answered = new CapturingStore();
        service(answered).submit("urun-yoneticisi", "idem-key-12345678", CANDIDATE_ACCESS,
                withAnswers(List.of(new ApplicationIntakeService.Answer(Q1, "evet", null, null))));
        assertTrue(!plain.command.requestDigest().equals(answered.command.requestDigest()),
                "aynı anahtar + farklı cevap sessizce replay olmamalı");
    }

    private static ApplicationIntakeService service(ApplicationStore store) {
        return new ApplicationIntakeService(store, new TenantId("test-tenant"),
                Clock.fixed(NOW, ZoneOffset.UTC), new SecureRandom());
    }

    /** Non-prod ortam politikası (prod'da bu bayrak makine tarafından kilitlidir). */
    private static ApplicationIntakeService serviceAllowingRealData(ApplicationStore store) {
        return new ApplicationIntakeService(store, new TenantId("test-tenant"),
                Clock.fixed(NOW, ZoneOffset.UTC), new SecureRandom(), true);
    }

    @Test
    void structured_entries_derive_the_legacy_single_string_fields() {
        // #215 genislet/daralt: yeni istemci yalniz yapisal girdi gonderir. Eski tek-string
        // alanlar backend'de ondan turetilir; boylece IK gorunumu, export ve DSAR yuzeyleri
        // ayni icerigi gormeye devam eder ve iki tarafi ayni anda deploy etmek gerekmez.
        var submission = new ApplicationIntakeService.Submission(
                "Deniz", "deniz@example.test", "+905550000000", "İstanbul", null, null,
                "Ürün alanında deneyimli aday",
                null, null, List.of("Ürün"), null,
                ApplicationIntakeService.NOTICE_VERSION, NOW.toString(), NOW.toString(),
                null, null,
                List.of(new ApplicationIntakeService.ExperienceEntry(
                        "Ürün Yöneticisi", "Örnek Teknoloji", "2022", "Devam", "Keşif ve yol haritası")),
                List.of(new ApplicationIntakeService.EducationEntry(
                        "Örnek Üniversitesi", "Lisans", "Endüstri Mühendisliği", "2016", "2020", "")),
                "Türkçe - ana dil", "ISO 45001");

        String experience = submission.effectiveExperience();
        assertTrue(experience.contains("Ürün Yöneticisi"), experience);
        assertTrue(experience.contains("Örnek Teknoloji"), experience);
        assertTrue(experience.contains("2022 - Devam"), experience);
        assertTrue(experience.contains("Keşif ve yol haritası"), experience);
        assertTrue(submission.effectiveEducation().contains("Örnek Üniversitesi"));
        assertEquals("Türkçe - ana dil", submission.languages());
    }

    @Test
    void a_legacy_string_submission_keeps_its_own_text() {
        // Eski istemci yapisal girdi gondermez; yazdigi metin AYNEN kalmali.
        var submission = submission();

        assertTrue(submission.experienceEntries().isEmpty());
        assertEquals("Beş yıl deneyim", submission.effectiveExperience());
        assertEquals("Lisans", submission.effectiveEducation());
    }

    @Test
    void blank_repeated_rows_are_dropped_before_validation() {
        // Form "satir ekle" dugmesi doldurulmamis girdi birakabilir; bos satir kaydedilmez.
        var submission = new ApplicationIntakeService.Submission(
                "Deniz", "deniz@example.test", "+905550000000", "İstanbul", null, null,
                "Ürün alanında deneyimli aday", null, "Lisans", List.of("Ürün"), null,
                ApplicationIntakeService.NOTICE_VERSION, NOW.toString(), NOW.toString(),
                null, null,
                List.of(new ApplicationIntakeService.ExperienceEntry("Ürün Yöneticisi", "", "", "", ""),
                        new ApplicationIntakeService.ExperienceEntry("", "", "", "", ""),
                        new ApplicationIntakeService.ExperienceEntry(null, null, null, null, null)),
                List.of(), null, null);

        assertEquals(1, submission.experienceEntries().size(),
                "yalniz dolu satir kalmali: " + submission.experienceEntries());
        assertEquals("Ürün Yöneticisi", submission.effectiveExperience());
    }

    // ---- #239 dilim 2: sunucu tarafı biçim pinlemesi -------------------------

    private static ApplicationIntakeService.Submission withExperience(String start, String end) {
        return new ApplicationIntakeService.Submission(
                "Deniz", "deniz@example.test", "+905550000000", "İstanbul", null, null,
                "Ürün alanında deneyimli aday", "Beş yıl deneyim", "Lisans", List.of("Ürün"), null,
                ApplicationIntakeService.NOTICE_VERSION, NOW.toString(), NOW.toString(),
                null, null,
                List.of(new ApplicationIntakeService.ExperienceEntry(
                        "Ürün Uzmanı", "Örnek Teknoloji", start, end, "Sentetik")),
                List.of(), null, null);
    }

    private static ApplicationIntakeService.Submission withEducation(String start, String end) {
        return new ApplicationIntakeService.Submission(
                "Deniz", "deniz@example.test", "+905550000000", "İstanbul", null, null,
                "Ürün alanında deneyimli aday", "Beş yıl deneyim", "Lisans", List.of("Ürün"), null,
                ApplicationIntakeService.NOTICE_VERSION, NOW.toString(), NOW.toString(),
                null, null, List.of(),
                List.of(new ApplicationIntakeService.EducationEntry(
                        "Örnek Üniversitesi", "Lisans", "YBS", start, end, "Sentetik")),
                null, null);
    }

    private static String submitReason(ApplicationIntakeService.Submission body) {
        var out = service(new CapturingStore())
                .submit("urun-yoneticisi", "idem-key-12345678", CANDIDATE_ACCESS, body);
        return out instanceof Outcome.Fail<?> fail ? fail.reason() : "";
    }

    @Test
    void server_accepts_year_only_experience_dates_because_the_parser_produces_them() {
        // CANLI KUSUR (#241): yalnız YYYY-AA kabul ediliyordu. Ama ayrıştırıcı
        // yıl-only bir CV satırından ("Ornek Sanayi AS 2019 - 2023") startDate
        // olarak "2019" üretiyor. Aday, uydurmadığı bir ayı uydurmadan
        // gönderemiyordu — tam olarak kaçınmaya çalıştığım arıza.
        assertEquals("", submitReason(withExperience("2019", "2023")));
        assertEquals("", submitReason(withExperience("2019", "")));
        // Ay hassasiyeti de geçerli; ikisi bir arada yaşayabilir (#242 (a) kararı).
        assertEquals("", submitReason(withExperience("2022-09", "2024-03")));
        // Geçersiz olan hâlâ reddedilir.
        assertTrue(submitReason(withExperience("2019-13", "")).contains("YYYY veya YYYY-AA"));
        assertTrue(submitReason(withExperience("20191", "")).contains("YYYY veya YYYY-AA"));
    }

    @Test
    void server_does_not_invent_an_order_between_two_different_precisions() {
        // "Haziran 2019'da başladı, 2019 içinde bitti" MEŞRU bir beyandır.
        // Sözlüksel kıyas bunu ters aralık sanıp reddederdi.
        assertEquals("", submitReason(withExperience("2019-06", "2019")));
        assertEquals("", submitReason(withExperience("2019", "2019-06")));
        // Aynı hassasiyette kıyas yapılmaya devam eder.
        assertTrue(submitReason(withExperience("2023-05", "2021-01")).contains("başlangıçtan önce"));
        assertTrue(submitReason(withExperience("2023", "2021")).contains("başlangıçtan önce"));
    }

    @Test
    void server_rejects_a_structured_looking_date_that_is_not_valid() {
        // İstemci doğrulaması SÖZLEŞME DEĞİL: curl ya da eski bir sekme onu atlar.
        assertTrue(submitReason(withExperience("2019-13", "")).contains("YYYY veya YYYY-AA"));
        assertTrue(submitReason(withExperience("20191", "")).contains("YYYY veya YYYY-AA"));
        assertTrue(submitReason(withEducation("201", "")).contains("YYYY"));
    }

    @Test
    void server_keeps_accepting_legacy_free_text_the_parser_can_produce() {
        // CV ayrıştırıcısı serbest metin üretebiliyor ("Eyl 2022"). Onu reddetmek
        // adayı DÜZELTEMEYECEĞİ bir 400'e kilitler; kural "yapısal GÖRÜNEN değer
        // geçerli olmalı", "her değer yapısal olmalı" değil.
        assertEquals("", submitReason(withExperience("Eyl 2022", "Halen")));
        assertEquals("", submitReason(withEducation("2016 güz", "")));
        // Yapısal ve geçerli olan da geçer.
        assertEquals("", submitReason(withExperience("2022-09", "2024-03")));
        assertEquals("", submitReason(withEducation("2016", "2020")));
    }

    @Test
    void server_rejects_a_backwards_range_and_an_implausible_year() {
        assertTrue(submitReason(withExperience("2023-05", "2021-01")).contains("başlangıçtan önce"));
        assertTrue(submitReason(withEducation("2020", "2016")).contains("başlangıçtan önce"));
        // Dört hane olmak makul olmak değildir.
        assertTrue(submitReason(withEducation("0001", "")).contains("arasında olmalı"));
        // Üst sınır servisin SAATİNDEN gelir; sabit yazılsa yıl dönümünde eskirdi.
        assertTrue(submitReason(withEducation("2999", "")).contains("arasında olmalı"));
    }

    private static ApplicationIntakeService.Submission submission() {
        return new ApplicationIntakeService.Submission(
                " Deniz ", "DENIZ@EXAMPLE.TEST", "+905550000000", "İstanbul", null, null,
                "Ürün alanında deneyimli aday", "Beş yıl deneyim", "Lisans", List.of("Ürün"), null,
                ApplicationIntakeService.NOTICE_VERSION, NOW.toString(), NOW.toString());
    }

    private static final class CapturingStore implements ApplicationStore {
        SubmitCommand command;
        TransitionCommand transitionCommand;
        EvaluationCommand evaluationCommand;
        String withdrawPublicRef;
        String withdrawDigest;
        SubmitState submitState = SubmitState.CREATED;

        @Override public Outcome<List<JobPosting>> listPublishedJobs(TenantId publicTenantId) {
            return Outcome.ok(List.of());
        }
        @Override public Outcome<JobPosting> findPublishedJob(TenantId publicTenantId, String slug) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "ilan yok");
        }
        @Override public Outcome<TenantId> resolveActiveCareerTenant(String publicHandle) {
            return "acik".equals(publicHandle)
                    ? Outcome.ok(new TenantId("career-tenant"))
                    : Outcome.fail(OutcomeCode.NOT_FOUND, "kariyer sitesi bulunamadı");
        }
        @Override public Outcome<SubmitResult> submit(SubmitCommand value) {
            command = value;
            CandidateApplication app = new CandidateApplication(new TenantId("test-tenant"), "id",
                    value.publicRef(), "job", value.jobSlug(), "Ürün Yöneticisi",
                    value.submission().fullName(), value.submission().email(), value.submission().phone(),
                    value.submission().city(), null, null, value.submission().summary(),
                    // #215 C: sahte store, gerçek store gibi TÜRETİLMİŞ metni ve yapısal
                    // girdileri birlikte yansıtır. `experience()` ham alanı okumak, aday
                    // yalnız girdi gönderdiğinde boş dönerdi ve test gerçek davranışı
                    // temsil etmezdi (gerçek store `effectiveExperience()` yazıyor).
                    value.submission().effectiveExperience(),
                    value.submission().effectiveEducation(),
                    value.submission().experienceEntries(),
                    value.submission().educationEntries(),
                    value.submission().languages(), value.submission().certifications(),
                    value.submission().skills(), null, ApplicationStatus.SUBMITTED, 0,
                    value.submission().noticeVersion(), value.submission().noticeAcceptedAt(),
                    value.submission().accuracyConfirmedAt(),
                    value.occurredAt(), value.occurredAt());
            return Outcome.ok(new SubmitResult(submitState, app));
        }
        @Override public Outcome<CandidateStatusView> findCandidateStatus(String publicRef, String digest) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "yok");
        }
        @Override public Outcome<ApplicationPage> listRecruiterApplications(
                TenantId tenantId, String jobSlug, ApplicationStatus status, int page, int size) {
            return Outcome.ok(new ApplicationPage(List.of(), page, size, 0));
        }
        @Override public Outcome<RecruiterApplicationDetail> findRecruiterApplication(
                TenantId tenantId, String publicRef) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "yok");
        }
        @Override public Outcome<TransitionResult> transition(TransitionCommand command) {
            transitionCommand = command;
            return Outcome.ok(new TransitionResult(TransitionState.NOT_FOUND, null));
        }
        @Override public Outcome<TransitionResult> withdrawCandidate(
                String publicRef, String candidateAccessDigest, String occurredAt) {
            withdrawPublicRef = publicRef;
            withdrawDigest = candidateAccessDigest;
            return Outcome.ok(new TransitionResult(TransitionState.NOT_FOUND, null));
        }
        @Override public Outcome<EvaluationResult> submitEvaluation(EvaluationCommand command) {
            evaluationCommand = command;
            ApplicationEvaluation value = new ApplicationEvaluation(
                    command.tenantId(), command.evaluationId(), command.publicRef(),
                    command.actorId().value(), command.policyVersion(),
                    command.jobRelatednessConfirmed(), command.recommendation(), command.criteria(),
                    command.summary(), command.predecessorEvaluationId(), 1, command.occurredAt());
            return Outcome.ok(new EvaluationResult(EvaluationState.CREATED, value));
        }
    }
}
