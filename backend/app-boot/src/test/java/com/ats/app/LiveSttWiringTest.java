package com.ats.app;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.ats.contracts.AIProvider;
import com.ats.ingest.InMemoryObjectStore;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import com.ats.orchestration.AudioAccessGrants;
import com.ats.orchestration.InMemoryAudioAccessGrants;
import com.ats.provider.AudioSource;
import com.ats.provider.Faz24LiveSttProvider;
import com.ats.provider.HttpAIProvider;
import java.time.Clock;
import java.time.Duration;
import org.junit.jupiter.api.Test;

/**
 * slice-36 wiring-seçim + köprü testleri (Spring context'siz — WiringConfig bean
 * metodları package-private çağrılır; kapalı-küme validasyonu AppProperties.Ai
 * compact-constructor'ında boot-time patlar).
 */
class LiveSttWiringTest {

    // Mevcut testler plain davranış bekler → mTLS disabled (açık beyan) ile kur.
    // gov0 boot-gate girdileri (endpointRef/approvals) bu provider-seçim testlerinde ilgisiz →
    // null (buildAiProvider gate'ten bağımsız seçim birimidir; gate authorizeProvider'da test edilir).
    private static AppProperties.Ai ai(String provider, String baseUrl) {
        return new AppProperties.Ai(provider, baseUrl, null, Duration.ofSeconds(5), "tr",
                Duration.ofSeconds(60), new AppProperties.Mtls("disabled", null, null, null), null, null);
    }

    private static AppProperties.Ai aiMtls(String provider, String baseUrl, String mode,
            String ks, String ksPass, String ts) {
        return new AppProperties.Ai(provider, baseUrl, null, Duration.ofSeconds(5), "tr",
                Duration.ofSeconds(60), new AppProperties.Mtls(mode, ks, ksPass, ts), null, null);
    }

    private static AppProperties props(AppProperties.Ai ai) {
        // yalnız ai() erişilir; diğer alanlar bu testte kullanılmaz
        return new AppProperties(
                new AppProperties.Db("jdbc:postgresql://127.0.0.1:5432/x", "u", "p"),
                ai,
                new AppProperties.Security("https://idp.example/jwks.json", "https://idp.example", "ats", "tenant"),
                new AppProperties.Ingest(1024L),
                new AppProperties.Retention(false, null, 0, null),
                new AppProperties.ObjectStore("in-memory-dev"));
    }

    @Test
    void default_mode_wires_http_json_provider() {
        AIProvider provider = new WiringConfig().buildAiProvider(
                props(ai("http-json", "https://ai.example")), grants(), new InMemoryObjectStore());
        assertInstanceOf(HttpAIProvider.class, provider);
    }

    @Test
    void blank_mode_defaults_to_http_json() {
        assertEquals("http-json", ai(null, "https://ai.example").provider());
        assertEquals("http-json", ai("  ", "https://ai.example").provider());
    }

    @Test
    void live_stt_mode_wires_discovered_contract_adapter_with_https() {
        AIProvider provider = new WiringConfig().buildAiProvider(
                props(ai("live-stt", "https://stt.internal.example:8243")), grants(), new InMemoryObjectStore());
        assertInstanceOf(Faz24LiveSttProvider.class, provider);
    }

    @Test
    void live_stt_mode_rejects_plaintext_base_url_at_boot() {
        // Faz24LiveSttProvider public ctor https zorunlu — deploy yanlışı BOOT'ta patlar
        assertThrows(IllegalArgumentException.class, () -> new WiringConfig().buildAiProvider(
                props(ai("live-stt", "http://stt.internal.example:8200")), grants(), new InMemoryObjectStore()));
    }

    @Test
    void unknown_provider_value_fails_closed_at_properties_layer() {
        assertThrows(IllegalStateException.class, () -> ai("cloud-stt", "https://x"));
    }

    @Test
    void live_stt_mode_cite_stays_not_configured_no_delegation() {
        AIProvider provider = new WiringConfig().buildAiProvider(
                props(ai("live-stt", "https://stt.internal.example:8243")), grants(), new InMemoryObjectStore());
        Outcome.Fail<AIProvider.CitationResult> fail = (Outcome.Fail<AIProvider.CitationResult>)
                provider.cite("claim", "tr-ref");
        assertEquals(OutcomeCode.NOT_CONFIGURED, fail.code());
    }

