package com.ats.contracts;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.kernel.Ids;
import com.ats.kernel.JsonValue;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.io.IOException;
import java.lang.reflect.Modifier;
import java.lang.reflect.ParameterizedType;
import java.lang.reflect.RecordComponent;
import java.lang.reflect.Type;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.TreeSet;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

/**
 * ATS-0001 contract-surface parity (Java mirror tarafı).
 *
 * <p>TS kanonik ({@code contracts/}) extractor'ı tüm yüzeyi (metot param/return
 * tipleri + DTO alan tipleri + enum üyeleri) dilden-bağımsız token'lara çıkarır ve
 * {@code contracts/contract-surface.tokens.txt}'e yazar. Bu test Java interface'lerini
 * reflection ile okur, AYNI token vocabulary'sine map'ler ve committed projeksiyonla
 * karşılaştırır → tip/DTO/enum drift'i iki tarafta da makine-yakalanır (codegen-grade
 * parity; eski "yalnız metot-adı" sınırı kalktı).
 *
 * <p>Sınır (dürüst): optional/nullable cross-language karşılaştırılmaz (Java record
 * opsiyonelliği ifade edemez) — opsiyonellik TS json deep-equal ile (TS-only) kilitli.
 * Entailment enum'u top-level {@code E} satırı olarak yok (TS'te isimsiz inline union);
 * parity'si {@code D CitationResult.entailment:enum:...} alan token'ıyla zorlanır.
 */
class SurfaceParityTest {

    private static final List<Class<?>> CONTRACTS =
            List.of(IdentityTenant.class, EvidenceLedger.class, AIProvider.class, ATSConnector.class);

    // TS `enums` bölümü = TS'te ADI olan string-literal-union alias'ları = bu ikisi.
    private static final List<Class<?>> NAMED_ENUMS =
            List.of(OutcomeCode.class, ATSConnector.ExportTarget.class);

    @Test
    void javaSurfaceMatchesCanonicalTokenProjection() throws IOException {
        TreeSet<String> expected = new TreeSet<>(readCommittedTokens());
        TreeSet<String> actual = new TreeSet<>(buildJavaTokens());
        assertEquals(expected, actual, () -> diff(expected, actual));
    }

    // ---- committed projection (parser-free) ----

    private static List<String> readCommittedTokens() throws IOException {
        Path file = locate("contracts/contract-surface.tokens.txt");
        return Files.readAllLines(file).stream()
                .map(String::strip)
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toList());
    }

    /** user.dir (= contracts-java modül dizini) üzerinden repo köküne çıkıp dosyayı bulur. */
    private static Path locate(String relative) {
        Path dir = Path.of("").toAbsolutePath();
        for (int i = 0; i < 8 && dir != null; i++, dir = dir.getParent()) {
            Path candidate = dir.resolve(relative);
            if (Files.exists(candidate)) return candidate;
        }
        throw new IllegalStateException("bulunamadı (repo kökünden): " + relative);
    }

    // ---- Java reflection → token vocabulary ----

    private static List<String> buildJavaTokens() {
        List<String> lines = new ArrayList<>();

        for (Class<?> iface : CONTRACTS) {
            // C-satırları: abstract metotlar (param/return tipleri)
            Arrays.stream(iface.getDeclaredMethods())
                    .filter(m -> !m.isSynthetic() && Modifier.isAbstract(m.getModifiers()))
                    .forEach(m -> {
                        String params = Arrays.stream(m.getGenericParameterTypes())
                                .map(SurfaceParityTest::token)
                                .collect(Collectors.joining(","));
                        lines.add("C " + iface.getSimpleName() + "." + m.getName()
                                + "(" + params + "):" + token(m.getGenericReturnType()));
                    });

            // D-satırları: nested record DTO'lar
            for (Class<?> nested : iface.getDeclaredClasses()) {
                if (nested.isRecord()) {
                    for (RecordComponent rc : nested.getRecordComponents()) {
                        lines.add("D " + nested.getSimpleName() + "." + rc.getName()
                                + ":" + token(rc.getGenericType()));
                    }
                }
            }
        }

        // E-satırları: yalnız TS'te adı olan enum'lar
        for (Class<?> e : NAMED_ENUMS) {
            lines.add("E " + e.getSimpleName() + "=" + enumMembers(e));
        }

        return lines;
    }

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

    private static String diff(TreeSet<String> expected, TreeSet<String> actual) {
        TreeSet<String> onlyExpected = new TreeSet<>(expected);
        onlyExpected.removeAll(actual);
        TreeSet<String> onlyActual = new TreeSet<>(actual);
        onlyActual.removeAll(expected);
        return "contract-surface drift!\n  yalnız TS(canonical): " + onlyExpected
                + "\n  yalnız Java(mirror): " + onlyActual;
    }

    @Test
    void canonicalProjectionIsNonEmpty() throws IOException {
        assertTrue(readCommittedTokens().size() >= 40, "token projeksiyonu beklenenden küçük");
    }
}
