package com.ats.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
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

    private static ApplicationIntakeService service(ApplicationStore store) {
        return new ApplicationIntakeService(store, new TenantId("test-tenant"),
                Clock.fixed(NOW, ZoneOffset.UTC), new SecureRandom());
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
                    value.submission().experience(), value.submission().education(),
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
