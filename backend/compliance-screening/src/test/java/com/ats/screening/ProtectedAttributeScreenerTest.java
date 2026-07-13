package com.ats.screening;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

/** Tarayıcı saf-çekirdek davranışı: leksik eşleşme, soru-kalıbı, safe-strip, kapsam, dil ekseni, orijinal-span. */
class ProtectedAttributeScreenerTest {

    private static final String RESOURCE = "screening/protected-attribute-screening-policy.v1.json";

    private final ProtectedAttributeScreener screener = ProtectedAttributeScreener.fromClasspath(RESOURCE);

    private static ScreeningFinding only(ScreeningResult r) {
        assertEquals(1, r.findings().size(), () -> "tek bulgu bekleniyordu: " + r.findings());
        return r.findings().get(0);
    }

    @Test
    void direct_positive_question_english() {
        ScreeningResult r = screener.screen("How old are you?", ScreeningSourceKind.FREE_TEXT, "en");
        assertEquals(Coverage.SUPPORTED, r.coverage());
        ScreeningFinding f = only(r);
        assertEquals(ProtectedCategory.AGE, f.category());
        assertEquals(ScreeningSignal.QUESTION_LIKE_PROTECTED_MENTION, f.signal());
        assertEquals(new TextSpan(0, 7, null), f.span()); // "How old"
    }

    @Test
    void declarative_mention_is_not_question_like() {
        String text = "Adayın yaşı 30 olarak belirtildi.";
        ScreeningResult r = screener.screen(text, ScreeningSourceKind.INTERVIEW_NOTE, "tr");
        ScreeningFinding f = only(r);
        assertEquals(ProtectedCategory.AGE, f.category());
        assertEquals(ScreeningSignal.PROTECTED_ATTRIBUTE_MENTION, f.signal());
        int start = text.indexOf("yaşı");
        assertEquals(new TextSpan(start, start + "yaşı".length(), null), f.span());
    }

    @Test
    void question_cue_without_punctuation_is_still_question_like() {
        // STT noktalama düşürmüş: '?' yok ama "kaç" ipucu → QUESTION_LIKE (CLEAR değil).
        ScreeningResult r = screener.screen("kaç yaşındasınız", ScreeningSourceKind.TRANSCRIPT_SEGMENT, "tr");
        ScreeningFinding f = only(r);
        assertEquals(ProtectedCategory.AGE, f.category());
        assertEquals(ScreeningSignal.QUESTION_LIKE_PROTECTED_MENTION, f.signal());
        assertEquals(new TextSpan(0, 16, null), f.span()); // "kaç yaşındasınız" (PHRASE, WORD içerilir)
    }

    @Test
    void question_vs_declarative_contrast_same_term() {
        ScreeningFinding q = only(screener.screen("Evli misiniz?", ScreeningSourceKind.FREE_TEXT, "tr"));
        assertEquals(ProtectedCategory.MARITAL_PARENTAL_STATUS, q.category());
        assertEquals(ScreeningSignal.QUESTION_LIKE_PROTECTED_MENTION, q.signal());

        ScreeningFinding d = only(screener.screen("Evli bir aday.", ScreeningSourceKind.FREE_TEXT, "tr"));
        assertEquals(ProtectedCategory.MARITAL_PARENTAL_STATUS, d.category());
        assertEquals(ScreeningSignal.PROTECTED_ATTRIBUTE_MENTION, d.signal());
    }

    @Test
    void safe_business_phrases_do_not_flag() {
        ScreeningResult r = screener.screen(
                "We debugged a race condition in the health domain.", ScreeningSourceKind.FREE_TEXT, "en");
        assertEquals(Coverage.SUPPORTED, r.coverage());
        assertTrue(r.findings().isEmpty());
        assertTrue(r.isClear());
    }

