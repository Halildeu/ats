package com.ats.ops;

import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.util.Map;

/**
 * ATS-0010 event-taxonomy operasyonel event zarfı (iş-kanıtı WORM ledger'dan AYRI
 * düzlem — two-plane). Zarf yalnız loggable pii_class taşır; extras düz string
 * (opak ref/reason_code), içerik/ham-PII zarf seviyesinde fail-closed reddedilir.
 */
public record OperationalEvent(
        TenantId tenantId,
        String eventTypeId,
        String category,
        String severity,
        PiiClass piiClass,
        Map<String, String> extras) {

    public OperationalEvent {
        extras = Map.copyOf(extras);
    }

    /** Fail-closed kurucu: taxonomy-dışı/loggable-olmayan zarf üretilemez. */
    public static Outcome<OperationalEvent> create(
            TenantId tenantId,
            String eventTypeId,
            String category,
            String severity,
            PiiClass piiClass,
            Map<String, String> extras) {
        if (tenantId == null || tenantId.value() == null || tenantId.value().isBlank()) {
            return Outcome.fail(OutcomeCode.INVALID, "tenantId zorunlu (tenant-scoped event zarfı)");
        }
        if (eventTypeId == null || !eventTypeId.matches("[a-z_]+(\\.[a-z_]+)+")) {
            return Outcome.fail(OutcomeCode.INVALID, "eventTypeId taxonomy formatı değil: " + eventTypeId);
        }
        if (piiClass == null || !piiClass.loggable()) {
            return Outcome.fail(OutcomeCode.INVALID,
                    "pii_class loggable değil (raw-pii/content/secret operasyonel düzlemde YASAK): " + piiClass);
        }
        if (extras == null) {
            return Outcome.fail(OutcomeCode.INVALID, "extras null olamaz (boş map kullan)");
        }
        return Outcome.ok(new OperationalEvent(tenantId, eventTypeId, category, severity, piiClass, extras));
    }
}
