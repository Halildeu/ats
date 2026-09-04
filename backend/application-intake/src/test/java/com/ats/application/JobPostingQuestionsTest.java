package com.ats.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.application.ApplicationQuestion.Kind;
import com.ats.application.ApplicationQuestion.Option;
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
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * #240 dilim A — ilana özel başvuru sorularının kaynak-kapsam sözleşmesi.
 *
 * <p>Onaylı sözleşmenin asgari test matrisi: adet sınırı, metin sınırları, benzersizlik
 * (order/questionId/optionId), tip-options çapraz matrisi, reorder sonrası SABİT kimlik ve
 * idempotency digest davranışı.
 */
class JobPostingQuestionsTest {

    private static final Instant NOW = Instant.parse("2026-09-04T12:00:00Z");
    private static final TenantId TENANT = new TenantId("tenant-a");
    private static final ActorId ACTOR = new ActorId("user-42");
    private static final String IDEM = "job-create-key-1234";
    private static final String JOB_ID = "job_AAAAAAAAAAAAAAAAAAAAAAAA";

    // --- adet sınırı: 0..10 geçerli, 11 red -------------------------------------------------

    @Test
    void ten_questions_accepted_and_eleven_rejected() {
        CapturingStore store = new CapturingStore();
        assertTrue(service(store).create(TENANT, ACTOR, IDEM, draft(shortTexts(10))).isOk());
        assertEquals(10, store.create.content().questions().size());

        assertFalse(service(new CapturingStore())
                .create(TENANT, ACTOR, IDEM, draft(shortTexts(11))).isOk());
    }

    @Test
    void absent_questions_are_an_empty_list_not_null() {
        CapturingStore store = new CapturingStore();
        assertTrue(service(store).create(TENANT, ACTOR, IDEM, draft(null)).isOk());
        assertEquals(List.of(), store.create.content().questions());
    }

    // --- metin sınırları --------------------------------------------------------------------

    @Test
    void question_text_must_be_two_to_five_hundred_characters_after_trim() {
        assertFalse(create(question(1, "  ", Kind.SHORT_TEXT)).isOk());
        assertFalse(create(question(1, "a", Kind.SHORT_TEXT)).isOk());
        assertFalse(create(question(1, "a".repeat(501), Kind.SHORT_TEXT)).isOk());
        assertTrue(create(question(1, "ab", Kind.SHORT_TEXT)).isOk());
        assertTrue(create(question(1, "a".repeat(500), Kind.SHORT_TEXT)).isOk());
    }

    @Test
    void whitespace_only_padding_is_trimmed_before_the_length_check() {
        CapturingStore store = new CapturingStore();
        assertTrue(service(store)
                .create(TENANT, ACTOR, IDEM, draft(List.of(
                        question(1, "   Hangi teknolojilerle çalıştınız?   ", Kind.LONG_TEXT))))
                .isOk());
        assertEquals("Hangi teknolojilerle çalıştınız?",
                store.create.content().questions().get(0).text());
    }

    // --- benzersizlik -----------------------------------------------------------------------

    @Test
    void duplicate_order_is_rejected() {
        assertFalse(create(
                question(2, "Birinci soru", Kind.SHORT_TEXT),
                question(2, "İkinci soru", Kind.SHORT_TEXT)).isOk());
    }

    @Test
    void duplicate_client_supplied_question_id_is_rejected() {
        String id = "q_" + "A".repeat(16);
        assertFalse(create(
                new ApplicationQuestion(id, 1, "Birinci soru", Kind.SHORT_TEXT, false, List.of()),
                new ApplicationQuestion(id, 2, "İkinci soru", Kind.SHORT_TEXT, false, List.of()))
                .isOk());
    }

    @Test
    void duplicate_option_id_is_rejected() {
        String optionId = "qo_" + "A".repeat(12);
        assertFalse(create(new ApplicationQuestion(
                null, 1, "Hangi çalışma modunu tercih edersiniz?", Kind.SINGLE_CHOICE, true,
                List.of(new Option(optionId, "Ofis"), new Option(optionId, "Uzaktan")))).isOk());
    }

    @Test
    void duplicate_option_label_is_rejected() {
        assertFalse(create(new ApplicationQuestion(
                null, 1, "Hangi çalışma modunu tercih edersiniz?", Kind.SINGLE_CHOICE, true,
                List.of(new Option(null, "Ofis"), new Option(null, " ofis ")))).isOk());
    }

    @Test
    void client_supplied_question_id_outside_the_server_format_is_rejected() {
        assertFalse(create(new ApplicationQuestion(
                "1", 1, "Birinci soru", Kind.SHORT_TEXT, false, List.of())).isOk());
    }

    // --- tip / options çapraz matrisi --------------------------------------------------------

