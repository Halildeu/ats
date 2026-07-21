package com.ats.application;

import com.ats.application.JobPostingStore.Content;
import com.ats.application.JobPostingStore.CreateCommand;
import com.ats.application.JobPostingStore.MutationResult;
import com.ats.application.JobPostingStore.TransitionCommand;
import com.ats.application.JobPostingStore.UpdateCommand;
import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.text.Normalizer;
import java.time.Clock;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/** Tenant-scoped recruiter ilan uygulama servisi (ATS-0022). */
public final class JobPostingService {

    public static final String CURRENT_NOTICE_VERSION = "kvkk-application-v1";
    public static final List<String> REQUIRED_APPLICATION_FIELDS = List.of(
            "fullName", "email", "phone", "city", "summary", "experience", "education", "skills");
    public static final List<String> OPTIONAL_APPLICATION_FIELDS = List.of(
            "linkedIn", "portfolio", "note");
    public static final List<String> DEFAULT_APPLICATION_FIELDS = List.of(
            "fullName", "email", "phone", "city", "linkedIn", "portfolio",
            "summary", "experience", "education", "skills", "note");

    private static final Pattern IDEMPOTENCY = Pattern.compile("[A-Za-z0-9._:-]{16,128}");
    private static final Pattern JOB_ID = Pattern.compile("job_[A-Za-z0-9_-]{24}");
    private static final Pattern SLUG = Pattern.compile("[a-z0-9]+(?:-[a-z0-9]+){0,15}");

    public record JobDraft(
            String slug,
            String title,
            String team,
            String location,
            String mode,
            String employmentType,
            String summary,
            List<String> highlights,
            List<String> applicationFields,
            String noticeVersion) {
        public JobDraft {
            highlights = highlights == null ? List.of() : List.copyOf(highlights);
            applicationFields = applicationFields == null ? List.of() : List.copyOf(applicationFields);
        }
    }

    private final JobPostingStore store;
    private final Clock clock;
    private final SecureRandom random;

    public JobPostingService(JobPostingStore store, Clock clock, SecureRandom random) {
        if (store == null || clock == null || random == null) {
            throw new IllegalArgumentException("store/clock/random zorunlu");
        }
        this.store = store;
        this.clock = clock;
        this.random = random;
    }

    public Outcome<List<JobPosting>> list(TenantId tenantId) {
        if (!validTenant(tenantId)) return invalid("tenant geçersiz");
        return store.list(tenantId);
    }

    public Outcome<JobPosting> find(TenantId tenantId, String jobId) {
        if (!validTenant(tenantId) || !validJobId(jobId)) return invalid("tenant/jobId geçersiz");
        return store.find(tenantId, jobId);
    }

    public Outcome<String> activeCareerHandle(TenantId tenantId) {
        if (!validTenant(tenantId)) return invalid("tenant geçersiz");
        return store.findActiveCareerHandle(tenantId);
    }

    public Outcome<MutationResult> create(
            TenantId tenantId, ActorId actorId, String idempotencyKey, JobDraft raw) {
        Outcome<JobDraft> checked = normalizeAndValidate(raw, true);
        if (checked instanceof Outcome.Fail<JobDraft> fail) {
            return Outcome.fail(fail.code(), fail.reason());
        }
        if (!validIdentity(tenantId, actorId)) return invalid("tenant/actor geçersiz");
        if (!validIdempotency(idempotencyKey)) return invalidIdempotency();

        JobDraft value = ((Outcome.Ok<JobDraft>) checked).value();
        String jobId = "job_" + randomUrlToken(18);
        String autoSlug = value.slug() == null
                ? autoSlug(value.title(), sha256Hex(jobId).substring(0, 8))
                : value.slug();
        Content content = content(value, autoSlug);
        String digest = digest("CREATE", null, -1, value);
        return store.create(new CreateCommand(
                tenantId, actorId, jobId, idempotencyKey, digest, content,
                clock.instant().toString()));
    }

