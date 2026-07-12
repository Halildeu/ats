package com.ats.governance;

import com.ats.contracts.AIProvider;
import com.ats.contracts.governance.ApprovedModelRegistry;
import com.ats.contracts.governance.ApprovedModelSpec;
import com.ats.contracts.governance.Capability;
import com.ats.contracts.governance.ModelApprovalRef;
import com.ats.contracts.governance.ModelGovernanceGate;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.util.EnumMap;
import java.util.Map;

/**
 * gov1-1c {@link ModelGovernanceGate} adapter'ı: {@link ApprovedModelRegistry} PORTU'nu +
 * yetenek→{@link ModelApprovalRef} binding haritasını sarar (binding app-boot boot-gate
 * çıktısından türetilir). Framework/persistence/vendor YOK (ArchUnit zorlar) — yalnız
 * shared-kernel + contracts-java.
 *
 * <p><b>preflight(cap):</b> binding'den ref al → {@code registry.resolve(ref, cap)}. APPROVED →
 * {@link ModelGovernanceGate.Permit} (spec alanlarından). Aksi halde fail-closed
 * {@code Outcome.Fail} uygun {@link ModelGovernanceGate.Reason} ile.
 *
 * <p><b>verify(permit, reported):</b> AYNI ref'i YENİDEN {@code registry.resolve} eder (TOCTOU —
 * çağrı sırasında REVOKED olduysa reddeder), sonra {@code spec.matchesReported} HARD-REQUIRED
 * (absent/mismatch → uygun Reason ile DENY). ALLOW yalnız hepsi geçerse.
 *
 * <p><b>DENIED disambiguation (durable-not):</b> {@code ApprovedModelRegistry} kontratı hem
 * capability-uyuşmazlığını hem status≠APPROVED'ı {@code DENIED}'a katlar. Boot-gate (gov0)
 * binding'lerin doğru-yetenekli APPROVED spec'lere çözüldüğünü zaten kanıtladığından, çalışma-anı
 * bir registry-{@code DENIED}'ı yalnız status-geçişi (REVOKED/DRAFT) olabilir → {@link
 * ModelGovernanceGate.Reason#APPROVAL_NOT_ACTIVE}. {@link ModelGovernanceGate.Reason#CAPABILITY_MISMATCH}
 * ise registry'nin Ok döndürdüğü ama spec-yeteneğinin istenenle uyuşmadığı savunma-derinliği
 * invariant'ını korur (registry/adapter bozulması).
 */
public final class RegistryBackedModelGovernanceGate implements ModelGovernanceGate {

    private final ApprovedModelRegistry registry;
    private final Map<Capability, ModelApprovalRef> capabilityBindings;

    public RegistryBackedModelGovernanceGate(
            ApprovedModelRegistry registry, Map<Capability, ModelApprovalRef> capabilityBindings) {
        if (registry == null) {
            throw new IllegalArgumentException("registry zorunlu (fail-closed)");
        }
        if (capabilityBindings == null) {
            throw new IllegalArgumentException("capabilityBindings zorunlu (fail-closed)");
        }
        this.registry = registry;
        this.capabilityBindings = new EnumMap<>(capabilityBindings);
    }

    @Override
    public Outcome<Permit> preflight(Capability capability) {
        if (capability == null) {
            return Outcome.fail(OutcomeCode.INVALID, "capability zorunlu (fail-closed)");
        }
        ModelApprovalRef ref = capabilityBindings.get(capability);
        if (ref == null) {
            // Yeteneğe bağlı onaylı-model YOK → çağrı yapılamaz (fail-closed).
            return ModelGovernanceGate.preflightDeny(Reason.APPROVAL_NOT_FOUND);
        }
        Outcome<ApprovedModelSpec> resolved = registry.resolve(ref, capability);
        if (!(resolved instanceof Outcome.Ok<ApprovedModelSpec> ok)) {
            return ModelGovernanceGate.preflightDeny(mapResolveFail((Outcome.Fail<ApprovedModelSpec>) resolved));
        }
        ApprovedModelSpec spec = ok.value();
        if (spec.capability() != capability) {
            // Savunma-derinliği: registry doğru-yetenekli spec döndürmeli (Ok garantisi); değilse fail-closed.
            return ModelGovernanceGate.preflightDeny(Reason.CAPABILITY_MISMATCH);
        }
        return Outcome.ok(new Permit(
                spec.capability(),
                spec.approvalRef(),
                spec.configuredProviderRef(),
                spec.requestedModelId(),
                spec.requestedModelVersion(),
                spec.endpointRef(),
                spec.invocationProfileVersion()));
    }

