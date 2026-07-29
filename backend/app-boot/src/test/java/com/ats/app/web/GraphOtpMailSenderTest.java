package com.ats.app.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Locale;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;

/**
 * #237: gönderim/token hatası daha önce hiçbir yere loglanmıyordu — istemciye
 * dönen enumeration-safe 503 sözleşmesi AYNI kalmalı, log yalnız operatör
 * teşhisi için exception sınıfı taşımalı; email/kod/token/secret/Graph cevap
 * gövdesi ne Outcome.reason'da ne log'da bulunmamalı (mevcut fail-closed
 * disiplin, dosya başı yorumuyla aynı).
 *
 * <p>Mockito {@code RETURNS_DEEP_STUBS} bu arayüzün jenerik self-type +
 * varargs ({@code uri}/{@code header}) bileşiminde güvenilmez davrandığı için
 * zincir elle, adım adım mock'lanıyor. {@code post()} tek bir
 * {@code RequestBodyUriSpec} mock'u döner; token ve gönderim çağrıları aynı
 * mock üzerinde farklı {@code uri(...)} argümanlarıyla ayrışır.
 */
class GraphOtpMailSenderTest {

    private static final String EMAIL = "aday@ornek-kvkk-sizmasin.test";
    private static final String CODE = "013579";
    private static final String SECRET = "cok-gizli-client-secret-loglanmamali";
    private static final String TENANT = "tenant-x";
    private static final String SENDER = "sender@ornek.test";
    private static final String TOKEN_URL =
            "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token";
    private static final String SEND_URL =
            "https://graph.microsoft.com/v1.0/users/{sender}/sendMail";

    private ListAppender<ILoggingEvent> appender;

    @BeforeEach
    void attachAppender() {
        appender = new ListAppender<>();
        appender.start();
        ((ch.qos.logback.classic.Logger) LoggerFactory.getLogger("ats.ops")).addAppender(appender);
    }

    @AfterEach
    void detachAppender() {
        ((ch.qos.logback.classic.Logger) LoggerFactory.getLogger("ats.ops")).detachAppender(appender);
    }

    /** post() -> uri(TOKEN_URL, TENANT) -> contentType(any) -> body(any) -> retrieve() -> body(JsonNode.class). */
    private static RestClient.RequestBodyUriSpec stubTokenChain(
            RestClient.RequestBodyUriSpec postSpec, RestClient.ResponseSpec tokenResponseSpec) {
        RestClient.RequestBodySpec afterUri = mock(RestClient.RequestBodySpec.class);
        RestClient.RequestBodySpec afterContentType = mock(RestClient.RequestBodySpec.class);
        RestClient.RequestBodySpec afterBody = mock(RestClient.RequestBodySpec.class);
        when(postSpec.uri(TOKEN_URL, TENANT)).thenReturn(afterUri);
        when(afterUri.contentType(any())).thenReturn(afterContentType);
        when(afterContentType.body(any(Object.class))).thenReturn(afterBody);
        when(afterBody.retrieve()).thenReturn(tokenResponseSpec);
        return postSpec;
    }

    @Test
    void tokenAcquisitionFailure_logsWarnWithoutLeakingSecretsAndReturnsGenericFailure() {
        RestClient http = mock(RestClient.class);
        RestClient.RequestBodyUriSpec postSpec = mock(RestClient.RequestBodyUriSpec.class);
        when(http.post()).thenReturn(postSpec);

        RestClient.ResponseSpec tokenResponseSpec = mock(RestClient.ResponseSpec.class);
        when(tokenResponseSpec.body(JsonNode.class))
                .thenThrow(new ResourceAccessException("connect timed out"));
        stubTokenChain(postSpec, tokenResponseSpec);

        GraphOtpMailSender sender = new GraphOtpMailSender(
                http, Clock.fixed(Instant.EPOCH, ZoneOffset.UTC),
                TENANT, "client-x", SECRET, SENDER);

        Outcome<Void> outcome = sender.sendLoginCode(EMAIL, CODE);

        assertTrue(outcome instanceof Outcome.Fail<Void>);
        Outcome.Fail<Void> fail = (Outcome.Fail<Void>) outcome;
        assertEquals(OutcomeCode.NOT_CONFIGURED, fail.code());
        assertEquals("mail token acquisition failed", fail.reason());
        assertNoSecretsLeaked(fail.reason());

        assertEquals(1, appender.list.size());
        ILoggingEvent event = appender.list.get(0);
        assertEquals(Level.WARN, event.getLevel());
        assertTrue(event.getFormattedMessage().contains("ResourceAccessException"));
        assertNoSecretsLeaked(event.getFormattedMessage());
        assertNoSecretsLeaked(String.valueOf(event.getThrowableProxy()));
    }

