package com.ats.contracts;

import com.ats.contracts.IdentityTenant.TenantContext;
import com.ats.kernel.Ids.InterviewId;
import com.ats.kernel.Ids.PacketId;
import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;

/**
 * ATS-0001 #4 ATSConnector (TS mirror) — export taban + narrow write-back.
 * YASAK yüzey: candidate create/update, job workflow, reject/advance,
 * score write-back (ADR-0005 + scope-freeze) — bu interface'te yok.
 */
public interface ATSConnector {

    record EvidencePacketRef(PacketId packetId, TenantId tenantId, InterviewId interviewId) {}

    enum ExportTarget { PDF, SECURE_LINK, EMAIL, WEBHOOK }

    record ExportResult(ExportTarget target, String artifactRef) {}

    /** Narrow hedef — yalnız dossier link/status/attachment metadata. */
    record WriteBackTarget(String atsName, String externalRef) {}

    /** Gate'te stub UNSUPPORTED_IN_GATE (gerçek render P1). */
    Outcome<ExportResult> exportPacket(TenantContext ctx, EvidencePacketRef packet, ExportTarget target);

    /** 3-koşul yoksa NOT_CONFIGURED (default). Dar dossier write-back; karar yazımı YASAK. */
    Outcome<Void> writeBack(TenantContext ctx, EvidencePacketRef packet, WriteBackTarget target);
}
