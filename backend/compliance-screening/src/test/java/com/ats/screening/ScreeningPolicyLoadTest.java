package com.ats.screening;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * BLOCKER 3 (Codex 019f57cb) — policy YÜKLEME fail-closed sözleşmesi: korumalı-kategori kümesi
 * TAM (13/13) olmalı ve {@code supportedLanguages} FORMAT-doğrulanmalı. Tek-AGE gibi kısmi bir
 * policy'nin geçmesi (religion/health SUPPORTED+CLEAR gösterip) YASAK.
 */
class ScreeningPolicyLoadTest {

    /** 13 kapalı kategorinin her biri için tek WORD terim (normalize-idempotent ASCII). */
    private static final List<String[]> ALL_13 = List.of(
            new String[] {"AGE", "yas"},
            new String[] {"RELIGION_BELIEF", "din"},
            new String[] {"ETHNICITY_RACE", "irk"},
            new String[] {"TRADE_UNION", "sendika"},
            new String[] {"HEALTH_DISABILITY", "saglik"},
            new String[] {"SEX_GENDER_ORIENTATION", "cinsiyet"},
            new String[] {"MARITAL_PARENTAL_STATUS", "evli"},
            new String[] {"POLITICAL_OPINION", "siyasi"},
            new String[] {"PHILOSOPHICAL_BELIEF", "felsefi"},
            new String[] {"CRIMINAL_RECORD", "sabika"},
            new String[] {"NATIVE_LANGUAGE_ACCENT", "aksan"},
            new String[] {"ASSOCIATION_MEMBERSHIP", "dernek"},
            new String[] {"PREGNANCY_MATERNITY", "hamile"});

    private static String cat(String code, String term) {
        return "{\"code\":\"" + code + "\",\"terms\":[{\"text\":\"" + term + "\",\"kind\":\"WORD\"}]}";
    }

    private static String policyJson(String categoriesJson, String supportedLanguages) {
        return "{\"policyRef\":\"paspolicy_v1\",\"version\":\"test/v1\","
                + "\"supportedLanguages\":" + supportedLanguages + ","
                + "\"categories\":[" + categoriesJson + "],"
                + "\"safePhrases\":[],\"questionCues\":[]}";
    }

    private static String cats(List<String[]> entries) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < entries.size(); i++) {
            if (i > 0) {
                sb.append(',');
            }
            sb.append(cat(entries.get(i)[0], entries.get(i)[1]));
        }
        return sb.toString();
    }

    @Test
    void full_13_categories_loads() {
        ScreeningPolicy p = ScreeningPolicy.fromJson(policyJson(cats(ALL_13), "[\"tr\",\"en\"]"));
        assertEquals(13, p.categories().size());
        assertEquals(ProtectedCategory.values().length, p.categories().size());
    }

    @Test
    void missing_category_is_rejected() {
        // AGE çıkarılmış (12/13) → religion/health'in "desteklenmediği" sessiz-boşluk YASAK.
        String twelve = cats(ALL_13.subList(1, ALL_13.size()));
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> ScreeningPolicy.fromJson(policyJson(twelve, "[\"tr\"]")));
        assertTrue(ex.getMessage().contains("TAM") || ex.getMessage().contains("eksik"),
                () -> "eksik-kategori RED mesajı bekleniyordu: " + ex.getMessage());
    }

    @Test
    void single_category_policy_is_rejected() {
        // Tek-AGE policy (Codex'in işaret ettiği zafiyet) → tamlık kapısında RED.
        assertThrows(IllegalStateException.class,
                () -> ScreeningPolicy.fromJson(policyJson(cat("AGE", "yas"), "[\"tr\"]")));
    }

    @Test
    void duplicate_category_is_rejected() {
        String dup = cats(ALL_13) + "," + cat("AGE", "yasi");
        assertThrows(IllegalStateException.class,
                () -> ScreeningPolicy.fromJson(policyJson(dup, "[\"tr\"]")));
    }

    @Test
    void unknown_category_is_rejected() {
        String withUnknown = cats(ALL_13.subList(0, 12)) + "," + cat("MADE_UP_AXIS", "foo");
        assertThrows(IllegalStateException.class,
                () -> ScreeningPolicy.fromJson(policyJson(withUnknown, "[\"tr\"]")));
    }

    @Test
    void malformed_supported_language_is_rejected() {
        // "9" primary-subtag [a-z]{2,3} biçimini ihlal eder → FORMAT-RED (yalnız parse/sakla değil).
        assertThrows(IllegalStateException.class,
                () -> ScreeningPolicy.fromJson(policyJson(cats(ALL_13), "[\"tr\",\"9\"]")));
        // Alt-çizgi ayraç (tr_TR) da geçersiz.
        assertThrows(IllegalStateException.class,
                () -> ScreeningPolicy.fromJson(policyJson(cats(ALL_13), "[\"tr_TR\"]")));
    }

    @Test
    void well_formed_region_subtag_is_accepted() {
        // tr-TR / en-US gibi bölge alt-tag'leri FORMAT-geçerli (base(-alt-tag)*).
        ScreeningPolicy p = ScreeningPolicy.fromJson(policyJson(cats(ALL_13), "[\"tr-TR\",\"en-US\"]"));
        assertTrue(p.supportedLanguages().contains("tr-TR"));
    }
}
