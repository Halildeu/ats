package com.ats.dsr;

import com.ats.contracts.EvidenceLedger;
import com.ats.contracts.EvidenceLedger.LedgerEntry;
import com.ats.export.ExportArtifactStore;
import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.EvidenceId;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import com.ats.ops.OperationalEvent;
import com.ats.ops.OperationalEventSink;
import com.ats.ops.PiiClass;
import com.ats.orchestration.CitationStore;
import com.ats.orchestration.TranscriptStore;
import com.ats.review.HumanReviewService;
import com.ats.review.ReviewCase;
import com.ats.review.ReviewCaseStore;
import java.util.Map;

/**
 * PRD-P1 F10 DSR/erasure orkestrasyonu (ATS-0016 slice-6, port-only) — ATS-0003 runtime karşılığı:
 * - **Content-plane silinir** (transcript/citation/export-artifact — silinebilir düzlem);
 *   **WORM SİLİNMEZ** — hedef evidence-id'lere append-only TOMBSTONE yazılır (unlinkable-tombstone
 *   ilkesinin ledger tarafı; HMAC-salt-destruction crypto düzlemi ATS-0007 key-mgmt slice'ı).
 * - Vaka non-terminal ise WITHDRAWN'a taşınır; EXPORTED/WITHDRAWN terminal DEĞİŞMEZ (state-machine
 *   çıkışsız) — ama altındaki content yine silinir; bu dürüstçe raporlanır.
 * - Sıra fail-closed: tombstone'lar ÖNCE (denetim izi garanti), sonra content silme, sonra vaka
 *   geçişi, en son DSAR=FULFILLED. Herhangi bir adım hatası YUTULMAZ (partial-erasure açıkça döner;
 *   idempotent yeniden-koşu güvenli: silinmiş content'in delete'i no-op, FULFILLED dsar tekrar koşmaz).
 * - Retention-TIMER bilinçli KAPSAM DIŞI: süre hesabı persist timestamp ister (persistence-unlock
 *   slice'ı); bu sınıf timer "yapıldı" iddia etmez.
 */
public final class DsrService {

    static final String DSAR_RECEIVED_EVENT = "privacy.dsar.received";
    static final String DSAR_FULFILLED_EVENT = "privacy.dsar.fulfilled";
    static final String ERASURE_EXECUTED_EVENT = "privacy.erasure.executed";
    static final String TOMBSTONE_APPENDED_EVENT = "evidence.tombstone.appended";

    public record ErasureReceipt(String dsarKey, int tombstoneCount, int deletedContentCount, boolean caseTransitioned) {}

    private final DsarStore dsarStore;
    private final TranscriptStore transcriptStore;
    private final CitationStore citationStore;
    private final ExportArtifactStore artifactStore;
    private final ReviewCaseStore reviewStore;
    private final HumanReviewService humanReview;
    private final EvidenceLedger ledger;
    private final OperationalEventSink sink;

    public DsrService(DsarStore dsarStore, TranscriptStore transcriptStore, CitationStore citationStore,
            ExportArtifactStore artifactStore, ReviewCaseStore reviewStore, HumanReviewService humanReview,
            EvidenceLedger ledger, OperationalEventSink sink) {
        this.dsarStore = dsarStore;
        this.transcriptStore = transcriptStore;
        this.citationStore = citationStore;
        this.artifactStore = artifactStore;
        this.reviewStore = reviewStore;
        this.humanReview = humanReview;
        this.ledger = ledger;
        this.sink = sink;
    }

    /** DSAR kabul kaydı — talep gövdesi/kimlik içeriği TUTULMAZ (opak subject-ref + reason kodu). */
    public Outcome<String> receiveDsar(TenantId tenantId, InterviewId interviewId, String subjectRef, String reasonCode) {
        if (isBlank(subjectRef) || isBlank(reasonCode)) {
            return Outcome.fail(OutcomeCode.INVALID, "subject_ref + reason_code zorunlu (opak pointer)");
        }
        Outcome<String> stored = dsarStore.put(new DsarRequest(
                tenantId, interviewId, subjectRef, reasonCode, DsarRequest.State.RECEIVED));
        if (stored instanceof Outcome.Ok<String>) {
            emit(tenantId, DSAR_RECEIVED_EVENT, "privacy", "notice", PiiClass.ID_ONLY,
                    Map.of("reason_code", reasonCode));
        }
        return stored;
    }

