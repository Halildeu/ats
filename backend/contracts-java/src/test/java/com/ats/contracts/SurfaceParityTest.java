package com.ats.contracts;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

import com.ats.kernel.Ids;
import com.ats.kernel.JsonValue;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.lang.reflect.ParameterizedType;
import java.lang.reflect.RecordComponent;
import java.lang.reflect.Type;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * ATS-0001 contract-surface parity (Java mirror tarafı) — codegen-grade, discovery-driven.
 *
 * <p>TS kanonik ({@code contracts/}) extractor'ı tüm yüzeyi token'lara çıkarıp
 * {@code contracts/contract-surface.tokens.txt}'e yazar. Bu test {@code com.ats.contracts}
 * paketindeki interface'leri **kaynak dizinden keşfeder** (elle liste YOK), reflection ile
 * okur, AYNI token vocabulary'sine map'ler ve committed projeksiyonla karşılaştırır →
 * tip/DTO/enum drift'i + yeni-yüzey sessiz-miss'i iki tarafta makine-yakalanır.
 *
 * <p>Codex 019f131f REVISE absorbe:
 *  - CONTRACTS/NAMED_ENUMS elle liste KALDIRILDI → paket kaynak dizininden discovery.
 *  - contract inheritance + method overload → FAIL-FAST (TS extractor ile simetri).
 *  - orphan enum (tanımlı ama hiç referans edilmeyen + named olmayan) → FAIL.
 *
 * <p>Dürüst sınır (PARITY.md): optional/nullable cross-language karşılaştırılmaz (Java
 * record opsiyonelliği ifade edemez; TS json deep-equal ile TS-only kilitli). Numeric =
 * JSON-level parity (long/int hepsi {@code number}).
 */
class SurfaceParityTest {

    private static final String PKG = "com.ats.contracts";

    @Test
    void javaSurfaceMatchesCanonicalTokenProjection() {
        List<Class<?>> contracts = discoverContracts();
        assertTrue(contracts.size() >= 4, "beklenen ≥4 contract interface, bulunan: " + contracts.size());

        List<String> cdLines = new ArrayList<>();
        Set<Class<?>> enums = new HashSet<>();
        enums.add(OutcomeCode.class); // kernel-level named enum

        for (Class<?> iface : contracts) {
            if (iface.getInterfaces().length > 0) {
                fail("contract inheritance not supported: " + iface.getSimpleName());
            }
            Set<String> seen = new HashSet<>();
            for (Method m : iface.getDeclaredMethods()) {
                if (m.isSynthetic() || !Modifier.isAbstract(m.getModifiers())) continue;
                if (!seen.add(m.getName())) {
                    fail("overload not supported: " + iface.getSimpleName() + "." + m.getName());
                }
                String params = Arrays.stream(m.getGenericParameterTypes())
                        .map(SurfaceParityTest::token)
                        .collect(Collectors.joining(","));
                cdLines.add("C " + iface.getSimpleName() + "." + m.getName()
                        + "(" + params + "):" + token(m.getGenericReturnType()));
            }
            for (Class<?> nested : iface.getDeclaredClasses()) {
                if (nested.isRecord()) {
                    for (RecordComponent rc : nested.getRecordComponents()) {
                        cdLines.add("D " + nested.getSimpleName() + "." + rc.getName()
                                + ":" + token(rc.getGenericType()));
                    }
                } else if (nested.isEnum()) {
                    enums.add(nested);
                }
            }
        }

        // Enum E-satırları: TS'te ADI olan enum'lar (= committed E satırlarından türetilir).
        Set<String> committed = new TreeSet<>(readCommittedTokens());
        Set<String> expectedEnumNames = committed.stream()
                .filter(s -> s.startsWith("E "))
                .map(s -> s.substring(2, s.indexOf('=')))
                .collect(Collectors.toCollection(HashSet::new));

        List<String> lines = new ArrayList<>(cdLines);
        Set<String> emittedEnumNames = new HashSet<>();
        for (Class<?> e : enums) {
            String name = e.getSimpleName();
            String enumTok = "enum:" + enumMembers(e);
            if (expectedEnumNames.contains(name)) {
                lines.add("E " + name + "=" + enumMembers(e));
                emittedEnumNames.add(name);
            } else {
                // named değil → en az bir C/D token'ında referans edilmeli (yoksa orphan).
                boolean referenced = cdLines.stream().anyMatch(l -> l.contains(enumTok));
                if (!referenced) {
                    fail("orphan enum (tanımlı ama referanssız + named değil): " + name);
                }
            }
        }
        // canonical bir enum'u named ediyor ama Java'da yoksa → fail.
        Set<String> missing = new TreeSet<>(expectedEnumNames);
        missing.removeAll(emittedEnumNames);
        if (!missing.isEmpty()) {
            fail("canonical named enum Java'da bulunamadı: " + missing);
        }

        TreeSet<String> actual = new TreeSet<>(lines);
        assertEquals(committed, actual, () -> diff(committed, actual));
    }

