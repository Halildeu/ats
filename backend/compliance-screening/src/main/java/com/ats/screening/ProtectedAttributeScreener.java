package com.ats.screening;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;

/**
 * Deterministik LEKSİK korumalı-özellik + soru-kalıbı tarayıcısının SAF ÇEKİRDEĞİ. Aday hakkında
 * HÜKÜM VERMEZ (score/outcome/recommendation YAPISAL olarak yok); yalnız İNSAN-reviewer için
 * compliance SİNYALİ üretir.
 *
 * <p>Akış: normalize (orijinal-ofset eşlemeli) → safe-phrase neutralize (token-index) → registry
 * leksik eşleşme (WORD/PHRASE/STEM, token-sınırlı) → sinyal (soru-kalıbı: '?' VEYA soru-ipucu;
 * <b>soru-işareti-tek-başına-yeterli-değil; STT-noktalama-yokluğu ≠ CLEAR</b>) → span'ler ORİJİNAL
 * ofsete çevrilir → aynı-kategori içerilen-span'ler ayıklanır → deterministik sıralama.
 *
 * <p>Kapsam (fail-closed): {@code POLICY_UNAVAILABLE} (policy yok) / {@code MALFORMED_INPUT}
 * (null/eşsiz-surrogate/kontrol-karakteri/aşırı-uzun) / {@code UNSUPPORTED_LANGUAGE} (BEYAN edilen
 * dil base-tag'i desteklenmez — null/blank/diğer; VEYA base-tag tr/en olsa bile metnin BASKIN yazımı
 * Latin değil) / {@code SUPPORTED}. SUPPORTED dışında bulgu-boş olsa da sonuç TEMİZ değildir.
 *
 * <p><b>fuzzy/edit-distance/ML YOK</b> (kontrollü stem/prefix hariç genel-stemming YOK).
 * "tüm-ihlalleri-yakalar" gibi bir iddia/isim YOKTUR — kapsam registry ile sınırlıdır.
 */
public final class ProtectedAttributeScreener {

    /** Bir policy YÜKLENEMEDİĞİNDE sonuçta taşınan rezerve sentinel (gerçek policy'ler v1+). */
    static final ScreeningPolicyRef POLICY_UNAVAILABLE_REF = new ScreeningPolicyRef("paspolicy_v0");

    private static final int MAX_INPUT_CHARS = 200_000;

    private final ScreeningPolicy policy; // null => POLICY_UNAVAILABLE
    /** Desteklenen dil BASE-tag'leri (policy.supportedLanguages'ten türetilir); policy yoksa boş. */
    private final Set<String> supportedBaseTags;

    private ProtectedAttributeScreener(ScreeningPolicy policy) {
        this.policy = policy;
        this.supportedBaseTags = policy == null ? Set.of() : deriveBaseTags(policy.supportedLanguages());
    }

    private static Set<String> deriveBaseTags(Set<String> supportedLanguages) {
        Set<String> bases = new LinkedHashSet<>();
        for (String lang : supportedLanguages) {
            String base = baseTag(lang);
            if (base != null) {
                bases.add(base);
            }
        }
        return Set.copyOf(bases);
    }

    /** Yüklü policy ile tarayıcı. */
    public static ProtectedAttributeScreener withPolicy(ScreeningPolicy policy) {
        return new ProtectedAttributeScreener(Objects.requireNonNull(policy, "policy"));
    }

    /** Classpath kaynağından fail-closed yükler (kaynak yoksa/bozuksa yükleme düşer). */
    public static ProtectedAttributeScreener fromClasspath(String resourcePath) {
        return new ProtectedAttributeScreener(ScreeningPolicy.fromClasspath(resourcePath));
    }

    /** Policy erişilemez tarayıcı: her tarama {@code POLICY_UNAVAILABLE} döndürür (asla sessiz-temiz). */
    public static ProtectedAttributeScreener unavailable() {
        return new ProtectedAttributeScreener(null);
    }

    /**
     * Segment bağlamı olmayan tek-string taraması. {@code languageTag} çağıranın BEYAN ettiği dil
     * (BCP-47; örn. {@code tr}, {@code tr-TR}, {@code en-US}); base-tag policy'nin desteklediği
     * diller kümesinde değilse {@code UNSUPPORTED_LANGUAGE}.
     */
    public ScreeningResult screen(String text, ScreeningSourceKind sourceKind, String languageTag) {
        return screenSegment(text, sourceKind, languageTag, null);
    }

