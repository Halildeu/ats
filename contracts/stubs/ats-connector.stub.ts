/**
 * ATSConnector reference stub — gate'te fail-closed (Codex guardrail #1).
 * Gerçek export render / ATS write-back ÜRETMEZ. exportPacket
 * UNSUPPORTED_IN_GATE; writeBack NOT_CONFIGURED (default, 3-koşul yok).
 */
import type { Outcome } from "../src/types.js";
import { fail } from "../src/types.js";
import type {
  ATSConnector,
  EvidencePacketRef,
  ExportResult,
  ExportTarget,
  WriteBackTarget,
} from "../src/ats-connector.js";
import type { TenantContext } from "../src/identity-tenant.js";

export class GateStubATSConnector implements ATSConnector {
  exportPacket(
    _ctx: TenantContext,
    _packet: EvidencePacketRef,
    _target: ExportTarget,
  ): Outcome<ExportResult> {
    return fail("UNSUPPORTED_IN_GATE", "evidence packet export P1 fonksiyonel — G0=GO'ya kilitli");
  }

  writeBack(
    _ctx: TenantContext,
    _packet: EvidencePacketRef,
    _target: WriteBackTarget,
  ): Outcome<void> {
    return fail("NOT_CONFIGURED", "narrow write-back 3-koşul (ATS+API+LOI) karşılanmadı");
  }
}