    @Test
    void safe_strip_does_not_swallow_a_real_protected_mention() {
        String text = "Strong in the health domain, but do you have a disability?";
        ScreeningResult r = screener.screen(text, ScreeningSourceKind.FREE_TEXT, "en");
        ScreeningFinding f = only(r);
        assertEquals(ProtectedCategory.HEALTH_DISABILITY, f.category());
        assertEquals(ScreeningSignal.QUESTION_LIKE_PROTECTED_MENTION, f.signal());
        int start = text.indexOf("disability");
        assertEquals(new TextSpan(start, start + "disability".length(), null), f.span());
    }

    @Test
    void false_positive_guards_stay_clear() {
        for (String benign : new String[] {
                "Yasa tasarısı üzerinde çalıştık.",     // "yasa" ≠ AGE "yas"
                "transfer işlemleri tamamlandı",        // "transfer" ≠ SEX "trans*" (yok)
                "sağlıklı bir mimari kurduk",           // "sağlıklı" ≠ HEALTH "saglik"
                "we used a union type in typescript",   // bare "union" korumalı değil
                "single source of truth prensibi",      // bare "single" korumalı değil
                "message queue ve storage katmanı"      // "message"/"storage" ≠ AGE "age"
        }) {
            ScreeningResult r = screener.screen(benign, ScreeningSourceKind.FREE_TEXT, "tr");
            assertTrue(r.isClear(), () -> "yanlış-pozitif: '" + benign + "' → " + r.findings());
        }
    }

    // ---- dil ekseni (BLOCKER 2): base-tag + baskın-yazım ----

    @Test
    void declared_supported_tag_but_dominant_non_latin_script_is_unsupported() {
        // base-tag tr AMA baskın yazım Arapça → UNSUPPORTED (dominant-script ekseni; bulgu-boş AMA CLEAR değil).
        ScreeningResult ar = screener.screen("هل أنت متزوج", ScreeningSourceKind.FREE_TEXT, "tr");
        assertEquals(Coverage.UNSUPPORTED_LANGUAGE, ar.coverage());
        assertTrue(ar.findings().isEmpty());
        assertFalse(ar.isClear());
        // baskın Kiril (tek-tük Latin baskınlığı bozmaz)
        ScreeningResult cyr = screener.screen("yas привет как дела друзья", ScreeningSourceKind.FREE_TEXT, "tr");
        assertEquals(Coverage.UNSUPPORTED_LANGUAGE, cyr.coverage());
    }

    @Test
    void unsupported_base_language_tag_is_not_clear() {
        // Latin yazım AMA base-tag policy dilinde değil (fr) → UNSUPPORTED (base-tag ekseni).
        ScreeningResult fr = screener.screen("Quel age avez vous", ScreeningSourceKind.FREE_TEXT, "fr");
        assertEquals(Coverage.UNSUPPORTED_LANGUAGE, fr.coverage());
        assertFalse(fr.isClear());
        // ar + tek Latin karakter → yine UNSUPPORTED (base-tag; tek-Latin baskınlık kazandırmaz).
        ScreeningResult ar = screener.screen("متزوج x", ScreeningSourceKind.FREE_TEXT, "ar");
        assertEquals(Coverage.UNSUPPORTED_LANGUAGE, ar.coverage());
    }

    @Test
    void null_or_blank_language_tag_is_unsupported() {
        assertEquals(Coverage.UNSUPPORTED_LANGUAGE,
                screener.screen("merhaba", ScreeningSourceKind.FREE_TEXT, null).coverage());
        assertEquals(Coverage.UNSUPPORTED_LANGUAGE,
                screener.screen("merhaba", ScreeningSourceKind.FREE_TEXT, "   ").coverage());
    }

    @Test
    void region_subtags_tr_TR_and_en_US_are_supported() {
        assertEquals(Coverage.SUPPORTED,
                screener.screen("bugun hava guzel", ScreeningSourceKind.FREE_TEXT, "tr-TR").coverage());
        assertEquals(Coverage.SUPPORTED,
                screener.screen("the weather is nice", ScreeningSourceKind.FREE_TEXT, "en-US").coverage());
    }

