package com.ats.app.web;

import com.ats.app.AppProperties;
import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.TenantId;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;

/**
 * Tenant/actor DAİMA doğrulanmış token'dan (ATS-0002: istek gövdesi/path/header'dan
 * ASLA). Tenant claim ADI configurable (ATS-0019 slice-39b: platform-KC token'ında
 * farklı olabilir, ör. {@code tenant_id}); SecurityConfig authority-derivation'ı ile
 * AYNI config'i kullanır (uçtan uca tutarlı — biri authority verip diğeri tenant'ı
 * bulamama durumu YAPISAL OLARAK imkânsız). YALNIZ configured JWT claim'i okunur;
 * fallback claim adı YOK. SecurityConfig ATS_USER'ı yalnız tenant-claim'li token'a
 * verdiği için buraya tenant'sız akış ulaşamaz; yine de fail-closed guard durur.
 */
@Component
final class TenantAccess {

    private final String tenantClaimName;

    TenantAccess(AppProperties props) {
        String name = props.security().tenantClaimName();
        this.tenantClaimName = (name == null || name.isBlank()) ? "tenant" : name;
    }

    TenantId tenant(Authentication auth) {
        String tenant = jwt(auth).getClaimAsString(tenantClaimName);
        if (tenant == null || tenant.isBlank()) {
            throw new IllegalStateException("tenant claim yok — SecurityConfig kapısı delinmiş olamaz");
        }
        return new TenantId(tenant);
    }

    ActorId actor(Authentication auth) {
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
