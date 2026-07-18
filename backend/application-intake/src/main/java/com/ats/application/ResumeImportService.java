package com.ats.application;

import com.ats.application.ResumeDocumentParser.ParseResult;
import com.ats.application.ResumeImportStore.AttachCommand;
import com.ats.application.ResumeImportStore.AttachResult;
import com.ats.application.ResumeImportStore.AttachState;
import com.ats.application.ResumeImportStore.ConfirmCommand;
import com.ats.application.ResumeImportStore.ConfirmResult;
import com.ats.application.ResumeImportStore.CreateCommand;
import com.ats.application.ResumeImportStore.CreateResult;
import com.ats.application.ResumeImportStore.FieldCommand;
import com.ats.application.ResumeImportStore.FieldResult;
import com.ats.application.ResumeImportStore.ReplaceCommand;
import com.ats.application.ResumeImportStore.ReplaceResult;
import com.ats.application.ResumeImportStore.ReserveUploadCommand;
import com.ats.application.ResumeImportStore.ReserveUploadResult;
import com.ats.application.ResumeImportStore.ReserveUploadState;
import com.ats.application.ResumeImportStore.TerminateCommand;
import com.ats.application.ResumeImportStore.TerminateResult;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Future;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.SynchronousQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.regex.Pattern;

/**
 * Candidate-controlled PDF → editable draft vertical slice.
 *
 * <p>Privacy invariant: raw bytes are scanned and parsed in bounded memory and are never passed to
 * persistence. Only allow-listed proposals exist transiently until CONFIRMED or another terminal
 * state purges them. The current product gate is synthetic-only; a parsed .test email is mandatory.
 */
public final class ResumeImportService implements AutoCloseable {

    public static final String NOTICE_VERSION = "candidate-resume-import-v1";
    public static final Duration UPLOAD_WINDOW = Duration.ofMinutes(30);
    public static final Duration IMPORT_TTL = Duration.ofHours(24);
    public static final Duration PARSE_TIMEOUT = Duration.ofSeconds(15);
    public static final Duration RESERVATION_TTL = Duration.ofSeconds(30);
    private static final Pattern SAFE_KEY = Pattern.compile("[A-Za-z0-9._:-]{16,128}");
    private static final Pattern ACCESS = Pattern.compile("[A-Za-z0-9_-]{43}");
    private static final Pattern IMPORT_ID = Pattern.compile("ri_[A-Za-z0-9_-]{24}");
    private static final Set<ProposalState> CANDIDATE_FIELD_STATES =
            Set.of(ProposalState.ACCEPTED, ProposalState.EDITED, ProposalState.REJECTED);

    public enum ResumeField {
        FULL_NAME("fullName", 2, 160),
        EMAIL("email", 3, 254),
        PHONE("phone", 7, 40),
        CITY("city", 2, 120),
        SUMMARY("summary", 10, 4_000),
        EXPERIENCE("experience", 1, 8_000),
        EDUCATION("education", 1, 4_000),
        SKILLS("skills", 1, 4_000),
        LANGUAGES("languages", 1, 2_000),
        CERTIFICATIONS("certifications", 1, 4_000);

        private final String apiName;
        private final int minLength;
        private final int maxLength;

        ResumeField(String apiName, int minLength, int maxLength) {
            this.apiName = apiName;
            this.minLength = minLength;
            this.maxLength = maxLength;
        }

        public String apiName() { return apiName; }
        public int minLength() { return minLength; }
        public int maxLength() { return maxLength; }

        public static ResumeField fromApiName(String value) {
            for (ResumeField field : values()) {
                if (field.apiName.equals(value)) return field;
            }
            throw new IllegalArgumentException("unsupported resume field");
        }
    }

    public enum ProposalState { UNREVIEWED, ACCEPTED, EDITED, REJECTED, CONTROL_REQUIRED }

    public enum ImportState {
        ACTIVE,
        CONFIRMED,
        CANCELLED,
        REJECT_ALL,
        EXPIRED,
        FAILED,
        SUPERSEDED;

        public boolean terminal() { return this != ACTIVE; }
    }

    public record Provenance(
            int page,
            double x,
            double y,
            double width,
            double height,
            double confidence,
            String parserVersion) {}

    public record ProposalDraft(ResumeField field, String value, Provenance provenance) {}

    public record ResumeProposal(
            ResumeField field,
            String proposedValue,
            String candidateValue,
            ProposalState state,
            int version,
            Provenance provenance) {}