    // --- slice-38: mTLS required fail-closed + materyalle wiring ---

    @Test
    void live_stt_mtls_required_without_material_fails_closed_at_properties() {
        // mode=required (default) + cert-yol yok → AppProperties.Ai compact-ctor BOOT'ta patlar
        assertThrows(IllegalStateException.class, () -> aiMtls(
                "live-stt", "https://stt.internal.example:8243", "required", null, null, null));
    }

    @Test
    void live_stt_mtls_required_with_pkcs12_wires_mtls_adapter() {
        String ks = resourcePath("/mtls/client.p12");
        String ts = resourcePath("/mtls/truststore.p12");
        AIProvider provider = new WiringConfig().buildAiProvider(
                props(aiMtls("live-stt", "https://stt.internal.example:8243", "required",
                        ks, "atslive-test", ts)),
                grants(), new InMemoryObjectStore());
        assertInstanceOf(Faz24LiveSttProvider.class, provider);
    }

    @Test
    void live_stt_mtls_required_with_unreadable_keystore_fails_closed_at_wiring() {
        assertThrows(IllegalStateException.class, () -> new WiringConfig().buildAiProvider(
                props(aiMtls("live-stt", "https://stt.internal.example:8243", "required",
                        "/nonexistent/ks.p12", "pw", "/nonexistent/ts.p12")),
                grants(), new InMemoryObjectStore()));
    }

    private static String resourcePath(String resource) {
        try {
            return java.nio.file.Path.of(
                    LiveSttWiringTest.class.getResource(resource).toURI()).toString();
        } catch (Exception e) {
            throw new IllegalStateException("test fixture yolu çözülemedi: " + resource, e);
        }
    }

    // --- GrantRedeemingAudioSource köprüsü ---

    private static InMemoryAudioAccessGrants grants() {
        return new InMemoryAudioAccessGrants(Clock.systemUTC(), Duration.ofSeconds(60));
    }

    private static final TenantId T1 = new TenantId("t1");

    @Test
    void bridge_redeems_handle_then_reads_tenant_scoped_object() {
        InMemoryAudioAccessGrants grants = grants();
        InMemoryObjectStore store = new InMemoryObjectStore();
        byte[] audio = new byte[] {1, 2, 3};
        store.put(T1, "iv/rec-a", audio, "audio/wav");
        String handle = ((Outcome.Ok<String>) grants.issue(T1, "iv/rec-a")).value();

        AudioSource source = new GrantRedeemingAudioSource(grants, store);
        AudioSource.AudioBlob blob =
                ((Outcome.Ok<AudioSource.AudioBlob>) source.read(handle)).value();
        assertArrayEquals(audio, blob.bytes());
        assertEquals("audio/wav", blob.contentType());
        // one-shot: aynı handle ikinci kez okunamaz
        Outcome.Fail<AudioSource.AudioBlob> second =
                (Outcome.Fail<AudioSource.AudioBlob>) source.read(handle);
        assertEquals(OutcomeCode.NOT_FOUND, second.code());
    }

    @Test
    void bridge_rejects_ambient_object_key_fail_closed() {
        // Codex slice-33 sınırı: global key-lookup YOK — redeem edilmemiş ham key çözülmez
        AudioSource source = new GrantRedeemingAudioSource(grants(), new InMemoryObjectStore());
        Outcome.Fail<AudioSource.AudioBlob> fail =
                (Outcome.Fail<AudioSource.AudioBlob>) source.read("iv/rec-" + "a".repeat(64));
        assertEquals(OutcomeCode.NOT_FOUND, fail.code());
    }

    @Test
    void bridge_propagates_store_miss_after_valid_redeem() {
        InMemoryAudioAccessGrants grants = grants();
        String handle = ((Outcome.Ok<String>) grants.issue(T1, "iv/rec-missing")).value();
        AudioSource source = new GrantRedeemingAudioSource(grants, new InMemoryObjectStore());
        Outcome.Fail<AudioSource.AudioBlob> fail =
                (Outcome.Fail<AudioSource.AudioBlob>) source.read(handle);
        assertEquals(OutcomeCode.NOT_FOUND, fail.code());
    }
}
