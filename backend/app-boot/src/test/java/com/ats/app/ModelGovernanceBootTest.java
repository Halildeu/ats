package com.ats.app;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.contracts.governance.ApprovalStatus;
import com.ats.contracts.governance.ApprovedModelRegistry;
import com.ats.contracts.governance.ApprovedModelSpec;
import com.ats.contracts.governance.Capability;
import com.ats.contracts.governance.ModelScope;
import com.ats.governance.InMemoryApprovedModelRegistry;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * P3-gov0 boot-gate (Codex durable-fix): {@code authorizeProvider} GERÇEK provider'ın
 * enabled-capability kümesini provider'dan türetir ve her üye için beyan edilen onaylı-politikayı
 * çözer + cross-check eder (providerRef/endpointRef/invocationProfileVersion). Hepsi APPROVED +
 * eşleşme değilse composition FAIL. Ref'ler spec'lerden TÜRETİLİR (hardcoded hex yok → dayanıklı).
 */
class ModelGovernanceBootTest {

    private static final String HTTP_EP = "http-json-generic-endpoint";
    private static final String LIVE_EP = "faz24-stt-prod";

    // --- kapalı-mapping ile TUTARLI kanonik onaylı-model spec'leri ---

    private static ApprovedModelSpec httpTranscribe() {
        return ApprovedModelSpec.of(Capability.TRANSCRIBE, "http-json-generic", "http-json-stt", "v1",
                Set.of(), Set.of(), HTTP_EP, "ip-http-json-1", ApprovalStatus.APPROVED, ModelScope.GLOBAL);
    }

    private static ApprovedModelSpec httpCite() {
        return ApprovedModelSpec.of(Capability.CITE, "http-json-generic", "http-json-cite", "v1",
                Set.of(), Set.of(), HTTP_EP, "ip-http-json-1", ApprovalStatus.APPROVED, ModelScope.GLOBAL);
    }

    private static ApprovedModelSpec liveTranscribe() {
        return ApprovedModelSpec.of(Capability.TRANSCRIBE, "faz24-live-stt", "whisper-tr", "v0.1.0",
                Set.of("whisper-large-v3-tr"), Set.of(), LIVE_EP, "ip-live-stt-1",
                ApprovalStatus.APPROVED, ModelScope.GLOBAL);
    }

