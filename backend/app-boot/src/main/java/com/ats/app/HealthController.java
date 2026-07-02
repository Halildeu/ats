package com.ats.app;

import java.sql.Connection;
import java.sql.Statement;
import java.util.Map;
import javax.sql.DataSource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Tek endpoint: /healthz (liveness + gerçek DB ping). Veri endpoint'i DEĞİLDİR
 * — kişisel veri/iş verisi taşımaz; authn/z kapısı ilk veri-endpoint dilimiyle
 * gelir. Hata detayı dışarı SIZDIRILMAZ (yalnız durum kelimesi).
 */
@RestController
class HealthController {

    private final DataSource dataSource;

    HealthController(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @GetMapping("/healthz")
    ResponseEntity<Map<String, String>> healthz() {
        try (Connection c = dataSource.getConnection(); Statement st = c.createStatement()) {
            st.execute("SELECT 1");
            return ResponseEntity.ok(Map.of("status", "ok", "db", "ok"));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("status", "degraded", "db", "unavailable"));
        }
    }
}
