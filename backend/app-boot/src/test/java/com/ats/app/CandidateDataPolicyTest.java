package com.ats.app;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.app.AppProperties.CandidateData;
import org.junit.jupiter.api.Test;

/**
 * Aday verisi politikasının ortam invariantları (#200).
 *
 * <p>Owner kararı: KVKK/PII kısıtı test ortamında uçtan uca doğrulamayı engellememeli,
 * fakat production'a gerçek aday verisiyle geçişi <strong>engellemeli</strong>. Bu test
 * kilidin self-attestation değil, makine tarafından zorlandığını kanıtlar.
 */
class CandidateDataPolicyTest {

    @Test
    void real_candidate_data_in_production_fails_closed_at_boot() {
        IllegalStateException failure = assertThrows(IllegalStateException.class,
                () -> new CandidateData("real-allowed", "prod"));
        assertTrue(failure.getMessage().contains("Production"),
                "prod kilidi açık ve okunur bir gerekçeyle düşmeli: " + failure.getMessage());
    }

    @Test
    void missing_configuration_falls_back_to_most_restrictive_mode() {
        CandidateData absent = new CandidateData(null, null);
        assertEquals("synthetic-only", absent.mode());
        assertEquals("prod", absent.environment());
        assertTrue(absent.syntheticOnly(),
                "konfig verilmediğinde sentetik-yalnız uygulanır (fail-safe default)");
        assertFalse(absent.realCandidateDataAllowed());

        CandidateData blank = new CandidateData("  ", "  ");
        assertEquals("synthetic-only", blank.mode());
        assertEquals("prod", blank.environment());
    }

    @Test
    void non_production_environment_can_enable_real_candidate_data() {
        CandidateData test = new CandidateData("real-allowed", "test");
        assertTrue(test.realCandidateDataAllowed());
        assertFalse(test.syntheticOnly());

        CandidateData dev = new CandidateData("real-allowed", "dev");
        assertTrue(dev.realCandidateDataAllowed());
    }

    @Test
    void production_still_serves_synthetic_only_mode() {
        CandidateData prod = new CandidateData("synthetic-only", "prod");
        assertTrue(prod.syntheticOnly());
        assertFalse(prod.realCandidateDataAllowed());
    }

    @Test
    void unknown_mode_or_environment_is_rejected_as_closed_set() {
        assertThrows(IllegalStateException.class, () -> new CandidateData("permissive", "test"),
                "tanımsız mode sessizce en gevşek moda düşmemeli");
        assertThrows(IllegalStateException.class, () -> new CandidateData("real-allowed", "staging"),
                "tanımsız environment prod kilidini atlatmamalı");
        assertThrows(IllegalStateException.class, () -> new CandidateData("REAL-ALLOWED", "test"),
                "kapalı küme büyük/küçük harf varyantıyla genişletilemez");
        assertThrows(IllegalStateException.class, () -> new CandidateData("real-allowed", "PROD"),
                "prod beyanının harf varyantı kilidi atlatmamalı");
    }

    @Test
    void app_properties_defaults_to_synthetic_only_when_policy_absent() {
        AppProperties props = new AppProperties(
                new AppProperties.Db("jdbc:postgresql://localhost:5432/ats", "u", "p"),
                null, null, null, null);
        assertTrue(props.candidateData().syntheticOnly(),
                "politika bloğu render edilmemiş bir ortam en kısıtlayıcı moda düşer");
        assertEquals("prod", props.candidateData().environment());
    }
}