    /** Segment bağlamlı tarama ({@code segmentIndex} span'lere taşınır). */
    public ScreeningResult screenSegment(String text, ScreeningSourceKind sourceKind, String languageTag,
            Integer segmentIndex) {
        Objects.requireNonNull(sourceKind, "sourceKind");
        if (segmentIndex != null && segmentIndex < 0) {
            throw new IllegalArgumentException("segmentIndex < 0: " + segmentIndex);
        }
        ScreeningRunId runId = ScreeningRunId.random();

        if (policy == null) {
            return build(runId, POLICY_UNAVAILABLE_REF, Coverage.POLICY_UNAVAILABLE, List.of());
        }
        ScreeningPolicyRef ref = policy.policyRef();
        if (isMalformed(text)) {
            return build(runId, ref, Coverage.MALFORMED_INPUT, List.of());
        }
        // (1) BEYAN edilen dil ekseni: base-tag policy'nin desteklediği dillerde mi (null/blank/diğer → RED).
        if (!isSupportedBaseTag(languageTag)) {
            return build(runId, ref, Coverage.UNSUPPORTED_LANGUAGE, List.of());
        }
        TextNormalizer.Normalized norm = TextNormalizer.normalize(text);
        // (2) BASKIN-YAZIM ekseni: base-tag tr/en olsa BİLE metnin baskın yazımı Latin değilse → RED.
        if (isDominantScriptNonLatin(norm.text())) {
            return build(runId, ref, Coverage.UNSUPPORTED_LANGUAGE, List.of());
        }
        List<ScreeningFinding> findings = scan(norm, sourceKind, segmentIndex);
        return build(runId, ref, Coverage.SUPPORTED, findings);
    }

    // ---- çekirdek tarama ----

    private List<ScreeningFinding> scan(TextNormalizer.Normalized norm, ScreeningSourceKind sourceKind,
            Integer segmentIndex) {
        String text = norm.text();
        List<Token> tokens = tokenize(text);
        boolean[] neutral = neutralize(tokens, policy.safePhrases());

        List<ScreeningFinding> raw = new ArrayList<>();
        for (ScreeningPolicy.Category cat : policy.categories()) {
            for (ScreeningPolicy.Term term : cat.terms()) {
                collectTerm(cat.code(), term, tokens, neutral, norm, text, sourceKind, segmentIndex, raw);
            }
        }
        return dedupeAndOrder(raw);
    }

    private void collectTerm(ProtectedCategory category, ScreeningPolicy.Term term, List<Token> tokens,
            boolean[] neutral, TextNormalizer.Normalized norm, String text, ScreeningSourceKind sourceKind,
            Integer segmentIndex, List<ScreeningFinding> out) {
        switch (term.kind()) {
            case WORD -> {
                String w = term.tokens().get(0);
                for (int i = 0; i < tokens.size(); i++) {
                    if (neutral[i]) {
                        continue;
                    }
                    if (tokens.get(i).text().equals(w)) {
                        emit(category, tokens.get(i).start(), tokens.get(i).end(), tokens, norm, text,
                                sourceKind, segmentIndex, out);
                    }
                }
            }
            case STEM -> {
                String stem = term.tokens().get(0);
                for (int i = 0; i < tokens.size(); i++) {
                    if (neutral[i]) {
                        continue;
                    }
                    String tt = tokens.get(i).text();
                    if (tt.length() >= term.minLen() && tt.startsWith(stem)
                            && remainderAllAsciiLetters(tt, stem.length())) {
                        emit(category, tokens.get(i).start(), tokens.get(i).end(), tokens, norm, text,
                                sourceKind, segmentIndex, out);
                    }
                }
            }
            case PHRASE -> {
                List<String> parts = term.tokens();
                int k = parts.size();
                for (int i = 0; i + k <= tokens.size(); i++) {
                    boolean all = true;
                    for (int j = 0; j < k; j++) {
                        if (neutral[i + j] || !tokens.get(i + j).text().equals(parts.get(j))) {
                            all = false;
                            break;
                        }
                    }
                    if (all) {
                        emit(category, tokens.get(i).start(), tokens.get(i + k - 1).end(), tokens, norm, text,
                                sourceKind, segmentIndex, out);
                    }
                }
            }
        }
    }

    private void emit(ProtectedCategory category, int normStart, int normEnd, List<Token> tokens,
            TextNormalizer.Normalized norm, String text, ScreeningSourceKind sourceKind, Integer segmentIndex,
            List<ScreeningFinding> out) {
        ScreeningSignal signal = isInterrogative(text, tokens, normStart, normEnd)
                ? ScreeningSignal.QUESTION_LIKE_PROTECTED_MENTION
                : ScreeningSignal.PROTECTED_ATTRIBUTE_MENTION;
        TextSpan span = norm.toOriginalSpan(normStart, normEnd, segmentIndex);
        out.add(new ScreeningFinding(category, signal, sourceKind, span));
    }

