package com.ats.screening;

import com.ats.kernel.JsonCodec;
import com.ats.kernel.JsonValue;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * TEK kanonik, sürümlü korumalı-özellik tarama policy'si (registry). Fail-closed yüklenir:
 * kernel {@link JsonCodec} (güvenilmez-girdi-sağlam parser) ile parse → exact-key şema
 * (bilinmeyen alan RED) → kapalı-küme enum'lar (ProtectedCategory/Kind) → her terim
 * NORMALIZE-idempotent doğrulanır (registry yazarı ham/diakritikli terim koyamaz; normalizer
 * ile eşleşme için terimler önceden-normalize saklanır). Herhangi bir ihlal yüklemeyi düşürür.
 *
 * <p>Bu registry'yi Java-runtime tarayıcı VE Node-CI aynı dosyadan tüketir (tek fiziksel kaynak);
 * {@code screening-golden-corpus} içindeki {@code policyDigest} ile digest-eşitlik makine-uygulanır
 * → iki-bağımsız-vokabüler drift'i engellenir.
 *
 * <p>Terim türleri (kontrollü; fuzzy/ML YOK):
 * <ul>
 *   <li>{@code WORD} — normalize token'ı terime BİREBİR eşit (token-sınırlı).</li>
 *   <li>{@code PHRASE} — ardışık token dizisi terimin token dizisine eşit.</li>
 *   <li>{@code STEM} — token terimle BAŞLAR + uzunluk ≥ {@code minLen} + kalan ek yalnız harf
 *       (kontrollü morfolojik önek; genel-stemming değil). Yalnız iyi-huylu-çakışması olmayan
 *       kökler için kullanılır.</li>
 * </ul>
 */
public final class ScreeningPolicy {

    /** Normalize-token dilbilgisi: yalnız ASCII harf/rakam (normalizer çıktısıyla uyumlu). */
    private static final Pattern TOKEN = Pattern.compile("[a-z0-9]+");

    /**
     * BCP-47 benzeri dil-tag biçimi: küçük-harf primary subtag ({@code [a-z]{2,3}}) + isteğe bağlı
     * alt-tag'ler. Yalnız parse edilmez, FORMAT-doğrulanır (bozuk değer yüklemeyi düşürür).
     */
    private static final Pattern LANG_TAG = Pattern.compile("[a-z]{2,3}(-[A-Za-z0-9]{1,8})*");

    public enum Kind { WORD, PHRASE, STEM }

    /** Tek terim: {@code text} normalize-formda; PHRASE için boşlukla ayrık token dizisi. */
    public record Term(String text, Kind kind, int minLen, List<String> tokens) {
        public Term {
            tokens = List.copyOf(tokens);
        }
    }

    public record Category(ProtectedCategory code, List<Term> terms) {
        public Category {
            terms = List.copyOf(terms);
        }
    }

    private final ScreeningPolicyRef policyRef;
    private final String version;
    private final Set<String> supportedLanguages;
    private final List<Category> categories;
    private final List<List<String>> safePhrases;
    private final List<List<String>> questionCues;

    private ScreeningPolicy(ScreeningPolicyRef policyRef, String version, Set<String> supportedLanguages,
            List<Category> categories, List<List<String>> safePhrases, List<List<String>> questionCues) {
        this.policyRef = policyRef;
        this.version = version;
        this.supportedLanguages = Set.copyOf(supportedLanguages);
        this.categories = List.copyOf(categories);
        this.safePhrases = List.copyOf(safePhrases);
        this.questionCues = List.copyOf(questionCues);
    }

    public ScreeningPolicyRef policyRef() {
        return policyRef;
    }

    public String version() {
        return version;
    }

    public Set<String> supportedLanguages() {
        return supportedLanguages;
    }

    public List<Category> categories() {
        return categories;
    }

    public List<List<String>> safePhrases() {
        return safePhrases;
    }

    public List<List<String>> questionCues() {
        return questionCues;
    }

    // ---- fail-closed yükleme ----

    public static ScreeningPolicy fromClasspath(String resourcePath) {
        ClassLoader cl = ScreeningPolicy.class.getClassLoader();
        try (InputStream in = cl.getResourceAsStream(resourcePath)) {
            if (in == null) {
                throw new IllegalStateException(
                        "tarama-policy kaynağı classpath'te yok (fail-closed): " + resourcePath);
            }
            return fromJson(new String(in.readAllBytes(), StandardCharsets.UTF_8));
        } catch (IOException e) {
            throw new IllegalStateException("tarama-policy kaynağı okunamadı: " + resourcePath, e);
        }
    }