    @Test
    void single_choice_requires_at_least_two_non_empty_unique_options() {
        assertFalse(create(new ApplicationQuestion(
                null, 1, "Tercihiniz nedir?", Kind.SINGLE_CHOICE, true, List.of())).isOk());
        assertFalse(create(new ApplicationQuestion(
                null, 1, "Tercihiniz nedir?", Kind.SINGLE_CHOICE, true,
                List.of(new Option(null, "Tek")))).isOk());
        assertFalse(create(new ApplicationQuestion(
                null, 1, "Tercihiniz nedir?", Kind.SINGLE_CHOICE, true,
                List.of(new Option(null, "Ofis"), new Option(null, "  ")))).isOk());
        assertTrue(create(new ApplicationQuestion(
                null, 1, "Tercihiniz nedir?", Kind.SINGLE_CHOICE, true,
                List.of(new Option(null, "Ofis"), new Option(null, "Uzaktan")))).isOk());
    }

    @Test
    void options_are_dropped_for_every_kind_except_single_choice() {
        for (Kind kind : List.of(Kind.SHORT_TEXT, Kind.LONG_TEXT, Kind.YES_NO)) {
            CapturingStore store = new CapturingStore();
            Outcome<MutationResult> out = service(store).create(TENANT, ACTOR, IDEM, draft(List.of(
                    new ApplicationQuestion(null, 1, "Bir soru", kind, false,
                            List.of(new Option(null, "Ofis"), new Option(null, "Uzaktan"))))));
            assertTrue(out.isOk(), kind.name());
            assertEquals(List.of(), store.create.content().questions().get(0).options(), kind.name());
        }
    }

    @Test
    void unknown_kind_is_rejected_and_never_falls_back_to_free_text() {
        assertEquals(null, ApplicationQuestion.kindOf("MULTI_CHOICE"));
        assertFalse(create(new ApplicationQuestion(
                null, 1, "Bir soru", ApplicationQuestion.kindOf("MULTI_CHOICE"), false, List.of()))
                .isOk());
    }

    // --- kimlik: order KİMLİK DEĞİL ----------------------------------------------------------

    @Test
    void server_assigns_opaque_ids_to_new_questions_and_options() {
        CapturingStore store = new CapturingStore();
        assertTrue(service(store).create(TENANT, ACTOR, IDEM, draft(List.of(
                new ApplicationQuestion(null, 1, "Tercihiniz nedir?", Kind.SINGLE_CHOICE, true,
                        List.of(new Option(null, "Ofis"), new Option(null, "Uzaktan")))))).isOk());

        ApplicationQuestion saved = store.create.content().questions().get(0);
        assertTrue(ApplicationQuestion.QUESTION_ID.matcher(saved.questionId()).matches());
        for (Option option : saved.options()) {
            assertTrue(ApplicationQuestion.OPTION_ID.matcher(option.optionId()).matches());
        }
        assertNotEquals(saved.options().get(0).optionId(), saved.options().get(1).optionId());
    }

    @Test
    void question_id_survives_reorder_and_text_edit() {
        CapturingStore store = new CapturingStore();
        service(store).create(TENANT, ACTOR, IDEM, draft(List.of(
                question(1, "Birinci soru", Kind.SHORT_TEXT),
                question(2, "İkinci soru", Kind.SHORT_TEXT))));
        List<ApplicationQuestion> created = store.create.content().questions();
        String firstId = created.get(0).questionId();
        String secondId = created.get(1).questionId();

        // aynı sorular: sıra ters çevrildi ve metin düzeltildi — kimlik DEĞİŞMEMELİ
        CapturingStore after = new CapturingStore();
        service(after).update(TENANT, ACTOR, JOB_ID, 0, "job-update-key-1234", draft("bir-ilan",
                List.of(
                        new ApplicationQuestion(secondId, 1, "İkinci soru (düzeltildi)",
                                Kind.SHORT_TEXT, false, List.of()),
                        new ApplicationQuestion(firstId, 2, "Birinci soru", Kind.SHORT_TEXT,
                                false, List.of()))));

        List<ApplicationQuestion> updated = after.update.content().questions();
        assertEquals(secondId, updated.get(0).questionId());
        assertEquals(firstId, updated.get(1).questionId());
        assertEquals("İkinci soru (düzeltildi)", updated.get(0).text());
    }

    @Test
    void questions_are_stored_in_deterministic_order_regardless_of_request_order() {
        CapturingStore store = new CapturingStore();
        service(store).create(TENANT, ACTOR, IDEM, draft(List.of(
                question(3, "Üçüncü soru", Kind.SHORT_TEXT),
                question(1, "Birinci soru", Kind.SHORT_TEXT),
                question(2, "İkinci soru", Kind.SHORT_TEXT))));

        assertEquals(List.of(1, 2, 3), store.create.content().questions().stream()
                .map(ApplicationQuestion::order).toList());
    }

