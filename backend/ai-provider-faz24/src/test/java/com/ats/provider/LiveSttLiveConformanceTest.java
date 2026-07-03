package com.ats.provider;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.contracts.AIProvider;
import com.ats.kernel.Outcome;
import java.io.ByteArrayOutputStream;
import java.net.http.HttpClient;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/**
 * ATS-0017 CANLI conformance (opt-in): pinli spec'e karşı değil, GERÇEK motora
 * karşı adaptör koşusu. CI'da env yok → genuine SKIP (kırmızı değil); canlı motora
 * ağ erişimi olan bir yoldan (örn. loopback port-forward) şu şekilde koşulur:
 *
 * <pre>
 *   ATS_LIVE_STT_BASE_URL=http://127.0.0.1:18200 \
 *     mvn -pl ai-provider-faz24 test -Dtest=LiveSttLiveConformanceTest
 * </pre>
 *
 * Erişim topolojisi bu (public) repoya bilinçli yazılmaz. Plaintext yalnız
 * loopback'e izinlidir (package-private test constructor'ı) — kanonik yol mTLS.
 *
 * SENTETİK ses (ATS-0016: gerçek aday verisi build'de YASAK): 1 sn 16 kHz mono
 * PCM sessizlik, testte üretilir. Whisper sessizlikte boş segment listesi döner
 * (2026-07-03 canlı gözlem) — içerik-kalite iddiası DEĞİL, wire-level kanıt
 * (multipart kabul + 200 + şema map + zorlanmış dil). Kalite = Gate C işi.
 */
@EnabledIfEnvironmentVariable(named = "ATS_LIVE_STT_BASE_URL", matches = ".+")
class LiveSttLiveConformanceTest {

    @Test
    void live_engine_accepts_multipart_and_speaks_discovered_contract() {
        String baseUrl = System.getenv("ATS_LIVE_STT_BASE_URL");
        AudioSource silence = ref -> Outcome.ok(
                new AudioSource.AudioBlob(syntheticSilenceWav(), "audio/wav"));
        Faz24LiveSttProvider provider = new Faz24LiveSttProvider(
                HttpClient.newHttpClient(), baseUrl, Duration.ofSeconds(120),
                silence, "tr", true);

        Outcome<AIProvider.TranscriptResult> out = provider.transcribe("live-conformance-probe");

        assertInstanceOf(Outcome.Ok.class, out, "canlı motor mutlu-yol ok olmalı: " + out);
        AIProvider.TranscriptResult result = ((Outcome.Ok<AIProvider.TranscriptResult>) out).value();
        assertEquals("tr", result.language(), "language=tr query zorlaması canlıda uygulanmalı");
        for (AIProvider.TranscriptSegment seg : result.segments()) {
            assertEquals(Faz24LiveSttProvider.UNDIARIZED_STREAM, seg.speaker(),
                    "canlı motorda diarization yok — sentinel değişmemeli");
            assertTrue(seg.endMs() >= seg.startMs(), "zaman aralığı monoton olmalı");
            assertTrue(seg.startMs() >= 0);
        }
        // Sessizlik gözlemi (2026-07-03): boş segment listesi normaldir; içerik
        // assert edilmez (sentetik sessizlikten metin İDDİA etmek fake-kanıt olur).
    }

    /** 1 sn 16 kHz 16-bit mono PCM sessizlik — RIFF/WAVE header testte kurulur. */
    private static byte[] syntheticSilenceWav() {
        int sampleRate = 16000;
        int samples = sampleRate; // 1 saniye
        int dataLen = samples * 2; // 16-bit mono
        ByteArrayOutputStream outStream = new ByteArrayOutputStream();
        ByteBuffer header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN);
        header.put("RIFF".getBytes(StandardCharsets.US_ASCII));
        header.putInt(36 + dataLen);
        header.put("WAVE".getBytes(StandardCharsets.US_ASCII));
        header.put("fmt ".getBytes(StandardCharsets.US_ASCII));
        header.putInt(16);              // fmt chunk boyutu (PCM)
        header.putShort((short) 1);     // PCM
        header.putShort((short) 1);     // mono
        header.putInt(sampleRate);
        header.putInt(sampleRate * 2);  // byte rate
        header.putShort((short) 2);     // block align
        header.putShort((short) 16);    // bits/sample
        header.put("data".getBytes(StandardCharsets.US_ASCII));
        header.putInt(dataLen);
        outStream.writeBytes(header.array());
        outStream.writeBytes(new byte[dataLen]); // sessizlik
        return outStream.toByteArray();
    }
}