    public static ScreeningPolicy fromJson(String json) {
        JsonValue root = JsonCodec.parse(json);
        if (!(root instanceof JsonValue.JsonObject obj)) {
            throw new IllegalStateException("tarama-policy: kök JSON object olmalı (fail-closed)");
        }
        requireExactKeys(obj, Set.of("policyRef", "version", "supportedLanguages",
                "categories", "safePhrases", "questionCues"), "kök");

        String refValue = reqStr(obj, "policyRef");
        if (!ScreeningPolicyRef.isValid(refValue)) {
            throw new IllegalStateException("tarama-policy: policyRef biçimi geçersiz (fail-closed): " + refValue);
        }
        ScreeningPolicyRef policyRef = new ScreeningPolicyRef(refValue);
        String version = reqStr(obj, "version");

        Set<String> langs = new LinkedHashSet<>();
        for (String lang : reqStrArray(obj, "supportedLanguages")) {
            if (!LANG_TAG.matcher(lang).matches()) {
                throw new IllegalStateException(
                        "tarama-policy: supportedLanguages biçimi geçersiz (BCP-47 base(-alt-tag)*; fail-closed): "
                                + lang);
            }
            if (!langs.add(lang)) {
                throw new IllegalStateException("tarama-policy: supportedLanguages yinelenen: " + lang);
            }
        }
        if (langs.isEmpty()) {
            throw new IllegalStateException("tarama-policy: supportedLanguages boş olamaz (fail-closed)");
        }

        List<Category> categories = parseCategories(obj);
        List<List<String>> safePhrases = parsePhraseList(obj, "safePhrases");
        List<List<String>> questionCues = parsePhraseList(obj, "questionCues");

        return new ScreeningPolicy(policyRef, version, langs, categories, safePhrases, questionCues);
    }

    private static List<Category> parseCategories(JsonValue.JsonObject obj) {
        if (!(obj.values().get("categories") instanceof JsonValue.JsonArray arr)) {
            throw new IllegalStateException("tarama-policy: 'categories' dizisi zorunlu (fail-closed)");
        }
        Set<ProtectedCategory> seen = new LinkedHashSet<>();
        List<Category> out = new ArrayList<>();
        for (JsonValue item : arr.items()) {
            if (!(item instanceof JsonValue.JsonObject c)) {
                throw new IllegalStateException("tarama-policy: categories öğesi object olmalı");
            }
            requireExactKeys(c, Set.of("code", "terms"), "category");
            ProtectedCategory code = enumValue(ProtectedCategory.class, reqStr(c, "code"));
            if (!seen.add(code)) {
                throw new IllegalStateException("tarama-policy: yinelenen kategori: " + code);
            }
            if (!(c.values().get("terms") instanceof JsonValue.JsonArray termsArr) || termsArr.items().isEmpty()) {
                throw new IllegalStateException("tarama-policy: kategori '" + code + "' terms boş/yanlış (fail-closed)");
            }
            List<Term> terms = new ArrayList<>();
            for (JsonValue t : termsArr.items()) {
                terms.add(parseTerm(t, code));
            }
            out.add(new Category(code, terms));
        }
        // 13-kategori TAM zorunlu: eksik/fazla/unknown → load-time RED (unknown zaten enumValue'da,
        // yinelenen seen.add'de düşer; burada eksik-kategori kapatılır — tek-AGE gibi kısmi policy YASAK).
        if (!seen.equals(EnumSet.allOf(ProtectedCategory.class))) {
            EnumSet<ProtectedCategory> missing = EnumSet.allOf(ProtectedCategory.class);
            missing.removeAll(seen);
            throw new IllegalStateException(
                    "tarama-policy: korumalı-kategori kümesi TAM olmalı (13/13; fail-closed); eksik: " + missing);
        }
        return out;
    }

