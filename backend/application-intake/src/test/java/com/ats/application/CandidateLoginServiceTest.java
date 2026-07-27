package com.ats.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * #235 giriş servisinin davranış kapsamı: enumeration sınırı, fail-closed
 * gönderim, kota, kod şekli ve oturum çözümü. Store fake — DB kapsamı
 * PostgresCandidateLoginStoreTest'te.
 */
class CandidateLoginServiceTest {

    private static final Instant NOW = Instant.parse("2026-07-28T09:00:00Z");
    private static final Clock CLOCK = Clock.fixed(NOW, ZoneOffset.UTC);

    @Test
    void unknownAddressLooksExactlyLikeASentCode() {
        FakeStore store = new FakeStore();
        store.hasApplications = false;
        FakeMail mail = new FakeMail(true);
        CandidateLoginService service = service(store, mail);

        Outcome<Void> outcome = service.requestCode("hicyok@example.test");

        // Aynı OK — cevap adresin kayıtlı olup olmadığını ayırt ettirmez.
        assertTrue(outcome.isOk());
        assertTrue(mail.sent.isEmpty(), "kayıtlı olmayan adrese kod gönderilmemeli");
        assertTrue(store.challenges.isEmpty(), "challenge da yazılmamalı");
    }

    @Test
    void quotaExhaustionAlsoLooksLikeSuccessButSendsNothing() {
        FakeStore store = new FakeStore();
        store.recentChallenges = CandidateLoginService.MAX_CODES_PER_WINDOW;
        FakeMail mail = new FakeMail(true);

        assertTrue(service(store, mail).requestCode("kota@example.test").isOk());
        assertTrue(mail.sent.isEmpty(), "kota dolduğunda yeni kod üretilmemeli");
    }

    @Test
    void sendsSixDigitCodeAndStoresOnlyItsDigest() {
        FakeStore store = new FakeStore();
        FakeMail mail = new FakeMail(true);

        assertTrue(service(store, mail).requestCode(" Aday@Example.TEST ").isOk());

        assertEquals(1, mail.sent.size());
        String code = mail.sent.get(0).code();
        assertTrue(code.matches("[0-9]{6}"), "kod 6 hane olmalı, gelen: " + code.length() + " karakter");
        assertEquals("aday@example.test", mail.sent.get(0).email(), "adres normalize gönderilmeli");
        assertEquals(1, store.challenges.size());
        String digest = store.challenges.get(0).codeDigest();
        assertTrue(digest.matches("[0-9a-f]{64}"), "yalnız digest saklanmalı");
        assertFalse(digest.contains(code), "düz metin kod digest'e sızmamalı");
    }

    @Test
    void refusesToPretendWhenDeliveryIsNotConfigured() {
        FakeStore store = new FakeStore();
        // Fail-closed: yapılandırma yoksa sessiz "gönderdim" YASAK — aday kod
        // bekler, kod gelmez ve arıza görünmez olurdu.
        Outcome<Void> outcome = service(store, new FakeMail(false)).requestCode("a@b.test");

        assertFalse(outcome.isOk());
        assertEquals(OutcomeCode.NOT_CONFIGURED, ((Outcome.Fail<Void>) outcome).code());
        assertTrue(store.challenges.isEmpty());
    }

    @Test
    void rejectsMalformedAddressBeforeTouchingTheStore() {
        FakeStore store = new FakeStore();
        Outcome<Void> outcome = service(store, new FakeMail(true)).requestCode("bos adres");

        assertEquals(OutcomeCode.INVALID, ((Outcome.Fail<Void>) outcome).code());
        assertEquals(0, store.countCalls, "geçersiz adres için DB'ye gidilmemeli");
    }

    @Test
    void verifyIssuesAnOpaqueSessionAndListsEveryApplication() {
        FakeStore store = new FakeStore();
        store.verifyState = CandidateLoginStore.VerifyState.VERIFIED;
        store.rows = List.of(row("app_A", "ilan-a"), row("app_B", "ilan-b"));
        CandidateLoginService service = service(store, new FakeMail(true));

        Outcome<String> verified = service.verify("Aday@Example.TEST", "123456");
        assertTrue(verified.isOk());
        String token = ((Outcome.Ok<String>) verified).value();
        assertTrue(token.matches("[A-Za-z0-9_-]{43}"), "oturum anahtarı opak 32 bayt olmalı");
        assertEquals(1, store.sessions.size());
        assertFalse(store.sessions.get(0).tokenDigest().contains(token),
                "oturum anahtarının düz metni saklanmamalı");
        assertEquals("aday@example.test", store.sessions.get(0).email());

        store.sessionEmail = "aday@example.test";
        Outcome<List<CandidateLoginStore.CandidateApplicationRow>> apps =
                service.applications(token);
        assertEquals(2, ((Outcome.Ok<List<CandidateLoginStore.CandidateApplicationRow>>) apps)
                .value().size());
    }

