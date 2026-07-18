package com.ats.application;

import com.ats.application.ApplicationStore.ApplicationPage;
import com.ats.application.ApplicationStore.EvaluationCommand;
import com.ats.application.ApplicationStore.EvaluationResult;
import com.ats.application.ApplicationStore.RecruiterApplicationDetail;
import com.ats.application.ApplicationStore.CandidateStatusView;
import com.ats.application.ApplicationStore.SubmitCommand;
import com.ats.application.ApplicationStore.SubmitResult;
import com.ats.application.ApplicationStore.SubmitState;
import com.ats.application.ApplicationStore.TransitionCommand;
import com.ats.application.ApplicationStore.TransitionResult;
import com.ats.application.ApplicationStore.TransitionState;
import com.ats.application.ApplicationEvaluation.Criterion;
import com.ats.application.ApplicationEvaluation.Recommendation;
import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.net.URI;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * İnsan adayın kendi başvurusunu yazdığı ürün yüzeyi. AI scoring/ranking/ret/teklif
 * veya ATS write-back içermez. Bütün tenant çözümü store'daki yayınlanmış ilandan gelir.
 */
public final class ApplicationIntakeService {
    public static final String EVALUATION_POLICY_VERSION = "structured-evaluation-v1";

    public static final String NOTICE_VERSION = "kvkk-application-v1";
    private static final Pattern IDEMPOTENCY = Pattern.compile("[A-Za-z0-9._:-]{16,128}");
    private static final Pattern PUBLIC_REF = Pattern.compile("app_[A-Za-z0-9_-]{24}");
    private static final Pattern CANDIDATE_ACCESS = Pattern.compile("[A-Za-z0-9_-]{43}");
    private static final Pattern EVALUATION_ID = Pattern.compile("eval_[A-Za-z0-9_-]{24}");
    private static final Pattern CRITERION_KEY = Pattern.compile("[a-z][a-z0-9_-]{1,63}");
    private static final Pattern PUBLIC_HANDLE = Pattern.compile("[a-z0-9]+(?:-[a-z0-9]+){0,7}");
    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");
    private static final Map<ApplicationStatus, Set<ApplicationStatus>> ALLOWED = Map.of(
            ApplicationStatus.SUBMITTED,
            Set.of(ApplicationStatus.UNDER_REVIEW, ApplicationStatus.REJECTED,
                    ApplicationStatus.WITHDRAWN),
            ApplicationStatus.UNDER_REVIEW,
            Set.of(ApplicationStatus.INTERVIEW_PENDING, ApplicationStatus.REJECTED,
                    ApplicationStatus.WITHDRAWN),
            ApplicationStatus.INTERVIEW_PENDING,
            Set.of(ApplicationStatus.REJECTED, ApplicationStatus.WITHDRAWN),
            ApplicationStatus.REJECTED, Set.of(),
            ApplicationStatus.WITHDRAWN, Set.of());

    public record Submission(
            String fullName,
            String email,
            String phone,
            String city,
            String linkedIn,
            String portfolio,
            String summary,
            String experience,
            String education,
            List<String> skills,
            String note,
            String noticeVersion,
            String noticeAcceptedAt,
            String accuracyConfirmedAt) {

        public Submission {
            skills = skills == null ? List.of() : List.copyOf(skills);
        }
    }

    public record ApplicationReceipt(
            String publicRef,
            String candidateAccessToken,
            ApplicationStatus status,
            int version,
            String submittedAt,
            boolean replayed) {}

    public record EvaluationSubmission(
            String policyVersion,
            Boolean jobRelatednessConfirmed,
            Recommendation recommendation,
            List<Criterion> criteria,
            String summary,
            String predecessorEvaluationId) {
        public EvaluationSubmission {
            criteria = criteria == null ? List.of() : List.copyOf(criteria);
        }
    }

    private final ApplicationStore store;
    private final TenantId publicTenantId;
    private final Clock clock;
    private final SecureRandom random;

