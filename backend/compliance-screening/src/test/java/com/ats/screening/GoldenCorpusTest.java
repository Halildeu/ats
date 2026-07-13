package com.ats.screening;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.kernel.JsonCodec;
import com.ats.kernel.JsonValue;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.TreeSet;
import org.junit.jupiter.api.Test;

/**
 * ORTAK golden-corpus koşucusu (Java tarafı). Aynı JSON fixture'ı Node-CI (vitest
 * {@code screening-corpus.contract.test.ts}) de koşar → iki-bağımsız-motor drift'i corpus ile
 * yakalanır. Ayrıca <b>digest-eşitlik</b>: registry dosyasının SHA-256'sı corpus'taki
 * {@code policyDigest} ile eşleşmeli (tek-kaynak vokabüler; kod ↔ Node aynı registry'yi tüketir).
 */
class GoldenCorpusTest {

    private static final String REGISTRY = "screening/protected-attribute-screening-policy.v1.json";
    private static final String CORPUS = "screening/screening-golden-corpus.v1.json";

    private final ProtectedAttributeScreener loaded = ProtectedAttributeScreener.fromClasspath(REGISTRY);
    private final ProtectedAttributeScreener unavailable = ProtectedAttributeScreener.unavailable();

    @Test
    void registry_digest_matches_corpus_pin() {
        String actual = "sha256:" + sha256Hex(resourceBytes(REGISTRY));
        String expected = string(corpus(), "policyDigest");
        assertEquals(expected, actual, "registry digest ↔ corpus policyDigest drift (registry değişti mi?)");
    }

    @Test
    void every_corpus_case_reproduces_expected() {
        JsonValue.JsonObject root = corpus();
        List<JsonValue> cases = array(root, "cases");
        assertTrue(cases.size() >= 25, "corpus beklenenden küçük: " + cases.size());

        TreeSet<String> groups = new TreeSet<>();
        for (JsonValue cv : cases) {
            JsonValue.JsonObject c = obj(cv);
            String id = string(c, "id");
            groups.add(string(c, "group"));
            ScreeningSourceKind sourceKind = ScreeningSourceKind.valueOf(string(c, "sourceKind"));
            ProtectedAttributeScreener screener =
                    "unavailable".equals(string(c, "screener")) ? unavailable : loaded;

            ScreeningResult r = screener.screen(string(c, "text"), sourceKind);

            assertEquals(Coverage.valueOf(string(c, "expectedCoverage")), r.coverage(),
                    () -> "coverage [" + id + "]");

            List<JsonValue> ef = array(c, "expectedFindings");
            assertEquals(ef.size(), r.findings().size(),
                    () -> "bulgu sayısı [" + id + "] beklenen=" + render(ef) + " gerçek=" + r.findings());
            for (int i = 0; i < ef.size(); i++) {
                JsonValue.JsonObject e = obj(ef.get(i));
                ScreeningFinding f = r.findings().get(i);
                int idx = i;
                assertEquals(ProtectedCategory.valueOf(string(e, "category")), f.category(),
                        () -> "category [" + id + "#" + idx + "]");
                assertEquals(ScreeningSignal.valueOf(string(e, "signal")), f.signal(),
                        () -> "signal [" + id + "#" + idx + "]");
                assertEquals(intOf(e, "start"), f.span().startInclusive(), () -> "start [" + id + "#" + idx + "]");
                assertEquals(intOf(e, "end"), f.span().endExclusive(), () -> "end [" + id + "#" + idx + "]");
                assertEquals(nullableInt(e, "segmentIndex"), f.span().segmentIndex(),
                        () -> "segmentIndex [" + id + "#" + idx + "]");
                assertEquals(sourceKind, f.sourceKind(), () -> "sourceKind [" + id + "#" + idx + "]");
            }
            // fail-closed invariant: SUPPORTED dışı asla CLEAR değildir
            if (r.coverage() != Coverage.SUPPORTED) {
                assertTrue(!r.isClear(), () -> "SUPPORTED-olmayan CLEAR olamaz [" + id + "]");
            }
        }
        assertEquals(new TreeSet<>(List.of(
                "coverage_edge", "direct_positive", "false_positive", "morphological_variant",
                "punctuation_unicode", "question_like", "safe_business_phrase", "safe_plus_protected_mixed")),
                groups, "8 corpus grubu beklenir");
    }

    // ---- yardımcılar ----

    private JsonValue.JsonObject corpus() {
        return obj(JsonCodec.parse(new String(resourceBytes(CORPUS), StandardCharsets.UTF_8)));
    }

    private static byte[] resourceBytes(String path) {
        try (InputStream in = GoldenCorpusTest.class.getClassLoader().getResourceAsStream(path)) {
            if (in == null) {
                throw new IllegalStateException("kaynak classpath'te yok: " + path);
            }
            return in.readAllBytes();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static String sha256Hex(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static JsonValue.JsonObject obj(JsonValue v) {
        if (v instanceof JsonValue.JsonObject o) {
            return o;
        }
        throw new IllegalStateException("object bekleniyordu: " + v);
    }

    private static List<JsonValue> array(JsonValue.JsonObject o, String key) {
        if (o.values().get(key) instanceof JsonValue.JsonArray a) {
            return a.items();
        }
        throw new IllegalStateException("dizi alan yok: " + key);
    }

    private static String string(JsonValue.JsonObject o, String key) {
        if (o.values().get(key) instanceof JsonValue.JsonString s) {
            return s.value();
        }
        throw new IllegalStateException("string alan yok: " + key);
    }

    private static int intOf(JsonValue.JsonObject o, String key) {
        if (o.values().get(key) instanceof JsonValue.JsonNumber n) {
            return (int) n.value();
        }
        throw new IllegalStateException("sayı alan yok: " + key);
    }

    private static Integer nullableInt(JsonValue.JsonObject o, String key) {
        JsonValue v = o.values().get(key);
        if (v instanceof JsonValue.JsonNull) {
            return null;
        }
        if (v instanceof JsonValue.JsonNumber n) {
            return (int) n.value();
        }
        throw new IllegalStateException("null|sayı bekleniyordu: " + key);
    }

    private static String render(List<JsonValue> expected) {
        List<String> out = new ArrayList<>();
        for (JsonValue v : expected) {
            JsonValue.JsonObject e = obj(v);
            out.add(string(e, "category") + "/" + string(e, "signal")
                    + "[" + intOf(e, "start") + "," + intOf(e, "end") + ")");
        }
        return out.toString();
    }
}
