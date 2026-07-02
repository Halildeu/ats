package com.ats.app.web;

import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.TenantId;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.jwt.Jwt;

/**
 * Tenant/actor DAİMA doğrulanmış token'dan (ATS-0002: istek gövdesi/path'inden
 * ASLA). SecurityConfig ATS_USER'ı yalnız tenant-claim'li token'a verdiği için
 * buraya tenant'sız akış ulaşamaz; yine de fail-closed guard durur.
 */
final class TenantAccess {

    private TenantAccess() {}

    static TenantId tenant(Authentication auth) {
        String tenant = jwt(auth).getClaimAsString("tenant");
        if (tenant == null || tenant.isBlank()) {
            throw new IllegalStateException("tenant claim yok — SecurityConfig kapısı delinmiş olamaz");
        }
        return new TenantId(tenant);
    }

    static ActorId actor(Authentication auth) {
        String sub = jwt(auth).getSubject();
        if (sub == null || sub.isBlank()) {
            throw new IllegalStateException("sub claim yok");
        }
        return new ActorId(sub);
    }

    private static Jwt jwt(Authentication auth) {
        if (auth == null || !(auth.getPrincipal() instanceof Jwt jwt)) {
            throw new IllegalStateException("JWT principal bekleniyordu");
        }
        return jwt;
    }
}
