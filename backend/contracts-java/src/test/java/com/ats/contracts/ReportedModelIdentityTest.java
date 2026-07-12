package com.ats.contracts;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.contracts.AIProvider.ReportedModelIdentity;
import org.junit.jupiter.api.Test;

/**
 * gov1-1b {@link ReportedModelIdentity} zarf-tipi birim testleri: sağlayıcının
 * RAPORLADIĞI (untrusted) model kimliğinin taşınması + fail-closed değer disiplini
 * (ApprovedModelSpec doğrulama pattern'i referans: {@code [A-Za-z0-9._:@/-]}, ≤128,
 * {@code ://} reddi). Enforcement YOK (resolve/matchesReported gov1-1c) — yalnız envelope.
 */
class ReportedModelIdentityTest {

    @Test
    void not_reported_has_both_fields_null() {
        ReportedModelIdentity id = ReportedModelIdentity.notReported();
        assertNull(id.reportedModelId());
        assertNull(id.reportedModelVersion());
    }

    @Test
    void from_provider_carries_valid_values() {
        ReportedModelIdentity id = ReportedModelIdentity.fromProvider("whisper-large-v3", "2024.01");
        assertEquals("whisper-large-v3", id.reportedModelId());
        assertEquals("2024.01", id.reportedModelVersion());
    }

    @Test
    void from_provider_reduces_missing_and_blank_to_null() {
        ReportedModelIdentity id = ReportedModelIdentity.fromProvider(null, "   ");
        assertNull(id.reportedModelId(), "null → raporlanmadı");
        assertNull(id.reportedModelVersion(), "blank → raporlanmadı");
    }

    @Test
    void from_provider_reduces_malformed_to_null_never_throws() {
        // present-ama-malformed → güvenli temsil (null'a indir); asla exception atmaz
        assertNull(ReportedModelIdentity.fromProvider("has space", null).reportedModelId(),
                "allowlist-dışı boşluk → null");
        assertNull(ReportedModelIdentity.fromProvider("scheme://host", null).reportedModelId(),
                "'://' URL sızıntısı → null (karakterler allowlist'te ama '://' reddedilir)");
        assertNull(ReportedModelIdentity.fromProvider("x".repeat(129), null).reportedModelId(),
                ">128 uzunluk → null");
        assertNull(ReportedModelIdentity.fromProvider("a\nb", null).reportedModelId(),
                "kontrol karakteri / newline (log-injection vektörü) → null");
    }

    @Test
    void from_provider_accepts_full_allowlist_charset() {
        // ApprovedModelSpec ile aynı küme ([A-Za-z0-9._:@/-]); ':' izinli ama '://' değil
        ReportedModelIdentity id = ReportedModelIdentity.fromProvider("A.z0_9:@/-x", "v1.2.3");
        assertEquals("A.z0_9:@/-x", id.reportedModelId());
        assertEquals("v1.2.3", id.reportedModelVersion());
    }

    @Test
    void canonical_constructor_is_airtight_fail_closed_on_malformed() {
        // savunma-derinliği: null-OLMAYAN geçersiz değerle DOĞRUDAN kurulum fail-closed atar
        // (tip hiçbir kod yolundan bozuk değer taşıyamaz)
        assertThrows(IllegalArgumentException.class, () -> new ReportedModelIdentity("bad value", null));
        assertThrows(IllegalArgumentException.class, () -> new ReportedModelIdentity(null, "scheme://x"));
        assertThrows(IllegalArgumentException.class, () -> new ReportedModelIdentity("x".repeat(129), null));
    }

    @Test
    void canonical_constructor_allows_nulls_and_valid_values() {
        // null = raporlanmadı (geçerli); geçerli değer geçerli
        new ReportedModelIdentity(null, null);
        new ReportedModelIdentity("gpt-4o", null);
        new ReportedModelIdentity(null, "2024-08-06");
    }

    @Test
    void raw_malformed_value_never_leaks_into_exception_message() {
        // secret/PII sızıntı guard'ı: ham (geçersiz) değer exception mesajına KONMAZ
        String secretish = "TOKEN abcXYZ";
        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class,
                () -> new ReportedModelIdentity(secretish, null));
        assertTrue(ex.getMessage() != null && !ex.getMessage().contains(secretish),
                "ham değer mesajda görünmemeli (sızıntı guard'ı)");
    }
}
