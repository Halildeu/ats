package com.ats.governance;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.contracts.governance.ApprovalStatus;
import com.ats.contracts.governance.ApprovedModelSpec;
import com.ats.contracts.governance.Capability;
import com.ats.contracts.governance.ModelScope;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * Dosya/config-destekli registry: geçerli-yük + yükleme-anı fail-closed (yinelenen-ref/alias/değer) +
 * gov1-1e-c strict exact-key parser (eski {@code "status"} anahtarı + bilinmeyen alan → RED). Cari status
 * WORM'dan çözülür (bu test canlı WORM'u {@link GovernanceWormFixture} ile seed'ler).
 */
class FileBackedApprovedModelRegistryTest {

    private static final String VALID_RESOURCE = "approved-models-valid.json";

    private static ApprovedModelSpec byCapability(List<ApprovedModelSpec> specs, Capability cap) {
        return specs.stream().filter(s -> s.capability() == cap).findFirst().orElseThrow();
    }

    @Test
    void loads_valid_classpath_resource_and_resolves_worm_status() {
        // Catalog'u keşifle oku (WORM'suz), sonra iki özneyi WORM'da APPROVED/REVOKED seed'le.
        List<ApprovedModelSpec> catalog =
                FileBackedApprovedModelRegistry.fromClasspath(VALID_RESOURCE).approvedSpecs();
        ApprovedModelSpec whisper = byCapability(catalog, Capability.TRANSCRIBE);
        ApprovedModelSpec cite = byCapability(catalog, Capability.CITE);
        GovernanceWormFixture fx = new GovernanceWormFixture()
                .with(whisper, ApprovalStatus.APPROVED)
                .with(cite, ApprovalStatus.REVOKED);

        var registry = FileBackedApprovedModelRegistry.fromClasspath(VALID_RESOURCE, fx.ledger());
        // APPROVED transcribe çözülür + türetilen ref content-addressed digest ile eşleşir
        var out = registry.resolveConfigured(Capability.TRANSCRIBE, "faz24-live-stt", "whisper-tr", "v0.1.0");
        assertInstanceOf(Outcome.Ok.class, out);
        ApprovedModelSpec spec = ((Outcome.Ok<ApprovedModelSpec>) out).value();
        assertEquals(spec.approvalRef(), spec.canonicalDigest(), "yüklenen ref içerik-adresli türetilmeli");
        assertTrue(spec.matchesReported("whisper-large-v3-tr", "v0.1.0"), "alias yüklendi");
        // REVOKED CITE girişi DENY (WORM status-otorite: REVOKED)
        assertEquals(OutcomeCode.DENIED,
                ((Outcome.Fail<?>) registry.resolveConfigured(Capability.CITE, "faz24-cite", "cite-tr", "v2")).code());
    }

    // ---- gov1-1e-c strict exact-key parser: status anahtarı + bilinmeyen alan RED ----

