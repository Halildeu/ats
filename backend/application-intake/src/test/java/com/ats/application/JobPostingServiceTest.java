package com.ats.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.application.JobPostingService.JobDraft;
import com.ats.application.JobPostingStore.CreateCommand;
import com.ats.application.JobPostingStore.MutationResult;
import com.ats.application.JobPostingStore.MutationState;
import com.ats.application.JobPostingStore.TransitionCommand;
import com.ats.application.JobPostingStore.UpdateCommand;
import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;

class JobPostingServiceTest {

    private static final Instant NOW = Instant.parse("2026-07-17T12:00:00Z");
    private static final TenantId TENANT = new TenantId("tenant-a");
    private static final ActorId ACTOR = new ActorId("user-42");
    private static final String IDEM = "job-create-key-1234";

    @Test
    void create_normalizes_content_generates_safe_slug_and_starts_as_draft() {
        CapturingStore store = new CapturingStore();

        Outcome<MutationResult> out = service(store).create(TENANT, ACTOR, IDEM, draft(null));

        assertTrue(out.isOk());
        assertEquals("Urun Yöneticisi", store.create.content().title());
        assertTrue(store.create.content().slug().matches("urun-yoneticisi-[0-9a-f]{8}"));
        assertTrue(store.create.jobId().matches("job_[A-Za-z0-9_-]{24}"));
        assertEquals(64, store.create.requestDigest().length());
        assertEquals(TENANT, store.create.tenantId());
        assertEquals(ACTOR, store.create.actorId());
    }

    @Test
    void create_digest_is_stable_even_when_generated_job_id_and_slug_change() {
        CapturingStore first = new CapturingStore();
        CapturingStore second = new CapturingStore();

        service(first).create(TENANT, ACTOR, IDEM, draft(null));
        service(second).create(TENANT, ACTOR, IDEM, draft(null));

        assertNotEquals(first.create.jobId(), second.create.jobId());
        assertEquals(first.create.requestDigest(), second.create.requestDigest());
    }

    @Test
    void generated_slug_collapses_repeated_whitespace_and_punctuation() {
        CapturingStore store = new CapturingStore();
        JobDraft original = draft(null);
        JobDraft noisyTitle = new JobDraft(
                null, "  Senior   Product -- Manager  ", original.team(), original.location(),
                original.mode(), original.employmentType(), original.summary(),
                original.highlights(), original.applicationFields(), original.noticeVersion());

        assertTrue(service(store).create(TENANT, ACTOR, IDEM, noisyTitle).isOk());
        assertTrue(store.create.content().slug()
                .matches("senior-product-manager-[0-9a-f]{8}"));
    }

    @Test
    void update_requires_explicit_slug_and_expected_version() {
        var missingSlug = service(new CapturingStore()).update(
                TENANT, ACTOR, "job_" + "A".repeat(24), 0, "job-update-key-1234", draft(null));
        assertTrue(missingSlug instanceof Outcome.Fail<?> fail
                && fail.code() == OutcomeCode.INVALID && fail.reason().contains("slug"));

        var negativeVersion = service(new CapturingStore()).update(
                TENANT, ACTOR, "job_" + "A".repeat(24), -1, "job-update-key-1234",
                draft("urun-yoneticisi"));
        assertFalse(negativeVersion.isOk());
    }

    @Test
    void transition_is_closed_enum_and_carries_cas_plus_idempotency() {
        CapturingStore store = new CapturingStore();
        var out = service(store).transition(
                TENANT, ACTOR, "job_" + "A".repeat(24), 3,
                "job-publish-key-123", "PUBLISHED");

        assertTrue(out.isOk());
        assertEquals(JobPostingStatus.PUBLISHED, store.transition.target());
        assertEquals(3, store.transition.expectedVersion());
        assertEquals(64, store.transition.requestDigest().length());

        assertFalse(service(new CapturingStore()).transition(
                TENANT, ACTOR, "job_" + "A".repeat(24), 3,
                "job-publish-key-123", "LIVE").isOk());
    }

    @Test
    void lifecycle_allows_pause_resume_close_archive_but_no_reopen() {
        assertTrue(JobPostingStatus.DRAFT.canTransitionTo(JobPostingStatus.PUBLISHED));
        assertTrue(JobPostingStatus.PUBLISHED.canTransitionTo(JobPostingStatus.PAUSED));
        assertTrue(JobPostingStatus.PAUSED.canTransitionTo(JobPostingStatus.PUBLISHED));
        assertTrue(JobPostingStatus.CLOSED.canTransitionTo(JobPostingStatus.ARCHIVED));
        assertFalse(JobPostingStatus.CLOSED.canTransitionTo(JobPostingStatus.PUBLISHED));
        assertFalse(JobPostingStatus.ARCHIVED.canTransitionTo(JobPostingStatus.DRAFT));
    }

