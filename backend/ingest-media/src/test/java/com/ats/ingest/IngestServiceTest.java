package com.ats.ingest;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.consent.ConsentGate;
import com.ats.consent.InMemoryConsentStore;
import com.ats.consent.RecordingPermission;
import com.ats.consent.RecordingPermission.PermissionState;
import com.ats.ingest.IngestService.IngestReceipt;
import com.ats.ingest.ObjectStorePort.StoredObjectRef;
import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import com.ats.ops.InMemoryEventSink;
import com.ats.ops.OperationalEvent;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class IngestServiceTest {

    private static final TenantId T1 = new TenantId("t1");
    private static final ActorId A1 = new ActorId("actor-opaque-1");
    private static final InterviewId I1 = new InterviewId("i1");
    // Yalnız SENTETİK fixture (ATS-0016: gerçek aday verisi build'de YASAK — release-gate)
    private static final byte[] SYNTHETIC_WAV = "SENTETIK-TEST-SES-ICERIGI".getBytes(StandardCharsets.UTF_8);

    private InMemoryConsentStore consentStore;
    private InMemoryEventSink sink;
    private InMemoryObjectStore objectStore;
    private FakeEvidenceLedger ledger;
    private IngestService service;

    @BeforeEach
    void setUp() {
        consentStore = new InMemoryConsentStore();
        sink = new InMemoryEventSink();
        objectStore = new InMemoryObjectStore();
        ledger = new FakeEvidenceLedger();
        service = new IngestService(
                new ConsentGate(consentStore, sink),
                new LocalPatternScanAdapter(), objectStore, ledger, sink);
    }

    private void grantConsent() {
        consentStore.put(new RecordingPermission(T1, I1, "subj-opaque", PermissionState.GRANTED, "2026-07-02T00:00:00Z"));
    }

    private UploadRequest request() {
        return UploadRequest.create(T1, A1, I1, "kayit.wav", "audio/wav", "2026-07-02T10:00:00Z")
                .asOptional().orElseThrow();
    }

    @Test
    void no_consent_blocks_ingest_and_stores_nothing() {
        Outcome<IngestReceipt> out = service.uploadRecording(request(), SYNTHETIC_WAV);
        assertFalse(out.isOk());
        assertEquals(OutcomeCode.DENIED, ((Outcome.Fail<IngestReceipt>) out).code());
        assertEquals(0, objectStore.size());
        assertTrue(ledger.entries().isEmpty());
        assertTrue(sink.emitted().stream().anyMatch(e -> e.eventTypeId().equals(ConsentGate.BLOCKED_EVENT)));
    }

    @Test
    void malware_signature_rejected_with_event() {
        grantConsent();
        byte[] eicarLike = "X5O!P%@AP-teszt".getBytes(StandardCharsets.US_ASCII);
        Outcome<IngestReceipt> out = service.uploadRecording(request(), eicarLike);
        assertFalse(out.isOk());
        assertEquals(0, objectStore.size());
        assertTrue(ledger.entries().isEmpty());
        OperationalEvent rejected = sink.emitted().stream()
                .filter(e -> e.eventTypeId().equals(IngestService.SCAN_REJECTED_EVENT))
                .findFirst().orElseThrow();
        assertEquals("malware_signature", rejected.extras().get("reason_code"));
    }

    @Test
    void ledger_failure_is_fail_closed_and_rolls_back_stored_object() {
        grantConsent();
        IngestService failingService = new IngestService(
                new ConsentGate(consentStore, sink),
                new LocalPatternScanAdapter(), objectStore,
                new FailingLedger(), sink);
        Outcome<IngestReceipt> out = failingService.uploadRecording(request(), SYNTHETIC_WAV);
        assertFalse(out.isOk());
        assertEquals(OutcomeCode.NOT_CONFIGURED, ((Outcome.Fail<IngestReceipt>) out).code());
        assertEquals(0, objectStore.size(), "fail-closed telafi: kanıtsız medya kalmamalı");
        assertTrue(sink.emitted().stream().anyMatch(e -> e.eventTypeId().equals(IngestService.APPEND_FAILED_EVENT)));
    }

    @Test
    void happy_path_stores_appends_and_emits_ledger_ref() {
        grantConsent();
        Outcome<IngestReceipt> out = service.uploadRecording(request(), SYNTHETIC_WAV);
        assertTrue(out.isOk());
        IngestReceipt receipt = out.asOptional().orElseThrow();
        assertTrue(objectStore.contains(T1, receipt.objectKey()));
        assertTrue(receipt.objectKey().startsWith("i1/rec-"), "anahtar content-addressed opak olmalı");
        assertFalse(receipt.objectKey().contains("kayit.wav"), "filename anahtara/ledger'a giremez (PII düzlemi)");
        assertEquals(1, ledger.entries().size());
        assertEquals(IngestService.LEDGER_EVENT_TYPE, ledger.entries().get(0).eventType());
        OperationalEvent ok = sink.emitted().stream()
                .filter(e -> e.eventTypeId().equals(IngestService.APPEND_SUCCEEDED_EVENT))
                .findFirst().orElseThrow();
        assertEquals(receipt.evidenceId(), ok.extras().get("ledger_entry_ref"));
        assertTrue(receipt.evidenceId().startsWith("fake-"), "slice-1: gerçek ledger-ref iddia edilmez");
    }

    @Test
    void same_filename_different_content_does_not_overwrite() {
        grantConsent();
        byte[] other = "SENTETIK-FARKLI-ICERIK".getBytes(StandardCharsets.UTF_8);
        IngestReceipt r1 = service.uploadRecording(request(), SYNTHETIC_WAV).asOptional().orElseThrow();
        IngestReceipt r2 = service.uploadRecording(request(), other).asOptional().orElseThrow();
        assertFalse(r1.objectKey().equals(r2.objectKey()), "farklı içerik farklı anahtara düşmeli");
        assertEquals(2, objectStore.size(), "overwrite yok — iki obje ayrı durur");
        assertEquals(2, ledger.entries().size());
    }

    @Test
    void rollback_failure_is_not_swallowed() {
        grantConsent();
        ObjectStorePort deleteFailingStore = new ObjectStorePort() {
            @Override
            public Outcome<StoredObjectRef> put(TenantId t, String key, byte[] bytes, String contentType) {
                return objectStore.put(t, key, bytes, contentType);
            }

            @Override
            public Outcome<ObjectStorePort.StoredObject> read(TenantId t, String key) {
                return objectStore.read(t, key);
            }

            @Override
            public Outcome<Void> delete(TenantId t, String key) {
                return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "delete unavailable (test)");
            }
        };
        IngestService svc = new IngestService(
                new ConsentGate(consentStore, sink),
                new LocalPatternScanAdapter(), deleteFailingStore, new FailingLedger(), sink);
        Outcome<IngestReceipt> out = svc.uploadRecording(request(), SYNTHETIC_WAV);
        assertFalse(out.isOk());
        assertTrue(((Outcome.Fail<IngestReceipt>) out).reason().contains("telafi silmesi başarısız"),
                "rollback fail'i yutulmamalı");
        OperationalEvent failed = sink.emitted().stream()
                .filter(e -> e.eventTypeId().equals(IngestService.APPEND_FAILED_EVENT))
                .findFirst().orElseThrow();
        assertEquals("ledger_unavailable_rollback_failed", failed.extras().get("reason_code"));
    }

    @Test
    void filename_traversal_and_content_type_allowlist_enforced() {
        assertFalse(UploadRequest.create(T1, A1, I1, "../etc/passwd", "audio/wav", "2026-07-02T10:00:00Z").isOk());
        assertFalse(UploadRequest.create(T1, A1, I1, "a/../b.wav", "audio/wav", "2026-07-02T10:00:00Z").isOk());
        assertFalse(UploadRequest.create(T1, A1, I1, ".gizli", "audio/wav", "2026-07-02T10:00:00Z").isOk());
        assertFalse(UploadRequest.create(T1, A1, I1, "kayit.exe", "application/x-msdownload", "2026-07-02T10:00:00Z").isOk(),
                "contentType kapalı allowlist dışı reddedilmeli");
        assertTrue(UploadRequest.create(T1, A1, I1, "kayit.mp4", "video/mp4", "2026-07-02T10:00:00Z").isOk());
    }
}
