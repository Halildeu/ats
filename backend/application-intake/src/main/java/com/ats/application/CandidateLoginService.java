package com.ats.application;

import com.ats.application.CandidateLoginStore.CandidateApplicationRow;
import com.ats.application.CandidateLoginStore.VerifyState;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * #235: aday girişi — e-posta sahipliği kanıtı üzerinden kısa ömürlü oturum.
 *
 * <p>Ölçülen boşluk: aday erişimi başvuru-başına anahtardı; anahtar kaybolunca
 * kurtarma yoktu ve aynı adayın başvuruları tek yerden görünmüyordu (#226'nın
 * kökü). Bu servis adrese kod gönderir, doğrulanınca o adresin TÜM başvurularını
 * tek oturumla okutur.
 *
 * <p>Enumeration sınırı: istek ucu adresin sistemde olup olmadığını ASLA
 * söylemez — kayıtlı olmayan adres, sıklık sınırına takılan adres ve kod
 * gönderilen adres aynı cevabı alır. Tek istisna gönderim altyapısının kendisi
 * çalışmıyorken dönen NOT_CONFIGURED/hata: sahte "gönderdim" başarısından
 * (No Fake Work) daha küçük bir sızıntı yüzeyidir ve adres-bağımsızdır.
 */
public final class CandidateLoginService {

    static final Duration CODE_TTL = Duration.ofMinutes(10);
    /** Uç, adaya kalan süreyi bildirmek için okur — public. */
    public static final Duration SESSION_TTL = Duration.ofMinutes(30);
    /** Pencere başına adres kotası — mail bombing guard'ı (DB'de sayılır). */
    static final int MAX_CODES_PER_WINDOW = 5;
    static final Duration CODE_REQUEST_WINDOW = Duration.ofMinutes(30);
    static final int MAX_VERIFY_ATTEMPTS = 5;

    /** Basit şekil kontrolü — RFC tam doğrulaması değil; boşluksuz local@domain.tld. */
    private static final Pattern EMAIL_SHAPE =
            Pattern.compile("[^@\\s]{1,64}@[^@\\s]+\\.[^@\\s]{2,}");
    private static final Pattern CODE_SHAPE = Pattern.compile("[0-9]{6}");
    /** Oturum anahtarı, başvuru erişim anahtarıyla aynı biçim: 32 bayt base64url. */
    private static final Pattern SESSION_TOKEN_SHAPE = Pattern.compile("[A-Za-z0-9_-]{43}");

    private final CandidateLoginStore store;
    private final OtpMailSender mailSender;
    private final Clock clock;
    private final SecureRandom random;

    public CandidateLoginService(
            CandidateLoginStore store, OtpMailSender mailSender, Clock clock, SecureRandom random) {
        this.store = store;
        this.mailSender = mailSender;
        this.clock = clock;
        this.random = random;
    }

