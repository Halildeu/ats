package com.ats.app.web;

import java.util.Map;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Public application contract errors must terminate in MVC instead of being
 * redispatched to the authenticated catch-all error surface.
 */
@RestControllerAdvice(assignableTypes = ApplicationApiController.class)
final class ApplicationApiExceptionHandler {

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<Map<String, String>> malformedJson() {
        return ResponseEntity.badRequest()
                .cacheControl(CacheControl.noStore())
                .body(Map.of(
                        "error", "INVALID_REQUEST",
                        "reason", "istek gövdesi geçersiz veya desteklenmeyen alan içeriyor"));
    }
}
