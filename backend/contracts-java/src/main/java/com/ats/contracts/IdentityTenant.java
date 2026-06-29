package com.ats.contracts;

import com.ats.kernel.Ids.ActorId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;

/**
 * ATS-0001 #1 IdentityTenant (TS mirror). Fail-closed: bilinmeyen token için
 * default tenant ÜRETİLMEZ; tenant kapsamı default-deny (ATS-0002).
 */
public interface IdentityTenant {

    record TenantContext(TenantId tenantId, ActorId actorId) {}

    /** Geçersiz/eksik token → fail-closed (UNAUTHENTICATED/DENIED); default tenant yok. */
    Outcome<TenantContext> resolveTenant(String token);

    /** Kaynak tenant'ı bağlamla eşleşmezse TENANT_SCOPE_VIOLATION (default-deny). */
    Outcome<Void> assertTenantScope(TenantContext ctx, TenantId resourceTenantId);
}
