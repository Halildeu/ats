/**
 * IdentityTenant in-memory reference stub — yalnız sözleşme uyumluluğunu
 * kanıtlar (conformance), ürün davranışı DEĞİL. Fail-closed + default-deny.
 *
 * Fixture token formatı: "valid:<tenantId>:<actorId>". Başka her şey reddedilir.
 */
import type { ActorId, Outcome, TenantId } from "../src/types.js";
import { fail, ok } from "../src/types.js";
import type { IdentityTenant, TenantContext } from "../src/identity-tenant.js";

export class InMemoryIdentityTenant implements IdentityTenant {
  resolveTenant(token: string): Outcome<TenantContext> {
    if (!token) {
      return fail("UNAUTHENTICATED", "token yok");
    }
    const parts = token.split(":");
    if (parts.length !== 3 || parts[0] !== "valid" || !parts[1] || !parts[2]) {
      // Bilinmeyen token → default tenant ÜRETME; fail-closed.
      return fail("DENIED", "token tanınmadı; default tenant üretilmez");
    }
    return ok({
      tenantId: parts[1] as TenantId,
      actorId: parts[2] as ActorId,
    });
  }

  assertTenantScope(ctx: TenantContext, resourceTenantId: TenantId): Outcome<void> {
    if (ctx.tenantId !== resourceTenantId) {
      return fail("TENANT_SCOPE_VIOLATION", "kaynak başka tenant'a ait (default-deny)");
    }
    return ok(undefined);
  }
}