    @Test
    void lockedChallengeTellsTheCandidateToRequestANewCode() {
        FakeStore store = new FakeStore();
        store.verifyState = CandidateLoginStore.VerifyState.LOCKED;

        Outcome<String> outcome = service(store, new FakeMail(true)).verify("a@b.test", "000000");

        assertEquals(OutcomeCode.DENIED, ((Outcome.Fail<String>) outcome).code());
        assertTrue(((Outcome.Fail<String>) outcome).reason().contains("new code"));
    }

    @Test
    void malformedCodeAndSessionNeverReachTheStore() {
        FakeStore store = new FakeStore();
        CandidateLoginService service = service(store, new FakeMail(true));

        assertEquals(OutcomeCode.INVALID,
                ((Outcome.Fail<String>) service.verify("a@b.test", "12ab56")).code());
        assertEquals(OutcomeCode.UNAUTHENTICATED,
                ((Outcome.Fail<List<CandidateLoginStore.CandidateApplicationRow>>)
                        service.applications("kisa")).code());
        assertEquals(0, store.verifyCalls);
        assertEquals(0, store.sessionLookups);
    }

    @Test
    void expiredSessionIsUnauthenticatedNotNotFound() {
        FakeStore store = new FakeStore();
        store.sessionEmail = null; // bulunamadı
        String token = "a".repeat(43);

        var outcome = service(store, new FakeMail(true)).applications(token);

        // NOT_FOUND sızdırmak "bu anahtar bir zamanlar vardı" bilgisi verirdi;
        // uç tek tip 401 görmeli.
        assertEquals(OutcomeCode.UNAUTHENTICATED,
                ((Outcome.Fail<List<CandidateLoginStore.CandidateApplicationRow>>) outcome).code());
    }

    private static CandidateLoginService service(FakeStore store, FakeMail mail) {
        return new CandidateLoginService(store, mail, CLOCK, new SecureRandom());
    }

    private static CandidateLoginStore.CandidateApplicationRow row(String ref, String slug) {
        return new CandidateLoginStore.CandidateApplicationRow(
                ref, slug, "İlan", ApplicationStatus.SUBMITTED, NOW.toString(), NOW.toString());
    }

    private record SentMail(String email, String code) {}

    private static final class FakeMail implements OtpMailSender {
        private final boolean configured;
        private final List<SentMail> sent = new ArrayList<>();

        FakeMail(boolean configured) {
            this.configured = configured;
        }

        @Override
        public boolean configured() {
            return configured;
        }

        @Override
        public Outcome<Void> sendLoginCode(String email, String code) {
            sent.add(new SentMail(email, code));
            return Outcome.ok(null);
        }
    }

    private record StoredChallenge(String email, String codeDigest) {}

    private record StoredSession(String tokenDigest, String email) {}

    private static final class FakeStore implements CandidateLoginStore {
        private boolean hasApplications = true;
        private int recentChallenges = 0;
        private VerifyState verifyState = VerifyState.INVALID;
        private String sessionEmail = null;
        private List<CandidateApplicationRow> rows = List.of();
        private final List<StoredChallenge> challenges = new ArrayList<>();
        private final List<StoredSession> sessions = new ArrayList<>();
        private int countCalls = 0;
        private int verifyCalls = 0;
        private int sessionLookups = 0;

        @Override
        public Outcome<Integer> countChallengesSince(String emailNormalized, String sinceIso) {
            countCalls++;
            return Outcome.ok(recentChallenges);
        }

        @Override
        public Outcome<Boolean> hasApplications(String emailNormalized) {
            return Outcome.ok(hasApplications);
        }

        @Override
        public Outcome<Void> insertChallenge(
                String email, String codeDigest, String createdAt, String expiresAt) {
            challenges.add(new StoredChallenge(email, codeDigest));
            return Outcome.ok(null);
        }

        @Override
        public Outcome<VerifyState> verifyChallenge(
                String email, String codeDigest, String nowIso, int maxAttempts) {
            verifyCalls++;
            return Outcome.ok(verifyState);
        }

        @Override
        public Outcome<Void> insertSession(
                String tokenDigest, String email, String createdAt, String expiresAt) {
            sessions.add(new StoredSession(tokenDigest, email));
            return Outcome.ok(null);
        }

        @Override
        public Outcome<String> findSessionEmail(String tokenDigest, String nowIso) {
            sessionLookups++;
            assertNotNull(tokenDigest);
            return sessionEmail == null
                    ? Outcome.fail(OutcomeCode.NOT_FOUND, "session not found")
                    : Outcome.ok(sessionEmail);
        }

        @Override
        public Outcome<List<CandidateApplicationRow>> listApplicationsByEmail(String email) {
            return Outcome.ok(rows);
        }
    }
}
