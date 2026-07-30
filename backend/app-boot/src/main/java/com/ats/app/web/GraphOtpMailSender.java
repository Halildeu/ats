package com.ats.app.web;

import com.ats.application.OtpMailSender;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import com.fasterxml.jackson.databind.JsonNode;
import java.net.http.HttpClient;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * #235: giriş kodunu Microsoft Graph sendMail ile ulaştırır (workspace
 * standardı Teams/M365; SMTP altyapısı yok). Client-credentials akışı —
 * kullanıcı etkileşimi yok, gönderen sabit bir servis posta kutusu.
 *
 * <p>Fail-closed: dört ayardan biri boşsa {@link #configured()} false döner ve
 * uç 503 verir. Secret hiçbir hata mesajına/log'a yazılmaz; Graph cevap
 * gövdeleri de yazılmaz (kiracı iç bilgisi taşıyabilir).
 */
@Component
final class GraphOtpMailSender implements OtpMailSender {

    // #237: gönderim/token hatası daha önce yalnız Outcome.reason'a gidiyordu,
    // hiçbir yere loglanmıyordu — 503'ün sebebi operatör için görünmezdi.
    // Log satırı yalnız exception + sınıf adı taşır; email/kod/Graph cevap
    // gövdesi buraya da yazılmaz (dosya başındaki fail-closed disiplinle aynı).
    private static final Logger LOG = LoggerFactory.getLogger("ats.ops");

    private final RestClient http;
    private final Clock clock;
    private final String tenantId;
    private final String clientId;
    private final String clientSecret;
    private final String sender;

    /** Süresine 60 sn kala yenilenen süreç-içi token cache'i. */
    private volatile CachedToken cached;

    private record CachedToken(String value, Instant expiresAt) {}

    // İki kurucu var (test enjeksiyonu için ikincisi); işaretlenmezse Spring
    // varsayılan kurucu arar ve bağlam yüklenmez.
    @Autowired
    GraphOtpMailSender(
            @Value("${ats.mail.graph.tenant-id:}") String tenantId,
            @Value("${ats.mail.graph.client-id:}") String clientId,
            @Value("${ats.mail.graph.client-secret:}") String clientSecret,
            @Value("${ats.mail.graph.sender:}") String sender) {
        this(RestClient.builder()
                        .requestFactory(new JdkClientHttpRequestFactory(
                                HttpClient.newBuilder()
                                        .connectTimeout(Duration.ofSeconds(10))
                                        .build()))
                        .build(),
                Clock.systemUTC(), tenantId, clientId, clientSecret, sender);
    }

    GraphOtpMailSender(RestClient http, Clock clock, String tenantId, String clientId,
            String clientSecret, String sender) {
        this.http = http;
        this.clock = clock;
        this.tenantId = tenantId == null ? "" : tenantId.trim();
        this.clientId = clientId == null ? "" : clientId.trim();
        this.clientSecret = clientSecret == null ? "" : clientSecret.trim();
        this.sender = sender == null ? "" : sender.trim();
    }

    @Override
    public boolean configured() {
        return !tenantId.isEmpty() && !clientId.isEmpty()
                && !clientSecret.isEmpty() && !sender.isEmpty();
    }

    @Override
    public Outcome<Void> sendLoginCode(String email, String code) {
        if (!configured()) {
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "mail sender is not configured");
        }
        String token;
        try {
            token = accessToken();
        } catch (RestClientException | IllegalStateException ex) {
            LOG.warn("candidate-login mail token acquisition failed: {}",
                    ex.getClass().getSimpleName(), ex);
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED, "mail token acquisition failed");
        }
        // Kod YALNIZ mail gövdesine girer. Gövde düz metin — HTML şablonu yok,
        // injection yüzeyi yok (adres zaten shape-check'ten geçti).
        Map<String, Object> body = Map.of(
                "message", Map.of(
                        "subject", "Başvuru girişi doğrulama kodu",
                        "body", Map.of(
                                "contentType", "Text",
                                "content", "Başvurularınıza giriş için tek kullanımlık kodunuz: "
                                        + code + "\n\nKod 10 dakika geçerlidir. Bu isteği siz"
                                        + " yapmadıysanız bu e-postayı yok sayın."),
                        "toRecipients", List.of(
                                Map.of("emailAddress", Map.of("address", email)))),
                "saveToSentItems", false);
        try {
            http.post()
                    .uri("https://graph.microsoft.com/v1.0/users/{sender}/sendMail", sender)
                    .header("Authorization", "Bearer " + token)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .toBodilessEntity();
            return Outcome.ok(null);
        } catch (RestClientException ex) {
            // Cevap gövdesi bilerek yazılmaz; sınıf adı teşhis için yeter.
            LOG.warn("candidate-login mail delivery failed: {}",
                    ex.getClass().getSimpleName(), ex);
            return Outcome.fail(OutcomeCode.NOT_CONFIGURED,
                    "mail delivery failed: " + ex.getClass().getSimpleName());
        }
    }

    private String accessToken() {
        CachedToken current = cached;
        Instant now = clock.instant();
        if (current != null && now.isBefore(current.expiresAt().minusSeconds(60))) {
            return current.value();
        }
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", "client_credentials");
        form.add("client_id", clientId);
        form.add("client_secret", clientSecret);
        form.add("scope", "https://graph.microsoft.com/.default");
        JsonNode response = http.post()
                .uri("https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token", tenantId)
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(form)
                .retrieve()
                .body(JsonNode.class);
        if (response == null || !response.hasNonNull("access_token")) {
            throw new IllegalStateException("token response missing access_token");
        }
        long expiresIn = response.path("expires_in").asLong(300);
        CachedToken fresh =
                new CachedToken(response.get("access_token").asText(), now.plusSeconds(expiresIn));
        cached = fresh;
        return fresh.value();
    }
}
