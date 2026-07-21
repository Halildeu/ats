package com.ats.interview;

import com.ats.interview.InterviewScorecard.Rating;
import com.ats.interview.InterviewScorecard.Recommendation;
import com.ats.interview.InterviewStore.CandidateInterviewView;
import com.ats.interview.InterviewStore.CreateCommand;
import com.ats.interview.InterviewStore.RescheduleCommand;
import com.ats.interview.InterviewStore.ScorecardCommand;
import com.ats.interview.InterviewStore.ScorecardResult;
import com.ats.interview.InterviewStore.TransitionCommand;
import com.ats.interview.InterviewStore.WorkspaceResult;
import com.ats.interview.InterviewWorkspace.Criterion;
import com.ats.interview.InterviewWorkspace.Participant;
import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Full ATS interview vertical slice. Planlama ve scorecard insan kontrollüdür;
 * aggregate score, rank, auto-advance/reject/hire üretmez.
 */
public final class InterviewWorkspaceService {
    public static final String SCORECARD_POLICY_VERSION = "structured-interview-v1";

    private static final Pattern PUBLIC_REF = Pattern.compile("app_[A-Za-z0-9_-]{24}");
    private static final Pattern INTERVIEW_ID = Pattern.compile("int_[A-Za-z0-9_-]{24}");
    private static final Pattern SCORECARD_ID = Pattern.compile("isc_[A-Za-z0-9_-]{24}");
    private static final Pattern CANDIDATE_ACCESS = Pattern.compile("[A-Za-z0-9_-]{43}");
    private static final Pattern IDEMPOTENCY = Pattern.compile("[A-Za-z0-9._:-]{16,128}");
    private static final Pattern CRITERION_KEY = Pattern.compile("[a-z][a-z0-9_-]{1,63}");
    private static final Duration MIN_DURATION = Duration.ofMinutes(15);
    private static final Duration MAX_DURATION = Duration.ofHours(8);

    private static final List<Pattern> ILLEGAL_QUESTION_PATTERNS = List.of(
            regex("kaç yaş|doğum tarihin|what is your age|date of birth|how old are you"),
            regex("evli misin|medeni durum|marital status|are you married"),
            regex("hamile|gebelik|pregnan|çocuk sahibi|çocuğun var|have children|family plans"),
            regex("dinin|mezhebin|religion|religious belief"),
            regex("etnik köken|ırkın|ethnic|racial origin"),
            regex("siyasi görüş|political view|political affiliation"),
            regex("sendika üyeli|union membership"),
            regex("engelli misin|sağlık durumun|medical condition|disabilit"),
            regex("cinsel yönelim|sexual orientation|gender identit"));

    private static final List<Pattern> UNSTRUCTURED_FIT_PATTERNS = List.of(
            regex("culture fit|kültür uyumu|kişilik puanı|personality score|vibe|genel izlenim"));

    public record ScheduleInput(
            InterviewType type,
            String startsAt,
            String endsAt,
            String timeZone,
            InterviewMode mode,
            String location,
            List<Participant> participants,
            List<Criterion> criteria) {
        public ScheduleInput {
            participants = participants == null ? List.of() : List.copyOf(participants);
            criteria = criteria == null ? List.of() : List.copyOf(criteria);
        }
    }

    public record ScorecardInput(
            String policyVersion,
            Boolean jobRelatednessConfirmed,
            Recommendation recommendation,
            List<Rating> ratings,
            String summary,
            String predecessorScorecardId) {
        public ScorecardInput {
            ratings = ratings == null ? List.of() : List.copyOf(ratings);
        }
    }

    private final InterviewStore store;
    private final Clock clock;
    private final SecureRandom random;

    public InterviewWorkspaceService(InterviewStore store, Clock clock, SecureRandom random) {
        this.store = store;
        this.clock = clock;
        this.random = random;
    }