    /**
     * Kod istek akışı. OK = "istek alındı" — kod gönderildi ANLAMINA GELMEZ;
     * adres kayıtlı değilse veya kota dolduysa da OK döner (enumeration).
     */
    public Outcome<Void> requestCode(String email) {
        if (!mailSender.configured()) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "code delivery is not configured");
        }
        if (email == null || !EMAIL_SHAPE.matcher(email.trim()).matches()
                || email.trim().length() > 320) {
            return Outcome.fail(OutcomeCode.INVALID, "email shape is invalid");
        }
        String normalized = normalize(email);
        Instant now = clock.instant();

        Outcome<Integer> recent = store.countChallengesSince(
                normalized, now.minus(CODE_REQUEST_WINDOW).toString());
        if (!(recent instanceof Outcome.Ok<Integer> recentOk)) {
            return propagate(recent);
        }
        if (recentOk.value() >= MAX_CODES_PER_WINDOW) {
            return Outcome.ok(null); // kota doldu — sessiz OK, yeni kod üretme
        }

        Outcome<Boolean> exists = store.hasApplications(normalized);
        if (!(exists instanceof Outcome.Ok<Boolean> existsOk)) {
            return propagate(exists);
        }
        if (!existsOk.value()) {
            return Outcome.ok(null); // adres kayıtlı değil — aynı cevap
        }

        String code = String.format(Locale.ROOT, "%06d", random.nextInt(1_000_000));
        Outcome<Void> inserted = store.insertChallenge(
                normalized, sha256Hex(code), now.toString(), now.plus(CODE_TTL).toString());
        if (!inserted.isOk()) {
            return inserted;
        }
        // Önce kayıt sonra gönderim: gönderilmiş ama doğrulanamayan kod (kayıt
        // hatası) adayı kilitler; kayıtlı ama gönderilememiş kod yalnız yeni
        // istek gerektirir ve hata dürüstçe yüzeye çıkar.
        return mailSender.sendLoginCode(normalized, code);
    }

    /** Doğrulama: başarıda kısa ömürlü oturum anahtarının DÜZ METNİ döner (tek sefer). */
    public Outcome<String> verify(String email, String code) {
        if (email == null || code == null || !CODE_SHAPE.matcher(code).matches()) {
            return Outcome.fail(OutcomeCode.INVALID, "code is invalid or expired");
        }
        String normalized = normalize(email);
        Instant now = clock.instant();
        Outcome<VerifyState> verified = store.verifyChallenge(
                normalized, sha256Hex(code), now.toString(), MAX_VERIFY_ATTEMPTS);
        if (!(verified instanceof Outcome.Ok<VerifyState> ok)) {
            return propagate(verified);
        }
        return switch (ok.value()) {
            case VERIFIED -> issueSession(normalized, now);
            case INVALID -> Outcome.fail(OutcomeCode.INVALID, "code is invalid or expired");
            // Kilit ayrı mesaj taşır: aday "yeni kod iste" aksiyonunu ancak
            // böyle öğrenir; saldırgan zaten davranıştan çıkarabilirdi.
            case LOCKED -> Outcome.fail(
                    OutcomeCode.DENIED, "too many attempts; request a new code");
        };
    }

    private Outcome<String> issueSession(String emailNormalized, Instant now) {
        byte[] raw = new byte[32];
        random.nextBytes(raw);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        Outcome<Void> inserted = store.insertSession(
                sha256Hex(token), emailNormalized,
                now.toString(), now.plus(SESSION_TTL).toString());
        if (!inserted.isOk()) {
            return propagate(inserted);
        }
        return Outcome.ok(token);
    }

    /** Oturumla adresin tüm başvuruları. Uyuşmayan/bitmiş oturum tek tip UNAUTHENTICATED. */
    public Outcome<List<CandidateApplicationRow>> applications(String sessionToken) {
        if (sessionToken == null || !SESSION_TOKEN_SHAPE.matcher(sessionToken).matches()) {
            return Outcome.fail(OutcomeCode.UNAUTHENTICATED, "session is invalid or expired");
        }
        Outcome<String> session =
                store.findSessionEmail(sha256Hex(sessionToken), clock.instant().toString());
        if (!(session instanceof Outcome.Ok<String> ok)) {
            return session instanceof Outcome.Fail<String> f && f.code() == OutcomeCode.NOT_FOUND
                    ? Outcome.fail(OutcomeCode.UNAUTHENTICATED, "session is invalid or expired")
                    : propagate(session);
        }
        return store.listApplicationsByEmail(ok.value());
    }

    /** #229 İK eşleşmesiyle aynı normalizasyon — iki yüzey aynı kimliği görmeli. */
    private static String normalize(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }

    private static <T, S> Outcome<T> propagate(Outcome<S> failed) {
        Outcome.Fail<S> f = (Outcome.Fail<S>) failed;
        return Outcome.fail(f.code(), f.reason());
    }

    private static String sha256Hex(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 is required", ex);
        }
    }
}