    @Override
    public Outcome<Decision> verify(Permit permit, AIProvider.ReportedModelIdentity reported) {
        if (permit == null) {
            return Outcome.fail(OutcomeCode.INVALID, "permit zorunlu (fail-closed)");
        }
        // TOCTOU: aynı onay YENİDEN çözülür — preflight ile provider çağrısı arasında REVOKED
        // olmuş olabilir; hâlâ APPROVED olmalı.
        Outcome<ApprovedModelSpec> resolved = registry.resolve(permit.approvalRef(), permit.capability());
        if (!(resolved instanceof Outcome.Ok<ApprovedModelSpec> ok)) {
            return denyDecision(permit, mapResolveFail((Outcome.Fail<ApprovedModelSpec>) resolved));
        }
        ApprovedModelSpec spec = ok.value();
        if (spec.capability() != permit.capability()) {
            return denyDecision(permit, Reason.CAPABILITY_MISMATCH);
        }
        if (reported == null) {
            // Zarf non-null invariant'ı (TranscriptResult/CitationResult) ihlal edilmiş — savunma-derinliği.
            return denyDecision(permit, Reason.REPORTED_IDENTITY_MALFORMED);
        }
        String reportedId = reported.reportedModelId();
        String reportedVersion = reported.reportedModelVersion();
        // AUTHORITATIVE allow kararı = spec.matchesReported (tek-kaynak; absent→hard-fail).
        if (spec.matchesReported(reportedId, reportedVersion)) {
            return Outcome.ok(Decision.allow(
                    permit.approvalRef(), permit.capability(), reportedId, reportedVersion));
        }
        // DENY: precise Reason etiketi (yalnız tanılama; allow/deny kararını DEĞİŞTİRMEZ).
        return denyDecision(permit, classifyIdentityDeny(spec, reportedId, reportedVersion));
    }

    /**
     * RED gerekçesi decompose (matchesReported false döndüğünde çağrılır): absent → MISSING;
     * id onaylı değilse → MODEL_ID_MISMATCH; aksi halde (id ok) → MODEL_VERSION_MISMATCH.
     * Yalnız ETİKET içindir — güvenlik kararı {@code matchesReported} tarafından zaten verildi.
     */
    private static Reason classifyIdentityDeny(ApprovedModelSpec spec, String reportedId, String reportedVersion) {
        if (isAbsent(reportedId) || isAbsent(reportedVersion)) {
            return Reason.REPORTED_IDENTITY_MISSING;
        }
        if (!idAcceptable(spec, reportedId)) {
            return Reason.MODEL_ID_MISMATCH;
        }
        return Reason.MODEL_VERSION_MISMATCH;
    }

    private static boolean idAcceptable(ApprovedModelSpec spec, String reportedId) {
        return !isAbsent(reportedId)
                && (reportedId.equals(spec.requestedModelId())
                        || spec.allowedReportedModelIdAliases().contains(reportedId));
    }

    private static boolean isAbsent(String s) {
        return s == null || s.isBlank();
    }

    private Outcome<Decision> denyDecision(Permit permit, Reason reason) {
        return Outcome.ok(Decision.deny(permit.approvalRef(), permit.capability(), reason));
    }

    /**
     * {@code ApprovedModelRegistry.resolve} Fail kodu → tipli {@link Reason}. {@code DENIED} =
     * status≠APPROVED (çalışma-anı; capability-uyuşmazlığı boot-gate ile elenmiş) → APPROVAL_NOT_ACTIVE.
     * INVALID/beklenmeyen → fail-closed REGISTRY_UNAVAILABLE.
     */
    private static Reason mapResolveFail(Outcome.Fail<ApprovedModelSpec> fail) {
        return switch (fail.code()) {
            case NOT_CONFIGURED -> Reason.REGISTRY_UNAVAILABLE;
            case NOT_FOUND -> Reason.APPROVAL_NOT_FOUND;
            case DENIED -> Reason.APPROVAL_NOT_ACTIVE;
            default -> Reason.REGISTRY_UNAVAILABLE;
        };
    }
}
