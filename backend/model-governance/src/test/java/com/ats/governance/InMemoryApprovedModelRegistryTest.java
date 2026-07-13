package com.ats.governance;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.contracts.governance.ApprovalStatus;
import com.ats.contracts.governance.ApprovedModelRegistry;
import com.ats.contracts.governance.ApprovedModelSpec;
import com.ats.contracts.governance.Capability;
import com.ats.contracts.governance.ModelApprovalRef;
import com.ats.contracts.governance.ModelScope;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * gov1-1e-c resolve/resolveConfigured fail-closed sözleşmesi: status artık WORM'dan (tek otorite)
 * çözülür — APPROVED-only Ok; UNINITIALIZED/DRAFT/REVOKED → DENIED; catalog'da yok → NOT_FOUND;
 * capability uyuşmazlığı → DENIED; registry erişilemez → NOT_CONFIGURED.
 */
class InMemoryApprovedModelRegistryTest {

    private static ApprovedModelSpec transcribe(String modelId, String version) {
        return ApprovedModelSpec.of(Capability.TRANSCRIBE, "prov-a", modelId, version,
                Set.of(), Set.of(), "endpoint-a", "ip-1", ModelScope.GLOBAL);
    }

    private static OutcomeCode code(Outcome<?> o) {
        return ((Outcome.Fail<?>) o).code();
    }

    @Test
    void resolve_approved_ok_revoked_and_draft_deny() {
        // Status catalog'da DEĞİL — WORM transition-projeksiyonundan gelir (fixture GEÇERLİ zincir seed'ler).
        ApprovedModelSpec approved = transcribe("m-ok", "v1");
        ApprovedModelSpec revoked = transcribe("m-revoked", "v1");
        ApprovedModelSpec draft = transcribe("m-draft", "v1");
        ApprovedModelRegistry registry = new GovernanceWormFixture()
                .with(approved, ApprovalStatus.APPROVED)
                .with(revoked, ApprovalStatus.REVOKED)
                .with(draft, ApprovalStatus.DRAFT)
                .registry();

        assertTrue(registry.resolve(approved.approvalRef(), Capability.TRANSCRIBE).isOk());
        assertEquals(OutcomeCode.DENIED, code(registry.resolve(revoked.approvalRef(), Capability.TRANSCRIBE)));
        assertEquals(OutcomeCode.DENIED, code(registry.resolve(draft.approvalRef(), Capability.TRANSCRIBE)));
    }

    @Test
    void resolve_catalog_ref_without_worm_transition_denies_uninitialized() {
        // catalog'da var ama WORM'da HİÇ transition yok → UNINITIALIZED → DENIED (fail-closed).
        ApprovedModelSpec spec = transcribe("m-uninit", "v1");
        ApprovedModelRegistry registry = new GovernanceWormFixture()
                .withUninitialized(spec).registry();
        assertEquals(OutcomeCode.DENIED, code(registry.resolve(spec.approvalRef(), Capability.TRANSCRIBE)));
    }

    @Test
    void resolve_unknown_ref_and_capability_mismatch_deny() {
        ApprovedModelSpec approved = transcribe("m-ok", "v1");
        ApprovedModelRegistry registry = new GovernanceWormFixture()
                .with(approved, ApprovalStatus.APPROVED).registry();

        ModelApprovalRef unknown = new ModelApprovalRef("mapr_" + "0".repeat(64));
        assertEquals(OutcomeCode.NOT_FOUND, code(registry.resolve(unknown, Capability.TRANSCRIBE)));
        // catalog kaydı TRANSCRIBE; CITE ile çözmeye çalışmak DENY (WORM'a inmeden capability-guard)
        assertEquals(OutcomeCode.DENIED, code(registry.resolve(approved.approvalRef(), Capability.CITE)));
    }

    @Test
    void resolve_configured_exact_match_ok_and_mismatches_deny() {
        ApprovedModelSpec approved = transcribe("whisper-tr", "v0.1.0");
        ApprovedModelRegistry registry = new GovernanceWormFixture()
                .with(approved, ApprovalStatus.APPROVED).registry();

        assertInstanceOf(Outcome.Ok.class,
                registry.resolveConfigured(Capability.TRANSCRIBE, "prov-a", "whisper-tr", "v0.1.0"));
        // provider mismatch → catalog byConfig null → NOT_FOUND
        assertEquals(OutcomeCode.NOT_FOUND,
                code(registry.resolveConfigured(Capability.TRANSCRIBE, "prov-b", "whisper-tr", "v0.1.0")));
        // model mismatch
        assertEquals(OutcomeCode.NOT_FOUND,
                code(registry.resolveConfigured(Capability.TRANSCRIBE, "prov-a", "whisper-en", "v0.1.0")));
        // version mismatch
        assertEquals(OutcomeCode.NOT_FOUND,
                code(registry.resolveConfigured(Capability.TRANSCRIBE, "prov-a", "whisper-tr", "v9.9.9")));
        // capability mismatch
        assertEquals(OutcomeCode.NOT_FOUND,
                code(registry.resolveConfigured(Capability.CITE, "prov-a", "whisper-tr", "v0.1.0")));
    }

