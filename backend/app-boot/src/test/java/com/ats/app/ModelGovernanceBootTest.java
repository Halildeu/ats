package com.ats.app;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.contracts.governance.ApprovalStatus;
import com.ats.contracts.governance.ApprovedModelRegistry;
import com.ats.contracts.governance.ApprovedModelSpec;
import com.ats.contracts.governance.Capability;
import com.ats.contracts.governance.ModelScope;
import org.junit.jupiter.api.Test;

/**
 * P3-gov0 boot-gate (Codex durable-fix): {@code authorizeProvider} GERÇEK provider'ın
 * enabled-capability kümesini provider'dan türetir ve her üye için beyan edilen onaylı-politikayı
 * çözer + cross-check eder (providerRef/endpointRef/invocationProfileVersion). Hepsi APPROVED +
 * eşleşme değilse composition FAIL. gov1-1e-c: status catalog'da DEĞİL — registry WORM-backed
 * ({@link GovernanceWormTestFixture} canlı seed); ref'ler spec'lerden TÜRETİLİR (hardcoded hex yok).
 */
class ModelGovernanceBootTest {

    private static final String HTTP_EP = "http-json-generic-endpoint";
    private static final String LIVE_EP = "faz24-stt-prod";

    // --- kapalı-mapping ile TUTARLI kanonik onaylı-model spec'leri (status YOK — 1e-c) ---

    private static ApprovedModelSpec httpTranscribe() {
        return ApprovedModelSpec.of(Capability.TRANSCRIBE, "http-json-generic", "http-json-stt", "v1",
                java.util.Set.of(), java.util.Set.of(), HTTP_EP, "ip-http-json-1", ModelScope.GLOBAL);
    }

    private static ApprovedModelSpec httpCite() {
        return ApprovedModelSpec.of(Capability.CITE, "http-json-generic", "http-json-cite", "v1",
                java.util.Set.of(), java.util.Set.of(), HTTP_EP, "ip-http-json-1", ModelScope.GLOBAL);
    }

    private static ApprovedModelSpec liveTranscribe() {
        return ApprovedModelSpec.of(Capability.TRANSCRIBE, "faz24-live-stt", "whisper-tr", "v0.1.0",
                java.util.Set.of("whisper-large-v3-tr"), java.util.Set.of(), LIVE_EP, "ip-live-stt-1",
                ModelScope.GLOBAL);
    }

    /** WORM-backed registry: verilen spec'lerin HEPSİ APPROVED. */
    private static ApprovedModelRegistry approved(ApprovedModelSpec... specs) {
        GovernanceWormTestFixture fx = new GovernanceWormTestFixture();
        for (ApprovedModelSpec s : specs) {
            fx.with(s, ApprovalStatus.APPROVED);
        }
        return fx.registry();
    }

    /** WORM-backed registry: {@code spec} verilen status'te; {@code approvedRest} APPROVED. */
    private static ApprovedModelRegistry withStatus(
            ApprovedModelSpec spec, ApprovalStatus status, ApprovedModelSpec... approvedRest) {
        GovernanceWormTestFixture fx = new GovernanceWormTestFixture().with(spec, status);
        for (ApprovedModelSpec s : approvedRest) {
            fx.with(s, ApprovalStatus.APPROVED);
        }
        return fx.registry();
    }

    private static AppProperties.Approvals approvals(String transcribeRef, String citeRef) {
        return new AppProperties.Approvals(transcribeRef, citeRef);
    }

    private static String ref(ApprovedModelSpec spec) {
        return spec.approvalRef().value();
    }

    // ==== PASS yolları ====

    @Test
    void http_json_with_valid_transcribe_and_cite_boots() {
        ApprovedModelSpec t = httpTranscribe();
        ApprovedModelSpec c = httpCite();
        AuthorizedModelBindings b = ModelGovernanceBoot.authorizeProvider(
                approved(t, c), "http-json", HTTP_EP, approvals(ref(t), ref(c)));
        assertEquals("http-json", b.provider());
        assertEquals(HTTP_EP, b.endpointRef());
        assertEquals(java.util.Set.of(Capability.TRANSCRIBE, Capability.CITE), b.bindings().keySet());
    }

