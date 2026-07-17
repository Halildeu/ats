package com.ats.contracts.governance;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * gov1-1e-c GOLDEN-PIN: {@code status} alanının {@link ApprovedModelSpec}'ten kaldırılması shipped
 * kimliklerin içerik-adresli {@code mapr_} ref'lerini DEĞİŞTİRMEMELİDİR (status zaten ref-digest
 * girdisi değildi — cutover ref-stabilitesi bir invariant'tır, iddia değil).
 *
 * <p>Pinlenen 3 kimlik ATS-0020 boot-gate KAPALI-mapping'inin deployment-authoritative
 * identity'leridir (app-boot {@code approved-models.json} + boot-profil sabitleri). Değerler gov0
 * kodundan (status'lü ApprovedModelSpec.of) TÜRETİLİP donduruldu; herhangi biri değişirse bu test
 * kırmızı olur → operatör {@code ats.ai.approvals.*} ref'leri + WORM seed'i drift eder demektir.
 */
class ShippedApprovalRefGoldenTest {

    private static final String GOLDEN_HTTP_TRANSCRIBE =
            "mapr_0db783774bf0616f9fb7ca0483008aee94529d41a464b7f3e63083a5652ef57c";
    private static final String GOLDEN_HTTP_CITE =
            "mapr_4dc0a8f55f2c7d49d737a4393d041e12e904470ecded9056bd6062ac72255f85";
    private static final String GOLDEN_LIVE_TRANSCRIBE_LEGACY =
            "mapr_549a8e22a2c6f3c445be3e2405262bba5b80a78d72047fd95fa03deaa66a732d";
    private static final String GOLDEN_LIVE_TRANSCRIBE_ARTIFACT =
            "mapr_04cabd439b5b51992e86e215b9796f64d27b91dd951acdf542ab6635d517fc43";

    @Test
    void http_json_transcribe_ref_is_pinned() {
        ApprovedModelSpec s = ApprovedModelSpec.of(Capability.TRANSCRIBE, "http-json-generic",
                "http-json-stt", "v1", Set.of(), Set.of(), "http-json-generic-endpoint",
                "ip-http-json-1", ModelScope.GLOBAL);
        assertEquals(GOLDEN_HTTP_TRANSCRIBE, s.approvalRef().value(),
                "status kaldırmak http-json TRANSCRIBE ref'ini değiştirmemeli (golden-pin)");
    }

    @Test
    void http_json_cite_ref_is_pinned() {
        ApprovedModelSpec s = ApprovedModelSpec.of(Capability.CITE, "http-json-generic",
                "http-json-cite", "v1", Set.of(), Set.of(), "http-json-generic-endpoint",
                "ip-http-json-1", ModelScope.GLOBAL);
        assertEquals(GOLDEN_HTTP_CITE, s.approvalRef().value(),
                "status kaldırmak http-json CITE ref'ini değiştirmemeli (golden-pin)");
    }

    @Test
    void legacy_live_stt_transcribe_ref_remains_in_cumulative_catalog() {
        ApprovedModelSpec s = ApprovedModelSpec.of(Capability.TRANSCRIBE, "faz24-live-stt",
                "whisper-tr", "v0.1.0", Set.of("whisper-large-v3-tr"), Set.of(), "faz24-stt-prod",
                "ip-live-stt-1", ModelScope.GLOBAL);
        assertEquals(GOLDEN_LIVE_TRANSCRIBE_LEGACY, s.approvalRef().value(),
                "eski WORM subject catalog'dan silinmemeli (append-only catalog)");
    }

    @Test
    void content_addressed_live_stt_transcribe_ref_is_pinned() {
        ApprovedModelSpec s = ApprovedModelSpec.of(Capability.TRANSCRIBE, "faz24-live-stt",
                "Systran/faster-whisper-medium",
                "hf:08e178d48790749d25932bbc082711ddcfdfbc4f"
                        + "@sha256:9b45e1009dcc4ab601eff815b61d80e60ce3fd8c74c1a14f4a282258286b51ae",
                Set.of(), Set.of(), "faz24-stt-prod",
                "ip-live-stt-1", ModelScope.GLOBAL);
        assertEquals(GOLDEN_LIVE_TRANSCRIBE_ARTIFACT, s.approvalRef().value(),
                "content-addressed live-stt TRANSCRIBE ref'i drift etmemeli (golden-pin)");
    }
}