    @Test
    void resolve_configured_non_approved_status_deny() {
        ApprovedModelSpec revoked = transcribe("whisper-tr", "v0.1.0");
        ApprovedModelRegistry registry = new GovernanceWormFixture()
                .with(revoked, ApprovalStatus.REVOKED).registry();
        assertEquals(OutcomeCode.DENIED,
                code(registry.resolveConfigured(Capability.TRANSCRIBE, "prov-a", "whisper-tr", "v0.1.0")));
    }

    @Test
    void empty_registry_denies() {
        var registry = InMemoryApprovedModelRegistry.empty();
        assertEquals(OutcomeCode.NOT_FOUND,
                code(registry.resolve(new ModelApprovalRef("mapr_" + "0".repeat(64)), Capability.TRANSCRIBE)));
        assertEquals(OutcomeCode.NOT_FOUND,
                code(registry.resolveConfigured(Capability.TRANSCRIBE, "prov-a", "m", "v")));
    }

    @Test
    void unavailable_registry_denies_fail_closed() {
        var registry = InMemoryApprovedModelRegistry.unavailable();
        assertEquals(OutcomeCode.NOT_CONFIGURED,
                code(registry.resolve(new ModelApprovalRef("mapr_" + "0".repeat(64)), Capability.TRANSCRIBE)));
        assertEquals(OutcomeCode.NOT_CONFIGURED,
                code(registry.resolveConfigured(Capability.TRANSCRIBE, "prov-a", "m", "v")));
    }

    @Test
    void catalog_only_registry_denies_resolve_but_serves_discovery() {
        // WORM bağlanmamış (yalnız-keşif): resolve NOT_CONFIGURED ama approvedSpecs çalışır.
        ApprovedModelSpec spec = transcribe("m", "v");
        var registry = InMemoryApprovedModelRegistry.ofCatalogOnly(List.of(spec));
        assertEquals(OutcomeCode.NOT_CONFIGURED, code(registry.resolve(spec.approvalRef(), Capability.TRANSCRIBE)));
        assertEquals(1, registry.approvedSpecs().size());
    }

    @Test
    void invalid_arguments_fail_closed() {
        var registry = new GovernanceWormFixture()
                .with(transcribe("m", "v"), ApprovalStatus.APPROVED).registry();
        assertEquals(OutcomeCode.INVALID, code(registry.resolve(null, Capability.TRANSCRIBE)));
        assertEquals(OutcomeCode.INVALID, code(registry.resolveConfigured(Capability.TRANSCRIBE, " ", "m", "v")));
    }

    // --- READ-ONLY discovery yüzeyi (PORT DIŞI concrete adapter metotları; CATALOG'u okur, WORM'a dokunmaz) ---

    @Test
    void approved_specs_returns_all_loaded_specs_immutable_and_empty_when_unavailable() {
        ApprovedModelSpec a = transcribe("m-a", "v1");
        ApprovedModelSpec b = transcribe("m-b", "v1");
        List<ApprovedModelSpec> specs = InMemoryApprovedModelRegistry.ofCatalogOnly(List.of(a, b)).approvedSpecs();
        assertEquals(2, specs.size());
        assertTrue(specs.contains(a) && specs.contains(b));
        assertThrows(UnsupportedOperationException.class, () -> specs.add(a), "keşif kopyası değişmez olmalı");
        // erişilemez/boş registry → boş keşif (fail-closed: hiçbir politika açığa çıkmaz)
        assertTrue(InMemoryApprovedModelRegistry.unavailable().approvedSpecs().isEmpty());
        assertTrue(InMemoryApprovedModelRegistry.empty().approvedSpecs().isEmpty());
    }

    @Test
    void approval_refs_for_maps_capability_to_ref_and_fails_closed_on_ambiguity() {
        // aynı provider altında TRANSCRIBE + CITE (farklı capability) → belirsizlik YOK
        ApprovedModelSpec t = transcribe("m-t", "v1");
        ApprovedModelSpec c = ApprovedModelSpec.of(Capability.CITE, "prov-a", "m-c", "v1",
                Set.of(), Set.of(), "endpoint-a", "ip-1", ModelScope.GLOBAL);
        var registry = InMemoryApprovedModelRegistry.ofCatalogOnly(List.of(t, c));
        Map<Capability, ModelApprovalRef> refs = registry.approvalRefsFor("prov-a");
        assertEquals(t.approvalRef(), refs.get(Capability.TRANSCRIBE));
        assertEquals(c.approvalRef(), refs.get(Capability.CITE));
        // başka provider → boş; erişilemez registry → boş
        assertTrue(registry.approvalRefsFor("prov-yok").isEmpty());
        assertTrue(InMemoryApprovedModelRegistry.unavailable().approvalRefsFor("prov-a").isEmpty());

        // aynı (provider, capability) için İKİ farklı model → belirsiz keşif fail-closed
        var ambiguous = InMemoryApprovedModelRegistry.ofCatalogOnly(
                List.of(t, transcribe("m-t2", "v1")));
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> ambiguous.approvalRefsFor("prov-a"));
        assertTrue(ex.getMessage().contains("belirsiz"), ex.getMessage());
    }
}