    private static ApprovedModelRegistry registryOf(ApprovedModelSpec... specs) {
        return InMemoryApprovedModelRegistry.of(List.of(specs));
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
                registryOf(t, c), "http-json", HTTP_EP, approvals(ref(t), ref(c)));
        assertEquals("http-json", b.provider());
        assertEquals(HTTP_EP, b.endpointRef());
        assertEquals(Set.of(Capability.TRANSCRIBE, Capability.CITE), b.bindings().keySet());
    }

    @Test
    void live_stt_with_valid_transcribe_boots() {
        ApprovedModelSpec t = liveTranscribe();
        AuthorizedModelBindings b = ModelGovernanceBoot.authorizeProvider(
                registryOf(t), "live-stt", LIVE_EP, approvals(ref(t), null));
        assertEquals("live-stt", b.provider());
        assertEquals(Set.of(Capability.TRANSCRIBE), b.bindings().keySet());
    }

    // ==== FAIL yolları (fail-closed; her sapma boot patlatır) ====

    @Test
    void http_json_missing_cite_ref_fails() {
        // http-json {TRANSCRIBE, CITE} → CITE reachable; cite-ref eksik → FAIL (partial-enable gov0 dışı)
        ApprovedModelSpec t = httpTranscribe();
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> ModelGovernanceBoot.authorizeProvider(
                        registryOf(t), "http-json", HTTP_EP, approvals(ref(t), null)));
        assertTrue(ex.getMessage().contains("CITE") && ex.getMessage().contains("zorunlu"), ex.getMessage());
    }

    @Test
    void missing_required_transcribe_ref_fails() {
        ApprovedModelSpec c = httpCite();
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> ModelGovernanceBoot.authorizeProvider(
                        registryOf(c), "http-json", HTTP_EP, approvals(null, ref(c))));
        assertTrue(ex.getMessage().contains("TRANSCRIBE") && ex.getMessage().contains("zorunlu"), ex.getMessage());
    }

    @Test
    void live_stt_with_cite_ref_declared_fails() {
        // live-stt cite ÇALIŞTIRMAZ → cite-ref beyanı yanlış-beyan reddi (FAIL)
        ApprovedModelSpec t = liveTranscribe();
        ApprovedModelSpec c = httpCite();
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> ModelGovernanceBoot.authorizeProvider(
                        registryOf(t), "live-stt", LIVE_EP, approvals(ref(t), ref(c))));
        assertTrue(ex.getMessage().contains("CITE") && ex.getMessage().contains("beyan"), ex.getMessage());
    }

    @Test
    void malformed_ref_fails() {
        ApprovedModelSpec c = httpCite();
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> ModelGovernanceBoot.authorizeProvider(
                        registryOf(c), "http-json", HTTP_EP, approvals("not-a-mapr-ref", ref(c))));
        assertTrue(ex.getMessage().contains("biçim"), ex.getMessage());
    }

    @Test
    void ref_not_in_registry_fails() {
        // iyi-biçimli ama registry'de OLMAYAN ref → NOT_FOUND → FAIL
        ApprovedModelSpec unknown = ApprovedModelSpec.of(Capability.TRANSCRIBE, "http-json-generic",
                "other-model", "v1", Set.of(), Set.of(), HTTP_EP, "ip-http-json-1",
                ApprovalStatus.APPROVED, ModelScope.GLOBAL);
        ApprovedModelSpec c = httpCite();
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> ModelGovernanceBoot.authorizeProvider(
                        registryOf(httpTranscribe(), c), "http-json", HTTP_EP, approvals(ref(unknown), ref(c))));
        assertTrue(ex.getMessage().contains("çözülemedi") && ex.getMessage().contains("NOT_FOUND"), ex.getMessage());
    }

    @Test
    void ref_revoked_fails() {
        // aynı politika alanları farklı status ⇒ AYNI içerik-adresli ref; REVOKED kayıt tek başına
        // registry'de → resolve DENIED (approvalRef "halen onaylı" kanıtı DEĞİL — status taze çözülür)
        ApprovedModelSpec revoked = ApprovedModelSpec.of(Capability.TRANSCRIBE, "http-json-generic",
                "http-json-stt", "v1", Set.of(), Set.of(), HTTP_EP, "ip-http-json-1",
                ApprovalStatus.REVOKED, ModelScope.GLOBAL);
        ApprovedModelSpec c = httpCite();
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> ModelGovernanceBoot.authorizeProvider(
                        registryOf(revoked, c), "http-json", HTTP_EP, approvals(ref(revoked), ref(c))));
        assertTrue(ex.getMessage().contains("çözülemedi") && ex.getMessage().contains("DENIED"), ex.getMessage());
    }

    @Test
    void ref_draft_fails() {
        ApprovedModelSpec draft = ApprovedModelSpec.of(Capability.TRANSCRIBE, "http-json-generic",
                "http-json-stt", "v1", Set.of(), Set.of(), HTTP_EP, "ip-http-json-1",
                ApprovalStatus.DRAFT, ModelScope.GLOBAL);
        ApprovedModelSpec c = httpCite();
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> ModelGovernanceBoot.authorizeProvider(
                        registryOf(draft, c), "http-json", HTTP_EP, approvals(ref(draft), ref(c))));
        assertTrue(ex.getMessage().contains("DENIED"), ex.getMessage());
    }

    @Test
    void ref_capability_mismatch_fails() {
        // TRANSCRIBE slot'una CITE spec'inin ref'i verilir → resolve(ref, TRANSCRIBE) capability DENY
        ApprovedModelSpec c = httpCite();
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> ModelGovernanceBoot.authorizeProvider(
                        registryOf(c), "http-json", HTTP_EP, approvals(ref(c), ref(c))));
        assertTrue(ex.getMessage().contains("DENIED"), ex.getMessage());
    }

    @Test
    void provider_ref_mismatch_fails() {
        // APPROVED + doğru capability ama configuredProviderRef beklenenden farklı → FAIL
        ApprovedModelSpec wrongProvider = ApprovedModelSpec.of(Capability.TRANSCRIBE, "some-other-provider",
                "http-json-stt", "v1", Set.of(), Set.of(), HTTP_EP, "ip-http-json-1",
                ApprovalStatus.APPROVED, ModelScope.GLOBAL);
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> ModelGovernanceBoot.authorizeProvider(
                        registryOf(wrongProvider), "http-json", HTTP_EP,
                        approvals(ref(wrongProvider), ref(httpCite()))));
        assertTrue(ex.getMessage().contains("provider-ref uyuşmazlığı"), ex.getMessage());
    }

    @Test
    void endpoint_ref_mismatch_fails() {
        // props endpoint-ref onaylı spec'in endpointRef'iyle uyuşmuyor → FAIL
        ApprovedModelSpec t = httpTranscribe();
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> ModelGovernanceBoot.authorizeProvider(
                        registryOf(t), "http-json", "some-other-endpoint",
                        approvals(ref(t), ref(httpCite()))));
        assertTrue(ex.getMessage().contains("endpointRef uyuşmazlığı"), ex.getMessage());
    }

    @Test
    void invocation_profile_mismatch_fails() {
        // APPROVED + doğru provider + doğru endpoint ama invocationProfileVersion beklenenden farklı → FAIL
        ApprovedModelSpec wrongProfile = ApprovedModelSpec.of(Capability.TRANSCRIBE, "http-json-generic",
                "http-json-stt", "v1", Set.of(), Set.of(), HTTP_EP, "ip-WRONG-profile",
                ApprovalStatus.APPROVED, ModelScope.GLOBAL);
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> ModelGovernanceBoot.authorizeProvider(
                        registryOf(wrongProfile), "http-json", HTTP_EP,
                        approvals(ref(wrongProfile), ref(httpCite()))));
        assertTrue(ex.getMessage().contains("invocationProfileVersion"), ex.getMessage());
    }

    @Test
    void unknown_provider_fails_closed() {
        ApprovedModelSpec t = httpTranscribe();
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> ModelGovernanceBoot.authorizeProvider(
                        registryOf(t), "cloud-stt", HTTP_EP, approvals(ref(t), null)));
        assertTrue(ex.getMessage().contains("bilinmeyen provider"), ex.getMessage());
    }

    @Test
    void blank_endpoint_ref_fails_closed() {
        ApprovedModelSpec t = httpTranscribe();
        assertThrows(IllegalStateException.class, () -> ModelGovernanceBoot.authorizeProvider(
                registryOf(t, httpCite()), "http-json", "  ", approvals(ref(t), ref(httpCite()))));
        assertThrows(IllegalStateException.class, () -> ModelGovernanceBoot.authorizeProvider(
                registryOf(t, httpCite()), "http-json", null, approvals(ref(t), ref(httpCite()))));
    }

    @Test
    void null_registry_and_null_approvals_fail_closed() {
        assertThrows(IllegalStateException.class, () -> ModelGovernanceBoot.authorizeProvider(
                null, "http-json", HTTP_EP, approvals("x", "y")));
        assertThrows(IllegalStateException.class, () -> ModelGovernanceBoot.authorizeProvider(
                registryOf(httpTranscribe()), "http-json", HTTP_EP, null));
    }
}
