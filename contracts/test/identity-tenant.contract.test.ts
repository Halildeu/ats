import { describe, expect, it } from "vitest";
import type { TenantId } from "../src/types.js";
import { InMemoryIdentityTenant } from "../stubs/identity-tenant.stub.js";

describe("IdentityTenant contract", () => {
  const id = new InMemoryIdentityTenant();

  it("geçerli token tenant bağlamı çözer", () => {
    const r = id.resolveTenant("valid:t1:a1");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.tenantId).toBe("t1");
      expect(r.value.actorId).toBe("a1");
    }
  });

  it("boş token UNAUTHENTICATED (fail-closed)", () => {
    const r = id.resolveTenant("");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("UNAUTHENTICATED");
  });

  it("bilinmeyen token DENIED — default tenant ÜRETMEZ", () => {
    const r = id.resolveTenant("garbage-token");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("DENIED");
  });

  it("aynı tenant kapsamı ok; çapraz tenant TENANT_SCOPE_VIOLATION (default-deny)", () => {
    const ctx = { tenantId: "t1" as TenantId, actorId: "a1" as never };
    expect(id.assertTenantScope(ctx, "t1" as TenantId).ok).toBe(true);
    const cross = id.assertTenantScope(ctx, "t2" as TenantId);
    expect(cross.ok).toBe(false);
    if (!cross.ok) expect(cross.code).toBe("TENANT_SCOPE_VIOLATION");
  });
});