    public ApplicationIntakeService(
            ApplicationStore store, TenantId publicTenantId, Clock clock, SecureRandom random) {
        if (publicTenantId == null || publicTenantId.value() == null
                || publicTenantId.value().isBlank()) {
            throw new IllegalArgumentException("publicTenantId zorunlu");
        }
        this.store = store;
        this.publicTenantId = publicTenantId;
        this.clock = clock;
        this.random = random;
    }

    public Outcome<List<JobPosting>> listPublishedJobs() {
        return store.listPublishedJobs(publicTenantId);
    }

    public Outcome<List<JobPosting>> listPublishedJobs(String publicHandle) {
        Outcome<TenantId> tenant = resolvePublicTenant(publicHandle);
        if (tenant instanceof Outcome.Fail<TenantId> fail) {
            return Outcome.fail(fail.code(), fail.reason());
        }
        return store.listPublishedJobs(((Outcome.Ok<TenantId>) tenant).value());
    }

    public Outcome<JobPosting> findPublishedJob(String slug) {
        if (!validSlug(slug)) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "ilan bulunamadı");
        }
        return store.findPublishedJob(publicTenantId, slug);
    }

    public Outcome<JobPosting> findPublishedJob(String publicHandle, String slug) {
        if (!validSlug(slug)) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "ilan bulunamadı");
        }
        Outcome<TenantId> tenant = resolvePublicTenant(publicHandle);
        if (tenant instanceof Outcome.Fail<TenantId> fail) {
            return Outcome.fail(fail.code(), fail.reason());
        }
        return store.findPublishedJob(((Outcome.Ok<TenantId>) tenant).value(), slug);
    }

    public Outcome<ApplicationReceipt> submit(
            String jobSlug, String idempotencyKey, String candidateAccessToken, Submission raw) {
        return submitForTenant(
                publicTenantId, null, jobSlug, idempotencyKey, candidateAccessToken, raw);
    }

    public Outcome<ApplicationReceipt> submit(
            String publicHandle, String jobSlug, String idempotencyKey,
            String candidateAccessToken, Submission raw) {
        Outcome<TenantId> tenant = resolvePublicTenant(publicHandle);
        if (tenant instanceof Outcome.Fail<TenantId> fail) {
            return Outcome.fail(fail.code(), fail.reason());
        }
        return submitForTenant(((Outcome.Ok<TenantId>) tenant).value(), publicHandle,
                jobSlug, idempotencyKey, candidateAccessToken, raw);
    }

    private Outcome<ApplicationReceipt> submitForTenant(
            TenantId tenantId, String publicHandle, String jobSlug, String idempotencyKey,
            String candidateAccessToken, Submission raw) {
        if (!validSlug(jobSlug)) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "ilan bulunamadı");
        }
        if (idempotencyKey == null || !IDEMPOTENCY.matcher(idempotencyKey).matches()) {
            return Outcome.fail(OutcomeCode.INVALID,
                    "X-ATS-Idempotency-Key 16..128 güvenli karakter olmalı");
        }
        if (candidateAccessToken == null || !CANDIDATE_ACCESS.matcher(candidateAccessToken).matches()) {
            return Outcome.fail(OutcomeCode.INVALID,
                    "X-ATS-Candidate-Access 256-bit base64url anahtar olmalı");
        }
        Outcome<Submission> checked = normalizeAndValidate(raw);
        if (checked instanceof Outcome.Fail<Submission> fail) {
            return Outcome.fail(fail.code(), fail.reason());
        }
        Submission submission = ((Outcome.Ok<Submission>) checked).value();
        String accessDigest = sha256Hex(candidateAccessToken);
        String publicRef = "app_" + randomUrlToken(18);
        String occurredAt = clock.instant().toString();
        SubmitCommand command = new SubmitCommand(
                tenantId,
                publicHandle,
                jobSlug,
                publicRef,
                accessDigest,
                idempotencyKey,
                requestDigest(jobSlug, accessDigest, submission),
                submission,
                occurredAt);
        Outcome<SubmitResult> stored = store.submit(command);
        if (stored instanceof Outcome.Fail<SubmitResult> fail) {
            return Outcome.fail(fail.code(), fail.reason());
        }
        SubmitResult result = ((Outcome.Ok<SubmitResult>) stored).value();
        if (result.state() == SubmitState.IDEMPOTENCY_CONFLICT) {
            return Outcome.fail(OutcomeCode.INVALID,
                    "IDEMPOTENCY_CONFLICT: aynı anahtar farklı başvuru gövdesiyle kullanılamaz");
        }
        CandidateApplication app = result.application();
        return Outcome.ok(new ApplicationReceipt(
                app.publicRef(),
                candidateAccessToken,
                app.status(), app.version(), app.createdAt(), result.state() == SubmitState.REPLAYED));
    }

    private Outcome<TenantId> resolvePublicTenant(String publicHandle) {
        if (publicHandle == null || publicHandle.length() > 120
                || !PUBLIC_HANDLE.matcher(publicHandle).matches()) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "kariyer sitesi bulunamadı");
        }
        return store.resolveActiveCareerTenant(publicHandle);
    }

    public Outcome<CandidateStatusView> candidateStatus(String publicRef, String candidateAccessToken) {
        if (publicRef == null || !PUBLIC_REF.matcher(publicRef).matches()
                || candidateAccessToken == null || !CANDIDATE_ACCESS.matcher(candidateAccessToken).matches()) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "başvuru bulunamadı");
        }
        return store.findCandidateStatus(publicRef, sha256Hex(candidateAccessToken));
    }

    public Outcome<ApplicationPage> recruiterInbox(
            TenantId tenantId, String jobSlug, String status, int page, int size) {
        if (tenantId == null || page < 0 || size < 1 || size > 50) {
            return Outcome.fail(OutcomeCode.INVALID, "page >= 0 ve size 1..50 olmalı");
        }
        if (jobSlug != null && !jobSlug.isBlank() && !validSlug(jobSlug)) {
            return Outcome.fail(OutcomeCode.INVALID, "jobSlug geçersiz");
        }
        ApplicationStatus parsed = null;
        if (status != null && !status.isBlank()) {
            try {
                parsed = ApplicationStatus.valueOf(status);
            } catch (IllegalArgumentException ex) {
                return Outcome.fail(OutcomeCode.INVALID, "status kapalı küme dışında");
            }
        }
        return store.listRecruiterApplications(
                tenantId, blankToNull(jobSlug), parsed, page, size);
    }

    public Outcome<RecruiterApplicationDetail> recruiterApplication(
            TenantId tenantId, String publicRef) {
        if (tenantId == null || publicRef == null || !PUBLIC_REF.matcher(publicRef).matches()) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "başvuru bulunamadı");
        }
        return store.findRecruiterApplication(tenantId, publicRef);
    }

    public Outcome<TransitionResult> transition(
            TenantId tenantId, ActorId actorId, String publicRef, int expectedVersion, String toStatus) {
        if (tenantId == null || actorId == null || actorId.value() == null || actorId.value().isBlank()
                || publicRef == null || !PUBLIC_REF.matcher(publicRef).matches() || expectedVersion < 0) {
            return Outcome.fail(OutcomeCode.INVALID, "tenant/actor/publicRef/expectedVersion geçersiz");
        }
        final ApplicationStatus target;
        try {
            target = ApplicationStatus.valueOf(toStatus == null ? "" : toStatus);
        } catch (IllegalArgumentException ex) {
            return Outcome.fail(OutcomeCode.INVALID, "toStatus kapalı küme dışında");
        }
        if (target == ApplicationStatus.SUBMITTED || target == ApplicationStatus.WITHDRAWN) {
            return Outcome.ok(new TransitionResult(TransitionState.ILLEGAL_TRANSITION, null));
        }
        return store.transition(new TransitionCommand(
                tenantId, actorId, publicRef, expectedVersion, target, clock.instant().toString()));
    }

    public Outcome<TransitionResult> withdraw(
            String publicRef, String candidateAccessToken) {
        if (publicRef == null || !PUBLIC_REF.matcher(publicRef).matches()
                || candidateAccessToken == null
                || !CANDIDATE_ACCESS.matcher(candidateAccessToken).matches()) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "başvuru bulunamadı");
        }
        return store.withdrawCandidate(
                publicRef, sha256Hex(candidateAccessToken), clock.instant().toString());
    }

    public Outcome<EvaluationResult> submitEvaluation(
            TenantId tenantId,
            ActorId actorId,
            String publicRef,
            String idempotencyKey,
            EvaluationSubmission raw) {
        if (tenantId == null || actorId == null || actorId.value() == null
                || actorId.value().isBlank() || actorId.value().length() > 200
                || publicRef == null || !PUBLIC_REF.matcher(publicRef).matches()) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "başvuru bulunamadı");
        }
        if (idempotencyKey == null || !IDEMPOTENCY.matcher(idempotencyKey).matches()) {
            return Outcome.fail(OutcomeCode.INVALID,
                    "X-ATS-Idempotency-Key 16..128 güvenli karakter olmalı");
        }
        Outcome<EvaluationSubmission> checked = normalizeEvaluation(raw);
        if (checked instanceof Outcome.Fail<EvaluationSubmission> fail) {
            return Outcome.fail(fail.code(), fail.reason());
        }
        EvaluationSubmission value = ((Outcome.Ok<EvaluationSubmission>) checked).value();
        String evaluationId = "eval_" + randomUrlToken(18);
        return store.submitEvaluation(new EvaluationCommand(
                tenantId,
                actorId,
                publicRef,
                evaluationId,
                idempotencyKey,
                evaluationDigest(publicRef, actorId.value(), value),
                value.policyVersion(),
                value.jobRelatednessConfirmed(),
                value.recommendation(),
                value.criteria(),
                value.summary(),
                value.predecessorEvaluationId(),
                clock.instant().toString()));
    }

    public static boolean isAllowedTransition(ApplicationStatus from, ApplicationStatus to) {
        return from != null && to != null && ALLOWED.getOrDefault(from, Set.of()).contains(to);
    }

    public static String candidateNextAction(ApplicationStatus status) {
        return switch (status) {
            case SUBMITTED, UNDER_REVIEW -> "WAIT_FOR_REVIEW";
            case INTERVIEW_PENDING -> "PREPARE_FOR_INTERVIEW";
            case REJECTED, WITHDRAWN -> "NONE";
        };
    }

    private Outcome<EvaluationSubmission> normalizeEvaluation(EvaluationSubmission raw) {
        if (raw == null || raw.recommendation() == null) {
            return Outcome.fail(OutcomeCode.INVALID, "recommendation zorunlu");
        }
        if (!EVALUATION_POLICY_VERSION.equals(trim(raw.policyVersion()))
                || !Boolean.TRUE.equals(raw.jobRelatednessConfirmed())) {
            return Outcome.fail(OutcomeCode.INVALID,
                    "güncel yapılandırılmış değerlendirme politikası ve iş-ilişkisi onayı zorunlu");
        }
        if (raw.criteria() == null || raw.criteria().isEmpty() || raw.criteria().size() > 12) {
            return Outcome.fail(OutcomeCode.INVALID, "criteria 1..12 öğe olmalı");
        }
        List<Criterion> criteria = new ArrayList<>();
        Set<String> keys = new java.util.HashSet<>();
        for (Criterion criterion : raw.criteria()) {
            if (criterion == null) {
                return Outcome.fail(OutcomeCode.INVALID, "criterion boş olamaz");
            }
            String key = trim(criterion.key());
            String label = trim(criterion.label());
            String evidence = trim(criterion.evidence());
            if (key == null || !CRITERION_KEY.matcher(key).matches() || !keys.add(key)) {
                return Outcome.fail(OutcomeCode.INVALID,
                        "criterion key benzersiz ve güvenli formatta olmalı");
            }
            if (!between(label, 2, 120) || criterion.rating() < 1 || criterion.rating() > 4
                    || !between(evidence, 10, 2000)) {
                return Outcome.fail(OutcomeCode.INVALID,
                        "criterion label 2..120, rating 1..4, evidence 10..2000 olmalı");
            }
            criteria.add(new Criterion(key, label, criterion.rating(), evidence));
        }
        String summary = trim(raw.summary());
        if (!between(summary, 10, 4000)) {
            return Outcome.fail(OutcomeCode.INVALID, "summary 10..4000 karakter olmalı");
        }
        String predecessor = trimToNull(raw.predecessorEvaluationId());
        if (predecessor != null && !EVALUATION_ID.matcher(predecessor).matches()) {
            return Outcome.fail(OutcomeCode.INVALID, "predecessorEvaluationId geçersiz");
        }
        return Outcome.ok(new EvaluationSubmission(
                EVALUATION_POLICY_VERSION, true,
                raw.recommendation(), criteria, summary, predecessor));
    }

    private Outcome<Submission> normalizeAndValidate(Submission raw) {
        if (raw == null) {
            return Outcome.fail(OutcomeCode.INVALID, "başvuru gövdesi zorunlu");
        }
        Submission value = new Submission(
                trim(raw.fullName()), lower(trim(raw.email())), trim(raw.phone()), trim(raw.city()),
                trimToNull(raw.linkedIn()), trimToNull(raw.portfolio()), trim(raw.summary()),
                trim(raw.experience()), trim(raw.education()), normalizeSkills(raw.skills()),
                trimToNull(raw.note()), trim(raw.noticeVersion()), trim(raw.noticeAcceptedAt()),
                trim(raw.accuracyConfirmedAt()));
        if (!between(value.fullName(), 2, 160)) return invalid("fullName 2..160 karakter olmalı");
        if (!between(value.email(), 3, 254) || !EMAIL.matcher(value.email()).matches())
            return invalid("email geçersiz");
        if (!value.email().endsWith(".test"))
            return invalid("G0 kilidi: yalnız sentetik .test e-posta kabul edilir");
        if (!between(value.phone(), 7, 40)) return invalid("phone 7..40 karakter olmalı");
        if (!between(value.city(), 2, 120)) return invalid("city 2..120 karakter olmalı");
        if (!validOptionalHttpUrl(value.linkedIn()) || !validOptionalHttpUrl(value.portfolio()))
            return invalid("linkedIn/portfolio yalnız http veya https olmalı");
        if (!between(value.summary(), 10, 4000)) return invalid("summary 10..4000 karakter olmalı");
        if (!between(value.experience(), 1, 8000)) return invalid("experience 1..8000 karakter olmalı");
        if (!between(value.education(), 1, 4000)) return invalid("education 1..4000 karakter olmalı");
        if (value.skills().isEmpty() || value.skills().size() > 50
                || value.skills().stream().anyMatch(s -> !between(s, 1, 80)))
            return invalid("skills 1..50 öğe, her öğe 1..80 karakter olmalı");
        if (value.note() != null && value.note().length() > 4000) return invalid("note en fazla 4000 karakter olmalı");
        if (!NOTICE_VERSION.equals(value.noticeVersion())) return invalid("noticeVersion güncel değil");
        if (value.noticeAcceptedAt() == null || value.noticeAcceptedAt().isBlank())
            return invalid("noticeAcceptedAt ISO-8601 olmalı");
        try {
            Instant accepted = Instant.parse(value.noticeAcceptedAt());
            Instant now = clock.instant();
            if (accepted.isAfter(now.plus(Duration.ofMinutes(5)))
                    || accepted.isBefore(now.minus(Duration.ofHours(24)))) {
                return invalid("noticeAcceptedAt güncel oturuma ait olmalı");
            }
        } catch (DateTimeParseException ex) {
            return invalid("noticeAcceptedAt ISO-8601 olmalı");
        }
        if (value.accuracyConfirmedAt() == null || value.accuracyConfirmedAt().isBlank())
            return invalid("accuracyConfirmedAt ISO-8601 olmalı");
        try {
            Instant confirmed = Instant.parse(value.accuracyConfirmedAt());
            Instant now = clock.instant();
            if (confirmed.isAfter(now.plus(Duration.ofMinutes(5)))
                    || confirmed.isBefore(now.minus(Duration.ofHours(24)))) {
                return invalid("accuracyConfirmedAt güncel oturuma ait olmalı");
            }
        } catch (DateTimeParseException ex) {
            return invalid("accuracyConfirmedAt ISO-8601 olmalı");
        }
        return Outcome.ok(value);
    }

    private static Outcome<Submission> invalid(String reason) {
        return Outcome.fail(OutcomeCode.INVALID, reason);
    }

    private static boolean validSlug(String value) {
        return value != null && value.matches("[a-z0-9]+(?:-[a-z0-9]+){0,15}") && value.length() <= 120;
    }

    private static boolean between(String value, int min, int max) {
        return value != null && value.length() >= min && value.length() <= max;
    }

    private static boolean validOptionalHttpUrl(String value) {
        if (value == null) return true;
        if (value.length() > 500) return false;
        try {
            URI uri = URI.create(value);
            return ("http".equals(uri.getScheme()) || "https".equals(uri.getScheme()))
                    && uri.getHost() != null;
        } catch (IllegalArgumentException ex) {
            return false;
        }
    }

    private static List<String> normalizeSkills(List<String> input) {
        if (input == null) return List.of();
        List<String> out = new ArrayList<>();
        for (String item : input) {
            String value = trim(item);
            if (value != null && !value.isEmpty() && !out.contains(value)) out.add(value);
        }
        return List.copyOf(out);
    }

    private static String requestDigest(String jobSlug, String accessDigest, Submission s) {
        List<String> parts = List.of(
                jobSlug, accessDigest, s.fullName(), s.email(), s.phone(), s.city(), nullToEmpty(s.linkedIn()),
                nullToEmpty(s.portfolio()), s.summary(), s.experience(), s.education(),
                String.join("\u001f", s.skills()), nullToEmpty(s.note()), s.noticeVersion(),
                s.noticeAcceptedAt(), s.accuracyConfirmedAt());
        MessageDigest digest = sha256();
        for (String part : parts) {
            byte[] bytes = part.getBytes(StandardCharsets.UTF_8);
            digest.update(ByteBuffer.allocate(4).putInt(bytes.length).array());
            digest.update(bytes);
        }
        return HexFormat.of().formatHex(digest.digest());
    }

    private static String evaluationDigest(
            String publicRef, String actorRef, EvaluationSubmission submission) {
        List<String> parts = new ArrayList<>();
        parts.add(publicRef);
        parts.add(actorRef);
        parts.add(submission.policyVersion());
        parts.add(Boolean.toString(submission.jobRelatednessConfirmed()));
        parts.add(submission.recommendation().name());
        parts.add(submission.summary());
        parts.add(nullToEmpty(submission.predecessorEvaluationId()));
        for (Criterion criterion : submission.criteria()) {
            parts.add(criterion.key());
            parts.add(criterion.label());
            parts.add(Integer.toString(criterion.rating()));
            parts.add(criterion.evidence());
        }
        MessageDigest digest = sha256();
        for (String part : parts) {
            byte[] bytes = part.getBytes(StandardCharsets.UTF_8);
            digest.update(ByteBuffer.allocate(4).putInt(bytes.length).array());
            digest.update(bytes);
        }
        return HexFormat.of().formatHex(digest.digest());
    }

    private String randomUrlToken(int bytes) {
        byte[] value = new byte[bytes];
        random.nextBytes(value);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
    }

    private static String sha256Hex(String value) {
        return HexFormat.of().formatHex(sha256().digest(value.getBytes(StandardCharsets.UTF_8)));
    }

    private static MessageDigest sha256() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }

    private static String trim(String value) { return value == null ? null : value.trim(); }
    private static String trimToNull(String value) { String v = trim(value); return v == null || v.isEmpty() ? null : v; }
    private static String blankToNull(String value) { return value == null || value.isBlank() ? null : value; }
    private static String lower(String value) { return value == null ? null : value.toLowerCase(Locale.ROOT); }
    private static String nullToEmpty(String value) { return value == null ? "" : value; }
}
