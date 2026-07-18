package com.ats.offer;

import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import com.ats.offer.OfferStore.CandidateOfferView;
import com.ats.offer.OfferStore.CandidateResponseCommand;
import com.ats.offer.OfferStore.CreateCommand;
import com.ats.offer.OfferStore.RecruiterTransitionCommand;
import com.ats.offer.OfferStore.Terms;
import com.ats.offer.OfferStore.UpdateCommand;
import com.ats.offer.OfferStore.WorkspaceResult;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/** İnsan kontrollü offer -> candidate response -> hire akışı; legal e-signature değildir. */
public final class OfferWorkspaceService {
    private static final Pattern PUBLIC_REF = Pattern.compile("app_[A-Za-z0-9_-]{24}");
    private static final Pattern OFFER_ID = Pattern.compile("off_[A-Za-z0-9_-]{24}");
    private static final Pattern CANDIDATE_ACCESS = Pattern.compile("[A-Za-z0-9_-]{43}");
    private static final Pattern IDEMPOTENCY = Pattern.compile("[A-Za-z0-9._:-]{16,128}");
    private static final Pattern CURRENCY = Pattern.compile("[A-Z]{3}");

    private final OfferStore store;
    private final Clock clock;
    private final SecureRandom random;

    public OfferWorkspaceService(OfferStore store, Clock clock, SecureRandom random) {
        this.store = store;
        this.clock = clock;
        this.random = random;
    }

    public Outcome<WorkspaceResult> create(
            TenantId tenantId, ActorId actorId, String publicRef,
            String idempotencyKey, Terms raw) {
        if (!validIdentity(tenantId, actorId) || !validPublicRef(publicRef)) return notFound();
        if (!validIdempotency(idempotencyKey)) return invalidKey();
        Outcome<Terms> checked = normalizeTerms(raw);
        if (checked instanceof Outcome.Fail<Terms> fail) {
            return Outcome.fail(fail.code(), fail.reason());
        }
        Terms terms = ((Outcome.Ok<Terms>) checked).value();
        String offerId = "off_" + randomToken();
        String occurredAt = clock.instant().toString();
        return store.create(new CreateCommand(
                tenantId, actorId, publicRef, offerId, idempotencyKey,
                digest(String.join("|", "CREATE", publicRef, termsDigest(terms))),
                terms, occurredAt));
    }

    public Outcome<List<OfferWorkspace>> listRecruiter(TenantId tenantId, String publicRef) {
        if (tenantId == null || !validPublicRef(publicRef)) return Outcome.fail(
                OutcomeCode.NOT_FOUND, "başvuru bulunamadı");
        return store.listRecruiter(tenantId, publicRef);
    }