    public record ResumeImport(
            TenantId tenantId,
            String importId,
            String jobId,
            String jobSlug,
            ImportState state,
            int version,
            int documentVersion,
            String noticeVersion,
            String noticeAcceptedAt,
            String uploadExpiresAt,
            String firstUploadAt,
            String expiresAt,
            String parserVersion,
            int protectedSuppressed,
            int unsupportedOutput,
            String createdAt,
            String updatedAt,
            String purgedAt,
            List<ResumeProposal> proposals) {
        public ResumeImport {
            proposals = proposals == null ? List.of() : List.copyOf(proposals);
        }
    }

    public record ResumeDraft(
            String draftId,
            String importId,
            int version,
            Map<ResumeField, String> fields,
            String createdAt) {
        public ResumeDraft {
            fields = fields == null ? Map.of() : Map.copyOf(fields);
        }
    }

    @FunctionalInterface
    public interface DocumentScanner {
        Outcome<ScanDecision> scan(byte[] bytes);
    }

    public enum ScanDecision { CLEAN, REJECTED }

    private final ResumeImportStore store;
    private final ApplicationStore applicationStore;
    private final ResumeDocumentParser parser;
    private final DocumentScanner scanner;
    private final TenantId publicTenantId;
    private final Clock clock;
    private final SecureRandom random;
    private final int maxBytes;
    private final int maxPages;
    private final boolean syntheticOnly;
    private final ExecutorService parserExecutor;

    public ResumeImportService(
            ResumeImportStore store,
            ApplicationStore applicationStore,
            ResumeDocumentParser parser,
            DocumentScanner scanner,
            TenantId publicTenantId,
            Clock clock,
            SecureRandom random,
            int maxBytes,
            int maxPages,
            boolean syntheticOnly,
            int maxConcurrentParses) {
        this.store = store;
        this.applicationStore = applicationStore;
        this.parser = parser;
        this.scanner = scanner;
        this.publicTenantId = publicTenantId;
        this.clock = clock;
        this.random = random;
        this.maxBytes = maxBytes;
        this.maxPages = maxPages;
        this.syntheticOnly = syntheticOnly;
        int concurrency = Math.max(1, Math.min(maxConcurrentParses, 8));
        this.parserExecutor = new ThreadPoolExecutor(
                concurrency,
                concurrency,
                0L,
                TimeUnit.MILLISECONDS,
                new SynchronousQueue<>(),
                runnable -> {
                    Thread thread = new Thread(runnable, "ats-resume-parser");
                    thread.setDaemon(true);
                    return thread;
                },
                new ThreadPoolExecutor.AbortPolicy());
    }

    public Outcome<CreateResult> create(
            String jobSlug,
            String candidateAccessToken,
            String idempotencyKey,
            String noticeVersion,
            String noticeAcceptedAt) {
        return createForTenant(publicTenantId, null, jobSlug, candidateAccessToken,
                idempotencyKey, noticeVersion, noticeAcceptedAt);
    }

    public Outcome<CreateResult> create(
            String publicHandle,
            String jobSlug,
            String candidateAccessToken,
            String idempotencyKey,
            String noticeVersion,
            String noticeAcceptedAt) {
        Outcome<TenantId> tenant = applicationStore.resolveActiveCareerTenant(publicHandle);
        if (tenant instanceof Outcome.Fail<TenantId> fail) return copyFail(fail);
        return createForTenant(((Outcome.Ok<TenantId>) tenant).value(), publicHandle, jobSlug,
                candidateAccessToken, idempotencyKey, noticeVersion, noticeAcceptedAt);
    }

    private Outcome<CreateResult> createForTenant(
            TenantId tenantId,
            String publicHandle,
            String jobSlug,
            String candidateAccessToken,
            String idempotencyKey,
            String noticeVersion,
            String noticeAcceptedAt) {
        if (!validAccess(candidateAccessToken) || !validKey(idempotencyKey)) {
            return Outcome.fail(OutcomeCode.INVALID, "candidate access/idempotency anahtarı geçersiz");
        }
        if (!NOTICE_VERSION.equals(noticeVersion)) {
            return Outcome.fail(OutcomeCode.INVALID, "CV import aydınlatma sürümü güncel değil");
        }
        Outcome<Instant> accepted = recentInstant(noticeAcceptedAt, Duration.ofHours(24));
        if (accepted instanceof Outcome.Fail<Instant> fail) return copyFail(fail);
        Outcome<JobPosting> job = applicationStore.findPublishedJob(tenantId, jobSlug);
        if (job instanceof Outcome.Fail<JobPosting> fail) return copyFail(fail);
        JobPosting posting = ((Outcome.Ok<JobPosting>) job).value();
        Instant now = clock.instant();
        String accessDigest = sha256Hex(candidateAccessToken.getBytes(StandardCharsets.UTF_8));
        String importId = "ri_" + randomToken(18);
        String digest = sha256Hex(String.join("\u001f", posting.jobId(), accessDigest,
                noticeVersion, noticeAcceptedAt).getBytes(StandardCharsets.UTF_8));
        return store.create(new CreateCommand(
                tenantId, posting.jobId(), posting.slug(), importId, accessDigest,
                idempotencyKey, digest, noticeVersion, noticeAcceptedAt,
                now.plus(UPLOAD_WINDOW).toString(), now.plus(IMPORT_TTL).toString(), now.toString()));
    }

