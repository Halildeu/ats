package com.ats.consent;

import com.ats.contracts.EvidenceLedger;
import com.ats.contracts.EvidenceLedger.EvidenceEvent;
import com.ats.contracts.EvidenceLedger.LedgerEntry;
import com.ats.kernel.JsonValue;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import com.ats.ops.OperationalEvent;
import com.ats.ops.OperationalEventSink;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;

/**
 * Rıza-durumu yazımı = state + WORM kanıtı BİRLİKTE (Codex #64 blocker-2;
 * data-lifecycle: consent_record WORM sınıfı, recording_permission_state
 * primary-db state). Yön-asimetrik fail-closed sıralama:
 *
 *  - GRANTED (izin verici): WORM append ÖNCE — kanıt yazılamazsa izin
 *    AKTİFLEŞTİRİLMEZ (kanıtsız permissive state imkânsız).
 *  - DENIED/WITHDRAWN (kısıtlayıcı): state ÖNCE — koruyucu etki ledger'ı
 *    beklemez (KVKK: geri-çekme derhal etkili); ardından WORM append,
 *    başarısızsa hata döner (etki uygulanmış, kanıt retry'da tamamlanır —
 *    idempotencyKey timestamp'siz olduğundan replay content-match ile güvenli).
 *
 * WORM payload pointer-only: {subject_ref (opak), state} — içerik/ham-PII yok.
 */
public final class ConsentService {

    static final String WORM_EVENT_TYPE = "consent.recorded";
    private static final String RECORDED_EVENT = "privacy.consent.recorded";
    private static final String LEDGER_FAIL_EVENT = "privacy.consent.ledger_append_failed";

    private final ConsentStore store;
    private final EvidenceLedger ledger;
    private final OperationalEventSink sink;

    public ConsentService(ConsentStore store, EvidenceLedger ledger, OperationalEventSink sink) {
        this.store = store;
        this.ledger = ledger;
        this.sink = sink;
    }

    public Outcome<Void> record(RecordingPermission p) {
        if (p == null || p.tenantId() == null || p.interviewId() == null || p.state() == null
                || isBlank(p.subjectRef()) || isBlank(p.recordedAtIso())) {
            return Outcome.fail(OutcomeCode.INVALID, "RecordingPermission alanları eksik/boş olamaz");
        }
        boolean permissive = p.state() == RecordingPermission.PermissionState.GRANTED;
        if (permissive) {
            Outcome<LedgerEntry> appended = appendWorm(p);
            if (appended instanceof Outcome.Fail<LedgerEntry> fail) {
                emitLedgerFail(p);
                return Outcome.fail(OutcomeCode.NOT_CONFIGURED,
                        "rıza kanıtı yazılamadı — izin AKTİFLEŞTİRİLMEDİ (fail-closed): " + fail.reason());
            }
            Outcome<Void> put = store.put(p);
            if (put instanceof Outcome.Fail<Void> fail) {
                // kanıt var, state uygulanamadı: izin yine AKTİF DEĞİL; retry idempotent.
                return Outcome.fail(fail.code(), "rıza kanıtı yazıldı ama durum uygulanamadı: " + fail.reason());
            }
        } else {
            Outcome<Void> put = store.put(p);
            if (put instanceof Outcome.Fail<Void> fail) {
                return Outcome.fail(fail.code(), fail.reason());
            }
            Outcome<LedgerEntry> appended = appendWorm(p);
            if (appended instanceof Outcome.Fail<LedgerEntry> fail) {
                emitLedgerFail(p);
                return Outcome.fail(OutcomeCode.NOT_CONFIGURED,
                        "kısıtlayıcı durum UYGULANDI ama rıza kanıtı yazılamadı — tekrar deneyin: " + fail.reason());
            }
        }
        OperationalEvent.create(p.tenantId(), RECORDED_EVENT, "privacy", "info",
                        com.ats.ops.PiiClass.ID_ONLY, Map.of("state", p.state().name()))
                .asOptional().ifPresent(sink::emit);
        return Outcome.ok(null);
    }

    private Outcome<LedgerEntry> appendWorm(RecordingPermission p) {
        String identity = String.join("|", p.tenantId().value(), p.interviewId().value(),
                p.subjectRef(), p.state().name());
        return ledger.append(new EvidenceEvent(
                p.tenantId(),
                new com.ats.kernel.Ids.ActorId(p.subjectRef()),
                p.interviewId(),
                WORM_EVENT_TYPE,
                p.recordedAtIso(),
                // idempotencyKey timestamp'siz: aynı (tenant,interview,subject,state) beyanının
                // retry'ı content-match replay'e düşer; farklı state = yeni satır (geçiş izi).
                "consent:" + identity,
                sha256Hex(identity),
                JsonValue.object(Map.of(
                        "subject_ref", JsonValue.of(p.subjectRef()),
                        "state", JsonValue.of(p.state().name())))));
    }

    private void emitLedgerFail(RecordingPermission p) {
        OperationalEvent.create(p.tenantId(), LEDGER_FAIL_EVENT, "privacy", "error",
                        com.ats.ops.PiiClass.ID_ONLY, Map.of("reason_code", "ledger_unavailable"))
                .asOptional().ifPresent(sink::emit);
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    private static String sha256Hex(String s) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(d.length * 2);
            for (byte b : d) {
                sb.append(Character.forDigit((b >> 4) & 0xF, 16)).append(Character.forDigit(b & 0xF, 16));
            }
            return sb.toString();
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 yok", e);
        }
    }
}
