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
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Locale;
import java.util.Objects;
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
            List<ApplicationQuestion> questions,
            String noticeVersion) {
        public JobDraft {
            highlights = highlights == null ? List.of() : List.copyOf(highlights);
            applicationFields = applicationFields == null ? List.of() : List.copyOf(applicationFields);
            questions = questions == null ? List.of() : List.copyOf(questions);
        }
    }

    /**
     * Doğrulanmış taslak + sorulara ait İSTEK digest parçaları.
     *
     * <p>Digest parçaları sunucunun ürettiği kimliklerden ÖNCE, istemcinin gönderdiği içerikten
     * hesaplanır. Aksi hâlde aynı isteğin tekrarı her seferinde yeni rastgele {@code questionId}
     * üretir, digest değişir ve idempotent tekrar sahte {@code IDEMPOTENCY_CONFLICT}'e düşerdi —
     * yani retry'ı bozar. Digest isteğin fonksiyonudur, sunucu rastgeleliğinin değil.
     */
    private record Normalized(JobDraft value, List<String> questionDigestParts) {}

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
        Outcome<Normalized> checked = normalizeAndValidate(raw, true, IdOwnership.none());
        if (checked instanceof Outcome.Fail<Normalized> fail) {
            return Outcome.fail(fail.code(), fail.reason());
        }
        if (!validIdentity(tenantId, actorId)) return invalid("tenant/actor geçersiz");
        if (!validIdempotency(idempotencyKey)) return invalidIdempotency();

        Normalized normalized = ((Outcome.Ok<Normalized>) checked).value();
        JobDraft value = normalized.value();
        String jobId = "job_" + randomUrlToken(18);
        String autoSlug = value.slug() == null
                ? autoSlug(value.title(), sha256Hex(jobId).substring(0, 8))
                : value.slug();
        Content content = content(value, autoSlug);
        String digest = digest("CREATE", null, -1, value, normalized.questionDigestParts());
        return store.create(new CreateCommand(
                tenantId, actorId, jobId, idempotencyKey, digest, content,
                clock.instant().toString()));
    }

    public Outcome<MutationResult> update(
            TenantId tenantId, ActorId actorId, String jobId, int expectedVersion,
            String idempotencyKey, JobDraft raw) {
        // Sahiplik okuması tenant/jobId gerektirdiği için bu kontroller gövde
        // doğrulamasından ÖNCE gelir (P1: kimlik sahipliği).
        if (!validIdentity(tenantId, actorId) || !validJobId(jobId) || expectedVersion < 0) {
            return invalid("tenant/actor/jobId/expectedVersion geçersiz");
        }
        if (!validIdempotency(idempotencyKey)) return invalidIdempotency();
        // Sahiplik okunamıyorsa hiçbir şey yazılmaz (fail-closed).
        Outcome<IdOwnership> ownership = ownershipOf(tenantId, jobId);
        if (ownership instanceof Outcome.Fail<IdOwnership> fail) {
            return Outcome.fail(fail.code(), fail.reason());
        }
        Outcome<Normalized> checked = normalizeAndValidate(
                raw, false, ((Outcome.Ok<IdOwnership>) ownership).value());
        if (checked instanceof Outcome.Fail<Normalized> fail) {
            return Outcome.fail(fail.code(), fail.reason());
        }
        Normalized normalized = ((Outcome.Ok<Normalized>) checked).value();
        JobDraft value = normalized.value();
        return store.update(new UpdateCommand(
                tenantId, actorId, jobId, expectedVersion, idempotencyKey,
                digest("UPDATE", jobId, expectedVersion, value, normalized.questionDigestParts()),
                content(value, value.slug()),
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

    private Outcome<Normalized> normalizeAndValidate(
            JobDraft raw, boolean slugOptional, IdOwnership ownership) {
        if (raw == null) return invalid("ilan gövdesi zorunlu");
        String normalizedSlug = trimToNull(raw.slug());
        if (normalizedSlug != null) normalizedSlug = normalizedSlug.toLowerCase(Locale.ROOT);

        // #240 A: sorular önce SIRALANIR (deterministik okuma), sonra istek digest'i alınır,
        // en son sunucu kimlikleri atanır. Sıra kritik — gerekçe Normalized javadoc'unda.
        List<ApplicationQuestion> ordered = sortedByOrder(raw.questions());
        if (ordered.size() > ApplicationQuestion.MAX_PER_JOB) {
            return invalid("ilan başına en fazla " + ApplicationQuestion.MAX_PER_JOB + " soru");
        }
        List<String> questionDigestParts = questionDigestParts(ordered);
        Outcome<List<ApplicationQuestion>> resolved = resolveIds(ordered, ownership);
        if (resolved instanceof Outcome.Fail<List<ApplicationQuestion>> fail) {
            return Outcome.fail(fail.code(), fail.reason());
        }
        List<ApplicationQuestion> questions = ((Outcome.Ok<List<ApplicationQuestion>>) resolved).value();
        Outcome<Void> questionCheck = validateQuestions(questions);
        if (questionCheck instanceof Outcome.Fail<Void> fail) {
            return Outcome.fail(fail.code(), fail.reason());
        }

        JobDraft value = new JobDraft(
                normalizedSlug,
                trim(raw.title()), trim(raw.team()), trim(raw.location()), trim(raw.mode()),
                trim(raw.employmentType()), trim(raw.summary()), normalizeHighlights(raw.highlights()),
                normalizeApplicationFields(raw.applicationFields()), questions,
                trim(raw.noticeVersion()));
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
        return Outcome.ok(new Normalized(value, questionDigestParts));
    }

    /**
     * Kimlik SAHİPLİĞİ. Biçim deseni ({@code q_…}/{@code qo_…}) yalnız BİÇİMİ doğrular; o
     * kimliğin sunucu tarafından, BU ilan için üretildiğini KANITLAMAZ. Sahiplik kontrolü
     * olmadan istemci (a) yeni kayıtta kimlik uydurabilir, (b) güncellemede mevcut bir sorunun
     * kimliğini başka geçerli bir değerle değiştirip dilim B/C'de kaydedilmiş cevapların
     * sorusuyla bağını koparabilirdi.
     *
     * <p>Bu yüzden kimlik yalnız İLANIN KENDİ mevcut kimlikleri arasından kabul edilir;
     * geri kalan her şeyi sunucu üretir.
     */
    private record IdOwnership(boolean update, Map<String, List<String>> optionIdsByQuestionId) {

        /** Create: ilan henüz yok, dolayısıyla sahiplenilmiş hiçbir kimlik yoktur. */
        static IdOwnership none() {
            return new IdOwnership(false, Map.of());
        }

        static IdOwnership of(List<ApplicationQuestion> existing) {
            Map<String, List<String>> owned = new LinkedHashMap<>();
            for (ApplicationQuestion question : existing) {
                owned.put(question.questionId(), question.options().stream()
                        .map(ApplicationQuestion.Option::optionId).toList());
            }
            return new IdOwnership(true, Map.copyOf(owned));
        }

        boolean ownsQuestion(String questionId) {
            return optionIdsByQuestionId.containsKey(questionId);
        }

        boolean ownsOption(String questionId, String optionId) {
            return optionIdsByQuestionId.getOrDefault(questionId, List.of()).contains(optionId);
        }
    }

    /**
     * Kimlik çözümü: istemcinin gönderdiği kimlik YALNIZ bu ilana aitse korunur (reorder/edit
     * boyunca sabit kalması sözleşmenin 1. maddesi), aksi hâlde istek reddedilir. Kimliksiz
     * gelen öğe yenidir ve kimliğini sunucudan alır.
     */
    private Outcome<List<ApplicationQuestion>> resolveIds(
            List<ApplicationQuestion> questions, IdOwnership ownership) {
        List<ApplicationQuestion> out = new ArrayList<>();
        for (ApplicationQuestion question : questions) {
            String claimedId = trimToNull(question.questionId());
            if (claimedId != null && !ownership.ownsQuestion(claimedId)) {
                return invalid(ownership.update()
                        ? "questionId bu ilana ait değil; kimlikleri sunucu üretir"
                        : "yeni ilanda questionId gönderilemez; kimlikleri sunucu üretir");
            }
            String questionId = claimedId == null ? "q_" + randomUrlToken(12) : claimedId;

            List<ApplicationQuestion.Option> options = new ArrayList<>();
            for (ApplicationQuestion.Option option : question.options()) {
                String claimedOptionId = trimToNull(option.optionId());
                if (claimedOptionId == null) {
                    options.add(new ApplicationQuestion.Option(
                            "qo_" + randomUrlToken(9), option.label()));
                    continue;
                }
                // Seçenek kimliği ancak AYNI sorunun mevcut seçeneğiyse korunur; başka bir
                // sorunun seçeneğini devralmak da cevap bağını koparır.
                if (claimedId == null || !ownership.ownsOption(claimedId, claimedOptionId)) {
                    return invalid(ownership.update()
                            ? "optionId bu soruya ait değil; kimlikleri sunucu üretir"
                            : "yeni ilanda optionId gönderilemez; kimlikleri sunucu üretir");
                }
                options.add(option);
            }
            out.add(new ApplicationQuestion(
                    questionId, question.order(), question.text(), question.kind(),
                    question.required(), options));
        }
        return Outcome.ok(List.copyOf(out));
    }

    /**
     * Güncellemede sahiplik, ilanın KAYITLI hâlinden okunur.
     *
     * <p><b>Fail-closed.</b> {@code store.find} yalnız {@code NOT_FOUND} değil, DB/IO gibi
     * operasyonel hatalar da döndürebilir. Bu hataları "sahiplenilmiş kimlik yok" saymak
     * sessizce tehlikeliydi: kimliksiz bir update gövdesi, sahiplik OKUNAMADIĞI hâlde yeni
     * kimlikler üretip yazma aşamasına ilerleyebiliyor ve mevcut soru kimliklerini
     * değiştirebiliyordu. Artık yalnız DOĞRULANMIŞ {@code NOT_FOUND} "sahiplik yok" anlamına
     * gelir (o durumda update zaten store'dan NOT_FOUND alır); diğer her hata aynı kod ve
     * sebeple yukarı yayılır.
     *
     * <p>Okuma ile yazma arasındaki yarış CAS {@code version} ile kapalıdır — ilan değiştiyse
     * update zaten VERSION_CONFLICT verir.
     */
    private Outcome<IdOwnership> ownershipOf(TenantId tenantId, String jobId) {
        Outcome<JobPosting> found = store.find(tenantId, jobId);
        if (found instanceof Outcome.Ok<JobPosting> ok) {
            return Outcome.ok(IdOwnership.of(ok.value().questions()));
        }
        Outcome.Fail<JobPosting> fail = (Outcome.Fail<JobPosting>) found;
        if (fail.code() == OutcomeCode.NOT_FOUND) {
            return Outcome.ok(IdOwnership.none());
        }
        return Outcome.fail(fail.code(), fail.reason());
    }

    /** İlan geneline yayılan değişmezler; tek soruya bakarak karara bağlanamaz. */
    private static Outcome<Void> validateQuestions(List<ApplicationQuestion> questions) {
        List<String> seenIds = new ArrayList<>();
        List<Integer> seenOrders = new ArrayList<>();
        for (ApplicationQuestion question : questions) {
            String reason = question.invalidReason();
            if (reason != null) return invalid("soru geçersiz: " + reason);
            if (seenIds.contains(question.questionId())) {
                return invalid("questionId ilan içinde benzersiz olmalı");
            }
            if (seenOrders.contains(question.order())) {
                return invalid("order ilan içinde benzersiz olmalı");
            }
            seenIds.add(question.questionId());
            seenOrders.add(question.order());
        }
        return Outcome.ok(null);
    }

    /** Deterministik okuma sırası: {@code order} artan, eşitlikte giriş sırası korunur. */
    private static List<ApplicationQuestion> sortedByOrder(List<ApplicationQuestion> questions) {
        List<ApplicationQuestion> out = new ArrayList<>(questions == null ? List.of() : questions);
        out.removeIf(Objects::isNull);
        out.sort(Comparator.comparingInt(ApplicationQuestion::order));
        return List.copyOf(out);
    }

    /**
     * İstek digest'inin soru parçaları. Sunucu üretimli kimlikler BURAYA GİRMEZ (istemci kendi
     * gönderdiyse girer): digest isteğin fonksiyonudur, sunucu rastgeleliğinin değil.
     */
    private static List<String> questionDigestParts(List<ApplicationQuestion> questions) {
        List<String> parts = new ArrayList<>();
        parts.add(Integer.toString(questions.size()));
        for (ApplicationQuestion question : questions) {
            parts.add(nullToEmpty(question.questionId()));
            parts.add(Integer.toString(question.order()));
            parts.add(question.kind() == null ? "" : question.kind().name());
            parts.add(Boolean.toString(question.required()));
            parts.add(nullToEmpty(question.text()));
            parts.add(Integer.toString(question.options().size()));
            for (ApplicationQuestion.Option option : question.options()) {
                parts.add(nullToEmpty(option.optionId()));
                parts.add(nullToEmpty(option.label()));
            }
        }
        return List.copyOf(parts);
    }

    private static Content content(JobDraft value, String slug) {
        return new Content(slug, value.title(), value.team(), value.location(), value.mode(),
                value.employmentType(), value.summary(), value.highlights(),
                value.applicationFields(), value.questions(), value.noticeVersion());
    }

    private static String digest(
            String operation, String jobId, int expectedVersion, JobDraft value,
            List<String> questionDigestParts) {
        List<String> parts = new ArrayList<>(List.of(
                operation,
                nullToEmpty(jobId),
                Integer.toString(expectedVersion),
                nullToEmpty(value.slug()),
                value.title(), value.team(), value.location(), value.mode(),
                value.employmentType(), value.summary(), String.join("\u001f", value.highlights()),
                String.join("\u001f", value.applicationFields()), value.noticeVersion()));
        // #240 A: sorular idempotency istek digest'inin parçasıdır — yalnız soruların
        // değiştiği bir güncelleme "aynı istek" sayılıp sessizce replay edilemez.
        parts.addAll(questionDigestParts);
        return digestParts(parts);
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