    public Outcome<ResumeImport> find(
            String importId, String candidateAccessToken) {
        if (!validImportId(importId) || !validAccess(candidateAccessToken)) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "CV import bulunamadı");
        }
        return store.find(importId, accessDigest(candidateAccessToken), clock.instant().toString());
    }

    public Outcome<AttachResult> upload(
            String importId,
            String candidateAccessToken,
            int expectedVersion,
            String uploadIdempotencyKey,
            byte[] pdfBytes) {
        if (!validImportId(importId) || !validAccess(candidateAccessToken)
                || expectedVersion < 0 || !validKey(uploadIdempotencyKey)) {
            return Outcome.fail(OutcomeCode.INVALID, "CV upload bağlama bilgisi geçersiz");
        }
        if (pdfBytes == null || pdfBytes.length == 0 || pdfBytes.length > maxBytes) {
            return Outcome.fail(OutcomeCode.INVALID, "PDF 1.." + maxBytes + " bayt olmalı");
        }
        if (!hasPdfMagic(pdfBytes)) {
            return Outcome.fail(OutcomeCode.INVALID, "PDF magic doğrulaması başarısız");
        }
        String documentDigest = sha256Hex(pdfBytes);
        Instant reservedAt = clock.instant();
        Outcome<ReserveUploadResult> reservation = store.reserveUpload(new ReserveUploadCommand(
                importId, accessDigest(candidateAccessToken), expectedVersion,
                uploadIdempotencyKey, documentDigest,
                reservedAt.plus(RESERVATION_TTL).toString(),
                reservedAt.plus(IMPORT_TTL).toString(), reservedAt.toString()));
        if (reservation instanceof Outcome.Fail<ReserveUploadResult> fail) return copyFail(fail);
        ReserveUploadResult reserved = ((Outcome.Ok<ReserveUploadResult>) reservation).value();
        if (reserved.state() != ReserveUploadState.RESERVED) {
            return Outcome.ok(new AttachResult(switch (reserved.state()) {
                case REPLAYED -> AttachState.REPLAYED;
                case IN_FLIGHT -> AttachState.IN_FLIGHT;
                case VERSION_CONFLICT -> AttachState.VERSION_CONFLICT;
                case DOCUMENT_CONFLICT -> AttachState.DOCUMENT_CONFLICT;
                case UPLOAD_WINDOW_CLOSED -> AttachState.UPLOAD_WINDOW_CLOSED;
                case TERMINAL -> AttachState.TERMINAL;
                case NOT_FOUND -> AttachState.NOT_FOUND;
                case RESERVED -> throw new IllegalStateException("handled above");
            }, reserved.resumeImport()));
        }
        Outcome<ScanDecision> scanned = scanner.scan(pdfBytes);
        if (!(scanned instanceof Outcome.Ok<ScanDecision> scanOk)) {
            return releaseAndFail(importId, candidateAccessToken, uploadIdempotencyKey,
                    documentDigest, OutcomeCode.NOT_CONFIGURED,
                    "içerik taraması çalışmadı (fail-closed)");
        }
        if (scanOk.value() != ScanDecision.CLEAN) {
            return releaseAndFail(importId, candidateAccessToken, uploadIdempotencyKey,
                    documentDigest, OutcomeCode.INVALID, "içerik taraması dosyayı reddetti");
        }
        ParseResult parsed;
        final Future<Outcome<ParseResult>> future;
        try {
            // SynchronousQueue: no raw-byte task backlog. A stuck/timed-out parser keeps its
            // bounded worker occupied and subsequent uploads fail closed instead of accumulating.
            future = parserExecutor.submit(() -> parser.parse(pdfBytes, maxPages));
        } catch (RejectedExecutionException saturated) {
            return releaseAndFail(importId, candidateAccessToken, uploadIdempotencyKey,
                    documentDigest, OutcomeCode.DENIED,
                    "CV ayrıştırma kapasitesi dolu; daha sonra deneyin");
        }
        try {
            Outcome<ParseResult> outcome = future.get(PARSE_TIMEOUT.toMillis(), TimeUnit.MILLISECONDS);
            if (outcome instanceof Outcome.Fail<ParseResult> fail) {
                return releaseAndFail(importId, candidateAccessToken, uploadIdempotencyKey,
                        documentDigest, fail.code(), fail.reason());
            }
            parsed = ((Outcome.Ok<ParseResult>) outcome).value();
        } catch (TimeoutException timeout) {
            future.cancel(true);
            return releaseAndFail(importId, candidateAccessToken, uploadIdempotencyKey,
                    documentDigest, OutcomeCode.INVALID, "PDF ayrıştırma zaman aşımı");
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            future.cancel(true);
            return releaseAndFail(importId, candidateAccessToken, uploadIdempotencyKey,
                    documentDigest, OutcomeCode.NOT_CONFIGURED,
                    "PDF ayrıştırma kesildi (fail-closed)");
        } catch (java.util.concurrent.ExecutionException failed) {
            return releaseAndFail(importId, candidateAccessToken, uploadIdempotencyKey,
                    documentDigest, OutcomeCode.INVALID,
                    "PDF güvenli biçimde ayrıştırılamadı");
        }
        if (parsed.pageCount() < 1 || parsed.pageCount() > maxPages
                || parsed.unsupportedOutput() != 0 || parsed.proposals().isEmpty()) {
            return releaseAndFail(importId, candidateAccessToken, uploadIdempotencyKey,
                    documentDigest, OutcomeCode.INVALID,
                    "PDF desteklenen alan önerisi üretmedi");
        }
        if (syntheticOnly && parsed.proposals().stream()
                .filter(p -> p.field() == ResumeField.EMAIL)
                .map(ProposalDraft::value)
                .map(v -> v.toLowerCase(Locale.ROOT))
                .noneMatch(v -> v.endsWith(".test"))) {
            return releaseAndFail(importId, candidateAccessToken, uploadIdempotencyKey,
                    documentDigest, OutcomeCode.UNSUPPORTED_IN_GATE,
                    "Bu test sürümü yalnız .test e-postalı sentetik CV kabul eder");
        }
        return store.attach(new AttachCommand(
                importId, accessDigest(candidateAccessToken), expectedVersion,
                uploadIdempotencyKey, documentDigest, parsed.pageCount(), parsed.parserVersion(),
                parsed.protectedSuppressed(), parsed.unsupportedOutput(), clock.instant().toString()),
                parsed.proposals());
    }

    public Outcome<ReplaceResult> replace(
            String importId, String candidateAccessToken, int expectedVersion) {
        if (!validImportId(importId) || !validAccess(candidateAccessToken) || expectedVersion < 0) {
            return Outcome.fail(OutcomeCode.INVALID, "PDF değiştirme bağlamı geçersiz");
        }
        Instant now = clock.instant();
        return store.replace(new ReplaceCommand(
                importId, accessDigest(candidateAccessToken), expectedVersion,
                now.plus(UPLOAD_WINDOW).toString(), now.toString()));
    }

    public Outcome<FieldResult> updateField(
            String importId,
            String candidateAccessToken,
            String fieldName,
            String stateName,
            String editedValue,
            int expectedVersion) {
        if (!validImportId(importId) || !validAccess(candidateAccessToken) || expectedVersion < 0) {
            return Outcome.fail(OutcomeCode.INVALID, "alan güncelleme bağlamı geçersiz");
        }
        final ResumeField field;
        final ProposalState state;
        try {
            field = ResumeField.fromApiName(fieldName);
            state = ProposalState.valueOf(stateName == null ? "" : stateName);
        } catch (IllegalArgumentException invalid) {
            return Outcome.fail(OutcomeCode.INVALID, "field/state kapalı küme dışında");
        }
        if (!CANDIDATE_FIELD_STATES.contains(state)) {
            return Outcome.fail(OutcomeCode.INVALID, "state ACCEPTED|EDITED|REJECTED olmalı");
        }
        String normalized = normalize(editedValue);
        if (state == ProposalState.EDITED
                && (normalized == null || normalized.length() < field.minLength()
                    || normalized.length() > field.maxLength())) {
            return Outcome.fail(OutcomeCode.INVALID,
                    field.apiName() + " düzenlenmiş değer uzunluğu geçersiz");
        }
        if (state != ProposalState.EDITED && normalized != null) {
            return Outcome.fail(OutcomeCode.INVALID, "editedValue yalnız EDITED durumunda verilebilir");
        }
        return store.updateField(new FieldCommand(
                importId, accessDigest(candidateAccessToken), field, state, normalized,
                expectedVersion, clock.instant().toString()));
    }

    public Outcome<ConfirmResult> confirm(
            String importId, String candidateAccessToken, int expectedVersion) {
        if (!validImportId(importId) || !validAccess(candidateAccessToken) || expectedVersion < 0) {
            return Outcome.fail(OutcomeCode.INVALID, "CV import onay bağlamı geçersiz");
        }
        return store.confirm(new ConfirmCommand(
                importId, accessDigest(candidateAccessToken), expectedVersion,
                clock.instant().toString()));
    }

    public Outcome<TerminateResult> terminate(
            String importId,
            String candidateAccessToken,
            int expectedVersion,
            String terminalState) {
        final ImportState state;
        try {
            state = ImportState.valueOf(terminalState == null ? "" : terminalState);
        } catch (IllegalArgumentException invalid) {
            return Outcome.fail(OutcomeCode.INVALID, "terminalState CANCELLED|REJECT_ALL olmalı");
        }
        if ((state != ImportState.CANCELLED && state != ImportState.REJECT_ALL)
                || !validImportId(importId) || !validAccess(candidateAccessToken)
                || expectedVersion < 0) {
            return Outcome.fail(OutcomeCode.INVALID, "CV import sonlandırma bağlamı geçersiz");
        }
        return store.terminate(new TerminateCommand(
                importId, accessDigest(candidateAccessToken), expectedVersion,
                state, clock.instant().toString()));
    }

    /** Candidate-value-free lifecycle sweep; safe for a bounded scheduled worker. */
    public Outcome<Integer> purgeDue(int limit) {
        if (limit < 1 || limit > 1_000) {
            return Outcome.fail(OutcomeCode.INVALID, "CV import purge limiti 1..1000 olmalı");
        }
        return store.purgeDue(clock.instant().toString(), limit);
    }

    private <T> Outcome<T> releaseAndFail(
            String importId,
            String candidateAccessToken,
            String uploadIdempotencyKey,
            String documentDigest,
            OutcomeCode code,
            String reason) {
        Outcome<Void> released = store.releaseUpload(
                importId, accessDigest(candidateAccessToken), uploadIdempotencyKey,
                documentDigest, clock.instant().toString());
        if (released instanceof Outcome.Fail<Void>) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED,
                    "CV upload rezervasyonu temizlenemedi (fail-closed)");
        }
        return Outcome.fail(code, reason);
    }

    private Outcome<Instant> recentInstant(String raw, Duration maxAge) {
        try {
            Instant value = Instant.parse(raw);
            Instant now = clock.instant();
            if (value.isAfter(now.plus(Duration.ofMinutes(5))) || value.isBefore(now.minus(maxAge))) {
                return Outcome.fail(OutcomeCode.INVALID, "aydınlatma onayı güncel oturuma ait olmalı");
            }
            return Outcome.ok(value);
        } catch (DateTimeParseException | NullPointerException invalid) {
            return Outcome.fail(OutcomeCode.INVALID, "aydınlatma onayı ISO-8601 olmalı");
        }
    }

    private static boolean hasPdfMagic(byte[] bytes) {
        return bytes.length >= 5 && bytes[0] == '%' && bytes[1] == 'P'
                && bytes[2] == 'D' && bytes[3] == 'F' && bytes[4] == '-';
    }

    private static boolean validKey(String value) {
        return value != null && SAFE_KEY.matcher(value).matches();
    }

    private static boolean validAccess(String value) {
        return value != null && ACCESS.matcher(value).matches();
    }

    private static boolean validImportId(String value) {
        return value != null && IMPORT_ID.matcher(value).matches();
    }

    private static String accessDigest(String token) {
        return sha256Hex(token.getBytes(StandardCharsets.UTF_8));
    }

    private static String normalize(String value) {
        if (value == null) return null;
        String normalized = value.replace('\u0000', ' ').trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private String randomToken(int bytes) {
        byte[] value = new byte[bytes];
        random.nextBytes(value);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
    }

    private static String sha256Hex(String value) {
        return sha256Hex(value.getBytes(StandardCharsets.UTF_8));
    }

    private static String sha256Hex(byte[] value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value));
        } catch (java.security.NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 mevcut olmalı", impossible);
        }
    }

    private static <T> Outcome<T> copyFail(Outcome.Fail<?> fail) {
        return Outcome.fail(fail.code(), fail.reason());
    }

    @Override
    public void close() {
        parserExecutor.shutdownNow();
    }
}
