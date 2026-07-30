package com.ats.app.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Counts every bounded public attempt before JSON deserialization.
 *
 * <p>Routes are declared as data ({@link #RULES}) rather than as negated boolean
 * conditions. The previous {@code shouldNotFilter} shape — "skip unless POST to
 * one of three paths" — silently left every candidate-credentialled endpoint
 * unlimited: for a GET both negated clauses evaluated true, so the filter never
 * ran. With a resolver, adding an endpoint is a data change, and an endpoint
 * that matches no rule is visibly unlimited rather than accidentally so.
 *
 * <p>Bucket names are constants. Candidate paths carry attacker-controlled
 * segments ({@code publicRef}, {@code offerId}) and those must never reach the
 * bucket key: otherwise a caller mints a fresh bucket per request and defeats
 * the limit outright — the same reason the submission aliases share one bucket.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 30)
final class PublicApplicationRateLimitFilter extends OncePerRequestFilter {

    private static final String SUBMISSION_PATH =
            "/api/v1/(?:jobs/[^/]+|careers/[^/]+/jobs/[^/]+)/applications";
    private static final String RESUME_CREATE_PATH =
            "/api/v1/(?:jobs/[^/]+|careers/[^/]+/jobs/[^/]+)/resume-imports";
    private static final String RESUME_UPLOAD_PATH =
            "/api/v1/candidate/resume-imports/[^/]+/document(?:/replace)?";
    private static final String RESUME_REPLACE_PATH =
            "/api/v1/candidate/resume-imports/[^/]+/document/replace";
    /** Aday kimliğiyle OKUNAN başvuru uçları: durum, görüşme takvimi, teklifler. */
    private static final String CANDIDATE_READ_PATH =
            "/api/v1/candidate/applications/[^/]+(?:/interviews|/offers)?";
    /** Aday kimliğiyle durum DEĞİŞTİREN uçlar: geri çekme, teklif yanıtı. */
    private static final String CANDIDATE_WITHDRAW_PATH =
            "/api/v1/candidate/applications/[^/]+/withdraw";
    private static final String CANDIDATE_OFFER_RESPONSE_PATH =
            "/api/v1/candidate/applications/[^/]+/offers/[^/]+/response";
    /** #235 giriş uçları: kod isteği mail gönderir, doğrulama kod dener. */
    private static final String LOGIN_REQUEST_PATH = "/api/v1/candidate/login/request";
    private static final String LOGIN_VERIFY_PATH = "/api/v1/candidate/login/verify";
    private static final String LOGIN_APPLICATIONS_PATH = "/api/v1/candidate/login/applications";

    static final String SUBMISSION_BUCKET = "public-application-submit";
    static final String CANDIDATE_READ_BUCKET = "candidate-application-read";
    static final String CANDIDATE_MUTATION_BUCKET = "candidate-application-mutate";
    static final String LOGIN_REQUEST_BUCKET = "candidate-login-request";
    static final String LOGIN_VERIFY_BUCKET = "candidate-login-verify";

    /**
     * Okuma bütçesi mutasyondan geniş: portal her yenilemede durum + görüşme +
     * teklif olmak üzere ÜÇ istek atar, dolayısıyla bütçe istek değil yenileme
     * sayısı olarak okunmalı (120 ⇒ ~40 yenileme/10dk). Mutasyon dar: geri
     * çekme ve teklif yanıtı terminal işlemlerdir; tekrar tekrar denenmeleri
     * normal akışın parçası değildir.
     */
    static final int CANDIDATE_READ_LIMIT = 120;
    static final int CANDIDATE_MUTATION_LIMIT = 20;

    /**
     * Giriş bütçeleri (10 dk pencere, IP başına): kod isteği DAR (her istek
     * mail gönderebilir — 10 istek zaten adres-başına DB kotasının üstünde);
     * doğrulama biraz geniş (yanlış kod yazan aday + yeni kod turu), asıl
     * brute-force sınırı challenge'ın DB'deki 5-deneme sayacıdır; oturumla
     * liste okuma portal yenilemesiyle ölçülür, mevcut okuma bütçesini paylaşır.
     */
    static final int LOGIN_REQUEST_LIMIT = 10;
    static final int LOGIN_VERIFY_LIMIT = 30;

    /**
     * @param limitOverride bu uca özel üst sınır; {@code null} ise limiter'ın
     *     YAPILANDIRILMIŞ sınırı ({@code ats.application.rate-limit.limit})
     *     kullanılır. Sabit yazmak bu ayarı sessizce etkisiz kılar: gönderim
     *     ucuna sabit koyduğumda testlerin 100'e yükselttiği sınır 10'a düştü
     *     ve mevcut entegrasyon testleri 429 aldı. Aynı hata canlıda operatörün
     *     sınırı yükseltmesini de sessizce yutardı.
     */
    private record Rule(String method, String pathPattern, String bucket, Integer limitOverride) {
        boolean matches(String requestMethod, String uri) {
            return method.equals(requestMethod) && uri.matches(pathPattern);
        }
    }

    /**
     * Sıra ÖNEMLİ: `/withdraw` ve `/offers/{id}/response` yolları okuma
     * kalıbının prefiksini paylaşır, bu yüzden mutasyon kuralları önce gelir.
     * Yeni uç eklenirken bu listeye satır eklenir.
     *
     * <p>Aday uçları kendi bütçesini taşır; mevcut gönderim/CV uçları
     * yapılandırılmış sınırı korur (davranış değişmez).
     */
    private static final List<Rule> RULES = List.of(
            // Login yolları sabit dizedir (path parametresi yok) — okuma
            // kalıbıyla prefix çakışması olmadığı için sıra serbest; yine de
            // mutasyon bloğunun başında dursunlar ki kalıp korunmuş kalsın.
            new Rule("POST", LOGIN_REQUEST_PATH, LOGIN_REQUEST_BUCKET, LOGIN_REQUEST_LIMIT),
            new Rule("POST", LOGIN_VERIFY_PATH, LOGIN_VERIFY_BUCKET, LOGIN_VERIFY_LIMIT),
            new Rule("GET", LOGIN_APPLICATIONS_PATH, CANDIDATE_READ_BUCKET,
                    CANDIDATE_READ_LIMIT),
            new Rule("PUT", CANDIDATE_WITHDRAW_PATH, CANDIDATE_MUTATION_BUCKET,
                    CANDIDATE_MUTATION_LIMIT),
            new Rule("POST", CANDIDATE_OFFER_RESPONSE_PATH, CANDIDATE_MUTATION_BUCKET,
                    CANDIDATE_MUTATION_LIMIT),
            new Rule("GET", CANDIDATE_READ_PATH, CANDIDATE_READ_BUCKET, CANDIDATE_READ_LIMIT),
            new Rule("POST", SUBMISSION_PATH, SUBMISSION_BUCKET, null),
            new Rule("POST", RESUME_CREATE_PATH, "public-resume-import-create", null),
            new Rule("POST", RESUME_REPLACE_PATH, "public-resume-import-replace", null),
            new Rule("POST", RESUME_UPLOAD_PATH, "public-resume-import-upload", null),
            new Rule("PUT", RESUME_UPLOAD_PATH, "public-resume-import-upload", null));

    private final PublicApplicationRateLimiter limiter;

    PublicApplicationRateLimitFilter(PublicApplicationRateLimiter limiter) {
        this.limiter = limiter;
    }

    private static Rule ruleFor(HttpServletRequest request) {
        String method = request.getMethod();
        String uri = request.getRequestURI();
        for (Rule rule : RULES) {
            if (rule.matches(method, uri)) return rule;
        }
        return null;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return ruleFor(request) == null;
    }

    private boolean allow(HttpServletRequest request, Rule rule) {
        String address = request.getRemoteAddr();
        return rule.limitOverride() == null
                ? limiter.allow(address, rule.bucket())
                : limiter.allow(address, rule.bucket(), rule.limitOverride());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
            FilterChain chain) throws ServletException, IOException {
        Rule rule = ruleFor(request);
        // `shouldNotFilter` zaten süzdü; yine de null-güvenli kal, filtre başka
        // bir zincirden çağrılırsa sessiz NPE yerine geçiş olsun.
        if (rule != null && !allow(request, rule)) {
            response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
            response.setHeader("Retry-After", "600");
            response.setHeader("Cache-Control", CacheControl.noStore().getHeaderValue());
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.getWriter().write(
                    "{\"error\":\"RATE_LIMITED\",\"reason\":\"daha sonra tekrar deneyin\"}");
            return;
        }
        chain.doFilter(request, response);
    }
}