    @Test
    void mailDeliveryFailure_logsWarnWithoutLeakingSecretsAndReturnsGenericFailure() {
        String opaqueToken = "opaque-token-value-not-a-secret-format-check";
        ObjectNode tokenResponse = new ObjectMapper().createObjectNode();
        tokenResponse.put("access_token", opaqueToken);
        tokenResponse.put("expires_in", 3600);

        RestClient http = mock(RestClient.class);
        RestClient.RequestBodyUriSpec postSpec = mock(RestClient.RequestBodyUriSpec.class);
        when(http.post()).thenReturn(postSpec);

        RestClient.ResponseSpec tokenResponseSpec = mock(RestClient.ResponseSpec.class);
        when(tokenResponseSpec.body(JsonNode.class)).thenReturn(tokenResponse);
        stubTokenChain(postSpec, tokenResponseSpec);

        // post() -> uri(SEND_URL, SENDER) -> header(Authorization, Bearer token)
        //   -> contentType(any) -> body(any) -> retrieve() -> toBodilessEntity()
        RestClient.RequestBodySpec afterSendUri = mock(RestClient.RequestBodySpec.class);
        RestClient.RequestBodySpec afterSendHeader = mock(RestClient.RequestBodySpec.class);
        RestClient.RequestBodySpec afterSendContentType = mock(RestClient.RequestBodySpec.class);
        RestClient.RequestBodySpec afterSendBody = mock(RestClient.RequestBodySpec.class);
        RestClient.ResponseSpec sendResponseSpec = mock(RestClient.ResponseSpec.class);
        when(postSpec.uri(SEND_URL, SENDER)).thenReturn(afterSendUri);
        when(afterSendUri.header("Authorization", "Bearer " + opaqueToken)).thenReturn(afterSendHeader);
        when(afterSendHeader.contentType(any())).thenReturn(afterSendContentType);
        when(afterSendContentType.body(any(Object.class))).thenReturn(afterSendBody);
        when(afterSendBody.retrieve()).thenReturn(sendResponseSpec);
        when(sendResponseSpec.toBodilessEntity())
                .thenThrow(new ResourceAccessException("connection refused"));

        GraphOtpMailSender sender = new GraphOtpMailSender(
                http, Clock.fixed(Instant.EPOCH, ZoneOffset.UTC),
                TENANT, "client-x", SECRET, SENDER);

        Outcome<Void> outcome = sender.sendLoginCode(EMAIL, CODE);

        assertTrue(outcome instanceof Outcome.Fail<Void>);
        Outcome.Fail<Void> fail = (Outcome.Fail<Void>) outcome;
        assertEquals(OutcomeCode.NOT_CONFIGURED, fail.code());
        assertEquals("mail delivery failed: ResourceAccessException", fail.reason());
        assertNoSecretsLeaked(fail.reason());

        assertEquals(1, appender.list.size());
        ILoggingEvent event = appender.list.get(0);
        assertEquals(Level.WARN, event.getLevel());
        assertTrue(event.getFormattedMessage().contains("ResourceAccessException"));
        assertNoSecretsLeaked(event.getFormattedMessage());
        assertNoSecretsLeaked(String.valueOf(event.getThrowableProxy()));
    }

    @Test
    void configuredFalse_neverLogsAndNeverCallsHttp() {
        RestClient http = mock(RestClient.class);
        GraphOtpMailSender sender = new GraphOtpMailSender(
                http, Clock.systemUTC(), "", "", "", "");

        Outcome<Void> outcome = sender.sendLoginCode(EMAIL, CODE);

        assertFalse(sender.configured());
        assertTrue(outcome instanceof Outcome.Fail<Void>);
        assertEquals(0, appender.list.size());
    }

    private static void assertNoSecretsLeaked(String text) {
        String lower = text.toLowerCase(Locale.ROOT);
        assertFalse(lower.contains(EMAIL.toLowerCase(Locale.ROOT)), "email sızmamalı: " + text);
        assertFalse(lower.contains(CODE), "OTP kodu sızmamalı: " + text);
        assertFalse(lower.contains(SECRET.toLowerCase(Locale.ROOT)), "secret sızmamalı: " + text);
    }
}
