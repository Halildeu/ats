package com.ats.app.web;

import com.ats.app.AppProperties;
import com.ats.consent.ConsentService;
import com.ats.consent.RecordingPermission;
import com.ats.ingest.IngestService;
import com.ats.ingest.UploadRequest;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.orchestration.Transcript;
import com.ats.orchestration.TranscriptStore;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

/**
 * P1 ilk veri-endpoint'leri (F1 hattı + transkript okuma). Sözleşme:
 *  - tenant/actor DAİMA token'dan (TenantAccess); path'te tenant YOK.
 *  - consent yazımı: subjectRef OPAK referans (ham PII değil — çağıran sözleşmesi).
 *  - recording upload: raw bytes + Content-Type (kapalı allowlist domain'de) +
 *    X-ATS-Filename (yalnız istek-doğrulama düzlemi; anahtara/ledger'a girmez);
 *    Content-Length ZORUNLU + üst sınır (DoS guard; sınırsız okuma yok).
 *  - transcript okuma tenant-scoped: yabancı tenant'ın anahtarı 404.
 *  - occurred_at sunucu saatidir (istemci beyanı immutable düzleme sokulmaz).
 */
@RestController
class InterviewApiController {

    private final ConsentService consentService;
    private final IngestService ingestService;
    private final TranscriptStore transcriptStore;
    private final long maxUploadBytes;

    InterviewApiController(ConsentService consentService, IngestService ingestService,
            TranscriptStore transcriptStore, AppProperties props) {
        this.consentService = consentService;
        this.ingestService = ingestService;
        this.transcriptStore = transcriptStore;
        this.maxUploadBytes = props.ingest().maxUploadBytes();
    }

    record ConsentBody(String subjectRef, String state) {}

    @PutMapping("/api/v1/interviews/{interviewId}/recording-consent")
    ResponseEntity<?> putRecordingConsent(Authentication auth,
            @PathVariable("interviewId") String interviewId, @RequestBody ConsentBody body,
            @RequestHeader(value = "X-ATS-Idempotency-Key", required = false) String idempotencyKey) {
        TenantId tenant = TenantAccess.tenant(auth);
        if (body == null || body.subjectRef() == null || body.subjectRef().isBlank()
                || body.state() == null) {
            return badRequest("subjectRef + state zorunlu");
        }
        RecordingPermission.PermissionState state;
        try {
            state = RecordingPermission.PermissionState.valueOf(body.state());
        } catch (IllegalArgumentException e) {
            return badRequest("state GRANTED|DENIED|WITHDRAWN olmalı");
        }
        RecordingPermission permission = new RecordingPermission(
                tenant, new InterviewId(interviewId), body.subjectRef(), state,
                Instant.now().toString());
        // state + WORM kanıtı birlikte (ConsentService; GRANTED=ledger-önce fail-closed).
        // requestKey: retry-güvenliği isteyen çağıran header verir; yoksa her çağrı yeni beyan
        // (GRANTED→WITHDRAWN→GRANTED yeni kanıt üretir — Codex iter-2 blocker-1).
        // WORM idempotency_key kolonuna girer: safe-token + uzunluk sınırı (Codex iter-3 önerisi)
        if (idempotencyKey != null && !idempotencyKey.isBlank()
                && !idempotencyKey.matches("[A-Za-z0-9._:-]{1,128}")) {
            return badRequest("X-ATS-Idempotency-Key [A-Za-z0-9._:-]{1,128} olmalı");
        }
        String requestKey = (idempotencyKey == null || idempotencyKey.isBlank())
                ? java.util.UUID.randomUUID().toString()
                : idempotencyKey;
        Outcome<Void> out = consentService.record(permission, TenantAccess.actor(auth), requestKey);
        if (out instanceof Outcome.Fail<Void> fail) {
            return OutcomeHttp.fail(fail);
        }
        return ResponseEntity.noContent().build();
    }

    @PostMapping(value = "/api/v1/interviews/{interviewId}/recordings",
            consumes = {"audio/wav", "audio/mpeg", "audio/mp4", "audio/webm", "video/mp4", "video/webm"})
    ResponseEntity<?> uploadRecording(Authentication auth, HttpServletRequest request,
            @PathVariable("interviewId") String interviewId,
            @RequestHeader(value = "X-ATS-Filename", required = false) String filename)
            throws java.io.IOException {
        TenantId tenant = TenantAccess.tenant(auth);

        long declared = request.getContentLengthLong();
        if (declared < 0) {
            return ResponseEntity.status(HttpStatus.LENGTH_REQUIRED)
                    .body(Map.of("error", "INVALID", "reason", "Content-Length zorunlu (fail-closed)"));
        }
        if (declared == 0 || declared > maxUploadBytes) {
            return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
                    .body(Map.of("error", "INVALID",
                            "reason", "payload 1.." + maxUploadBytes + " bayt aralığında olmalı"));
        }

        Outcome<UploadRequest> req = UploadRequest.create(
                tenant, TenantAccess.actor(auth), new InterviewId(interviewId),
                filename, request.getContentType(), Instant.now().toString());
        if (req instanceof Outcome.Fail<UploadRequest> fail) {
            return OutcomeHttp.fail(fail);
        }

        byte[] payload = request.getInputStream().readNBytes((int) declared + 1);
        if (payload.length != declared) {
            return badRequest("gövde uzunluğu Content-Length ile eşleşmiyor");
        }

        Outcome<IngestService.IngestReceipt> out = ingestService.uploadRecording(
                ((Outcome.Ok<UploadRequest>) req).value(), payload);
        if (out instanceof Outcome.Fail<IngestService.IngestReceipt> fail) {
            return OutcomeHttp.fail(fail);
        }
        IngestService.IngestReceipt receipt = ((Outcome.Ok<IngestService.IngestReceipt>) out).value();
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of(
                "objectKey", receipt.objectKey(),
                "evidenceId", receipt.evidenceId(),
                "ledgerSequence", receipt.ledgerSequence()));
    }

    record SegmentDto(int index, String speakerLabel, long startMs, long endMs, String text) {}
    record TranscriptDto(String interviewId, String language, List<SegmentDto> segments) {}

    /** transcriptKey '/' içerir (content-addressed) — path-segment değil query-param (encoded-slash reddi). */
    @GetMapping("/api/v1/interviews/{interviewId}/transcript")
    ResponseEntity<?> getTranscript(Authentication auth,
            @PathVariable("interviewId") String interviewId,
            @org.springframework.web.bind.annotation.RequestParam("key") String transcriptKey) {
        TenantId tenant = TenantAccess.tenant(auth);
        Outcome<Transcript> out = transcriptStore.find(
                tenant, new InterviewId(interviewId), transcriptKey);
        if (out instanceof Outcome.Fail<Transcript> fail) {
            return OutcomeHttp.fail(fail);
        }
        Transcript t = ((Outcome.Ok<Transcript>) out).value();
        return ResponseEntity.ok(new TranscriptDto(
                t.interviewId().value(), t.language(),
                t.segments().stream()
                        .map(s -> new SegmentDto(s.index(), s.speakerLabel(), s.startMs(), s.endMs(), s.text()))
                        .toList()));
    }

    private static ResponseEntity<Map<String, String>> badRequest(String reason) {
        return ResponseEntity.badRequest().body(Map.of("error", "INVALID", "reason", reason));
    }
}
