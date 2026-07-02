package com.ats.ops;

import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.util.Map;

/**
 * ATS-0010 event-taxonomy operasyonel event zarfı (iş-kanıtı WORM ledger'dan AYRI
 * düzlem — two-plane). Zarf YALNIZ statik registry'deki event'ler için ve registry
 * spec'iyle (category/severity/pii_class/required-extra) birebir üretilebilir —
 * fail-closed: bilinmeyen event / spec-uyumsuz zarf / eksik required-extra INVALID.
 * Yeni event = önce docs taxonomy'ye, sonra buradaki registry'ye eklenir.
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

    record EventSpec(String category, String severity, PiiClass piiClass, java.util.Set<String> requiredExtras) {}

    /** docs/observability/event-taxonomy.md §2 mirror'ı — slice'larda kullanılan event'ler eklendikçe genişler. */
    private static final Map<String, EventSpec> REGISTRY = Map.of(
            "evidence.recording.blocked_no_consent",
                    new EventSpec("evidence", "warning", PiiClass.ID_ONLY, java.util.Set.of("reason_code")),
            "evidence.attachment.scan_rejected",
                    new EventSpec("evidence", "error", PiiClass.NONE, java.util.Set.of("reason_code")),
            "evidence.append.succeeded",
                    new EventSpec("evidence", "info", PiiClass.ID_ONLY, java.util.Set.of("ledger_entry_ref")),
            "evidence.append.failed",
                    new EventSpec("evidence", "error", PiiClass.ID_ONLY, java.util.Set.of("reason_code")));

    /** Fail-closed kurucu: registry-dışı / spec-uyumsuz / loggable-olmayan zarf üretilemez. */
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
        if (piiClass == null || !piiClass.loggable()) {
            return Outcome.fail(OutcomeCode.INVALID,
                    "pii_class loggable değil (raw-pii/content/secret operasyonel düzlemde YASAK): " + piiClass);
        }
        if (extras == null) {
            return Outcome.fail(OutcomeCode.INVALID, "extras null olamaz (boş map kullan)");
        }
        EventSpec spec = eventTypeId == null ? null : REGISTRY.get(eventTypeId);
        if (spec == null) {
            return Outcome.fail(OutcomeCode.INVALID,
                    "registry-dışı eventTypeId (fail-closed; önce taxonomy+registry'ye ekle): " + eventTypeId);
        }
        if (!spec.category().equals(category) || !spec.severity().equals(severity) || spec.piiClass() != piiClass) {
            return Outcome.fail(OutcomeCode.INVALID,
                    "zarf registry spec'iyle uyumsuz (category/severity/pii_class): " + eventTypeId);
        }
        for (String required : spec.requiredExtras()) {
            String value = extras.get(required);
            if (value == null || value.isBlank()) {
                return Outcome.fail(OutcomeCode.INVALID, "required-extra eksik: " + required + " (" + eventTypeId + ")");
            }
        }
        return Outcome.ok(new OperationalEvent(tenantId, eventTypeId, category, severity, piiClass, extras));
    }
}
