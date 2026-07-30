package com.ats.app.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class PublicApplicationRateLimitFilterTest {

    @Test
    void counts_attempts_before_deserialization_and_returns_no_store_429() throws Exception {
        var limiter = new PublicApplicationRateLimiter(
                Clock.fixed(Instant.parse("2026-07-16T12:00:00Z"), ZoneOffset.UTC));
        var filter = new PublicApplicationRateLimitFilter(limiter);

        for (int i = 0; i < PublicApplicationRateLimiter.LIMIT; i++) {
            var response = new MockHttpServletResponse();
            filter.doFilter(request("/api/v1/jobs/product-designer/applications"),
                    response, new MockFilterChain());
            assertEquals(200, response.getStatus());
        }

        var denied = new MockHttpServletResponse();
        filter.doFilter(request("/api/v1/jobs/product-designer/applications"),
                denied, new MockFilterChain());
        assertEquals(429, denied.getStatus());
        assertEquals("600", denied.getHeader("Retry-After"));
        assertEquals("no-store", denied.getHeader("Cache-Control"));
        assertTrue(denied.getContentAsString().contains("RATE_LIMITED"));
    }

    @Test
    void alias_and_canonical_routes_share_one_bounded_bucket() throws Exception {
        var limiter = new PublicApplicationRateLimiter(
                Clock.fixed(Instant.parse("2026-07-16T12:00:00Z"), ZoneOffset.UTC));
        var filter = new PublicApplicationRateLimitFilter(limiter);

        for (int i = 0; i < PublicApplicationRateLimiter.LIMIT - 1; i++) {
            filter.doFilter(request("/api/v1/jobs/product-designer/applications"),
                    new MockHttpServletResponse(), new MockFilterChain());
        }
        var canonicalAllowed = new MockHttpServletResponse();
        filter.doFilter(request("/api/v1/careers/acik/jobs/product-designer/applications"),
                canonicalAllowed, new MockFilterChain());
        assertEquals(200, canonicalAllowed.getStatus());

        var denied = new MockHttpServletResponse();
        filter.doFilter(request("/api/v1/careers/another/jobs/another/applications"),
                denied, new MockFilterChain());
        assertEquals(429, denied.getStatus());
    }

    @Test
    void candidate_reads_are_counted_at_all() throws Exception {
        // Kusur buydu: `shouldNotFilter` "POST değilse atla" diyordu, dolayısıyla
        // aday kimlikli GET uçları HİÇ sayılmıyordu — sınırsızdı.
        var filter = filterAt("2026-07-16T12:00:00Z");
        String uri = "/api/v1/candidate/applications/app_abcdefghijklmnopqrstuvwx";

        for (int i = 0; i < PublicApplicationRateLimitFilter.CANDIDATE_READ_LIMIT; i++) {
            var allowed = new MockHttpServletResponse();
            filter.doFilter(request("GET", uri), allowed, new MockFilterChain());
            assertEquals(200, allowed.getStatus(), "sınır altındaki okuma geçmeli");
        }
        var denied = new MockHttpServletResponse();
        filter.doFilter(request("GET", uri), denied, new MockFilterChain());
        assertEquals(429, denied.getStatus());
        assertEquals("600", denied.getHeader("Retry-After"));
        assertEquals("no-store", denied.getHeader("Cache-Control"));
        assertTrue(denied.getContentAsString().contains("RATE_LIMITED"));
    }

    @Test
    void attacker_controlled_public_ref_cannot_mint_a_fresh_bucket() throws Exception {
        // Yol parçası kova anahtarına girerse saldırgan her istekte yeni kova
        // açar ve sınır tamamen etkisiz kalır — gönderim aliaslarındaki dersin
        // aynısı, burada `publicRef` üzerinden.
        var filter = filterAt("2026-07-16T12:00:00Z");
        for (int i = 0; i < PublicApplicationRateLimitFilter.CANDIDATE_READ_LIMIT; i++) {
            filter.doFilter(
                    request("GET", "/api/v1/candidate/applications/app_" + "a".repeat(20) + i),
                    new MockHttpServletResponse(), new MockFilterChain());
        }
        var denied = new MockHttpServletResponse();
        filter.doFilter(request("GET", "/api/v1/candidate/applications/app_bambaskabirreferans"),
                denied, new MockFilterChain());
        assertEquals(429, denied.getStatus(), "farklı referans aynı kovayı paylaşmalı");
    }

    @Test
    void the_three_portal_reads_share_one_bucket() throws Exception {
        // Portal bir yenilemede durum + görüşme + teklif okur. Üçü ayrı kova
        // olursa bütçe fiilen üçe katlanır.
        var filter = filterAt("2026-07-16T12:00:00Z");
        String base = "/api/v1/candidate/applications/app_abcdefghijklmnopqrstuvwx";
        String[] paths = {base, base + "/interviews", base + "/offers"};
        for (int i = 0; i < PublicApplicationRateLimitFilter.CANDIDATE_READ_LIMIT; i++) {
            filter.doFilter(request("GET", paths[i % paths.length]),
                    new MockHttpServletResponse(), new MockFilterChain());
        }
        var denied = new MockHttpServletResponse();
        filter.doFilter(request("GET", base + "/offers"), denied, new MockFilterChain());
        assertEquals(429, denied.getStatus());
    }

    @Test
    void mutation_budget_is_independent_of_the_read_budget() throws Exception {
        // Tek global bütçe ikisini birbirine bağlardı: okumayla tükenen bütçe
        // adayın başvurusunu geri çekmesini engellerdi.
        var filter = filterAt("2026-07-16T12:00:00Z");
        String base = "/api/v1/candidate/applications/app_abcdefghijklmnopqrstuvwx";

        for (int i = 0; i < PublicApplicationRateLimitFilter.CANDIDATE_READ_LIMIT + 5; i++) {
            filter.doFilter(request("GET", base), new MockHttpServletResponse(),
                    new MockFilterChain());
        }
        var withdrawAllowed = new MockHttpServletResponse();
        filter.doFilter(request("PUT", base + "/withdraw"), withdrawAllowed, new MockFilterChain());
        assertEquals(200, withdrawAllowed.getStatus(), "okuma bütçesi mutasyonu tüketmemeli");

        for (int i = 1; i < PublicApplicationRateLimitFilter.CANDIDATE_MUTATION_LIMIT; i++) {
            filter.doFilter(request("PUT", base + "/withdraw"), new MockHttpServletResponse(),
                    new MockFilterChain());
        }
        var withdrawDenied = new MockHttpServletResponse();
        filter.doFilter(request("PUT", base + "/withdraw"), withdrawDenied, new MockFilterChain());
        assertEquals(429, withdrawDenied.getStatus());
    }

    @Test
    void withdraw_and_offer_response_share_the_mutation_bucket() throws Exception {
        var filter = filterAt("2026-07-16T12:00:00Z");
        String base = "/api/v1/candidate/applications/app_abcdefghijklmnopqrstuvwx";
        String offerResponse = base + "/offers/off_abcdefghijklmnopqrstuvwx/response";

        for (int i = 0; i < PublicApplicationRateLimitFilter.CANDIDATE_MUTATION_LIMIT; i++) {
            filter.doFilter(request("PUT", base + "/withdraw"), new MockHttpServletResponse(),
                    new MockFilterChain());
        }
        var denied = new MockHttpServletResponse();
        filter.doFilter(request("POST", offerResponse), denied, new MockFilterChain());
        assertEquals(429, denied.getStatus(), "iki mutasyon ucu tek bütçeyi paylaşmalı");
    }

    @Test
    void submission_budget_is_untouched_by_candidate_traffic() throws Exception {
        // Gönderim sınırı 10/10dk; aday okumaları onu tüketirse ilk başvuru
        // reddedilirdi. Regresyon guard'ı.
        var filter = filterAt("2026-07-16T12:00:00Z");
        String base = "/api/v1/candidate/applications/app_abcdefghijklmnopqrstuvwx";
        for (int i = 0; i < PublicApplicationRateLimitFilter.CANDIDATE_READ_LIMIT; i++) {
            filter.doFilter(request("GET", base), new MockHttpServletResponse(),
                    new MockFilterChain());
        }
        var submitAllowed = new MockHttpServletResponse();
        filter.doFilter(request("POST", "/api/v1/jobs/product-designer/applications"),
                submitAllowed, new MockFilterChain());
        assertEquals(200, submitAllowed.getStatus());
    }

    @Test
    void pre_existing_endpoints_still_honour_the_configured_limit() throws Exception {
        // Kural tablosuna geçerken gönderim ucuna SABİT sınır yazmıştım; bu,
        // `ats.application.rate-limit.limit` ayarını sessizce etkisiz kıldı
        // (testler 100'e yükseltiyor, sabit 10'a düşürdü → mevcut entegrasyon
        // testleri 429 aldı). Canlıda da operatörün sınır yükseltmesini yutardı.
        int configured = 3;
        var limiter = new PublicApplicationRateLimiter(
                Clock.fixed(Instant.parse("2026-07-16T12:00:00Z"), ZoneOffset.UTC), configured);
        var filter = new PublicApplicationRateLimitFilter(limiter);

        for (int i = 0; i < configured; i++) {
            var allowed = new MockHttpServletResponse();
            filter.doFilter(request("/api/v1/jobs/product-designer/applications"), allowed,
                    new MockFilterChain());
            assertEquals(200, allowed.getStatus(), "yapılandırılmış sınır altı geçmeli");
        }
        var denied = new MockHttpServletResponse();
        filter.doFilter(request("/api/v1/jobs/product-designer/applications"), denied,
                new MockFilterChain());
        assertEquals(429, denied.getStatus(), "yapılandırılmış sınır uygulanmalı");

        // Aday uçları kendi bütçesini taşır: yapılandırılmış 3 onları bağlamaz.
        var candidateRead = new MockHttpServletResponse();
        filter.doFilter(request("GET", "/api/v1/candidate/applications/app_abcdefghijklmnopqrstuvwx"),
                candidateRead, new MockFilterChain());
        assertEquals(200, candidateRead.getStatus());
    }

    @Test
    void unmatched_routes_still_pass_through_untouched() throws Exception {
        // Kural tablosu kapsam dışını KAPATMAZ; İK ve sağlık uçları JWT/authz
        // ile korunur, bu filtre onları saymamalı.
        var filter = filterAt("2026-07-16T12:00:00Z");
        for (String uri : new String[] {
                "/api/v1/recruiter/applications", "/actuator/health",
                "/api/v1/candidate/resume-imports/imp_abcdefghijklmnopqrstuvwx"}) {
            var response = new MockHttpServletResponse();
            filter.doFilter(request("GET", uri), response, new MockFilterChain());
            assertEquals(200, response.getStatus(), uri + " sayılmamalı");
        }
    }

    @Test
    void login_request_and_verify_have_separate_budgets() throws Exception {
        // #235: kod isteği her seferinde mail gönderebilir (dar bütçe),
        // doğrulama göndermez (geniş bütçe). Tek kova olsaydı doğrulama
        // denemeleri adayın yeni-kod isteme hakkını yerdi.
        //
        // ÖLÇÜM YÖNÜ ÖNEMLİ: önce GENİŞ bütçeyi doldur, sonra DAR ucu dene.
        // Ters yön (10 istek + 1 doğrulama) paylaşılan kovada da geçer, çünkü
        // 11 < 30; o test kova birleştirmesini yakalamıyordu.
        var filter = filterAt("2026-07-28T12:00:00Z");
        String requestPath = "/api/v1/candidate/login/request";
        String verifyPath = "/api/v1/candidate/login/verify";

        for (int i = 0; i < PublicApplicationRateLimitFilter.LOGIN_VERIFY_LIMIT; i++) {
            var allowed = new MockHttpServletResponse();
            filter.doFilter(request("POST", verifyPath), allowed, new MockFilterChain());
            assertEquals(200, allowed.getStatus(), "sınır altındaki doğrulama geçmeli");
        }
        var deniedVerify = new MockHttpServletResponse();
        filter.doFilter(request("POST", verifyPath), deniedVerify, new MockFilterChain());
        assertEquals(429, deniedVerify.getStatus(), "doğrulama bütçesi sınırlı olmalı");

        // Doğrulama kovası dolu; kod isteği taze kovadan geçmeli.
        var requestAllowed = new MockHttpServletResponse();
        filter.doFilter(request("POST", requestPath), requestAllowed, new MockFilterChain());
        assertEquals(200, requestAllowed.getStatus(),
                "doğrulama bütçesi kod isteğini tüketmemeli");
    }

    @Test
    void login_verify_is_bounded_too() throws Exception {
        var filter = filterAt("2026-07-28T12:00:00Z");
        String verifyPath = "/api/v1/candidate/login/verify";
        for (int i = 0; i < PublicApplicationRateLimitFilter.LOGIN_VERIFY_LIMIT; i++) {
            filter.doFilter(request("POST", verifyPath), new MockHttpServletResponse(),
                    new MockFilterChain());
        }
        var denied = new MockHttpServletResponse();
        filter.doFilter(request("POST", verifyPath), denied, new MockFilterChain());
        assertEquals(429, denied.getStatus());
        assertTrue(denied.getContentAsString().contains("RATE_LIMITED"));
    }

    @Test
    void login_application_list_shares_the_candidate_read_budget() throws Exception {
        // Oturumla liste okuma da portal yenilemesi; ayrı kova bütçeyi ikiye
        // katlardı.
        var filter = filterAt("2026-07-28T12:00:00Z");
        String base = "/api/v1/candidate/applications/app_abcdefghijklmnopqrstuvwx";
        for (int i = 0; i < PublicApplicationRateLimitFilter.CANDIDATE_READ_LIMIT; i++) {
            filter.doFilter(request("GET", base), new MockHttpServletResponse(),
                    new MockFilterChain());
        }
        var denied = new MockHttpServletResponse();
        filter.doFilter(request("GET", "/api/v1/candidate/login/applications"), denied,
                new MockFilterChain());
        assertEquals(429, denied.getStatus(), "giriş listesi okuma kovasını paylaşmalı");
    }

    private static PublicApplicationRateLimitFilter filterAt(String instant) {
        return new PublicApplicationRateLimitFilter(new PublicApplicationRateLimiter(
                Clock.fixed(Instant.parse(instant), ZoneOffset.UTC)));
    }

    private static MockHttpServletRequest request(String uri) {
        return request("POST", uri);
    }

    private static MockHttpServletRequest request(String method, String uri) {
        var request = new MockHttpServletRequest(method, uri);
        request.setRemoteAddr("203.0.113.10");
        return request;
    }
}
