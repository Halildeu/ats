/**
 * ATS-0001 — shared contract primitives.
 *
 * GATE-SAFE (Faz 25 G0-locked): bu dosya yalnız stable-interface tipleri içerir;
 * P1 fonksiyonel davranışı YOK. Tüm tipler JSON-uyumludur (Date / Map / class
 * instance / callback / framework tipi YASAK) — ileride Java/Python binding
 * üretilebilir kalsın (Codex cross-AI guardrail #3).
 */

/**
 * JSON-uyumlu değer tipleri (Codex guardrail #3). Contract DTO payload'ları
 * yalnız bunlardan oluşur → Date/Map/class/function tip seviyesinde imkânsız;
 * ileride Java/Python binding üretilebilir kalır.
 */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
export interface JsonObject {
  readonly [key: string]: JsonValue;
}
export type JsonArray = readonly JsonValue[];

/** Branded string id'ler — runtime'da düz string kalır (JSON-uyumlu). */
export type Brand<T, B extends string> = T & { readonly __brand: B };

export type TenantId = Brand<string, "TenantId">;
export type ActorId = Brand<string, "ActorId">;
export type InterviewId = Brand<string, "InterviewId">;
export type EvidenceId = Brand<string, "EvidenceId">;
export type CitationId = Brand<string, "CitationId">;
export type PacketId = Brand<string, "PacketId">;

/**
 * Fail-closed sonuç tipi. Başarısızlık her zaman açık reason + code taşır;
 * boolean true/false ile sessiz default YOK (ADR-0002 default-deny).
 */
export type OutcomeCode =
  | "OK"
  | "DENIED"
  | "UNAUTHENTICATED"
  | "TENANT_SCOPE_VIOLATION"
  | "INVALID"
  | "NOT_FOUND"
  | "NOT_CONFIGURED"
  | "UNSUPPORTED_IN_GATE";

export type Outcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: Exclude<OutcomeCode, "OK">; readonly reason: string };

export function ok<T>(value: T): Outcome<T> {
  return { ok: true, value };
}

export function fail<T>(code: Exclude<OutcomeCode, "OK">, reason: string): Outcome<T> {
  return { ok: false, code, reason };
}