    /**
     * Eşleşmenin bulunduğu CÜMLE bir soru-kalıbı mı: (a) cümle sonu terminatörü '?' VEYA (b) cümle
     * içinde bir soru-ipucu (registry questionCues). '?' tek başına yeterli değildir (b de sağlar);
     * '?' YOKLUĞU cümleyi CLEAR yapmaz (STT noktalama düşürebilir) — ipucu yine QUESTION_LIKE üretir.
     */
    private boolean isInterrogative(String text, List<Token> tokens, int matchStart, int matchEnd) {
        int sStart = sentenceStart(text, matchStart);
        int bnd = sentenceBoundary(text, matchEnd);
        if (bnd < text.length() && text.charAt(bnd) == '?') {
            return true;
        }
        return hasCueInRange(tokens, policy.questionCues(), sStart, bnd);
    }

    // ---- dedupe + sıralama ----

    private static List<ScreeningFinding> dedupeAndOrder(List<ScreeningFinding> raw) {
        // aynı-kategori içerilen (strictly-contained) span'leri ayıkla (maksimal anım kalsın)
        List<ScreeningFinding> kept = new ArrayList<>();
        for (ScreeningFinding f : raw) {
            boolean contained = false;
            for (ScreeningFinding g : raw) {
                if (f == g || g.category() != f.category()) {
                    continue;
                }
                if (containsStrictly(g.span(), f.span())) {
                    contained = true;
                    break;
                }
            }
            if (!contained) {
                kept.add(f);
            }
        }
        // exact dedupe (category+signal+span)
        Set<String> seen = new LinkedHashSet<>();
        List<ScreeningFinding> unique = new ArrayList<>();
        for (ScreeningFinding f : kept) {
            String key = f.category() + "|" + f.signal() + "|" + f.span().startInclusive()
                    + "|" + f.span().endExclusive() + "|" + f.span().segmentIndex();
            if (seen.add(key)) {
                unique.add(f);
            }
        }
        unique.sort(Comparator
                .comparingInt((ScreeningFinding f) -> f.span().startInclusive())
                .thenComparingInt(f -> f.span().endExclusive())
                .thenComparingInt(f -> f.category().ordinal())
                .thenComparingInt(f -> f.signal().ordinal()));
        return unique;
    }

    private static boolean containsStrictly(TextSpan outer, TextSpan inner) {
        boolean within = outer.startInclusive() <= inner.startInclusive()
                && outer.endExclusive() >= inner.endExclusive();
        boolean strictlyLarger = (outer.endExclusive() - outer.startInclusive())
                > (inner.endExclusive() - inner.startInclusive());
        return within && strictlyLarger;
    }

    // ---- coverage ön-kontroller ----