    public Outcome<MutationResult> update(
            TenantId tenantId, ActorId actorId, String jobId, int expectedVersion,
            String idempotencyKey, JobDraft raw) {
        Outcome<JobDraft> checked = normalizeAndValidate(raw, false);
        if (checked instanceof Outcome.Fail<JobDraft> fail) {
            return Outcome.fail(fail.code(), fail.reason());
        }
        if (!validIdentity(tenantId, actorId) || !validJobId(jobId) || expectedVersion < 0) {
            return invalid("tenant/actor/jobId/expectedVersion geçersiz");
        }
        if (!validIdempotency(idempotencyKey)) return invalidIdempotency();
        JobDraft value = ((Outcome.Ok<JobDraft>) checked).value();
        return store.update(new UpdateCommand(
                tenantId, actorId, jobId, expectedVersion, idempotencyKey,
                digest("UPDATE", jobId, expectedVersion, value), content(value, value.slug()),
                clock.instant().toString()));
    }

    public Outcome<MutationResult> transition(
            TenantId tenantId, ActorId actorId, String jobId, int expectedVersion,
            String idempotencyKey, String rawTarget) {
        if (!validIdentity(tenantId, actorId) || !validJobId(jobId) || expectedVersion < 0) {
            return invalid("tenant/actor/jobId/expectedVersion geçersiz");
        }
        if (!validIdempotency(idempotencyKey)) return invalidIdempotency();
        final JobPostingStatus target;
        try {
            target = JobPostingStatus.valueOf(rawTarget == null ? "" : rawTarget.trim());
        } catch (IllegalArgumentException ex) {
            return invalid("targetStatus kapalı küme dışında");
        }
        if (target == JobPostingStatus.PUBLISHED) {
            Outcome<String> career = store.findActiveCareerHandle(tenantId);
            if (career instanceof Outcome.Fail<String>) {
                return Outcome.fail(OutcomeCode.NOT_CONFIGURED,
                        "aktif kariyer sitesi olmadan ilan yayınlanamaz");
            }
        }
        String digest = digestParts(List.of(
                "TRANSITION", jobId, Integer.toString(expectedVersion), target.name()));
        return store.transition(new TransitionCommand(
                tenantId, actorId, jobId, expectedVersion, target, idempotencyKey,
                digest, clock.instant().toString()));
    }

    private Outcome<JobDraft> normalizeAndValidate(JobDraft raw, boolean slugOptional) {
        if (raw == null) return invalid("ilan gövdesi zorunlu");
        String normalizedSlug = trimToNull(raw.slug());
        if (normalizedSlug != null) normalizedSlug = normalizedSlug.toLowerCase(Locale.ROOT);
        JobDraft value = new JobDraft(
                normalizedSlug,
                trim(raw.title()), trim(raw.team()), trim(raw.location()), trim(raw.mode()),
                trim(raw.employmentType()), trim(raw.summary()), normalizeHighlights(raw.highlights()),
                normalizeApplicationFields(raw.applicationFields()), trim(raw.noticeVersion()));
        if (!slugOptional && value.slug() == null) return invalid("slug güncellemede zorunlu");
        if (value.slug() != null && !validSlug(value.slug())) return invalid("slug geçersiz");
        if (!between(value.title(), 2, 180)) return invalid("title 2..180 karakter olmalı");
        if (!between(value.team(), 2, 120)) return invalid("team 2..120 karakter olmalı");
        if (!between(value.location(), 2, 160)) return invalid("location 2..160 karakter olmalı");
        if (!between(value.mode(), 2, 80)) return invalid("mode 2..80 karakter olmalı");
        if (!between(value.employmentType(), 2, 80))
            return invalid("employmentType 2..80 karakter olmalı");
        if (!between(value.summary(), 20, 8000)) return invalid("summary 20..8000 karakter olmalı");
        if (value.highlights().size() > 20
                || value.highlights().stream().anyMatch(item -> !between(item, 1, 160))) {
            return invalid("highlights en fazla 20 öğe ve her öğe 1..160 karakter olmalı");
        }
        if (value.applicationFields().stream().anyMatch(
                        field -> !DEFAULT_APPLICATION_FIELDS.contains(field))
                || value.applicationFields().stream().distinct().count()
                        != value.applicationFields().size()) {
            return invalid("applicationFields kapalı küme ve benzersiz olmalı");
        }
        if (!value.applicationFields().containsAll(REQUIRED_APPLICATION_FIELDS)
                || value.applicationFields().size() < REQUIRED_APPLICATION_FIELDS.size()
                || value.applicationFields().size() > DEFAULT_APPLICATION_FIELDS.size()) {
            return invalid("applicationFields zorunlu çekirdek alanları içermeli");
        }
        if (!CURRENT_NOTICE_VERSION.equals(value.noticeVersion())) {
            return invalid("noticeVersion desteklenen güncel sürüm olmalı");
        }
        return Outcome.ok(value);
    }

