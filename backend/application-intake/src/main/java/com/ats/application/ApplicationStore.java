package com.ats.application;

import com.ats.application.ApplicationIntakeService.Submission;
import com.ats.application.ApplicationEvaluation.Criterion;
import com.ats.application.ApplicationEvaluation.Recommendation;
import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import java.util.List;

/** Plain-domain port; tenant-resolution, atomic idempotency ve CAS persistence adapter'da zorlanır. */
public interface ApplicationStore {

    record SubmitCommand(
            TenantId publicTenantId,
            String publicHandle,
            String jobSlug,
            String publicRef,
            String candidateAccessDigest,
            String idempotencyKey,
            String requestDigest,
            Submission submission,
            String occurredAt) {}

    enum SubmitState { CREATED, REPLAYED, IDEMPOTENCY_CONFLICT }

    record SubmitResult(SubmitState state, CandidateApplication application) {}

    record CandidateStatusView(
            String publicRef,
            String jobSlug,
            String jobTitle,
            ApplicationStatus status,
            int version,
            String createdAt,
            String updatedAt,
            List<CandidateTimelineEvent> history,
            String nextAction,
            boolean withdrawalAllowed) {
        public CandidateStatusView {
            history = List.copyOf(history);
        }
    }

    /** Candidate-safe: actor, internal rationale ve değerlendirme içermez. */
    record CandidateTimelineEvent(ApplicationStatus status, String occurredAt) {}

    record ApplicationHistoryEvent(
            long eventId,
            ApplicationStatus fromStatus,
            ApplicationStatus toStatus,
            String actorRef,
            String occurredAt) {}

    /**
     * #226: aynı adayın DİĞER başvuruları. Ölçüldü — aynı e-postayla aynı ilana
     * sınırsız başvurulabiliyor ve hiçbir yerde görünmüyordu: İK iki özdeş kayıt
     * görüyor, hangisinin güncel olduğunu bilmiyor.
     *
     * <p>Bu bir POLİTİKA değil, GÖRÜNÜRLÜK. Hiçbir gönderim engellenmez;
     * engelleme/üzerine-yazma/gruplama kararı ölçüm birikmeden verilemez
     * (aday CV'sini güncelleyip yeniden başvurabilir, bu meşru).
     *
     * <p>Aday-görünür alan değildir; yalnız İK detayında yayınlanır.
     */
    record CandidateOtherApplication(
            String publicRef,
            String jobSlug,
            String jobTitle,
            ApplicationStatus status,
            String submittedAt,
            /** Aynı ilana ikinci başvuru mu — İK'nın asıl sorduğu bu. */
            boolean sameJob) {}

    record RecruiterApplicationDetail(
            CandidateApplication application,
            List<ApplicationHistoryEvent> history,
            List<ApplicationEvaluation> evaluations,
            List<CandidateOtherApplication> otherApplications) {
        public RecruiterApplicationDetail {
            history = List.copyOf(history);
            evaluations = List.copyOf(evaluations);
            otherApplications =
                    otherApplications == null ? List.of() : List.copyOf(otherApplications);
        }

        /** Girdi listesi eklenmeden yazılmış çağrı yerleri için geri uyum. */
        public RecruiterApplicationDetail(
                CandidateApplication application,
                List<ApplicationHistoryEvent> history,
                List<ApplicationEvaluation> evaluations) {
            this(application, history, evaluations, List.of());
        }
    }

    /** Inbox-only projection; CV metni, telefon, bağlantılar ve serbest not bilerek yoktur. */
    record RecruiterApplicationSummary(
            String publicRef,
            String jobSlug,
            String jobTitle,
            String fullName,
            String email,
            String city,
            List<String> skills,
            ApplicationStatus status,
            int version,
            String createdAt,
            String updatedAt) {
        public RecruiterApplicationSummary {
            skills = List.copyOf(skills);
        }
    }

    record ApplicationPage(List<RecruiterApplicationSummary> items, int page, int size, long total) {
        public ApplicationPage {
            items = List.copyOf(items);
        }
    }

    record TransitionCommand(
            TenantId tenantId,
            ActorId actorId,
            String publicRef,
            int expectedVersion,
            ApplicationStatus toStatus,
            String occurredAt) {}

    enum TransitionState { UPDATED, REPLAYED, VERSION_CONFLICT, ILLEGAL_TRANSITION, NOT_FOUND }

    record TransitionResult(TransitionState state, CandidateApplication application) {}

    record EvaluationCommand(
            TenantId tenantId,
            ActorId actorId,
            String publicRef,
            String evaluationId,
            String idempotencyKey,
            String requestDigest,
            String policyVersion,
            boolean jobRelatednessConfirmed,
            Recommendation recommendation,
            List<Criterion> criteria,
            String summary,
            String predecessorEvaluationId,
            String occurredAt) {
        public EvaluationCommand {
            criteria = List.copyOf(criteria);
        }
    }

    enum EvaluationState {
        CREATED,
        REPLAYED,
        IDEMPOTENCY_CONFLICT,
        PREDECESSOR_CONFLICT,
        APPLICATION_CLOSED,
        NOT_FOUND
    }

    record EvaluationResult(EvaluationState state, ApplicationEvaluation evaluation) {}

    Outcome<List<JobPosting>> listPublishedJobs(TenantId publicTenantId);

    Outcome<JobPosting> findPublishedJob(TenantId publicTenantId, String slug);

    /** Public handle aktif bir kariyer sitesine atomik olarak çözülür; tenant id dışarıdan alınmaz. */
    Outcome<TenantId> resolveActiveCareerTenant(String publicHandle);

    /** Application + SUBMITTED event + idempotency satırı tek DB transaction'ında. */
    Outcome<SubmitResult> submit(SubmitCommand command);

    /** Public ref + token digest birlikte zorunlu; uyuşmazlık her zaman NOT_FOUND. */
    Outcome<CandidateStatusView> findCandidateStatus(String publicRef, String candidateAccessDigest);

    /**
     * #242 D: toplu deneyim hesabı için YALNIZ deneyim girdileri. PII-minimize:
     * ad, e-posta, telefon, şehir dönmez — toplu hesap kimliği bilmek zorunda
     * değildir ve bilmemesi gerekir.
     *
     * <p>Fail-closed varsayılan: bu yeteneği uygulamayan bir store, sessizce
     * BOŞ liste dönüp "hiç deneyim yok" gibi bir sonuç üretmez.
     */
    default Outcome<java.util.List<java.util.List<ApplicationIntakeService.ExperienceEntry>>>
            experienceEntriesForCoverage(TenantId tenant) {
        return Outcome.fail(com.ats.kernel.OutcomeCode.NOT_CONFIGURED,
                "toplu deneyim hesabı bu store'da desteklenmiyor");
    }

    Outcome<ApplicationPage> listRecruiterApplications(
            TenantId tenantId, String jobSlug, ApplicationStatus status, int page, int size);

    Outcome<RecruiterApplicationDetail> findRecruiterApplication(
            TenantId tenantId, String publicRef);

    /** Tenant-scoped compare-and-set durum geçişi + append-only event tek transaction'da. */
    Outcome<TransitionResult> transition(TransitionCommand command);

    /** Opaque candidate credential + row-lock ile idempotent WITHDRAWN terminal geçişi. */
    Outcome<TransitionResult> withdrawCandidate(
            String publicRef, String candidateAccessDigest, String occurredAt);

    /** Immutable scorecard revision + idempotency kaydı tek transaction'da. */
    Outcome<EvaluationResult> submitEvaluation(EvaluationCommand command);
}