    public Outcome<WorkspaceResult> create(
            TenantId tenantId, ActorId actorId, String publicRef,
            String idempotencyKey, ScheduleInput raw) {
        if (!validIdentity(tenantId, actorId) || !validPublicRef(publicRef)) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "başvuru bulunamadı");
        }
        if (!validIdempotency(idempotencyKey)) return invalidIdempotency();
        Outcome<ScheduleInput> checked = normalizeSchedule(raw, true);
        if (checked instanceof Outcome.Fail<ScheduleInput> fail) {
            return Outcome.fail(fail.code(), fail.reason());
        }
        ScheduleInput value = ((Outcome.Ok<ScheduleInput>) checked).value();
        String interviewId = "int_" + randomToken();
        String occurredAt = clock.instant().toString();
        return store.create(new CreateCommand(
                tenantId, actorId, publicRef, interviewId, idempotencyKey,
                scheduleDigest(publicRef, value), value.type(), value.startsAt(), value.endsAt(),
                value.timeZone(), value.mode(), value.location(), value.participants(),
                value.criteria(), occurredAt));
    }

    public Outcome<List<InterviewWorkspace>> listRecruiter(TenantId tenantId, String publicRef) {
        if (tenantId == null || !validPublicRef(publicRef)) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "başvuru bulunamadı");
        }
        return store.listRecruiter(tenantId, publicRef);
    }

    public Outcome<InterviewWorkspace> findRecruiter(
            TenantId tenantId, String publicRef, String interviewId) {
        if (tenantId == null || !validPublicRef(publicRef) || !validInterviewId(interviewId)) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "mülakat bulunamadı");
        }
        return store.findRecruiter(tenantId, publicRef, interviewId);
    }

    public Outcome<InterviewWorkspace> findAssigned(
            TenantId tenantId, ActorId actorId, String interviewId) {
        if (!validIdentity(tenantId, actorId) || !validInterviewId(interviewId)) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "mülakat bulunamadı");
        }
        return store.findAssigned(tenantId, actorId, interviewId);
    }

    public Outcome<List<CandidateInterviewView>> listCandidate(
            String publicRef, String candidateAccessToken) {
        if (!validPublicRef(publicRef) || candidateAccessToken == null
                || !CANDIDATE_ACCESS.matcher(candidateAccessToken).matches()) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "başvuru bulunamadı");
        }
        return store.listCandidate(publicRef, sha256(candidateAccessToken));
    }

    public Outcome<WorkspaceResult> reschedule(
            TenantId tenantId, ActorId actorId, String publicRef, String interviewId,
            int expectedVersion, String idempotencyKey, ScheduleInput raw, String reason) {
        if (!validIdentity(tenantId, actorId) || !validPublicRef(publicRef)
                || !validInterviewId(interviewId) || expectedVersion < 0) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "mülakat bulunamadı");
        }
        if (!validIdempotency(idempotencyKey)) return invalidIdempotency();
        Outcome<ScheduleInput> checked = normalizeSchedule(raw, false);
        if (checked instanceof Outcome.Fail<ScheduleInput> fail) {
            return Outcome.fail(fail.code(), fail.reason());
        }
        String normalizedReason = text(reason);
        if (normalizedReason.length() < 5 || normalizedReason.length() > 500) {
            return Outcome.fail(OutcomeCode.INVALID, "reason 5..500 karakter olmalı");
        }
        ScheduleInput value = ((Outcome.Ok<ScheduleInput>) checked).value();
        String digest = sha256(String.join("|", publicRef, interviewId,
                Integer.toString(expectedVersion), value.startsAt(), value.endsAt(),
                value.timeZone(), value.mode().name(), value.location(), normalizedReason));
        return store.reschedule(new RescheduleCommand(
                tenantId, actorId, publicRef, interviewId, expectedVersion,
                idempotencyKey, digest, value.startsAt(), value.endsAt(), value.timeZone(),
                value.mode(), value.location(), normalizedReason, clock.instant().toString()));
    }

    public Outcome<WorkspaceResult> transition(
            TenantId tenantId, ActorId actorId, String publicRef, String interviewId,
            int expectedVersion, String idempotencyKey, InterviewStatus target, String reason) {
        if (!validIdentity(tenantId, actorId) || !validPublicRef(publicRef)
                || !validInterviewId(interviewId) || expectedVersion < 0 || target == null
                || target == InterviewStatus.SCHEDULED) {
            return Outcome.fail(OutcomeCode.INVALID, "mülakat geçiş isteği geçersiz");
        }
        if (!validIdempotency(idempotencyKey)) return invalidIdempotency();
        String normalizedReason = text(reason);
        if (normalizedReason.length() < 5 || normalizedReason.length() > 500) {
            return Outcome.fail(OutcomeCode.INVALID, "reason 5..500 karakter olmalı");
        }
        String digest = sha256(String.join("|", publicRef, interviewId,
                Integer.toString(expectedVersion), target.name(), normalizedReason));
        return store.transition(new TransitionCommand(
                tenantId, actorId, publicRef, interviewId, expectedVersion,
                idempotencyKey, digest, target, normalizedReason, clock.instant().toString()));
    }

    public Outcome<ScorecardResult> submitScorecard(
            TenantId tenantId, ActorId actorId, String interviewId,
            String idempotencyKey, ScorecardInput raw) {
        if (!validIdentity(tenantId, actorId) || !validInterviewId(interviewId)) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "mülakat bulunamadı");
        }
        if (!validIdempotency(idempotencyKey)) return invalidIdempotencyScorecard();
        Outcome<ScorecardInput> checked = normalizeScorecard(raw);
        if (checked instanceof Outcome.Fail<ScorecardInput> fail) {
            return Outcome.fail(fail.code(), fail.reason());
        }
        ScorecardInput value = ((Outcome.Ok<ScorecardInput>) checked).value();
        String scorecardId = "isc_" + randomToken();
        String digest = scorecardDigest(interviewId, actorId.value(), value);
        return store.submitScorecard(new ScorecardCommand(
                tenantId, actorId, interviewId, scorecardId, idempotencyKey, digest,
                value.policyVersion(), true, value.recommendation(), value.ratings(),
                value.summary(), value.predecessorScorecardId(), clock.instant().toString()));
    }

    private Outcome<ScheduleInput> normalizeSchedule(ScheduleInput raw, boolean requireRubric) {
        if (raw == null || (requireRubric && raw.type() == null) || raw.mode() == null) {
            return Outcome.fail(OutcomeCode.INVALID, "type ve mode zorunlu");
        }
        Instant start;
        Instant end;
        try {
            start = Instant.parse(raw.startsAt());
            end = Instant.parse(raw.endsAt());
            ZoneId zone = ZoneId.of(text(raw.timeZone()));
            if (zone.getId().length() > 80) {
                throw new java.time.DateTimeException("timezone çok uzun");
            }
        } catch (java.time.DateTimeException ex) {
            return Outcome.fail(OutcomeCode.INVALID, "startsAt/endsAt ISO-8601 ve timeZone IANA olmalı");
        }
        Duration duration = Duration.between(start, end);
        if (duration.compareTo(MIN_DURATION) < 0 || duration.compareTo(MAX_DURATION) > 0) {
            return Outcome.fail(OutcomeCode.INVALID, "mülakat süresi 15 dakika..8 saat olmalı");
        }
        if (start.isBefore(clock.instant().minus(Duration.ofMinutes(5)))
                || start.isAfter(clock.instant().plus(Duration.ofDays(730)))) {
            return Outcome.fail(OutcomeCode.INVALID, "mülakat başlangıcı geçerli planlama penceresinde değil");
        }
        String location = text(raw.location());
        if (location.length() < 2 || location.length() > 500) {
            return Outcome.fail(OutcomeCode.INVALID, "location 2..500 karakter olmalı");
        }
        if (raw.mode() == InterviewMode.VIDEO
                && !(location.startsWith("https://") && !location.contains(" "))) {
            return Outcome.fail(OutcomeCode.INVALID, "VIDEO location güvenli https bağlantısı olmalı");
        }
        List<Participant> participants = requireRubric ? normalizeParticipants(raw.participants()) : List.of();
        if (requireRubric && participants.isEmpty()) {
            return Outcome.fail(OutcomeCode.INVALID, "participants 1..12 benzersiz kişi olmalı");
        }
        List<Criterion> criteria = requireRubric ? normalizeCriteria(raw.criteria()) : List.of();
        if (requireRubric && criteria.isEmpty()) {
            return Outcome.fail(OutcomeCode.INVALID,
                    "criteria 1..12, işle ilgili ve korunan özelliklerden bağımsız olmalı");
        }
        return Outcome.ok(new ScheduleInput(
                raw.type(), start.toString(), end.toString(), text(raw.timeZone()),
                raw.mode(), location, participants, criteria));
    }

    private static List<Participant> normalizeParticipants(List<Participant> raw) {
        if (raw == null || raw.isEmpty() || raw.size() > 12) return List.of();
        List<Participant> out = new ArrayList<>();
        Set<String> actors = new HashSet<>();
        int leads = 0;
        for (Participant item : raw) {
            if (item == null || item.role() == null) return List.of();
            String actor = text(item.actorRef());
            String label = text(item.displayLabel());
            if (actor.length() < 1 || actor.length() > 200 || label.length() < 1
                    || label.length() > 120 || !actors.add(actor)) return List.of();
            if (item.role() == InterviewWorkspace.ParticipantRole.LEAD) leads++;
            out.add(new Participant(actor, label, item.role()));
        }
        return leads == 1 ? List.copyOf(out) : List.of();
    }

    private static List<Criterion> normalizeCriteria(List<Criterion> raw) {
        if (raw == null || raw.isEmpty() || raw.size() > 12) return List.of();
        List<Criterion> out = new ArrayList<>();
        Set<String> keys = new HashSet<>();
        for (Criterion item : raw) {
            if (item == null) return List.of();
            String key = text(item.key()).toLowerCase(Locale.ROOT);
            String label = text(item.label());
            String question = text(item.question());
            String prompt = text(item.evidencePrompt());
            if (!CRITERION_KEY.matcher(key).matches() || !keys.add(key)
                    || label.length() < 2 || label.length() > 120
                    || question.length() < 10 || question.length() > 500
                    || prompt.length() < 10 || prompt.length() > 500
                    || prohibited(label + " " + question + " " + prompt)) return List.of();
            out.add(new Criterion(key, label, question, prompt));
        }
        return List.copyOf(out);
    }

    private static Outcome<ScorecardInput> normalizeScorecard(ScorecardInput raw) {
        if (raw == null || !SCORECARD_POLICY_VERSION.equals(text(raw.policyVersion()))
                || !Boolean.TRUE.equals(raw.jobRelatednessConfirmed())
                || raw.recommendation() == null || raw.ratings() == null
                || raw.ratings().isEmpty() || raw.ratings().size() > 12) {
            return Outcome.fail(OutcomeCode.INVALID,
                    "güncel structured-interview politikası, insan recommendation ve iş-ilişkisi onayı zorunlu");
        }
        Set<String> keys = new HashSet<>();
        List<Rating> ratings = new ArrayList<>();
        for (Rating rating : raw.ratings()) {
            if (rating == null) return Outcome.fail(OutcomeCode.INVALID, "rating boş olamaz");
            String key = text(rating.criterionKey()).toLowerCase(Locale.ROOT);
            String evidence = text(rating.evidence());
            if (!CRITERION_KEY.matcher(key).matches() || !keys.add(key)
                    || rating.rating() < 1 || rating.rating() > 4
                    || evidence.length() < 10 || evidence.length() > 2000) {
                return Outcome.fail(OutcomeCode.INVALID,
                        "her criterion benzersiz, rating 1..4 ve evidence 10..2000 olmalı");
            }
            ratings.add(new Rating(key, rating.rating(), evidence));
        }
        String summary = text(raw.summary());
        if (summary.length() < 10 || summary.length() > 4000) {
            return Outcome.fail(OutcomeCode.INVALID, "summary 10..4000 karakter olmalı");
        }
        String predecessor = emptyToNull(text(raw.predecessorScorecardId()));
        if (predecessor != null && !SCORECARD_ID.matcher(predecessor).matches()) {
            return Outcome.fail(OutcomeCode.INVALID, "predecessorScorecardId geçersiz");
        }
        ratings.sort(Comparator.comparing(Rating::criterionKey));
        return Outcome.ok(new ScorecardInput(
                SCORECARD_POLICY_VERSION, true, raw.recommendation(), ratings,
                summary, predecessor));
    }

    private static boolean prohibited(String raw) {
        String value = raw.toLowerCase(Locale.ROOT);
        return ILLEGAL_QUESTION_PATTERNS.stream().anyMatch(p -> p.matcher(value).find())
                || UNSTRUCTURED_FIT_PATTERNS.stream().anyMatch(p -> p.matcher(value).find());
    }

    private static Pattern regex(String value) {
        return Pattern.compile(value, Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
    }

    private static String scheduleDigest(String publicRef, ScheduleInput input) {
        StringBuilder canonical = new StringBuilder(String.join("|", publicRef,
                input.type().name(), input.startsAt(), input.endsAt(), input.timeZone(),
                input.mode().name(), input.location()));
        input.participants().forEach(p -> canonical.append('|').append(p.actorRef())
                .append(':').append(p.displayLabel()).append(':').append(p.role()));
        input.criteria().forEach(c -> canonical.append('|').append(c.key()).append(':')
                .append(c.label()).append(':').append(c.question()).append(':')
                .append(c.evidencePrompt()));
        return sha256(canonical.toString());
    }

    private static String scorecardDigest(String interviewId, String actor, ScorecardInput input) {
        StringBuilder canonical = new StringBuilder(String.join("|", interviewId, actor,
                input.policyVersion(), input.recommendation().name(), input.summary(),
                input.predecessorScorecardId() == null ? "" : input.predecessorScorecardId()));
        input.ratings().forEach(r -> canonical.append('|').append(r.criterionKey())
                .append(':').append(r.rating()).append(':').append(r.evidence()));
        return sha256(canonical.toString());
    }

    private String randomToken() {
        byte[] bytes = new byte[18];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static boolean validIdentity(TenantId tenant, ActorId actor) {
        return tenant != null && tenant.value() != null && !tenant.value().isBlank()
                && actor != null && actor.value() != null && !actor.value().isBlank()
                && actor.value().length() <= 200;
    }

    private static boolean validPublicRef(String value) {
        return value != null && PUBLIC_REF.matcher(value).matches();
    }

    private static boolean validInterviewId(String value) {
        return value != null && INTERVIEW_ID.matcher(value).matches();
    }

    private static boolean validIdempotency(String value) {
        return value != null && IDEMPOTENCY.matcher(value).matches();
    }

    private static <T> Outcome<T> invalidIdempotency() {
        return Outcome.fail(OutcomeCode.INVALID,
                "X-ATS-Idempotency-Key 16..128 güvenli karakter olmalı");
    }

    private static Outcome<ScorecardResult> invalidIdempotencyScorecard() {
        return Outcome.fail(OutcomeCode.INVALID,
                "X-ATS-Idempotency-Key 16..128 güvenli karakter olmalı");
    }

    private static String text(String value) {
        return value == null ? "" : value.trim();
    }

    private static String emptyToNull(String value) {
        return value == null || value.isEmpty() ? null : value;
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256")
                            .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException ex) {
            throw new IllegalStateException(ex);
        }
    }
}
