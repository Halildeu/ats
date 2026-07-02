package com.ats.consent;

import com.ats.consent.RecordingPermission.PermissionState;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import com.ats.ops.OperationalEvent;
import com.ats.ops.OperationalEventSink;
import com.ats.ops.PiiClass;
import java.util.Map;

/**
 * ATS-0003 fail-closed kayıt-izni kapısı (product-flow RECORDING_GATED adımı):
 * consent kaydı YOKSA veya GRANTED DEĞİLSE işleme reddedilir — sessiz default yok.
 * Her red `evidence.recording.blocked_no_consent` operasyonel event'i üretir
 * (taxonomy: evidence/warning/id-only/reason_code).
 */
public final class ConsentGate {

    public static final String BLOCKED_EVENT = "evidence.recording.blocked_no_consent";

    private final ConsentStore store;
    private final OperationalEventSink sink;

    public ConsentGate(ConsentStore store, OperationalEventSink sink) {
        this.store = store;
        this.sink = sink;
    }

    public Outcome<Void> requireRecordingAllowed(TenantId tenantId, InterviewId interviewId) {
        Outcome<RecordingPermission> found = store.find(tenantId, interviewId);
        if (!(found instanceof Outcome.Ok<RecordingPermission> ok)) {
            return deny(tenantId, "consent_record_missing");
        }
        PermissionState state = ok.value().state();
        if (state == null) {
            // malformed kayıt deny-by-default'u exception'a çeviremez (Codex #48 major-4)
            return deny(tenantId, "consent_state_invalid");
        }
        if (state != PermissionState.GRANTED) {
            // Locale.ROOT: tr-locale'de "WITHDRAWN".toLowerCase() "wıthdrawn" üretir (noktasız ı) —
            // reason_code makine-okur sabit olmalı
            return deny(tenantId, "consent_state_" + state.name().toLowerCase(java.util.Locale.ROOT));
        }
        return Outcome.ok(null);
    }

    private Outcome<Void> deny(TenantId tenantId, String reasonCode) {
        OperationalEvent.create(
                        tenantId, BLOCKED_EVENT, "evidence", "warning", PiiClass.ID_ONLY,
                        Map.of("reason_code", reasonCode))
                .asOptional()
                .ifPresent(sink::emit);
        return Outcome.fail(OutcomeCode.DENIED, "kayıt-izni yok/geçersiz (fail-closed): " + reasonCode);
    }
}
