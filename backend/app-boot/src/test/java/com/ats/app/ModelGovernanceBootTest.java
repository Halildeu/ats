package com.ats.app;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
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
 * P3-gov0 boot-doğrulama: wire'lanmış her enabled-capability APPROVED onaya çözülmeli
 * (aksi halde composition fail-closed patlar). Wire edilmeyen capability boot'u düşürmez.
 */
class ModelGovernanceBootTest {

    private static ApprovedModelSpec approvedTranscribe() {
        return ApprovedModelSpec.of(Capability.TRANSCRIBE, "faz24-live-stt", "whisper-tr", "v0.1.0",
                Set.of(), Set.of(), "endpoint-a", "ip-1", ApprovalStatus.APPROVED, ModelScope.GLOBAL);
    }

    private static ModelGovernanceProperties.Wiring wiring(
            String capability, String provider, String modelId, String version) {
        return new ModelGovernanceProperties.Wiring(capability, provider, modelId, version);
    }

    @Test
    void passes_when_wired_capability_is_approved() {
        ApprovedModelRegistry registry = InMemoryApprovedModelRegistry.of(List.of(approvedTranscribe()));
        ModelGovernanceBoot.Validation result = ModelGovernanceBoot.validateWiredConfig(registry,
                List.of(wiring("TRANSCRIBE", "faz24-live-stt", "whisper-tr", "v0.1.0")));
        assertEquals(1, result.validatedWirings());
    }

    @Test
    void fails_when_wired_config_is_not_approved() {
        ApprovedModelRegistry registry = InMemoryApprovedModelRegistry.of(List.of(approvedTranscribe()));
        // yanlış versiyon → registry'de APPROVED eşleşme yok → boot FAIL
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> ModelGovernanceBoot.validateWiredConfig(registry,
                        List.of(wiring("TRANSCRIBE", "faz24-live-stt", "whisper-tr", "v9.9.9"))));
        assertTrue(ex.getMessage().contains("çözülemedi"), ex.getMessage());
    }

    @Test
    void fails_when_wired_capability_is_revoked() {
        ApprovedModelSpec revoked = ApprovedModelSpec.of(Capability.TRANSCRIBE, "faz24-live-stt", "whisper-tr",
                "v0.1.0", Set.of(), Set.of(), "endpoint-a", "ip-1", ApprovalStatus.REVOKED, ModelScope.GLOBAL);
        ApprovedModelRegistry registry = InMemoryApprovedModelRegistry.of(List.of(revoked));
        assertThrows(IllegalStateException.class,
                () -> ModelGovernanceBoot.validateWiredConfig(registry,
                        List.of(wiring("TRANSCRIBE", "faz24-live-stt", "whisper-tr", "v0.1.0"))));
    }

    @Test
    void does_not_fail_for_not_enabled_capability() {
        // registry yalnız TRANSCRIBE onaylı; deployment yalnız TRANSCRIBE wire'lıyor (CITE enabled değil)
        // → CITE onayı ARANMAZ, boot geçer.
        ApprovedModelRegistry registry = InMemoryApprovedModelRegistry.of(List.of(approvedTranscribe()));
        assertDoesNotThrow(() -> ModelGovernanceBoot.validateWiredConfig(registry,
                List.of(wiring("TRANSCRIBE", "faz24-live-stt", "whisper-tr", "v0.1.0"))));
    }

    @Test
    void empty_wirings_is_noop() {
        ApprovedModelRegistry registry = InMemoryApprovedModelRegistry.empty();
        ModelGovernanceBoot.Validation result = ModelGovernanceBoot.validateWiredConfig(registry, List.of());
        assertEquals(0, result.validatedWirings());
    }

    @Test
    void unknown_capability_string_fails_closed() {
        ApprovedModelRegistry registry = InMemoryApprovedModelRegistry.of(List.of(approvedTranscribe()));
        assertThrows(IllegalStateException.class,
                () -> ModelGovernanceBoot.validateWiredConfig(registry,
                        List.of(wiring("SCORING", "faz24-live-stt", "whisper-tr", "v0.1.0"))));
    }
}