    @Test
    void canonicalProjectionIsNonEmpty() {
        assertTrue(readCommittedTokens().size() >= 40, "token projeksiyonu beklenenden küçük");
    }

    // ---- discovery (paket kaynak dizininden — elle liste yok) ----

    private static List<Class<?>> discoverContracts() {
        Path dir = locate("backend/contracts-java/src/main/java/com/ats/contracts");
        try (Stream<Path> files = Files.list(dir)) {
            return files
                    .map(p -> p.getFileName().toString())
                    .filter(n -> n.endsWith(".java") && !n.equals("package-info.java"))
                    .map(n -> n.substring(0, n.length() - ".java".length()))
                    .map(SurfaceParityTest::forName)
                    .filter(c -> c.isInterface() && c.getEnclosingClass() == null)
                    .sorted((a, b) -> a.getSimpleName().compareTo(b.getSimpleName()))
                    .collect(Collectors.toList());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static Class<?> forName(String simpleName) {
        try {
            return Class.forName(PKG + "." + simpleName);
        } catch (ClassNotFoundException e) {
            throw new IllegalStateException("kaynak dosyası var ama sınıf yüklenemedi: " + simpleName, e);
        }
    }

    // ---- committed projection (parser-free) ----

    private static List<String> readCommittedTokens() {
        Path file = locate("contracts/contract-surface.tokens.txt");
        try {
            return Files.readAllLines(file).stream()
                    .map(String::strip)
                    .filter(s -> !s.isEmpty())
                    .collect(Collectors.toList());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** user.dir üzerinden repo köküne çıkıp relative yolu bulur. */
    private static Path locate(String relative) {
        Path dir = Path.of("").toAbsolutePath();
        for (int i = 0; i < 8 && dir != null; i++, dir = dir.getParent()) {
            Path candidate = dir.resolve(relative);
            if (Files.exists(candidate)) return candidate;
        }
        throw new IllegalStateException("bulunamadı (repo kökünden): " + relative);
    }

    // ---- Java reflection → token vocabulary ----

    private static String enumMembers(Class<?> enumClass) {
        return Arrays.stream(enumClass.getEnumConstants())
                .map(c -> ((Enum<?>) c).name())
                .sorted()
                .collect(Collectors.joining("|"));
    }

    private static String token(Type t) {
        if (t instanceof ParameterizedType pt) {
            Class<?> raw = (Class<?>) pt.getRawType();
            Type arg = pt.getActualTypeArguments()[0];
            if (raw == List.class) return "array:" + token(arg);
            if (raw == Outcome.class) return "outcome:" + token(arg);
            throw new IllegalStateException("desteklenmeyen generic: " + t);
        }
        if (t instanceof Class<?> c) {
            if (c == String.class) return "string";
            if (c == long.class || c == int.class || c == double.class
                    || c == float.class || c == short.class || c == byte.class) return "number";
            if (c == boolean.class) return "boolean";
            if (c == void.class || c == Void.class) return "void";
            if (c.getDeclaringClass() == Ids.class) return "id:" + c.getSimpleName();
            if (c == JsonValue.JsonObject.class) return "Json";
            if (c.isEnum()) return "enum:" + enumMembers(c);
            if (c.isRecord()) return "dto:" + c.getSimpleName();
        }
        throw new IllegalStateException("desteklenmeyen tip: " + t);
    }

    private static String diff(Set<String> expected, Set<String> actual) {
        TreeSet<String> onlyExpected = new TreeSet<>(expected);
        onlyExpected.removeAll(actual);
        TreeSet<String> onlyActual = new TreeSet<>(actual);
        onlyActual.removeAll(expected);
        return "contract-surface drift!\n  yalnız TS(canonical): " + onlyExpected
                + "\n  yalnız Java(mirror): " + onlyActual;
    }
}
