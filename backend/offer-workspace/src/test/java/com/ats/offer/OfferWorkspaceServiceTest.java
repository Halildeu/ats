package com.ats.offer;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;

import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.offer.OfferStore.CandidateOfferView;
import com.ats.offer.OfferStore.CandidateResponseCommand;
import com.ats.offer.OfferStore.CreateCommand;
import com.ats.offer.OfferStore.RecruiterTransitionCommand;
import com.ats.offer.OfferStore.Terms;
import com.ats.offer.OfferStore.UpdateCommand;
import com.ats.offer.OfferStore.WorkspaceResult;
import java.math.BigDecimal;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;

class OfferWorkspaceServiceTest {
    private static final Instant NOW = Instant.parse("2026-07-18T10:00:00Z");
    private final CapturingStore store = new CapturingStore();
    private final OfferWorkspaceService service = new OfferWorkspaceService(
            store, Clock.fixed(NOW, ZoneOffset.UTC), new SecureRandom());

    @Test
    void normalizesCommercialTermsAndNeverPassesCandidateTokenToStore() {
        var out = service.create(new TenantId("tenant-1"), new ActorId("recruiter-1"),
                "app_abcdefghijklmnopqrstuvwx", "offer-command-key-1234", terms());
        assertInstanceOf(Outcome.Ok.class, out);
        assertEquals("TRY", store.created.terms().currency());
        assertEquals("REMOTE", store.created.terms().workMode());

        service.listCandidate("app_abcdefghijklmnopqrstuvwx", "A".repeat(43));
        assertEquals(64, store.candidateDigest.length());
        assertEquals(false, store.candidateDigest.contains("AAAA"));
    }

    @Test
    void rejectsExpiredWindowAndCandidateResponseWithoutExplicitAcknowledgement() {
        Terms expired = new Terms(
                "Ürün Yöneticisi", "2026-08-01", "Tam zamanlı", "REMOTE", "Türkiye",
                new BigDecimal("100000.00"), "TRY", OfferPayPeriod.MONTHLY,
                "2026-07-18T10:30:00Z", "Sentetik teklif koşulları özeti.");
        assertInstanceOf(Outcome.Fail.class, service.create(
                new TenantId("tenant-1"), new ActorId("recruiter-1"),
                "app_abcdefghijklmnopqrstuvwx", "offer-command-key-1234", expired));
        assertInstanceOf(Outcome.Fail.class, service.respond(
                "app_abcdefghijklmnopqrstuvwx", "off_abcdefghijklmnopqrstuvwx",
                "A".repeat(43), 0, "candidate-response-key-1", OfferStatus.ACCEPTED, false));
    }

    @Test
    void recruiterCannotUseCandidateOnlyTransition() {
        assertInstanceOf(Outcome.Fail.class, service.transition(
                new TenantId("tenant-1"), new ActorId("recruiter-1"),
                "app_abcdefghijklmnopqrstuvwx", "off_abcdefghijklmnopqrstuvwx", 0,
                "offer-transition-key-1", OfferStatus.ACCEPTED, "Aday kabul etti"));
    }

    private static Terms terms() {
        return new Terms(
                " Ürün Yöneticisi ", "2026-08-01", " Tam zamanlı ", "remote", " Türkiye ",
                new BigDecimal("100000.00"), "try", OfferPayPeriod.MONTHLY,
                "2026-07-25T10:00:00Z", " Sentetik teklif koşulları özeti. ");
    }

    private static final class CapturingStore implements OfferStore {
        CreateCommand created;
        String candidateDigest;

        @Override public Outcome<WorkspaceResult> create(CreateCommand command) {
            created = command;
            return Outcome.ok(new WorkspaceResult(CommandState.CREATED, null));
        }
        @Override public Outcome<List<OfferWorkspace>> listRecruiter(TenantId tenantId, String ref) {
            return Outcome.ok(List.of());
        }
        @Override public Outcome<OfferWorkspace> findRecruiter(TenantId tenantId, String ref, String id) {
            return Outcome.fail(com.ats.kernel.OutcomeCode.NOT_FOUND, "yok");
        }
        @Override public Outcome<WorkspaceResult> update(UpdateCommand command) {
            return Outcome.ok(new WorkspaceResult(CommandState.UPDATED, null));
        }
        @Override public Outcome<WorkspaceResult> transition(RecruiterTransitionCommand command) {
            return Outcome.ok(new WorkspaceResult(CommandState.UPDATED, null));
        }
        @Override public Outcome<List<CandidateOfferView>> listCandidate(String ref, String digest) {
            candidateDigest = digest;
            return Outcome.ok(List.of());
        }
        @Override public Outcome<WorkspaceResult> respond(CandidateResponseCommand command) {
            return Outcome.ok(new WorkspaceResult(CommandState.UPDATED, null));
        }
    }
}