    public Outcome<OfferWorkspace> findRecruiter(
            TenantId tenantId, String publicRef, String offerId) {
        if (tenantId == null || !validPublicRef(publicRef) || !validOfferId(offerId)) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "teklif bulunamadı");
        }
        return store.findRecruiter(tenantId, publicRef, offerId);
    }

    public Outcome<WorkspaceResult> update(
            TenantId tenantId, ActorId actorId, String publicRef, String offerId,
            int expectedVersion, String idempotencyKey, Terms raw, String reason) {
        if (!validIdentity(tenantId, actorId) || !validPublicRef(publicRef)
                || !validOfferId(offerId) || expectedVersion < 0) return notFound();
        if (!validIdempotency(idempotencyKey)) return invalidKey();
        Outcome<Terms> checked = normalizeTerms(raw);
        if (checked instanceof Outcome.Fail<Terms> fail) {
            return Outcome.fail(fail.code(), fail.reason());
        }
        String normalizedReason = reason(reason);
        if (normalizedReason == null) return invalidReason();
        Terms terms = ((Outcome.Ok<Terms>) checked).value();
        String requestDigest = digest(String.join("|", "UPDATE", publicRef, offerId,
                Integer.toString(expectedVersion), termsDigest(terms), normalizedReason));
        return store.update(new UpdateCommand(
                tenantId, actorId, publicRef, offerId, expectedVersion, idempotencyKey,
                requestDigest, terms, normalizedReason, clock.instant().toString()));
    }

    public Outcome<WorkspaceResult> transition(
            TenantId tenantId, ActorId actorId, String publicRef, String offerId,
            int expectedVersion, String idempotencyKey, OfferStatus target, String reason) {
        if (!validIdentity(tenantId, actorId) || !validPublicRef(publicRef)
                || !validOfferId(offerId) || expectedVersion < 0
                || (target != OfferStatus.EXTENDED && target != OfferStatus.WITHDRAWN
                    && target != OfferStatus.HIRED)) return invalidTransition();
        if (!validIdempotency(idempotencyKey)) return invalidKey();
        String normalizedReason = reason(reason);
        if (normalizedReason == null) return invalidReason();
        String requestDigest = digest(String.join("|", "TRANSITION", publicRef, offerId,
                Integer.toString(expectedVersion), target.name(), normalizedReason));
        return store.transition(new RecruiterTransitionCommand(
                tenantId, actorId, publicRef, offerId, expectedVersion, idempotencyKey,
                requestDigest, target, normalizedReason, clock.instant().toString()));
    }

    public Outcome<List<CandidateOfferView>> listCandidate(
            String publicRef, String candidateAccessToken) {
        if (!validPublicRef(publicRef) || candidateAccessToken == null
                || !CANDIDATE_ACCESS.matcher(candidateAccessToken).matches()) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "başvuru bulunamadı");
        }
        return store.listCandidate(publicRef, digest(candidateAccessToken));
    }

    public Outcome<WorkspaceResult> respond(
            String publicRef, String offerId, String candidateAccessToken,
            int expectedVersion, String idempotencyKey, OfferStatus target,
            Boolean processAcknowledged) {
        if (!validPublicRef(publicRef) || !validOfferId(offerId)
                || candidateAccessToken == null
                || !CANDIDATE_ACCESS.matcher(candidateAccessToken).matches()
                || expectedVersion < 0) return notFound();
        if (!validIdempotency(idempotencyKey)) return invalidKey();
        if ((target != OfferStatus.ACCEPTED && target != OfferStatus.DECLINED)
                || !Boolean.TRUE.equals(processAcknowledged)) {
            return Outcome.fail(OutcomeCode.INVALID,
                    "aday yanıtı ACCEPTED/DECLINED ve süreç onayı true olmalı");
        }
        String occurredAt = clock.instant().toString();
        String requestDigest = digest(String.join("|", "CANDIDATE_RESPONSE", publicRef,
                offerId, Integer.toString(expectedVersion), target.name(), "ack=true"));
        return store.respond(new CandidateResponseCommand(
                publicRef, offerId, digest(candidateAccessToken), expectedVersion,
                idempotencyKey, requestDigest, target, true, occurredAt));
    }

    private Outcome<Terms> normalizeTerms(Terms raw) {
        if (raw == null || raw.payPeriod() == null) return invalidTerms("teklif koşulları zorunlu");
        String roleTitle = text(raw.roleTitle());
        String employmentType = text(raw.employmentType());
        String workMode = text(raw.workMode()).toUpperCase(Locale.ROOT);
        String location = text(raw.location());
        String currency = text(raw.currency()).toUpperCase(Locale.ROOT);
        String summary = text(raw.termsSummary());
        if (roleTitle.length() < 2 || roleTitle.length() > 160) return invalidTerms("roleTitle 2..160 karakter olmalı");
        if (employmentType.length() < 2 || employmentType.length() > 120) return invalidTerms("employmentType 2..120 karakter olmalı");
        if (!List.of("REMOTE", "HYBRID", "ONSITE").contains(workMode)) return invalidTerms("workMode REMOTE/HYBRID/ONSITE olmalı");
        if (location.length() < 2 || location.length() > 240) return invalidTerms("location 2..240 karakter olmalı");
        if (raw.compensationAmount() == null || raw.compensationAmount().signum() <= 0
                || raw.compensationAmount().scale() > 2
                || raw.compensationAmount().compareTo(new BigDecimal("999999999999.99")) > 0) {
            return invalidTerms("compensationAmount pozitif ve en fazla 2 ondalık olmalı");
        }
        if (!CURRENCY.matcher(currency).matches()) return invalidTerms("currency ISO-4217 üç harf olmalı");
        if (summary.length() < 10 || summary.length() > 4000) return invalidTerms("termsSummary 10..4000 karakter olmalı");
        LocalDate startDate;
        Instant expiry;
        try {
            startDate = LocalDate.parse(raw.startDate());
            expiry = Instant.parse(raw.expiresAt());
        } catch (RuntimeException ex) {
            return invalidTerms("startDate ISO tarih, expiresAt ISO-8601 anı olmalı");
        }
        LocalDate today = LocalDate.ofInstant(clock.instant(), ZoneOffset.UTC);
        if (startDate.isBefore(today) || startDate.isAfter(today.plusYears(2))) {
            return invalidTerms("startDate bugün ile iki yıl içinde olmalı");
        }
        if (!expiry.isAfter(clock.instant().plus(1, ChronoUnit.HOURS))
                || expiry.isAfter(clock.instant().plus(90, ChronoUnit.DAYS))) {
            return invalidTerms("expiresAt bir saat ile 90 gün içinde olmalı");
        }
        return Outcome.ok(new Terms(
                roleTitle, startDate.toString(), employmentType, workMode, location,
                raw.compensationAmount(), currency, raw.payPeriod(), expiry.toString(), summary));
    }

    private static boolean validIdentity(TenantId tenant, ActorId actor) {
        return tenant != null && tenant.value() != null && !tenant.value().isBlank()
                && actor != null && actor.value() != null && !actor.value().isBlank();
    }

    private static boolean validPublicRef(String value) {
        return value != null && PUBLIC_REF.matcher(value).matches();
    }

    private static boolean validOfferId(String value) {
        return value != null && OFFER_ID.matcher(value).matches();
    }

    private static boolean validIdempotency(String value) {
        return value != null && IDEMPOTENCY.matcher(value).matches();
    }

    private static String text(String value) {
        return value == null ? "" : value.strip();
    }

    private static String reason(String value) {
        String normalized = text(value);
        return normalized.length() >= 5 && normalized.length() <= 500 ? normalized : null;
    }

    private String randomToken() {
        byte[] bytes = new byte[18];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String termsDigest(Terms terms) {
        return String.join("|", terms.roleTitle(), terms.startDate(), terms.employmentType(),
                terms.workMode(), terms.location(), terms.compensationAmount().toPlainString(),
                terms.currency(), terms.payPeriod().name(), terms.expiresAt(), terms.termsSummary());
    }

    private static String digest(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 yok", ex);
        }
    }

    private static <T> Outcome<T> invalidTerms(String reason) {
        return Outcome.fail(OutcomeCode.INVALID, reason);
    }

    private static Outcome<WorkspaceResult> invalidKey() {
        return Outcome.fail(OutcomeCode.INVALID, "idempotency key geçersiz");
    }

    private static Outcome<WorkspaceResult> invalidReason() {
        return Outcome.fail(OutcomeCode.INVALID, "reason 5..500 karakter olmalı");
    }

    private static Outcome<WorkspaceResult> invalidTransition() {
        return Outcome.fail(OutcomeCode.INVALID, "teklif geçiş isteği geçersiz");
    }

    private static Outcome<WorkspaceResult> notFound() {
        return Outcome.fail(OutcomeCode.NOT_FOUND, "teklif veya başvuru bulunamadı");
    }
}