    @Test
    void live_stt_with_valid_transcribe_boots() {
        ApprovedModelSpec t = liveTranscribe();
        AuthorizedModelBindings b = ModelGovernanceBoot.authorizeProvider(
                approved(t), "live-stt", LIVE_EP, approvals(ref(t), null));
        assertEquals("live-stt", b.provider());
        assertEquals(java.util.Set.of(Capability.TRANSCRIBE), b.bindings().keySet());
    }

    // ==== FAIL yolları (fail-closed; her sapma boot patlatır) ====

    @Test
    void http_json_missing_cite_ref_fails() {
        // http-json {TRANSCRIBE, CITE} → CITE reachable; cite-ref eksik → FAIL (partial-enable gov0 dışı)
        ApprovedModelSpec t = httpTranscribe();
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> ModelGovernanceBoot.authorizeProvider(
                        approved(t), "http-json", HTTP_EP, approvals(ref(t), null)));
        assertTrue(ex.getMessage().contains("CITE") && ex.getMessage().contains("zorunlu"), ex.getMessage());
    }

    @Test
    void missing_required_transcribe_ref_fails() {
        ApprovedModelSpec c = httpCite();
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> ModelGovernanceBoot.authorizeProvider(
                        approved(c), "http-json", HTTP_EP, approvals(null, ref(c))));
        assertTrue(ex.getMessage().contains("TRANSCRIBE") && ex.getMessage().contains("zorunlu"), ex.getMessage());
    }

    @Test
    void live_stt_with_cite_ref_declared_fails() {
        // live-stt cite ÇALIŞTIRMAZ → cite-ref beyanı yanlış-beyan reddi (FAIL)
        ApprovedModelSpec t = liveTranscribe();
        ApprovedModelSpec c = httpCite();
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> ModelGovernanceBoot.authorizeProvider(
                        approved(t), "live-stt", LIVE_EP, approvals(ref(t), ref(c))));
        assertTrue(ex.getMessage().contains("CITE") && ex.getMessage().contains("beyan"), ex.getMessage());
    }

    @Test
    void malformed_ref_fails() {
        ApprovedModelSpec c = httpCite();
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> ModelGovernanceBoot.authorizeProvider(
                        approved(c), "http-json", HTTP_EP, approvals("not-a-mapr-ref", ref(c))));
        assertTrue(ex.getMessage().contains("biçim"), ex.getMessage());
    }

    @Test
    void ref_not_in_registry_fails() {
        // iyi-biçimli ama catalog'da OLMAYAN ref → NOT_FOUND → FAIL
        ApprovedModelSpec unknown = ApprovedModelSpec.of(Capability.TRANSCRIBE, "http-json-generic",
                "other-model", "v1", java.util.Set.of(), java.util.Set.of(), HTTP_EP, "ip-http-json-1",
                ModelScope.GLOBAL);
        ApprovedModelSpec c = httpCite();
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> ModelGovernanceBoot.authorizeProvider(
                        approved(httpTranscribe(), c), "http-json", HTTP_EP, approvals(ref(unknown), ref(c))));
        assertTrue(ex.getMessage().contains("çözülemedi") && ex.getMessage().contains("NOT_FOUND"), ex.getMessage());
    }

    @Test
    void ref_revoked_fails() {
        // aynı politika alanları → AYNI içerik-adresli ref; WORM'da REVOKED kayıt → resolve DENIED
        // (approvalRef "halen onaylı" kanıtı DEĞİL — status WORM'dan taze çözülür).
        ApprovedModelSpec revoked = httpTranscribe();
        ApprovedModelSpec c = httpCite();
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> ModelGovernanceBoot.authorizeProvider(
                        withStatus(revoked, ApprovalStatus.REVOKED, c), "http-json", HTTP_EP,
                        approvals(ref(revoked), ref(c))));
        assertTrue(ex.getMessage().contains("çözülemedi") && ex.getMessage().contains("DENIED"), ex.getMessage());
    }

    @Test
    void ref_draft_fails() {
        ApprovedModelSpec draft = httpTranscribe();
        ApprovedModelSpec c = httpCite();
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> ModelGovernanceBoot.authorizeProvider(
                        withStatus(draft, ApprovalStatus.DRAFT, c), "http-json", HTTP_EP,
                        approvals(ref(draft), ref(c))));
        assertTrue(ex.getMessage().contains("DENIED"), ex.getMessage());
    }

    @Test
    void ref_uninitialized_fails() {
        // catalog'da var ama WORM'da transition yok → UNINITIALIZED → resolve DENIED → boot FAIL.
        ApprovedModelSpec c = httpCite();
        GovernanceWormTestFixture fx = new GovernanceWormTestFixture()
                .withUninitialized(httpTranscribe()).with(c, ApprovalStatus.APPROVED);
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> ModelGovernanceBoot.authorizeProvider(
                        fx.registry(), "http-json", HTTP_EP, approvals(ref(httpTranscribe()), ref(c))));
        assertTrue(ex.getMessage().contains("çözülemedi") && ex.getMessage().contains("DENIED"), ex.getMessage());
    }

    @Test
    void ref_capability_mismatch_fails() {
        // TRANSCRIBE slot'una CITE spec'inin ref'i verilir → resolve(ref, TRANSCRIBE) capability DENY
        ApprovedModelSpec c = httpCite();
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> ModelGovernanceBoot.authorizeProvider(
                        approved(c), "http-json", HTTP_EP, approvals(ref(c), ref(c))));
        assertTrue(ex.getMessage().contains("DENIED"), ex.getMessage());
    }

    @Test
    void provider_ref_mismatch_fails() {
        // APPROVED + doğru capability ama configuredProviderRef beklenenden farklı → FAIL
        ApprovedModelSpec wrongProvider = ApprovedModelSpec.of(Capability.TRANSCRIBE, "some-other-provider",
                "http-json-stt", "v1", java.util.Set.of(), java.util.Set.of(), HTTP_EP, "ip-http-json-1",
                ModelScope.GLOBAL);
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> ModelGovernanceBoot.authorizeProvider(
                        approved(wrongProvider), "http-json", HTTP_EP,
                        approvals(ref(wrongProvider), ref(httpCite()))));
        assertTrue(ex.getMessage().contains("provider-ref uyuşmazlığı"), ex.getMessage());
    }

    @Test
    void endpoint_ref_mismatch_fails() {
        // props endpoint-ref onaylı spec'in endpointRef'iyle uyuşmuyor → FAIL
        ApprovedModelSpec t = httpTranscribe();
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> ModelGovernanceBoot.authorizeProvider(
                        approved(t), "http-json", "some-other-endpoint",
                        approvals(ref(t), ref(httpCite()))));
        assertTrue(ex.getMessage().contains("endpointRef uyuşmazlığı"), ex.getMessage());
    }

    @Test
    void invocation_profile_mismatch_fails() {
        // APPROVED + doğru provider + doğru endpoint ama invocationProfileVersion beklenenden farklı → FAIL
        ApprovedModelSpec wrongProfile = ApprovedModelSpec.of(Capability.TRANSCRIBE, "http-json-generic",
                "http-json-stt", "v1", java.util.Set.of(), java.util.Set.of(), HTTP_EP, "ip-WRONG-profile",
                ModelScope.GLOBAL);
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> ModelGovernanceBoot.authorizeProvider(
                        approved(wrongProfile), "http-json", HTTP_EP,
                        approvals(ref(wrongProfile), ref(httpCite()))));
        assertTrue(ex.getMessage().contains("invocationProfileVersion"), ex.getMessage());
    }

    @Test
    void unknown_provider_fails_closed() {
        ApprovedModelSpec t = httpTranscribe();
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> ModelGovernanceBoot.authorizeProvider(
                        approved(t), "cloud-stt", HTTP_EP, approvals(ref(t), null)));
        assertTrue(ex.getMessage().contains("bilinmeyen provider"), ex.getMessage());
    }

    @Test
    void blank_endpoint_ref_fails_closed() {
        ApprovedModelSpec t = httpTranscribe();
        assertThrows(IllegalStateException.class, () -> ModelGovernanceBoot.authorizeProvider(
                approved(t, httpCite()), "http-json", "  ", approvals(ref(t), ref(httpCite()))));
        assertThrows(IllegalStateException.class, () -> ModelGovernanceBoot.authorizeProvider(
                approved(t, httpCite()), "http-json", null, approvals(ref(t), ref(httpCite()))));
    }

    @Test
    void null_registry_and_null_approvals_fail_closed() {
        assertThrows(IllegalStateException.class, () -> ModelGovernanceBoot.authorizeProvider(
                null, "http-json", HTTP_EP, approvals("x", "y")));
        assertThrows(IllegalStateException.class, () -> ModelGovernanceBoot.authorizeProvider(
                approved(httpTranscribe()), "http-json", HTTP_EP, null));
    }
}