    @Test
    void malformed_input_is_not_clear() {
        assertEquals(Coverage.MALFORMED_INPUT,
                screener.screen(null, ScreeningSourceKind.FREE_TEXT, "tr").coverage());
        assertEquals(Coverage.MALFORMED_INPUT,
                screener.screen("ab\u0007cd", ScreeningSourceKind.FREE_TEXT, "tr").coverage());
        assertEquals(Coverage.MALFORMED_INPUT,
                screener.screen("\uD83Dabc", ScreeningSourceKind.FREE_TEXT, "tr").coverage()); // eşsiz high surrogate
        assertFalse(screener.screen(null, ScreeningSourceKind.FREE_TEXT, "tr").isClear());
    }

    @Test
    void policy_unavailable_never_reports_clear() {
        ScreeningResult r = ProtectedAttributeScreener.unavailable()
                .screen("Kaç yaşındasınız?", ScreeningSourceKind.FREE_TEXT, "tr");
        assertEquals(Coverage.POLICY_UNAVAILABLE, r.coverage());
        assertEquals(ProtectedAttributeScreener.POLICY_UNAVAILABLE_REF, r.policyRef());
        assertTrue(r.findings().isEmpty());
        assertFalse(r.isClear());
    }

    @Test
    void surrogate_prefix_maps_span_to_correct_original_offsets() {
        // 😀 (2 UTF-16 birim) baştaysa sonraki span orijinal +2 kayar; "kaç yaşında" [3,14).
        ScreeningResult r = screener.screen("😀 kaç yaşında?", ScreeningSourceKind.TRANSCRIPT_SEGMENT, "tr");
        ScreeningFinding f = only(r);
        assertEquals(ProtectedCategory.AGE, f.category());
        assertEquals(ScreeningSignal.QUESTION_LIKE_PROTECTED_MENTION, f.signal());
        assertEquals(new TextSpan(3, 14, null), f.span());
    }

    @Test
    void segment_index_is_carried_into_span() {
        ScreeningResult r = screener.screenSegment(
                "Evli misiniz?", ScreeningSourceKind.TRANSCRIPT_SEGMENT, "tr", 7);
        ScreeningFinding f = only(r);
        assertEquals(Integer.valueOf(7), f.span().segmentIndex());
    }

    @Test
    void policy_ref_is_v1_and_run_id_is_present() {
        ScreeningResult r = screener.screen("merhaba", ScreeningSourceKind.FREE_TEXT, "tr");
        assertEquals("paspolicy_v1", r.policyRef().value());
        assertTrue(ScreeningRunId.isValid(r.runId().value()));
        assertTrue(r.isClear());
    }

    @Test
    void same_input_yields_new_run_id_and_finding_set_ref_but_same_findings() {
        ScreeningResult a = screener.screen("How old are you?", ScreeningSourceKind.FREE_TEXT, "en");
        ScreeningResult b = screener.screen("How old are you?", ScreeningSourceKind.FREE_TEXT, "en");
        // Opak, içerik-adresli DEĞİL: aynı girdi → FARKLI runId + FARKLI findingSetRef ...
        assertNotEquals(a.runId(), b.runId());
        assertNotEquals(a.findingSetRef(), b.findingSetRef());
        // ... ama bulgular (kategori/sinyal/span) AYNI (ref bulgu-içeriğinden türetilmez).
        assertEquals(a.findings(), b.findings());
    }

    @Test
    void loaded_policy_object_is_reusable() {
        ScreeningPolicy policy = ScreeningPolicy.fromClasspath(RESOURCE);
        assertSame(ScreeningPolicy.Kind.STEM, policy.categories().stream()
                .flatMap(c -> c.terms().stream())
                .filter(t -> t.text().equals("pregnan"))
                .findFirst().orElseThrow().kind());
    }
}