    private static boolean isMalformed(String text) {
        if (text == null || text.length() > MAX_INPUT_CHARS) {
            return true;
        }
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (Character.isHighSurrogate(c)) {
                if (i + 1 >= text.length() || !Character.isLowSurrogate(text.charAt(i + 1))) {
                    return true; // eşsiz yüksek surrogate
                }
                i++; // geçerli çifti atla
                continue;
            }
            if (Character.isLowSurrogate(c)) {
                return true; // eşsiz düşük surrogate
            }
            if (c == '\t' || c == '\n' || c == '\r') {
                continue;
            }
            if (c < 0x20 || c == 0x7F || (c >= 0x80 && c <= 0x9F)) {
                return true; // C0/C1 kontrol karakteri (izinli whitespace hariç)
            }
        }
        return false;
    }

    /** Beyan edilen dil base-tag'i policy'nin desteklediği dillerde mi (null/blank/diğer → false). */
    private boolean isSupportedBaseTag(String languageTag) {
        String base = baseTag(languageTag);
        return base != null && supportedBaseTags.contains(base);
    }

    /**
     * BCP-47 base (primary) subtag'i küçük-harf döndürür: ilk {@code '-'} öncesi (yoksa tümü),
     * trim + {@link Locale#ROOT} küçük-harf. null/blank/boş-base → null (fail-closed).
     */
    private static String baseTag(String languageTag) {
        if (languageTag == null) {
            return null;
        }
        String t = languageTag.trim();
        if (t.isEmpty()) {
            return null;
        }
        int dash = t.indexOf('-');
        String base = (dash >= 0 ? t.substring(0, dash) : t).toLowerCase(Locale.ROOT);
        return base.isEmpty() ? null : base;
    }

    /**
     * BASKIN-yazım Latin dışı mı: normalize-metindeki NON-Latin harf sayısı Latin (a-z) harf
     * sayısından KESİN olarak fazlaysa true (gerçek baskınlık ölçümü; "hiç-Latin-yok" değil — tek
     * bir Latin karakter Arapça/Kiril baskın bir metni desteklenir yapmaz). Harf yoksa false.
     */
    private static boolean isDominantScriptNonLatin(String norm) {
        int latin = 0;
        int other = 0;
        int i = 0;
        int n = norm.length();
        while (i < n) {
            int cp = norm.codePointAt(i);
            i += Character.charCount(cp);
            if (cp >= 'a' && cp <= 'z') {
                latin++;
            } else if (Character.isLetter(cp)) {
                other++;
            }
        }
        return other > latin;
    }

    // ---- token yardımcıları ----

    private record Token(int start, int end, String text) {}

    private static List<Token> tokenize(String norm) {
        List<Token> tokens = new ArrayList<>();
        int i = 0;
        int n = norm.length();
        while (i < n) {
            int cp = norm.codePointAt(i);
            if (Character.isLetterOrDigit(cp)) {
                int start = i;
                while (i < n) {
                    int c = norm.codePointAt(i);
                    if (!Character.isLetterOrDigit(c)) {
                        break;
                    }
                    i += Character.charCount(c);
                }
                tokens.add(new Token(start, i, norm.substring(start, i)));
            } else {
                i += Character.charCount(cp);
            }
        }
        return tokens;
    }

    private static boolean[] neutralize(List<Token> tokens, List<List<String>> safePhrases) {
        boolean[] neutral = new boolean[tokens.size()];
        for (List<String> phrase : safePhrases) {
            int k = phrase.size();
            for (int i = 0; i + k <= tokens.size(); i++) {
                boolean all = true;
                for (int j = 0; j < k; j++) {
                    if (!tokens.get(i + j).text().equals(phrase.get(j))) {
                        all = false;
                        break;
                    }
                }
                if (all) {
                    for (int j = 0; j < k; j++) {
                        neutral[i + j] = true;
                    }
                }
            }
        }
        return neutral;
    }

    private static boolean remainderAllAsciiLetters(String token, int from) {
        for (int i = from; i < token.length(); i++) {
            char c = token.charAt(i);
            if (c < 'a' || c > 'z') {
                return false;
            }
        }
        return true;
    }

    private static int sentenceStart(String text, int pos) {
        int i = pos - 1;
        while (i >= 0) {
            char c = text.charAt(i);
            if (c == '.' || c == '?' || c == '!' || c == '\n') {
                return i + 1;
            }
            i--;
        }
        return 0;
    }

    private static int sentenceBoundary(String text, int pos) {
        int i = pos;
        int n = text.length();
        while (i < n) {
            char c = text.charAt(i);
            if (c == '.' || c == '?' || c == '!' || c == '\n') {
                return i;
            }
            i++;
        }
        return n;
    }

    private static boolean hasCueInRange(List<Token> tokens, List<List<String>> cues, int sStart, int sEnd) {
        List<Integer> idx = new ArrayList<>();
        for (int i = 0; i < tokens.size(); i++) {
            Token t = tokens.get(i);
            if (t.start() >= sStart && t.end() <= sEnd) {
                idx.add(i);
            }
        }
        for (List<String> cue : cues) {
            int k = cue.size();
            for (int p = 0; p + k <= idx.size(); p++) {
                boolean all = true;
                boolean contiguous = true;
                for (int j = 0; j < k; j++) {
                    if (!tokens.get(idx.get(p + j)).text().equals(cue.get(j))) {
                        all = false;
                        break;
                    }
                    if (j > 0 && idx.get(p + j) != idx.get(p + j - 1) + 1) {
                        contiguous = false;
                    }
                }
                if (all && contiguous) {
                    return true;
                }
            }
        }
        return false;
    }

    private static ScreeningResult build(ScreeningRunId runId, ScreeningPolicyRef ref, Coverage coverage,
            List<ScreeningFinding> findings) {
        // FindingSetRef KRİPTOGRAFİK-RASTGELE opaktır (içerik-adresli DEĞİL): her tarama YENİ ref
        // (çapraz-aday linkability + boş-sonuç çakışması + WORM'a hassas-hash engeli). Bulgu-içerik
        // özeti gerekiyorsa 156-b restricted-store'un konusudur; Result/WORM işaretçisi taşımaz.
        return new ScreeningResult(runId, ref, coverage, findings, FindingSetRef.random());
    }
}
