/**
 * ATS-0001 contract #4 — ATSConnector.
 *
 * Export = her zaman taban (PDF / secure-link / email / webhook + kimlik
 * eşleşmesi). Narrow write-back yalnız 3-koşulda (ATS adı belli + API doğrulanmış
 * + LOI) ve yalnız DAR alana (evidence dossier link / status / attachment
 * metadata) kilitlidir; default NotConfigured (master-plan §M2 + write-back kuralı).
 *
 * YASAK yüzey: candidate create/update, job workflow, reject/advance,
 * score write-back (ADR-0005 + scope-freeze).
 */
import type { InterviewId, Outcome, PacketId, TenantId } from "./types.js";
import type { TenantContext } from "./identity-tenant.js";

export interface EvidencePacketRef {
  readonly packetId: PacketId;
  readonly tenantId: TenantId;
  readonly interviewId: InterviewId;
}

export type ExportTarget = "PDF" | "SECURE_LINK" | "EMAIL" | "WEBHOOK";

export interface ExportResult {
  readonly target: ExportTarget;
  /** Üretilen artefakta dayanıksız referans (ör. secure link id). */
  readonly artifactRef: string;
}

/** Narrow write-back hedefi — yalnız dossier link/status/attachment metadata. */
export interface WriteBackTarget {
  readonly atsName: string;
  readonly externalRef: string;
}

export interface ATSConnector {
  /**
   * Evidence packet'ı dışa aktarır. Gate'te stub UNSUPPORTED_IN_GATE döner
   * (gerçek PDF/render P1 fonksiyonel — G0=GO'ya kilitli).
   */
  exportPacket(
    ctx: TenantContext,
    packet: EvidencePacketRef,
    target: ExportTarget,
  ): Outcome<ExportResult>;

  /**
   * 3-koşul karşılanmadıkça NOT_CONFIGURED (default). Yalnız dar dossier
   * metadata write-back; candidate/job/karar yazımı YASAK.
   */
  writeBack(
    ctx: TenantContext,
    packet: EvidencePacketRef,
    target: WriteBackTarget,
  ): Outcome<void>;
}
