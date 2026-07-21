package com.ats.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.application.ApplicationStore.ApplicationPage;
import com.ats.application.ApplicationStore.CandidateStatusView;
import com.ats.application.ApplicationStore.SubmitCommand;
import com.ats.application.ApplicationStore.SubmitResult;
import com.ats.application.ApplicationStore.TransitionCommand;
import com.ats.application.ApplicationStore.TransitionResult;
import com.ats.application.ResumeImportService.ProposalDraft;
import com.ats.application.ResumeImportService.Provenance;
import com.ats.application.ResumeImportService.ResumeField;
import com.ats.application.ResumeImportStore.AttachResult;
import com.ats.application.ResumeImportStore.AttachState;
import com.ats.application.ResumeImportStore.ConfirmResult;
import com.ats.application.ResumeImportStore.CreateResult;
import com.ats.application.ResumeImportStore.FieldResult;
import com.ats.application.ResumeImportStore.TerminateResult;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;

class ResumeImportServiceTest {

    @Test
    void parser_capacity_has_no_queue_and_fails_closed_while_worker_is_busy() throws Exception {
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ResumeDocumentParser blockingParser = (bytes, pages) -> {
            started.countDown();
            try {
                if (!release.await(5, TimeUnit.SECONDS)) {
                    return Outcome.fail(OutcomeCode.INVALID, "test parser timeout");
                }
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                return Outcome.fail(OutcomeCode.INVALID, "test parser interrupted");
            }
            return Outcome.ok(new ResumeDocumentParser.ParseResult(
                    List.of(new ProposalDraft(
                            ResumeField.EMAIL,
                            "synthetic@example.test",
                            new Provenance(1, 10, 10, 100, 12, 0.99, "test-parser"))),
                    1, 0, 0, "test-parser"));
        };
        try (ResumeImportService service = new ResumeImportService(
                new AttachOnlyStore(), new UnusedApplicationStore(), blockingParser,
                bytes -> Outcome.ok(ResumeImportService.ScanDecision.CLEAN),
                new TenantId("test-tenant"),
                Clock.fixed(Instant.parse("2026-07-18T12:00:00Z"), ZoneOffset.UTC),
                new SecureRandom(), 1024, 2, true, 1)) {
            byte[] pdf = "%PDF-synthetic".getBytes(java.nio.charset.StandardCharsets.US_ASCII);
            CompletableFuture<Outcome<AttachResult>> first = CompletableFuture.supplyAsync(() ->
                    service.upload("ri_" + "A".repeat(24), "R".repeat(43), 0,
                            "upload-key-00000001", pdf));
            assertTrue(started.await(2, TimeUnit.SECONDS));

            Outcome<AttachResult> saturated = service.upload(
                    "ri_" + "B".repeat(24), "S".repeat(43), 0,
                    "upload-key-00000002", pdf);
            assertTrue(saturated instanceof Outcome.Fail<AttachResult> fail
                    && fail.code() == OutcomeCode.DENIED);

            release.countDown();
            assertEquals(AttachState.ATTACHED,
                    first.get(2, TimeUnit.SECONDS).asOptional().orElseThrow().state());
        } finally {
            release.countDown();
        }
    }

    private static final class AttachOnlyStore implements ResumeImportStore {
        @Override public Outcome<CreateResult> create(CreateCommand command) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "unused");
        }
        @Override public Outcome<ResumeImportService.ResumeImport> find(
                String importId, String digest, String occurredAt) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "unused");
        }
        @Override public Outcome<ReserveUploadResult> reserveUpload(ReserveUploadCommand command) {
            return Outcome.ok(new ReserveUploadResult(ReserveUploadState.RESERVED, null));
        }
        @Override public Outcome<Void> releaseUpload(
                String importId, String digest, String key, String documentDigest, String occurredAt) {
            return Outcome.ok(null);
        }
        @Override public Outcome<AttachResult> attach(
                AttachCommand command, List<ProposalDraft> proposals) {
            return Outcome.ok(new AttachResult(AttachState.ATTACHED, null));
        }
        @Override public Outcome<FieldResult> updateField(FieldCommand command) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "unused");
        }
        @Override public Outcome<ConfirmResult> confirm(ConfirmCommand command) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "unused");
        }
        @Override public Outcome<TerminateResult> terminate(TerminateCommand command) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "unused");
        }
        @Override public Outcome<ReplaceResult> replace(ReplaceCommand command) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "unused");
        }
        @Override public Outcome<Integer> purgeDue(String occurredAt, int limit) {
            return Outcome.ok(0);
        }
        @Override public Outcome<ResumeImportService.ResumeDraft> findConfirmedDraft(
                TenantId tenantId, String jobId, String digest, String importId,
                int version, String nowIso) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "unused");
        }
        @Override public Outcome<Map<ResumeImportService.ImportState, Long>> countStates(
                TenantId tenantId) {
            return Outcome.ok(Map.of());
        }
    }

    private static final class UnusedApplicationStore implements ApplicationStore {
        @Override public Outcome<List<JobPosting>> listPublishedJobs(TenantId tenantId) {
            return Outcome.ok(List.of());
        }
        @Override public Outcome<JobPosting> findPublishedJob(TenantId tenantId, String slug) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "unused");
        }
        @Override public Outcome<TenantId> resolveActiveCareerTenant(String handle) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "unused");
        }
        @Override public Outcome<SubmitResult> submit(SubmitCommand command) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "unused");
        }
        @Override public Outcome<CandidateStatusView> findCandidateStatus(String ref, String digest) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "unused");
        }
        @Override public Outcome<ApplicationPage> listRecruiterApplications(
                TenantId tenantId, String slug, ApplicationStatus status, int page, int size) {
            return Outcome.ok(new ApplicationPage(List.of(), page, size, 0));
        }
        @Override public Outcome<RecruiterApplicationDetail> findRecruiterApplication(
                TenantId tenantId, String publicRef) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "unused");
        }
        @Override public Outcome<TransitionResult> transition(TransitionCommand command) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "unused");
        }
        @Override public Outcome<TransitionResult> withdrawCandidate(
                String publicRef, String candidateAccessDigest, String occurredAt) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "unused");
        }
        @Override public Outcome<EvaluationResult> submitEvaluation(EvaluationCommand command) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "unused");
        }
    }
}
