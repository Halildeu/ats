package com.ats.app.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.application.ResumeImportService.ProposalState;
import com.ats.application.ResumeImportService.Provenance;
import com.ats.application.ResumeImportService.ResumeField;
import com.ats.application.ResumeImportService.ResumeProposal;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import org.junit.jupiter.api.Test;

/**
 * #213 (213-G, sahip kararı 2026-09-25): öneri sözleşmesinde isteğe bağlı ve kapalı kümeli
 * {@code provenance.source}. Alan yalnız bir çıkarım kuralı öneriyi ürettiğinde yazılır; yoksa
 * yanıt bugünkü şekliyle aynı kalır (geriye uyum).
 */
class ResumeImportProvenanceContractTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    private static JsonNode provenanceJson(Provenance provenance) throws Exception {
        ResumeProposal proposal = new ResumeProposal(ResumeField.CITY, "Ankara", null,
                ProposalState.CONTROL_REQUIRED, 0, provenance, List.of());
        return JSON.readTree(JSON.writeValueAsString(
                ResumeImportApiController.proposalDto(proposal))).path("provenance");
    }

    @Test
    void an_address_derived_proposal_carries_its_closed_source() throws Exception {
        JsonNode provenance = provenanceJson(new Provenance(1, 40, 706, 60, 12, 0.50,
                "pdfbox-test", Provenance.Source.ADDRESS_LAST_LINE));

        assertEquals("ADDRESS_LAST_LINE", provenance.path("source").asText(),
                "adresten gelen oneri kaynagini tasimali: " + provenance);
    }

    @Test
    void a_proposal_without_a_source_keeps_todays_shape() throws Exception {
        JsonNode provenance = provenanceJson(
                new Provenance(1, 40, 706, 60, 12, 0.97, "pdfbox-test"));

        Set<String> keys = new TreeSet<>();
        provenance.fieldNames().forEachRemaining(keys::add);
        assertEquals(new TreeSet<>(Set.of("page", "x", "y", "width", "height", "confidence",
                        "parserVersion")), keys,
                "kaynak yoksa alan hic yazilmamali (null da degil): " + provenance);
    }

    @Test
    void the_pinned_contract_declares_source_as_an_optional_closed_set() throws Exception {
        JsonNode schema = JSON.readTree(getClass().getResourceAsStream("/openapi-snapshot.json"))
                .path("components").path("schemas").path("ResumeImportProvenanceResponse");

        JsonNode source = schema.path("properties").path("source");
        assertEquals("string", source.path("type").asText(), schema.toString());
        assertEquals(List.of("ADDRESS_LAST_LINE"),
                JSON.convertValue(source.path("enum"), List.class),
                "kapali kume: yalniz bilinen kural adlari; " + schema);
        for (JsonNode required : schema.path("required")) {
            assertFalse("source".equals(required.asText()), "source istege bagli olmali: " + schema);
        }
        assertTrue(schema.path("additionalProperties").isBoolean()
                && !schema.path("additionalProperties").asBoolean(), schema.toString());
    }
}