    private static Term parseTerm(JsonValue t, ProtectedCategory code) {
        if (!(t instanceof JsonValue.JsonObject to)) {
            throw new IllegalStateException("tarama-policy: term object olmalı (kategori " + code + ")");
        }
        Kind kind = enumValue(Kind.class, reqStr(to, "kind"));
        String text = reqStr(to, "text");
        List<String> tokens = tokenizeNormalized(text, "term(" + code + ")");
        int minLen = 0;
        if (kind == Kind.STEM) {
            requireExactKeys(to, Set.of("text", "kind", "minLen"), "STEM term(" + code + ")");
            if (tokens.size() != 1) {
                throw new IllegalStateException("tarama-policy: STEM tek token olmalı: " + text);
            }
            JsonValue mv = to.values().get("minLen");
            if (!(mv instanceof JsonValue.JsonNumber num)) {
                throw new IllegalStateException("tarama-policy: STEM minLen sayı olmalı: " + text);
            }
            minLen = (int) num.value();
            if (minLen < tokens.get(0).length()) {
                throw new IllegalStateException(
                        "tarama-policy: STEM minLen kök uzunluğundan küçük olamaz: " + text);
            }
        } else {
            requireExactKeys(to, Set.of("text", "kind"), kind + " term(" + code + ")");
            if (kind == Kind.WORD && tokens.size() != 1) {
                throw new IllegalStateException("tarama-policy: WORD tek token olmalı: " + text);
            }
            if (kind == Kind.PHRASE && tokens.size() < 2) {
                throw new IllegalStateException("tarama-policy: PHRASE ≥2 token olmalı: " + text);
            }
        }
        return new Term(text, kind, minLen, tokens);
    }

    private static List<List<String>> parsePhraseList(JsonValue.JsonObject obj, String key) {
        List<List<String>> out = new ArrayList<>();
        for (String phrase : reqStrArray(obj, key)) {
            out.add(tokenizeNormalized(phrase, key));
        }
        return out;
    }

    /** Terimi token'lara böler + her token'ı normalize-idempotent (ASCII harf/rakam) doğrular. */
    private static List<String> tokenizeNormalized(String text, String where) {
        if (!text.equals(TextNormalizer.normalize(text).text())) {
            throw new IllegalStateException("tarama-policy: terim normalize-idempotent değil (" + where
                    + "; registry terimleri önceden-normalize saklanmalı): '" + text + "'");
        }
        String[] parts = text.split(" ");
        List<String> tokens = new ArrayList<>();
        for (String p : parts) {
            if (!TOKEN.matcher(p).matches()) {
                throw new IllegalStateException("tarama-policy: geçersiz token '" + p + "' (" + where
                        + "; yalnız [a-z0-9], tek boşluk ayracı): '" + text + "'");
            }
            tokens.add(p);
        }
        if (tokens.isEmpty()) {
            throw new IllegalStateException("tarama-policy: boş terim (" + where + ")");
        }
        return tokens;
    }

    private static void requireExactKeys(JsonValue.JsonObject o, Set<String> allowed, String where) {
        for (String key : o.values().keySet()) {
            if (!allowed.contains(key)) {
                throw new IllegalStateException("tarama-policy: " + where + " bilinmeyen/izinsiz alan '"
                        + key + "' (exact-key şema; fail-closed)");
            }
        }
    }

    private static String reqStr(JsonValue.JsonObject o, String key) {
        if (o.values().get(key) instanceof JsonValue.JsonString s) {
            return s.value();
        }
        throw new IllegalStateException("tarama-policy: zorunlu string alan eksik/yanlış tip: " + key);
    }

    private static List<String> reqStrArray(JsonValue.JsonObject o, String key) {
        if (!(o.values().get(key) instanceof JsonValue.JsonArray a)) {
            throw new IllegalStateException("tarama-policy: '" + key + "' dizisi zorunlu (fail-closed)");
        }
        List<String> out = new ArrayList<>();
        for (JsonValue el : a.items()) {
            if (!(el instanceof JsonValue.JsonString s)) {
                throw new IllegalStateException("tarama-policy: '" + key + "' string eleman içermeli");
            }
            out.add(s.value());
        }
        return out;
    }

    private static <E extends Enum<E>> E enumValue(Class<E> type, String raw) {
        try {
            return Enum.valueOf(type, raw);
        } catch (IllegalArgumentException ex) {
            throw new IllegalStateException("tarama-policy: " + type.getSimpleName()
                    + " kapalı-küme dışı değer (fail-closed): " + raw);
        }
    }
}
