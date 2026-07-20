package com.ats.screening;

import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.EvidenceId;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Objects;

/**
 * 156-b kalıcılık portu: bir tarama sonucunu kısıtlı/silinebilir bulgu düzlemi ile pointer-only
 * değişmez receipt düzlemine TEK atomik işlem olarak yazar.
 *
 * <p>Port WORM/JDBC/persistence ayrıntısı bilmez. Kalıcı adapter'ın değişmezleri:
 * <ul>
 *   <li>kısmi başarı YOK: receipt ve kısıtlı aggregate birlikte commit/rollback olur,</li>
 *   <li>tenant-scope her çağrıda zorunlu,</li>
 *   <li>ham/normalize/eşleşmiş metin veya içerik/bulgu hash'i hiçbir DTO'da yok,</li>
 *   <li>kategori/sinyal/span yalnız kısıtlı, hard-purge edilebilir düzlemde kalır.</li>
 * </ul>
 */
public interface ScreeningEvidenceStore {

    String SCHEMA_VERSION = "screening_evidence_v1";

    /** Tek kernel çalıştırmasının kalıcılaştırma komutu. Disposition daima {@link #disposition()} ile türetilir. */
    record SaveCommand(
            TenantId tenantId,
            ActorId actorId,
            InterviewId interviewId,
            ScreeningResult result,
            ScreeningSourceKind sourceKind,
            String occurredAt) {

        public SaveCommand {
            requireId(tenantId == null ? null : tenantId.value(), "tenantId");
            requireId(actorId == null ? null : actorId.value(), "actorId");
            requireId(interviewId == null ? null : interviewId.value(), "interviewId");
            Objects.requireNonNull(result, "result");
            Objects.requireNonNull(sourceKind, "sourceKind");
            requireInstant(occurredAt, "occurredAt");
            if (result.coverage() != Coverage.SUPPORTED && !result.findings().isEmpty()) {
                throw new IllegalArgumentException("SUPPORTED dışı coverage bulgu taşıyamaz (fail-closed)");
            }
            if (result.findings().stream().anyMatch(f -> f.sourceKind() != sourceKind)) {
                throw new IllegalArgumentException("bulgu sourceKind komut sourceKind ile birebir olmalı");
            }
        }

        public ScreeningDisposition disposition() {
            return ScreeningDisposition.from(result);
        }
    }

    /** Atomik save receipt'i; evidenceId pointer-only WORM satırının opak kimliğidir. */
    record SaveReceipt(
            FindingSetRef findingSetRef,
            ScreeningRunId runId,
            ScreeningDisposition disposition,
            EvidenceId evidenceId) {
        public SaveReceipt {
            Objects.requireNonNull(findingSetRef, "findingSetRef");
            Objects.requireNonNull(runId, "runId");
            Objects.requireNonNull(disposition, "disposition");
            requireId(evidenceId == null ? null : evidenceId.value(), "evidenceId");
        }
    }

    /** Kısıtlı/silinebilir düzlemden okunan aggregate; kaynak veya eşleşmiş metin taşımaz. */
    record StoredEvidence(
            TenantId tenantId,
            InterviewId interviewId,
            ScreeningRunId runId,
            FindingSetRef findingSetRef,
            ScreeningPolicyRef policyRef,
            Coverage coverage,
            ScreeningDisposition disposition,
            ScreeningSourceKind sourceKind,
            List<ScreeningFinding> findings,
            EvidenceId evidenceId,
            String schemaVersion,
            String occurredAt) {
        public StoredEvidence {
            requireId(tenantId == null ? null : tenantId.value(), "tenantId");
            requireId(interviewId == null ? null : interviewId.value(), "interviewId");
            Objects.requireNonNull(runId, "runId");
            Objects.requireNonNull(findingSetRef, "findingSetRef");
            Objects.requireNonNull(policyRef, "policyRef");
            Objects.requireNonNull(coverage, "coverage");
            Objects.requireNonNull(disposition, "disposition");
            Objects.requireNonNull(sourceKind, "sourceKind");
            findings = List.copyOf(findings);
            requireId(evidenceId == null ? null : evidenceId.value(), "evidenceId");
            if (!SCHEMA_VERSION.equals(schemaVersion)) {
                throw new IllegalArgumentException("desteklenmeyen screening evidence schema: " + schemaVersion);
            }
            requireInstant(occurredAt, "occurredAt");
            ScreeningResult reconstructed = new ScreeningResult(
                    runId, policyRef, coverage, findings, findingSetRef);
            if (ScreeningDisposition.from(reconstructed) != disposition) {
                throw new IllegalArgumentException("coverage/findings/disposition tutarsız");
            }
            if (findings.stream().anyMatch(f -> f.sourceKind() != sourceKind)) {
                throw new IllegalArgumentException("stored finding sourceKind tutarsız");
            }
        }
    }

    /** Kısıtlı veriyi silip mevcut receipt'e append-only tombstone bağlayan kapalı purge nedeni. */
    enum PurgeReason {
        RETENTION_EXPIRED,
        DATA_SUBJECT_ERASURE,
        ADMIN_CORRECTION
    }

    record PurgeCommand(
            TenantId tenantId,
            ActorId actorId,
            InterviewId interviewId,
            FindingSetRef findingSetRef,
            PurgeReason reason,
            String occurredAt) {
        public PurgeCommand {
            requireId(tenantId == null ? null : tenantId.value(), "tenantId");
            requireId(actorId == null ? null : actorId.value(), "actorId");
            requireId(interviewId == null ? null : interviewId.value(), "interviewId");
            Objects.requireNonNull(findingSetRef, "findingSetRef");
            Objects.requireNonNull(reason, "reason");
            requireInstant(occurredAt, "occurredAt");
        }
    }

    /** Purge replay'i aynı tombstone evidenceId'sini döndürür; orijinal receipt değişmez. */
    record PurgeReceipt(FindingSetRef findingSetRef, EvidenceId tombstoneEvidenceId) {
        public PurgeReceipt {
            Objects.requireNonNull(findingSetRef, "findingSetRef");
            requireId(tombstoneEvidenceId == null ? null : tombstoneEvidenceId.value(), "tombstoneEvidenceId");
        }
    }

    Outcome<SaveReceipt> save(SaveCommand command);

    Outcome<StoredEvidence> get(TenantId tenantId, FindingSetRef findingSetRef);

    Outcome<PurgeReceipt> purge(PurgeCommand command);

    private static void requireId(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " zorunlu");
        }
    }

    private static void requireInstant(String value, String field) {
        requireId(value, field);
        try {
            OffsetDateTime.parse(value);
        } catch (DateTimeParseException ex) {
            throw new IllegalArgumentException(field + " ISO-8601 offset timestamp olmalı", ex);
        }
    }
}
