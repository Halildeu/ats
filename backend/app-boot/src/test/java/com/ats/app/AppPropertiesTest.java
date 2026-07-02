package com.ats.app;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.time.Duration;
import org.junit.jupiter.api.Test;

/** Fail-closed konfig sözleşmesi: eksik/boş zorunlu değer = startup düşer, sessiz default yok. */
class AppPropertiesTest {

    @Test
    void missing_db_url_fails_closed() {
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> new AppProperties.Db("", "u", "p"));
        assertEquals(true, ex.getMessage().contains("ats.db.url"));
    }

    @Test
    void missing_db_password_fails_closed() {
        assertThrows(IllegalStateException.class, () -> new AppProperties.Db("jdbc:x", "u", null));
    }

    @Test
    void missing_ai_base_url_fails_closed() {
        assertThrows(IllegalStateException.class, () -> new AppProperties.Ai("", null, null));
    }

    @Test
    void blank_bearer_normalizes_to_null_and_timeout_defaults() {
        AppProperties.Ai ai = new AppProperties.Ai("http://ai.local", "  ", null);
        assertNull(ai.bearer());
        assertEquals(Duration.ofSeconds(30), ai.timeout());
    }
}