    @Test
    void load_fails_on_forbidden_status_key() {
        // Eski catalog (status'lü) SESSİZCE yüklenmez → açık status-forbidden RED (fail-closed).
        String json = """
            { "approvedModels": [
              { "capability":"TRANSCRIBE","configuredProviderRef":"p","requestedModelId":"m","requestedModelVersion":"v",
                "endpointRef":"e","invocationProfileVersion":"ip","status":"APPROVED","scope":"GLOBAL" }
            ] }
            """;
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> FileBackedApprovedModelRegistry.fromJson(json));
        assertTrue(ex.getMessage().contains("status"), ex.getMessage());
    }

    @Test
    void load_fails_on_unknown_extra_key() {
        String json = """
            { "approvedModels": [
              { "capability":"TRANSCRIBE","configuredProviderRef":"p","requestedModelId":"m","requestedModelVersion":"v",
                "endpointRef":"e","invocationProfileVersion":"ip","scope":"GLOBAL","surpriseKey":"x" }
            ] }
            """;
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> FileBackedApprovedModelRegistry.fromJson(json));
        assertTrue(ex.getMessage().contains("bilinmeyen"), ex.getMessage());
    }

    @Test
    void load_fails_on_duplicate_ref() {
        // İKİ ÖZDEŞ politika-içeriği (status yok) ⇒ AYNI içerik-adresli ref → belirsiz (fail-closed).
        String json = """
            { "approvedModels": [
              { "capability":"TRANSCRIBE","configuredProviderRef":"p","requestedModelId":"m","requestedModelVersion":"v",
                "endpointRef":"e","invocationProfileVersion":"ip","scope":"GLOBAL" },
              { "capability":"TRANSCRIBE","configuredProviderRef":"p","requestedModelId":"m","requestedModelVersion":"v",
                "endpointRef":"e","invocationProfileVersion":"ip","scope":"GLOBAL" }
            ] }
            """;
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> FileBackedApprovedModelRegistry.fromJson(json));
        assertTrue(ex.getMessage().contains("approvalRef"), ex.getMessage());
    }

    @Test
    void load_fails_on_alias_collision_within_capability_provider() {
        // iki farklı model aynı (TRANSCRIBE, p) kapsamında aynı reported-id token'ını ("shared") talep ediyor
        String json = """
            { "approvedModels": [
              { "capability":"TRANSCRIBE","configuredProviderRef":"p","requestedModelId":"m1","requestedModelVersion":"v",
                "allowedReportedModelIdAliases":["shared"],
                "endpointRef":"e","invocationProfileVersion":"ip","scope":"GLOBAL" },
              { "capability":"TRANSCRIBE","configuredProviderRef":"p","requestedModelId":"m2","requestedModelVersion":"v",
                "allowedReportedModelIdAliases":["shared"],
                "endpointRef":"e","invocationProfileVersion":"ip","scope":"GLOBAL" }
            ] }
            """;
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> FileBackedApprovedModelRegistry.fromJson(json));
        assertTrue(ex.getMessage().contains("çakışma"), ex.getMessage());
    }

    @Test
    void load_fails_on_value_invalid_url_endpoint() {
        String json = """
            { "approvedModels": [
              { "capability":"TRANSCRIBE","configuredProviderRef":"p","requestedModelId":"m","requestedModelVersion":"v",
                "endpointRef":"https://evil.example/stt","invocationProfileVersion":"ip","scope":"GLOBAL" }
            ] }
            """;
        assertThrows(IllegalArgumentException.class, () -> FileBackedApprovedModelRegistry.fromJson(json));
    }

    @Test
    void load_fails_on_value_invalid_newline() {
        // JSON'da escaped \\n → değer newline içerir → izin-listesi reddi
        String json = "{ \"approvedModels\": [ {"
                + "\"capability\":\"TRANSCRIBE\",\"configuredProviderRef\":\"p\","
                + "\"requestedModelId\":\"m\\nx\",\"requestedModelVersion\":\"v\","
                + "\"endpointRef\":\"e\",\"invocationProfileVersion\":\"ip\","
                + "\"scope\":\"GLOBAL\" } ] }";
        assertThrows(IllegalArgumentException.class, () -> FileBackedApprovedModelRegistry.fromJson(json));
    }

    @Test
    void load_fails_on_value_too_long() {
        String tooLong = "a".repeat(129);
        String json = "{ \"approvedModels\": [ {"
                + "\"capability\":\"TRANSCRIBE\",\"configuredProviderRef\":\"p\","
                + "\"requestedModelId\":\"" + tooLong + "\",\"requestedModelVersion\":\"v\","
                + "\"endpointRef\":\"e\",\"invocationProfileVersion\":\"ip\","
                + "\"scope\":\"GLOBAL\" } ] }";
        assertThrows(IllegalArgumentException.class, () -> FileBackedApprovedModelRegistry.fromJson(json));
    }

    @Test
    void load_fails_on_unknown_enum_and_missing_field() {
        String badCapability = """
            { "approvedModels": [
              { "capability":"SUMMARIZE","configuredProviderRef":"p","requestedModelId":"m","requestedModelVersion":"v",
                "endpointRef":"e","invocationProfileVersion":"ip","scope":"GLOBAL" }
            ] }
            """;
        assertThrows(IllegalStateException.class, () -> FileBackedApprovedModelRegistry.fromJson(badCapability));
        String missing = """
            { "approvedModels": [
              { "capability":"TRANSCRIBE","configuredProviderRef":"p","requestedModelId":"m","requestedModelVersion":"v",
                "invocationProfileVersion":"ip","scope":"GLOBAL" }
            ] }
            """;
        assertThrows(IllegalStateException.class, () -> FileBackedApprovedModelRegistry.fromJson(missing));
    }

    @Test
    void load_fails_on_missing_root_array() {
        assertThrows(IllegalStateException.class, () -> FileBackedApprovedModelRegistry.fromJson("{ \"x\": 1 }"));
    }

    @Test
    void spec_of_default_empty_aliases_is_deterministic() {
        // strSet null → Set.of(); of(...) null alias → Set.of(); iki yol aynı ref üretmeli
        ApprovedModelSpec a = ApprovedModelSpec.of(Capability.TRANSCRIBE, "p", "m", "v",
                null, null, "e", "ip", ModelScope.GLOBAL);
        ApprovedModelSpec b = ApprovedModelSpec.of(Capability.TRANSCRIBE, "p", "m", "v",
                Set.of(), Set.of(), "e", "ip", ModelScope.GLOBAL);
        assertEquals(a.approvalRef(), b.approvalRef());
    }
}
