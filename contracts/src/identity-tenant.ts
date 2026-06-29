/**
 * ATS-0001 contract #1 — IdentityTenant.
 *
 * Platform Keycloak identity/tenant deseninin stable-interface reuse'u
 * (ürün boundary AYRI). Fail-closed: bilinmeyen/eksik token için default
 * tenant ÜRETİLMEZ; tenant kapsamı default-deny'dir (ADR-0002).
 */
import type { ActorId, Outcome, TenantId } from "./types.js";

export interface TenantContext {
  readonly tenantId: TenantId;
  readonly actorId: ActorId;
}

export interface IdentityTenant {
  /**
   * Token'dan tenant bağlamını çözer. Geçersiz/eksik token → fail-closed
   * (UNAUTHENTICATED / DENIED); asla default tenant üretmez.
   */
  resolveTenant(token: string): Outcome<TenantContext>;

  /**
   * Bir kaynağın tenant'ı, çağıran bağlamının tenant'ıyla eşleşmiyorsa
   * TENANT_SCOPE_VIOLATION döner (default-deny). Eşleşiyorsa ok(void).
   */
  assertTenantScope(ctx: TenantContext, resourceTenantId: TenantId): Outcome<void>;
}