    public Outcome<ErasureReceipt> executeErasure(TenantId tenantId, ActorId actorId, InterviewId interviewId,
            String dsarKey, ErasureScope scope) {
        if (scope == null || scope.empty()) {
            return Outcome.fail(OutcomeCode.INVALID, "erasure scope boş (silinecek content/tombstone hedefi yok)");
        }
        Outcome<DsarRequest> found = dsarStore.find(tenantId, interviewId, dsarKey);
        if (!(found instanceof Outcome.Ok<DsarRequest> dsarOk)) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "dsar yok (tenant-scope)");
        }
        DsarRequest dsar = dsarOk.value();
        if (dsar.state() == DsarRequest.State.FULFILLED) {
            return Outcome.fail(OutcomeCode.INVALID, "dsar zaten FULFILLED (çift-yürütme yok; yeni talep = yeni dsar)");
        }

        // 1) TOMBSTONE'lar önce — WORM denetim izi garanti altına alınmadan content silinmez
        int tombstones = 0;
        for (String evidenceId : scope.tombstoneTargetEvidenceIds()) {
            Outcome<LedgerEntry> appended = ledger.appendTombstoneEvent(
                    tenantId, actorId, interviewId, new EvidenceId(evidenceId), dsar.reasonCode());
            if (!(appended instanceof Outcome.Ok<LedgerEntry>)) {
                return Outcome.fail(OutcomeCode.NOT_CONFIGURED,
                        "tombstone append başarısız — content SİLİNMEDİ (fail-closed; denetim izi önce): " + evidenceId);
            }
            tombstones++;
            emit(tenantId, TOMBSTONE_APPENDED_EVENT, "evidence", "notice", PiiClass.ID_ONLY,
                    Map.of("actor_ref", actorId.value(), "reason_code", dsar.reasonCode()));
        }

        // 2) Content-plane silme (silinebilir düzlem; idempotent — yok olanın delete'i no-op)
        int deleted = 0;
        for (String key : scope.transcriptKeys()) {
            Outcome<Void> del = transcriptStore.delete(tenantId, key);
            if (!del.isOk()) {
                return Outcome.fail(OutcomeCode.INVALID, "transcript silme başarısız (partial-erasure; yutulmadı): " + key);
            }
            deleted++;
        }
        for (String key : scope.citationKeys()) {
            Outcome<Void> del = citationStore.delete(tenantId, key);
            if (!del.isOk()) {
                return Outcome.fail(OutcomeCode.INVALID, "citation silme başarısız (partial-erasure; yutulmadı): " + key);
            }
            deleted++;
        }
        for (String key : scope.exportArtifactKeys()) {
            Outcome<Void> del = artifactStore.delete(tenantId, key);
            if (!del.isOk()) {
                return Outcome.fail(OutcomeCode.INVALID, "export-artifact silme başarısız (partial-erasure; yutulmadı): " + key);
            }
            deleted++;
        }

        // 3) Vaka geçişi: non-terminal → WITHDRAWN; terminal (EXPORTED/WITHDRAWN) state DEĞİŞMEZ
        //    (state-machine çıkışsız) ama content'i yukarıda silindi — dürüst rapor.
        boolean transitioned = false;
        for (String caseKey : scope.reviewCaseKeys()) {
            Outcome<ReviewCase> caseFound = reviewStore.find(tenantId, interviewId, caseKey);
            if (!(caseFound instanceof Outcome.Ok<ReviewCase> caseOk)) {
                return Outcome.fail(OutcomeCode.NOT_FOUND, "vaka yok (tenant-scope): " + caseKey);
            }
            if (!caseOk.value().state().terminal()) {
                Outcome<Void> withdrawn = humanReview.withdraw(tenantId, interviewId, caseKey, dsar.reasonCode());
                if (!withdrawn.isOk()) {
                    return Outcome.fail(OutcomeCode.INVALID, "vaka WITHDRAWN geçişi başarısız (yutulmadı): " + caseKey);
                }
                transitioned = true;
            }
        }

        // 4) DSAR kapanışı
        Outcome<Void> saved = dsarStore.save(tenantId, dsarKey, dsar.fulfilled());
        if (!saved.isOk()) {
            return Outcome.fail(OutcomeCode.INVALID,
                    "dsar FULFILLED yazılamadı (erasure YÜRÜTÜLDÜ — operasyonel müdahale ile kapatın; yutulmadı)");
        }
        emit(tenantId, ERASURE_EXECUTED_EVENT, "privacy", "notice", PiiClass.ID_ONLY,
                Map.of("actor_ref", actorId.value(), "reason_code", dsar.reasonCode()));
        emit(tenantId, DSAR_FULFILLED_EVENT, "privacy", "notice", PiiClass.ID_ONLY,
                Map.of("actor_ref", actorId.value()));
        return Outcome.ok(new ErasureReceipt(dsarKey, tombstones, deleted, transitioned));
    }

    private void emit(TenantId tenantId, String eventTypeId, String category, String severity,
            PiiClass pii, Map<String, String> extras) {
        OperationalEvent.create(tenantId, eventTypeId, category, severity, pii, extras)
                .asOptional()
                .ifPresent(sink::emit);
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
