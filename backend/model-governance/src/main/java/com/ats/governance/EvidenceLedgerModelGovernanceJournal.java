package com.ats.governance;

import com.ats.contracts.EvidenceLedger;
import com.ats.contracts.EvidenceLedger.EvidenceEvent;
import com.ats.contracts.EvidenceLedger.LedgerEntry;
import com.ats.contracts.governance.ApprovedModelSpec;
import com.ats.contracts.governance.Capability;
import com.ats.contracts.governance.ModelGovernanceGate.Decision;
import com.ats.contracts.governance.ModelGovernanceGate.Permit;
import com.ats.contracts.governance.ModelGovernanceGate.Reason;
import com.ats.contracts.governance.ModelGovernanceJournal;
import com.ats.contracts.governance.ModelInvocationId;
import com.ats.kernel.JsonCodec;
import com.ats.kernel.JsonValue;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * gov1-1d {@link ModelGovernanceJournal} adapter'ı: WORM {@link EvidenceLedger} + boot-snapshot
 * ({@code capability→ApprovedModelSpec}, app-boot gate çıktısından) + injected {@link Clock}.
 * Framework/persistence/vendor YOK (ArchUnit zorlar) — yalnız shared-kernel + contracts-java.
 *
 * <p><b>Boot-snapshot re-verify (audit-bütünlüğü):</b> her permit-taşıyan çağrı, permit'in
 * downstream alanlarını (approvalRef + providerRef + modelId + version + endpointRef + profile)
 * boot-snapshot spec'iyle EXACT karşılaştırır; uyuşmazlık → WORM'a YAZMADAN fail-closed
 * ({@link Reason#PERMIT_MISMATCH}). Gate zaten aynı re-verify'ı yaptı; bu, tamperlanmış/uyumsuz
 * bir permit'in WORM'a sahte deployment-authoritative kimlik yazmasını yapısal olarak engeller.
 *
 * <p><b>Payload (Plane-2 WORM, kanonik JSON):</b> invocation_id, capability, approval_ref,
 * intended_provider_ref/model_id/model_version, endpoint_ref, invocation_profile_version,
 * observed_model_id/model_version, decision, reason_code, stage, binding_state. YASAK: claim/
 * transcript/audio-object-ref/provider-ham-hata/URL/bearer/secret. Reason her zaman kapalı-enum
 * adı; observed_* provider-fail/preflight-red'de null. contentHash = kanonik payload'ın SHA-256'sı;
 * occurredAt = injected Clock.
 */
public final class EvidenceLedgerModelGovernanceJournal implements ModelGovernanceJournal {

    static final String AUTHORIZED_EVENT_TYPE = "ai_pipeline.model_governance.invocation_authorized";
    static final String ATTESTED_EVENT_TYPE = "ai_pipeline.model_governance.invocation_attested";
    static final String REJECTED_EVENT_TYPE = "ai_pipeline.model_governance.invocation_rejected";

    private static final String BINDING_RESOLVED = "RESOLVED";
    private static final String BINDING_UNAVAILABLE = "UNAVAILABLE";

    private final EvidenceLedger ledger;
    private final Map<Capability, ApprovedModelSpec> bootSnapshot;
    private final Clock clock;

    public EvidenceLedgerModelGovernanceJournal(
            EvidenceLedger ledger, Map<Capability, ApprovedModelSpec> bootSnapshot, Clock clock) {
        if (ledger == null) {
            throw new IllegalArgumentException("ledger zorunlu (fail-closed)");
        }
        if (bootSnapshot == null) {
            throw new IllegalArgumentException("bootSnapshot zorunlu (fail-closed)");
        }
        if (clock == null) {
            throw new IllegalArgumentException("clock zorunlu (fail-closed; Date.now/random değil)");
        }
        this.ledger = ledger;
        this.bootSnapshot = Map.copyOf(bootSnapshot);
        this.clock = clock;
    }

    @Override
    public Outcome<JournalReceipt> recordAuthorized(
            InvocationContext ctx, ModelInvocationId id, Permit permit) {
        if (ctx == null || id == null || permit == null) {
            return Outcome.fail(OutcomeCode.INVALID, "recordAuthorized argümanları zorunlu (fail-closed)");
        }
        ApprovedModelSpec spec = bootSnapshot.get(permit.capability());
        if (spec == null || !permitMatchesSnapshot(permit, spec)) {
            // Boot-snapshot ile uyuşmayan/forged permit → WORM'a YAZMA (audit-bütünlüğü, fail-closed).
            return Outcome.fail(Reason.PERMIT_MISMATCH.outcomeCode(), Reason.PERMIT_MISMATCH.name());
        }
        JsonValue.JsonObject payload = payload(
                id, permit.capability(), permit.approvalRef().value(),
                permit.providerRef(), permit.modelId(), permit.modelVersion(),
                permit.endpointRef(), permit.invocationProfileVersion(),
                null, null,                 // observed: authorized aşamasında henüz yok
                null,                        // decision verdict: henüz yok
                null,                        // reason_code: yok
                JournalStage.AUTHORIZED, BINDING_RESOLVED);
        return append(ctx, AUTHORIZED_EVENT_TYPE, id, JournalStage.AUTHORIZED, payload);
    }

    @Override
    public Outcome<JournalReceipt> recordTerminal(
            InvocationContext ctx, ModelInvocationId id, Terminal terminal) {
        if (ctx == null || id == null || terminal == null) {
            return Outcome.fail(OutcomeCode.INVALID, "recordTerminal argümanları zorunlu (fail-closed)");
        }
        return switch (terminal) {
            case PreflightRejected pr -> terminalPreflight(ctx, id, pr);
            case InvocationPreparationRejected ipr -> terminalWithPermit(
                    ctx, id, ipr.permit(), REJECTED_EVENT_TYPE, JournalStage.PRE_PROVIDER_REJECTED,
                    // provider HİÇ çağrılmadı → observed yok, decision verdict yok; reason = prep-fail.
                    null, null, null, ipr.reason());
            case ProviderRejected pr -> terminalWithPermit(
                    ctx, id, pr.permit(), REJECTED_EVENT_TYPE, JournalStage.PROVIDER_REJECTED,
                    null, null, null, pr.reason());
            case VerificationRejected vr -> terminalWithPermit(
                    ctx, id, vr.permit(), REJECTED_EVENT_TYPE, JournalStage.VERIFICATION_REJECTED,
                    vr.reported().reportedModelId(), vr.reported().reportedModelVersion(),
                    Decision.Verdict.DENY, vr.decision().reasonCode());
            case Attested at -> terminalWithPermit(
                    ctx, id, at.permit(), ATTESTED_EVENT_TYPE, JournalStage.ATTESTED,
                    // ALLOW: observed = DOĞRULANMIŞ decision-observed (non-null değişmez), ham reported değil.
                    at.decision().observedModelId(), at.decision().observedModelVersion(),
                    Decision.Verdict.ALLOW, null);
        };
    }

    /** Preflight terminal: permit YOK → intended-alanlar boot-snapshot'tan; binding yoksa UNAVAILABLE + null (UYDURMA yok). */
    private Outcome<JournalReceipt> terminalPreflight(
            InvocationContext ctx, ModelInvocationId id, PreflightRejected pr) {
        ApprovedModelSpec spec = bootSnapshot.get(pr.capability());
        JsonValue.JsonObject payload;
        if (spec == null) {
            payload = payload(
                    id, pr.capability(), null,
                    null, null, null, null, null,
                    null, null,
                    null, pr.reason(),
                    JournalStage.PREFLIGHT_REJECTED, BINDING_UNAVAILABLE);
        } else {
            payload = payload(
                    id, pr.capability(), spec.approvalRef().value(),
                    spec.configuredProviderRef(), spec.requestedModelId(), spec.requestedModelVersion(),
                    spec.endpointRef(), spec.invocationProfileVersion(),
                    null, null,
                    null, pr.reason(),
                    JournalStage.PREFLIGHT_REJECTED, BINDING_RESOLVED);
        }
        return append(ctx, REJECTED_EVENT_TYPE, id, JournalStage.PREFLIGHT_REJECTED, payload);
    }

    /** Permit-taşıyan terminal: permit boot-snapshot ile re-verify (uyuşmazlık → WORM'a YAZMA, fail-closed). */
    private Outcome<JournalReceipt> terminalWithPermit(
            InvocationContext ctx, ModelInvocationId id, Permit permit, String eventType, JournalStage stage,
            String observedModelId, String observedModelVersion, Decision.Verdict verdict, Reason reasonCode) {
        ApprovedModelSpec spec = bootSnapshot.get(permit.capability());
        if (spec == null || !permitMatchesSnapshot(permit, spec)) {
            return Outcome.fail(Reason.PERMIT_MISMATCH.outcomeCode(), Reason.PERMIT_MISMATCH.name());
        }
        JsonValue.JsonObject payload = payload(
                id, permit.capability(), permit.approvalRef().value(),
                permit.providerRef(), permit.modelId(), permit.modelVersion(),
                permit.endpointRef(), permit.invocationProfileVersion(),
                observedModelId, observedModelVersion,
                verdict, reasonCode,
                stage, BINDING_RESOLVED);
        return append(ctx, eventType, id, stage, payload);
    }

    /**
     * Permit'in downstream metadata alanları boot-snapshot spec'iyle EXACT eşleşiyor mu (gate'in
     * {@code permitBoundToSpec} + approvalRef re-verify'ıyla aynı disiplin; audit-bütünlüğü).
     */
    private static boolean permitMatchesSnapshot(Permit permit, ApprovedModelSpec spec) {
        return permit.capability() == spec.capability()
                && permit.approvalRef().equals(spec.approvalRef())
                && permit.providerRef().equals(spec.configuredProviderRef())
                && permit.modelId().equals(spec.requestedModelId())
                && permit.modelVersion().equals(spec.requestedModelVersion())
                && permit.endpointRef().equals(spec.endpointRef())
                && permit.invocationProfileVersion().equals(spec.invocationProfileVersion());
    }

    /** Kanonik 14-alan governance-metadata payload'ı (absent → JsonNull; sabit alan-kümesi → determinist hash). */
    private static JsonValue.JsonObject payload(
            ModelInvocationId id, Capability capability, String approvalRef,
            String intendedProviderRef, String intendedModelId, String intendedModelVersion,
            String endpointRef, String invocationProfileVersion,
            String observedModelId, String observedModelVersion,
            Decision.Verdict verdict, Reason reasonCode,
            JournalStage stage, String bindingState) {
        Map<String, JsonValue> m = new LinkedHashMap<>();
        m.put("invocation_id", JsonValue.of(id.value()));
        m.put("capability", JsonValue.of(capability.name()));
        m.put("approval_ref", nullable(approvalRef));
        m.put("intended_provider_ref", nullable(intendedProviderRef));
        m.put("intended_model_id", nullable(intendedModelId));
        m.put("intended_model_version", nullable(intendedModelVersion));
        m.put("endpoint_ref", nullable(endpointRef));
        m.put("invocation_profile_version", nullable(invocationProfileVersion));
        m.put("observed_model_id", nullable(observedModelId));
        m.put("observed_model_version", nullable(observedModelVersion));
        m.put("decision", verdict == null ? new JsonValue.JsonNull() : JsonValue.of(verdict.name()));
        m.put("reason_code", reasonCode == null ? new JsonValue.JsonNull() : JsonValue.of(reasonCode.name()));
        m.put("stage", JsonValue.of(stage.token()));
        m.put("binding_state", JsonValue.of(bindingState));
        return JsonValue.object(m);
    }

    private static JsonValue nullable(String v) {
        return v == null ? new JsonValue.JsonNull() : JsonValue.of(v);
    }

    private Outcome<JournalReceipt> append(
            InvocationContext ctx, String eventType, ModelInvocationId id,
            JournalStage stage, JsonValue.JsonObject payload) {
        String contentHash = sha256Hex(JsonCodec.canonical(payload));
        // idempotency-key: authorized ↔ tek satır; TÜM terminal varyantları TEK ":terminal" slot'unu
        // paylaşır → invocation başına en fazla bir terminal (WORM unique-constraint makine-zorlar).
        String slot = stage == JournalStage.AUTHORIZED ? "authorized" : "terminal";
        String idempotencyKey = ctx.tenantId().value() + ":" + ctx.interviewId().value()
                + ":model-gov:" + id.value() + ":" + slot;
        String occurredAt = clock.instant().toString();
        EvidenceEvent event = new EvidenceEvent(
                ctx.tenantId(), ctx.actorId(), ctx.interviewId(),
                eventType, occurredAt, idempotencyKey, contentHash, payload);
        Outcome<LedgerEntry> appended = ledger.append(event);
        // Fail-closed: Fail VEYA Ok(null)-entry → WORM append erişilemez say (NPE'ye izin verme).
        if (!(appended instanceof Outcome.Ok<LedgerEntry> ok) || ok.value() == null) {
            // WORM append erişilemez → orkestrasyon AUDIT_UNAVAILABLE ile fail-closed davranır.
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, Reason.AUDIT_UNAVAILABLE.name());
        }
        LedgerEntry entry = ok.value();
        if (entry.evidenceId() == null || entry.evidenceId().value() == null
                || entry.evidenceId().value().isBlank()) {
            // Bozuk ledger (null/blank evidenceId) → JournalReceipt ctor'una NPE/atma yerine fail-closed.
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, Reason.AUDIT_UNAVAILABLE.name());
        }
        return Outcome.ok(new JournalReceipt(entry.evidenceId().value()));
    }

    private static String sha256Hex(String text) {
        try {
            return HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 mevcut olmalı", e);
        }
    }
}