    // --- idempotency digest -----------------------------------------------------------------

    @Test
    void questions_are_part_of_the_request_digest() {
        CapturingStore without = new CapturingStore();
        CapturingStore with = new CapturingStore();
        service(without).create(TENANT, ACTOR, IDEM, draft(null));
        service(with).create(TENANT, ACTOR, IDEM, draft(List.of(
                question(1, "Birinci soru", Kind.SHORT_TEXT))));

        assertNotEquals(without.create.requestDigest(), with.create.requestDigest());
    }

    @Test
    void editing_only_a_question_changes_the_digest() {
        CapturingStore first = new CapturingStore();
        CapturingStore second = new CapturingStore();
        service(first).create(TENANT, ACTOR, IDEM, draft(List.of(
                question(1, "Birinci soru", Kind.SHORT_TEXT))));
        service(second).create(TENANT, ACTOR, IDEM, draft(List.of(
                question(1, "Birinci soru?", Kind.SHORT_TEXT))));

        assertNotEquals(first.create.requestDigest(), second.create.requestDigest());
    }

    /**
     * Retry güvenliği: aynı istek iki kez gönderildiğinde sunucu her seferinde YENİ rastgele
     * kimlik üretir. Digest bu rastgeleliği içerseydi ikinci deneme sahte
     * {@code IDEMPOTENCY_CONFLICT}'e düşer, yani ağ hatası sonrası tekrar imkânsız olurdu.
     */
    @Test
    void digest_is_stable_across_retries_although_server_ids_differ() {
        CapturingStore first = new CapturingStore();
        CapturingStore second = new CapturingStore();
        JobDraft body = draft(List.of(question(1, "Birinci soru", Kind.SHORT_TEXT)));
        service(first).create(TENANT, ACTOR, IDEM, body);
        service(second).create(TENANT, ACTOR, IDEM, body);

        assertNotEquals(
                first.create.content().questions().get(0).questionId(),
                second.create.content().questions().get(0).questionId());
        assertEquals(first.create.requestDigest(), second.create.requestDigest());
    }

    // --- yardımcılar --------------------------------------------------------------------------

    private static Outcome<MutationResult> create(ApplicationQuestion... questions) {
        return service(new CapturingStore())
                .create(TENANT, ACTOR, IDEM, draft(List.of(questions)));
    }

    private static ApplicationQuestion question(int order, String text, Kind kind) {
        return new ApplicationQuestion(null, order, text, kind, false, List.of());
    }

    private static List<ApplicationQuestion> shortTexts(int count) {
        List<ApplicationQuestion> out = new ArrayList<>();
        for (int i = 1; i <= count; i++) out.add(question(i, "Soru " + i, Kind.SHORT_TEXT));
        return out;
    }

    private static JobPostingService service(JobPostingStore store) {
        return new JobPostingService(store, Clock.fixed(NOW, ZoneOffset.UTC), new SecureRandom());
    }

    private static JobDraft draft(List<ApplicationQuestion> questions) {
        return draft(null, questions);
    }

    private static JobDraft draft(String slug, List<ApplicationQuestion> questions) {
        return new JobDraft(
                slug, "Ürün Yöneticisi", "Ürün ve Deneyim", "İstanbul", "Hibrit", "Tam zamanlı",
                "Kullanıcı ihtiyaçlarını ölçülebilir ürün sonuçlarına dönüştürün.",
                List.of("Ürün keşfi"), JobPostingService.DEFAULT_APPLICATION_FIELDS,
                questions, JobPostingService.CURRENT_NOTICE_VERSION);
    }

    private static final class CapturingStore implements JobPostingStore {
        CreateCommand create;
        UpdateCommand update;

        @Override public Outcome<List<JobPosting>> list(TenantId tenantId) {
            return Outcome.ok(List.of());
        }

        @Override public Outcome<JobPosting> find(TenantId tenantId, String jobId) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "yok");
        }

        @Override public Outcome<String> findActiveCareerHandle(TenantId tenantId) {
            return Outcome.ok("acik");
        }

        @Override public Outcome<MutationResult> create(CreateCommand command) {
            this.create = command;
            return Outcome.ok(new MutationResult(MutationState.CREATED, null));
        }

        @Override public Outcome<MutationResult> update(UpdateCommand command) {
            this.update = command;
            return Outcome.ok(new MutationResult(MutationState.UPDATED, null));
        }

        @Override public Outcome<MutationResult> transition(TransitionCommand command) {
            return Outcome.ok(new MutationResult(MutationState.UPDATED, null));
        }
    }
}
