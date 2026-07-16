package com.ats.app.web;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.ats.app.AppProperties;
import com.ats.consent.ConsentService;
import com.ats.ingest.IngestService;
import com.ats.orchestration.CitationService;
import com.ats.orchestration.TranscriptStore;
import com.ats.orchestration.TranscriptionService;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.http.ResponseEntity;

/** AI disabled iken yalnız AI çağrı uçlarının açık 503 verdiği controller kontratı. */
class AiUnavailableApiTest {

    @Test
    void transcribe_returns_no_store_503_without_touching_customer_core_dependencies() {
        ObjectProvider<TranscriptionService> provider =
                new StaticListableBeanFactory().getBeanProvider(TranscriptionService.class);
        AppProperties props = properties();

        InterviewApiController controller = new InterviewApiController(
                null, null, null, provider, props, null);
        ResponseEntity<?> response = controller.transcribe(
                null, "iv-ai-disabled", new InterviewApiController.TranscribeBody("opaque-key"));

        assertEquals(503, response.getStatusCode().value());
        assertEquals("no-store", response.getHeaders().getCacheControl());
        assertEquals("AI_NOT_APPROVED", ((Map<?, ?>) response.getBody()).get("error"));
    }

    @Test
    void cite_returns_no_store_503_when_ai_is_not_owner_approved() {
        ObjectProvider<CitationService> provider =
                new StaticListableBeanFactory().getBeanProvider(CitationService.class);

        CitationApiController controller = new CitationApiController(provider, null);
        ResponseEntity<?> response = controller.citeClaim(
                null, "iv-ai-disabled", new CitationApiController.CiteBody("tr-key", "claim"));

        assertEquals(503, response.getStatusCode().value());
        assertEquals("no-store", response.getHeaders().getCacheControl());
        assertEquals("AI_NOT_APPROVED", ((Map<?, ?>) response.getBody()).get("error"));
    }

    private static AppProperties properties() {
        return new AppProperties(
                new AppProperties.Db("jdbc:postgresql://127.0.0.1:5432/unused", "u", "p"),
                new AppProperties.Ai(false, null, null, null, null, null, null, null, null, null),
                new AppProperties.Security(
                        "https://idp.example/jwks.json", "https://idp.example", "ats-api", "tenant"),
                new AppProperties.Ingest(1024),
                new AppProperties.Retention(false, null, 0, null));
    }
}