    @Test
    void publishing_fails_closed_without_an_active_public_career_site() {
        CapturingStore store = new CapturingStore();
        store.careerSiteActive = false;

        var out = service(store).transition(
                TENANT, ACTOR, "job_" + "A".repeat(24), 0,
                "job-publish-key-123", "PUBLISHED");

        assertTrue(out instanceof Outcome.Fail<?> fail
                && fail.code() == OutcomeCode.NOT_CONFIGURED
                && fail.reason().contains("kariyer sitesi"));
        assertEquals(null, store.transition);
    }

    @Test
    void application_form_contract_rejects_missing_core_unknown_or_duplicate_fields() {
        JobDraft valid = draft(null);
        JobDraft missingCore = new JobDraft(
                valid.slug(), valid.title(), valid.team(), valid.location(), valid.mode(),
                valid.employmentType(), valid.summary(), valid.highlights(),
                valid.applicationFields().stream().filter(field -> !"email".equals(field)).toList(),
                valid.noticeVersion());
        assertFalse(service(new CapturingStore()).create(TENANT, ACTOR, IDEM, missingCore).isOk());

        var unknown = new java.util.ArrayList<>(valid.applicationFields());
        unknown.set(unknown.size() - 1, "salaryExpectation");
        assertFalse(service(new CapturingStore()).create(TENANT, ACTOR, IDEM,
                new JobDraft(valid.slug(), valid.title(), valid.team(), valid.location(), valid.mode(),
                        valid.employmentType(), valid.summary(), valid.highlights(), unknown,
                        valid.noticeVersion())).isOk());

        var duplicate = new java.util.ArrayList<>(valid.applicationFields());
        duplicate.set(duplicate.size() - 1, "email");
        assertFalse(service(new CapturingStore()).create(TENANT, ACTOR, IDEM,
                new JobDraft(valid.slug(), valid.title(), valid.team(), valid.location(), valid.mode(),
                        valid.employmentType(), valid.summary(), valid.highlights(), duplicate,
                        valid.noticeVersion())).isOk());
    }

    private static JobPostingService service(JobPostingStore store) {
        return new JobPostingService(store, Clock.fixed(NOW, ZoneOffset.UTC), new SecureRandom());
    }

    private static JobDraft draft(String slug) {
        return new JobDraft(
                slug,
                " Urun Yöneticisi ",
                " Ürün ve Deneyim ",
                " İstanbul ",
                " Hibrit ",
                " Tam zamanlı ",
                "Kullanıcı ihtiyaçlarını ölçülebilir ürün sonuçlarına dönüştürün.",
                List.of(" Ürün keşfi ", "Ürün keşfi", "Yol haritası"),
                JobPostingService.DEFAULT_APPLICATION_FIELDS,
                JobPostingService.CURRENT_NOTICE_VERSION);
    }

    private static final class CapturingStore implements JobPostingStore {
        CreateCommand create;
        UpdateCommand update;
        TransitionCommand transition;
        boolean careerSiteActive = true;

        @Override public Outcome<List<JobPosting>> list(TenantId tenantId) {
            return Outcome.ok(List.of());
        }

        @Override public Outcome<JobPosting> find(TenantId tenantId, String jobId) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "yok");
        }
        @Override public Outcome<String> findActiveCareerHandle(TenantId tenantId) {
            return careerSiteActive
                    ? Outcome.ok("acik")
                    : Outcome.fail(OutcomeCode.NOT_FOUND, "yok");
        }

        @Override public Outcome<MutationResult> create(CreateCommand command) {
            this.create = command;
            return Outcome.ok(new MutationResult(MutationState.CREATED, job(command)));
        }

        @Override public Outcome<MutationResult> update(UpdateCommand command) {
            this.update = command;
            return Outcome.ok(new MutationResult(MutationState.UPDATED, null));
        }

        @Override public Outcome<MutationResult> transition(TransitionCommand command) {
            this.transition = command;
            return Outcome.ok(new MutationResult(MutationState.UPDATED, null));
        }

        private static JobPosting job(CreateCommand command) {
            var c = command.content();
            return new JobPosting(command.tenantId(), command.jobId(), c.slug(), c.title(), c.team(),
                    c.location(), c.mode(), c.employmentType(), c.summary(), c.highlights(),
                    c.applicationFields(), c.noticeVersion(),
                    JobPostingStatus.DRAFT, false, 0, command.occurredAt(), command.occurredAt());
        }
    }
}