    private static Content content(JobDraft value, String slug) {
        return new Content(slug, value.title(), value.team(), value.location(), value.mode(),
                value.employmentType(), value.summary(), value.highlights(),
                value.applicationFields(), value.noticeVersion());
    }

    private static String digest(String operation, String jobId, int expectedVersion, JobDraft value) {
        return digestParts(List.of(
                operation,
                nullToEmpty(jobId),
                Integer.toString(expectedVersion),
                nullToEmpty(value.slug()),
                value.title(), value.team(), value.location(), value.mode(),
                value.employmentType(), value.summary(), String.join("\u001f", value.highlights()),
                String.join("\u001f", value.applicationFields()), value.noticeVersion()));
    }

    private static String digestParts(List<String> parts) {
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

    private static String slugify(String input) {
        String tr = input.toLowerCase(Locale.forLanguageTag("tr-TR"))
                .replace('ı', 'i').replace('ğ', 'g').replace('ü', 'u')
                .replace('ş', 's').replace('ö', 'o').replace('ç', 'c');
        String ascii = Normalizer.normalize(tr, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "")
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("^-|-$", "");
        return ascii.isBlank() ? "ilan" : ascii;
    }

    private static String autoSlug(String title, String suffix) {
        String[] segments = slugify(title).split("-");
        int baseSegments = Math.min(15, segments.length);
        String base = String.join("-", java.util.Arrays.copyOf(segments, baseSegments));
        int maxBaseLength = 120 - suffix.length() - 1;
        if (base.length() > maxBaseLength) {
            base = base.substring(0, maxBaseLength).replaceAll("-+$", "");
        }
        return base + "-" + suffix.toLowerCase(Locale.ROOT);
    }

    private static List<String> normalizeHighlights(List<String> input) {
        if (input == null) return List.of();
        List<String> out = new ArrayList<>();
        for (String item : input) {
            String value = trim(item);
            if (value != null && !value.isEmpty() && !out.contains(value)) out.add(value);
        }
        return List.copyOf(out);
    }

    private static List<String> normalizeApplicationFields(List<String> input) {
        if (input == null) return List.of();
        List<String> out = new ArrayList<>();
        for (String item : input) {
            String value = trim(item);
            out.add(value == null ? "" : value);
        }
        return List.copyOf(out);
    }

    private static boolean validIdentity(TenantId tenant, ActorId actor) {
        return validTenant(tenant) && actor != null && actor.value() != null && !actor.value().isBlank();
    }

    private static boolean validTenant(TenantId tenant) {
        return tenant != null && tenant.value() != null && !tenant.value().isBlank();
    }

    private static boolean validJobId(String value) {
        return value != null && JOB_ID.matcher(value).matches();
    }

    private static boolean validSlug(String value) {
        return value.length() <= 120 && SLUG.matcher(value).matches();
    }

    private static boolean validIdempotency(String value) {
        return value != null && IDEMPOTENCY.matcher(value).matches();
    }

    private static boolean between(String value, int min, int max) {
        return value != null && value.length() >= min && value.length() <= max;
    }

    private static <T> Outcome<T> invalid(String reason) {
        return Outcome.fail(OutcomeCode.INVALID, reason);
    }

    private static <T> Outcome<T> invalidIdempotency() {
        return invalid("X-ATS-Idempotency-Key 16..128 güvenli karakter olmalı");
    }

    private static MessageDigest sha256() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }

    private static String sha256Hex(String value) {
        return HexFormat.of().formatHex(sha256().digest(value.getBytes(StandardCharsets.UTF_8)));
    }

    private static String trim(String value) { return value == null ? null : value.trim(); }
    private static String trimToNull(String value) {
        String result = trim(value);
        return result == null || result.isEmpty() ? null : result;
    }
    private static String nullToEmpty(String value) { return value == null ? "" : value; }
}
