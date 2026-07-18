package com.ats.app.web;

import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.util.Map;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

/**
 * Outcome.Fail → HTTP eşlemesi (kapalı tablo; bilinmeyen kod = 500'e yuvarlanmaz,
 * fail-closed 422). Gövde yalnız {error, reason} — stack/iç-detay sızmaz
 * (reason'lar domain'de operatör-okunur kısa metinlerdir, secret taşımaz).
 */
final class OutcomeHttp {

    private OutcomeHttp() {}

    static ResponseEntity<Map<String, String>> fail(Outcome.Fail<?> fail) {
        HttpStatus status = switch (fail.code()) {
            case INVALID -> HttpStatus.BAD_REQUEST;
            case UNAUTHENTICATED -> HttpStatus.UNAUTHORIZED;
            case DENIED, TENANT_SCOPE_VIOLATION -> HttpStatus.FORBIDDEN;
            case NOT_FOUND -> HttpStatus.NOT_FOUND;
            case NOT_CONFIGURED -> HttpStatus.SERVICE_UNAVAILABLE;
            case UNSUPPORTED_IN_GATE -> HttpStatus.CONFLICT;
            case OK -> HttpStatus.UNPROCESSABLE_ENTITY; // Fail(OK) tutarsızlığı: fail-closed
        };
        return ResponseEntity.status(status)
                .cacheControl(CacheControl.noStore())
                .body(Map.of("error", fail.code().name(), "reason", fail.reason()));
    }
}
